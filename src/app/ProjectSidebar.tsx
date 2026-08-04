import {
  Box,
  ChevronDown,
  FolderOpen,
  ScanSearch,
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

interface ProjectSidebarProps {
  project: AnalyzedProject;
  selectedId: string | null;
  canUseNativePaths: boolean;
  canShare: boolean;
  hasClipboard: boolean;
  projectMenuOpen: boolean;
  onToggleProjectMenu: () => void;
  onOpenProject: () => void;
  onLoadDemo: () => void;
  onSelectFile: (file: AnalyzedFile) => void;
  onSelectFolder: (folder: FolderNode) => void;
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
}

export function ProjectSidebar({
  project,
  selectedId,
  canUseNativePaths,
  canShare,
  hasClipboard,
  projectMenuOpen,
  onToggleProjectMenu,
  onOpenProject,
  onLoadDemo,
  onSelectFile,
  onSelectFolder,
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
}: ProjectSidebarProps) {
  const symbolCount = project.files.reduce(
    (total, file) => total + file.symbols.length,
    0,
  );

  return (
    <aside className="sidebar">
      <div className="sidebar-title">Explorer</div>
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
            <small>Flutter project</small>
          </span>
          <ChevronDown size={14} />
        </button>
        {projectMenuOpen && (
          <div className="project-menu">
            <button type="button" onClick={onOpenProject}>
              <FolderOpen size={15} />
              Open project folder…
            </button>
            <button type="button" onClick={onLoadDemo}>
              <ScanSearch size={15} />
              Load demo project
            </button>
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

      <div className="sidebar-label">
        <span>PROJECT FILES</span>
        <small>{project.files.length}</small>
      </div>
      <FileExplorer
        root={project.root}
        selectedId={selectedId}
        canUseNativePaths={canUseNativePaths}
        canShare={canShare}
        hasClipboard={hasClipboard}
        onSelectFile={onSelectFile}
        onSelectFolder={onSelectFolder}
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
    </aside>
  );
}
