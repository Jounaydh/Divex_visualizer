const { execFile } = require("node:child_process");
const { EventEmitter } = require("node:events");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");
const { createDebugService } = require("../electron/debug/service.cjs");
const { atomicSaveProjectFile } = require("../electron/project/atomic-save.cjs");
const { loadProject } = require("../electron/project/loader.cjs");
const { detectProjectTasks } = require("../electron/project/tasks.cjs");
const { createProjectWatcherService } = require("../electron/project/watcher.cjs");
const { getGitStatus } = require("../electron/source-control/git.cjs");
const { createTerminalService } = require("../electron/terminal/service.cjs");

const execFileAsync = promisify(execFile);
const TEMP_PREFIX = "divex-windows-smoke-";

class SmokeOwner extends EventEmitter {
  constructor() {
    super();
    this.events = [];
  }

  isDestroyed() {
    return false;
  }

  send(channel, payload) {
    const event = { channel, payload };
    this.events.push(event);
    this.emit(channel, payload);
  }

  capture(event) {
    this.events.push(event);
    this.emit("captured", event);
  }
}

function waitForCaptured(owner, predicate, message, timeoutMs = 15_000) {
  const existing = owner.events.find(predicate);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const onCaptured = (event) => {
      if (!predicate(event)) return;
      cleanup();
      resolve(event);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(message));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      owner.removeListener("captured", onCaptured);
    };
    owner.on("captured", onCaptured);
  });
}

function waitForChannel(owner, channel, timeoutMs = 5_000) {
  return Promise.race([
    new Promise((resolve) => owner.once(channel, resolve)),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`Windows project watching did not report ${channel}.`)),
        timeoutMs,
      ),
    ),
  ]);
}

async function initializeDisposableRepository(rootPath) {
  await execFileAsync("git", ["init", "--quiet"], { cwd: rootPath });
  await execFileAsync("git", ["add", "."], { cwd: rootPath });
  await execFileAsync(
    "git",
    [
      "-c",
      "user.name=Divex Smoke Test",
      "-c",
      "user.email=smoke@divex.invalid",
      "commit",
      "--quiet",
      "-m",
      "Initial smoke fixture",
    ],
    { cwd: rootPath },
  );
}

async function verifyDebugger(rootPath) {
  const owner = new SmokeOwner();
  const service = createDebugService({
    onEvent: (eventOwner, event) => eventOwner.capture(event),
  });
  let sessionId;
  try {
    const started = await service.start(
      {
        rootPath,
        filePath: "main.py",
        breakpoints: [{ filePath: "main.py", lines: [2] }],
      },
      owner,
    );
    if (!started.success) throw new Error(started.output);
    sessionId = started.session.id;
    const stopped = await waitForCaptured(
      owner,
      (event) => event.type === "stopped" && event.sessionId === sessionId,
      "Python debugging did not stop at the requested breakpoint.",
    );
    const stack = await service.stack(
      { sessionId, threadId: stopped.threadId },
      owner,
    );
    if (!stack.success || !stack.frames?.length) {
      throw new Error(stack.output || "The debugger returned no call stack.");
    }
    const scopes = await service.scopes(
      { sessionId, frameId: stack.frames[0].id },
      owner,
    );
    if (!scopes.success || !scopes.scopes?.length) {
      throw new Error(scopes.output || "The debugger returned no scopes.");
    }
    const localScope = scopes.scopes.find(
      (scope) => scope.variablesReference > 0 && /local|global/i.test(scope.name),
    ) ?? scopes.scopes.find((scope) => scope.variablesReference > 0);
    if (!localScope) throw new Error("The debugger returned no inspectable scope.");
    const variables = await service.variables(
      { sessionId, variablesReference: localScope.variablesReference },
      owner,
    );
    if (!variables.success || !variables.variables?.some((item) => item.name === "value")) {
      throw new Error(variables.output || "The debugger did not expose the local value variable.");
    }
    const terminated = waitForCaptured(
      owner,
      (event) => event.type === "terminated" && event.sessionId === sessionId,
      "Python debugging did not terminate after Continue.",
    );
    const continued = await service.control(
      { sessionId, action: "continue", threadId: stopped.threadId },
      owner,
    );
    if (!continued.success) throw new Error(continued.output);
    await terminated;
  } finally {
    if (sessionId) await service.disconnect(sessionId, owner).catch(() => {});
    service.closeOwnerSessions(owner);
  }
}

