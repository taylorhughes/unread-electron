import { app, BrowserWindow, session } from "electron";
import pie from "puppeteer-in-electron";
import puppeteer, { Page, Protocol } from "puppeteer-core";

import SlackPageDataModel from "./SlackPageDataModel.server";
import {
    processUnreadChannels,
    processUnreadIMs,
    processUnreadThreads,
    UnreadStream,
} from "./processedResponses.server";
import { summarizeThread } from "../openai/openai.server";
import {
    ClientBootResponse,
    ClientCountsResponse,
} from "./rawResponses.server";

async function waitFor(
    cb: () => boolean,
    timeout: number,
    description: string,
) {
    let i = 0;
    while (i < timeout && !cb()) {
        console.log(`Waiting for ${description}...`);
        i += 1;
        await new Promise((r) => setTimeout(r, 1000));
    }
}

export type SummarizedUnreadStream = UnreadStream & {
    promptParts?: string[];
    summary?: string;
};

export type SlackUnreadsResponse = {
    loading: boolean;
    validSession?: boolean;
    self?: {
        id: string;
        name: string;
    };
    streams?: Array<SummarizedUnreadStream>;
};

type SummarizingUser = { id: string; name: string; tempId: string };

function summarizeStream(
    stream: SummarizedUnreadStream,
    userIdsMap: Map<string, SummarizingUser>,
    onDone: (success: boolean) => void,
) {
    const prompt = "Given the following chat history:";
    const promptEnd = `
        Generate a summary of the conversation,
        including main points and who made them.
        Do not modify the user names.
        Summarize into 1 concise sentence:
    `
        .replace(/\s+/gm, " ")
        .trim();

    const text = stream.messages
        .map((m) => {
            const userTempId = userIdsMap.get(m.fromId)?.tempId;
            let simpleText = m.text.replace(/\s+/gm, " ").trim();
            for (const user of userIdsMap.values()) {
                // Replace @mentions inside the text with USER_1111
                simpleText = simpleText.replace(
                    new RegExp(`<@${user.id}>`, "g"),
                    `@${user.tempId}`,
                );
            }
            return `${userTempId}: ${simpleText}`;
        })
        .join("\n");

    stream.promptParts = [prompt, text, promptEnd];

    summarizeThread(stream.promptParts)
        .then((result) => {
            if (result.error) {
                stream.summary = `(${result.error})`;
                onDone(false);
                return;
            }

            let summary = result?.text;
            summary = summary?.replace(/[*]{2,}/g, "*");
            stream.messages.forEach((m) => {
                for (const user of userIdsMap.values()) {
                    const tempIdPart = user.tempId.replace(
                        "U_",
                        "(U(ser)?(_| |s_|s |))?",
                    );
                    summary = summary?.replace(
                        new RegExp(`\\b${tempIdPart}\\b`, "gi"),
                        `**${user.name}**`,
                    );
                }
            });

            if (result?.ellipsis) {
                const parts = (summary ?? "").trim().split(/\s+/);
                parts.pop(); // sometimes it splits a token at the end
                stream.summary = parts.join(" ") + "...";
            } else {
                stream.summary = summary;
            }

            onDone(true);
        })
        .catch((err) => {
            console.error(err);
            onDone(false);
        });
}

export default class SlackUnreadsLoader {
    private slug: string;
    private cookies: Protocol.Network.CookieParam[];

    constructor(slug: string, cookies: Protocol.Network.CookieParam[]) {
        this.slug = slug;
        this.cookies = cookies;
        this.pageData = this.newPageData(true);
    }

    private pageData: SlackPageDataModel;
    private newPageData(resetResponses = false) {
        return new SlackPageDataModel({
            slug: this.slug,
            recordResponses: !app.isPackaged,
            resetResponses,
        });
    }

    private window: BrowserWindow | undefined;
    private page: Page | undefined;
    private boot: ClientBootResponse | undefined;

