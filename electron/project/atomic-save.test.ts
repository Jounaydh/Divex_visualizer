import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { atomicSaveProjectFile } = require("./atomic-save.cjs") as {
  atomicSaveProjectFile: (
    rootPath: string,
    filePath: string,
    content: string,
  ) => Promise<string>;
};

const temporaryProjects: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryProjects.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("atomic project saves", () => {
  it("replaces a file without leaving temporary save artifacts", async () => {
    const rootPath = await mkdtemp(join(tmpdir(), "divex-atomic-save-"));
    temporaryProjects.push(rootPath);
    await writeFile(join(rootPath, "main.py"), "before\n");

    await atomicSaveProjectFile(rootPath, "main.py", "after\n");

    expect(await readFile(join(rootPath, "main.py"), "utf8")).toBe("after\n");
    expect(await readdir(rootPath)).toEqual(["main.py"]);
  });

  it("rejects a save outside the opened project", async () => {
    const rootPath = await mkdtemp(join(tmpdir(), "divex-atomic-save-"));
    temporaryProjects.push(rootPath);
    await expect(
      atomicSaveProjectFile(rootPath, "../outside.py", "unsafe\n"),
    ).rejects.toThrow("outside the opened project");
  });
});
