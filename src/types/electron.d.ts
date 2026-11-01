export {};

declare global {
  interface ElectronPrinterInfo {
    name: string;
    displayName: string;
    isDefault: boolean;
    status: string | null;
  }

  interface ElectronPrintingResult {
    ok: boolean;
    error?: string;
  }

  interface ElectronPrintSilentOptions {
    deviceName: string;
    /** Paper width in microns; defaults to 80000 (80 mm roll). */
    widthMicrons?: number;
    /** Defaults to 1. */
    copies?: number;
  }

  interface ElectronKickDrawerOptions {
    /** Spooler printer the drawer hangs off (used when no host is given). */
    printerName?: string;
    /** Network printer address: the kick goes raw over TCP instead of the spooler. */
    host?: string;
    /** Defaults to 9100. */
    port?: number;
    /** 0 = drawer pin 2, 1 = drawer pin 5. */
    pin: 0 | 1;
  }

  interface Window {
    electronAPI?: {
      getAppVersion: () => Promise<string>;
      /** W6-05: called when the OS locks the screen or suspends; returns the unsubscribe. */
      onLockScreen: (callback: () => void) => () => void;
      /** W6-05: true once if the OS locked or suspended since the last call (also when no window was listening). */
      takePendingLock: () => Promise<boolean>;
      printing: {
        listPrinters: () => Promise<ElectronPrinterInfo[]>;
        printSilent: (opts: ElectronPrintSilentOptions) => Promise<ElectronPrintingResult>;
        kickDrawer: (opts: ElectronKickDrawerOptions) => Promise<ElectronPrintingResult>;
      };
    };
  }
}
