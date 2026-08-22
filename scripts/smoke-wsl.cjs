const { EventEmitter } = require("node:events");
const fs = require("node:fs/promises");
const path = require("node:path");
const { loadProject } = require("../electron/project/loader.cjs");
const {
  atomicSaveProjectFile,
} = require("../electron/project/atomic-save.cjs");
const { toWslUncPath } = require("../electron/project/paths.cjs");
const { detectProjectTasks } = require("../electron/project/tasks.cjs");
const { getGitStatus } = require("../electron/source-control/git.cjs");
const {
  createProjectWatcherService,
} = require("../electron/project/watcher.cjs");
const {
  execWsl,
  getWslStatus,
  runInWsl,
} = require("../electron/platform/wsl.cjs");

class SmokeOwner extends EventEmitter {
  constructor() {
    super();
    this.events = [];
  }

  isDestroyed() {
    return false;
  }

  send(channel, payload) {
    this.events.push({ channel, payload });
    this.emit(channel, payload);
  }
}

async function waitForProjectChange(owner, timeoutMs = 4_000) {
  return Promise.race([
    new Promise((resolve) => owner.once("project:changed", resolve)),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("WSL project watching did not report a saved file.")),
        timeoutMs,
      ),
    ),
  ]);
}

async function main() {
  const status = await getWslStatus();
  if (!status.available) throw new Error(status.output);
  const distribution =
    status.defaultDistribution ??
    status.distributions.find((item) => !item.system)?.name;
  if (!distribution) throw new Error("No user WSL distribution is available.");

  const { stdout } = await execWsl([
    "--distribution",
    distribution,
    "--exec",
    "mktemp",
    "-d",
    "/tmp/divex-wsl-smoke.XXXXXX",
  ]);
  const linuxRoot = stdout.trim();
  if (!/^\/tmp\/divex-wsl-smoke\.[A-Za-z0-9]+$/.test(linuxRoot)) {
    throw new Error("WSL returned an unsafe temporary path.");
  }
  const windowsRoot = toWslUncPath(distribution, linuxRoot);
  const watcher = createProjectWatcherService({
    debounceMs: 50,
    wslPollIntervalMs: 100,
  });
  const owner = new SmokeOwner();

  try {
    await fs.mkdir(path.join(windowsRoot, "tests"));
    await Promise.all([
      fs.writeFile(
        path.join(windowsRoot, "pyproject.toml"),
        "[project]\nname = 'divex-wsl-smoke'\n",
      ),
      fs.writeFile(
        path.join(windowsRoot, "main.py"),
        "from tests.test_app import answer\n\nprint(answer())\n",
      ),
      fs.writeFile(
        path.join(windowsRoot, "tests", "test_app.py"),
        "def answer():\n    return 42\n",
      ),
    ]);

    const project = await loadProject(windowsRoot);
    if (project.environment?.kind !== "wsl" || project.files.length !== 3) {
      throw new Error("The WSL project was not loaded with the expected metadata.");
    }
    const tasks = await detectProjectTasks(windowsRoot);
    if (!tasks.some((task) => task.id === "python:test")) {
      throw new Error("Python test discovery did not work for the WSL project.");
    }
    await runInWsl(windowsRoot, "git", ["init", "--quiet"]);
    const git = await getGitStatus(windowsRoot);
    if (!git.success || !git.status?.isRepository) {
      throw new Error(`Linux Git integration failed: ${git.output}`);
    }

    watcher.start(owner, windowsRoot);
    await new Promise((resolve) => setTimeout(resolve, 250));
    const changed = waitForProjectChange(owner);
    await atomicSaveProjectFile(
      windowsRoot,
      "main.py",
      "from tests.test_app import answer\n\nprint(answer())\n# atomically saved\n",
    );
    await changed;
    const savedContent = await fs.readFile(
      path.join(windowsRoot, "main.py"),
      "utf8",
    );
    if (!savedContent.includes("atomically saved")) {
      throw new Error("Atomic WSL saving did not preserve the requested content.");
    }
    const saveArtifacts = (await fs.readdir(windowsRoot)).filter((name) =>
      name.includes(".divex-save-"),
    );
    if (saveArtifacts.length > 0) {
      throw new Error("Atomic WSL saving left temporary artifacts behind.");
    }
    process.stdout.write(
      `Verified WSL loading, Python tasks, Linux Git, atomic editing, and watching in ${distribution}.\n`,
    );
  } finally {
    watcher.stop(owner);
    await execWsl([
      "--distribution",
      distribution,
      "--exec",
      "rm",
      "-rf",
      "--",
      linuxRoot,
    ]);
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 1;
});
