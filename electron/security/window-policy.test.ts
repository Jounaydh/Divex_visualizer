import { describe, expect, it, vi } from "vitest";

const {
  hardenWebContents,
  secureWebPreferences,
} = require("./window-policy.cjs") as {
  secureWebPreferences: (preload: string) => Record<string, unknown>;
  hardenWebContents: (contents: Record<string, unknown>) => void;
};

describe("Electron window policy", () => {
  it("enables the sandbox and disables privileged renderer features", () => {
    expect(secureWebPreferences("preload.cjs")).toMatchObject({
      preload: "preload.cjs",
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      webviewTag: false,
      navigateOnDragDrop: false,
    });
  });

  it("denies navigation, child windows, webviews, and browser permissions", () => {
    const listeners = new Map<string, (event: { preventDefault: () => void }) => void>();
    const requestHandler = vi.fn();
    const checkHandler = vi.fn();
    const contents = {
      setWindowOpenHandler: vi.fn(),
      on: vi.fn((name: string, listener: (event: { preventDefault: () => void }) => void) => {
        listeners.set(name, listener);
      }),
      session: {
        setPermissionCheckHandler: checkHandler,
        setPermissionRequestHandler: requestHandler,
      },
    };
    hardenWebContents(contents);
    expect(contents.setWindowOpenHandler.mock.calls[0][0]()).toEqual({ action: "deny" });
    for (const eventName of ["will-navigate", "will-frame-navigate", "will-attach-webview"]) {
      const event = { preventDefault: vi.fn() };
      listeners.get(eventName)?.(event);
      expect(event.preventDefault).toHaveBeenCalledOnce();
    }
    expect(checkHandler.mock.calls[0][0]()).toBe(false);
    const permissionCallback = vi.fn();
    requestHandler.mock.calls[0][0](null, "notifications", permissionCallback);
    expect(permissionCallback).toHaveBeenCalledWith(false);
  });
});
