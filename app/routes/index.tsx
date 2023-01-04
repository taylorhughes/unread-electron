import { Link, useLoaderData } from "@remix-run/react";
import { json, MetaFunction } from "@remix-run/node";

export function loader() {
    const slackTeams = ["premint", "fotoloce", "optic-xyz"];
    return json({ slackTeams: slackTeams });
}

export default function Index() {
    const { slackTeams } = useLoaderData<{ slackTeams: Array<string> }>() ?? {};
    return (
        <main>
            <h1>Unreads</h1>
            {slackTeams.map((team) => (
                <div key={team}>
                    <Link to={`/unread/${team}`}>Load Slack: {team}</Link>
                </div>
            ))}
        </main>
    );
}
