import { Eye, EyeOff, Focus, Route } from "lucide-react";
import {
  LOGICAL_EDGE_KINDS,
  LOGICAL_EDGE_LABELS,
  type LogicalEdgeKind,
  type LogicalWorkflowGraph,
} from "./buildLogicalWorkflowGraph";

interface LogicalFilterPanelProps {
  counts: LogicalWorkflowGraph["counts"];
  filtersOpen: boolean;
  focusConnections: boolean;
  selectedId: string | null;
  visibleKinds: ReadonlySet<LogicalEdgeKind>;
  isLargeGraph: boolean;
  isUnsafeFullGraph: boolean;
  performanceMode: boolean;
  isGraphPending: boolean;
  visibleNodeCount: number;
  filteredNodeCount: number;
  visibleEdgeCount: number;
  filteredEdgeCount: number;
  onToggleOpen: () => void;
  onToggleFocus: () => void;
  onToggleKind: (kind: LogicalEdgeKind) => void;
  onShowExecution: () => void;
  onShowDatabaseFlow: () => void;
  onShowEveryRelationship: () => void;
  onTogglePerformanceMode: () => void;
}

export function LogicalFilterPanel({
  counts,
  filtersOpen,
  focusConnections,
  selectedId,
  visibleKinds,
  isLargeGraph,
  isUnsafeFullGraph,
  performanceMode,
  isGraphPending,
  visibleNodeCount,
  filteredNodeCount,
  visibleEdgeCount,
  filteredEdgeCount,
  onToggleOpen,
  onToggleFocus,
  onToggleKind,
  onShowExecution,
  onShowDatabaseFlow,
  onShowEveryRelationship,
  onTogglePerformanceMode,
}: LogicalFilterPanelProps) {
  return (
    <div className={`logical-filter-panel ${filtersOpen ? "open" : ""}`}>
      <button
        type="button"
        className="logical-filter-heading"
        onClick={onToggleOpen}
        aria-expanded={filtersOpen}
      >
        <span>
          <Route size={14} />
          <strong>Code logic</strong>
        </span>
        {filtersOpen ? <EyeOff size={13} /> : <Eye size={13} />}
      </button>
      {filtersOpen && (
        <>
          <p>
            Execution flow stays focused by default. Use Data flow for tables,
            keys, reads, and writes.
          </p>
          {isLargeGraph && (
            <div className="logical-performance-notice">
              <span>
                <strong>
                  {isUnsafeFullGraph && performanceMode
                    ? "Large project protected"
                    : isUnsafeFullGraph
                      ? "Full map forced"
                      : performanceMode
                        ? "Large-map protection on"
                        : "Full map"}
                </strong>
                <small>
                  {isUnsafeFullGraph && performanceMode
                    ? `This map is too connected for a safe default full layout. Showing ${visibleNodeCount} of ${filteredNodeCount} items and ${visibleEdgeCount} of ${filteredEdgeCount} links around the current selection.`
                    : isUnsafeFullGraph
                      ? `Showing all ${filteredNodeCount} items and ${filteredEdgeCount} links. Layout may pause briefly, but off-screen cards and lines remain suspended.`
                      : performanceMode
                        ? `Showing ${visibleNodeCount} of ${filteredNodeCount} items and ${visibleEdgeCount} of ${filteredEdgeCount} links. Select an item to rebuild the map around it.`
                        : `${filteredNodeCount} items and ${filteredEdgeCount} links. Off-screen elements are still paused.`}
                </small>
              </span>
              <button
                type="button"
                disabled={isGraphPending}
                onClick={onTogglePerformanceMode}
              >
                {isGraphPending
                  ? "Loading…"
                  : isUnsafeFullGraph && performanceMode
                    ? "Force full map"
                    : performanceMode
                      ? "Load full map"
                      : "Restore protection"}
              </button>
            </div>
          )}
          <button
            type="button"
            className={`logical-focus-toggle ${
              focusConnections ? "active" : ""
            }`}
            aria-pressed={focusConnections}
            disabled={!selectedId}
            onClick={onToggleFocus}
          >
            <Focus size={13} />
            <span>
              <strong>Focus selected links</strong>
              <small>
                {selectedId
                  ? focusConnections
                    ? "Unrelated items are faded"
                    : "Everything remains visible"
                  : "Select a card to enable"}
              </small>
            </span>
            <i className={`setting-toggle ${focusConnections ? "on" : ""}`}>
              <b />
            </i>
          </button>
          <div className="logical-filter-grid">
            {LOGICAL_EDGE_KINDS.map((kind) => (
              <button
                type="button"
                className={visibleKinds.has(kind) ? "active" : ""}
                key={kind}
                onClick={() => onToggleKind(kind)}
              >
                <i className={`logic-swatch relation-${kind}`} />
                <span>{LOGICAL_EDGE_LABELS[kind]}</span>
                <small>{counts[kind]}</small>
              </button>
            ))}
          </div>
          <div className="logical-presets">
            <button type="button" onClick={onShowExecution}>
              Execution flow
            </button>
            <button type="button" onClick={onShowDatabaseFlow}>
              Data flow
            </button>
            <button type="button" onClick={onShowEveryRelationship}>
              Every relationship
            </button>
          </div>
        </>
      )}
    </div>
  );
}
