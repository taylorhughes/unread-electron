import { OpenAIApi, Configuration } from "openai";

const OPENAI_API_KEY = "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";
const OPENAI_ORG = "org-TM6XYv6JNclpz3WgkvTPaBJs";

const TEXT_MODEL = "text-davinci-003";

const configuration = new Configuration({
    organization: OPENAI_ORG,
    apiKey: OPENAI_API_KEY,
});
const client = new OpenAIApi(configuration);

export async function summarizeThread(
    promptStart: string,
    promptEnd: string,
    text: string,
) {
    const ret = await client.createCompletion({
        model: TEXT_MODEL,
        prompt: `${promptStart}\n\n${text}\n\n${promptEnd}`,
        max_tokens: 64,
    });

    return ret.data.choices[0].text;
}
