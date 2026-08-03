import {
  Eye,
  EyeOff,
  Focus,
  Minus,
  Plus,
  Route,
} from "lucide-react";
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
} from "../types";
import {
  buildLogicalWorkflowGraph,
  LOGICAL_EDGE_KINDS,
  LOGICAL_EDGE_LABELS,
  type LogicalEdgeKind,
} from "../visualization/buildLogicalWorkflowGraph";
import {
  createLogicalEdgeRoutes,
  createLogicalWorkflowLayout,
  LOGICAL_NODE_HEIGHT,
  LOGICAL_NODE_WIDTH,
} from "../visualization/logicalWorkflowLayout";
import { WorkflowNode } from "./WorkflowNode";

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
}

const DEFAULT_ZOOM = 0.8;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 1.8;
const EXECUTION_EDGE_KINDS: LogicalEdgeKind[] = [
  "starts",
  "calls",
  "creates",
];
const LARGE_GRAPH_NODE_THRESHOLD = 450;
const LARGE_GRAPH_EDGE_THRESHOLD = 900;
const UNSAFE_FULL_GRAPH_NODE_THRESHOLD = 1200;
const UNSAFE_FULL_GRAPH_EDGE_THRESHOLD = 3000;
const PERFORMANCE_NODE_BUDGET = 180;
const PERFORMANCE_EDGE_BUDGET = 320;
const MAX_VIEWPORT_EDGES = 420;
const VIEWPORT_OVERSCAN = 420;
const FREE_PAN_PADDING = 1200;

