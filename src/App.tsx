import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { analyzeProject } from "./analysis/analyzeProject";
import { CodeEditor } from "./components/CodeEditor";
import { InspectorPanel } from "./components/InspectorPanel";
import { AppHeader } from "./components/shell/AppHeader";
import { ProjectSidebar } from "./components/shell/ProjectSidebar";
import { VisualizerToolbar } from "./components/visualizer/VisualizerToolbar";
import { TwoDVisualizer } from "./components/visualizer/two-d/TwoDVisualizer";
import { sampleProject } from "./data/sampleProject";
import { useElementFullscreen } from "./hooks/useElementFullscreen";
import { useGraphExpansion } from "./hooks/useGraphExpansion";
import type {
  AnalyzedFile,
  ExperienceMode,
  FolderNode,
  ProjectPayload,
  ViewMode,
  VisualNode,
  WorkflowDirection,
  WorkflowPosition,
} from "./types";

const ThreeVisualizer = lazy(() =>
  import("./components/visualizer/three-d/ThreeVisualizer").then(
    (module) => ({
      default: module.ThreeVisualizer,
    }),
  ),
);

export default function App() {
  const [payload, setPayload] = useState<ProjectPayload>(sampleProject);
  const project = useMemo(() => analyzeProject(payload), [payload]);
  const [experienceMode, setExperienceMode] =
    useState<ExperienceMode>("beginner");
  const [viewMode, setViewMode] = useState<ViewMode>("2d");
  const [workflowDirection, setWorkflowDirection] =
    useState<WorkflowDirection>("top-down");
  const [freePositioning, setFreePositioning] = useState(false);
  const [twoDZoom, setTwoDZoom] = useState(1.4);
  const [twoDPositions, setTwoDPositions] = useState<
    Record<string, WorkflowPosition>
  >({});
  const [selectedNode, setSelectedNode] = useState<VisualNode | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [cameraResetKey, setCameraResetKey] = useState(0);
  const [openingProject, setOpeningProject] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const visualizerRef = useRef<HTMLElement>(null);
  const { isFullscreen, toggleFullscreen } =
    useElementFullscreen(visualizerRef);
  const {
    expandedFolders,
    expandedFiles,
    threeDExpansion,
    resetExpansion,
    revealFilePath,
    toggleFolderAtLayer,
    toggleFileAtLayer,
    toggleFolderFreely,
    toggleFileFreely,
  } = useGraphExpansion(selectedNode, viewMode);

  const selectedFile = useMemo(() => {
    if (!selectedNode?.path) return null;
    return (
      project.files.find((file) => file.path === selectedNode.path) ?? null
    );
  }, [project.files, selectedNode]);

  const showTransientNotice = (message: string, duration = 3500) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), duration);
  };

  const resetProjectView = (firstFolder?: string) => {
    resetExpansion(firstFolder);
    setTwoDZoom(1.4);
    setTwoDPositions({});
    setSelectedNode(null);
    setShowCode(false);
    setCameraResetKey((value) => value + 1);
  };

  const changeViewMode = (nextViewMode: ViewMode) => {
    setViewMode(nextViewMode);
    setShowCode(false);
  };

  const selectWorkflowDirection = (direction: WorkflowDirection) => {
    setWorkflowDirection(direction);
    setTwoDPositions({});
    changeViewMode("2d");
  };

  const toggleFreePositioning = () => {
    setFreePositioning((value) => !value);
    changeViewMode("2d");
  };

  const handleToggleFullscreen = async () => {
    try {
      await toggleFullscreen();
    } catch (error) {
      showTransientNotice(
        error instanceof Error
          ? error.message
          : "Fullscreen mode is not available.",
      );
    }
  };

  const selectFile = (file: AnalyzedFile) => {
    revealFilePath(file.path);
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

  const loadDemoProject = () => {
    setPayload(sampleProject);
    resetProjectView("lib");
  };

  const openProject = async () => {
    if (!window.divex) {
      showTransientNotice(
        "Folder selection is available in the Divex desktop window.",
      );
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
      resetProjectView(firstTopLevelFolder);
    } catch (error) {
      showTransientNotice(
        error instanceof Error
          ? error.message
          : "The project could not be opened.",
        4500,
      );
    } finally {
      setOpeningProject(false);
    }
  };

  return (
    <main className="app-shell">
      <AppHeader onOpenProject={openProject} />

      <div className="workspace">
        <ProjectSidebar
          project={project}
          selectedId={selectedNode?.id ?? null}
          onOpenProject={openProject}
          onLoadDemo={loadDemoProject}
          onSelectFile={selectFile}
          onSelectFolder={selectFolder}
        />

        <section
          ref={visualizerRef}
          className={`visualizer-area ${isFullscreen ? "is-fullscreen" : ""}`}
        >
          <VisualizerToolbar
            viewMode={viewMode}
            showCode={showCode}
            relationshipCount={project.relationshipCount}
            experienceMode={experienceMode}
            workflowDirection={workflowDirection}
            freePositioning={freePositioning}
            hasCustomPositions={Object.keys(twoDPositions).length > 0}
            isFullscreen={isFullscreen}
            onViewModeChange={changeViewMode}
            onExperienceModeChange={setExperienceMode}
            onWorkflowDirectionChange={selectWorkflowDirection}
            onToggleFreePositioning={toggleFreePositioning}
            onResetCustomPositions={() => setTwoDPositions({})}
            onResetCamera={() => setCameraResetKey((value) => value + 1)}
            onToggleFullscreen={handleToggleFullscreen}
          />

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
                direction={workflowDirection}
                freePositioning={freePositioning}
                customPositions={twoDPositions}
                onZoomChange={setTwoDZoom}
                onCustomPositionsChange={setTwoDPositions}
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
                <span>
                  <i className="mouse-icon" /> Mouse drag: rotate
                </span>
                <span>
                  <i className="mouse-icon" /> 2-finger sideways: rotate
                </span>
                <span>2-finger vertical: move</span>
                <span>Pinch: zoom</span>
              </div>
            )}
            {!showCode && (
              <div className="graph-legend">
                <span>
                  <i className="line-solid" /> Contains
                </span>
                <span>
                  <i className="line-dashed" /> Imports
                </span>
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
