import { Focus, Minus, Plus } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import type {
  AnalyzedProject,
  VisualNode,
  WorkflowDirection,
  WorkflowPosition,
} from "../../types";
import {
  buildLogicalWorkflowGraph,
  LOGICAL_EDGE_KINDS,
  type LogicalEdgeKind,
} from "./buildLogicalWorkflowGraph";
import { LogicalFilterPanel } from "./LogicalFilterPanel";
import {
  createLogicalEdgeRoutes,
  createLogicalWorkflowLayout,
  LOGICAL_NODE_HEIGHT,
  LOGICAL_NODE_WIDTH,
} from "./logicalWorkflowLayout";
import {
  edgeRenderPriority,
  EXECUTION_EDGE_KINDS,
  filterLogicalWorkflowGraph,
  FREE_PAN_PADDING,
  isLargeLogicalGraph,
  isUnsafeFullLogicalGraph,
  MAX_VIEWPORT_EDGES,
  profileLogicalOperation,
  scopeLogicalWorkflowGraph,
  VIEWPORT_OVERSCAN,
  type LogicalViewport,
} from "./logicalWorkflowPerformance";
import { WorkflowNode } from "../../components/WorkflowNode";
import { useAnchoredZoom } from "../viewport/useAnchoredZoom";

interface LogicalWorkflowVisualizerProps {
  project: AnalyzedProject;
  selectedId: string | null;
  zoom: number;
  direction: WorkflowDirection;
  freePositioning: boolean;
  customPositions: Readonly<Record<string, WorkflowPosition>>;
  onZoomChange: (zoom: number) => void;
  onCustomPositionsChange: (
    positions: Record<string, WorkflowPosition>,
  ) => void;
  onSelectNode: (node: VisualNode) => void;
  autoFocusOnLayout?: boolean;
  defaultFiltersOpen?: boolean;
}

const DEFAULT_ZOOM = 0.8;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 1.8;

