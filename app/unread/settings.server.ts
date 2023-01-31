import fs from "fs";
import path from "path";
import { app } from "electron";

type SettingsFile = {
    teamSlugs: string[];
    openAIKey?: string;
    openAIOrg?: string;
};

function getSettings(): SettingsFile {
    const settingsFilename = getSettingsFilename();
    if (fs.existsSync(settingsFilename)) {
        return JSON.parse(fs.readFileSync(settingsFilename, "utf8"));
    }
    return { teamSlugs: [] };
}

function saveSettings(settings: SettingsFile): void {
    const settingsFilename = getSettingsFilename();
    const fd = fs.openSync(settingsFilename, "w");
    fs.writeSync(fd, JSON.stringify(settings, null, 2));
}

function getSettingsFilename(): string {
    return path.join(app.getPath("userData"), "settings.json");
}

export function getTeamSlugs(): string[] {
    return getSettings().teamSlugs;
}

export function addTeamSlug(teamSlug: string): void {
    const settingsFilename = getSettingsFilename();

    let settings = getSettings();
    settings.teamSlugs.push(teamSlug);
    saveSettings(settings);
}
export function removeTeamSlug(teamSlug: string): void {
    const settingsFilename = getSettingsFilename();

    let settings = getSettings();
    settings.teamSlugs = settings.teamSlugs.filter((s) => s !== teamSlug);
    saveSettings(settings);
}

export function getOpenAIKey(): string | null {
    return getSettings().openAIKey ?? null;
}

export function setOpenAIKey(key: string): void {
    const settings = getSettings();
    if (key) {
        settings.openAIKey = key;
    } else {
        delete settings.openAIKey;
    }
    saveSettings(settings);
}

export function getOpenAIOrg(): string | null {
    return getSettings().openAIOrg ?? null;
}

export function setOpenAIOrg(org: string): void {
    const settings = getSettings();
    if (org) {
        settings.openAIOrg = org;
    } else {
        delete settings.openAIOrg;
    }
    saveSettings(settings);
}
