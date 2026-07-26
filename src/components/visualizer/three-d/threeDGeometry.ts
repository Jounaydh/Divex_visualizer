import type { VisualNode } from "../../../types";

export const CAMERA_POLAR_ANGLE = Math.PI * 0.4;
export const CAMERA_POSITION: [number, number, number] = [0, 12, 35];
export const CAMERA_TARGET: [number, number, number] = [0, 1, 0];
export const MIN_CAMERA_DISTANCE = 9;
export const MAX_CAMERA_DISTANCE = 80;
export const VERTICAL_CENTER_MARGIN = 0.35;
export const AUTOLOCK_EASING = 7.5;
export const ROTATION_SENSITIVITY = 0.0045;

export type RingRotations = Record<string, number>;

export interface VerticalBounds {
  min: number;
  max: number;
}

export interface AutolockAnimation {
  parentId?: string;
  targetRotation?: number;
  targetY: number;
}

export function shortestAngleDifference(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

export function routedEdgePoints(
  source: VisualNode,
  target: VisualNode,
  isImport: boolean,
  lane: number,
) {
  const [sourceX, sourceY, sourceZ] = source.position;
  const [targetX, targetY, targetZ] = target.position;
  const deltaX = targetX - sourceX;
  const deltaY = targetY - sourceY;
  const deltaZ = targetZ - sourceZ;
  const distance = Math.max(0.001, Math.hypot(deltaX, deltaY, deltaZ));
  const clearance = Math.min(0.9, distance * 0.18);
  const unitX = deltaX / distance;
  const unitY = deltaY / distance;
  const unitZ = deltaZ / distance;
  const start: [number, number, number] = [
    sourceX + unitX * clearance,
    sourceY + unitY * clearance,
    sourceZ + unitZ * clearance,
  ];
  const end: [number, number, number] = [
    targetX - unitX * clearance,
    targetY - unitY * clearance,
    targetZ - unitZ * clearance,
  ];

  if (isImport) {
    const routeY = Math.max(start[1], end[1]) + 1.15 + (lane % 3) * 0.22;
    return {
      start,
      end,
      midA: [start[0], routeY, start[2]] as [number, number, number],
      midB: [end[0], routeY, end[2]] as [number, number, number],
    };
  }

  const routeY = start[1] + (end[1] - start[1]) * 0.5;
  return {
    start,
    end,
    midA: [start[0], routeY, start[2]] as [number, number, number],
    midB: [end[0], routeY, end[2]] as [number, number, number],
  };
}
