import { HTTPRequest, HTTPResponse } from "puppeteer";
import fs from "fs";
import path from "path";
import { getBoundary, parse } from "parse-multipart-data";
import {
    ClientBootResponse,
    ConversationsViewResponse,
    ClientCountsResponse,
    UsersListResponseItem,
    SubscriptionsThreadGetViewResponse,
    ConversationsHistoryResponse,
    UsersListResponse,
} from "./responses";

type RequestRecord = {
    querystring: string;
    requestParams: Record<string, string>;
};

function getPostData(request: HTTPRequest) {
    const post = request.postData();
    if (!post) {
        return {};
    }

    const boundary = getBoundary(request.headers()["content-type"]);
    if (boundary.length > 0) {
        const parsed = parse(Buffer.from(post), boundary);
        const dict: Record<string, string> = {};
        parsed.forEach((part) => {
            if (part.name && (part.type == "text/plain" || !part.type)) {
                dict[part.name] = part.data.toString();
            }
        });
        return dict;
    }

    try {
        return JSON.parse(post) as Record<string, string>;
    } catch (e) {
        return {};
    }
}

export const BASE_RESPONSES_DIR = path.join(__dirname, "..", "..", "responses");

function recordDebugAPIMetadata(type: string, slug: string, metadata: any) {
    if (process.env.NODE_ENV !== "development") {
        return;
    }

    const baseFilename = path.join(BASE_RESPONSES_DIR, `${type}/${slug}.json`);
    fs.mkdirSync(path.dirname(baseFilename), { recursive: true });

    let i = 0;
    let filename;
    do {
        filename = baseFilename.replace(
            /\.json$/,
            i > 0 ? `-${i}.json` : ".json",
        );
        i += 1;
    } while (fs.existsSync(filename));

    const fd = fs.openSync(filename, "w");
    fs.writeSync(fd, JSON.stringify(metadata, null, 2));
}

export default class PageDataModel {
    bootResponse?: ClientBootResponse;

    conversationsResponse?: ConversationsViewResponse;

    countsResponse?: ClientCountsResponse;

    usersListResponses: {
        [userId: string]: UsersListResponseItem | undefined;
    } = {};

    threadsResponse?: SubscriptionsThreadGetViewResponse;

    conversationsHistory: {
        [channelId: string]: ConversationsHistoryResponse | undefined;
    } = {};

    private edgeRequests: RequestRecord[] = [];

    private recordEdgeRequest(
        request: HTTPRequest,
        requestParams: Record<string, string>,
    ) {
        this.edgeRequests.push({
            querystring: request.url().split("?")[1] ?? "",
            requestParams,
        });
        if (this.edgeRequests.length > 10) {
            this.edgeRequests.shift();
        }
    }

    public createEdgeFetch(slug: string, params: { [key: string]: any }) {
        const edgeRequest = this.edgeRequests[0];
        if (!edgeRequest) {
            console.error("No previous edge request");
            return null;
        }
        const boot = this.bootResponse;
        if (!boot) {
            console.error("No boot response");
            return null;
        }

        // eg. ?fp=e1
        const edgeQuerystring = edgeRequest.querystring;
        const requestPath = `cache/${boot.self.team_id}/${slug}?${edgeQuerystring}`;
        const listBody = {
            token: edgeRequest.requestParams.token,
            ...params,
        };
        const bodyString = JSON.stringify(JSON.stringify(listBody));

        return `
            fetch("https://edgeapi.slack.com/${requestPath}", {
                method: "POST",
                credentials: "include",
                body: ${bodyString}
            })
            .then((response) => response.json())
            .then((json) => console.log('Edge response:', json))
        `;
    }

    private apiRequests: RequestRecord[] = [];

    private recordAPIRequest(
        request: HTTPRequest,
        requestParams: Record<string, string>,
    ) {
        this.apiRequests.push({
            querystring: request.url().split("?")[1] ?? "",
            requestParams,
        });
        if (this.apiRequests.length > 10) {
            this.apiRequests.shift();
        }
    }

    public createAPIFetch(slug: string, params: { [key: string]: any }) {
        const apiRequest = this.apiRequests[this.apiRequests.length - 1];
        if (!apiRequest) {
            console.error("No previous edge request");
            return null;
        }

        const querystring = apiRequest.querystring;
        const listBody = {
            token: apiRequest.requestParams.token,
            ...params,
        };
        const bodyString = JSON.stringify(JSON.stringify(listBody));

        return `
            var data = JSON.parse(${bodyString});
            var formData = new FormData();
            for (var key in data) {
                formData.append(key, data[key]);
            }
            fetch("/api/${slug}?${querystring}", {
                method: "POST",
                credentials: "include",
                body: formData
            })
            .then((response) => response.json())
            .then((json) => console.log('API response:', json))
        `;
    }

    private async processAPI(
        slug: string,
        requestParams: Record<string, string>,
        responseData: any,
    ) {
        switch (slug) {
            case "client.boot":
                this.bootResponse = responseData as ClientBootResponse;
                break;

            case "conversations.history":
                const typedData = responseData as ConversationsHistoryResponse;
                const channel = requestParams.channel;
                if (channel && typedData) {
                    this.conversationsHistory[channel] = typedData;
                } else {
                    throw new Error("Unknown conversations.history format");
                }
                break;

            case "conversations.view":
                this.conversationsResponse =
                    responseData as ConversationsViewResponse;
                break;

            case "client.counts":
                this.countsResponse = responseData as ClientCountsResponse;
                break;

            case "subscriptions.thread.getView":
                this.threadsResponse =
                    responseData as SubscriptionsThreadGetViewResponse;
                break;
        }
    }

    private processEdge(slug: string, responseData: any) {
        switch (slug) {
            case "users/list":
                const results =
                    (responseData as UsersListResponse)?.results || [];
                results.forEach((result) => {
                    this.usersListResponses[result.id] = result;
                });
                break;
        }
    }

    public async addResponseData(request: HTTPRequest, response: HTTPResponse) {
        const url = response.url();

        let slug;
        let type: undefined | "api" | "edge";
        if (url.includes("/api/")) {
            // https://premint.slack.com/api/experiments.getByUser?_x_id=noversion-1672
            slug = url.split("/api/")[1].split("?")[0];
            type = "api";
        } else if (url.includes("edgeapi")) {
            // https://edgeapi.slack.com/cache/T03DFV746MP/users/info?fp=1d
            slug = url.split(/\/cache\/\w+\//)[1].split("?")[0];
            type = "edge";
        } else {
            return;
        }

        let responseData;
        try {
            responseData = await response.json();
        } catch (e) {
            console.error("Could not load response JSON:", slug, responseData);
            return;
        }

        const requestParams = getPostData(request);

        recordDebugAPIMetadata(type, slug, {
            url: request.url(),
            headers: request.headers(),
            requestParams,
            responseData,
        });

        console.log(`[${type} request] ${slug}`);

        if (type == "api") {
            this.recordAPIRequest(request, requestParams);
            this.processAPI(slug, requestParams, responseData);
        } else if (type == "edge") {
            this.recordEdgeRequest(request, requestParams);
            this.processEdge(slug, responseData);
        }
    }
}
