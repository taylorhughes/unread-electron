import { useLoaderData } from "@remix-run/react";
import { json, MetaFunction } from "@remix-run/node";
import { UnreadChannel, UnreadIM, UnreadThread } from "../unread/types";
import { loadUnreads } from "../unread/UnreadsLoader.server";

export const meta: MetaFunction = () => {
    return {
        refresh: {
            httpEquiv: "refresh",
            content: "1",
        },
    };
};

let unreadsLoading = false;
let threads: UnreadThread[] | undefined;
let channels: UnreadChannel[] | undefined;
let ims: UnreadIM[] | undefined;

type LoaderResponse = {
    threads: UnreadThread[] | undefined;
    channels: UnreadChannel[] | undefined;
    ims: UnreadIM[] | undefined;
};

export function loader() {
    if (!unreadsLoading) {
        unreadsLoading = true;
        console.log("starting unreads loading...");
        loadUnreads()
            .then((theUnreads) => {
                console.log("unreads loaded");
                ({ threads, channels, ims } = theUnreads);
            })
            .catch((e) => console.error("Error loading unreads", e));
    }
    return json({
        threads,
        channels,
        ims,
    });
}

export function Thread({ thread }: { thread: UnreadThread }) {
    return (
        <div key={"thread-" + thread.rootMessage.ts}>
            <h2>
                {thread.channelName} ({thread.badge})
            </h2>
            <p>
                <strong>{thread.rootMessage.fromName}</strong>:{" "}
                {thread.rootMessage.text}
            </p>
            <hr />
            {thread.messages.map((message) => (
                <div key={message.ts}>
                    <p>
                        <strong>{message.fromName}</strong>: {message.text}
                    </p>
                </div>
            ))}
        </div>
    );
}

export function Channel({ channel }: { channel: UnreadChannel }) {
    return (
        <div key={"channel-" + channel.channelName}>
            <h2>
                {channel.channelName} ({channel.badge})
            </h2>
            {channel.messages.map((message) => (
                <div key={message.ts}>
                    <p>
                        <strong>{message.fromName}</strong>: {message.text}
                    </p>
                </div>
            ))}
        </div>
    );
}

export function IM({ im }: { im: UnreadIM }) {
    return (
        <div key={"im-" + im.fromName}>
            <h2>
                {im.fromName} ({im.badge})
            </h2>
            {im.messages.map((message) => (
                <div key={message.ts}>
                    <p>
                        <strong>{message.fromName}</strong>: {message.text}
                    </p>
                </div>
            ))}
        </div>
    );
}

export default function Index() {
    const { threads, channels, ims } = useLoaderData<LoaderResponse>();
    return (
        <main>
            <h1>Unread</h1>
            {threads?.map((thread) => (
                <Thread thread={thread} key={thread.rootMessage.ts} />
            ))}
            {channels?.map((channel) => (
                <Channel channel={channel} key={channel.channelName} />
            ))}
            {ims?.map((im) => (
                <IM im={im} key={im.fromName} />
            ))}
        </main>
    );
}
