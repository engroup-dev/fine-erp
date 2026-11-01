import { app, BrowserWindow, shell, session, nativeImage, ipcMain, powerMonitor } from "electron";
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import started from "electron-squirrel-startup";
import { updateElectronApp } from "update-electron-app";
import { registerPrintingHandlers } from "./ipc/printing";

app.setName("Fine ERP");
process.title = "Fine ERP";

if (app.isPackaged) {
  updateElectronApp();
}

if (process.platform === "win32") {
  app.setAppUserModelId("Fine ERP");
}
if (process.platform === "linux") {
  app.setDesktopName("fine-erp");
}

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const getAppIcon = () => {
  const possiblePaths = [
    path.resolve(__dirname, "../../assets/icons/icon.png"),
    path.resolve(__dirname, "../assets/icons/icon.png"),
    path.resolve(app.getAppPath(), "../assets/icons/icon.png"),
    path.resolve(app.getAppPath(), "assets/icons/icon.png"),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      const img = nativeImage.createFromPath(p);
      if (!img.isEmpty()) {
        return img;
      }
    }
  }
  return undefined;
};

let mainWindow: BrowserWindow | null = null;

// W6-05: an OS lock/suspend that no renderer has collected yet (see sendLockScreen).
let pendingLock = false;

const rendererIndexPath = () => path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`);

/**
 * True only for the app's own renderer: the vite dev server's origin in development, otherwise the
 * packaged index.html (HashRouter keeps every route on that one file). Anything else is remote content.
 */
const isAppUrl = (url: string): boolean => {
  try {
    const target = new URL(url);
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      return target.origin === new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL).origin;
    }
    const index = new URL(pathToFileURL(rendererIndexPath()).href);
    const normalize = (p: string) => {
      const decoded = decodeURIComponent(p);
      return process.platform === "win32" ? decoded.toLowerCase() : decoded; // Windows paths ignore case
    };
    return target.protocol === "file:" && normalize(target.pathname) === normalize(index.pathname);
  } catch {
    return false;
  }
};

const createWindow = () => {
  const appIcon = getAppIcon();

  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "Fine ERP",
    icon: appIcon,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  if (appIcon && process.platform === "linux") {
    mainWindow.setIcon(appIcon);
  }

  mainWindow.show();
  mainWindow.maximize();
  mainWindow.focus();

  mainWindow.once("ready-to-show", () => {
    if (!mainWindow.isDestroyed() && !mainWindow.isMaximized()) {
      mainWindow.maximize();
    }
  });

  mainWindow.webContents.on("did-finish-load", () => {
    if (!mainWindow.isDestroyed() && !mainWindow.isMaximized()) {
      mainWindow.maximize();
    }
  });

  mainWindow.webContents.on("devtools-opened", () => {
    setImmediate(() => {
      if (!mainWindow.isDestroyed() && !mainWindow.isMaximized()) {
        mainWindow.maximize();
      }
    });
  });

  // Lock down window creation
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https:") || url.startsWith("http:")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  // The preload bridge (printers, spooler, raw sockets) must never end up on remote content.
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isAppUrl(url)) return;
    event.preventDefault();
    if (url.startsWith("https:") || url.startsWith("http:")) {
      shell.openExternal(url);
    }
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(rendererIndexPath());
  }

  // if its development mode, open dev tools
  if (process.env.NODE_ENV === "development") {
    mainWindow.webContents.openDevTools();
  }
};

// Set up security headers & CSP
app.on("ready", () => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    // Only apply CSP to local development and local file URLs
    const isLocal =
      details.url.startsWith("http://localhost:") ||
      details.url.startsWith("file://");

    if (!isLocal) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }

    const responseHeaders = { ...details.responseHeaders };

    // Set a strict CSP for the renderer
    responseHeaders["Content-Security-Policy"] = [
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' http: https: ws:",
    ];

    callback({ responseHeaders });
  });
  createWindow();

  // W6-05: when the OS locks the screen or the machine suspends, the app locks its own screen too.
  // The event is also kept as pending until a renderer collects it (app:take-pending-lock), so it
  // is not lost while no window is open (macOS) or while the renderer is still loading.
  const sendLockScreen = () => {
    pendingLock = true;
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send("app:lock-screen");
    }
  };
  powerMonitor.on("lock-screen", sendLockScreen);
  powerMonitor.on("suspend", sendLockScreen);
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle("app:get-version", () => {
  return app.getVersion();
});

ipcMain.handle("app:take-pending-lock", (event): boolean => {
  if (!isAppUrl(event.senderFrame?.url ?? "")) return false;
  const pending = pendingLock;
  pendingLock = false;
  return pending;
});

registerPrintingHandlers(isAppUrl);

