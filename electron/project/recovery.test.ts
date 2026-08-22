import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { clearRecovery, listRecoveries, writeRecovery } = require("./recovery.cjs") as {
  clearRecovery: (base: string, root: string, path: string) => Promise<void>;
  listRecoveries: (base: string, root: string) => Promise<Array<{
    filePath: string;
    content: string;
  }>>;
  writeRecovery: (base: string, args: {
    rootPath: string;
    filePath: string;
    content: string;
  }) => Promise<{ filePath: string; content: string }>;
};

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("editor recovery storage", () => {
  it("writes, updates, lists, and clears a project buffer", async () => {
    const base = await mkdtemp(join(tmpdir(), "divex-recovery-data-"));
    const rootPath = await mkdtemp(join(tmpdir(), "divex-recovery-project-"));
    temporaryDirectories.push(base, rootPath);

    await writeRecovery(base, {
      rootPath,
      filePath: "src/main.py",
      content: "first draft\n",
    });
    await writeRecovery(base, {
      rootPath,
      filePath: "src/main.py",
      content: "latest draft\n",
    });

    expect(await listRecoveries(base, rootPath)).toEqual([
      expect.objectContaining({
        filePath: "src/main.py",
        content: "latest draft\n",
      }),
    ]);
    await clearRecovery(base, rootPath, "src/main.py");
    expect(await listRecoveries(base, rootPath)).toEqual([]);
  });

  it("rejects traversal and oversized snapshots", async () => {
    const base = await mkdtemp(join(tmpdir(), "divex-recovery-data-"));
    const rootPath = await mkdtemp(join(tmpdir(), "divex-recovery-project-"));
    temporaryDirectories.push(base, rootPath);

    await expect(
      writeRecovery(base, {
        rootPath,
        filePath: "../outside.py",
        content: "unsafe",
      }),
    ).rejects.toThrow("outside the opened project");
    await expect(
      writeRecovery(base, {
        rootPath,
        filePath: "large.py",
        content: "x".repeat(4 * 1024 * 1024 + 1),
      }),
    ).rejects.toThrow("larger than 4 MB");
  });

  it("serializes overlapping writes and a following clear", async () => {
    const base = await mkdtemp(join(tmpdir(), "divex-recovery-data-"));
    const rootPath = await mkdtemp(join(tmpdir(), "divex-recovery-project-"));
    temporaryDirectories.push(base, rootPath);

    const first = writeRecovery(base, {
      rootPath,
      filePath: "main.py",
      content: "first\n",
    });
    const latest = writeRecovery(base, {
      rootPath,
      filePath: "main.py",
      content: "latest\n",
    });
    const clear = clearRecovery(base, rootPath, "main.py");
    await Promise.all([first, latest, clear]);

    expect(await listRecoveries(base, rootPath)).toEqual([]);
  });
});
