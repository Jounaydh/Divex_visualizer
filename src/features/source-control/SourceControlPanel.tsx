import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  FileDiff,
  GitBranch,
  Minus,
  Plus,
  RefreshCw,
  ShieldAlert,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  GitDiffResult,
  GitFileStatus,
  GitRepositoryStatus,
  ProjectToolResult,
} from "../../types";

interface SourceControlPanelProps {
  rootPath: string;
  enabled: boolean;
  trusted: boolean;
  refreshKey: number;
  onOpenFile: (path: string) => void;
  onTrustWorkspace: () => void;
}

interface DiffSelection {
  entry: GitFileStatus;
  staged: boolean;
  result: GitDiffResult | null;
}

function statusCode(entry: GitFileStatus, staged: boolean) {
  if (entry.conflicted) return "!";
  if (entry.untracked) return "U";
  const code = staged ? entry.indexStatus : entry.worktreeStatus;
  return code.trim() || "M";
}

function FileStatusRow({
  entry,
  staged,
  busy,
  onOpenFile,
  onOpenDiff,
  onToggleStage,
}: {
  entry: GitFileStatus;
  staged: boolean;
  busy: boolean;
  onOpenFile: () => void;
  onOpenDiff: () => void;
  onToggleStage: () => void;
}) {
  const separator = Math.max(
    entry.path.lastIndexOf("/"),
    entry.path.lastIndexOf("\\"),
  );
  const name = entry.path.slice(separator + 1);
  const directory = separator >= 0 ? entry.path.slice(0, separator) : "";

  return (
    <div className="git-file-row">
      <button
        type="button"
        className="git-file-main"
        title={`Open ${entry.path}`}
        onClick={onOpenFile}
      >
        <span>{name}</span>
        {directory && <small>{directory}</small>}
      </button>
      <button
        type="button"
        className="git-row-action"
        aria-label={`View ${staged ? "staged" : "working"} diff for ${entry.path}`}
        title="View changes"
        onClick={onOpenDiff}
      >
        <FileDiff size={13} />
      </button>
      <button
        type="button"
        className="git-row-action"
        aria-label={`${staged ? "Unstage" : "Stage"} ${entry.path}`}
        title={staged ? "Unstage change" : "Stage change"}
        disabled={busy}
        onClick={onToggleStage}
      >
        {staged ? <Minus size={13} /> : <Plus size={13} />}
      </button>
      <span
        className={`git-status-code ${entry.conflicted ? "conflict" : ""}`}
        title={entry.label}
      >
        {statusCode(entry, staged)}
      </span>
    </div>
  );
}

