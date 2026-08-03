import type {
  VisualEdge,
  VisualNode,
  WorkflowDirection,
  WorkflowPosition,
} from "../types";

export const LOGICAL_NODE_WIDTH = 176;
export const LOGICAL_NODE_HEIGHT = 58;

const BREADTH_GAP = 54;
const DEPTH_GAP = 126;
const STAGE_PADDING = 148;
const MAX_NODES_PER_LAYER = 6;
const MAX_LOGICAL_DEPTH = 10;
const EDGE_CLEARANCE = 28;
const EDGE_LANE_SPACING = 9;
const OBSTACLE_CLEARANCE = 13;

export interface LogicalLayout {
  positions: Map<string, WorkflowPosition>;
  width: number;
  height: number;
}

export interface LogicalEdgeRoute {
  path: string;
  label: WorkflowPosition;
  bounds: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
}

interface AxisPoint {
  breadth: number;
  depth: number;
}

interface AxisRect {
  id: string;
  breadthStart: number;
  breadthEnd: number;
  depthStart: number;
  depthEnd: number;
}

interface TrackReservation {
  breadth: number;
  depthStart: number;
  depthEnd: number;
}

const ROUTE_BUCKET_SIZE = LOGICAL_NODE_HEIGHT + DEPTH_GAP;
const RESERVATION_BUCKET_SIZE = 16;
const MAX_NEARBY_OBSTACLES = 16;

const RANK_INCREMENT: Record<VisualEdge["kind"], number> = {
  starts: 2,
  defines: 1,
  contains: 1,
  imports: 0,
  calls: 1,
  creates: 1,
  extends: 1,
  implements: 1,
  uses: 1,
};

const edgePriority = (edge: VisualEdge) => {
  if (edge.kind === "starts") return 0;
  if (edge.kind === "calls" || edge.kind === "creates") return 1;
  if (edge.kind === "defines") return 2;
  if (edge.kind === "extends" || edge.kind === "implements") return 3;
  if (edge.kind === "uses") return 4;
  if (edge.kind === "imports") return 5;
  return 6;
};

function intrinsicRank(node: VisualNode, nodeById: Map<string, VisualNode>) {
  if (node.id === "project") return 0;
  if (node.kind === "file") return 1;
  if (node.kind === "external" && node.parentId === "project") return 1;
  const parent = node.parentId ? nodeById.get(node.parentId) : undefined;
  if (parent && parent.kind !== "file" && parent.kind !== "project") return 3;
  return 2;
}

function buildStronglyConnectedComponents(
  nodes: VisualNode[],
  edges: VisualEdge[],
) {
  const visibleIds = new Set(nodes.map((node) => node.id));
  const adjacency = new Map<string, string[]>();
  const reverseAdjacency = new Map<string, string[]>();
  nodes.forEach((node) => {
    adjacency.set(node.id, []);
    reverseAdjacency.set(node.id, []);
  });
  edges.forEach((edge) => {
    if (!visibleIds.has(edge.source) || !visibleIds.has(edge.target)) return;
    adjacency.get(edge.source)?.push(edge.target);
    reverseAdjacency.get(edge.target)?.push(edge.source);
  });

  const visited = new Set<string>();
  const finishOrder: string[] = [];
  nodes.forEach((node) => {
    if (visited.has(node.id)) return;
    const stack: Array<{ id: string; expanded: boolean }> = [
      { id: node.id, expanded: false },
    ];
    visited.add(node.id);
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) break;
      if (current.expanded) {
        finishOrder.push(current.id);
        continue;
      }
      stack.push({ id: current.id, expanded: true });
      const neighbors = adjacency.get(current.id) ?? [];
      for (let index = neighbors.length - 1; index >= 0; index -= 1) {
        const neighborId = neighbors[index];
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);
        stack.push({ id: neighborId, expanded: false });
      }
    }
  });

  const components: string[][] = [];
  const assigned = new Set<string>();
  for (
    let orderIndex = finishOrder.length - 1;
    orderIndex >= 0;
    orderIndex -= 1
  ) {
    const rootId = finishOrder[orderIndex];
    if (assigned.has(rootId)) continue;
    const component: string[] = [];
    const stack = [rootId];
    assigned.add(rootId);
    while (stack.length > 0) {
      const memberId = stack.pop();
      if (!memberId) break;
      component.push(memberId);
      (reverseAdjacency.get(memberId) ?? []).forEach((neighborId) => {
        if (assigned.has(neighborId)) return;
        assigned.add(neighborId);
        stack.push(neighborId);
      });
    }
    components.push(component);
  }

  const componentByNodeId = new Map<string, number>();
  components.forEach((component, componentIndex) => {
    component.forEach((nodeId) =>
      componentByNodeId.set(nodeId, componentIndex),
    );
  });
  return { components, componentByNodeId };
}

