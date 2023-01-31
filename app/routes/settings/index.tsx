import { Link, useLoaderData } from "@remix-run/react";
import { json } from "@remix-run/node";
import RoundedSection from "~/components/RoundedSection";
import {
    addTeamSlug,
    getOpenAIKey,
    getOpenAIOrg,
    getTeamSlugs,
    removeTeamSlug,
    setOpenAIKey,
    setOpenAIOrg,
} from "~/unread/settings.server";
import {
    LoaderArgs,
    ActionArgs,
    redirect,
    MetaFunction,
} from "@remix-run/server-runtime";
import { APP_NAME } from "~/unread/config";

export function loader({}: LoaderArgs) {
    return json({
        slackTeams: getTeamSlugs(),
        openAIOrg: getOpenAIOrg(),
        openAIKey: getOpenAIKey(),
    });
}

export const meta: MetaFunction = () => {
    return {
        title: `${APP_NAME}: Settings`,
    };
};

export const action = async ({ request }: ActionArgs) => {
    const formData = await request.formData();

    if (formData.get("addTeamSlug")) {
        const teamSlug = formData.get("addTeamSlug") as string;
        addTeamSlug(teamSlug);
    }
    if (formData.get("removeTeamSlug")) {
        const teamSlug = formData.get("removeTeamSlug") as string;
        removeTeamSlug(teamSlug);
    }

    if (formData.get("editOpenAI") == "1") {
        const openAIOrg = formData.get("openAIOrg") as string;
        setOpenAIOrg(openAIOrg);
        const openAIKey = formData.get("openAIKey") as string;
        setOpenAIKey(openAIKey);
    }
    return redirect(`/settings`);
};

export default function Index() {
    const { slackTeams, openAIKey, openAIOrg } =
        useLoaderData<{
            slackTeams: Array<string>;
            openAIOrg: string;
            openAIKey: string;
        }>() ?? {};
    return (
        <main>
            <RoundedSection>
                <Link to="/">&larr; Back to teams list</Link>
            </RoundedSection>
            {slackTeams.length > 0 && (
                <RoundedSection>
                    {slackTeams.map((team) => (
                        <div key={team} className="flex justify-between">
                            <span>{team}</span>
                            <form method="post" action="/settings">
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
            )}
            <RoundedSection>
                <form
                    method="post"
                    action="/settings"
                    className="flex space-x-1"
                >
                    <input
                        className="flex-grow p-2"
                        type="text"
                        name="addTeamSlug"
                        placeholder="your-team-slug"
                    />
                    <button type="submit" className="btn btn-blue">
                        Add Slack Team
                    </button>
                </form>
                <p className="text-gray-500 text-xs m-1">
                    You can find this in emails from slack,
                    <br />
                    eg. your-team.slack.com == your-team
                </p>
            </RoundedSection>
            <RoundedSection>
                <form
                    method="post"
                    action="/settings"
                    className="flex flex-col space-y-1"
                >
                    <input
                        className="flex-grow p-2"
                        type="text"
                        name="openAIKey"
                        defaultValue={openAIKey}
                        placeholder="sk-53958hoo..."
                    />
                    <input
                        className="flex-grow p-2"
                        type="text"
                        name="openAIOrg"
                        defaultValue={openAIOrg}
                        placeholder="org-TM6..."
                    />
                    <button
                        type="submit"
                        className="btn btn-blue"
                        name="editOpenAI"
                        value="1"
                    >
                        Save OpenAI Info
                    </button>
                </form>
            </RoundedSection>
        </main>
    );
}
