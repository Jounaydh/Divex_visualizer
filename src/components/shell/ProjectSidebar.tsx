import { Box, ChevronDown, FolderOpen, ScanSearch } from "lucide-react";
import { useMemo, useState } from "react";
import type {
  AnalyzedFile,
  AnalyzedProject,
  FolderNode,
} from "../../types";
import { FileExplorer } from "../FileExplorer";

interface ProjectSidebarProps {
  project: AnalyzedProject;
  selectedId: string | null;
  onOpenProject: () => void;
  onLoadDemo: () => void;
  onSelectFile: (file: AnalyzedFile) => void;
  onSelectFolder: (folder: FolderNode) => void;
}

export function ProjectSidebar({
  project,
  selectedId,
  onOpenProject,
  onLoadDemo,
  onSelectFile,
  onSelectFolder,
}: ProjectSidebarProps) {
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const symbolCount = useMemo(
    () =>
      project.files.reduce(
        (total, file) => total + file.symbols.length,
        0,
      ),
    [project.files],
  );

  const openProject = () => {
    setProjectMenuOpen(false);
    onOpenProject();
  };

  const loadDemo = () => {
    setProjectMenuOpen(false);
    onLoadDemo();
  };

  return (
    <aside className="sidebar">
      <div className="project-switcher">
        <button
          type="button"
          className="project-button"
          onClick={() => setProjectMenuOpen((value) => !value)}
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
            <button type="button" onClick={openProject}>
              <FolderOpen size={15} />
              Open project folder…
            </button>
            <button type="button" onClick={loadDemo}>
              <ScanSearch size={15} />
              Load demo project
            </button>
          </div>
        )}
        <button
          type="button"
          className="open-folder-button"
          onClick={openProject}
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
        onSelectFile={onSelectFile}
        onSelectFolder={onSelectFolder}
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
