import {
  Box,
  BrainCircuit,
  ChevronDown,
  FolderOpen,
  Move3d,
  Power,
  RotateCcw,
  ScanSearch,
  Sparkles,
  Workflow,
} from "lucide-react";
import { lazy, Suspense, useMemo, useState } from "react";
import { analyzeProject } from "./analysis/analyzeProject";
import { BrandMark } from "./components/BrandMark";
import { CodeEditor } from "./components/CodeEditor";
import { FileExplorer } from "./components/FileExplorer";
import { InspectorPanel } from "./components/InspectorPanel";
import { TwoDVisualizer } from "./components/TwoDVisualizer";
import { sampleProject } from "./data/sampleProject";
import type {
  AnalyzedFile,
  ExperienceMode,
  FolderNode,
  ProjectPayload,
  ViewMode,
  VisualNode,
} from "./types";

const ThreeVisualizer = lazy(() =>
  import("./components/ThreeVisualizer").then((module) => ({
    default: module.ThreeVisualizer,
  })),
);

const folderIdsForPath = (path: string) => {
  const parts = path.split("/");
  parts.pop();
  return parts.map(
    (_, index) => `folder:${parts.slice(0, index + 1).join("/")}`,
  );
};

const folderLayer = (id: string) =>
  id
    .slice("folder:".length)
    .split("/")
    .filter(Boolean).length;

const fileLayer = (id: string) =>
  id
    .slice("file:".length)
    .split("/")
    .filter(Boolean).length;

