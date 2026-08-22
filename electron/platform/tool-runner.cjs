// Native SDK command resolution, including Windows .cmd/.bat launchers.
const { execFile } = require("node:child_process");
const path = require("node:path");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

function commandNotFound(command, cause) {
  const error = new Error(`The ${command} command was not found.`);
  error.code = "ENOENT";
  error.cause = cause;
  return error;
}

async function resolveWindowsCommand(command) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync("where.exe", [command], {
      encoding: "utf8",
      windowsHide: true,
    }));
  } catch (error) {
    throw commandNotFound(command, error);
  }

  const candidates = stdout
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
  const executable = candidates.find(
    (candidate) => path.extname(candidate).toLowerCase() === ".exe",
  );
  const batchFile = candidates.find((candidate) =>
    [".bat", ".cmd"].includes(path.extname(candidate).toLowerCase()),
  );
  const resolved = executable ?? batchFile;
  if (!resolved) throw commandNotFound(command);
  return resolved;
}

function quoteBatchArgument(value) {
  // SDK arguments passed by Divex are fixed tokens. Keeping this deliberately
  // strict prevents a project path from ever becoming shell input.
  if (!/^[A-Za-z0-9._:=/\\-]+$/.test(value)) {
    throw new Error(`Unsafe command argument: ${value}`);
  }
  return `"${value}"`;
}

async function runTool(command, args, options = {}) {
  const execOptions = {
    ...options,
    encoding: "utf8",
    windowsHide: true,
  };

  if (process.platform !== "win32") {
    return execFileAsync(command, args, execOptions);
  }

  const resolvedCommand = await resolveWindowsCommand(command);
  const extension = path.extname(resolvedCommand).toLowerCase();
  if (extension !== ".bat" && extension !== ".cmd") {
    return execFileAsync(resolvedCommand, args, execOptions);
  }

  if (/[\r\n"]/.test(resolvedCommand)) {
    throw new Error(`Unsafe command path: ${resolvedCommand}`);
  }
  const batchInvocation = [
    `"${resolvedCommand}"`,
    ...args.map(quoteBatchArgument),
  ].join(" ");
  // cmd.exe /s preserves the inner executable quotes when the complete
  // command is wrapped in a second pair of quotes.
  const commandLine = `"${batchInvocation}"`;

  return execFileAsync(
    process.env.ComSpec || "cmd.exe",
    ["/d", "/s", "/c", commandLine],
    { ...execOptions, windowsVerbatimArguments: true },
  );
}

module.exports = {
  resolveWindowsCommand,
  runTool,
};