function buildRanks(nodes: VisualNode[], edges: VisualEdge[]) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const { components, componentByNodeId } =
    buildStronglyConnectedComponents(nodes, edges);
  const componentRank = components.map((component) =>
    Math.max(
      ...component.map((nodeId) =>
        intrinsicRank(nodeById.get(nodeId) as VisualNode, nodeById),
      ),
    ),
  );
  const outgoing = new Map<
    number,
    Array<{ target: number; increment: number }>
  >();
  const indegree = new Array(components.length).fill(0) as number[];
  const componentEdges = new Set<string>();

  edges.forEach((edge) => {
    const source = componentByNodeId.get(edge.source);
    const target = componentByNodeId.get(edge.target);
    if (source === undefined || target === undefined || source === target) {
      return;
    }
    const key = `${source}:${target}:${edge.kind}`;
    if (componentEdges.has(key)) return;
    componentEdges.add(key);
    const links = outgoing.get(source) ?? [];
    links.push({ target, increment: RANK_INCREMENT[edge.kind] });
    outgoing.set(source, links);
    indegree[target] += 1;
  });

  const queue = indegree
    .map((value, index) => ({ value, index }))
    .filter(({ value }) => value === 0)
    .map(({ index }) => index);
  while (queue.length > 0) {
    const source = queue.shift();
    if (source === undefined) break;
    (outgoing.get(source) ?? []).forEach(({ target, increment }) => {
      componentRank[target] = Math.min(
        MAX_LOGICAL_DEPTH,
        Math.max(componentRank[target], componentRank[source] + increment),
      );
      indegree[target] -= 1;
      if (indegree[target] === 0) queue.push(target);
    });
  }

  const rank = new Map<string, number>();
  components.forEach((component, componentIndex) => {
    component.forEach((nodeId) =>
      rank.set(nodeId, componentRank[componentIndex]),
    );
  });
  return rank;
}

function stableNodeKey(node: VisualNode) {
  const kindOrder =
    node.kind === "project"
      ? "0"
      : node.kind === "file"
        ? "1"
        : node.kind === "external"
          ? "3"
          : "2";
  return `${kindOrder}:${node.path ?? ""}:${node.parentId ?? ""}:${node.label}`;
}

