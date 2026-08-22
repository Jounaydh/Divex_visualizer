const fs = require("node:fs/promises");
const path = require("node:path");
const { parseWslUncPath } = require("../project/paths.cjs");
const { resolveWindowsCommand } = require("../platform/tool-runner.cjs");

async function firstExisting(paths) {
  for (const candidate of paths.filter(Boolean)) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Continue through the known installation locations.
    }
  }
  return null;
}

async function windowsCommand(command) {
  try {
    return await resolveWindowsCommand(command);
  } catch {
    return null;
  }
}

async function listWindowsProfiles() {
  const [pwsh, powershell, commandPrompt, gitBash] = await Promise.all([
    windowsCommand("pwsh.exe"),
    windowsCommand("powershell.exe"),
    windowsCommand("cmd.exe"),
    firstExisting([
      process.env.ProgramFiles && path.join(process.env.ProgramFiles, "Git", "bin", "bash.exe"),
      process.env["ProgramFiles(x86)"] && path.join(process.env["ProgramFiles(x86)"], "Git", "bin", "bash.exe"),
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Programs", "Git", "bin", "bash.exe"),
    ]),
  ]);
  return [
    pwsh && {
      id: "powershell-core",
      label: "PowerShell",
      description: "Modern PowerShell",
      kind: "powershell",
      executable: pwsh,
      args: ["-NoLogo"],
    },
    powershell && {
      id: "windows-powershell",
      label: "Windows PowerShell",
      description: "Built-in Windows shell",
      kind: "powershell",
      executable: powershell,
      args: ["-NoLogo"],
    },
    commandPrompt && {
      id: "command-prompt",
      label: "Command Prompt",
      description: "Windows command shell",
      kind: "cmd",
      executable: commandPrompt,
      args: [],
    },
    gitBash && {
      id: "git-bash",
      label: "Git Bash",
      description: "Bash installed with Git for Windows",
      kind: "bash",
      executable: gitBash,
      args: ["--login", "-i"],
    },
  ].filter(Boolean);
}

async function listTerminalProfiles(rootPath) {
  const wsl = parseWslUncPath(rootPath);
  if (wsl) {
    return [
      {
        id: "wsl-default",
        label: `${wsl.distribution} (WSL)`,
        description: "Default shell for this Linux project",
        kind: "wsl",
        executable: undefined,
        args: [],
      },
      {
        id: "wsl-bash",
        label: "Bash (WSL)",
        description: `Login shell in ${wsl.distribution}`,
        kind: "wsl",
        executable: "bash",
        args: ["-l"],
      },
    ];
  }
  if (process.platform === "win32") return listWindowsProfiles();
  if (process.platform === "darwin") {
    return [
      { id: "zsh", label: "zsh", description: "macOS default shell", kind: "zsh", executable: "/bin/zsh", args: ["-l"] },
      { id: "bash", label: "Bash", description: "Bash login shell", kind: "bash", executable: "/bin/bash", args: ["-l"] },
    ];
  }
  return [
    { id: "bash", label: "Bash", description: "Bash login shell", kind: "bash", executable: "/bin/bash", args: ["-l"] },
    { id: "sh", label: "sh", description: "POSIX shell", kind: "sh", executable: "/bin/sh", args: [] },
  ];
}

async function resolveTerminalProfile(rootPath, profileId) {
  const profiles = await listTerminalProfiles(rootPath);
  const profile = profiles.find((candidate) => candidate.id === profileId) ?? profiles[0];
  if (!profile) throw new Error("No supported terminal profile is available.");
  return profile;
}

function publicTerminalProfile(profile) {
  const { id, label, description, kind } = profile;
  return { id, label, description, kind };
}

module.exports = {
  listTerminalProfiles,
  publicTerminalProfile,
  resolveTerminalProfile,
};
