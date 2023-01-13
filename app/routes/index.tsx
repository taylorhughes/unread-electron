import { Link, useLoaderData } from "@remix-run/react";
import { json } from "@remix-run/node";
import RoundedSection from "~/components/RoundedSection";
import {
    addTeamSlug,
    getTeamSlugs,
    removeTeamSlug,
} from "~/unread/slack/index.server";
import {
    LoaderArgs,
    ActionArgs,
    redirect,
    MetaFunction,
} from "@remix-run/server-runtime";

export function loader({}: LoaderArgs) {
    return json({ slackTeams: getTeamSlugs() });
}

export const meta: MetaFunction = () => {
    return {
        title: "Unreads: Slack Teams",
    };
};

export const action = async ({ request, params: { slug } }: ActionArgs) => {
    const formData = await request.formData();
    if (formData.get("addTeamSlug")) {
        const teamSlug = formData.get("addTeamSlug") as string;
        addTeamSlug(teamSlug);
    }
    if (formData.get("removeTeamSlug")) {
        const teamSlug = formData.get("removeTeamSlug") as string;
        removeTeamSlug(teamSlug);
    }
    return redirect(`/`);
};

export default function Index() {
    const { slackTeams } = useLoaderData<{ slackTeams: Array<string> }>() ?? {};
    return (
        <main>
            <RoundedSection>
                <h1>Unreads</h1>
                {slackTeams.map((team) => (
                    <div key={team} className="flex justify-between">
                        <Link target="_blank" to={`/unread/${team}`}>
                            Unreads for {team}
                        </Link>
                        <form method="post" action="/?index">
                            <input
                                type="hidden"
                                name="removeTeamSlug"
                                value={team}
                            />
                            <button type="submit" title="Remove">
                                &times;
                            </button>
                        </form>
                    </div>
                ))}
            </RoundedSection>
            <RoundedSection>
                <form method="post" action="/?index" className="flex space-x-1">
                    <input
                        className="flex-grow p-2"
                        type="text"
                        name="addTeamSlug"
                        placeholder="my-slack-team"
                    />
                    <button type="submit" className="btn btn-blue">
                        Add Slack Team
                    </button>
                </form>
            </RoundedSection>
        </main>
    );
}