    async getPage() {
        if (!this.page) {
            const browser = await pie.connect(app, puppeteer as any);
            if (!this.window) {
                const random = Math.random().toString(36).substring(2);
                const slackSession = session.fromPartition(`slack:${random}`);

                this.window = new BrowserWindow({
                    transparent: true,
                    frame: false,
                    show: false,
                    webPreferences: { session: slackSession },
                });
            }
            const page = await pie.getPage(browser, this.window);
            this.page = page;

            await page.setCookie(...this.cookies);
            await page.setRequestInterception(true);

            page.on("request", (request) => {
                request.continue();
            });

            page.on("requestfinished", async (request) => {
                const response = await request.response();
                if (response) {
                    this.pageData.addResponseData(request, response);
                }
            });

            await page.goto(`https://${this.slug}.slack.com/unreads`);

            const currentUrl = page.url();
            // Should redirect and load the boot response if we are logged in.
            if (currentUrl.indexOf("https://app.slack.com/client/") == 0) {
                await waitFor(
                    () => !!this.pageData.bootResponse,
                    10,
                    "boot response",
                );
                this.boot = this.pageData.bootResponse;
            } else {
                console.error("Not logged in", currentUrl);
                this.boot = undefined;
            }
        }

        return [this.page, this.boot] as const;
    }

    async getCookies() {
        const [page] = await this.getPage();
        return page.cookies();
    }

    async destory() {
        if (this.window) {
            this.window.destroy();
            this.window = undefined;
        }
        this.page = undefined;
        this.boot = undefined;
    }

    private async refreshCounts(): Promise<ClientCountsResponse | undefined> {
        const [page] = await this.getPage();

        this.pageData.countsResponse = undefined;

        const countsRequest = this.pageData.createAPIFetch("client.counts", {
            thread_counts_by_channel: true,
            org_wide_aware: true,
            include_file_channels: true,
            _x_reason: "client-counts-api/fetchClientCounts",
            _x_mode: "online",
            _x_sonic: true,
        });

        if (countsRequest) {
            await page.evaluate(countsRequest);
        } else {
            console.error("Could not create countsRequest!");
        }

        await waitFor(
            () => !!this.pageData.countsResponse,
            10,
            "counts response",
        );

        return this.pageData.countsResponse;
    }

    private channelUsersAlreadyFetched = new Set<string>();

    private async loadChannelUsers(counts: ClientCountsResponse) {
        let channelsToFetchUsers = new Array<string>();
        counts.channels.forEach((channel) => {
            if (channel.has_unreads) {
                channelsToFetchUsers.push(channel.id);
            }
        });
        Object.keys(counts.threads.unread_count_by_channel).forEach(
            (channelId) => {
                channelsToFetchUsers.push(channelId);
            },
        );

        channelsToFetchUsers = channelsToFetchUsers.filter(
            (channelId) => !this.channelUsersAlreadyFetched.has(channelId),
        );
        channelsToFetchUsers.forEach((channelId) => {
            this.channelUsersAlreadyFetched.add(channelId);
        });

        if (channelsToFetchUsers.length) {
            const usersListRequest = this.pageData.createEdgeFetch(
                "users/list",
                {
                    channels: channelsToFetchUsers,
                    present_first: true,
                    filter: "everyone AND NOT bots AND NOT apps",
                    count: 30,
                },
            );

            const numBefore = this.pageData.usersListResponses.size;

            const [page] = await this.getPage();
            if (usersListRequest) {
                await page.evaluate(usersListRequest);
            } else {
                console.error("Could not find users list request!");
            }

            await waitFor(
                () => this.pageData.usersListResponses.size > numBefore,
                10,
                "users list response",
            );
        }
    }

    private individualUsersAlreadyFetched = new Set<string>();

    async loadIMUsers(boot: ClientBootResponse, counts: ClientCountsResponse) {
        let usersToFetch = new Set<string>();
        counts.ims.forEach((im) => {
            if (im.has_unreads) {
                const userId = boot.ims.find(
                    (bootIM) => im.id == bootIM.id,
                )?.user;
                if (userId) {
                    usersToFetch.add(userId);
                }
            }
        });
        counts.mpims.forEach((mpim) => {
            if (mpim.has_unreads) {
                const members = boot.channels.find(
                    (bootChannel) => mpim.id == bootChannel.id,
                )?.members;
                members?.forEach((userId) => usersToFetch.add(userId));
            }
        });

        this.individualUsersAlreadyFetched.forEach((userId) => {
            usersToFetch.delete(userId);
        });
        usersToFetch.forEach((userId) => {
            this.individualUsersAlreadyFetched.add(userId);
        });

        if (usersToFetch.size) {
            const usersInfoRequest = this.pageData.createEdgeFetch(
                "users/info",
                {
                    check_interaction: true,
                    include_profile_only_users: true,
                    updated_ids: Array.from(usersToFetch),
                },
            );

            const beforeSize = this.pageData.usersListResponses.size;

            const [page] = await this.getPage();
            if (usersInfoRequest) {
                await page.evaluate(usersInfoRequest);
            } else {
                console.error("Could not find users info request!");
            }

            await waitFor(
                () => this.pageData.usersListResponses.size > beforeSize,
                10,
                "user info responses",
            );
        }
    }

