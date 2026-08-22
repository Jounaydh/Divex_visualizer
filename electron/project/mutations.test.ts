import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  createProjectEntry,
  duplicateProjectEntry,
  transferProjectEntry,
} = require("./mutations.cjs") as {
  createProjectEntry: (args: Record<string, string>) => Promise<{
    conflict: boolean;
    entryPath?: string;
    suggestedName?: string;
  }>;
  duplicateProjectEntry: (args: Record<string, string>) => Promise<{
    entryPath: string;
  }>;
  transferProjectEntry: (args: Record<string, string>) => Promise<{
    conflict?: boolean;
    unchanged?: boolean;
    entryPath?: string;
    suggestedName?: string;
  }>;
};

const temporaryProjects: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryProjects.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function createFixture() {
  const rootPath = await mkdtemp(join(tmpdir(), "divex-mutations-"));
  temporaryProjects.push(rootPath);
  await mkdir(join(rootPath, "src"));
  await mkdir(join(rootPath, "tests"));
  await writeFile(join(rootPath, "src", "main.py"), "print('hello')\n");
  return rootPath;
}

describe("project mutations", () => {
  it("creates files and folders inside the selected project directory", async () => {
    const rootPath = await createFixture();
    const folder = await createProjectEntry({
      rootPath,
      parentPath: "src",
      entryKind: "folder",
      name: "services",
    });
    const file = await createProjectEntry({
      rootPath,
      parentPath: "src/services",
      entryKind: "file",
      name: "api.py",
    });
    expect(folder.entryPath).toBe("src/services");
    expect(file.entryPath).toBe("src/services/api.py");
    expect((await stat(join(rootPath, "src", "services"))).isDirectory()).toBe(
      true,
    );
    expect(await readFile(join(rootPath, "src", "services", "api.py"), "utf8")).toBe("");
  });

  it("returns a safe suggestion instead of overwriting a conflicting entry", async () => {
    const rootPath = await createFixture();
    const result = await createProjectEntry({
      rootPath,
      parentPath: "src",
      entryKind: "file",
      name: "main.py",
    });
    expect(result).toMatchObject({
      conflict: true,
      suggestedName: "main 2.py",
    });
    expect(await readFile(join(rootPath, "src", "main.py"), "utf8")).toContain(
      "hello",
    );
  });

  it("duplicates with unique names and moves through a folder target", async () => {
    const rootPath = await createFixture();
    const duplicate = await duplicateProjectEntry({
      rootPath,
      sourcePath: "src/main.py",
      sourceKind: "file",
    });
    expect(duplicate.entryPath).toBe("src/main copy.py");

    const moved = await transferProjectEntry({
      rootPath,
      sourcePath: duplicate.entryPath,
      sourceKind: "file",
      targetPath: "tests",
      targetKind: "folder",
      mode: "move",
    });
    expect(moved.entryPath).toBe("tests/main copy.py");
    expect(await readFile(join(rootPath, "tests", "main copy.py"), "utf8")).toContain(
      "hello",
    );
  });

  it("blocks moves into descendants and reports destination conflicts", async () => {
    const rootPath = await createFixture();
    await mkdir(join(rootPath, "src", "nested"));
    await expect(
      transferProjectEntry({
        rootPath,
        sourcePath: "src",
        sourceKind: "folder",
        targetPath: "src/nested",
        targetKind: "folder",
        mode: "move",
      }),
    ).rejects.toThrow("inside itself");

    await writeFile(join(rootPath, "tests", "main.py"), "existing\n");
    const conflict = await transferProjectEntry({
      rootPath,
      sourcePath: "src/main.py",
      sourceKind: "file",
      targetPath: "tests",
      targetKind: "folder",
      mode: "move",
    });
    expect(conflict).toMatchObject({
      conflict: true,
      suggestedName: "main 2.py",
    });
  });

  it("duplicates complete folders and rejects paths outside the project", async () => {
    const rootPath = await createFixture();
    const duplicate = await duplicateProjectEntry({
      rootPath,
      sourcePath: "src",
      sourceKind: "folder",
    });
    expect(duplicate.entryPath).toBe("src copy");
    expect(await readFile(join(rootPath, "src copy", "main.py"), "utf8")).toContain(
      "hello",
    );

    await expect(
      createProjectEntry({
        rootPath,
        parentPath: "../outside",
        entryKind: "file",
        name: "escape.py",
      }),
    ).rejects.toThrow("outside the opened project");
  });
});
