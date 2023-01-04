import { json } from "@remix-run/node";

import { getUnreads } from "~/unread/slack/index.server";

export function loader({ params: { slug } }: { params: { slug: string } }) {
    return json(getUnreads(slug));
}