function reduceCrossings(
  groups: Map<number, VisualNode[]>,
  edges: VisualEdge[],
  rank: Map<string, number>,
) {
  const entryTargets = new Set(
    edges
      .filter((edge) => edge.kind === "starts")
      .map((edge) => edge.target),
  );
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  edges.forEach((edge) => {
    const incomingNodes = incoming.get(edge.target) ?? [];
    incomingNodes.push(edge.source);
    incoming.set(edge.target, incomingNodes);
    const outgoingNodes = outgoing.get(edge.source) ?? [];
    outgoingNodes.push(edge.target);
    outgoing.set(edge.source, outgoingNodes);
  });
  groups.forEach((group) => group.sort((a, b) => stableNodeKey(a).localeCompare(stableNodeKey(b))));

  const sortedRanks = Array.from(groups.keys()).sort((a, b) => a - b);
  const orderIndex = () => {
    const indexes = new Map<string, number>();
    groups.forEach((group) =>
      group.forEach((node, index) => indexes.set(node.id, index)),
    );
    return indexes;
  };
  const sweep = (ranks: number[], neighborMap: Map<string, string[]>) => {
    const indexes = orderIndex();
    ranks.forEach((groupRank) => {
      const group = groups.get(groupRank) ?? [];
      const originalIndex = new Map(
        group.map((node, index) => [node.id, index]),
      );
      group.sort((a, b) => {
        const entryDifference =
          Number(entryTargets.has(b.id)) - Number(entryTargets.has(a.id));
        if (entryDifference !== 0) return entryDifference;
        const barycenter = (node: VisualNode) => {
          const nodeRank = rank.get(node.id) ?? groupRank;
          const connectedIndexes = (neighborMap.get(node.id) ?? [])
            .filter((neighborId) => {
              const neighborRank = rank.get(neighborId);
              return (
                neighborRank !== undefined &&
                (neighborMap === incoming
                  ? neighborRank <= nodeRank
                  : neighborRank >= nodeRank)
              );
            })
            .map((neighborId) => indexes.get(neighborId))
            .filter((value): value is number => value !== undefined);
          if (connectedIndexes.length === 0) return undefined;
          connectedIndexes.sort((left, right) => left - right);
          const middle = Math.floor(connectedIndexes.length / 2);
          return connectedIndexes.length % 2 === 0
            ? (connectedIndexes[middle - 1] + connectedIndexes[middle]) / 2
            : connectedIndexes[middle];
        };
        const aCenter = barycenter(a);
        const bCenter = barycenter(b);
        if (aCenter !== undefined && bCenter !== undefined && aCenter !== bCenter) {
          return aCenter - bCenter;
        }
        if (aCenter !== undefined) return -1;
        if (bCenter !== undefined) return 1;
        return (originalIndex.get(a.id) ?? 0) - (originalIndex.get(b.id) ?? 0);
      });
    });
  };

  for (let iteration = 0; iteration < 6; iteration += 1) {
    sweep(sortedRanks.slice(1), incoming);
    sweep(sortedRanks.slice(0, -1).reverse(), outgoing);
  }
}

function splitDenseLayers(groups: Map<number, VisualNode[]>) {
  const visualGroups = new Map<number, VisualNode[]>();
  let visualRank = 0;
  Array.from(groups.keys())
    .sort((a, b) => a - b)
    .forEach((logicalRank) => {
      const group = groups.get(logicalRank) ?? [];
      for (let index = 0; index < group.length; index += MAX_NODES_PER_LAYER) {
        visualGroups.set(
          visualRank,
          group.slice(index, index + MAX_NODES_PER_LAYER),
        );
        visualRank += 1;
      }
    });
  return visualGroups;
}

