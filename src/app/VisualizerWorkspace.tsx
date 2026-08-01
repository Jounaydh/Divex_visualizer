import { lazy, Suspense } from "react";
import type {
  AnalyzedFile,
  AnalyzedProject,
  ExperienceMode,
  ViewMode,
  VisualNode,
  WorkflowDirection,
  WorkflowPosition,
} from "../types";
import { TwoDVisualizer } from "../components/TwoDVisualizer";
import type { ThreeDExpansion } from "./expansion";
import { useElementFullscreen } from "./useElementFullscreen";
import { VisualizerToolbar } from "./VisualizerToolbar";

const CodeEditor = lazy(() =>
  import("../components/CodeEditor").then((module) => ({
    default: module.CodeEditor,
  })),
);

const ThreeVisualizer = lazy(() =>
  import("../components/ThreeVisualizer").then((module) => ({
    default: module.ThreeVisualizer,
  })),
);

interface VisualizerWorkspaceProps {
  project: AnalyzedProject;
  selectedFile: AnalyzedFile | null;
  selectedId: string | null;
  viewMode: ViewMode;
  experienceMode: ExperienceMode;
  showCode: boolean;
  cameraResetKey: number;
  twoDZoom: number;
  workflowDirection: WorkflowDirection;
  freePositioning: boolean;
  twoDPositions: Readonly<Record<string, WorkflowPosition>>;
  expandedFolders: Set<string>;
  expandedFiles: Set<string>;
  threeDExpansion: ThreeDExpansion;
  onChangeView: (mode: ViewMode) => void;
  onChangeExperience: (mode: ExperienceMode) => void;
  onChangeWorkflowDirection: (direction: WorkflowDirection) => void;
  onToggleFreePositioning: () => void;
  onResetTwoDPositions: () => void;
  onFullscreenError: (message: string) => void;
  onShowVisualizer: () => void;
  onResetCamera: () => void;
  onSelectNode: (node: VisualNode) => void;
  onToggleFolderAtLayer: (id: string) => void;
  onToggleFileAtLayer: (id: string) => void;
  onToggleFolderFreely: (id: string) => void;
  onToggleFileFreely: (id: string) => void;
  onTwoDZoomChange: (zoom: number) => void;
  onTwoDPositionsChange: (
    positions: Record<string, WorkflowPosition>,
  ) => void;
  onPersistFile: (path: string, content: string) => void;
}

function LoadingWorkspace({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="three-loading">
      <div className="loader" />
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  );
}

export function VisualizerWorkspace({
  project,
  selectedFile,
  selectedId,
  viewMode,
  experienceMode,
  showCode,
  cameraResetKey,
  twoDZoom,
  workflowDirection,
  freePositioning,
  twoDPositions,
  expandedFolders,
  expandedFiles,
  threeDExpansion,
  onChangeView,
  onChangeExperience,
  onChangeWorkflowDirection,
  onToggleFreePositioning,
  onResetTwoDPositions,
  onFullscreenError,
  onShowVisualizer,
  onResetCamera,
  onSelectNode,
  onToggleFolderAtLayer,
  onToggleFileAtLayer,
  onToggleFolderFreely,
  onToggleFileFreely,
  onTwoDZoomChange,
  onTwoDPositionsChange,
  onPersistFile,
}: VisualizerWorkspaceProps) {
  const selectNode = (node: VisualNode) => onSelectNode(node);
  const { isFullscreen, toggleFullscreen } = useElementFullscreen();
  const handleToggleFullscreen = async () => {
    try {
      await toggleFullscreen();
    } catch (error) {
      onFullscreenError(
        error instanceof Error
          ? error.message
          : "Fullscreen mode is not available.",
      );
    }
  };

  return (
    <section
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
        onViewModeChange={onChangeView}
        onExperienceModeChange={onChangeExperience}
        onWorkflowDirectionChange={onChangeWorkflowDirection}
        onToggleFreePositioning={onToggleFreePositioning}
        onResetCustomPositions={onResetTwoDPositions}
        onResetCamera={onResetCamera}
        onToggleFullscreen={() => void handleToggleFullscreen()}
      />

      <div className="visualizer-canvas">
        <Suspense
          fallback={
            <LoadingWorkspace
              title="Loading workspace…"
              description="Preparing only the tools needed for this view"
            />
          }
        >
          {showCode && selectedFile ? (
            <CodeEditor
              file={selectedFile}
              projectName={project.name}
              rootPath={project.rootPath}
              onClose={onShowVisualizer}
              onPersist={onPersistFile}
            />
          ) : viewMode === "3d" ? (
            <ThreeVisualizer
              project={project}
              expandedFolders={threeDExpansion.folders}
              expandedFiles={threeDExpansion.files}
              selectedId={selectedId}
              experienceMode={experienceMode}
              cameraResetKey={cameraResetKey}
              onSelectNode={selectNode}
              onToggleFolder={onToggleFolderAtLayer}
              onToggleFile={onToggleFileAtLayer}
            />
          ) : (
            <TwoDVisualizer
              project={project}
              expandedFolders={expandedFolders}
              expandedFiles={expandedFiles}
              selectedId={selectedId}
              zoom={twoDZoom}
              direction={workflowDirection}
              freePositioning={freePositioning}
              customPositions={twoDPositions}
              onZoomChange={onTwoDZoomChange}
              onCustomPositionsChange={onTwoDPositionsChange}
              onSelectNode={selectNode}
              onToggleFolder={onToggleFolderFreely}
              onToggleFile={onToggleFileFreely}
            />
          )}
        </Suspense>

        {!showCode && viewMode === "3d" && (
          <div className="canvas-help">
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
  );
}
