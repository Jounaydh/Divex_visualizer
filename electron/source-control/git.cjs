const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const { promisify } = require("node:util");
const {
  isContainedPath,
  parseWslUncPath,
  validateProjectRoot,
} = require("../project/paths.cjs");
const { runInWsl } = require("../platform/wsl.cjs");

const execFileAsync = promisify(execFile);
const GIT_BUFFER_BYTES = 16 * 1024 * 1024;
const MAX_DIFF_BYTES = 2 * 1024 * 1024;

function gitError(error, fallback) {
  const stdout = typeof error?.stdout === "string" ? error.stdout.trim() : "";
  const stderr = typeof error?.stderr === "string" ? error.stderr.trim() : "";
  const output = [stdout, stderr].filter(Boolean).join("\n");
  return {
    success: false,
    output:
      error?.code === "ENOENT"
        ? "Git is not installed or is not available on PATH."
        : output || error?.message || fallback,
  };
}

function validateRootPath(rootPath) {
  return validateProjectRoot(
    rootPath,
    "Open a project folder before using Git.",
  );
}

function validateRelativePath(rootPath, relativePath) {
  if (
    typeof relativePath !== "string" ||
    relativePath.length === 0 ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error("Choose a project file before using this Git action.");
  }
  const resolvedPath = path.resolve(rootPath, relativePath);
  if (!isContainedPath(rootPath, resolvedPath)) {
    throw new Error("The Git path is outside the opened project.");
  }
  return relativePath.split(path.sep).join("/");
}

async function runGit(rootPath, args, options = {}) {
  if (parseWslUncPath(rootPath)) {
    return runInWsl(rootPath, "git", args, {
      maxBuffer: GIT_BUFFER_BYTES,
      timeout: options.timeout ?? 30_000,
    });
  }
  return execFileAsync("git", args, {
    cwd: rootPath,
    encoding: "utf8",
    maxBuffer: GIT_BUFFER_BYTES,
    timeout: options.timeout ?? 30_000,
  });
}

function statusLabel(indexStatus, worktreeStatus) {
  if (indexStatus === "?" && worktreeStatus === "?") return "Untracked";
  if (
    ["DD", "AU", "UD", "UA", "DU", "AA", "UU"].includes(
      `${indexStatus}${worktreeStatus}`,
    )
  ) {
    return "Conflict";
  }
  const status = worktreeStatus !== " " ? worktreeStatus : indexStatus;
  return (
    {
      A: "Added",
      C: "Copied",
      D: "Deleted",
      M: "Modified",
      R: "Renamed",
      T: "Type changed",
      U: "Conflict",
    }[status] ?? "Changed"
  );
}

function parsePorcelainStatus(output) {
  const records = output.split("\0");
  const entries = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record || record.length < 4) continue;
    const indexStatus = record[0];
    const worktreeStatus = record[1];
    const filePath = record.slice(3);
    let originalPath;
    if (
      indexStatus === "R" ||
      indexStatus === "C" ||
      worktreeStatus === "R" ||
      worktreeStatus === "C"
    ) {
      originalPath = records[index + 1] || undefined;
      index += 1;
    }
    const code = `${indexStatus}${worktreeStatus}`;
    entries.push({
      path: filePath,
      originalPath,
      indexStatus,
      worktreeStatus,
      label: statusLabel(indexStatus, worktreeStatus),
      staged: indexStatus !== " " && indexStatus !== "?",
      unstaged: worktreeStatus !== " ",
      untracked: code === "??",
      conflicted: [
        "DD",
        "AU",
        "UD",
        "UA",
        "DU",
        "AA",
        "UU",
      ].includes(code),
    });
  }
  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

async function getBranch(rootPath) {
  try {
    const { stdout } = await runGit(rootPath, [
      "symbolic-ref",
      "--quiet",
      "--short",
      "HEAD",
    ]);
    return { branch: stdout.trim(), detached: false };
  } catch {
    const { stdout } = await runGit(rootPath, [
      "rev-parse",
      "--short",
      "HEAD",
    ]);
    return { branch: stdout.trim(), detached: true };
  }
}

async function getAheadBehind(rootPath) {
  try {
    const { stdout } = await runGit(rootPath, [
      "rev-list",
      "--left-right",
      "--count",
      "HEAD...@{upstream}",
    ]);
    const [ahead = "0", behind = "0"] = stdout.trim().split(/\s+/);
    return {
      ahead: Number.parseInt(ahead, 10) || 0,
      behind: Number.parseInt(behind, 10) || 0,
    };
  } catch {
    return { ahead: 0, behind: 0 };
  }
}

async function getRepositoryMetadata(rootPath) {
  const [branchesResult, remotesResult, upstreamResult] = await Promise.allSettled([
    runGit(rootPath, [
      "for-each-ref",
      "--format=%(refname:short)",
      "refs/heads",
    ]),
    runGit(rootPath, ["remote"]),
    runGit(rootPath, [
      "rev-parse",
      "--abbrev-ref",
      "--symbolic-full-name",
      "@{upstream}",
    ]),
  ]);
  return {
    branches:
      branchesResult.status === "fulfilled"
        ? branchesResult.value.stdout.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
        : [],
    remotes:
      remotesResult.status === "fulfilled"
        ? remotesResult.value.stdout.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
        : [],
    upstream:
      upstreamResult.status === "fulfilled"
        ? upstreamResult.value.stdout.trim() || undefined
        : undefined,
  };
}

