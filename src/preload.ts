import { contextBridge, ipcRenderer } from "electron";

interface PrintSilentOptions {
  deviceName: string;
  widthMicrons?: number;
  copies?: number;
}

interface KickDrawerOptions {
  printerName?: string;
  host?: string;
  port?: number;
  pin: 0 | 1;
}

const api = {
  // App lifecycle
  getAppVersion: () => ipcRenderer.invoke("app:get-version"),

  // W6-05: the OS locked or suspended — the app locks its own screen. Returns the unsubscribe.
  onLockScreen: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("app:lock-screen", listener);
    return () => {
      ipcRenderer.removeListener("app:lock-screen", listener);
    };
  },
  // W6-05: true once if the OS locked or suspended since the last call (also when no window was listening).
  takePendingLock: (): Promise<boolean> => ipcRenderer.invoke("app:take-pending-lock"),

  // Thermal receipt printing + cash drawer
  printing: {
    listPrinters: () => ipcRenderer.invoke("printers:list"),
    printSilent: (opts: PrintSilentOptions) =>
      ipcRenderer.invoke("print:silent", {
        deviceName: opts.deviceName,
        widthMicrons: opts.widthMicrons,
        copies: opts.copies,
      }),
    kickDrawer: (opts: KickDrawerOptions) =>
      ipcRenderer.invoke("drawer:kick", {
        printerName: opts.printerName,
        host: opts.host,
        port: opts.port,
        pin: opts.pin,
      }),
  },
};

contextBridge.exposeInMainWorld("electronAPI", api);
