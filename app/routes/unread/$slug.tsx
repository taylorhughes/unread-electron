import { useState } from "react";
import { useInterval } from "react-use";
import { Link, useLoaderData } from "@remix-run/react";
import {
    ActionArgs,
    json,
    LoaderArgs,
    MetaFunction,
    redirect,
} from "@remix-run/node";

import {
    sessionNeedsLogin,
    SlackUnreadsResponse,
    SummarizedUnreadStream,
    startLoading,
    clearLoadingState,
} from "~/unread/slack/index.server";
import RoundedSection from "~/components/RoundedSection";
import Loading from "~/components/Loading";
import { APP_NAME } from "~/unread/config";

export function loader({ params: { slug } }: LoaderArgs) {
    startLoading(slug!);
    if (sessionNeedsLogin(slug!)) {
        return redirect(`/login/${slug}`);
    }
    return json({
        slug: slug,
    });
}

export const meta: MetaFunction = ({ data }) => {
    return {
        title: `${APP_NAME}: ${data.slug}`,
    };
};

export const action = async ({ request, params: { slug } }: ActionArgs) => {
    const formData = await request.formData();
    if (formData.get("reload") == "1") {
        clearLoadingState(slug!);
    }
    return redirect(`/unread/${slug}`);
};

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
    const promptId = "stream-prompt-" + stream.latestTimestamp;

    return (
        <RoundedSection
            key={stream.latestTimestamp}
            backgroundClass={stream.badge > 0 ? "bg-yellow-100" : undefined}
        >
            <h2>{stream.name}</h2>

            <div className="my-2">
                <SummaryText text={stream.summary} />
            </div>

            <div>
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
                    see messages
                </a>
                {" • "}
                <a
                    onClick={() => {
                        const content = document.getElementById(promptId);
                        if (content) {
                            content.style.display =
                                content.style.display == "block"
                                    ? "none"
                                    : "block";
                        }
                    }}
                >
                    prompt
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
            <div style={{ display: "none" }} id={promptId}>
                <textarea
                    className="p-2 bg-white w-full h-20"
                    onClick={(evt) => (evt.target as HTMLInputElement).select()}
                >
                    {stream.promptParts?.join("\n\n") ?? "(missing)"}
                </textarea>
            </div>
        </RoundedSection>
    );
}

function AccountInfo({ unreads }: { unreads: SlackUnreadsResponse | null }) {
    if (!unreads?.self?.name) {
        return null;
    }

    return (
        <span>
            logged in as <strong>{unreads.self.name}</strong>
        </span>
    );
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
        return (
            <RoundedSection>
                <div className="text-center">No unread messages</div>
            </RoundedSection>
        );
    }

    return (
        <>
            {unreads.streams.map((stream) => (
                <StreamContent stream={stream} key={stream.latestTimestamp} />
            ))}
        </>
    );
}

export default function Unread() {
    const { slug } = useLoaderData<{
        slug: string;
    }>();

    const [unreads, setUnreads] = useState<SlackUnreadsResponse | null>(null);
    const loading = unreads?.loading !== false;

    useInterval(
        () => {
            fetch("/api/unread/" + slug)
                .then((response) => response.json())
                .then((unreads: SlackUnreadsResponse) => {
                    setUnreads(unreads);
                });
        },
        loading ? 1000 : null,
    );

    return (
        <main>
            <RoundedSection>
                <div className="flex items-center justify-center space-x-2">
                    <h1 className="flex-grow">{slug}</h1>
                    <AccountInfo unreads={unreads} />
                    <form method="post" action={`/unread/${slug}`}>
                        <button
                            className="btn btn-blue"
                            disabled={loading}
                            name="reload"
                            value="1"
                        >
                            Reload
                        </button>
                    </form>
                </div>
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
