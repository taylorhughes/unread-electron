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
