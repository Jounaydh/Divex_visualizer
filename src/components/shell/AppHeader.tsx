import { FolderOpen, Sparkles } from "lucide-react";
import { useState } from "react";
import { BrandMark } from "../BrandMark";

interface AppHeaderProps {
  onOpenProject: () => void;
}

export function AppHeader({ onOpenProject }: AppHeaderProps) {
  const [fileMenuOpen, setFileMenuOpen] = useState(false);

  const openProject = () => {
    setFileMenuOpen(false);
    onOpenProject();
  };

  return (
    <header className="titlebar">
      <div className="window-drag-region" />
      <div className="titlebar-brand">
        <BrandMark />
        <strong>Divex</strong>
        <span>Visualizer</span>
        <small>EARLY ACCESS</small>
        <div className="header-file-menu">
          <button
            type="button"
            onClick={() => setFileMenuOpen((value) => !value)}
          >
            File
          </button>
          {fileMenuOpen && (
            <div className="header-file-popover">
              <button type="button" onClick={openProject}>
                <FolderOpen size={14} />
                Open Folder…
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="titlebar-center">
        <span className="status-dot" />
        Flutter analyzer
      </div>
      <button type="button" className="ai-button" disabled>
        <Sparkles size={14} />
        Ask Divex
        <span>Later</span>
      </button>
    </header>
  );
}
