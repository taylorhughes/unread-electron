import fs from "fs";
import puppeteer, { HTTPRequest } from "puppeteer";
import PageDataModel, { BASE_RESPONSES_DIR } from "./PageDataModel";
import {
    SubscriptionsThreadGetViewResponse,
    ClientBootResponse,
    UsersListResponseItem,
    ClientCountChannelish,
    ConversationsHistoryResponse,
    ChannelBootInfo,
    MessageLike,
} from "./responses";
import { Message, UnreadChannel, UnreadIM, UnreadThread } from "./types";

function getMessage(
    message: MessageLike,
    from: string | undefined | null,
    unread: boolean = true,
): Message {
    const textParts = [message.text]
        .concat((message.attachments ?? []).map((a) => a.fallback))
        .concat((message.files ?? []).map((f) => f.name));

    return {
        fromName: from ?? "unknown",
        ts: +message.ts,
        text: textParts.join("\n\n"),
        unread,
    };
}

function getUnreadThreads(
    threadsResponse: SubscriptionsThreadGetViewResponse,
    boot: ClientBootResponse,
    userLists: { [userId: string]: UsersListResponseItem | undefined },
) {
    const threads = new Array<UnreadThread>();
    threadsResponse.threads.forEach((thread) => {
        if (!thread.unread_replies) {
            return;
        }

        const channelInfo = boot.channels.find(
            (c) => c.id === thread.root_msg.channel,
        );
        const rootUser = userLists[thread.root_msg.user];
        if (!channelInfo || !rootUser) {
            console.error(
                "Could not find channel info or user for thread root message",
                thread.root_msg,
                !!channelInfo,
                !!rootUser,
            );
            return;
        }

        const messages = thread.unread_replies.map((reply) => {
            const replyUser = userLists[reply.user];
            return getMessage(reply, replyUser?.name);
        });
        messages.sort((a, b) => a.ts - b.ts);

        threads.push({
            channelName: getNameForChannel(channelInfo),
            badge:
                thread.unread_replies.length > 0
                    ? thread.unread_replies.length.toString()
                    : "•",
            rootMessage: getMessage(thread.root_msg, rootUser.name, false),
            messages,
        });
    });
    return threads;
}

function getUnreadChannels(
    channelsFromCount: Array<ClientCountChannelish>,
    boot: ClientBootResponse,
    userLists: { [userId: string]: UsersListResponseItem | undefined },
    converationsHistory: {
        [channelId: string]: ConversationsHistoryResponse | undefined;
    },
) {
    const channels = new Array<UnreadChannel>();
    channelsFromCount.forEach((channel) => {
        if (boot.prefs.muted_channels.includes(channel.id)) {
            return;
        }
        if (!channel.has_unreads) {
            return;
        }

        const channelInfo = boot.channels.find((c) => c.id === channel.id)!;
        if (!channelInfo) {
            console.error("Could not find channel info for ID", channel.id);
            return;
        }

        const lastRead = +channel.last_read;

        const messages = new Array<Message>();
        const history = converationsHistory[channel.id];
        history?.messages.forEach((message) => {
            const userInfo = userLists[message.user];
            const ts = +message.ts;
            messages.push(getMessage(message, userInfo?.name, lastRead < ts));
        });
        messages.sort((a, b) => a.ts - b.ts);

        channels.push({
            channelName: getNameForChannel(channelInfo),
            badge:
                channel.mention_count > 0
                    ? channel.mention_count.toString()
                    : "•",
            lastRead: +channel.last_read,
            messages,
        });
    });
    return channels;
}

function getUnreadIMs(
    ims: Array<ClientCountChannelish>,
    boot: ClientBootResponse,
    userLists: { [userId: string]: UsersListResponseItem | undefined },
    converationsHistory: {
        [channelId: string]: ConversationsHistoryResponse | undefined;
    },
) {
    const imsArray = new Array<UnreadIM>();
    ims.forEach((im) => {
        if (!im.has_unreads) {
            return;
        }

        // Find the user ID for this channelish ID.
        const userId = boot.ims.find((bootIM) => im.id == bootIM.id)?.user;
        if (!userId) {
            console.error("Could not find user ID for IM channel", im);
            return;
        }

        if (userId == "USLACKBOT") {
            return;
        }

        const userInfo = userLists[userId];
        if (!userInfo) {
            console.error("Could not find user info for ID", userId);
            return;
        }

        const lastRead = +im.last_read;

        const messages = new Array<Message>();
        const history = converationsHistory[im.id];
        history?.messages.forEach((message) => {
            const userInfo = userLists[message.user];
            const ts = +message.ts;
            messages.push(getMessage(message, userInfo?.name, lastRead < ts));
        });
        messages.sort((a, b) => a.ts - b.ts);

        imsArray.push({
            id: im.id,
            fromName: userInfo.name,
            badge: im.mention_count > 0 ? im.mention_count.toString() : "•",
            lastRead: +im.last_read,
            messages,
        });
    });
    return imsArray;
}

function getNameForChannel(channelInfo: ChannelBootInfo) {
    let name = channelInfo.name;
    if (channelInfo.is_mpim) {
        // mpdm-<user1>--<user2>--<user3>-1
        name = name.substring(5);
        return name
            .substring(0, name.length - 2)
            .split("--")
            .join(", ");
    } else {
        return `#${channelInfo.name}`;
    }
}

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

export async function loadUnreads() {
    try {
        fs.rmdirSync(BASE_RESPONSES_DIR, { recursive: true });
    } catch (e) {
        // probably ENOENT
    }

    const browser = await puppeteer.launch({
        headless: false,
        userDataDir: "./puppet-user-data",
        defaultViewport: {
            width: 1200 + Math.floor(Math.random() * 1024),
            height: 1600 + Math.floor(Math.random() * 1024),
        },
    });
    const [page] = await browser.pages();

    await page.setRequestInterception(true);

    const pageData = new PageDataModel();

    page.on("request", (request) => {
        request.continue();
    });

    page.on("requestfinished", async (request) => {
        const response = await request.response();
        if (response) {
            pageData.addResponseData(request, response);
        }
    });

    await page.goto("https://premint.slack.com/unreads");

    await waitFor(
        () => !!pageData.bootResponse && !!pageData.countsResponse,
        20,
        "boots & counts responses",
    );
    const boot = pageData.bootResponse;
    const counts = pageData.countsResponse;
    if (!boot || !counts) {
        console.error(
            "Could not find appropriate responses. Probably not logged in yet!",
        );
        return {};
    }

    let channelsToFetchUsers = new Array<string>();
    counts.channels.forEach((channel) => {
        if (channel.has_unreads) {
            channelsToFetchUsers.push(channel.id);
        }
    });
    counts.ims.forEach((im) => {
        if (im.has_unreads) {
            channelsToFetchUsers.push(im.id);
        }
    });
    counts.mpims.forEach((mpim) => {
        if (mpim.has_unreads) {
            channelsToFetchUsers.push(mpim.id);
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

    return {
        threads: pageData.threadsResponse
            ? getUnreadThreads(
                  pageData.threadsResponse,
                  boot,
                  pageData.usersListResponses,
              )
            : [],
        channels: getUnreadChannels(
            counts.channels.concat(counts.mpims),
            boot,
            pageData.usersListResponses,
            pageData.conversationsHistory,
        ),
        ims: getUnreadIMs(
            counts.ims,
            boot,
            pageData.usersListResponses,
            pageData.conversationsHistory,
        ),
    };
}