export default function App() {
  const [payload, setPayload] = useState<ProjectPayload>(sampleProject);
  const project = useMemo(() => analyzeProject(payload), [payload]);
  const [experienceMode, setExperienceMode] =
    useState<ExperienceMode>("beginner");
  const [viewMode, setViewMode] = useState<ViewMode>("2d");
  const [twoDZoom, setTwoDZoom] = useState(1.4);
  const [expandedFolders, setExpandedFolders] = useState(
    () => new Set(["folder:lib"]),
  );
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedNode, setSelectedNode] = useState<VisualNode | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [cameraResetKey, setCameraResetKey] = useState(0);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [openingProject, setOpeningProject] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedFile = useMemo(() => {
    if (!selectedNode?.path) return null;
    return (
      project.files.find((file) => file.path === selectedNode.path) ?? null
    );
  }, [project.files, selectedNode]);

  const threeDExpansion = useMemo(() => {
    const choices = new Map<
      number,
      { id: string; kind: "folder" | "file" }
    >();
    expandedFolders.forEach((id) =>
      choices.set(folderLayer(id), { id, kind: "folder" }),
    );
    expandedFiles.forEach((id) =>
      choices.set(fileLayer(id), { id, kind: "file" }),
    );

    if (
      selectedNode?.kind === "folder" &&
      expandedFolders.has(selectedNode.id)
    ) {
      choices.set(folderLayer(selectedNode.id), {
        id: selectedNode.id,
        kind: "folder",
      });
    } else if (
      selectedNode?.kind === "file" &&
      expandedFiles.has(selectedNode.id)
    ) {
      choices.set(fileLayer(selectedNode.id), {
        id: selectedNode.id,
        kind: "file",
      });
    }

    const folders = new Set<string>();
    const files = new Set<string>();
    choices.forEach((choice) => {
      if (choice.kind === "folder") folders.add(choice.id);
      else files.add(choice.id);
    });
    return { folders, files };
  }, [expandedFiles, expandedFolders, selectedNode]);

  const toggleFolderAtLayer = (id: string) => {
    const isOpen = threeDExpansion.folders.has(id);
    const layer = folderLayer(id);
    setExpandedFolders((current) => {
      const next = new Set(current);
      if (isOpen) {
        next.delete(id);
        return next;
      }
      [...next].forEach((openId) => {
        if (folderLayer(openId) === layer) next.delete(openId);
      });
      next.add(id);
      return next;
    });
    if (!isOpen) {
      setExpandedFiles((current) => {
        const next = new Set(current);
        [...next].forEach((openId) => {
          if (fileLayer(openId) === layer) next.delete(openId);
        });
        return next;
      });
    }
  };

  const toggleFileAtLayer = (id: string) => {
    const isOpen = threeDExpansion.files.has(id);
    const layer = fileLayer(id);
    setExpandedFiles((current) => {
      const next = new Set(current);
      if (isOpen) {
        next.delete(id);
        return next;
      }
      [...next].forEach((openId) => {
        if (fileLayer(openId) === layer) next.delete(openId);
      });
      next.add(id);
      return next;
    });
    if (!isOpen) {
      setExpandedFolders((current) => {
        const next = new Set(current);
        [...next].forEach((openId) => {
          if (folderLayer(openId) === layer) next.delete(openId);
        });
        return next;
      });
    }
  };

  const toggleFolderFreely = (id: string) => {
    setExpandedFolders((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleFileFreely = (id: string) => {
    setExpandedFiles((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectFile = (file: AnalyzedFile) => {
    const ancestorIds = folderIdsForPath(file.path);
    const ancestorLayers = new Set(ancestorIds.map(folderLayer));
    setExpandedFolders((current) => {
      const next = new Set(current);
      ancestorIds.forEach((id) => {
        if (viewMode === "2d") {
          next.add(id);
          return;
        }
        const layer = folderLayer(id);
        [...next].forEach((openId) => {
          if (folderLayer(openId) === layer) next.delete(openId);
        });
        next.add(id);
      });
      return next;
    });
    if (viewMode === "3d") {
      setExpandedFiles((current) => {
        const next = new Set(current);
        [...next].forEach((openId) => {
          if (ancestorLayers.has(fileLayer(openId))) next.delete(openId);
        });
        return next;
      });
    }
    setSelectedNode({
      id: file.id,
      label: file.name,
      subtitle: `${file.symbols.length} symbols · ${file.lineCount} lines`,
      kind: "file",
      path: file.path,
      position: [0, 0, 0],
    });
    setShowCode(false);
  };

  const selectFolder = (folder: FolderNode) => {
    setSelectedNode({
      id: folder.id,
      label: folder.name,
      subtitle: `${folder.folders.length + folder.files.length} direct items`,
      kind: "folder",
      path: folder.path,
      position: [0, 0, 0],
    });
    setShowCode(false);
  };

  const selectPath = (path: string) => {
    const file = project.files.find((item) => item.path === path);
    if (file) selectFile(file);
  };

  const persistFileContent = (path: string, content: string) => {
    setPayload((current) => ({
      ...current,
      files: current.files.map((file) =>
        file.path === path ? { ...file, content } : file,
      ),
    }));
  };

  const openProject = async () => {
    setFileMenuOpen(false);
    setProjectMenuOpen(false);
    if (!window.divex) {
      setNotice("Folder selection is available in the Divex desktop window.");
      window.setTimeout(() => setNotice(null), 3500);
      return;
    }

    setOpeningProject(true);
    try {
      const nextProject = await window.divex.chooseProject();
      if (!nextProject) return;
      setPayload(nextProject);
      const firstTopLevelFolder = nextProject.files
        .map((file) => file.path.split("/"))
        .find((parts) => parts.length > 1)?.[0];
      setExpandedFolders(
        new Set(firstTopLevelFolder ? [`folder:${firstTopLevelFolder}`] : []),
      );
      setExpandedFiles(new Set());
      setTwoDZoom(1.4);
      setSelectedNode(null);
      setShowCode(false);
      setCameraResetKey((value) => value + 1);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "The project could not be opened.",
      );
      window.setTimeout(() => setNotice(null), 4500);
    } finally {
      setOpeningProject(false);
    }
  };

  return (
    <main className="app-shell">
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

      <div className="workspace">
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
                <button
                  type="button"
                  onClick={() => {
                    setPayload(sampleProject);
                    setTwoDZoom(1.4);
                    setProjectMenuOpen(false);
                  }}
                >
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
            selectedId={selectedNode?.id ?? null}
            onSelectFile={selectFile}
            onSelectFolder={selectFolder}
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
              <span>
                {project.files.reduce(
                  (total, file) => total + file.symbols.length,
                  0,
                )}
              </span>
              <small>symbols</small>
            </div>
          </div>
        </aside>

        <section className="visualizer-area">
          <div className="canvas-toolbar">
            <div className="segmented-control">
              <button
                type="button"
                className={viewMode === "2d" ? "active" : ""}
                onClick={() => {
                  setViewMode("2d");
                  setShowCode(false);
                }}
              >
                <Workflow size={14} />
                2D flow
              </button>
              <button
                type="button"
                className={viewMode === "3d" ? "active" : ""}
                onClick={() => {
                  setViewMode("3d");
                  setShowCode(false);
                }}
              >
                <Move3d size={14} />
                3D map
              </button>
            </div>

            <div className="canvas-context">
              <span>
                {showCode
                  ? "Flutter code editor"
                  : viewMode === "3d"
                    ? "Interactive space"
                    : "Workflow map"}
              </span>
              <i />
              <strong>{project.relationshipCount} relationships</strong>
            </div>

            <div className="toolbar-actions">
              <div className="mode-switch">
                <button
                  type="button"
                  className={experienceMode === "beginner" ? "active" : ""}
                  onClick={() => setExperienceMode("beginner")}
                >
                  Guided
                </button>
                <button
                  type="button"
                  className={experienceMode === "advanced" ? "active" : ""}
                  onClick={() => setExperienceMode("advanced")}
                >
                  <BrainCircuit size={13} />
                  Advanced
                </button>
              </div>
              {viewMode === "3d" && (
                <>
                  <button
                    type="button"
                    className="reset-button"
                    onClick={() => setCameraResetKey((value) => value + 1)}
                    title="Reset camera"
                  >
                    <RotateCcw size={15} />
                  </button>
                  <button
                    type="button"
                    className="reset-button unload-three-button"
                    aria-label="Unload 3D and return to 2D"
                    onClick={() => {
                      setViewMode("2d");
                      setShowCode(false);
                    }}
                    title="Unload 3D for better performance"
                  >
                    <Power size={15} />
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="visualizer-canvas">
            {showCode && selectedFile ? (
              <CodeEditor
                file={selectedFile}
                projectName={project.name}
                rootPath={project.rootPath}
                onClose={() => setShowCode(false)}
                onPersist={persistFileContent}
              />
            ) : viewMode === "3d" ? (
              <Suspense
                fallback={
                  <div className="three-loading">
                    <div className="loader" />
                    <strong>Loading 3D workspace…</strong>
                    <span>Only loaded when you request it</span>
                  </div>
                }
              >
                <ThreeVisualizer
                  project={project}
                  expandedFolders={threeDExpansion.folders}
                  expandedFiles={threeDExpansion.files}
                  selectedId={selectedNode?.id ?? null}
                  experienceMode={experienceMode}
                  cameraResetKey={cameraResetKey}
                  onSelectNode={(node) => {
                    setSelectedNode(node);
                    setShowCode(false);
                  }}
                  onToggleFolder={toggleFolderAtLayer}
                  onToggleFile={toggleFileAtLayer}
                />
              </Suspense>
            ) : (
              <TwoDVisualizer
                project={project}
                expandedFolders={expandedFolders}
                expandedFiles={expandedFiles}
                selectedId={selectedNode?.id ?? null}
                zoom={twoDZoom}
                onZoomChange={setTwoDZoom}
                onSelectNode={(node) => {
                  setSelectedNode(node);
                  setShowCode(false);
                }}
                onToggleFolder={toggleFolderFreely}
                onToggleFile={toggleFileFreely}
              />
            )}
            {!showCode && viewMode === "3d" && (
              <div className="canvas-help">
                <span><i className="mouse-icon" /> 2-finger sideways: rotate</span>
                <span>2-finger vertical: move</span>
                <span>Pinch: zoom</span>
              </div>
            )}
            {!showCode && (
              <div className="graph-legend">
                <span><i className="line-solid" /> Contains</span>
                <span><i className="line-dashed" /> Imports</span>
              </div>
            )}
          </div>
        </section>

        <InspectorPanel
          project={project}
          selectedNode={selectedNode}
          selectedFile={selectedFile}
          mode={experienceMode}
          showCode={showCode}
          onToggleCode={() => setShowCode((value) => !value)}
          onClose={() => {
            setSelectedNode(null);
            setShowCode(false);
          }}
          onSelectPath={selectPath}
        />
      </div>

      {openingProject && (
        <div className="loading-overlay">
          <div className="loader" />
          <strong>Analyzing project…</strong>
          <span>Mapping files, symbols, and imports</span>
        </div>
      )}
      {notice && <div className="toast">{notice}</div>}
    </main>
  );
}
