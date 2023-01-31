import { OpenAIApi, Configuration } from "openai";
import { getOpenAIKey, getOpenAIOrg } from "../settings.server";

const TEXT_MODEL = "text-davinci-003";
// These produce pretty bad results:
// const TEXT_MODEL = "text-curie-001";
// const TEXT_MODEL = "text-ada-001";

var cachedClientOrgKey = "";
var cachedClient: OpenAIApi | null = null;

function getClient() {
    const org = getOpenAIOrg() ?? undefined;
    const key = getOpenAIKey();
    if (!key) {
        console.error("OpenAI org or key not set");
        return null;
    }

    let cacheKey = `${org}:${key}`;
    if (cacheKey !== cachedClientOrgKey) {
        cachedClient = new OpenAIApi(
            new Configuration({
                organization: org,
                apiKey: key,
            }),
        );
        cachedClientOrgKey = cacheKey;
    }

    return cachedClient;
}

export async function summarizeThread(parts: string[]) {
    let client = getClient();
    if (!client) {
        return {
            error: "OpenAI key not set",
        };
    }

    let ret;
    try {
        ret = await client.createCompletion({
            model: TEXT_MODEL,
            prompt: parts.join("\n\n"),
            max_tokens: 64,
        });
    } catch (e) {
        return {
            error: e?.toString() ?? "Unknown error",
        };
    }

    console.log("OpenAI response:", ret.data);
    return {
        text: ret.data.choices[0].text,
        ellipsis: ret.data.choices[0].finish_reason === "length",
    };
}