interface LogicalViewport {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const edgeRenderPriority: Record<LogicalEdgeKind, number> = {
  starts: 0,
  calls: 1,
  creates: 2,
  extends: 3,
  implements: 3,
  defines: 4,
  imports: 5,
  uses: 6,
  contains: 7,
};

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
}: LogicalWorkflowVisualizerProps) {
  const graph = useMemo(() => buildLogicalWorkflowGraph(project), [project]);
  const [visibleKinds, setVisibleKinds] = useState<Set<LogicalEdgeKind>>(
    () => new Set(EXECUTION_EDGE_KINDS),
  );
  const [filtersOpen, setFiltersOpen] = useState(true);
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
  const zoomRef = useRef(zoom);
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

  const filteredEdges = useMemo(
    () => graph.edges.filter((edge) => visibleKinds.has(edge.kind)),
    [graph.edges, visibleKinds],
  );
  const filteredNodes = useMemo(() => {
    const endpointIds = new Set(["project"]);
    filteredEdges.forEach((edge) => {
      endpointIds.add(edge.source);
      endpointIds.add(edge.target);
    });
    if (selectedId) endpointIds.add(selectedId);
    return graph.nodes.filter((node) => endpointIds.has(node.id));
  }, [filteredEdges, graph.nodes, selectedId]);
  const isLargeGraph =
    filteredNodes.length > LARGE_GRAPH_NODE_THRESHOLD ||
    filteredEdges.length > LARGE_GRAPH_EDGE_THRESHOLD;
  const isUnsafeFullGraph =
    filteredNodes.length > UNSAFE_FULL_GRAPH_NODE_THRESHOLD ||
    filteredEdges.length > UNSAFE_FULL_GRAPH_EDGE_THRESHOLD;
  const fullGraphRequested = fullGraphProjectKey === project.rootPath;
  const performanceMode = !fullGraphRequested;
  const scopedGraph = useMemo(() => {
    if (!isLargeGraph || !performanceMode) {
      return { nodes: filteredNodes, edges: filteredEdges };
    }

    const allowedNodeIds = new Set(filteredNodes.map((node) => node.id));
    const adjacency = new Map<string, VisualNode["id"][]>();
    [...filteredEdges]
      .sort(
        (left, right) =>
          edgeRenderPriority[left.kind] - edgeRenderPriority[right.kind],
      )
      .forEach((edge) => {
        const sourceLinks = adjacency.get(edge.source) ?? [];
        sourceLinks.push(edge.target);
        adjacency.set(edge.source, sourceLinks);
        const targetLinks = adjacency.get(edge.target) ?? [];
        targetLinks.push(edge.source);
        adjacency.set(edge.target, targetLinks);
      });

    const includedIds = new Set<string>();
    const queue = [selectedId, "project"].filter(
      (id): id is string => Boolean(id && allowedNodeIds.has(id)),
    );
    let cursor = 0;
    while (
      cursor < queue.length &&
      includedIds.size < PERFORMANCE_NODE_BUDGET
    ) {
      const nodeId = queue[cursor];
      cursor += 1;
      if (includedIds.has(nodeId)) continue;
      includedIds.add(nodeId);
      (adjacency.get(nodeId) ?? []).forEach((neighborId) => {
        if (
          !includedIds.has(neighborId) &&
          queue.length < PERFORMANCE_NODE_BUDGET * 3
        ) {
          queue.push(neighborId);
        }
      });
    }

    const scopedEdges = [...filteredEdges]
      .filter(
        (edge) =>
          includedIds.has(edge.source) && includedIds.has(edge.target),
      )
      .sort(
        (left, right) =>
          edgeRenderPriority[left.kind] - edgeRenderPriority[right.kind],
      )
      .slice(0, PERFORMANCE_EDGE_BUDGET);
    const connectedIds = new Set(["project"]);
    if (selectedId) connectedIds.add(selectedId);
    scopedEdges.forEach((edge) => {
      connectedIds.add(edge.source);
      connectedIds.add(edge.target);
    });

    return {
      nodes: filteredNodes.filter((node) => connectedIds.has(node.id)),
      edges: scopedEdges,
    };
  }, [
    filteredEdges,
    filteredNodes,
    isLargeGraph,
    performanceMode,
    selectedId,
  ]);
  const visibleEdges = scopedGraph.edges;
  const visibleNodes = scopedGraph.nodes;
  const layout = useMemo(
    () => createLogicalWorkflowLayout(visibleNodes, visibleEdges, direction),
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
      createLogicalEdgeRoutes(
        visibleNodes,
        visibleEdges,
        positions,
        direction,
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

  positionsRef.current = positions;
  zoomRef.current = zoom;

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
    const frame = window.requestAnimationFrame(() =>
      focusNode(selectedId ?? "project"),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [direction, focusNode, selectedId, layout.height, layout.width]);

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
      if (event.ctrlKey) {
        event.preventDefault();
        const delta =
          event.deltaMode === WheelEvent.DOM_DELTA_PIXEL
            ? event.deltaY
            : event.deltaY * 16;
        const nextZoom = Math.min(
          MAX_ZOOM,
          Math.max(MIN_ZOOM, zoomRef.current * Math.exp(-delta * 0.01)),
        );
        zoomRef.current = nextZoom;
        onZoomChange(nextZoom);
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
  }, [onZoomChange]);

  const changeZoom = (value: number) => {
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
    zoomRef.current = next;
    onZoomChange(next);
  };

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
      <div
        className={`logical-filter-panel ${filtersOpen ? "open" : ""}`}
      >
        <button
          type="button"
          className="logical-filter-heading"
          onClick={() => setFiltersOpen((value) => !value)}
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
              Execution flow stays focused by default. Turn on definitions or
              imports when you need the surrounding architecture.
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
                      ? `Kader-sized maps cannot safely use one giant surface. Showing ${visibleNodes.length} of ${filteredNodes.length} items and ${visibleEdges.length} of ${filteredEdges.length} links around the current selection.`
                      : isUnsafeFullGraph
                        ? `Showing all ${filteredNodes.length} items and ${filteredEdges.length} links. Layout may pause briefly, but off-screen cards and lines remain suspended.`
                      : performanceMode
                      ? `Showing ${visibleNodes.length} of ${filteredNodes.length} items and ${visibleEdges.length} of ${filteredEdges.length} links. Select an item to rebuild the map around it.`
                      : `${filteredNodes.length} items and ${filteredEdges.length} links. Off-screen elements are still paused.`}
                  </small>
                </span>
                <button
                  type="button"
                  disabled={isGraphPending}
                  onClick={() =>
                    startGraphTransition(() =>
                      setFullGraphProjectKey(
                        performanceMode ? project.rootPath : null,
                      ),
                    )
                  }
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
              onClick={() => setFocusConnections((value) => !value)}
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
                  onClick={() => toggleKind(kind)}
                >
                  <i className={`logic-swatch relation-${kind}`} />
                  <span>{LOGICAL_EDGE_LABELS[kind]}</span>
                  <small>{graph.counts[kind]}</small>
                </button>
              ))}
            </div>
            <div className="logical-presets">
              <button
                type="button"
                onClick={() =>
                  setVisibleKinds(new Set(EXECUTION_EDGE_KINDS))
                }
              >
                Execution flow
              </button>
              <button
                type="button"
                onClick={() =>
                  setVisibleKinds(new Set(LOGICAL_EDGE_KINDS))
                }
              >
                Every relationship
              </button>
            </div>
          </>
        )}
      </div>

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
          onClick={() => changeZoom(zoom - 0.1)}
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
          onClick={() => changeZoom(zoom + 0.1)}
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
