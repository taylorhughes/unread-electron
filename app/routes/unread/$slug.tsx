import { useState } from "react";
import { useInterval } from "react-use";
import { Link, useLoaderData } from "@remix-run/react";
import { json, redirect } from "@remix-run/node";

import {
    sessionNeedsLogin,
    SlackUnreadsResponse,
    SummarizedUnreadStream,
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

export function StreamContent({ stream }: { stream: SummarizedUnreadStream }) {
    const contentId = "stream-content-" + stream.latestTimestamp;

    return (
        <div key={stream.latestTimestamp}>
            <h2>
                {stream.name} ({stream.badge === 0 ? "•" : stream.badge})
            </h2>

            <div>
                {stream.summary ?? "(loading...)"}{" "}
                <a
                    onClick={() => {
                        const content = document.getElementById(contentId);
                        if (content) {
                            content.style.display =
                                content.style.display == "block"
                                    ? "none"
                                    : "block";
                        }
                    }}
                >
                    (see raw text)
                </a>
            </div>

            <div style={{ display: "none" }} id={contentId}>
                {stream.rootMessage ? (
                    <>
                        {" "}
                        <p>
                            <strong>{stream.rootMessage.fromName}</strong>:{" "}
                            {stream.rootMessage.text}
                        </p>
                        <hr />
                    </>
                ) : null}
                {stream.messages.map((message) => (
                    <div key={message.ts}>
                        <p>
                            <strong>{message.fromName}</strong>: {message.text}
                        </p>
                    </div>
                ))}
            </div>
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
                    {unreads?.loading ?? true ? "Loading..." : null}
                    {(unreads?.streams ?? []).map((stream) => (
                        <StreamContent
                            stream={stream}
                            key={stream.latestTimestamp}
                        />
                    ))}
                </>
            )}
        </main>
    );
}