    async loadThreads() {
        this.pageData.threadsResponse = undefined;

        const threadsRequest = this.pageData.createAPIFetch(
            "subscriptions.thread.getView",
            {
                limit: "8",
                org_wide_aware: "true",
                _x_reason: "fetch-threads-view-via-refresh",
                _x_mode: "online",
                _x_sonic: "true",
            },
        );

        const [page] = await this.getPage();
        if (threadsRequest) {
            await page.evaluate(threadsRequest);
        } else {
            console.error("Could not create threads request");
        }

        await waitFor(
            () => !!this.pageData.threadsResponse,
            20,
            "threads responses",
        );
    }

    async loadChannels(counts: ClientCountsResponse) {
        const unreadChannels = counts.channels.filter((c) => c.has_unreads);
        const requests = unreadChannels.map((channel) => {
            this.pageData.conversationsHistory.delete(channel.id);

            return this.pageData.createAPIFetch("conversations.history", {
                channel: channel.id,
                limit: "28",
                ignore_replies: true,
                include_pin_count: true,
                inclusive: true,
                no_user_profile: true,
                include_stories: true,
                oldest: channel.last_read,
                _x_reason: "unreads-view/fetchPost",
                _x_mode: "online",
                _x_sonic: true,
            });
        });

        const [page] = await this.getPage();
        for (const request of requests) {
            if (request) {
                await page.evaluate(request);
            }
        }

        await waitFor(
            () =>
                this.pageData.conversationsHistory.size >=
                unreadChannels.length,
            10,
            "channel history responses",
        );
    }

    async loadUnreads(
        onProgress: (unreads: SlackUnreadsResponse) => void,
    ): Promise<void> {
        onProgress({ loading: true });

        const [_, boot] = await this.getPage();
        if (!boot) {
            onProgress({ validSession: false, loading: false });
            return;
        }

        const self = {
            id: boot.self.id,
            name: boot.self.name,
        };
        onProgress({ validSession: true, loading: true, self });

        const counts = await this.refreshCounts();
        if (!counts) {
            console.error("Could not refresh counts");
            onProgress({ validSession: false, loading: false });
            return;
        }

        await this.loadChannels(counts);
        await this.loadChannelUsers(counts);
        await this.loadIMUsers(boot, counts);
        await this.loadThreads();

        let streams: SummarizedUnreadStream[] = processUnreadChannels(
            counts.channels.concat(counts.mpims),
            boot,
            this.pageData.usersListResponses,
            this.pageData.conversationsHistory,
        )
            .concat(
                processUnreadIMs(
                    counts.ims,
                    boot,
                    this.pageData.usersListResponses,
                    this.pageData.conversationsHistory,
                ),
            )
            .concat(
                this.pageData.threadsResponse
                    ? processUnreadThreads(
                          this.pageData.threadsResponse,
                          boot,
                          this.pageData.usersListResponses,
                      )
                    : [],
            )
            .sort((a, b) => b.latestTimestamp - a.latestTimestamp);

        const loadedResult = {
            validSession: true,
            loading: streams.length > 0,
            streams,
            self,
        };
        onProgress(loadedResult);

        let latestId = 1;
        let userIdsToIDs = new Map<string, SummarizingUser>();
        Array.from(this.pageData.usersListResponses.values())
            .concat([boot.self])
            .forEach((user) => {
                latestId += 1;
                userIdsToIDs.set(user.id, {
                    id: user.id,
                    name: user.name,
                    tempId: `U_${latestId}${latestId}${latestId}${latestId}`,
                });
            });

        let remaining = streams.length;
        streams.forEach((stream) => {
            summarizeStream(stream, userIdsToIDs, () =>
                onProgress({ ...loadedResult, loading: --remaining > 0 }),
            );
        });
    }
}
