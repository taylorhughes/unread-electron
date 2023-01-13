import { Link, useLoaderData } from "@remix-run/react";
import { json } from "@remix-run/node";
import RoundedSection from "~/components/RoundedSection";

export function loader() {
    const slackTeams = ["premint", "fotoloce", "optic-xyz"];
    return json({ slackTeams: slackTeams });
}

export default function Index() {
    const { slackTeams } = useLoaderData<{ slackTeams: Array<string> }>() ?? {};
    return (
        <main>
            <RoundedSection>
                <h1>Unreads</h1>
                {slackTeams.map((team) => (
                    <div key={team}>
                        <Link target="_blank" to={`/unread/${team}`}>
                            Open Slack: {team}
                        </Link>
                    </div>
                ))}
            </RoundedSection>
        </main>
    );
}
