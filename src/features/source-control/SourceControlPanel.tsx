import {
  AlertTriangle,
  Archive,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  FileDiff,
  GitBranch,
  Minus,
  Plus,
  RefreshCw,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  GitDiffResult,
  GitFileStatus,
  GitRepositoryStatus,
  ProjectToolResult,
} from "../../types";

interface SourceControlPanelProps {
  rootPath: string;
  enabled: boolean;
  refreshKey: number;
  autoRefreshOnFocus: boolean;
  confirmDestructiveActions: boolean;
  onOpenFile: (path: string) => void;
  onRepositoryChanged: () => void;
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
  onDiscard,
}: {
  entry: GitFileStatus;
  staged: boolean;
  busy: boolean;
  onOpenFile: () => void;
  onOpenDiff: () => void;
  onToggleStage: () => void;
  onDiscard: () => void;
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
      {!staged && (
        <button
          type="button"
          className="git-row-action danger"
          aria-label={`Discard changes in ${entry.path}`}
          title="Discard working changes"
          disabled={busy}
          onClick={onDiscard}
        >
          <Undo2 size={13} />
        </button>
      )}
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
  onDiscard,
  onDiscardAll,
}: {
  title: string;
  entries: GitFileStatus[];
  staged: boolean;
  busyPath: string | null;
  onOpenFile: (path: string) => void;
  onOpenDiff: (entry: GitFileStatus, staged: boolean) => void;
  onToggleStage: (entry: GitFileStatus, staged: boolean) => void;
  onToggleAll: (staged: boolean) => void;
  onDiscard: (entry: GitFileStatus) => void;
  onDiscardAll: () => void;
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
        <span className="git-group-actions">
          {!staged && (
            <button
              type="button"
              className="git-group-action danger"
              aria-label="Discard all working changes"
              title="Discard all unstaged and untracked changes"
              onClick={onDiscardAll}
            >
              <Undo2 size={13} />
            </button>
          )}
          <button
            type="button"
            className="git-group-action"
            aria-label={staged ? "Unstage all changes" : "Stage all changes"}
            title={staged ? "Unstage all" : "Stage all"}
            onClick={() => onToggleAll(staged)}
          >
            {staged ? <Minus size={13} /> : <Plus size={13} />}
          </button>
        </span>
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
            onDiscard={() => onDiscard(entry)}
          />
        ))}
    </section>
  );
}

