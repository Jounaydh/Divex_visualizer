import { lazy, Suspense, useEffect, useState } from "react";
import type {
  AnalyzedFile,
  AnalyzedProject,
  ExperienceMode,
  ViewMode,
  VisualNode,
  WorkflowDirection,
  WorkflowPosition,
} from "../types";
import { FeatureErrorBoundary } from "../components/FeatureErrorBoundary";
import { DEFAULT_TWO_D_ZOOM } from "../config/ui";
import { TwoDVisualizer } from "../features/project-map/TwoDVisualizer";
import { useElementFullscreen } from "./useElementFullscreen";
import { VisualizerToolbar } from "./VisualizerToolbar";

const CodeEditor = lazy(() =>
  import("../features/editor/CodeEditor").then((module) => ({
    default: module.CodeEditor,
  })),
);
const LogicalWorkflowVisualizer = lazy(() =>
  import("../features/logic-map/LogicalWorkflowVisualizer").then((module) => ({
    default: module.LogicalWorkflowVisualizer,
  })),
);

interface VisualizerWorkspaceProps {
  project: AnalyzedProject;
  selectedFile: AnalyzedFile | null;
  selectedId: string | null;
  viewMode: ViewMode;
  experienceMode: ExperienceMode;
  showCode: boolean;
  editorRevealLine: number | null;
  editorRevealKey: number;
  breakpoints: Record<string, number[]>;
  debugLocation: { filePath: string; line: number } | null;
  executionEnabled: boolean;
  twoDZoom: number;
  logicZoom: number;
  workflowDirection: WorkflowDirection;
  freePositioning: boolean;
  twoDPositions: Readonly<Record<string, WorkflowPosition>>;
  logicPositions: Readonly<Record<string, WorkflowPosition>>;
  expandedFolders: Set<string>;
  expandedFiles: Set<string>;
  workspaceTrusted: boolean;
  onChangeView: (mode: ViewMode) => void;
  onChangeExperience: (mode: ExperienceMode) => void;
  onChangeWorkflowDirection: (direction: WorkflowDirection) => void;
  onToggleFreePositioning: () => void;
  onResetTwoDPositions: () => void;
  onFullscreenError: (message: string) => void;
  onShowVisualizer: () => void;
  onOpenEditorFile: (path: string) => void;
  onOpenEditorLocation: (path: string, line: number) => void;
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
  onToggleBreakpoint: (path: string, line: number) => void;
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
  editorRevealLine,
  editorRevealKey,
  breakpoints,
  debugLocation,
  executionEnabled,
  twoDZoom,
  logicZoom,
  workflowDirection,
  freePositioning,
  twoDPositions,
  logicPositions,
  expandedFolders,
  expandedFiles,
  workspaceTrusted,
  onChangeView,
  onChangeExperience,
  onChangeWorkflowDirection,
  onToggleFreePositioning,
  onResetTwoDPositions,
  onFullscreenError,
  onShowVisualizer,
  onOpenEditorFile,
  onOpenEditorLocation,
  onSelectNode,
  onToggleFolderFreely,
  onToggleFileFreely,
  onTwoDZoomChange,
  onLogicZoomChange,
  onTwoDPositionsChange,
  onLogicPositionsChange,
  onPersistFile,
  onToggleBreakpoint,
}: VisualizerWorkspaceProps) {
  const [editorFile, setEditorFile] = useState<AnalyzedFile | null>(null);
  useEffect(() => {
    if (showCode && selectedFile) setEditorFile(selectedFile);
  }, [selectedFile, showCode]);
  useEffect(() => {
    if (!showCode) setEditorFile(null);
    // A different project must never inherit open document sessions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.rootPath]);
  const activeEditorFile =
    showCode && selectedFile ? selectedFile : editorFile;
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
  const activeFeature = showCode
    ? "Source editor"
    : viewMode === "logic"
      ? "Logic map"
      : "2D project map";
  const recoveryActions = showCode
    ? [
        {
          label: "Return to project map",
          onSelect: onShowVisualizer,
          primary: true,
        },
      ]
    : viewMode === "logic"
      ? [
          {
            label: "Restore protected logic map",
            onSelect: () => {
              onLogicPositionsChange({});
              onLogicZoomChange(0.8);
              onShowVisualizer();
            },
            primary: true,
          },
          {
            label: "Open 2D project map",
            onSelect: () => onChangeView("2d"),
          },
        ]
      : [
          {
            label: "Reset project map",
            onSelect: () => {
              onTwoDPositionsChange({});
              onTwoDZoomChange(DEFAULT_TWO_D_ZOOM);
            },
            primary: true,
          },
          {
            label: "Open protected logic map",
            onSelect: () => onChangeView("logic"),
          },
        ];
  const featureResetKey = [
    project.rootPath,
    project.files.length,
    activeFeature,
    selectedFile?.id ?? "",
  ].join(":");

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
        <FeatureErrorBoundary
          featureName={activeFeature}
          resetKey={featureResetKey}
          recoveryActions={recoveryActions}
        >
          <Suspense
            fallback={
              <LoadingWorkspace
                title="Loading workspace…"
                description="Preparing only the tools needed for this view"
              />
            }
          >
            <>
              {activeEditorFile && (
                <div
                  className={`editor-preserved-layer ${
                    showCode ? "active" : "hidden"
                  }`}
                >
                  <CodeEditor
                    file={activeEditorFile}
                    files={project.files}
                    projectName={project.name}
                    rootPath={project.rootPath}
                    breakpoints={breakpoints}
                    debugLocation={debugLocation}
                    executionEnabled={executionEnabled}
                    revealLine={editorRevealLine}
                    revealKey={editorRevealKey}
                    workspaceTrusted={workspaceTrusted}
                    onClose={onShowVisualizer}
                    onSelectFile={onOpenEditorFile}
                    onPersist={onPersistFile}
                    onToggleBreakpoint={onToggleBreakpoint}
                  />
                </div>
              )}
              {!showCode &&
                (viewMode === "logic" ? (
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
                    onOpenEvidenceLocation={onOpenEditorLocation}
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
                ))}
            </>
          </Suspense>
        </FeatureErrorBoundary>

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
