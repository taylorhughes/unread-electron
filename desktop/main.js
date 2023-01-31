const { initRemix } = require("remix-electron");
const { app, BrowserWindow, dialog } = require("electron");
const { join } = require("node:path");
const pie = require("puppeteer-in-electron");

let win;

async function createWindow(url) {
    win = new BrowserWindow({ show: false, width: 400, height: 500 });
    await win.loadURL(url);
    win.show();

    // if (process.env.NODE_ENV === "development") {
    //     win.webContents.openDevTools();
    // }

    win.webContents.on(
        "new-window",
        function (
            evt,
            url,
            frameName,
            disposition,
            options,
            additionalFeatures,
        ) {
            // update options.width, height
        },
    );
}

pie.initialize(app);

app.on("ready", async () => {
    try {
        // if (process.env.NODE_ENV === "development") {
        //     const {
        //         default: installExtension,
        //         REACT_DEVELOPER_TOOLS,
        //     } = require("electron-devtools-installer");

        //     await installExtension(REACT_DEVELOPER_TOOLS);
        // }

        const url = await initRemix({ serverBuild: join(__dirname, "build") });
        await createWindow(url);
    } catch (error) {
        dialog.showErrorBox("Error", getErrorStack(error));
        console.error(error);
    }
});

/** @param {unknown} error */
function getErrorStack(error) {
    return error instanceof Error
        ? error.stack || error.message
        : String(error);
}
