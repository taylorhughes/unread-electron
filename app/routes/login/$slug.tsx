import { useLoaderData } from "@remix-run/react";
import { json, MetaFunction, redirect, TypedResponse } from "@remix-run/node";
import { BrowserWindow, session } from "electron";

import type { Cookie } from "electron";

import {
    clearLoadingState,
    storeCredentials,
} from "~/unread/slack/index.server";
import { APP_NAME } from "~/unread/config";

let slackWindow: BrowserWindow | null = null;

type LoaderData = {
    slug: string;
};

function persistCredentials(slug: string, window: BrowserWindow) {
    // Logged in! Get the cookies from appropriate domains
    const cookiePromises = [];
    cookiePromises.push(
        window.webContents.session.cookies.get({
            url: "https://app.slack.com/",
        }),
    );
    cookiePromises.push(
        window.webContents.session.cookies.get({
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
}

export function loader({
    params: { slug },
}: {
    params: { slug: string };
}): TypedResponse<LoaderData> {
    const destinationUrl = `https://${slug}.slack.com/unreads`;

    if (!slackWindow) {
        const slackSession = session.fromPartition(`persist:slack`);
        slackSession.protocol.registerFileProtocol(
            "slack",
            (request, callback) => {
                callback(""); // errors out the attempt to open the slack app
                setTimeout(() => {
                    slackWindow!.loadURL(destinationUrl);
                }, 0);
            },
        );

        slackWindow = new BrowserWindow({
            width: 1024,
            height: 768,
            webPreferences: { session: slackSession },
        });

        slackWindow.loadURL(destinationUrl);
    } else if (
        slackWindow.webContents
            .getURL()
            .startsWith("https://app.slack.com/client")
    ) {
        persistCredentials(slug, slackWindow);
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

export default function Login() {
    const { slug } = useLoaderData<LoaderData>();
    return (
        <main>
            <h1>{APP_NAME}: Login</h1>
            <p>Waiting for you to log into slack workspace {slug}...</p>
        </main>
    );
}
