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
import { LogicalWorkflowVisualizer } from "../components/LogicalWorkflowVisualizer";
import { useElementFullscreen } from "./useElementFullscreen";
import { VisualizerToolbar } from "./VisualizerToolbar";

const CodeEditor = lazy(() =>
  import("../components/CodeEditor").then((module) => ({
    default: module.CodeEditor,
  })),
);

interface VisualizerWorkspaceProps {
  project: AnalyzedProject;
  selectedFile: AnalyzedFile | null;
  selectedId: string | null;
  viewMode: ViewMode;
  experienceMode: ExperienceMode;
  showCode: boolean;
  twoDZoom: number;
  logicZoom: number;
  workflowDirection: WorkflowDirection;
  freePositioning: boolean;
  twoDPositions: Readonly<Record<string, WorkflowPosition>>;
  logicPositions: Readonly<Record<string, WorkflowPosition>>;
  expandedFolders: Set<string>;
  expandedFiles: Set<string>;
  onChangeView: (mode: ViewMode) => void;
  onChangeExperience: (mode: ExperienceMode) => void;
  onChangeWorkflowDirection: (direction: WorkflowDirection) => void;
  onToggleFreePositioning: () => void;
  onResetTwoDPositions: () => void;
  onFullscreenError: (message: string) => void;
  onShowVisualizer: () => void;
  onSelectNode: (node: VisualNode) => void;
  onToggleFolderFreely: (id: string) => void;
  onToggleFileFreely: (id: string) => void;
  onTwoDZoomChange: (zoom: number) => void;
  onLogicZoomChange: (zoom: number) => void;
  onTwoDPositionsChange: (
    positions: Record<string, WorkflowPosition>,
  ) => void;
  onLogicPositionsChange: (
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
    <div className="workspace-loading">
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
  twoDZoom,
  logicZoom,
  workflowDirection,
  freePositioning,
  twoDPositions,
  logicPositions,
  expandedFolders,
  expandedFiles,
  onChangeView,
  onChangeExperience,
  onChangeWorkflowDirection,
  onToggleFreePositioning,
  onResetTwoDPositions,
  onFullscreenError,
  onShowVisualizer,
  onSelectNode,
  onToggleFolderFreely,
  onToggleFileFreely,
  onTwoDZoomChange,
  onLogicZoomChange,
  onTwoDPositionsChange,
  onLogicPositionsChange,
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
        hasCustomPositions={
          Object.keys(
            viewMode === "logic" ? logicPositions : twoDPositions,
          ).length > 0
        }
        isFullscreen={isFullscreen}
        onViewModeChange={onChangeView}
        onExperienceModeChange={onChangeExperience}
        onWorkflowDirectionChange={onChangeWorkflowDirection}
        onToggleFreePositioning={onToggleFreePositioning}
        onResetCustomPositions={onResetTwoDPositions}
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
          ) : viewMode === "logic" ? (
            <LogicalWorkflowVisualizer
              project={project}
              selectedId={selectedId}
              zoom={logicZoom}
              direction={workflowDirection}
              freePositioning={freePositioning}
              customPositions={logicPositions}
              onZoomChange={onLogicZoomChange}
              onCustomPositionsChange={onLogicPositionsChange}
              onSelectNode={selectNode}
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

        {!showCode && viewMode === "logic" && (
          <div className="canvas-help">
            <span>Arrows show the direction code flows</span>
            <span>Select a card to isolate its direct links</span>
          </div>
        )}
        {!showCode && viewMode === "2d" && (
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