function ChangeGroup({
  title,
  entries,
  staged,
  busyPath,
  onOpenFile,
  onOpenDiff,
  onToggleStage,
  onToggleAll,
}: {
  title: string;
  entries: GitFileStatus[];
  staged: boolean;
  busyPath: string | null;
  onOpenFile: (path: string) => void;
  onOpenDiff: (entry: GitFileStatus, staged: boolean) => void;
  onToggleStage: (entry: GitFileStatus, staged: boolean) => void;
  onToggleAll: (staged: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  if (entries.length === 0) return null;

  return (
    <section className="git-change-group">
      <div className="git-group-heading">
        <button type="button" onClick={() => setExpanded((value) => !value)}>
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <span>{title}</span>
          <small>{entries.length}</small>
        </button>
        <button
          type="button"
          className="git-group-action"
          aria-label={staged ? "Unstage all changes" : "Stage all changes"}
          title={staged ? "Unstage all" : "Stage all"}
          onClick={() => onToggleAll(staged)}
        >
          {staged ? <Minus size={13} /> : <Plus size={13} />}
        </button>
      </div>
      {expanded &&
        entries.map((entry) => (
          <FileStatusRow
            key={`${staged ? "staged" : "working"}:${entry.path}`}
            entry={entry}
            staged={staged}
            busy={busyPath === entry.path}
            onOpenFile={() => onOpenFile(entry.path)}
            onOpenDiff={() => onOpenDiff(entry, staged)}
            onToggleStage={() => onToggleStage(entry, staged)}
          />
        ))}
    </section>
  );
}

export function SourceControlPanel({
  rootPath,
  enabled,
  trusted,
  refreshKey,
  onOpenFile,
  onTrustWorkspace,
}: SourceControlPanelProps) {
  const [status, setStatus] = useState<GitRepositoryStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [diff, setDiff] = useState<DiffSelection | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled || !trusted || !window.divex) {
      setStatus(null);
      return;
    }
    setLoading(true);
    try {
      const result = await window.divex.getGitStatus({ rootPath });
      setStatus(result.status);
      if (!result.success) setNotice(result.output);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Git status could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [enabled, rootPath, trusted]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  useEffect(() => {
    const refreshOnFocus = () => void refresh();
    window.addEventListener("focus", refreshOnFocus);
    return () => window.removeEventListener("focus", refreshOnFocus);
  }, [refresh]);

  const stagedEntries = useMemo(
    () => status?.entries.filter((entry) => entry.staged) ?? [],
    [status],
  );
  const workingEntries = useMemo(
    () => status?.entries.filter((entry) => entry.unstaged) ?? [],
    [status],
  );

  const runMutation = async (
    action: () => Promise<ProjectToolResult>,
    path: string | null = null,
  ) => {
    setBusyPath(path ?? "*");
    try {
      const result = await action();
      setNotice(result.output);
      if (result.success) await refresh();
      return result.success;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Git action failed.");
      return false;
    } finally {
      setBusyPath(null);
    }
  };

  const toggleStage = async (entry: GitFileStatus, staged: boolean) => {
    if (!window.divex) return;
    await runMutation(
      () =>
        staged
          ? window.divex!.unstageGitFile({
              rootPath,
              filePath: entry.path,
            })
          : window.divex!.stageGitFile({
              rootPath,
              filePath: entry.path,
            }),
      entry.path,
    );
  };

  const toggleAll = async (staged: boolean) => {
    if (!window.divex) return;
    await runMutation(() =>
      staged
        ? window.divex!.unstageAllGitChanges({ rootPath })
        : window.divex!.stageAllGitChanges({ rootPath }),
    );
  };

  const openDiff = async (entry: GitFileStatus, staged: boolean) => {
    if (!window.divex) return;
    setDiff({ entry, staged, result: null });
    try {
      const result = await window.divex.getGitDiff({
        rootPath,
        filePath: entry.path,
        staged,
      });
      setDiff({ entry, staged, result });
    } catch (error) {
      setDiff({
        entry,
        staged,
        result: {
          success: false,
          output:
            error instanceof Error ? error.message : "The diff could not be loaded.",
        },
      });
    }
  };

  const commit = async () => {
    if (!window.divex) return;
    const succeeded = await runMutation(() =>
      window.divex!.commitGitChanges({ rootPath, message: commitMessage }),
    );
    if (succeeded) setCommitMessage("");
  };

  if (!enabled) {
    return (
      <div className="git-empty-state">
        <GitBranch size={24} />
        <strong>Open a local folder</strong>
        <span>Source control is available for projects on this computer.</span>
      </div>
    );
  }

  if (!trusted) {
    return (
      <div className="git-empty-state">
        <ShieldAlert size={24} />
        <strong>Source control is restricted</strong>
        <span>
          Trust this folder before Divex runs Git commands or project tools.
        </span>
        <button type="button" onClick={onTrustWorkspace}>
          Trust this folder
        </button>
      </div>
    );
  }

  if (loading && !status) {
    return (
      <div className="git-empty-state">
        <RefreshCw className="spin" size={22} />
        <strong>Checking repository…</strong>
      </div>
    );
  }

  if (!status?.isRepository) {
    return (
      <div className="git-empty-state">
        <GitBranch size={24} />
        <strong>No Git repository found</strong>
        <span>{notice ?? "Open a folder that already contains a Git repository."}</span>
        <button type="button" onClick={() => void refresh()}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="source-control-panel">
      <div className="git-branch-row">
        <span title={status.repositoryRoot}>
          <GitBranch size={13} />
          <strong>{status.detached ? `Detached ${status.branch}` : status.branch}</strong>
        </span>
        {(status.ahead > 0 || status.behind > 0) && (
          <small>
            {status.ahead > 0 ? `↑${status.ahead}` : ""}
            {status.behind > 0 ? ` ↓${status.behind}` : ""}
          </small>
        )}
        <button
          type="button"
          aria-label="Refresh Git status"
          title="Refresh"
          disabled={loading}
          onClick={() => void refresh()}
        >
          <RefreshCw className={loading ? "spin" : ""} size={13} />
        </button>
      </div>

      <div className="git-commit-box">
        <textarea
          value={commitMessage}
          maxLength={500}
          placeholder="Message (⌘Enter to commit)"
          aria-label="Git commit message"
          onChange={(event) => setCommitMessage(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              (event.metaKey || event.ctrlKey) &&
              stagedEntries.length > 0 &&
              commitMessage.trim()
            ) {
              event.preventDefault();
              void commit();
            }
          }}
        />
        <button
          type="button"
          disabled={
            busyPath !== null ||
            stagedEntries.length === 0 ||
            !commitMessage.trim()
          }
          onClick={() => void commit()}
        >
          <Check size={13} />
          Commit staged changes
        </button>
      </div>

      {notice && (
        <button
          type="button"
          className="git-notice"
          title="Dismiss"
          onClick={() => setNotice(null)}
        >
          <span>{notice}</span>
          <X size={12} />
        </button>
      )}

      <div className="git-change-list">
        {status.entries.length === 0 ? (
          <div className="git-clean-state">
            <Check size={18} />
            <strong>Working tree clean</strong>
            <span>No local changes to commit.</span>
          </div>
        ) : (
          <>
            <ChangeGroup
              title="STAGED CHANGES"
              entries={stagedEntries}
              staged
              busyPath={busyPath}
              onOpenFile={onOpenFile}
              onOpenDiff={openDiff}
              onToggleStage={(entry, staged) => void toggleStage(entry, staged)}
              onToggleAll={(staged) => void toggleAll(staged)}
            />
            <ChangeGroup
              title="CHANGES"
              entries={workingEntries}
              staged={false}
              busyPath={busyPath}
              onOpenFile={onOpenFile}
              onOpenDiff={openDiff}
              onToggleStage={(entry, staged) => void toggleStage(entry, staged)}
              onToggleAll={(staged) => void toggleAll(staged)}
            />
          </>
        )}
      </div>

      {diff && (
        <div
          className="git-diff-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDiff(null);
          }}
        >
          <section
            className="git-diff-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={`Changes in ${diff.entry.path}`}
          >
            <header>
              <span>
                <FileDiff size={15} />
                <strong>{diff.entry.path}</strong>
                <small>{diff.staged ? "Staged" : "Working tree"}</small>
              </span>
              <button
                type="button"
                aria-label="Close diff"
                onClick={() => setDiff(null)}
              >
                <X size={15} />
              </button>
            </header>
            {!diff.result ? (
              <div className="git-diff-loading">
                <RefreshCw className="spin" size={18} />
                Loading changes…
              </div>
            ) : diff.result.success ? (
              <>
                <pre>{diff.result.content || "No textual changes to display."}</pre>
                {diff.result.truncated && (
                  <div className="git-diff-warning">
                    <AlertTriangle size={13} />
                    Preview limited to 2 MB.
                  </div>
                )}
              </>
            ) : (
              <div className="git-diff-loading">
                <AlertTriangle size={18} />
                {diff.result.output}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
