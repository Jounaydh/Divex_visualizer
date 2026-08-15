import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BrainCircuit,
  Check,
  ChevronDown,
  Maximize2,
  Minimize2,
  Move3d,
  Route,
  RotateCcw,
  SlidersHorizontal,
  Workflow,
} from "lucide-react";
import { useEffect, useRef } from "react";
import type {
  ExperienceMode,
  ViewMode,
  WorkflowDirection,
} from "../types";

const WORKFLOW_DIRECTIONS = [
  { value: "top-down", label: "Vertical: top to bottom", Icon: ArrowDown },
  { value: "bottom-up", label: "Vertical: bottom to top", Icon: ArrowUp },
  { value: "left-right", label: "Horizontal: left to right", Icon: ArrowRight },
  { value: "right-left", label: "Horizontal: right to left", Icon: ArrowLeft },
] as const;

interface VisualizerToolbarProps {
  viewMode: ViewMode;
  showCode: boolean;
  relationshipCount: number;
  experienceMode: ExperienceMode;
  workflowDirection: WorkflowDirection;
  freePositioning: boolean;
  hasCustomPositions: boolean;
  isFullscreen: boolean;
  onViewModeChange: (viewMode: ViewMode) => void;
  onExperienceModeChange: (mode: ExperienceMode) => void;
  onWorkflowDirectionChange: (direction: WorkflowDirection) => void;
  onToggleFreePositioning: () => void;
  onResetCustomPositions: () => void;
  onResetCamera: () => void;
  onToggleFullscreen: () => void;
}

export function VisualizerToolbar({
  viewMode,
  showCode,
  relationshipCount,
  experienceMode,
  workflowDirection,
  freePositioning,
  hasCustomPositions,
  isFullscreen,
  onViewModeChange,
  onExperienceModeChange,
  onWorkflowDirectionChange,
  onToggleFreePositioning,
  onResetCustomPositions,
  onResetCamera,
  onToggleFullscreen,
}: VisualizerToolbarProps) {
  const viewMenuRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    viewMenuRef.current?.removeAttribute("open");
  }, [viewMode]);

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (
        viewMenuRef.current?.open &&
        event.target instanceof Node &&
        !viewMenuRef.current?.contains(event.target)
      ) {
        viewMenuRef.current.removeAttribute("open");
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        viewMenuRef.current?.removeAttribute("open");
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const selectDirection = (direction: WorkflowDirection) => {
    viewMenuRef.current?.removeAttribute("open");
    onWorkflowDirectionChange(direction);
  };

  return (
    <div className="canvas-toolbar">
      <div className="canvas-view-controls">
        <div className="segmented-control">
          <button
            type="button"
            className={viewMode === "2d" ? "active" : ""}
            onClick={() => onViewModeChange("2d")}
          >
            <Workflow size={14} />
            2D flow
          </button>
          <button
            type="button"
            className={viewMode === "logic" ? "active" : ""}
            onClick={() => onViewModeChange("logic")}
          >
            <Route size={14} />
            Logic map
          </button>
          <button
            type="button"
            className={viewMode === "3d" ? "active" : ""}
            onClick={() => onViewModeChange("3d")}
          >
            <Move3d size={14} />
            3D map
          </button>
        </div>

        {viewMode !== "3d" && (
        <details className="view-menu-wrap" ref={viewMenuRef}>
          <summary
            className="view-menu-button"
            aria-haspopup="menu"
          >
            <SlidersHorizontal size={14} />
            View
            <ChevronDown size={13} />
          </summary>
          <div className="view-menu" role="menu">
            <div className="view-menu-heading">
              <strong>Map layout</strong>
              <span>Choose the direction the active map flows.</span>
            </div>
            <div className="direction-options">
              {WORKFLOW_DIRECTIONS.map(({ value, label, Icon }) => (
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={workflowDirection === value}
                  className={workflowDirection === value ? "selected" : ""}
                  key={value}
                  onClick={() => selectDirection(value)}
                >
                  <span className="direction-icon">
                    <Icon size={15} />
                  </span>
                  <span>{label}</span>
                  {workflowDirection === value && <Check size={15} />}
                </button>
              ))}
            </div>
            <div className="view-menu-divider" />
            <button
              type="button"
              className="view-setting-row"
              role="menuitemcheckbox"
              aria-checked={freePositioning}
              onClick={onToggleFreePositioning}
            >
              <span>
                <strong>Free positioning</strong>
                <small>Drag workflow cards anywhere on the canvas.</small>
              </span>
              <i className={`setting-toggle ${freePositioning ? "on" : ""}`}>
                <b />
              </i>
            </button>
            {hasCustomPositions && (
              <button
                type="button"
                className="reset-workflow-button"
                onClick={onResetCustomPositions}
              >
                <RotateCcw size={14} />
                Reset custom positions
              </button>
            )}
          </div>
        </details>
        )}
      </div>

      <div className="canvas-context">
        <span>
          {showCode
            ? "Source code editor"
            : viewMode === "logic"
              ? "Logical code workflow"
              : viewMode === "3d"
                ? "Interactive 3D project map"
                : "Workflow map"}
        </span>
        <i />
        <strong>{relationshipCount} relationships</strong>
      </div>

      <div className="toolbar-actions">
        <div className="mode-switch">
          <button
            type="button"
            className={experienceMode === "beginner" ? "active" : ""}
            onClick={() => onExperienceModeChange("beginner")}
          >
            Guided
          </button>
          <button
            type="button"
            className={experienceMode === "advanced" ? "active" : ""}
            onClick={() => onExperienceModeChange("advanced")}
          >
            <BrainCircuit size={13} />
            Advanced
          </button>
        </div>
        {viewMode === "3d" && !showCode && (
          <button
            type="button"
            className="reset-button"
            aria-label="Reset 3D camera"
            title="Reset camera"
            onClick={onResetCamera}
          >
            <RotateCcw size={15} />
          </button>
        )}
        <button
          type="button"
          className="reset-button fullscreen-button"
          aria-label={
            isFullscreen ? "Exit fullscreen view" : "Open fullscreen view"
          }
          onClick={onToggleFullscreen}
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
      </div>
    </div>
  );
}
