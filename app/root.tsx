import type { LinksFunction, MetaFunction } from "@remix-run/node";
import {
    Links,
    LiveReload,
    Meta,
    Outlet,
    Scripts,
    ScrollRestoration,
    useCatch,
} from "@remix-run/react";
import baseStyles from "./styles/base.css";
import tailwindStyles from "./styles/compiledtailwind.css";

export function CatchBoundary() {
    const caught = useCatch();
    return (
        <html>
            <head>
                <title>Oops!</title>
                <Meta />
                <Links />
            </head>
            <body className="flex flex-col items-center justify-center h-screen">
                <h1>
                    {caught.status} {caught.statusText}
                </h1>
                <pre>{caught.data}</pre>
                <Scripts />
            </body>
        </html>
    );
}

export const meta: MetaFunction = () => ({
    title: "New Remix App",
});

export const links: LinksFunction = () => [
    { rel: "stylesheet", href: baseStyles },
    { rel: "stylesheet", href: tailwindStyles },
];

export default function App() {
    return (
        <html lang="en">
            <head>
                <meta charSet="utf8" />
                <meta
                    name="viewport"
                    content="width=device-width,initial-scale=1"
                />
                <Meta />
                <Links />
            </head>
            <body>
                <Outlet />
                <ScrollRestoration />
                <Scripts />
                {process.env.NODE_ENV === "development" && <LiveReload />}
            </body>
        </html>
    );
}
