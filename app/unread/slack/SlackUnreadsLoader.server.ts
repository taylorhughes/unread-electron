import { app, BrowserWindow, session } from "electron";
import pie from "puppeteer-in-electron";
import { Protocol } from "puppeteer";
import puppeteer from "puppeteer-core";

import SlackPageDataModel from "./SlackPageDataModel.server";
import {
    processUnreadChannels,
    processUnreadIMs,
    processUnreadThreads,
    UnreadStream,
} from "./processedResponses.server";
import { summarizeThread } from "../openai/openai.server";

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
    promptText?: string;
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

export async function loadUnreads(
    slug: string,
    cookies: Protocol.Network.CookieParam[],
    onProgress: (unreads: SlackUnreadsResponse) => void,
): Promise<void> {
    onProgress({ loading: true });

    const browser = await pie.connect(app, puppeteer as any);

    const random = Math.random().toString(36).substring(2);
    const slackSession = session.fromPartition(`slack:${random}`);
    const window = new BrowserWindow({
        transparent: true,
        frame: false,
        show: false,
        webPreferences: { session: slackSession },
    });
    const page = await pie.getPage(browser, window);

    await page.setCookie(...cookies);
    await page.setRequestInterception(true);

    const pageData = new SlackPageDataModel({
        slug,
        recordResponses: process.env.NODE_ENV === "development",
    });

    page.on("request", (request) => {
        request.continue();
    });

    page.on("requestfinished", async (request) => {
        const response = await request.response();
        if (response) {
            pageData.addResponseData(request, response);
        }
    });

    await page.goto(`https://${slug}.slack.com/unreads`);

    const currentUrl = page.url();
    if (currentUrl.indexOf("https://app.slack.com/client/") != 0) {
        console.error("Not logged in", currentUrl);
        onProgress({ validSession: false, loading: false });
        return;
    }

    await waitFor(
        () => !!pageData.bootResponse && !!pageData.countsResponse,
        16,
        "boots & counts responses",
    );
    const boot = pageData.bootResponse;
    const counts = pageData.countsResponse;
    if (!boot || !counts) {
        console.error(
            "Could not find appropriate responses. Probably not logged in yet!",
        );
        onProgress({ validSession: false, loading: false });
        return;
    }

    const self = {
        id: boot.self.id,
        name: boot.self.name,
    };

    onProgress({ validSession: true, loading: true, self });

    let channelsToFetchUsers = new Array<string>();
    counts.channels.forEach((channel) => {
        if (channel.has_unreads) {
            channelsToFetchUsers.push(channel.id);
        }
    });
    Object.keys(counts.threads.unread_count_by_channel).forEach((channelId) => {
        channelsToFetchUsers.push(channelId);
    });

    const usersListRequest = pageData.createEdgeFetch("users/list", {
        channels: channelsToFetchUsers,
        present_first: true,
        filter: "everyone AND NOT bots AND NOT apps",
        count: 30,
    });
    if (usersListRequest) {
        await page.evaluate(usersListRequest);
    } else {
        console.error("Could not find users list request!");
    }

    let usersToFetch: { [userId: string]: 0 } = {};
    counts.ims.forEach((im) => {
        if (im.has_unreads) {
            const userId = boot.ims.find((bootIM) => im.id == bootIM.id)?.user;
            if (userId) {
                usersToFetch[userId] = 0;
            }
        }
    });
    counts.mpims.forEach((mpim) => {
        if (mpim.has_unreads) {
            const members = boot.channels.find(
                (bootChannel) => mpim.id == bootChannel.id,
            )?.members;
            members?.forEach((userId) => (usersToFetch[userId] = 0));
        }
    });

    if (usersToFetch.length) {
        const usersInfoRequest = pageData.createEdgeFetch("users/info", {
            check_interaction: true,
            include_profile_only_users: true,
            updated_ids: usersToFetch,
        });
        if (usersInfoRequest) {
            await page.evaluate(usersInfoRequest);
        } else {
            console.error("Could not find users info request!");
        }
    }

    await waitFor(
        () => pageData.usersListResponses.size > 1,
        20,
        "user list responses",
    );

    const threadsRequest = pageData.createAPIFetch(
        "subscriptions.thread.getView",
        {
            limit: "8",
            org_wide_aware: "true",
            _x_reason: "fetch-threads-view-via-refresh",
            _x_mode: "online",
            _x_sonic: "true",
        },
    );
    if (threadsRequest) {
        await page.evaluate(threadsRequest);
    } else {
        console.error("Could not create threads request");
    }

    await waitFor(() => !!pageData.threadsResponse, 20, "threads responses");

    let streams: SummarizedUnreadStream[] = processUnreadChannels(
        counts.channels.concat(counts.mpims),
        boot,
        pageData.usersListResponses,
        pageData.conversationsHistory,
    )
        .concat(
            processUnreadIMs(
                counts.ims,
                boot,
                pageData.usersListResponses,
                pageData.conversationsHistory,
            ),
        )
        .concat(
            pageData.threadsResponse
                ? processUnreadThreads(
                      pageData.threadsResponse,
                      boot,
                      pageData.usersListResponses,
                  )
                : [],
        )
        .sort((a, b) => b.latestTimestamp - a.latestTimestamp);

    await window.destroy();

    const loadedResult = {
        validSession: true,
        loading: streams.length > 0,
        streams,
        self,
    };
    onProgress(loadedResult);

    const prompt = "Given the following chat history:";
    const promptEnd = `
        Generate a summary of the conversation,
        including main points and who made them.
        Do not modify the user names.
        Summarize into 1 concise sentence:
    `
        .replace(/\s+/gm, " ")
        .trim();

    let latestId = 1;
    let userIdsToIDs = new Map<
        string,
        { id: string; name: string; tempId: string }
    >();
    Array.from(pageData.usersListResponses.values())
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
        const text = stream.messages
            .map((m) => {
                const userTempId = userIdsToIDs.get(m.fromId)?.tempId;
                let simpleText = m.text.replace(/\s+/gm, " ").trim();
                for (const user of userIdsToIDs.values()) {
                    // Replace @mentions inside the text with USER_1111
                    simpleText = simpleText.replace(
                        new RegExp(`<@${user.id}>`, "g"),
                        `@${user.tempId}`,
                    );
                }
                return `${userTempId}: ${simpleText}`;
            })
            .join("\n");

        stream.promptText = text;

        summarizeThread(prompt, promptEnd, text)
            .then((result) => {
                let summary = result.text;
                summary = summary?.replace(/[*]{2,}/g, "*");
                stream.messages.forEach((m) => {
                    for (const user of userIdsToIDs.values()) {
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
                if (result.ellipsis) {
                    const parts = (summary ?? "").trim().split(/\s+/);
                    parts.pop(); // sometimes it splits a token at the end
                    stream.summary = parts.join(" ") + "...";
                } else {
                    stream.summary = summary;
                }

                remaining -= 1;
                onProgress({
                    ...loadedResult,
                    loading: remaining > 0,
                });
            })
            .catch((err) => {
                console.error(err);
            });
    });
}
