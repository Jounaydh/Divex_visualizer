import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { detectProjectTasks, readCustomProjectTasks, runnerForFile } = require("./tasks.cjs") as {
  detectProjectTasks: (rootPath: string) => Promise<Array<{
    id: string;
    executable: string;
    args: string[];
  }>>;
  readCustomProjectTasks: (rootPath: string) => Promise<Array<{
    id: string;
    executable: string;
    args: string[];
    cwd?: string;
    problemMatcher: string;
  }>>;
  runnerForFile: (
    rootPath: string,
    filePath: string,
  ) => { executable: string; args: string[] } | null;
};

const temporaryProjects: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryProjects.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("project tasks", () => {
  it("discovers Python checks and pytest", async () => {
    const rootPath = await mkdtemp(join(tmpdir(), "divex-python-tasks-"));
    temporaryProjects.push(rootPath);
    await mkdir(join(rootPath, "tests"));
    await writeFile(join(rootPath, "pyproject.toml"), "[project]\nname='demo'\n");
    const tasks = await detectProjectTasks(rootPath);
    expect(tasks.map((task) => task.id)).toEqual(
      expect.arrayContaining(["python:check", "python:test"]),
    );
  });

  it("uses Linux executables and paths for WSL Python files", () => {
    expect(
      runnerForFile(
        "\\\\wsl.localhost\\Ubuntu\\home\\dev\\app",
        "\\\\wsl.localhost\\Ubuntu\\home\\dev\\app\\main.py",
      ),
    ).toEqual({ executable: "python3", args: ["/home/dev/app/main.py"] });
  });

  it("discovers TypeScript checks and runs erasable TypeScript through Node", async () => {
    const rootPath = await mkdtemp(join(tmpdir(), "divex-typescript-tasks-"));
    temporaryProjects.push(rootPath);
    await writeFile(join(rootPath, "tsconfig.json"), "{}\n");
    const tasks = await detectProjectTasks(rootPath);
    expect(tasks.map((task) => task.id)).toContain("typescript:check");
    expect(runnerForFile(rootPath, join(rootPath, "src", "main.ts"))).toEqual({
      executable: "node",
      args: ["--experimental-strip-types", join(rootPath, "src", "main.ts")],
    });
  });

  it("loads validated custom tasks without accepting shell command strings", async () => {
    const rootPath = await mkdtemp(join(tmpdir(), "divex-custom-tasks-"));
    temporaryProjects.push(rootPath);
    await writeFile(join(rootPath, "divex.tasks.json"), JSON.stringify({
      version: 1,
      tasks: [{
        id: "quality",
        label: "Quality checks",
        group: "test",
        command: "python",
        args: ["-m", "pytest"],
        cwd: "tests",
        problemMatcher: "python",
      }],
    }));
    expect(await readCustomProjectTasks(rootPath)).toEqual([
      expect.objectContaining({
        id: "custom:quality",
        executable: "python",
        args: ["-m", "pytest"],
        cwd: "tests",
        problemMatcher: "python",
      }),
    ]);
  });

  it("rejects custom task working directories outside the project", async () => {
    const rootPath = await mkdtemp(join(tmpdir(), "divex-invalid-task-"));
    temporaryProjects.push(rootPath);
    await writeFile(join(rootPath, "divex.tasks.json"), JSON.stringify({
      version: 1,
      tasks: [{ id: "bad", label: "Bad", command: "node", cwd: "../outside" }],
    }));
    await expect(readCustomProjectTasks(rootPath)).rejects.toThrow("outside the project");
  });
});
