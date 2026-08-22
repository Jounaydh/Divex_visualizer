const { execFile } = require("node:child_process");
const os = require("node:os");
const { promisify } = require("node:util");
const {
  parseWslUncPath,
  toWslUncPath,
} = require("../project/paths.cjs");

const execFileAsync = promisify(execFile);
const WSL_TIMEOUT_MS = 30_000;

function cleanWslOutput(value) {
  return String(value ?? "").replaceAll("\0", "").replace(/\r/g, "");
}

async function execWsl(args, options = {}) {
  const result = await execFileAsync("wsl.exe", args, {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: options.maxBuffer ?? 8 * 1024 * 1024,
    timeout: options.timeout ?? WSL_TIMEOUT_MS,
  });
  return {
    stdout: cleanWslOutput(result.stdout),
    stderr: cleanWslOutput(result.stderr),
  };
}

function parseDistributionList(output) {
  return cleanWslOutput(output)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((name) => ({
      name,
      system: name.toLowerCase().startsWith("docker-desktop"),
    }));
}

async function getWslStatus() {
  if (process.platform !== "win32") {
    return {
      success: true,
      output: "WSL is available only on Windows.",
      available: false,
      distributions: [],
    };
  }
  try {
    const [{ stdout: namesOutput }, { stdout: statusOutput }] = await Promise.all([
      execWsl(["--list", "--quiet"]),
      execWsl(["--status"]),
    ]);
    const distributions = parseDistributionList(namesOutput);
    const defaultMatch = cleanWslOutput(statusOutput).match(
      /^Default Distribution:\s*(.+)$/im,
    );
    const defaultDistribution = defaultMatch?.[1]?.trim();
    const userDistributions = distributions.filter((item) => !item.system);
    return {
      success: true,
      output:
        userDistributions.length > 0
          ? `${userDistributions.length} WSL distribution${userDistributions.length === 1 ? "" : "s"} available.`
          : "WSL is installed, but no user distribution was found.",
      available: userDistributions.length > 0,
      defaultDistribution,
      distributions,
    };
  } catch (error) {
    return {
      success: false,
      output:
        error?.code === "ENOENT"
          ? "WSL is not installed or wsl.exe is unavailable."
          : error?.message || "WSL status could not be read.",
      available: false,
      distributions: [],
    };
  }
}

async function getWslHome(distribution) {
  const status = await getWslStatus();
  const known = status.distributions.find((item) => item.name === distribution);
  if (!known || known.system) {
    throw new Error("Choose an installed user WSL distribution.");
  }
  const { stdout } = await execWsl([
    "--distribution",
    distribution,
    "--exec",
    "sh",
    "-lc",
    'printf %s "$HOME"',
  ]);
  const linuxPath = stdout.trim();
  if (!linuxPath.startsWith("/")) {
    throw new Error(`The home folder for ${distribution} could not be resolved.`);
  }
  return {
    distribution,
    linuxPath,
    windowsPath: toWslUncPath(distribution, linuxPath),
  };
}

function wslCommandForProject(rootPath, executable, args = [], cwdPath = rootPath) {
  const project = parseWslUncPath(rootPath);
  const cwd = parseWslUncPath(cwdPath);
  if (!project || !cwd || project.distribution !== cwd.distribution) {
    return null;
  }
  const commandArgs = [
    "--distribution",
    project.distribution,
    "--cd",
    cwd.linuxPath,
  ];
  if (executable) commandArgs.push("--exec", executable, ...args);
  return {
    executable: "wsl.exe",
    args: commandArgs,
    hostCwd: os.homedir(),
    displayCwd: cwd.linuxPath,
    distribution: project.distribution,
  };
}

async function runInWsl(rootPath, executable, args, options = {}) {
  const command = wslCommandForProject(
    rootPath,
    executable,
    args,
    options.cwdPath ?? rootPath,
  );
  if (!command) throw new Error("The project is not inside WSL.");
  return execWsl(command.args, options);
}

module.exports = {
  cleanWslOutput,
  execWsl,
  getWslHome,
  getWslStatus,
  parseDistributionList,
  runInWsl,
  wslCommandForProject,
};
