import { EventEmitter } from "node:events";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const {
  createProjectWatcherService,
  shouldRefreshProject,
} = require("./project-watcher.cjs") as {
  createProjectWatcherService: (options: {
    debounceMs: number;
    createWatcher: (
      rootPath: string,
      options: { recursive: boolean; persistent: boolean },
      callback: (eventType: string, filename: string) => void,
    ) => EventEmitter & { close: () => void };
  }) => {
    start: (owner: FakeOwner, rootPath: string) => string;
    stop: (owner: FakeOwner) => void;
  };
  shouldRefreshProject: (path: string) => boolean;
};

class FakeOwner extends EventEmitter {
  destroyed = false;
  send = vi.fn();

  isDestroyed() {
    return this.destroyed;
  }
}

describe("project watcher", () => {
  it("filters generated folders and unsupported files", () => {
    expect(shouldRefreshProject("lib/main.dart")).toBe(true);
    expect(shouldRefreshProject("src/App.java")).toBe(true);
    expect(shouldRefreshProject("build/generated.dart")).toBe(false);
    expect(shouldRefreshProject("README.md")).toBe(false);
  });

  it("debounces supported changes into one renderer event", async () => {
    vi.useFakeTimers();
    let onChange: ((eventType: string, filename: string) => void) | null =
      null;
    const watcher = Object.assign(new EventEmitter(), {
      close: vi.fn(),
    });
    const owner = new FakeOwner();
    const service = createProjectWatcherService({
      debounceMs: 20,
      createWatcher: (_rootPath, _options, callback) => {
        onChange = callback;
        return watcher;
      },
    });

    const rootPath = resolve("/tmp/divex-project");
    service.start(owner, rootPath);
    onChange?.("change", "lib/main.dart");
    onChange?.("change", "lib/app.dart");
    await vi.advanceTimersByTimeAsync(25);

    expect(owner.send).toHaveBeenCalledTimes(1);
    expect(owner.send).toHaveBeenCalledWith(
      "project:changed",
      expect.objectContaining({
        rootPath,
        paths: ["lib/app.dart", "lib/main.dart"],
      }),
    );
    service.stop(owner);
    expect(watcher.close).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
