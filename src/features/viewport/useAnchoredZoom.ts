import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
} from "react";

export const ZOOM_STEP = 0.1;
export const WHEEL_ZOOM_THRESHOLD = 24;
const WHEEL_GESTURE_RESET_MS = 180;
const DOM_DELTA_PIXEL = 0;
const DOM_DELTA_LINE = 1;
const DOM_DELTA_PAGE = 2;

interface ViewportPoint {
  clientX: number;
  clientY: number;
}

interface ZoomAnchor {
  contentX: number;
  contentY: number;
  viewportX: number;
  viewportY: number;
}

interface AnchoredScrollInput {
  contentX: number;
  contentY: number;
  viewportX: number;
  viewportY: number;
  zoom: number;
}

interface UseAnchoredZoomOptions {
  scrollRef: RefObject<HTMLDivElement | null>;
  zoom: number;
  minZoom: number;
  maxZoom: number;
  onZoomChange: (zoom: number) => void;
}

export function clampZoom(value: number, minZoom: number, maxZoom: number) {
  return Math.min(maxZoom, Math.max(minZoom, Math.round(value * 100) / 100));
}

export function stepZoom(
  currentZoom: number,
  direction: -1 | 1,
  minZoom: number,
  maxZoom: number,
) {
  return clampZoom(currentZoom + direction * ZOOM_STEP, minZoom, maxZoom);
}

export function normalizeWheelDelta(
  deltaY: number,
  deltaMode: number,
  viewportHeight: number,
) {
  if (deltaMode === DOM_DELTA_LINE) return deltaY * 16;
  if (deltaMode === DOM_DELTA_PAGE) {
    return deltaY * Math.max(viewportHeight, 1);
  }
  if (deltaMode !== DOM_DELTA_PIXEL) return deltaY;
  return deltaY;
}

export function anchoredScrollPosition({
  contentX,
  contentY,
  viewportX,
  viewportY,
  zoom,
}: AnchoredScrollInput) {
  return {
    left: contentX * zoom - viewportX,
    top: contentY * zoom - viewportY,
  };
}

function captureZoomAnchor(
  container: HTMLDivElement,
  currentZoom: number,
  point?: ViewportPoint,
): ZoomAnchor {
  const bounds = container.getBoundingClientRect();
  const viewportX = point
    ? Math.min(container.clientWidth, Math.max(0, point.clientX - bounds.left))
    : container.clientWidth / 2;
  const viewportY = point
    ? Math.min(container.clientHeight, Math.max(0, point.clientY - bounds.top))
    : container.clientHeight / 2;
  const safeZoom = Math.max(currentZoom, 0.01);

  return {
    contentX: (container.scrollLeft + viewportX) / safeZoom,
    contentY: (container.scrollTop + viewportY) / safeZoom,
    viewportX,
    viewportY,
  };
}

export function useAnchoredZoom({
  scrollRef,
  zoom,
  minZoom,
  maxZoom,
  onZoomChange,
}: UseAnchoredZoomOptions) {
  const zoomRef = useRef(zoom);
  const pendingAnchorRef = useRef<ZoomAnchor | null>(null);
  const wheelDeltaRef = useRef(0);
  const wheelDirectionRef = useRef(0);
  const wheelResetTimerRef = useRef<number | null>(null);
  zoomRef.current = zoom;

  const clearWheelGesture = useCallback(() => {
    wheelDeltaRef.current = 0;
    wheelDirectionRef.current = 0;
    if (wheelResetTimerRef.current !== null) {
      window.clearTimeout(wheelResetTimerRef.current);
      wheelResetTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearWheelGesture, [clearWheelGesture]);

  useLayoutEffect(() => {
    const container = scrollRef.current;
    const anchor = pendingAnchorRef.current;
    if (!container || !anchor) return;

    const nextScroll = anchoredScrollPosition({ ...anchor, zoom });
    container.scrollLeft = nextScroll.left;
    container.scrollTop = nextScroll.top;
    pendingAnchorRef.current = null;
  }, [scrollRef, zoom]);

  const changeZoom = useCallback(
    (requestedZoom: number, point?: ViewportPoint) => {
      const container = scrollRef.current;
      const nextZoom = clampZoom(requestedZoom, minZoom, maxZoom);
      const currentZoom = zoomRef.current;
      if (Math.abs(nextZoom - currentZoom) < 0.001) return;

      if (container) {
        pendingAnchorRef.current = captureZoomAnchor(
          container,
          currentZoom,
          point,
        );
      }
      zoomRef.current = nextZoom;
      onZoomChange(nextZoom);
    },
    [maxZoom, minZoom, onZoomChange, scrollRef],
  );

  const changeZoomByStep = useCallback(
    (direction: -1 | 1, point?: ViewportPoint) => {
      changeZoom(
        stepZoom(zoomRef.current, direction, minZoom, maxZoom),
        point,
      );
    },
    [changeZoom, maxZoom, minZoom],
  );

  const handleControlWheel = useCallback(
    (event: WheelEvent) => {
      if (!event.ctrlKey) return false;
      event.preventDefault();

      const delta = normalizeWheelDelta(
        event.deltaY,
        event.deltaMode,
        event.currentTarget instanceof HTMLElement
          ? event.currentTarget.clientHeight
          : 1,
      );
      if (Math.abs(delta) < 0.01) return true;

      const direction = Math.sign(delta);
      if (
        wheelDirectionRef.current !== 0 &&
        wheelDirectionRef.current !== direction
      ) {
        wheelDeltaRef.current = 0;
      }
      wheelDirectionRef.current = direction;
      wheelDeltaRef.current += delta;

      if (wheelResetTimerRef.current !== null) {
        window.clearTimeout(wheelResetTimerRef.current);
      }
      wheelResetTimerRef.current = window.setTimeout(
        clearWheelGesture,
        WHEEL_GESTURE_RESET_MS,
      );

      if (Math.abs(wheelDeltaRef.current) < WHEEL_ZOOM_THRESHOLD) return true;
      wheelDeltaRef.current = 0;
      changeZoomByStep(delta < 0 ? 1 : -1, {
        clientX: event.clientX,
        clientY: event.clientY,
      });
      return true;
    },
    [changeZoomByStep, clearWheelGesture],
  );

  return {
    zoomRef,
    changeZoom,
    changeZoomByStep,
    handleControlWheel,
  };
}
