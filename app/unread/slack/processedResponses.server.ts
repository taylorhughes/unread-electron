import {
    MessageLike,
    SubscriptionsThreadGetViewResponse,
    ClientBootResponse,
    EdgeUserResponseItem,
    ClientCountChannelish,
    ConversationsHistoryResponse,
    ChannelBootInfo,
} from "./rawResponses.server";

export type Message = {
    fromName: string;
    text: string;
    ts: number;
    unread: boolean;
};

export type UnreadIM = {
    id: string;
    fromName: string;
    badge: string;
    lastRead: number;
    messages: Array<Message>;
};

export type UnreadChannel = {
    channelName: string;
    badge: string;
    lastRead: number;
    messages: Array<Message>;
};

export type UnreadThread = {
    channelName: string;
    badge: string;
    rootMessage: Message;
    messages: Array<Message>;
};

// Utility functions

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

// Raw response processing

export function processUnreadThreads(
    threadsResponse: SubscriptionsThreadGetViewResponse,
    boot: ClientBootResponse,
    userLists: { [userId: string]: EdgeUserResponseItem | undefined },
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

export function processUnreadChannels(
    channelsFromCount: Array<ClientCountChannelish>,
    boot: ClientBootResponse,
    userLists: { [userId: string]: EdgeUserResponseItem | undefined },
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

export function processUnreadIMs(
    ims: Array<ClientCountChannelish>,
    boot: ClientBootResponse,
    userLists: { [userId: string]: EdgeUserResponseItem | undefined },
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
