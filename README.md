<img src="https://github.com/taylorhughes/unread-electron/raw/main/resources/icon.png" alt="Unread Buddy icon" width=100 height=100>

# Unread Buddy

An Electron app that runs Slack locally, pulls out your unread messages, and summarizes them using GPT-3 so you don't have to read all of them.

This app runs and accesses Slack in a hidden browser window; no data is shared with any remote services besides the message content being summarized by OpenAI. (Message content is sent to OpenAI's API in a semi-anonymized fashion in order to summarize it.)

This app is a proof of concept and comes with no warranty or guarantees. Enjoy!

Download for Apple Silicon Mac in [Releases](https://github.com/taylorhughes/unread-electron/releases)

## How It Works

The app is an Electron app, which means it's a Node.js web app that runs in a version of Chromium on your local computer. The app uses [remix-electron](https://github.com/itsMapleLeaf/remix-electron) for its basic structure, with React and Tailwind for the very lovely frontend you can see.

To get the data from Slack, the app uses [puppeteer-in-electron](https://www.npmjs.com/package/puppeteer-in-electron) (pie) to instrument slack.com. Once you log in and establish a session (See: [routes/login/$slug.tsx](https://github.com/taylorhughes/unread-electron/blob/main/app/routes/login/%24slug.tsx#L80), [storeCredentials](https://github.com/taylorhughes/unread-electron/blob/main/app/unread/slack/index.server.ts#L80)), puppeteer waits for the Slack web client to load in a headless window (See: [SlackUnreadsLoader](https://github.com/taylorhughes/unread-electron/blob/main/app/unread/slack/SlackUnreadsLoader.server.ts#L431)), and issues some additional API requests to make sure message content is loaded. The app listens to Slack's internal API call results (See: [SlackPageDataModel](https://github.com/taylorhughes/unread-electron/blob/main/app/unread/slack/SlackPageDataModel.server.ts#L219)), and then gathers unread content (channels, threads and DMs) for display & summarization.

Summarizing is the easy part: We take the Slack messages pulled from the previous step and add a prompt to GPT-3, then OpenAI gives us back the summary. We [do our best](https://github.com/taylorhughes/unread-electron/blob/main/app/unread/slack/SlackUnreadsLoader.server.ts#L92) to maintain usernames for display in this step. Welcome to the future.

## Running Locally from Source

1. To install our app's dependencies, run the following command:

   ```sh
   npm install
   ```

1. To start the app in development mode, run the dev script:

   ```sh
   npm run dev
   ```

## Scripts

The following scripts are defined in the `package.json` file:

- `prepare`: This sets up remix dependencies after an install. Don't remove this!
- `dev`: Starts the app with hot reloading. Uses nodemon to restart the app when main process files change.
- `build`: Builds the app for production. Uses [Electron Builder](https://www.electron.build/) to create a distributable package.
- `start`: Starts the app in production mode. Make sure you ran `build` first.
