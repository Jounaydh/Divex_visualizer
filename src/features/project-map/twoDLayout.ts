import type {
  VisualNode,
  WorkflowDirection,
  WorkflowPosition,
} from "../../types";

export const TWO_D_NODE_WIDTH = 150;
export const TWO_D_NODE_HEIGHT = 52;

const BREADTH_SPACING = 72;
const VERTICAL_DEPTH_SPACING = 38;
const HORIZONTAL_DEPTH_SPACING = 58;
const STAGE_PADDING_X = 105;
const STAGE_PADDING_Y = 58;

export interface TwoDLayout {
  positions: Map<string, WorkflowPosition>;
  width: number;
  height: number;
}

export function createTwoDLayout(
  nodes: VisualNode[],
  direction: WorkflowDirection,
): TwoDLayout {
  const minX = Math.min(...nodes.map((node) => node.position[0]));
  const maxX = Math.max(...nodes.map((node) => node.position[0]));
  const minY = Math.min(...nodes.map((node) => node.position[1]));
  const maxY = Math.max(...nodes.map((node) => node.position[1]));
  const maxBreadth = (maxX - minX) * BREADTH_SPACING;
  const maxVerticalDepth = (maxY - minY) * VERTICAL_DEPTH_SPACING;
  const maxHorizontalDepth =
    (maxY - minY) * HORIZONTAL_DEPTH_SPACING;
  const horizontal =
    direction === "left-right" || direction === "right-left";
  const positions = new Map<string, WorkflowPosition>();

  nodes.forEach((node) => {
    const breadth = (node.position[0] - minX) * BREADTH_SPACING;
    const verticalDepth =
      (maxY - node.position[1]) * VERTICAL_DEPTH_SPACING;
    const horizontalDepth =
      (maxY - node.position[1]) * HORIZONTAL_DEPTH_SPACING;

    if (direction === "top-down") {
      positions.set(node.id, {
        x: breadth + STAGE_PADDING_X,
        y: verticalDepth + STAGE_PADDING_Y,
      });
    } else if (direction === "bottom-up") {
      positions.set(node.id, {
        x: breadth + STAGE_PADDING_X,
        y: maxVerticalDepth - verticalDepth + STAGE_PADDING_Y,
      });
    } else if (direction === "left-right") {
      positions.set(node.id, {
        x: horizontalDepth + STAGE_PADDING_X,
        y: breadth + STAGE_PADDING_Y,
      });
    } else {
      positions.set(node.id, {
        x: maxHorizontalDepth - horizontalDepth + STAGE_PADDING_X,
        y: breadth + STAGE_PADDING_Y,
      });
    }
  });

  return {
    positions,
    width: Math.max(
      980,
      (horizontal ? maxHorizontalDepth : maxBreadth) + 360,
    ),
    height: Math.max(
      760,
      (horizontal ? maxBreadth : maxVerticalDepth) + 180,
    ),
  };
}

export function mergeTwoDPositions(
  nodes: VisualNode[],
  automaticPositions: ReadonlyMap<string, WorkflowPosition>,
  customPositions: Readonly<Record<string, WorkflowPosition>>,
) {
  const merged = new Map(automaticPositions);
  nodes.forEach((node) => {
    const customPosition = customPositions[node.id];
    if (customPosition) merged.set(node.id, customPosition);
  });
  return merged;
}

export function measureTwoDStage(
  layout: TwoDLayout,
  positions: ReadonlyMap<string, WorkflowPosition>,
) {
  const positionedNodes = Array.from(positions.values());
  return {
    width: Math.max(
      layout.width,
      ...positionedNodes.map((position) =>
        Math.ceil(position.x + TWO_D_NODE_WIDTH + STAGE_PADDING_X),
      ),
    ),
    height: Math.max(
      layout.height,
      ...positionedNodes.map((position) =>
        Math.ceil(position.y + TWO_D_NODE_HEIGHT + STAGE_PADDING_Y),
      ),
    ),
  };
}

export function createTwoDEdgePath(
  source: WorkflowPosition,
  target: WorkflowPosition,
  direction: WorkflowDirection,
  isImport: boolean,
) {
  if (direction === "top-down" || direction === "bottom-up") {
    if (isImport) {
      const sourceX = source.x + TWO_D_NODE_WIDTH / 2;
      const sourceY = source.y + TWO_D_NODE_HEIGHT / 2;
      const targetX = target.x + TWO_D_NODE_WIDTH / 2;
      const targetY = target.y + TWO_D_NODE_HEIGHT / 2;
      const curve = (targetY - sourceY) * 0.45;
      return `M ${sourceX} ${sourceY} C ${sourceX} ${
        sourceY + curve
      }, ${targetX} ${targetY - curve}, ${targetX} ${targetY}`;
    }

    const sourceX = source.x + TWO_D_NODE_WIDTH / 2;
    const targetX = target.x + TWO_D_NODE_WIDTH / 2;
    const sourceY =
      direction === "top-down"
        ? source.y + TWO_D_NODE_HEIGHT
        : source.y;
    const targetY =
      direction === "top-down"
        ? target.y
        : target.y + TWO_D_NODE_HEIGHT;
    const curveDirection = direction === "top-down" ? 1 : -1;
    const curve = Math.max(44, Math.abs(targetY - sourceY) * 0.45);
    return `M ${sourceX} ${sourceY} C ${sourceX} ${
      sourceY + curve * curveDirection
    }, ${targetX} ${
      targetY - curve * curveDirection
    }, ${targetX} ${targetY}`;
  }

  if (isImport) {
    const sourceX = source.x + TWO_D_NODE_WIDTH / 2;
    const sourceY = source.y + TWO_D_NODE_HEIGHT / 2;
    const targetX = target.x + TWO_D_NODE_WIDTH / 2;
    const targetY = target.y + TWO_D_NODE_HEIGHT / 2;
    const curve = (targetX - sourceX) * 0.45;
    return `M ${sourceX} ${sourceY} C ${
      sourceX + curve
    } ${sourceY}, ${targetX - curve} ${targetY}, ${targetX} ${targetY}`;
  }

  const sourceX =
    direction === "left-right"
      ? source.x + TWO_D_NODE_WIDTH
      : source.x;
  const targetX =
    direction === "left-right"
      ? target.x
      : target.x + TWO_D_NODE_WIDTH;
  const sourceY = source.y + TWO_D_NODE_HEIGHT / 2;
  const targetY = target.y + TWO_D_NODE_HEIGHT / 2;
  const curveDirection = direction === "left-right" ? 1 : -1;
  const curve = Math.max(52, Math.abs(targetX - sourceX) * 0.45);
  return `M ${sourceX} ${sourceY} C ${
    sourceX + curve * curveDirection
  } ${sourceY}, ${
    targetX - curve * curveDirection
  } ${targetY}, ${targetX} ${targetY}`;
}
