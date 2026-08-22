import {
  Box,
  Bug,
  ChevronDown,
  Files,
  FolderOpen,
  GitBranch,
  Laptop,
  ScanSearch,
  Settings2,
  ShieldCheck,
  ShieldQuestion,
} from "lucide-react";
import {
  FileExplorer,
  type ExplorerEntry,
} from "../features/explorer/FileExplorer";
import type {
  AnalyzedFile,
  AnalyzedProject,
  FolderNode,
} from "../types";
import { SourceControlPanel } from "../features/source-control/SourceControlPanel";
import { DebugPanel } from "../features/debugger/DebugPanel";
import type { DebuggerManager } from "../features/debugger/useDebugger";
import type { DebugStackFrame } from "../types";

export type SidebarView = "explorer" | "source-control" | "debugger";

interface ProjectSidebarProps {
  project: AnalyzedProject;
  activeView: SidebarView;
  selectedId: string | null;
  selectedFile: AnalyzedFile | null;
  debuggerManager: DebuggerManager;
  workspaceTrusted: boolean;
  canUseNativePaths: boolean;
  canShare: boolean;
  hasClipboard: boolean;
  projectMenuOpen: boolean;
  gitRefreshKey: number;
  newFileExtension: string;
  gitAutoRefresh: boolean;
  confirmGitDiscard: boolean;
  onChangeView: (view: SidebarView) => void;
  onToggleProjectMenu: () => void;
  onOpenProject: () => void;
  onOpenWslProject: () => void;
  onLoadDemo: () => void;
  onOpenProjectSettings: () => void;
  onOpenWorkspaceTrust: () => void;
  onSelectFile: (file: AnalyzedFile) => void;
  onSelectFolder: (folder: FolderNode) => void;
  onCreateEntry: (
    parentPath: string,
    kind: ExplorerEntry["kind"],
    name: string,
  ) => void;
  onDuplicateEntry: (entry: ExplorerEntry) => void;
  onMoveEntry: (source: ExplorerEntry, target: ExplorerEntry) => void;
  onRenameEntry: (entry: ExplorerEntry, newName: string) => void;
  onDeleteEntry: (entry: ExplorerEntry) => void;
  onCopyEntryPath: (entry: ExplorerEntry, relative: boolean) => void;
  onRevealEntry: (entry: ExplorerEntry) => void;
  onRefresh: () => void;
  onOpenExternal: (entry: ExplorerEntry) => void;
  onOpenTerminal: (entry: ExplorerEntry) => void;
  onShareEntry: (entry: ExplorerEntry) => void;
  onCutEntry: (entry: ExplorerEntry) => void;
  onCopyEntry: (entry: ExplorerEntry) => void;
  onPasteEntry: (entry: ExplorerEntry) => void;
  onOpenGitFile: (path: string) => void;
  onGitRepositoryChanged: () => void;
  onOpenDebugFrame: (frame: DebugStackFrame) => void;
}

