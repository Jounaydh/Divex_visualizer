import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);
const {
  getGitDiff,
  getGitStatus,
  mutatePath,
  parsePorcelainStatus,
  validateRelativePath,
} = require("./git-service.cjs") as {
  getGitDiff: (
    rootPath: string,
    filePath: string,
    staged: boolean,
  ) => Promise<{ success: boolean; content?: string }>;
  getGitStatus: (rootPath: string) => Promise<{
    success: boolean;
    status: {
      isRepository: boolean;
      entries: Array<{
        path: string;
        staged: boolean;
        unstaged: boolean;
      }>;
    };
  }>;
  mutatePath: (
    rootPath: string,
    filePath: string,
    action: "stage" | "unstage",
  ) => Promise<{ success: boolean }>;
  parsePorcelainStatus: (output: string) => Array<{
    path: string;
    originalPath?: string;
    staged: boolean;
    unstaged: boolean;
    untracked: boolean;
  }>;
  validateRelativePath: (rootPath: string, filePath: string) => string;
};

const temporaryRepositories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRepositories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function createRepository() {
  const rootPath = await mkdtemp(join(tmpdir(), "divex-git-"));
  temporaryRepositories.push(rootPath);
  await execFileAsync("git", ["init", "--quiet"], { cwd: rootPath });
  await execFileAsync("git", ["config", "user.name", "Divex Test"], {
    cwd: rootPath,
  });
  await execFileAsync("git", ["config", "user.email", "divex@example.test"], {
    cwd: rootPath,
  });
  await writeFile(join(rootPath, "main.dart"), "void main() {}\n");
  await execFileAsync("git", ["add", "main.dart"], { cwd: rootPath });
  await execFileAsync("git", ["commit", "--quiet", "-m", "Initial"], {
    cwd: rootPath,
  });
  return rootPath;
}

describe("Git service", () => {
  it("parses staged, working, untracked, and renamed records", () => {
    expect(
      parsePorcelainStatus(
        "M  staged.dart\0 M working.dart\0?? new.dart\0R  after.dart\0before.dart\0",
      ),
    ).toEqual([
      expect.objectContaining({
        path: "after.dart",
        originalPath: "before.dart",
        staged: true,
      }),
      expect.objectContaining({
        path: "new.dart",
        untracked: true,
      }),
      expect.objectContaining({
        path: "staged.dart",
        staged: true,
        unstaged: false,
      }),
      expect.objectContaining({
        path: "working.dart",
        staged: false,
        unstaged: true,
      }),
    ]);
  });

  it("rejects paths outside the opened project", () => {
    expect(() => validateRelativePath("/tmp/project", "../secret")).toThrow(
      "outside",
    );
    expect(() => validateRelativePath("/tmp/project", "/tmp/secret")).toThrow(
      "project file",
    );
  });

  it("reads, stages, and unstages repository changes", async () => {
    const rootPath = await createRepository();
    await writeFile(
      join(rootPath, "main.dart"),
      "void main() {\n  print('Divex');\n}\n",
    );

    const working = await getGitStatus(rootPath);
    expect(working).toMatchObject({
      success: true,
      status: { isRepository: true },
    });
    expect(working.status.entries[0]).toMatchObject({
      path: "main.dart",
      staged: false,
      unstaged: true,
    });

    const diff = await getGitDiff(rootPath, "main.dart", false);
    expect(diff.content).toContain("+  print('Divex');");

    expect(await mutatePath(rootPath, "main.dart", "stage")).toMatchObject({
      success: true,
    });
    expect((await getGitStatus(rootPath)).status.entries[0]).toMatchObject({
      staged: true,
      unstaged: false,
    });

    expect(await mutatePath(rootPath, "main.dart", "unstage")).toMatchObject({
      success: true,
    });
    expect((await getGitStatus(rootPath)).status.entries[0]).toMatchObject({
      staged: false,
      unstaged: true,
    });
  });
});
