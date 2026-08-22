import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";

const {
  createIpcAuthorization,
  isAllowedRendererUrl,
} = require("./ipc-authorization.cjs") as {
  createIpcAuthorization: (options: {
    isDevelopment: boolean;
    rendererPath: string;
  }) => {
    register: (contents: Record<string, unknown>, role: "main" | "mini") => void;
    assertEvent: (event: Record<string, unknown>, channel: string) => string;
    assertProject: (event: Record<string, unknown>, rootPath: string) => void;
    setProject: (contents: Record<string, unknown>, rootPath: string) => void;
  };
  isAllowedRendererUrl: (
    url: string,
    options: { isDevelopment: boolean; rendererPath: string },
  ) => boolean;
};

function renderer(id: number, url: string) {
  const mainFrame = { url };
  return {
    id,
    mainFrame,
    isDestroyed: vi.fn(() => false),
    once: vi.fn(),
  };
}

describe("IPC authorization", () => {
  const rendererPath = path.resolve("dist/index.html");

  it("allows only the packaged entry file or the exact development origin", () => {
    expect(
      isAllowedRendererUrl(pathToFileURL(rendererPath).toString(), {
        isDevelopment: false,
        rendererPath,
      }),
    ).toBe(true);
    expect(
      isAllowedRendererUrl("https://example.com/", {
        isDevelopment: false,
        rendererPath,
      }),
    ).toBe(false);
    expect(
      isAllowedRendererUrl("http://localhost:5173/?mode=mini", {
        isDevelopment: true,
        rendererPath,
      }),
    ).toBe(true);
    expect(
      isAllowedRendererUrl("http://127.0.0.1:5173/", {
        isDevelopment: true,
        rendererPath,
      }),
    ).toBe(false);
  });

  it("rejects unregistered, subframe, and unexpected-url senders", () => {
    const authorization = createIpcAuthorization({
      isDevelopment: false,
      rendererPath,
    });
    const contents = renderer(7, pathToFileURL(rendererPath).toString());
    expect(() =>
      authorization.assertEvent(
        { sender: contents, senderFrame: contents.mainFrame },
        "project:refresh",
      ),
    ).toThrow(/unauthorized renderer/i);
    authorization.register(contents, "main");
    expect(() =>
      authorization.assertEvent(
        { sender: contents, senderFrame: { url: contents.mainFrame.url } },
        "project:refresh",
      ),
    ).toThrow(/non-main renderer frame/i);
    contents.mainFrame.url = "https://example.com/";
    expect(() =>
      authorization.assertEvent(
        { sender: contents, senderFrame: contents.mainFrame },
        "project:refresh",
      ),
    ).toThrow(/unexpected renderer URL/i);
  });

  it("limits the Mini renderer to its read-only companion channels", () => {
    const authorization = createIpcAuthorization({
      isDevelopment: true,
      rendererPath,
    });
    const contents = renderer(11, "http://localhost:5173/?mode=mini");
    authorization.register(contents, "mini");
    expect(
      authorization.assertEvent(
        { sender: contents, senderFrame: contents.mainFrame },
        "project:refresh",
      ),
    ).toBe("mini");
    expect(() =>
      authorization.assertEvent(
        { sender: contents, senderFrame: contents.mainFrame },
        "terminal:create",
      ),
    ).toThrow(/restricted Mini renderer/i);
  });

  it("scopes project IPC to the folder opened by that window", () => {
    const authorization = createIpcAuthorization({
      isDevelopment: true,
      rendererPath,
    });
    const contents = renderer(13, "http://localhost:5173/");
    const event = { sender: contents, senderFrame: contents.mainFrame };
    const activeRoot = path.resolve("workspace-a");
    const otherRoot = path.resolve("workspace-b");
    authorization.register(contents, "main");
    expect(() => authorization.assertProject(event, activeRoot)).toThrow(
      /outside this window's active project/i,
    );
    authorization.setProject(contents, activeRoot);
    expect(() => authorization.assertProject(event, activeRoot)).not.toThrow();
    expect(() => authorization.assertProject(event, otherRoot)).toThrow(
      /outside this window's active project/i,
    );
  });
});
