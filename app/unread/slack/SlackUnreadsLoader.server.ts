import fs from "fs";

import puppeteer, { Protocol } from "puppeteer";

import SlackPageDataModel, {
    BASE_RESPONSES_DIR,
} from "./SlackPageDataModel.server";
import {
    processUnreadChannels,
    processUnreadIMs,
    processUnreadThreads,
    UnreadChannel,
    UnreadIM,
    UnreadThread,
} from "./processedResponses.server";

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

export type SlackUnreadsResponse = {
    loading: boolean;
    validSession?: boolean;
    channels?: Array<UnreadChannel>;
    ims?: Array<UnreadIM>;
    threads?: Array<UnreadThread>;
};

export async function loadUnreads(
    slug: string,
    cookies: Protocol.Network.CookieParam[],
    onProgress: (unreads: SlackUnreadsResponse) => void,
): Promise<void> {
    onProgress({ loading: true });

    try {
        fs.rmSync(BASE_RESPONSES_DIR, { recursive: true });
    } catch (e: any) {
        if (e.code !== "ENOENT") {
            throw e;
        }
    }

    const browser = await puppeteer.launch({
        headless: true,
        defaultViewport: {
            width: 1200 + Math.floor(Math.random() * 1024),
            height: 1600 + Math.floor(Math.random() * 1024),
        },
    });
    const [page] = await browser.pages();

    await page.setCookie(...cookies);
    await page.setRequestInterception(true);

    const pageData = new SlackPageDataModel();

    page.on("request", (request) => {
        request.continue();
    });

    page.on("requestfinished", async (request) => {
        const response = await request.response();
        if (response) {
            pageData.addResponseData(request, response);
        }
    });

    const initialResponse = await page.goto(
        `https://${slug}.slack.com/unreads`,
    );

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

    onProgress({ validSession: true, loading: true });

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
        () => Object.keys(pageData.usersListResponses).length > 1,
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

    await browser.close();

    onProgress({
        validSession: true,
        loading: false,
        threads: pageData.threadsResponse
            ? processUnreadThreads(
                  pageData.threadsResponse,
                  boot,
                  pageData.usersListResponses,
              )
            : [],
        channels: processUnreadChannels(
            counts.channels.concat(counts.mpims),
            boot,
            pageData.usersListResponses,
            pageData.conversationsHistory,
        ),
        ims: processUnreadIMs(
            counts.ims,
            boot,
            pageData.usersListResponses,
            pageData.conversationsHistory,
        ),
    });
}