async function verifyTerminal(rootPath) {
  const owner = new SmokeOwner();
  const service = createTerminalService({
    onEvent: (eventOwner, event) => eventOwner.capture(event),
  });
  try {
    const result = service.create(
      {
        rootPath,
        executable: process.env.ComSpec || "cmd.exe",
        args: ["/d", "/s", "/c", "echo DIVEX_TERMINAL_OK"],
        title: "Windows terminal smoke",
        kind: "task",
        taskId: "smoke:terminal",
        problemMatcher: "auto",
      },
      owner,
    );
    if (!result.success) throw new Error(result.output);
    const sessionId = result.session.id;
    const exited = await waitForCaptured(
      owner,
      (event) => event.type === "exit" && event.sessionId === sessionId,
      "The integrated Windows terminal did not exit.",
    );
    const output = owner.events
      .filter((event) => event.type === "data" && event.sessionId === sessionId)
      .map((event) => event.data)
      .join("");
    if (exited.exitCode !== 0 || !output.includes("DIVEX_TERMINAL_OK")) {
      throw new Error("The integrated Windows terminal did not return the expected output.");
    }
  } finally {
    service.closeOwnerSessions(owner);
  }
}

async function main() {
  const repositoryRoot = path.resolve(__dirname, "..");
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), TEMP_PREFIX));
  const watcher = createProjectWatcherService({ debounceMs: 50 });
  const watcherOwner = new SmokeOwner();
  try {
    await Promise.all([
      fs.writeFile(
        path.join(tempRoot, "package.json"),
        `${JSON.stringify({ name: "divex-smoke", scripts: { test: "node --test" } }, null, 2)}\n`,
      ),
      fs.writeFile(path.join(tempRoot, "pyproject.toml"), "[project]\nname = 'divex-smoke'\n"),
      fs.writeFile(path.join(tempRoot, "main.py"), "value = 41\nvalue += 1\nprint(value)\n"),
    ]);
    await initializeDisposableRepository(tempRoot);

    const project = await loadProject(tempRoot);
    if (!project.files.some((file) => file.path === "main.py")) {
      throw new Error("The Windows project loader did not find the Python source file.");
    }
    const tasks = await detectProjectTasks(tempRoot);
    if (!tasks.some((task) => task.id === "npm:test") || !tasks.some((task) => task.id === "python:check")) {
      throw new Error("Windows task discovery did not detect the npm and Python tasks.");
    }
    const disposableGit = await getGitStatus(tempRoot);
    if (!disposableGit.success || !disposableGit.status?.isRepository) {
      throw new Error(`Windows Git integration failed: ${disposableGit.output}`);
    }
    const applicationGit = await getGitStatus(repositoryRoot);
    if (!applicationGit.success || applicationGit.status?.branch !== "agent/windows-compatibility") {
      throw new Error(`The application repository is not on the expected Windows branch: ${applicationGit.output}`);
    }

    watcher.start(watcherOwner, tempRoot);
    const changed = waitForChannel(watcherOwner, "project:changed");
    await atomicSaveProjectFile(
      tempRoot,
      "main.py",
      "value = 41\nvalue += 1\nprint(value)\n# atomically saved\n",
    );
    await changed;
    const saved = await fs.readFile(path.join(tempRoot, "main.py"), "utf8");
    if (!saved.includes("atomically saved")) {
      throw new Error("Atomic Windows editing did not preserve the requested content.");
    }
    const artifacts = (await fs.readdir(tempRoot)).filter((name) => name.includes(".divex-save-"));
    if (artifacts.length) throw new Error("Atomic Windows editing left temporary artifacts behind.");

    await verifyTerminal(tempRoot);
    await verifyDebugger(tempRoot);
    process.stdout.write(
      "Verified Windows loading, task discovery, Git, atomic editing, watching, integrated terminal, and Python debugging.\n",
    );
  } finally {
    watcher.stop(watcherOwner);
    const safeParent = `${path.resolve(os.tmpdir())}${path.sep}`;
    const resolvedTemp = path.resolve(tempRoot);
    if (resolvedTemp.startsWith(safeParent) && path.basename(resolvedTemp).startsWith(TEMP_PREFIX)) {
      await fs.rm(resolvedTemp, { recursive: true, force: true, maxRetries: 3 });
    }
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    process.stderr.write(`${error?.stack || error}\n`);
    process.exit(1);
  },
);