export function ProjectSidebar({
  project,
  activeView,
  selectedId,
  selectedFile,
  debuggerManager,
  workspaceTrusted,
  canUseNativePaths,
  canShare,
  hasClipboard,
  projectMenuOpen,
  gitRefreshKey,
  newFileExtension,
  gitAutoRefresh,
  confirmGitDiscard,
  onChangeView,
  onToggleProjectMenu,
  onOpenProject,
  onOpenWslProject,
  onLoadDemo,
  onOpenProjectSettings,
  onOpenWorkspaceTrust,
  onSelectFile,
  onSelectFolder,
  onCreateEntry,
  onDuplicateEntry,
  onMoveEntry,
  onRenameEntry,
  onDeleteEntry,
  onCopyEntryPath,
  onRevealEntry,
  onRefresh,
  onOpenExternal,
  onOpenTerminal,
  onShareEntry,
  onCutEntry,
  onCopyEntry,
  onPasteEntry,
  onOpenGitFile,
  onGitRepositoryChanged,
  onOpenDebugFrame,
}: ProjectSidebarProps) {
  const symbolCount = project.files.reduce(
    (total, file) => total + file.symbols.length,
    0,
  );

  return (
    <aside className="sidebar">
      <div className="sidebar-tabs" aria-label="Project sidebar">
        <button
          type="button"
          className={activeView === "explorer" ? "active" : ""}
          title="Explorer"
          onClick={() => onChangeView("explorer")}
        >
          <Files size={14} />
          Explorer
        </button>
        <button
          type="button"
          className={activeView === "source-control" ? "active" : ""}
          title="Source Control (⌃⇧G)"
          onClick={() => onChangeView("source-control")}
        >
          <GitBranch size={14} />
          Source Control
        </button>
        <button
          type="button"
          className={activeView === "debugger" ? "active" : ""}
          title="Run and Debug (Ctrl+Shift+D)"
          onClick={() => onChangeView("debugger")}
        >
          <Bug size={14} />
          Debug
        </button>
      </div>
      <div className="project-switcher">
        <button
          type="button"
          className="project-button"
          onClick={onToggleProjectMenu}
        >
          <span className="project-icon">
            <Box size={15} />
          </span>
          <span>
            <strong>{project.name}</strong>
            <small>
              {project.languageSummary} project
              {project.environment?.kind === "wsl"
                ? ` · WSL ${project.environment.distribution}`
                : ""}
              {!workspaceTrusted && canUseNativePaths ? " · Restricted" : ""}
            </small>
          </span>
          <ChevronDown size={14} />
        </button>
        {projectMenuOpen && (
          <div className="project-menu">
            <button type="button" onClick={onOpenProject}>
              <FolderOpen size={15} />
              Open project folder…
            </button>
            {window.divex?.platform === "win32" && (
              <button type="button" onClick={onOpenWslProject}>
                <Laptop size={15} />
                Open WSL project…
              </button>
            )}
            <button type="button" onClick={onLoadDemo}>
              <ScanSearch size={15} />
              Load demo project
            </button>
            <button type="button" onClick={onOpenProjectSettings}>
              <Settings2 size={15} />
              Project settings…
            </button>
            {canUseNativePaths && (
              <button type="button" onClick={onOpenWorkspaceTrust}>
                {workspaceTrusted ? (
                  <ShieldCheck size={15} />
                ) : (
                  <ShieldQuestion size={15} />
                )}
                Workspace trust…
              </button>
            )}
          </div>
        )}
        <button
          type="button"
          className="open-folder-button"
          onClick={onOpenProject}
        >
          <FolderOpen size={14} />
          Open folder
        </button>
      </div>

      {activeView === "explorer" ? (
        <>
          <div className="sidebar-label">
            <span>PROJECT FILES</span>
            <small>{project.files.length}</small>
          </div>
          <FileExplorer
            root={project.root}
            selectedId={selectedId}
            canUseNativePaths={canUseNativePaths}
            executionEnabled={workspaceTrusted}
            canShare={canShare}
            hasClipboard={hasClipboard}
            newFileExtension={newFileExtension}
            onSelectFile={onSelectFile}
            onSelectFolder={onSelectFolder}
            onCreateEntry={onCreateEntry}
            onDuplicateEntry={onDuplicateEntry}
            onMoveEntry={onMoveEntry}
            onRenameEntry={onRenameEntry}
            onDeleteEntry={onDeleteEntry}
            onCopyEntryPath={onCopyEntryPath}
            onRevealEntry={onRevealEntry}
            onRefresh={onRefresh}
            onOpenExternal={onOpenExternal}
            onOpenTerminal={onOpenTerminal}
            onShareEntry={onShareEntry}
            onCutEntry={onCutEntry}
            onCopyEntry={onCopyEntry}
            onPasteEntry={onPasteEntry}
          />

          <div className="sidebar-summary">
            <div>
              <span>{project.files.length}</span>
              <small>files</small>
            </div>
            <div>
              <span>{project.relationshipCount}</span>
              <small>links</small>
            </div>
            <div>
              <span>{symbolCount}</span>
              <small>symbols</small>
            </div>
          </div>
        </>
      ) : activeView === "source-control" ? (
        <SourceControlPanel
          rootPath={project.rootPath}
          enabled={canUseNativePaths}
          refreshKey={gitRefreshKey}
          autoRefreshOnFocus={gitAutoRefresh}
          confirmDestructiveActions={confirmGitDiscard}
          onOpenFile={onOpenGitFile}
          onRepositoryChanged={onGitRepositoryChanged}
        />
      ) : (
        <DebugPanel
          manager={debuggerManager}
          selectedFile={selectedFile}
          onOpenFrame={onOpenDebugFrame}
        />
      )}
    </aside>
  );
}
