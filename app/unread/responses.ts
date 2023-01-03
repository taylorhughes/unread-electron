// client.boot
export type ChannelBootInfo = {
    id: string;
    name: string;

    is_channel: boolean;
    is_group: boolean;
    is_mpim: boolean;
    is_im: boolean;
    is_private: boolean;
};
export type ClientBootResponse = {
    self: {
        id: string;
        team_id: string;
        name: string;
        real_name: string;
    };

    prefs: {
        muted_channels: string; // comma separated list of channel ids
    };

    channels: Array<ChannelBootInfo>;

    ims: Array<{
        id: string; // channel id
        user: string; // other user id
    }>;

    last_read: {
        [channel_id: string]: string; // float as string
    };
};

// conversations.view
export type ConversationsViewResponse = {
    users: Array<{
        id: string;
        name: string;
        real_name: string;
    }>;
};

// users/list
export type UsersListResponseItem = {
    id: string;
    team_id: string;
    name: string;
    real_name: string;
};
export type UsersListResponse = {
    results: Array<UsersListResponseItem>;
};

// client.counts
export type ClientCountChannelish = {
    id: string;
    has_unreads: boolean;
    mention_count: number;
    last_read: string; // float
};
export type ClientCountsResponse = {
    threads: {
        unread_count_by_channel: {
            [channel_id: string]: number;
        };
    };

    channels: Array<ClientCountChannelish>;

    mpims: Array<ClientCountChannelish>;

    ims: Array<ClientCountChannelish>;
};

type AttachmentLike = {
    fallback: string;
    text: string;
    author_name?: string;
    author_subname?: string;
    original_url: string;
    service_name: string; // "twitter"
};
type ReactionLike = {
    name: string;
    users: Array<string>;
    count: number;
};
type FileLike = {
    id: string;
    created: number;
    name: string;
    title: string;
};
export type MessageLike = {
    type: string; // "message"
    text: string;
    user: string;
    ts: string; // float
    reactions?: Array<ReactionLike>;
    attachments?: Array<AttachmentLike>;
    files?: Array<FileLike>;
};
export type SubscriptionsThreadGetViewResponse = {
    threads: Array<{
        root_msg: MessageLike & {
            channel: string;
            reply_count: number;
            reply_users_count: number;
            reply_users: Array<string>;
        };
        unread_replies?: Array<MessageLike>;
        latest_replies?: Array<MessageLike>;
    }>;
};

export type ConversationsHistoryResponse = {
    latest: string; // float
    oldest: string; // float
    messages: Array<MessageLike>;
};
