import {
  Braces,
  FileCode2,
  Focus,
  Folder,
  Layers3,
  Minus,
  Plus,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AnalyzedProject, VisualNode } from "../types";
import { buildVisualGraph } from "../visualization/buildVisualGraph";

interface TwoDVisualizerProps {
  project: AnalyzedProject;
  expandedFolders: Set<string>;
  expandedFiles: Set<string>;
  selectedId: string | null;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onSelectNode: (node: VisualNode) => void;
  onToggleFolder: (id: string) => void;
  onToggleFile: (id: string) => void;
}

const DEFAULT_ZOOM = 1.4;
const MIN_MANUAL_ZOOM = 0.55;
const MAX_ZOOM = 1.8;

function SimpleIcon({ node }: { node: VisualNode }) {
  if (node.kind === "project") return <Layers3 size={15} />;
  if (node.kind === "folder") return <Folder size={15} />;
  if (node.kind === "file") return <FileCode2 size={15} />;
  return <Braces size={15} />;
}

export function TwoDVisualizer({
  project,
  expandedFolders,
  expandedFiles,
  selectedId,
  zoom,
  onZoomChange,
  onSelectNode,
  onToggleFolder,
  onToggleFile,
}: TwoDVisualizerProps) {
  const [isPanning, setIsPanning] = useState(false);
  const graph = useMemo(
    () => buildVisualGraph(project, expandedFolders, expandedFiles),
    [project, expandedFolders, expandedFiles],
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const panStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const minX = Math.min(...graph.nodes.map((node) => node.position[0]));
  const maxX = Math.max(...graph.nodes.map((node) => node.position[0]));
  const minY = Math.min(...graph.nodes.map((node) => node.position[1]));
  const stageWidth = Math.max(980, (maxX - minX) * 72 + 360);
  const stageHeight = Math.max(760, (7 - minY) * 38 + 180);
  const positions = useMemo(
    () =>
      new Map(
        graph.nodes.map((node) => [
          node.id,
          {
            x: (node.position[0] - minX) * 72 + 105,
            y: (7 - node.position[1]) * 38 + 58,
          },
        ]),
      ),
    [graph.nodes, minX],
  );

  const focusNode = useCallback(
    (nodeId: string, behavior: ScrollBehavior = "smooth") => {
      const container = scrollRef.current;
      const position = positions.get(nodeId);
      if (!container || !position) return;
      container.scrollTo({
        left:
          (position.x + 75) * zoom - container.clientWidth / 2,
        top:
          (position.y + 26) * zoom - container.clientHeight / 2,
        behavior,
      });
    },
    [positions, zoom],
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      focusNode(selectedId ?? "project");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusNode, selectedId, stageHeight, stageWidth]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey) {
        event.preventDefault();
        onZoomChange(
          Math.min(
            MAX_ZOOM,
            Math.max(
              MIN_MANUAL_ZOOM,
              zoom * Math.exp(-event.deltaY * 0.01),
            ),
          ),
        );
        return;
      }

      if (event.deltaX === 0 && event.deltaY === 0) return;
      event.preventDefault();
      if (event.shiftKey && Math.abs(event.deltaX) < 0.01) {
        container.scrollLeft += event.deltaY;
        return;
      }
      container.scrollLeft += event.deltaX;
      container.scrollTop += event.deltaY;
    };
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [onZoomChange, zoom]);

  const changeZoom = (nextZoom: number) => {
    onZoomChange(Math.min(MAX_ZOOM, Math.max(MIN_MANUAL_ZOOM, nextZoom)));
  };

  return (
    <div className="two-d-view">
      <div
        className={`two-d-scroll ${isPanning ? "panning" : ""}`}
        ref={scrollRef}
        tabIndex={0}
        aria-label="Scrollable 2D flow"
        onKeyDown={(event) => {
          const container = event.currentTarget;
          const distance = event.shiftKey ? 120 : 52;
          if (event.key === "ArrowUp") container.scrollTop -= distance;
          else if (event.key === "ArrowDown") container.scrollTop += distance;
          else if (event.key === "ArrowLeft") container.scrollLeft -= distance;
          else if (event.key === "ArrowRight") container.scrollLeft += distance;
          else return;
          event.preventDefault();
        }}
        onPointerDown={(event) => {
          if (
            event.button !== 0 ||
            (event.target as HTMLElement).closest("button")
          ) {
            return;
          }
          panStateRef.current = {
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
          const pan = panStateRef.current;
          if (!pan || pan.pointerId !== event.pointerId) return;
          event.currentTarget.scrollLeft =
            pan.scrollLeft - (event.clientX - pan.startX);
          event.currentTarget.scrollTop =
            pan.scrollTop - (event.clientY - pan.startY);
        }}
        onPointerUp={(event) => {
          if (panStateRef.current?.pointerId !== event.pointerId) return;
          panStateRef.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
          setIsPanning(false);
        }}
        onPointerCancel={(event) => {
          if (panStateRef.current?.pointerId !== event.pointerId) return;
          panStateRef.current = null;
          setIsPanning(false);
        }}
      >
        <div
          className="two-d-zoom-space"
          style={{
            width: stageWidth * zoom,
            height: stageHeight * zoom,
          }}
        >
          <div
            className="two-d-stage"
            style={{
              width: stageWidth,
              height: stageHeight,
              transform: `scale(${zoom})`,
            }}
          >
            <svg className="two-d-lines" aria-hidden="true">
              {graph.edges.map((edge) => {
                const source = positions.get(edge.source);
                const target = positions.get(edge.target);
                if (!source || !target) return null;
                const sourceX = source.x + 75;
                const targetX = target.x + 75;
                const path =
                  edge.kind === "imports"
                    ? `M ${sourceX} ${source.y + 26} C ${sourceX} ${
                        source.y + 92
                      }, ${targetX} ${target.y + 92}, ${targetX} ${
                        target.y + 26
                      }`
                    : `M ${sourceX} ${source.y + 52} C ${sourceX} ${
                        source.y + 96
                      }, ${targetX} ${target.y - 44}, ${targetX} ${target.y}`;
                return (
                  <path
                    key={edge.id}
                    d={path}
                    className={edge.kind === "imports" ? "import-link" : ""}
                  />
                );
              })}
            </svg>
            {graph.nodes.map((node) => {
              const position = positions.get(node.id);
              if (!position) return null;
              const toggle =
                node.kind === "folder"
                  ? () => onToggleFolder(node.id)
                  : node.kind === "file"
                    ? () => onToggleFile(node.id)
                    : undefined;

              return (
                <button
                  type="button"
                  key={node.id}
                  className={`two-d-node node-${node.kind} ${
                    selectedId === node.id ? "selected" : ""
                  }`}
                  style={{ left: position.x, top: position.y }}
                  onClick={() => onSelectNode(node)}
                  onDoubleClick={toggle}
                >
                  <SimpleIcon node={node} />
                  <span>
                    <strong>{node.label}</strong>
                    <small>{node.subtitle}</small>
                  </span>
                </button>
              );
            })}
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
          aria-label="Focus selected item"
          onClick={() => focusNode(selectedId ?? "project")}
        >
          <Focus size={14} />
        </button>
      </div>
    </div>
  );
}
