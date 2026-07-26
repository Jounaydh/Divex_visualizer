import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEventHandler,
  type PointerEventHandler,
} from "react";
import type {
  WorkflowDirection,
  WorkflowPosition,
} from "../../../types";
import {
  TWO_D_NODE_HEIGHT,
  TWO_D_NODE_WIDTH,
} from "../../../visualization/twoDLayout";

export const DEFAULT_TWO_D_ZOOM = 1.4;
const MIN_TWO_D_ZOOM = 0.55;
const MAX_TWO_D_ZOOM = 1.8;
const CTRL_WHEEL_ZOOM_STEP = 0.1;
const CTRL_WHEEL_ZOOM_INTERVAL_MS = 140;

export const clampTwoDZoom = (zoom: number) =>
  Math.min(MAX_TWO_D_ZOOM, Math.max(MIN_TWO_D_ZOOM, zoom));

interface UseTwoDViewportOptions {
  positions: ReadonlyMap<string, WorkflowPosition>;
  zoom: number;
  selectedId: string | null;
  layoutWidth: number;
  layoutHeight: number;
  direction: WorkflowDirection;
  onZoomChange: (zoom: number) => void;
}

interface PanState {
  pointerId: number;
  startX: number;
  startY: number;
  scrollLeft: number;
  scrollTop: number;
}

export function useTwoDViewport({
  positions,
  zoom,
  selectedId,
  layoutWidth,
  layoutHeight,
  direction,
  onZoomChange,
}: UseTwoDViewportOptions) {
  const [isPanning, setIsPanning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const positionsRef = useRef(positions);
  const zoomRef = useRef(zoom);
  const panStateRef = useRef<PanState | null>(null);
  const lastCtrlWheelZoomAtRef = useRef(0);

  useEffect(() => {
    positionsRef.current = positions;
    zoomRef.current = zoom;
  }, [positions, zoom]);

  const focusNode = useCallback(
    (nodeId: string, behavior: ScrollBehavior = "smooth") => {
      const container = scrollRef.current;
      const position = positionsRef.current.get(nodeId);
      if (!container || !position) return;

      container.scrollTo({
        left:
          (position.x + TWO_D_NODE_WIDTH / 2) * zoomRef.current -
          container.clientWidth / 2,
        top:
          (position.y + TWO_D_NODE_HEIGHT / 2) * zoomRef.current -
          container.clientHeight / 2,
        behavior,
      });
    },
    [],
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      focusNode(selectedId ?? "project");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [direction, focusNode, layoutHeight, layoutWidth, selectedId]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey) {
        event.preventDefault();
        if (
          event.deltaY === 0 ||
          event.timeStamp - lastCtrlWheelZoomAtRef.current <
            CTRL_WHEEL_ZOOM_INTERVAL_MS
        ) {
          return;
        }

        lastCtrlWheelZoomAtRef.current = event.timeStamp;
        const nextZoom = clampTwoDZoom(
          zoomRef.current +
            (event.deltaY < 0
              ? CTRL_WHEEL_ZOOM_STEP
              : -CTRL_WHEEL_ZOOM_STEP),
        );
        zoomRef.current = nextZoom;
        onZoomChange(nextZoom);
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
  }, [onZoomChange]);

  const handleKeyDown: KeyboardEventHandler<HTMLDivElement> = (event) => {
    const container = event.currentTarget;
    const distance = event.shiftKey ? 120 : 52;
    if (event.key === "ArrowUp") container.scrollTop -= distance;
    else if (event.key === "ArrowDown") container.scrollTop += distance;
    else if (event.key === "ArrowLeft") container.scrollLeft -= distance;
    else if (event.key === "ArrowRight") container.scrollLeft += distance;
    else return;
    event.preventDefault();
  };

  const handlePointerDown: PointerEventHandler<HTMLDivElement> = (event) => {
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
  };

  const handlePointerMove: PointerEventHandler<HTMLDivElement> = (event) => {
    const pan = panStateRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    event.currentTarget.scrollLeft =
      pan.scrollLeft - (event.clientX - pan.startX);
    event.currentTarget.scrollTop =
      pan.scrollTop - (event.clientY - pan.startY);
  };

  const stopPanning: PointerEventHandler<HTMLDivElement> = (event) => {
    if (panStateRef.current?.pointerId !== event.pointerId) return;
    panStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsPanning(false);
  };

  return {
    scrollRef,
    isPanning,
    focusNode,
    handleKeyDown,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp: stopPanning,
    handlePointerCancel: stopPanning,
  };
}
