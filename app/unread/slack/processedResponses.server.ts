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
    fromId: string;
    text: string;
    ts: number;
    unread: boolean;
};

export type UnreadStream = {
    name: string;
    badge: number;
    rootMessage?: Message;
    messages: Array<Message>;
    latestTimestamp: number;
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
        fromId: message.user,
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
    userLists: Map<string, EdgeUserResponseItem>,
) {
    const threads = new Array<UnreadStream>();
    threadsResponse.threads.forEach((thread) => {
        if (!thread.unread_replies) {
            return;
        }

        const channelInfo = boot.channels.find(
            (c) => c.id === thread.root_msg.channel,
        );
        const rootUser = userLists.get(thread.root_msg.user);
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
            const replyUser = userLists.get(reply.user);
            return getMessage(reply, replyUser?.name);
        });
        messages.sort((a, b) => a.ts - b.ts);

        threads.push({
            name: `[thread] in ${getNameForChannel(channelInfo)}`,
            badge: thread.unread_replies.length,
            rootMessage: getMessage(thread.root_msg, rootUser.name, false),
            messages,
            latestTimestamp: Math.max(...messages.map((m) => m.ts)),
        });
    });
    return threads;
}

export function processUnreadChannels(
    channelsFromCount: Array<ClientCountChannelish>,
    boot: ClientBootResponse,
    userLists: Map<string, EdgeUserResponseItem>,
    converationsHistory: Map<string, ConversationsHistoryResponse>,
) {
    const channels = new Array<UnreadStream>();
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
        const history = converationsHistory.get(channel.id);
        history?.messages.forEach((message) => {
            const userInfo = userLists.get(message.user);
            const ts = +message.ts;
            messages.push(getMessage(message, userInfo?.name, lastRead < ts));
        });
        messages.sort((a, b) => a.ts - b.ts);
        if (messages.length > 0) {
            channels.push({
                name: getNameForChannel(channelInfo),
                badge: channel.mention_count,
                messages,
                latestTimestamp: messages[messages.length - 1].ts,
            });
        }
    });
    return channels;
}

export function processUnreadIMs(
    ims: Array<ClientCountChannelish>,
    boot: ClientBootResponse,
    userLists: Map<string, EdgeUserResponseItem>,
    converationsHistory: Map<string, ConversationsHistoryResponse>,
) {
    const imsArray = new Array<UnreadStream>();
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

        const userInfo = userLists.get(userId);
        if (!userInfo) {
            console.error("Could not find user info for ID", userId);
            return;
        }

        const lastRead = +im.last_read;

        const messages = new Array<Message>();
        const history = converationsHistory.get(im.id);
        history?.messages.forEach((message) => {
            const userInfo = userLists.get(message.user);
            const ts = +message.ts;
            messages.push(getMessage(message, userInfo?.name, lastRead < ts));
        });
        messages.sort((a, b) => a.ts - b.ts);

        if (messages.length > 0) {
            imsArray.push({
                name: userInfo.name,
                badge: im.mention_count,
                messages,
                latestTimestamp: messages[messages.length - 1].ts,
            });
        }
    });
    return imsArray;
}