export function createLogicalWorkflowLayout(
  nodes: VisualNode[],
  edges: VisualEdge[],
  direction: WorkflowDirection,
): LogicalLayout {
  const rank = buildRanks(nodes, edges);
  const logicalGroups = new Map<number, VisualNode[]>();
  nodes.forEach((node) => {
    const nodeRank = rank.get(node.id) ?? 2;
    const group = logicalGroups.get(nodeRank) ?? [];
    group.push(node);
    logicalGroups.set(nodeRank, group);
  });
  reduceCrossings(logicalGroups, edges, rank);
  const groups = splitDenseLayers(logicalGroups);
  const maxRank = Math.max(0, ...groups.keys());
  const horizontal =
    direction === "left-right" || direction === "right-left";
  const maxGroupSize = Math.max(
    1,
    ...Array.from(groups.values()).map((group) => group.length),
  );
  const breadth =
    maxGroupSize * LOGICAL_NODE_WIDTH +
    Math.max(0, maxGroupSize - 1) * BREADTH_GAP;
  const depth =
    (maxRank + 1) * LOGICAL_NODE_HEIGHT + maxRank * DEPTH_GAP;
  const width = Math.max(
    1120,
    (horizontal ? depth : breadth) + STAGE_PADDING * 2,
  );
  const height = Math.max(
    780,
    (horizontal ? breadth : depth) + STAGE_PADDING * 2,
  );
  const positions = new Map<string, WorkflowPosition>();

  groups.forEach((group, groupRank) => {
    const rowBreadth =
      group.length * LOGICAL_NODE_WIDTH +
      Math.max(0, group.length - 1) * BREADTH_GAP;
    const breadthStart =
      (horizontal ? height : width) / 2 - rowBreadth / 2;
    const visualRank =
      direction === "bottom-up" || direction === "right-left"
        ? maxRank - groupRank
        : groupRank;
    group.forEach((node, index) => {
      const across =
        breadthStart + index * (LOGICAL_NODE_WIDTH + BREADTH_GAP);
      const along =
        STAGE_PADDING +
        visualRank * (LOGICAL_NODE_HEIGHT + DEPTH_GAP);
      positions.set(
        node.id,
        horizontal ? { x: along, y: across } : { x: across, y: along },
      );
    });
  });

  return { positions, width, height };
}

const distributePort = (index: number, count: number, available: number) =>
  count <= 1 ? 0 : ((index + 1) / (count + 1) - 0.5) * available;

function roundedOrthogonalPath(points: WorkflowPosition[], radius = 8) {
  if (points.length < 2) return "";
  const compact = points.filter(
    (point, index) =>
      index === 0 ||
      point.x !== points[index - 1].x ||
      point.y !== points[index - 1].y,
  );
  let path = `M ${compact[0].x} ${compact[0].y}`;
  for (let index = 1; index < compact.length; index += 1) {
    const current = compact[index];
    const next = compact[index + 1];
    if (!next) {
      path += ` L ${current.x} ${current.y}`;
      continue;
    }
    const previous = compact[index - 1];
    const incomingLength = Math.hypot(
      current.x - previous.x,
      current.y - previous.y,
    );
    const outgoingLength = Math.hypot(next.x - current.x, next.y - current.y);
    const cornerRadius = Math.min(
      radius,
      incomingLength / 2,
      outgoingLength / 2,
    );
    const before = {
      x:
        current.x -
        ((current.x - previous.x) / Math.max(1, incomingLength)) *
          cornerRadius,
      y:
        current.y -
        ((current.y - previous.y) / Math.max(1, incomingLength)) *
          cornerRadius,
    };
    const after = {
      x:
        current.x +
        ((next.x - current.x) / Math.max(1, outgoingLength)) * cornerRadius,
      y:
        current.y +
        ((next.y - current.y) / Math.max(1, outgoingLength)) * cornerRadius,
    };
    path += ` L ${before.x} ${before.y} Q ${current.x} ${current.y} ${after.x} ${after.y}`;
  }
  return path;
}

function routeLabel(points: WorkflowPosition[]): WorkflowPosition {
  let longest = { length: 0, start: points[0], end: points[1] ?? points[0] };
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    if (length > longest.length) longest = { length, start, end };
  }
  const vertical =
    Math.abs(longest.end.y - longest.start.y) >
    Math.abs(longest.end.x - longest.start.x);
  return {
    x: (longest.start.x + longest.end.x) / 2 + (vertical ? 7 : 0),
    y: (longest.start.y + longest.end.y) / 2 + (vertical ? 0 : -6),
  };
}