export function LogicalWorkflowVisualizer({
  project,
  selectedId,
  zoom,
  direction,
  freePositioning,
  customPositions,
  onZoomChange,
  onCustomPositionsChange,
  onSelectNode,
  autoFocusOnLayout = true,
  defaultFiltersOpen = true,
}: LogicalWorkflowVisualizerProps) {
  const graph = useMemo(
    () =>
      profileLogicalOperation("Graph construction", () =>
        buildLogicalWorkflowGraph(project),
      ),
    [project],
  );
  const [visibleKinds, setVisibleKinds] = useState<Set<LogicalEdgeKind>>(
    () => new Set(EXECUTION_EDGE_KINDS),
  );
  const [filtersOpen, setFiltersOpen] = useState(defaultFiltersOpen);
  const [focusConnections, setFocusConnections] = useState(false);
  const [fullGraphProjectKey, setFullGraphProjectKey] = useState<
    string | null
  >(null);
  const [isGraphPending, startGraphTransition] = useTransition();
  const [isPanning, setIsPanning] = useState(false);
  const [viewport, setViewport] = useState<LogicalViewport>({
    left: 0,
    top: 0,
    right: 1800,
    bottom: 1200,
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const viewportFrameRef = useRef<number | null>(null);
  const customPositionsRef = useRef(customPositions);
  const positionsRef = useRef<ReadonlyMap<string, WorkflowPosition>>(
    new Map(),
  );
  const panRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);

  useEffect(() => {
    customPositionsRef.current = customPositions;
  }, [customPositions]);

  const filteredGraph = useMemo(
    () => filterLogicalWorkflowGraph(graph, visibleKinds, selectedId),
    [graph, selectedId, visibleKinds],
  );
  const filteredNodes = filteredGraph.nodes;
  const filteredEdges = filteredGraph.edges;
  const isLargeGraph = isLargeLogicalGraph(filteredGraph);
  const isUnsafeFullGraph = isUnsafeFullLogicalGraph(filteredGraph);
  const fullGraphRequested = fullGraphProjectKey === project.rootPath;
  const performanceMode = !fullGraphRequested;
  const scopedGraph = useMemo(
    () =>
      isLargeGraph && performanceMode
        ? scopeLogicalWorkflowGraph(filteredGraph, selectedId)
        : filteredGraph,
    [filteredGraph, isLargeGraph, performanceMode, selectedId],
  );
  const visibleEdges = scopedGraph.edges;
  const visibleNodes = scopedGraph.nodes;
  const layout = useMemo(
    () =>
      profileLogicalOperation("Automatic layout", () =>
        createLogicalWorkflowLayout(visibleNodes, visibleEdges, direction),
      ),
    [direction, visibleEdges, visibleNodes],
  );
  const positions = useMemo(() => {
    const next = new Map(layout.positions);
    visibleNodes.forEach((node) => {
      const custom = customPositions[node.id];
      if (custom) next.set(node.id, custom);
    });
    return next;
  }, [customPositions, layout.positions, visibleNodes]);
  const stage = useMemo(() => {
    const values = Array.from(positions.values());
    return {
      width: Math.max(
        layout.width,
        ...values.map((position) => position.x + LOGICAL_NODE_WIDTH + 120),
      ),
      height: Math.max(
        layout.height,
        ...values.map((position) => position.y + LOGICAL_NODE_HEIGHT + 120),
      ),
    };
  }, [layout.height, layout.width, positions]);
  const lineViewport = useMemo(() => {
    const left = Math.max(0, viewport.left - VIEWPORT_OVERSCAN);
    const top = Math.max(0, viewport.top - VIEWPORT_OVERSCAN);
    const right = Math.min(
      stage.width,
      viewport.right + VIEWPORT_OVERSCAN,
    );
    const bottom = Math.min(
      stage.height,
      viewport.bottom + VIEWPORT_OVERSCAN,
    );
    return {
      left,
      top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
    };
  }, [stage.height, stage.width, viewport]);
  const relatedIds = useMemo(() => {
    if (!selectedId) return null;
    const ids = new Set([selectedId]);
    visibleEdges.forEach((edge) => {
      if (edge.source === selectedId) ids.add(edge.target);
      if (edge.target === selectedId) ids.add(edge.source);
    });
    return ids;
  }, [selectedId, visibleEdges]);
  const edgeRoutes = useMemo(
    () =>
      profileLogicalOperation("Edge routing", () =>
        createLogicalEdgeRoutes(
          visibleNodes,
          visibleEdges,
          positions,
          direction,
        ),
      ),
    [direction, positions, visibleEdges, visibleNodes],
  );
  const renderedEdges = useMemo(() => {
    return [...visibleEdges].sort(
      (left, right) =>
        edgeRenderPriority[right.kind] - edgeRenderPriority[left.kind],
    );
  }, [visibleEdges]);
  const viewportNodes = useMemo(
    () =>
      visibleNodes.filter((node) => {
        const position = positions.get(node.id);
        if (!position) return false;
        return (
          position.x + LOGICAL_NODE_WIDTH >=
            viewport.left - VIEWPORT_OVERSCAN &&
          position.x <= viewport.right + VIEWPORT_OVERSCAN &&
          position.y + LOGICAL_NODE_HEIGHT >=
            viewport.top - VIEWPORT_OVERSCAN &&
          position.y <= viewport.bottom + VIEWPORT_OVERSCAN
        );
      }),
    [positions, viewport, visibleNodes],
  );
  const viewportEdges = useMemo(
    () =>
      renderedEdges.filter((edge) => {
        const bounds = edgeRoutes.get(edge.id)?.bounds;
        if (!bounds) return false;
        return (
          bounds.right >= viewport.left - VIEWPORT_OVERSCAN &&
          bounds.left <= viewport.right + VIEWPORT_OVERSCAN &&
          bounds.bottom >= viewport.top - VIEWPORT_OVERSCAN &&
          bounds.top <= viewport.bottom + VIEWPORT_OVERSCAN
        );
      }).slice(0, MAX_VIEWPORT_EDGES),
    [edgeRoutes, renderedEdges, viewport],
  );

  const {
    zoomRef,
    changeZoom,
    changeZoomByStep,
    handleControlWheel,
  } = useAnchoredZoom({
    scrollRef,
    zoom,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    onZoomChange,
  });
  positionsRef.current = positions;

  const focusNode = useCallback(
    (nodeId: string, behavior: ScrollBehavior = "smooth") => {
      const container = scrollRef.current;
      const position = positionsRef.current.get(nodeId);
      if (!container || !position) return;
      container.scrollTo({
        left:
          (FREE_PAN_PADDING +
            position.x +
            LOGICAL_NODE_WIDTH / 2) *
            zoomRef.current -
          container.clientWidth / 2,
        top:
          (FREE_PAN_PADDING +
            position.y +
            LOGICAL_NODE_HEIGHT / 2) *
            zoomRef.current -
          container.clientHeight / 2,
        behavior,
      });
    },
    [],
  );

  useEffect(() => {
    if (!autoFocusOnLayout) return;
    const frame = window.requestAnimationFrame(() =>
      focusNode(selectedId ?? "project"),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [
    autoFocusOnLayout,
    direction,
    focusNode,
    selectedId,
    layout.height,
    layout.width,
  ]);

  useEffect(() => {
    if (autoFocusOnLayout || !selectedId) return;
    const frame = window.requestAnimationFrame(() =>
      focusNode(selectedId),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [autoFocusOnLayout, direction, focusNode, selectedId]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const updateViewport = () => {
      if (viewportFrameRef.current !== null) return;
      viewportFrameRef.current = window.requestAnimationFrame(() => {
        viewportFrameRef.current = null;
        const scale = Math.max(zoomRef.current, 0.01);
        setViewport({
          left: container.scrollLeft / scale - FREE_PAN_PADDING,
          top: container.scrollTop / scale - FREE_PAN_PADDING,
          right:
            (container.scrollLeft + container.clientWidth) / scale -
            FREE_PAN_PADDING,
          bottom:
            (container.scrollTop + container.clientHeight) / scale -
            FREE_PAN_PADDING,
        });
      });
    };
    const handleWheel = (event: WheelEvent) => {
      if (handleControlWheel(event)) {
        updateViewport();
      } else if (event.shiftKey && Math.abs(event.deltaX) < 0.01) {
        event.preventDefault();
        container.scrollBy({ left: event.deltaY, behavior: "auto" });
      }
    };
    const resizeObserver = new ResizeObserver(updateViewport);
    resizeObserver.observe(container);
    container.addEventListener("scroll", updateViewport, { passive: true });
    container.addEventListener("wheel", handleWheel, { passive: false });
    updateViewport();
    return () => {
      resizeObserver.disconnect();
      container.removeEventListener("scroll", updateViewport);
      container.removeEventListener("wheel", handleWheel);
      if (viewportFrameRef.current !== null) {
        window.cancelAnimationFrame(viewportFrameRef.current);
        viewportFrameRef.current = null;
      }
    };
  }, [handleControlWheel]);

  const updatePosition = (
    nodeId: string,
    position: WorkflowPosition,
  ) => {
    const next = {
      ...customPositionsRef.current,
      [nodeId]: position,
    };
    customPositionsRef.current = next;
    onCustomPositionsChange(next);
  };

  const toggleKind = (kind: LogicalEdgeKind) => {
    setVisibleKinds((current) => {
      const next = new Set(current);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  return (
    <div
      className={`logical-workflow-view ${
        freePositioning ? "free-positioning" : ""
      }`}
    >
      <LogicalFilterPanel
        counts={graph.counts}
        filtersOpen={filtersOpen}
        focusConnections={focusConnections}
        selectedId={selectedId}
        visibleKinds={visibleKinds}
        isLargeGraph={isLargeGraph}
        isUnsafeFullGraph={isUnsafeFullGraph}
        performanceMode={performanceMode}
        isGraphPending={isGraphPending}
        visibleNodeCount={visibleNodes.length}
        filteredNodeCount={filteredNodes.length}
        visibleEdgeCount={visibleEdges.length}
        filteredEdgeCount={filteredEdges.length}
        onToggleOpen={() => setFiltersOpen((value) => !value)}
        onToggleFocus={() => setFocusConnections((value) => !value)}
        onToggleKind={toggleKind}
        onShowExecution={() =>
          setVisibleKinds(new Set(EXECUTION_EDGE_KINDS))
        }
        onShowEveryRelationship={() =>
          setVisibleKinds(new Set(LOGICAL_EDGE_KINDS))
        }
        onTogglePerformanceMode={() =>
          startGraphTransition(() =>
            setFullGraphProjectKey(
              performanceMode ? project.rootPath : null,
            ),
          )
        }
      />

      <div
        className={`two-d-scroll logical-scroll ${
          isPanning ? "panning" : ""
        }`}
        ref={scrollRef}
        tabIndex={0}
        aria-label="Scrollable logical code workflow"
        onKeyDown={(event) => {
          const distance = event.shiftKey ? 120 : 52;
          if (event.key === "ArrowUp") event.currentTarget.scrollTop -= distance;
          else if (event.key === "ArrowDown") {
            event.currentTarget.scrollTop += distance;
          } else if (event.key === "ArrowLeft") {
            event.currentTarget.scrollLeft -= distance;
          } else if (event.key === "ArrowRight") {
            event.currentTarget.scrollLeft += distance;
          } else return;
          event.preventDefault();
        }}
        onPointerDown={(event) => {
          if (
            event.button !== 0 ||
            (event.target as HTMLElement).closest("button")
          ) {
            return;
          }
          panRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            scrollLeft: event.currentTarget.scrollLeft,
            scrollTop: event.currentTarget.scrollTop,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
          setIsPanning(true);
          event.preventDefault();
        }}
        onPointerMove={(event) => {
          const pan = panRef.current;
          if (!pan || pan.pointerId !== event.pointerId) return;
          event.currentTarget.scrollLeft =
            pan.scrollLeft - (event.clientX - pan.startX);
          event.currentTarget.scrollTop =
            pan.scrollTop - (event.clientY - pan.startY);
        }}
        onPointerUp={(event) => {
          if (panRef.current?.pointerId !== event.pointerId) return;
          panRef.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
          setIsPanning(false);
        }}
        onPointerCancel={() => {
          panRef.current = null;
          setIsPanning(false);
        }}
      >
        <div
          className="two-d-zoom-space"
          style={{
            width: (stage.width + FREE_PAN_PADDING * 2) * zoom,
            height: (stage.height + FREE_PAN_PADDING * 2) * zoom,
          }}
        >
          <div
            className="logical-stage-origin"
            style={{
              left: FREE_PAN_PADDING * zoom,
              top: FREE_PAN_PADDING * zoom,
            }}
          >
            <div
              className={`two-d-stage logical-stage ${
                isLargeGraph ? "large-map-stage" : ""
              }`}
              style={{
                width: stage.width,
                height: stage.height,
                ...(isLargeGraph
                  ? { zoom }
                  : { transform: `scale(${zoom})` }),
              }}
            >
              <svg
                className={`two-d-lines logical-lines ${
                  selectedId ? "has-selection" : ""
                }`}
                viewBox={`${lineViewport.left} ${lineViewport.top} ${lineViewport.width} ${lineViewport.height}`}
                style={{
                  left: lineViewport.left,
                  top: lineViewport.top,
                  right: "auto",
                  bottom: "auto",
                  width: lineViewport.width,
                  height: lineViewport.height,
                }}
                aria-hidden="true"
              >
                <defs>
                  <marker
                    id="logical-arrow"
                    viewBox="0 0 8 8"
                    refX="7"
                    refY="4"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 8 4 L 0 8 z" />
                  </marker>
                </defs>
                {viewportEdges.map((edge) => {
                  const route = edgeRoutes.get(edge.id);
                  if (!route) return null;
                  const highlighted =
                    !focusConnections ||
                    !selectedId ||
                    edge.source === selectedId ||
                    edge.target === selectedId;
                  const directlyRelated =
                    Boolean(selectedId) &&
                    (edge.source === selectedId ||
                      edge.target === selectedId);
                  return (
                    <g
                      key={edge.id}
                      className={`logical-edge relation-${edge.kind} ${
                        highlighted ? "highlighted" : "muted"
                      }`}
                    >
                      <path
                        d={route.path}
                        markerEnd="url(#logical-arrow)"
                      />
                      {(edge.kind === "starts" || directlyRelated) && (
                        <text x={route.label.x} y={route.label.y}>
                          {edge.label}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
              {viewportNodes.map((node) => {
                const position = positions.get(node.id);
                if (!position) return null;
                return (
                  <div
                    className={
                      focusConnections &&
                      relatedIds &&
                      !relatedIds.has(node.id)
                        ? "logical-node-wrap muted"
                        : "logical-node-wrap"
                    }
                    key={node.id}
                  >
                    <WorkflowNode
                      node={node}
                      position={position}
                      zoom={zoom}
                      selected={selectedId === node.id}
                      freePositioning={freePositioning}
                      onMove={updatePosition}
                      onSelect={onSelectNode}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="two-d-zoom-controls">
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => changeZoomByStep(-1)}
        >
          <Minus size={14} />
        </button>
        <button
          type="button"
          className="zoom-value"
          aria-label="Reset zoom"
          onClick={() => changeZoom(DEFAULT_ZOOM)}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => changeZoomByStep(1)}
        >
          <Plus size={14} />
        </button>
        <button
          type="button"
          aria-label="Focus selected code part"
          onClick={() => focusNode(selectedId ?? "project")}
        >
          <Focus size={14} />
        </button>
      </div>
    </div>
  );
}
