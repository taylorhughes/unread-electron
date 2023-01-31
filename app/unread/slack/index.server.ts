import fs from "fs";
import path from "path";

import { app, Cookie, safeStorage } from "electron";

import SlackUnreadsLoader, {
    SlackUnreadsResponse,
} from "./SlackUnreadsLoader.server";
import { Protocol } from "puppeteer";

let loaderBySlug: { [key: string]: SlackUnreadsLoader | undefined } = {};
let unreadsLoadingByTeamSlug: { [key: string]: number | undefined } = {};
let unreadsByTeamSlug: { [key: string]: SlackUnreadsResponse | undefined } = {};

export type {
    SlackUnreadsResponse,
    SummarizedUnreadStream,
} from "./SlackUnreadsLoader.server";

export function startLoading(teamSlug: string): void {
    if (unreadsLoadingByTeamSlug[teamSlug]) {
        return;
    }

    let loader;
    if (!loaderBySlug[teamSlug]) {
        const cookies = credentialsForTeam(teamSlug) || [];
        loader = new SlackUnreadsLoader(
            teamSlug,
            cookies.map(electronCookieToPuppeteerCookie),
        );
        loaderBySlug[teamSlug] = loader;
    } else {
        loader = loaderBySlug[teamSlug];
    }

    const now = +new Date();
    unreadsLoadingByTeamSlug[teamSlug] = now;

    loader!.loadUnreads((unreads) => {
        if (unreadsLoadingByTeamSlug[teamSlug] === now) {
            unreadsByTeamSlug[teamSlug] = unreads;
        } else {
            console.warn("Ignoring stale unreads update...", now);
        }
    });
}

export function clearLoadingState(teamSlug: string): void {
    delete unreadsLoadingByTeamSlug[teamSlug];
    delete unreadsByTeamSlug[teamSlug];
}

export function clearAuthState(teamSlug: string): void {
    clearLoadingState(teamSlug);
    delete loaderBySlug[teamSlug];
}

export function sessionNeedsLogin(teamSlug: string): boolean {
    // If this value is undefined/missing, we don't know yet; so === is important here.
    return unreadsByTeamSlug[teamSlug]?.validSession === false;
}

export function getUnreads(teamSlug: string): SlackUnreadsResponse | null {
    return unreadsByTeamSlug[teamSlug] ?? null;
}

function getCredentialsDir(): string {
    return path.join(app.getPath("userData"), "unread-credentials");
}

type SlackCredentialsFile = {
    cookies: string[];
};

export function storeCredentials(teamSlug: string, cookies: Cookie[]): void {
    const encryptedCookies = new Array<string>();
    for (const cookie of cookies) {
        encryptedCookies.push(
            safeStorage
                .encryptString(JSON.stringify(cookie))
                .toString("base64"),
        );
    }

    const credentialsDir = getCredentialsDir();
    try {
        fs.mkdirSync(credentialsDir, { recursive: true });
    } catch (e: any) {
        if (e.code !== "EEXIST") {
            throw e;
        }
    }
    const cookiePath = path.join(credentialsDir, `${teamSlug}.json`);
    const fd = fs.openSync(cookiePath, "w");
    const contents: SlackCredentialsFile = { cookies: encryptedCookies };
    fs.writeSync(fd, JSON.stringify(contents, null, 2));
}

export function credentialsForTeam(teamSlug: string): Cookie[] | null {
    const cookiePath = path.join(getCredentialsDir(), `${teamSlug}.json`);
    if (!fs.existsSync(cookiePath)) {
        return null;
    }

    const contents: SlackCredentialsFile = JSON.parse(
        fs.readFileSync(cookiePath, "utf8"),
    );
    const decryptedCookies = new Array<Cookie>();

    return contents.cookies.map(
        (encryptedCookie) =>
            JSON.parse(
                safeStorage.decryptString(
                    Buffer.from(encryptedCookie, "base64"),
                ),
            ) as Cookie,
    );
}

function electronCookieToPuppeteerCookie(
    cookie: Cookie,
): Protocol.Network.CookieParam {
    let sameSite: Protocol.Network.CookieSameSite | undefined;
    if (cookie.sameSite === "no_restriction") {
        sameSite = "None";
    } else if (cookie.sameSite === "lax") {
        sameSite = "Lax";
    } else if (cookie.sameSite === "strict") {
        sameSite = "Strict";
    }

    return {
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        expires: cookie.expirationDate,
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        sameSite,
    };
}
