import type { VisualNode } from "../../types";

type Point3D = [number, number, number];

export interface RoutedEdgePoints {
  start: Point3D;
  end: Point3D;
  midA: Point3D;
  midB: Point3D;
}

export function routedEdgePoints(
  source: VisualNode,
  target: VisualNode,
  isImport: boolean,
  lane: number,
): RoutedEdgePoints {
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
  const start: Point3D = [
    sourceX + unitX * clearance,
    sourceY + unitY * clearance,
    sourceZ + unitZ * clearance,
  ];
  const end: Point3D = [
    targetX - unitX * clearance,
    targetY - unitY * clearance,
    targetZ - unitZ * clearance,
  ];

  const routeY = isImport
    ? Math.max(start[1], end[1]) + 1.15 + (lane % 3) * 0.22
    : start[1] + (end[1] - start[1]) * 0.5;

  return {
    start,
    end,
    midA: [start[0], routeY, start[2]],
    midB: [end[0], routeY, end[2]],
  };
}