export function SourceControlPanel({
  rootPath,
  enabled,
  refreshKey,
  autoRefreshOnFocus,
  confirmDestructiveActions,
  onOpenFile,
  onRepositoryChanged,
}: SourceControlPanelProps) {
  const [status, setStatus] = useState<GitRepositoryStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [diff, setDiff] = useState<DiffSelection | null>(null);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [newBranch, setNewBranch] = useState("");
  const branchMenuRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    if (!enabled || !window.divex) {
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
  }, [enabled, rootPath]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  useEffect(() => {
    setBranchMenuOpen(false);
    setNewBranch("");
  }, [rootPath]);

  useEffect(() => {
    if (!branchMenuOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !branchMenuRef.current?.contains(event.target)
      ) {
        setBranchMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setBranchMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [branchMenuOpen]);

  useEffect(() => {
    if (!autoRefreshOnFocus) return;
    const refreshOnFocus = () => void refresh();
    window.addEventListener("focus", refreshOnFocus);
    return () => window.removeEventListener("focus", refreshOnFocus);
  }, [autoRefreshOnFocus, refresh]);

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

  const initializeRepository = async () => {
    if (!window.divex) return;
    await runMutation(() => window.divex!.initializeGitRepository({ rootPath }));
  };

  const changeBranch = async (branch: string, create = false) => {
    if (!window.divex) return;
    const succeeded = await runMutation(() =>
      window.divex!.changeGitBranch({ rootPath, branch, create }),
    );
    if (succeeded) {
      setBranchMenuOpen(false);
      setNewBranch("");
      onRepositoryChanged();
    }
  };

  const sync = async (action: "fetch" | "pull" | "push") => {
    if (!window.divex) return;
    const succeeded = await runMutation(() =>
      window.divex!.syncGitRepository({ rootPath, action }),
    );
    if (succeeded && action === "pull") onRepositoryChanged();
  };

  const stash = async (action: "save" | "pop") => {
    if (!window.divex) return;
    const succeeded = await runMutation(() =>
      window.divex!.stashGitChanges({ rootPath, action }),
    );
    if (succeeded) onRepositoryChanged();
  };

  const discard = async (entry?: GitFileStatus) => {
    if (!window.divex) return;
    const description = entry
      ? `Discard working changes in “${entry.path}”? This cannot be undone.`
      : "Discard all unstaged and untracked changes? This cannot be undone.";
    if (confirmDestructiveActions && !window.confirm(description)) return;
    const succeeded = await runMutation(
      () => window.divex!.discardGitChanges({ rootPath, filePath: entry?.path }),
      entry?.path ?? null,
    );
    if (succeeded) onRepositoryChanged();
  };

  if (!enabled) {
    return (
      <div className="git-empty-state">
        <GitBranch size={24} />
        <strong>Open a project folder</strong>
        <span>Source control is available for projects on this computer.</span>
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
        <button type="button" onClick={() => void initializeRepository()}>
          Initialize repository
        </button>
        <button type="button" onClick={() => void refresh()}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="source-control-panel">
      <div className="git-branch-row">
        <div className="git-branch-switcher" ref={branchMenuRef}>
          <button
            type="button"
            className="git-current-branch"
            title={status.repositoryRoot}
            aria-expanded={branchMenuOpen}
            onClick={() => setBranchMenuOpen((value) => !value)}
          >
            <GitBranch size={13} />
            <strong>{status.detached ? `Detached ${status.branch}` : status.branch}</strong>
            <ChevronDown size={11} />
          </button>
          {branchMenuOpen && (
            <div className="git-branch-menu">
              <strong>Switch branch</strong>
              <div className="git-branch-list">
                {(status.branches ?? []).map((branch) => (
                  <button
                    type="button"
                    className={branch === status.branch ? "active" : ""}
                    key={branch}
                    disabled={branch === status.branch || busyPath !== null}
                    onClick={() => void changeBranch(branch)}
                  >
                    <GitBranch size={12} />
                    <span>{branch}</span>
                    {branch === status.branch && <Check size={11} />}
                  </button>
                ))}
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (newBranch.trim()) void changeBranch(newBranch, true);
                }}
              >
                <input
                  value={newBranch}
                  aria-label="New branch name"
                  placeholder="new-branch-name"
                  onChange={(event) => setNewBranch(event.target.value)}
                />
                <button type="submit" disabled={!newBranch.trim() || busyPath !== null}>
                  <Plus size={12} />
                  Create
                </button>
              </form>
            </div>
          )}
        </div>
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

      <div className="git-workflow-bar" aria-label="Git repository actions">
        <button type="button" disabled={busyPath !== null || !(status.remotes ?? []).length} onClick={() => void sync("fetch")}>
          <RefreshCw size={12} /> Fetch
        </button>
        <button type="button" disabled={busyPath !== null || !(status.remotes ?? []).length} onClick={() => void sync("pull")}>
          <Download size={12} /> Pull
        </button>
        <button type="button" disabled={busyPath !== null || !(status.remotes ?? []).length} onClick={() => void sync("push")}>
          <Upload size={12} /> Push
        </button>
        <button type="button" disabled={busyPath !== null || status.entries.length === 0} onClick={() => void stash("save")}>
          <Archive size={12} /> Stash
        </button>
        <button type="button" disabled={busyPath !== null} onClick={() => void stash("pop")}>
          <Undo2 size={12} /> Pop
        </button>
      </div>

      <div className="git-commit-box">
        <textarea
          value={commitMessage}
          maxLength={500}
          placeholder={
            window.divex?.platform === "darwin"
              ? "Message (⌘Enter to commit)"
              : "Message (Ctrl+Enter to commit)"
          }
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
              onDiscard={(entry) => void discard(entry)}
              onDiscardAll={() => void discard()}
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
              onDiscard={(entry) => void discard(entry)}
              onDiscardAll={() => void discard()}
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
