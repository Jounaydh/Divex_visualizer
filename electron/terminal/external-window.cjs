const { execFile, spawn } = require("node:child_process");
const { promisify } = require("node:util");
const { wslCommandForProject } = require("../platform/wsl.cjs");

const execFileAsync = promisify(execFile);

function quotePosixArgument(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function terminalCommand(executable, args) {
  if (process.platform === "win32") {
    return [executable, ...args]
      .map((value) => `"${String(value).replaceAll('"', '""')}"`)
      .join(" ");
  }
  return [executable, ...args].map(quotePosixArgument).join(" ");
}

function quotePowerShellLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function openTerminalWindow(directory, command, profile) {
  const wsl = wslCommandForProject(
    directory,
    command?.executable ?? profile?.executable,
    command?.args ?? profile?.args ?? [],
    directory,
  );
  if (wsl) {
    await execFileAsync("cmd.exe", [
      "/d",
      "/c",
      "start",
      "",
      wsl.executable,
      ...wsl.args,
    ], { windowsHide: true });
    return;
  }

  const commandLine = command
    ? terminalCommand(command.executable, command.args ?? [])
    : "";
  if (!commandLine) {
    if (process.platform === "darwin") {
      await execFileAsync("open", ["-a", "Terminal", directory]);
    } else if (process.platform === "win32") {
      if (profile?.executable) {
        await execFileAsync("cmd.exe", [
          "/d", "/c", "start", "", profile.executable, ...(profile.args ?? []),
        ], { cwd: directory, windowsHide: true });
      } else {
        await execFileAsync("cmd.exe", [
          "/c", "start", "", "cmd.exe", "/K", "cd", "/d", directory,
        ]);
      }
    } else {
      const terminal = spawn("x-terminal-emulator", ["--working-directory", directory], {
        detached: true,
        stdio: "ignore",
      });
      terminal.unref();
    }
    return;
  }

  if (process.platform === "darwin") {
    const shellCommand = `cd ${quotePosixArgument(directory)} && ${commandLine}`;
    const appleScriptCommand = shellCommand.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
    await execFileAsync("osascript", [
      "-e",
      `tell application "Terminal" to do script "${appleScriptCommand}"`,
    ]);
  } else if (process.platform === "win32") {
    if (profile?.kind === "powershell" && profile.executable) {
      const invocation = `& ${quotePowerShellLiteral(command.executable)} ${(command.args ?? []).map(quotePowerShellLiteral).join(" ")}`.trim();
      await execFileAsync("cmd.exe", [
        "/d", "/c", "start", "", profile.executable, ...(profile.args ?? []), "-NoExit", "-Command", invocation,
      ], { cwd: directory, windowsHide: true });
    } else if (profile?.kind === "bash" && profile.executable) {
      const posixCommand = [command.executable, ...(command.args ?? [])].map(quotePosixArgument).join(" ");
      await execFileAsync("cmd.exe", [
        "/d", "/c", "start", "", profile.executable, "-lc", `${posixCommand}; exec bash -l`,
      ], { cwd: directory, windowsHide: true });
    } else {
      const executable = profile?.kind === "cmd" && profile.executable ? profile.executable : "cmd.exe";
      await execFileAsync("cmd.exe", [
        "/c", "start", "", executable, "/K", `cd /d "${directory}" && ${commandLine}`,
      ]);
    }
  } else {
    const shellCommand = `cd ${quotePosixArgument(directory)} && ${commandLine}`;
    const terminal = spawn("x-terminal-emulator", ["-e", "bash", "-lc", shellCommand], {
      detached: true,
      stdio: "ignore",
    });
    terminal.unref();
  }
}

module.exports = { openTerminalWindow, quotePowerShellLiteral, terminalCommand };
