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
import RoundedSection from "~/components/RoundedSection";
import Loading from "~/components/Loading";

export function loader({ params: { slug } }: { params: { slug: string } }) {
    startLoading(slug);
    if (sessionNeedsLogin(slug)) {
        return redirect(`/login/${slug}`);
    }
    return json({
        slug: slug,
    });
}

function SummaryText({ text }: { text: string | undefined }) {
    if (text === undefined) {
        return <Loading text="summarizing..." />;
    }

    const formattedText = text
        .split(/\*\*/g)
        .map((part, index) =>
            index % 2 === 0 ? part : <strong>{part}</strong>,
        );
    return <span className="summary-text">{formattedText}</span>;
}

export function StreamContent({ stream }: { stream: SummarizedUnreadStream }) {
    const contentId = "stream-content-" + stream.latestTimestamp;

    return (
        <RoundedSection key={stream.latestTimestamp}>
            <h2 style={{ fontSize: "1em" }}>{stream.name}</h2>

            <div style={{ margin: "10px 0", lineHeight: "1.4em" }}>
                <SummaryText text={stream.summary} />
            </div>

            <div style={{ marginTop: "5px" }}>
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
                    raw text
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
        </RoundedSection>
    );
}

function AccountInfo({ unreads }: { unreads: SlackUnreadsResponse | null }) {
    if (!unreads?.self?.name) {
        return null;
    }

    return <span>Logged in as {unreads.self.name}</span>;
}

function UnreadContent({ unreads }: { unreads: SlackUnreadsResponse | null }) {
    if (!unreads?.streams) {
        return (
            <RoundedSection>
                <Loading text="Loading conversations..." />
            </RoundedSection>
        );
    }

    if (unreads.streams.length === 0) {
        return <RoundedSection>No unread messages</RoundedSection>;
    }

    return (
        <>
            {unreads.streams.map((stream) => (
                <StreamContent stream={stream} key={stream.latestTimestamp} />
            ))}
        </>
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
            <RoundedSection>
                <nav>
                    <Link to="/">← Home</Link>
                    {unreads?.self ? (
                        <>
                            <span> • </span>
                            <AccountInfo unreads={unreads} />
                        </>
                    ) : null}
                </nav>
                <h1>Unreads for {slug}</h1>
            </RoundedSection>
            {unreads?.validSession === false ? (
                <RoundedSection>
                    Session expired, please{" "}
                    <Link to={`/login/${slug}`}>log in again</Link>.
                </RoundedSection>
            ) : (
                <UnreadContent unreads={unreads} />
            )}
        </main>
    );
}
