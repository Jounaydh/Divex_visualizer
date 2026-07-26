import {
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from "react";
import type { Camera, WebGLRenderer } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type {
  AutolockAnimation,
  RingRotations,
  VerticalBounds,
} from "./threeDGeometry";
import { ROTATION_SENSITIVITY } from "./threeDGeometry";

const CTRL_WHEEL_ZOOM_FACTOR = 0.1;
const CTRL_WHEEL_ZOOM_INTERVAL_MS = 140;

interface UseThreeDGesturesOptions {
  camera: Camera;
  gl: WebGLRenderer;
  controlsRef: RefObject<OrbitControlsImpl | null>;
  rotationPivotId: string;
  verticalBounds: VerticalBounds;
  autolockAnimationRef: MutableRefObject<AutolockAnimation | null>;
  setRingRotations: Dispatch<SetStateAction<RingRotations>>;
}

export function useThreeDGestures({
  camera,
  gl,
  controlsRef,
  rotationPivotId,
  verticalBounds,
  autolockAnimationRef,
  setRingRotations,
}: UseThreeDGesturesOptions) {
  const lastCtrlWheelZoomAtRef = useRef(0);

  useEffect(() => {
    const gestureSurface =
      gl.domElement.closest<HTMLElement>(".visualizer-canvas") ??
      gl.domElement.parentElement ??
      gl.domElement;
    let activePointerId: number | null = null;
    let previousPointerX = 0;

    const stopDragging = (pointerId?: number) => {
      if (
        activePointerId === null ||
        (pointerId !== undefined && pointerId !== activePointerId)
      ) {
        return;
      }
      if (gl.domElement.hasPointerCapture(activePointerId)) {
        gl.domElement.releasePointerCapture(activePointerId);
      }
      activePointerId = null;
      gestureSurface.classList.remove("is-three-dragging");
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0) return;
      activePointerId = event.pointerId;
      previousPointerX = event.clientX;
      gl.domElement.setPointerCapture(event.pointerId);
      gestureSurface.classList.add("is-three-dragging");
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== activePointerId) return;
      const deltaX = event.clientX - previousPointerX;
      previousPointerX = event.clientX;
      if (deltaX === 0) return;

      event.preventDefault();
      autolockAnimationRef.current = null;
      setRingRotations((current) => ({
        ...current,
        [rotationPivotId]:
          (current[rotationPivotId] ?? 0) +
          deltaX * ROTATION_SENSITIVITY,
      }));
    };

    const handlePointerEnd = (event: PointerEvent) => {
      stopDragging(event.pointerId);
    };

    const handleTrackpadGesture = (event: WheelEvent) => {
      const controls = controlsRef.current;
      if (!controls) return;
      event.preventDefault();
      event.stopImmediatePropagation();

      const distance = controls.getDistance();
      if (event.ctrlKey) {
        if (
          event.deltaY === 0 ||
          event.timeStamp - lastCtrlWheelZoomAtRef.current <
            CTRL_WHEEL_ZOOM_INTERVAL_MS
        ) {
          return;
        }

        lastCtrlWheelZoomAtRef.current = event.timeStamp;
        const direction = camera.position.clone().sub(controls.target);
        if (direction.lengthSq() < 0.01) return;
        const zoomFactor =
          event.deltaY > 0
            ? 1 + CTRL_WHEEL_ZOOM_FACTOR
            : 1 - CTRL_WHEEL_ZOOM_FACTOR;
        const nextDistance = Math.min(
          controls.maxDistance,
          Math.max(controls.minDistance, distance * zoomFactor),
        );
        direction.setLength(nextDistance);
        camera.position.copy(controls.target).add(direction);
        controls.update();
        return;
      }

      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        autolockAnimationRef.current = null;
        setRingRotations((current) => ({
          ...current,
          [rotationPivotId]:
            (current[rotationPivotId] ?? 0) +
            event.deltaX * ROTATION_SENSITIVITY,
        }));
        return;
      }

      autolockAnimationRef.current = null;
      const requestedMovement = event.deltaY * 0.009 * (distance / 35);
      const nextTargetY = Math.min(
        verticalBounds.max,
        Math.max(
          verticalBounds.min,
          controls.target.y + requestedMovement,
        ),
      );
      const appliedMovement = nextTargetY - controls.target.y;
      controls.target.y = nextTargetY;
      camera.position.y += appliedMovement;
      controls.update();
    };

    const handleWindowBlur = () => stopDragging();
    gestureSurface.addEventListener("wheel", handleTrackpadGesture, {
      passive: false,
      capture: true,
    });
    gl.domElement.addEventListener("pointerdown", handlePointerDown);
    gl.domElement.addEventListener("pointermove", handlePointerMove);
    gl.domElement.addEventListener("pointerup", handlePointerEnd);
    gl.domElement.addEventListener("pointercancel", handlePointerEnd);
    gl.domElement.addEventListener("lostpointercapture", handlePointerEnd);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      stopDragging();
      gestureSurface.removeEventListener("wheel", handleTrackpadGesture, {
        capture: true,
      });
      gl.domElement.removeEventListener("pointerdown", handlePointerDown);
      gl.domElement.removeEventListener("pointermove", handlePointerMove);
      gl.domElement.removeEventListener("pointerup", handlePointerEnd);
      gl.domElement.removeEventListener("pointercancel", handlePointerEnd);
      gl.domElement.removeEventListener(
        "lostpointercapture",
        handlePointerEnd,
      );
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [
    autolockAnimationRef,
    camera,
    controlsRef,
    gl,
    rotationPivotId,
    setRingRotations,
    verticalBounds,
  ]);
}