async function getGitStatus(inputRootPath) {
  try {
    const rootPath = validateRootPath(inputRootPath);
    const { stdout: repositoryRootOutput } = await runGit(rootPath, [
      "rev-parse",
      "--show-toplevel",
    ]);
    const repositoryRoot = repositoryRootOutput.trim();
    const [{ stdout }, branch, tracking, metadata] = await Promise.all([
      runGit(rootPath, [
        "status",
        "--porcelain=v1",
        "-z",
        "--untracked-files=all",
        "--",
        ".",
      ]),
      getBranch(rootPath),
      getAheadBehind(rootPath),
      getRepositoryMetadata(rootPath),
    ]);
    return {
      success: true,
      output: "Git status refreshed.",
      status: {
        available: true,
        isRepository: true,
        repositoryRoot,
        branch: branch.branch,
        detached: branch.detached,
        ahead: tracking.ahead,
        behind: tracking.behind,
        upstream: metadata.upstream,
        branches: metadata.branches,
        remotes: metadata.remotes,
        entries: parsePorcelainStatus(stdout),
      },
    };
  } catch (error) {
    const failure = gitError(error, "Git status could not be loaded.");
    return {
      ...failure,
      status: {
        available: error?.code !== "ENOENT",
        isRepository: false,
        branch: "",
        detached: false,
        ahead: 0,
        behind: 0,
        branches: [],
        remotes: [],
        entries: [],
      },
    };
  }
}

async function getGitDiff(inputRootPath, relativePath, staged) {
  try {
    const rootPath = validateRootPath(inputRootPath);
    const filePath = validateRelativePath(rootPath, relativePath);
    const statusResult = await getGitStatus(rootPath);
    const entry = statusResult.status?.entries.find(
      (candidate) => candidate.path === filePath,
    );
    if (!staged && entry?.untracked) {
      const content = await fs.readFile(path.resolve(rootPath, filePath), "utf8");
      return {
        success: true,
        output: "Untracked file preview.",
        content: `Untracked file: ${filePath}\n\n${content.slice(0, MAX_DIFF_BYTES)}`,
        truncated: content.length > MAX_DIFF_BYTES,
      };
    }

    const args = ["diff", "--no-ext-diff", "--unified=3"];
    if (staged) args.push("--cached");
    args.push("--", filePath);
    const { stdout } = await runGit(rootPath, args);
    return {
      success: true,
      output: staged ? "Staged diff loaded." : "Working diff loaded.",
      content: stdout.slice(0, MAX_DIFF_BYTES),
      truncated: stdout.length > MAX_DIFF_BYTES,
    };
  } catch (error) {
    return gitError(error, "The Git diff could not be loaded.");
  }
}

async function mutatePath(inputRootPath, relativePath, action) {
  try {
    const rootPath = validateRootPath(inputRootPath);
    const filePath = validateRelativePath(rootPath, relativePath);
    if (action === "stage") {
      await runGit(rootPath, ["add", "--", filePath]);
    } else {
      try {
        await runGit(rootPath, ["reset", "--quiet", "HEAD", "--", filePath]);
      } catch {
        await runGit(rootPath, [
          "rm",
          "--cached",
          "--ignore-unmatch",
          "--",
          filePath,
        ]);
      }
    }
    return {
      success: true,
      output: action === "stage" ? `Staged ${filePath}.` : `Unstaged ${filePath}.`,
    };
  } catch (error) {
    return gitError(error, `The file could not be ${action}d.`);
  }
}

async function mutateAll(inputRootPath, action) {
  try {
    const rootPath = validateRootPath(inputRootPath);
    if (action === "stage") {
      await runGit(rootPath, ["add", "-A", "--", "."]);
    } else {
      try {
        await runGit(rootPath, ["reset", "--quiet", "HEAD", "--", "."]);
      } catch {
        await runGit(rootPath, [
          "rm",
          "-r",
          "--cached",
          "--ignore-unmatch",
          "--",
          ".",
        ]);
      }
    }
    return {
      success: true,
      output: action === "stage" ? "All changes staged." : "All changes unstaged.",
    };
  } catch (error) {
    return gitError(error, `Changes could not be ${action}d.`);
  }
}

async function commitGit(inputRootPath, inputMessage) {
  try {
    const rootPath = validateRootPath(inputRootPath);
    const message =
      typeof inputMessage === "string" ? inputMessage.trim() : "";
    if (!message) throw new Error("Enter a commit message first.");
    if (message.length > 500) {
      throw new Error("Keep the commit message under 500 characters.");
    }
    const { stdout, stderr } = await runGit(
      rootPath,
      ["commit", "-m", message],
      { timeout: 120_000 },
    );
    return {
      success: true,
      output: [stdout, stderr].filter(Boolean).join("\n").trim() || "Commit created.",
    };
  } catch (error) {
    return gitError(error, "The commit could not be created.");
  }
}

