import { useLoaderData } from "@remix-run/react";
import { json, MetaFunction, redirect, TypedResponse } from "@remix-run/node";
import { BrowserWindow, session } from "electron";

import type { Cookie } from "electron";

import {
    clearLoadingState,
    storeCredentials,
} from "~/unread/slack/index.server";

let slackWindow: BrowserWindow | null = null;

type LoaderData = {
    slug: string;
};

export function loader({
    params: { slug },
}: {
    params: { slug: string };
}): TypedResponse<LoaderData> {
    if (!slackWindow) {
        const slackSession = session.fromPartition(`persist:slack:${slug}`);
        slackWindow = new BrowserWindow({
            width: 1024,
            height: 768,
            webPreferences: { session: slackSession },
        });

        slackWindow.loadURL(`https://${slug}.slack.com/unreads`);
    } else if (
        slackWindow.webContents
            .getURL()
            .startsWith("https://app.slack.com/client")
    ) {
        // Logged in! Get the cookies from appropriate domains
        const cookiePromises = [];
        cookiePromises.push(
            slackWindow.webContents.session.cookies.get({
                url: "https://app.slack.com/",
            }),
        );
        cookiePromises.push(
            slackWindow.webContents.session.cookies.get({
                url: "https://edgeapi.slack.com/",
            }),
        );

        const duplicates = new Set<string>();
        const cookies = new Array<Cookie>();
        Promise.all(cookiePromises).then((cookiesFromDifferentUrls) => {
            cookiesFromDifferentUrls.forEach((cookieList) => {
                cookieList.forEach((cookie) => {
                    const cookieJson = JSON.stringify(cookie);
                    if (duplicates.has(cookieJson)) {
                        return;
                    }
                    duplicates.add(cookieJson);
                    cookies.push(cookie);
                });
            });

            storeCredentials(slug, cookies);
            clearLoadingState(slug);
        });

        slackWindow.close();
        slackWindow = null;
        return redirect(`/unread/${slug}`);
    }

    return json({ slug: slug });
}

export const meta: MetaFunction = () => {
    return {
        refresh: {
            httpEquiv: "refresh",
            content: "1",
        },
    };
};

export default function Index() {
    const { slug } = useLoaderData<LoaderData>();
    return (
        <main>
            <h1>Unreads: Login</h1>
            <p>Waiting for you to log into slack workspace {slug}...</p>
        </main>
    );
}
