const fs = require("node:fs/promises");
const path = require("node:path");
const { projectEnvironment } = require("./paths.cjs");

const CUSTOM_TASK_FILE = "divex.tasks.json";
const MAX_CUSTOM_TASKS = 64;
const TASK_GROUPS = new Set(["build", "test", "run", "other"]);
const PROBLEM_MATCHERS = new Set(["auto", "dart", "python", "typescript", "java", "gcc"]);

async function pathExists(candidatePath) {
  try {
    await fs.access(candidatePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function readJsonIfPresent(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function executableForEnvironment(rootPath, nativeWindows, posix) {
  const environment = projectEnvironment(rootPath);
  if (environment.kind === "wsl") return posix;
  return process.platform === "win32" ? nativeWindows : posix;
}

function taskProblemMatcher(task) {
  if (task.id.startsWith("flutter:") || task.id.startsWith("dart:")) return "dart";
  if (task.id.startsWith("python:")) return "python";
  if (task.id.startsWith("maven:") || task.id.startsWith("gradle:")) return "java";
  if (task.id.startsWith("npm:") || task.id.startsWith("typescript:")) return "typescript";
  if (task.id.startsWith("make:")) return "gcc";
  return "auto";
}

function commandDetail(task) {
  return [task.executable, ...(task.args ?? [])].join(" ");
}

function validateCustomTask(candidate, index) {
  const position = `Custom task ${index + 1}`;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error(`${position} must be an object.`);
  }
  const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
  const label = typeof candidate.label === "string" ? candidate.label.trim() : "";
  const executable = typeof candidate.command === "string" ? candidate.command.trim() : "";
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(id)) {
    throw new Error(`${position} needs an id containing only letters, numbers, dots, dashes, or underscores.`);
  }
  if (!label || label.length > 120) throw new Error(`${position} needs a short label.`);
  if (!executable || executable.length > 512 || /[\r\n]/.test(executable)) {
    throw new Error(`${position} needs one executable in its command field.`);
  }
  const args = candidate.args ?? [];
  if (!Array.isArray(args) || args.length > 64 || args.some((value) => typeof value !== "string" || value.length > 4096 || /[\r\n]/.test(value))) {
    throw new Error(`${position} has an invalid argument list.`);
  }
  const group = candidate.group ?? "other";
  if (!TASK_GROUPS.has(group)) throw new Error(`${position} has an invalid group.`);
  const problemMatcher = candidate.problemMatcher ?? "auto";
  if (!PROBLEM_MATCHERS.has(problemMatcher)) throw new Error(`${position} has an invalid problem matcher.`);
  const cwd = candidate.cwd ?? "";
  if (typeof cwd !== "string" || path.isAbsolute(cwd) || cwd.split(/[\\/]+/).includes("..")) {
    throw new Error(`${position} has a working directory outside the project.`);
  }
  return {
    id: `custom:${id}`,
    label,
    group,
    executable,
    args,
    cwd: cwd || undefined,
    source: "custom",
    detail: commandDetail({ executable, args }),
    problemMatcher,
  };
}

async function readCustomProjectTasks(rootPath) {
  const configuration = await readJsonIfPresent(path.join(rootPath, CUSTOM_TASK_FILE));
  if (!configuration) return [];
  if (configuration.version !== 1 || !Array.isArray(configuration.tasks)) {
    throw new Error(`${CUSTOM_TASK_FILE} must contain version 1 and a tasks array.`);
  }
  if (configuration.tasks.length > MAX_CUSTOM_TASKS) {
    throw new Error(`${CUSTOM_TASK_FILE} can define at most ${MAX_CUSTOM_TASKS} tasks.`);
  }
  const tasks = configuration.tasks.map(validateCustomTask);
  const ids = new Set();
  for (const task of tasks) {
    if (ids.has(task.id)) throw new Error(`${CUSTOM_TASK_FILE} contains duplicate task id ${task.id.slice(7)}.`);
    ids.add(task.id);
  }
  return tasks;
}

async function detectProjectTasks(rootPath) {
  const tasks = [];
  const environment = projectEnvironment(rootPath);
  const packageJson = await readJsonIfPresent(path.join(rootPath, "package.json"));
  if (packageJson?.scripts && typeof packageJson.scripts === "object") {
    Object.keys(packageJson.scripts)
      .sort()
      .forEach((scriptName) => {
        const normalizedName = scriptName.toLowerCase();
        const group =
          normalizedName === "build" || normalizedName.startsWith("build:")
            ? "build"
            : normalizedName === "test" || normalizedName.startsWith("test:")
              ? "test"
              : ["start", "dev", "serve"].includes(normalizedName)
                ? "run"
                : "other";
        tasks.push({
          id: `npm:${scriptName}`,
          label: `npm: ${scriptName}`,
          group,
          executable: "npm",
          args: ["run", scriptName],
        });
      });
  }

  if (await pathExists(path.join(rootPath, "tsconfig.json"))) {
    tasks.push({
      id: "typescript:check",
      label: "TypeScript: Check",
      group: "build",
      executable: "npx",
      args: ["--no-install", "tsc", "--noEmit"],
    });
  }

  if (await pathExists(path.join(rootPath, "pubspec.yaml"))) {
    const buildTarget =
      environment.kind === "wsl"
        ? "linux"
        : process.platform === "darwin"
          ? "macos"
          : process.platform === "win32"
            ? "windows"
            : "linux";
    tasks.push(
      { id: "flutter:pub-get", label: "Flutter: Pub Get", group: "other", executable: "flutter", args: ["pub", "get"] },
      { id: "flutter:analyze", label: "Flutter: Analyze", group: "other", executable: "flutter", args: ["analyze"] },
      { id: "flutter:test", label: "Flutter: Test", group: "test", executable: "flutter", args: ["test"] },
      { id: "flutter:run", label: "Flutter: Run", group: "run", executable: "flutter", args: ["run"] },
      { id: `flutter:build-${buildTarget}`, label: `Flutter: Build ${buildTarget}`, group: "build", executable: "flutter", args: ["build", buildTarget] },
    );
  }

  const pythonExecutable = executableForEnvironment(rootPath, "python", "python3");
  const hasPythonProject = (await Promise.all(
    ["pyproject.toml", "requirements.txt", "setup.py", "Pipfile"].map(
      (name) => pathExists(path.join(rootPath, name)),
    ),
  )).some(Boolean);
  const hasPythonTests = (await Promise.all(
    ["pytest.ini", "tox.ini", "tests"].map((name) =>
      pathExists(path.join(rootPath, name)),
    ),
  )).some(Boolean);
  if (hasPythonProject || hasPythonTests) {
    tasks.push({
      id: "python:check",
      label: "Python: Compile Check",
      group: "build",
      executable: pythonExecutable,
      args: ["-m", "compileall", "-q", "."],
    });
  }
  if (hasPythonTests) {
    tasks.push({
      id: "python:test",
      label: "Python: Run Tests",
      group: "test",
      executable: pythonExecutable,
      args: ["-m", "pytest"],
    });
  }

  if (await pathExists(path.join(rootPath, "pom.xml"))) {
    tasks.push(
      { id: "maven:package", label: "Maven: Package", group: "build", executable: "mvn", args: ["package"] },
      { id: "maven:test", label: "Maven: Test", group: "test", executable: "mvn", args: ["test"] },
      { id: "maven:clean", label: "Maven: Clean", group: "other", executable: "mvn", args: ["clean"] },
    );
  }

  const gradleWrapper = executableForEnvironment(rootPath, "gradlew.bat", "gradlew");
  const gradlePath = path.join(rootPath, gradleWrapper);
  if (
    (await pathExists(gradlePath)) ||
    (await pathExists(path.join(rootPath, "build.gradle")))
  ) {
    const executable = (await pathExists(gradlePath))
      ? environment.kind === "wsl"
        ? "./gradlew"
        : gradlePath
      : "gradle";
    tasks.push(
      { id: "gradle:build", label: "Gradle: Build", group: "build", executable, args: ["build"] },
      { id: "gradle:test", label: "Gradle: Test", group: "test", executable, args: ["test"] },
    );
  }

  if (await pathExists(path.join(rootPath, "Makefile"))) {
    tasks.push({ id: "make:default", label: "Make: Default", group: "build", executable: "make", args: [] });
  }
  const customTasks = await readCustomProjectTasks(rootPath);
  return [
    ...tasks.map((task) => ({
      ...task,
      source: "detected",
      detail: commandDetail(task),
      problemMatcher: taskProblemMatcher(task),
    })),
    ...customTasks,
  ];
}

function runnerForFile(rootPath, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const fileEnvironment = projectEnvironment(filePath);
  const executionPath =
    fileEnvironment.kind === "wsl" ? fileEnvironment.linuxPath : filePath;
  if (extension === ".dart") return { executable: "dart", args: ["run", executionPath] };
  if (extension === ".py" || extension === ".pyw") {
    return {
      executable: executableForEnvironment(rootPath, "python", "python3"),
      args: [executionPath],
    };
  }
  if ([".js", ".mjs", ".cjs"].includes(extension)) {
    return { executable: "node", args: [executionPath] };
  }
  if ([".ts", ".mts", ".cts"].includes(extension)) {
    return {
      executable: "node",
      args: ["--experimental-strip-types", executionPath],
    };
  }
  if (extension === ".java") return { executable: "java", args: [executionPath] };
  return null;
}

module.exports = {
  detectProjectTasks,
  readCustomProjectTasks,
  pathExists,
  readJsonIfPresent,
  runnerForFile,
};