function validateBranchName(name) {
  const branchName = typeof name === "string" ? name.trim() : "";
  if (
    !branchName ||
    branchName.length > 200 ||
    /[\u0000-\u0020~^:?*\\]/.test(branchName) ||
    branchName.startsWith("-") ||
    branchName.startsWith("/") ||
    branchName.endsWith("/") ||
    branchName.endsWith(".") ||
    branchName.includes("..") ||
    branchName.includes("//") ||
    branchName.includes("@{") ||
    branchName.endsWith(".lock")
  ) {
    throw new Error("Enter a valid Git branch name.");
  }
  return branchName;
}

async function initializeRepository(inputRootPath) {
  try {
    const rootPath = validateRootPath(inputRootPath);
    await runGit(rootPath, ["init"]);
    return { success: true, output: "Git repository initialized." };
  } catch (error) {
    return gitError(error, "The Git repository could not be initialized.");
  }
}

async function changeBranch(inputRootPath, inputBranch, create = false) {
  try {
    const rootPath = validateRootPath(inputRootPath);
    const branch = validateBranchName(inputBranch);
    await runGit(rootPath, create ? ["checkout", "-b", branch] : ["checkout", branch]);
    return {
      success: true,
      output: create ? `Created and switched to ${branch}.` : `Switched to ${branch}.`,
    };
  } catch (error) {
    return gitError(error, create ? "The branch could not be created." : "The branch could not be switched.");
  }
}

async function syncRepository(inputRootPath, action) {
  try {
    const rootPath = validateRootPath(inputRootPath);
    let args;
    if (action === "fetch") {
      args = ["fetch", "--prune"];
    } else if (action === "pull") {
      args = ["pull", "--ff-only"];
    } else if (action === "push") {
      const metadata = await getRepositoryMetadata(rootPath);
      if (metadata.upstream) {
        args = ["push"];
      } else {
        const { branch, detached } = await getBranch(rootPath);
        if (detached) throw new Error("Switch to a branch before pushing.");
        const remote = metadata.remotes.includes("origin")
          ? "origin"
          : metadata.remotes[0];
        if (!remote) throw new Error("Add a Git remote before pushing.");
        args = ["push", "--set-upstream", remote, branch];
      }
    } else {
      throw new Error("Choose fetch, pull, or push.");
    }
    const { stdout, stderr } = await runGit(rootPath, args, { timeout: 120_000 });
    return {
      success: true,
      output:
        [stdout, stderr].filter(Boolean).join("\n").trim() ||
        `${action[0].toUpperCase()}${action.slice(1)} completed.`,
    };
  } catch (error) {
    return gitError(error, `Git ${action} could not be completed.`);
  }
}

async function stashChanges(inputRootPath, action) {
  try {
    const rootPath = validateRootPath(inputRootPath);
    const args =
      action === "save"
        ? ["stash", "push", "--include-untracked", "-m", "Divex work in progress"]
        : action === "pop"
          ? ["stash", "pop"]
          : null;
    if (!args) throw new Error("Choose whether to save or restore a stash.");
    const { stdout, stderr } = await runGit(rootPath, args, { timeout: 120_000 });
    return {
      success: true,
      output: [stdout, stderr].filter(Boolean).join("\n").trim() ||
        (action === "save" ? "Changes stashed." : "Stash restored."),
    };
  } catch (error) {
    return gitError(error, action === "save" ? "Changes could not be stashed." : "The stash could not be restored.");
  }
}

async function discardChanges(inputRootPath, relativePath) {
  try {
    const rootPath = validateRootPath(inputRootPath);
    if (relativePath) {
      const filePath = validateRelativePath(rootPath, relativePath);
      const statusResult = await getGitStatus(rootPath);
      const entry = statusResult.status?.entries.find((item) => item.path === filePath);
      if (entry?.untracked) {
        await runGit(rootPath, ["clean", "-f", "--", filePath]);
      } else {
        try {
          await runGit(rootPath, ["restore", "--worktree", "--", filePath]);
        } catch {
          await runGit(rootPath, ["checkout", "--", filePath]);
        }
      }
      return { success: true, output: `Discarded working changes in ${filePath}.` };
    }

    let hasHead = true;
    try {
      await runGit(rootPath, ["rev-parse", "--verify", "HEAD"]);
    } catch {
      hasHead = false;
    }
    if (hasHead) {
      try {
        await runGit(rootPath, ["restore", "--worktree", "--", "."]);
      } catch {
        await runGit(rootPath, ["checkout", "--", "."]);
      }
    }
    await runGit(rootPath, ["clean", "-fd", "--", "."]);
    return { success: true, output: "Discarded all unstaged and untracked changes." };
  } catch (error) {
    return gitError(error, "Working changes could not be discarded.");
  }
}

module.exports = {
  changeBranch,
  commitGit,
  discardChanges,
  getGitDiff,
  getGitStatus,
  initializeRepository,
  mutateAll,
  mutatePath,
  parsePorcelainStatus,
  stashChanges,
  syncRepository,
  validateBranchName,
  validateRelativePath,
};
