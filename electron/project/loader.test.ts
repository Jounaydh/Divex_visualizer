import { afterEach, describe, expect, it } from "vitest";
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { loadProject } = require("./loader.cjs") as {
  loadProject: (
    rootPath: string,
    onProgress?: (progress: {
      phase: "scanning" | "reading";
      completed: number;
      total: number;
      message: string;
    }) => void,
  ) => Promise<{
    files: Array<{ path: string; content: string }>;
    folders: string[];
    loadSummary: {
      totalFiles: number;
      cachedFiles: number;
      readFiles: number;
    };
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

async function createProject() {
  const rootPath = await mkdtemp(join(tmpdir(), "divex-loader-"));
  temporaryProjects.push(rootPath);
  await mkdir(join(rootPath, "lib"), { recursive: true });
  await mkdir(join(rootPath, "empty"), { recursive: true });
  await mkdir(join(rootPath, "node_modules", "ignored"), {
    recursive: true,
  });
  await writeFile(join(rootPath, "lib", "a.dart"), "void a() {}\n");
  await writeFile(join(rootPath, "lib", "b.dart"), "void b() {}\n");
  await writeFile(
    join(rootPath, "node_modules", "ignored", "hidden.dart"),
    "void hidden() {}\n",
  );
  return rootPath;
}

describe("project loader", () => {
  it("loads TypeScript and TSX source files", async () => {
    const rootPath = await mkdtemp(join(tmpdir(), "divex-typescript-loader-"));
    temporaryProjects.push(rootPath);
    await mkdir(join(rootPath, "src"));
    await writeFile(join(rootPath, "src", "main.ts"), "export const main = (): void => {};\n");
    await writeFile(join(rootPath, "src", "App.tsx"), "export const App = () => <main />;\n");
    const project = await loadProject(rootPath);
    expect(project.files.map((file) => file.path)).toEqual(["src/App.tsx", "src/main.ts"]);
  });

  it("scans metadata, ignores dependency folders, and reports progress", async () => {
    const rootPath = await createProject();
    const phases: string[] = [];
    const project = await loadProject(rootPath, (progress) => {
      phases.push(progress.phase);
    });

    expect(project.files.map((file) => file.path)).toEqual([
      "lib/a.dart",
      "lib/b.dart",
    ]);
    expect(project.folders).toEqual(expect.arrayContaining(["empty", "lib"]));
    expect(project.loadSummary).toMatchObject({
      totalFiles: 2,
      cachedFiles: 0,
      readFiles: 2,
    });
    expect(phases).toContain("scanning");
    expect(phases).toContain("reading");
  });

  it("reuses unchanged contents and rereads only changed files", async () => {
    const rootPath = await createProject();
    await loadProject(rootPath);

    const cached = await loadProject(rootPath);
    expect(cached.loadSummary).toMatchObject({
      cachedFiles: 2,
      readFiles: 0,
    });

    await writeFile(
      join(rootPath, "lib", "a.dart"),
      "void aChanged() { print('changed'); }\n",
    );
    const changed = await loadProject(rootPath);
    expect(changed.loadSummary).toMatchObject({
      cachedFiles: 1,
      readFiles: 1,
    });
    expect(
      changed.files.find((file) => file.path === "lib/a.dart")?.content,
    ).toContain("aChanged");
  });
});
