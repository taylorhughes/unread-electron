import { Link, useLoaderData } from "@remix-run/react";
import { json } from "@remix-run/node";
import RoundedSection from "~/components/RoundedSection";
import { getOpenAIKey, getTeamSlugs } from "~/unread/settings.server";
import { LoaderArgs, MetaFunction } from "@remix-run/server-runtime";
import { APP_NAME } from "~/unread/config";

export function loader({}: LoaderArgs) {
    return json({ slackTeams: getTeamSlugs(), hasOpenAIKey: !!getOpenAIKey() });
}

export const meta: MetaFunction = () => {
    return {
        title: `${APP_NAME}: Slack Teams`,
    };
};

export default function Index() {
    const { slackTeams, hasOpenAIKey } =
        useLoaderData<{ slackTeams: Array<string>; hasOpenAIKey: boolean }>() ??
        {};
    return (
        <main>
            <RoundedSection>
                {slackTeams.map((team) => (
                    <div key={team} className="flex justify-between">
                        <Link target="_blank" to={`/unread/${team}`}>
                            {team} ↗
                        </Link>
                    </div>
                ))}

                {slackTeams.length === 0 && (
                    <div className="text-gray-500">
                        No Slack teams added yet!
                    </div>
                )}
                {!hasOpenAIKey && (
                    <div className="text-gray-500">
                        No OpenAI key, set it in settings.
                    </div>
                )}
            </RoundedSection>
            <RoundedSection>
                <Link to="/settings">Edit teams & set OpenAI key</Link>
            </RoundedSection>
        </main>
    );
}
