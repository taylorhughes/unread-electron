import { useState } from "react";
import { useInterval } from "react-use";
import { Link, useLoaderData } from "@remix-run/react";
import { json, redirect } from "@remix-run/node";

import {
    UnreadChannel,
    UnreadIM,
    UnreadThread,
} from "~/unread/slack/processedResponses.server";
import {
    sessionNeedsLogin,
    SlackUnreadsResponse,
    startLoading,
} from "~/unread/slack/index.server";

export function loader({ params: { slug } }: { params: { slug: string } }) {
    startLoading(slug);
    if (sessionNeedsLogin(slug)) {
        return redirect(`/login/${slug}`);
    }
    return json({
        slug: slug,
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
    const { slug } = useLoaderData<{
        slug: string;
    }>();

    const [unreads, setUnreads] = useState<SlackUnreadsResponse | null>(null);

    useInterval(
        () => {
            fetch("/api/unread/" + slug)
                .then((response) => response.json())
                .then((unreads: SlackUnreadsResponse) => {
                    setUnreads(unreads);
                });
        },
        unreads?.loading !== false ? 1000 : null,
    );

    return (
        <main>
            <nav>
                <Link to="/">← Home</Link>
            </nav>
            <h1>Unreads for {slug}</h1>
            {unreads?.validSession === false ? (
                <div>
                    Session expired, please{" "}
                    <Link to={`/login/${slug}`}>log in again</Link>.
                </div>
            ) : (
                <>
                    {unreads?.loading ? "Loading..." : null}
                    {(unreads?.threads ?? []).map((thread) => (
                        <Thread thread={thread} key={thread.rootMessage.ts} />
                    ))}
                    {(unreads?.channels ?? []).map((channel) => (
                        <Channel channel={channel} key={channel.channelName} />
                    ))}
                    {(unreads?.ims ?? [])?.map((im) => (
                        <IM im={im} key={im.fromName} />
                    ))}
                </>
            )}
        </main>
    );
}
