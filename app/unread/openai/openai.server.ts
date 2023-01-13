import { OpenAIApi, Configuration } from "openai";

const OPENAI_API_KEY = "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";
const OPENAI_ORG = "org-TM6XYv6JNclpz3WgkvTPaBJs";

const TEXT_MODEL = "text-davinci-003";
// const TEXT_MODEL = "text-curie-001";
// const TEXT_MODEL = "text-ada-001";

const configuration = new Configuration({
    organization: OPENAI_ORG,
    apiKey: OPENAI_API_KEY,
});
const client = new OpenAIApi(configuration);

export async function summarizeThread(parts: string[]) {
    const ret = await client.createCompletion({
        model: TEXT_MODEL,
        prompt: parts.join("\n\n"),
        max_tokens: 64,
    });

    console.log("OpenAI response:", ret.data);

    return {
        text: ret.data.choices[0].text,
        ellipsis: ret.data.choices[0].finish_reason === "length",
    };
}