export function createLogicalEdgeRoutes(
  nodes: VisualNode[],
  edges: VisualEdge[],
  positions: ReadonlyMap<string, WorkflowPosition>,
  direction: WorkflowDirection,
) {
  const horizontal =
    direction === "left-right" || direction === "right-left";
  const depthSize = horizontal ? LOGICAL_NODE_WIDTH : LOGICAL_NODE_HEIGHT;
  const breadthSize = horizontal ? LOGICAL_NODE_HEIGHT : LOGICAL_NODE_WIDTH;
  const toAxes = (position: WorkflowPosition): AxisPoint =>
    horizontal
      ? { breadth: position.y, depth: position.x }
      : { breadth: position.x, depth: position.y };
  const toScreen = (point: AxisPoint): WorkflowPosition =>
    horizontal
      ? { x: point.depth, y: point.breadth }
      : { x: point.breadth, y: point.depth };
  const obstacles: AxisRect[] = nodes.flatMap((node) => {
    const position = positions.get(node.id);
    if (!position) return [];
    const axes = toAxes(position);
    return [
      {
        id: node.id,
        breadthStart: axes.breadth,
        breadthEnd: axes.breadth + breadthSize,
        depthStart: axes.depth,
        depthEnd: axes.depth + depthSize,
      },
    ];
  });
  if (obstacles.length === 0) return new Map<string, LogicalEdgeRoute>();
  const breadthMin = Math.min(
    ...obstacles.map((obstacle) => obstacle.breadthStart),
  );
  const breadthMax = Math.max(
    ...obstacles.map((obstacle) => obstacle.breadthEnd),
  );
  const outgoing = new Map<string, VisualEdge[]>();
  const incoming = new Map<string, VisualEdge[]>();
  edges.forEach((edge) => {
    const out = outgoing.get(edge.source) ?? [];
    out.push(edge);
    outgoing.set(edge.source, out);
    const into = incoming.get(edge.target) ?? [];
    into.push(edge);
    incoming.set(edge.target, into);
  });
  const targetBreadth = (edge: VisualEdge) => {
    const target = positions.get(edge.target);
    return target ? toAxes(target).breadth : 0;
  };
  const sourceBreadth = (edge: VisualEdge) => {
    const source = positions.get(edge.source);
    return source ? toAxes(source).breadth : 0;
  };
  outgoing.forEach((group) =>
    group.sort((a, b) => targetBreadth(a) - targetBreadth(b)),
  );
  incoming.forEach((group) =>
    group.sort((a, b) => sourceBreadth(a) - sourceBreadth(b)),
  );
  const outgoingIndex = new Map<string, number>();
  const incomingIndex = new Map<string, number>();
  outgoing.forEach((group) =>
    group.forEach((edge, index) => outgoingIndex.set(edge.id, index)),
  );
  incoming.forEach((group) =>
    group.forEach((edge, index) => incomingIndex.set(edge.id, index)),
  );

  const obstacleBuckets = new Map<number, AxisRect[]>();
  obstacles.forEach((obstacle) => {
    const first = Math.floor(
      (obstacle.depthStart - OBSTACLE_CLEARANCE) / ROUTE_BUCKET_SIZE,
    );
    const last = Math.floor(
      (obstacle.depthEnd + OBSTACLE_CLEARANCE) / ROUTE_BUCKET_SIZE,
    );
    for (let bucket = first; bucket <= last; bucket += 1) {
      const entries = obstacleBuckets.get(bucket) ?? [];
      entries.push(obstacle);
      obstacleBuckets.set(bucket, entries);
    }
  });
  const obstaclesBetween = (depthStart: number, depthEnd: number) => {
    const first = Math.floor(depthStart / ROUTE_BUCKET_SIZE);
    const last = Math.floor(depthEnd / ROUTE_BUCKET_SIZE);
    const seen = new Set<string>();
    const matches: AxisRect[] = [];
    for (let bucket = first; bucket <= last; bucket += 1) {
      (obstacleBuckets.get(bucket) ?? []).forEach((obstacle) => {
        if (seen.has(obstacle.id)) return;
        seen.add(obstacle.id);
        matches.push(obstacle);
      });
    }
    return matches;
  };

  const reservationsByBreadth = new Map<number, TrackReservation[]>();
  let leftOutsideTracks = 0;
  let rightOutsideTracks = 0;
  const routes = new Map<string, LogicalEdgeRoute>();
  const sortedEdges = [...edges].sort(
    (a, b) => edgePriority(a) - edgePriority(b),
  );

  sortedEdges.forEach((edge, routeIndex) => {
    const sourcePosition = positions.get(edge.source);
    const targetPosition = positions.get(edge.target);
    if (!sourcePosition || !targetPosition) return;
    const source = toAxes(sourcePosition);
    const target = toAxes(targetPosition);
    const outgoingGroup = outgoing.get(edge.source) ?? [edge];
    const incomingGroup = incoming.get(edge.target) ?? [edge];
    const sourcePortIndex = outgoingIndex.get(edge.id) ?? 0;
    const targetPortIndex = incomingIndex.get(edge.id) ?? 0;
    const forward = target.depth > source.depth + depthSize * 0.5;
    let axisPoints: AxisPoint[];

    if (forward) {
      const sourceBreadthPort =
        source.breadth +
        breadthSize / 2 +
        distributePort(
          sourcePortIndex,
          outgoingGroup.length,
          breadthSize - 28,
        );
      const targetBreadthPort =
        target.breadth +
        breadthSize / 2 +
        distributePort(
          targetPortIndex,
          incomingGroup.length,
          breadthSize - 28,
        );
      const sourceDepth = source.depth + depthSize;
      const targetDepth = target.depth;
      const availableGap = targetDepth - sourceDepth;
      const sourceLaneDepth =
        EDGE_CLEARANCE + sourcePortIndex * EDGE_LANE_SPACING;
      const targetLaneDepth =
        EDGE_CLEARANCE + targetPortIndex * EDGE_LANE_SPACING;
      const lanesFit =
        availableGap > sourceLaneDepth + targetLaneDepth + 12;
      const sourceGap = lanesFit
        ? sourceDepth + sourceLaneDepth
        : sourceDepth + availableGap / 2;
      const targetGap = lanesFit
        ? targetDepth - targetLaneDepth
        : sourceDepth + availableGap / 2;
      const trackStart = Math.min(sourceGap, targetGap);
      const trackEnd = Math.max(sourceGap, targetGap);
      const midpoint = (sourceBreadthPort + targetBreadthPort) / 2;
      const relevantObstacles = obstaclesBetween(trackStart, trackEnd).filter(
        (obstacle) =>
          obstacle.id !== edge.source && obstacle.id !== edge.target,
      );
      const nearbyObstacles = [...relevantObstacles]
        .sort((left, right) => {
          const leftCenter = (left.breadthStart + left.breadthEnd) / 2;
          const rightCenter = (right.breadthStart + right.breadthEnd) / 2;
          return (
            Math.abs(leftCenter - midpoint) -
            Math.abs(rightCenter - midpoint)
          );
        })
        .slice(0, MAX_NEARBY_OBSTACLES);
      const candidates = [
        midpoint,
        sourceBreadthPort,
        targetBreadthPort,
        midpoint - 24,
        midpoint + 24,
        midpoint - 48,
        midpoint + 48,
        breadthMin - 42,
        breadthMax + 42,
        ...nearbyObstacles.flatMap((obstacle) => [
          obstacle.breadthStart - OBSTACLE_CLEARANCE,
          obstacle.breadthEnd + OBSTACLE_CLEARANCE,
        ]),
      ];
      const uniqueCandidates = [
        ...new Set(candidates.map((value) => Math.round(value))),
      ];
      const scoredCandidates = uniqueCandidates
        .filter((candidate) =>
          relevantObstacles.every(
              (obstacle) =>
                trackEnd < obstacle.depthStart - OBSTACLE_CLEARANCE ||
                trackStart > obstacle.depthEnd + OBSTACLE_CLEARANCE ||
                candidate < obstacle.breadthStart - OBSTACLE_CLEARANCE ||
                candidate > obstacle.breadthEnd + OBSTACLE_CLEARANCE,
            ),
        )
        .map((candidate) => {
          const reservationBucket = Math.round(
            candidate / RESERVATION_BUCKET_SIZE,
          );
          const nearbyReservations = [
            ...(reservationsByBreadth.get(reservationBucket - 1) ?? []),
            ...(reservationsByBreadth.get(reservationBucket) ?? []),
            ...(reservationsByBreadth.get(reservationBucket + 1) ?? []),
          ];
          const sharedTrackCount = nearbyReservations.filter(
            (reservation) =>
              Math.abs(reservation.breadth - candidate) < 10 &&
              reservation.depthStart <= trackEnd &&
              reservation.depthEnd >= trackStart,
          ).length;
          return {
            candidate,
            score:
              Math.abs(candidate - sourceBreadthPort) +
              Math.abs(candidate - targetBreadthPort) +
              sharedTrackCount * 180,
          };
        })
        .sort((a, b) => a.score - b.score);
      const fallbackOutside =
        routeIndex % 2 === 0 ? breadthMin - 42 : breadthMax + 42;
      const trackBreadth = scoredCandidates[0]?.candidate ?? fallbackOutside;
      const reservation = {
        breadth: trackBreadth,
        depthStart: trackStart,
        depthEnd: trackEnd,
      };
      const reservationBucket = Math.round(
        trackBreadth / RESERVATION_BUCKET_SIZE,
      );
      const bucketReservations =
        reservationsByBreadth.get(reservationBucket) ?? [];
      bucketReservations.push(reservation);
      reservationsByBreadth.set(reservationBucket, bucketReservations);
      axisPoints = [
        { breadth: sourceBreadthPort, depth: sourceDepth },
        { breadth: sourceBreadthPort, depth: sourceGap },
        { breadth: trackBreadth, depth: sourceGap },
        { breadth: trackBreadth, depth: targetGap },
        { breadth: targetBreadthPort, depth: targetGap },
        { breadth: targetBreadthPort, depth: targetDepth },
      ];
    } else {
      const useLeft =
        source.breadth +
          target.breadth +
          breadthSize <
        breadthMin + breadthMax;
      const sameSideCount = useLeft ? leftOutsideTracks : rightOutsideTracks;
      if (useLeft) leftOutsideTracks += 1;
      else rightOutsideTracks += 1;
      const trackBreadth = useLeft
        ? breadthMin - 46 - sameSideCount * 13
        : breadthMax + 46 + sameSideCount * 13;
      const sourceDepthPort =
        source.depth +
        depthSize / 2 +
        distributePort(
          sourcePortIndex,
          outgoingGroup.length,
          depthSize - 22,
        );
      const targetDepthPort =
        target.depth +
        depthSize / 2 +
        distributePort(
          targetPortIndex,
          incomingGroup.length,
          depthSize - 22,
        );
      const sourceBreadthSide = useLeft
        ? source.breadth
        : source.breadth + breadthSize;
      const targetBreadthSide = useLeft
        ? target.breadth
        : target.breadth + breadthSize;
      axisPoints = [
        { breadth: sourceBreadthSide, depth: sourceDepthPort },
        { breadth: trackBreadth, depth: sourceDepthPort },
        { breadth: trackBreadth, depth: targetDepthPort },
        { breadth: targetBreadthSide, depth: targetDepthPort },
      ];
    }

    const screenPoints = axisPoints.map(toScreen);
    const xValues = screenPoints.map((point) => point.x);
    const yValues = screenPoints.map((point) => point.y);
    routes.set(edge.id, {
      path: roundedOrthogonalPath(screenPoints),
      label: routeLabel(screenPoints),
      bounds: {
        left: Math.min(...xValues),
        top: Math.min(...yValues),
        right: Math.max(...xValues),
        bottom: Math.max(...yValues),
      },
    });
  });

  return routes;
}
