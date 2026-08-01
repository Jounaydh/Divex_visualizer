import { CubicBezierLine, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type {
  AnalyzedProject,
  ExperienceMode,
  VisualNode,
} from "../types";
import { buildVisualGraph } from "../visualization/buildVisualGraph";
import {
  AUTOLOCK_EASING,
  CAMERA_POLAR_ANGLE,
  CAMERA_POSITION,
  CAMERA_TARGET,
  MAX_CAMERA_DISTANCE,
  MIN_CAMERA_DISTANCE,
  VERTICAL_CENTER_MARGIN,
} from "./three/constants";
import { routedEdgePoints } from "./three/edgeRouting";
import { VisualNodeCard } from "./three/VisualNodeCard";

interface ThreeVisualizerProps {
  project: AnalyzedProject;
  expandedFolders: Set<string>;
  expandedFiles: Set<string>;
  selectedId: string | null;
  experienceMode: ExperienceMode;
  cameraResetKey: number;
  onSelectNode: (node: VisualNode) => void;
  onToggleFolder: (id: string) => void;
  onToggleFile: (id: string) => void;
}

function shortestAngleDifference(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function GraphScene({
  project,
  expandedFolders,
  expandedFiles,
  selectedId,
  experienceMode,
  cameraResetKey,
  onSelectNode,
  onToggleFolder,
  onToggleFile,
}: ThreeVisualizerProps) {
  const graph = useMemo(
    () => buildVisualGraph(project, expandedFolders, expandedFiles, "ring"),
    [project, expandedFolders, expandedFiles],
  );
  const baseNodeMap = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node])),
    [graph.nodes],
  );
  const childrenByParent = useMemo(() => {
    const children = new Map<string, VisualNode[]>();
    graph.nodes.forEach((node) => {
      if (!node.parentId) return;
      const siblings = children.get(node.parentId) ?? [];
      siblings.push(node);
      children.set(node.parentId, siblings);
    });
    return children;
  }, [graph.nodes]);
  const verticalBounds = useMemo(() => {
    const yPositions = graph.nodes.map((node) => node.position[1]);
    const lowest = Math.min(...yPositions);
    const highest = Math.max(...yPositions);
    if (highest - lowest < VERTICAL_CENTER_MARGIN * 2) {
      const center = (lowest + highest) / 2;
      return { min: center, max: center };
    }
    return {
      min: lowest + VERTICAL_CENTER_MARGIN,
      max: highest - VERTICAL_CENTER_MARGIN,
    };
  }, [graph.nodes]);
  const [ringRotations, setRingRotations] = useState<Record<string, number>>(
    {},
  );
  const ringRotationsRef = useRef(ringRotations);
  const autolockAnimationRef = useRef<{
    parentId?: string;
    targetRotation?: number;
    targetY: number;
  } | null>(null);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera, gl } = useThree();
  ringRotationsRef.current = ringRotations;
  const rotationPivotId = useMemo(() => {
    if (!selectedId) return "project";
    if ((childrenByParent.get(selectedId)?.length ?? 0) > 0) return selectedId;
    return baseNodeMap.get(selectedId)?.parentId ?? "project";
  }, [baseNodeMap, childrenByParent, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const selectedNode = baseNodeMap.get(selectedId);
    const parent = selectedNode?.parentId
      ? baseNodeMap.get(selectedNode.parentId)
      : null;
    if (!selectedNode) return;

    const animation: NonNullable<typeof autolockAnimationRef.current> = {
      targetY: Math.min(
        verticalBounds.max,
        Math.max(verticalBounds.min, selectedNode.position[1]),
      ),
    };
    if (parent) {
      const localX = selectedNode.position[0] - parent.position[0];
      const localZ = selectedNode.position[2] - parent.position[2];
      if (Math.hypot(localX, localZ) >= 0.01) {
        const selectedAngle = Math.atan2(localZ, localX);
        const lockedRotation = Math.PI / 2 - selectedAngle;
        const currentRotation = ringRotationsRef.current[parent.id] ?? 0;
        animation.parentId = parent.id;
        animation.targetRotation =
          currentRotation +
          shortestAngleDifference(currentRotation, lockedRotation);
      }
    }
    autolockAnimationRef.current = animation;
  }, [baseNodeMap, selectedId, verticalBounds]);

  useFrame((_, delta) => {
    const animation = autolockAnimationRef.current;
    if (!animation) return;

    const easedStep = 1 - Math.exp(-AUTOLOCK_EASING * delta);
    let rotationFinished = true;
    if (
      animation.parentId !== undefined &&
      animation.targetRotation !== undefined
    ) {
      const currentRotation =
        ringRotationsRef.current[animation.parentId] ?? 0;
      const remainingRotation =
        animation.targetRotation - currentRotation;
      const nextRotation =
        Math.abs(remainingRotation) < 0.001
          ? animation.targetRotation
          : currentRotation + remainingRotation * easedStep;
      rotationFinished = nextRotation === animation.targetRotation;
      const nextRotations = {
        ...ringRotationsRef.current,
        [animation.parentId]: nextRotation,
      };
      ringRotationsRef.current = nextRotations;
      setRingRotations(nextRotations);
    }

    const controls = controlsRef.current;
    let verticalFinished = !controls;
    if (controls) {
      const remainingY = animation.targetY - controls.target.y;
      const movement =
        Math.abs(remainingY) < 0.001 ? remainingY : remainingY * easedStep;
      controls.target.y += movement;
      camera.position.y += movement;
      controls.update();
      verticalFinished = Math.abs(remainingY) < 0.001;
    }

    if (rotationFinished && verticalFinished) {
      autolockAnimationRef.current = null;
    }
  });

  const renderedNodes = useMemo(() => {
    const positioned = new Map<string, VisualNode>();
    const root = baseNodeMap.get("project");
    if (!root) return graph.nodes;
    positioned.set(root.id, { ...root, position: [...root.position] });

    const positionChildren = (parentId: string) => {
      const baseParent = baseNodeMap.get(parentId);
      const renderedParent = positioned.get(parentId);
      if (!baseParent || !renderedParent) return;
      const angle = ringRotations[parentId] ?? 0;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);

      (childrenByParent.get(parentId) ?? []).forEach((child) => {
        const localX = child.position[0] - baseParent.position[0];
        const localZ = child.position[2] - baseParent.position[2];
        const rotatedX = localX * cosine - localZ * sine;
        const rotatedZ = localX * sine + localZ * cosine;
        positioned.set(child.id, {
          ...child,
          position: [
            renderedParent.position[0] + rotatedX,
            renderedParent.position[1] +
              (child.position[1] - baseParent.position[1]),
            renderedParent.position[2] + rotatedZ,
          ],
        });
        positionChildren(child.id);
      });
    };

    positionChildren("project");
    return graph.nodes.map((node) => positioned.get(node.id) ?? node);
  }, [baseNodeMap, childrenByParent, graph.nodes, ringRotations]);
  const nodeMap = useMemo(
    () => new Map(renderedNodes.map((node) => [node.id, node])),
    [renderedNodes],
  );
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    camera.position.set(...CAMERA_POSITION);
    controls.target.set(...CAMERA_TARGET);
    autolockAnimationRef.current = null;
    setRingRotations({});
    controls.update();
  }, [camera, cameraResetKey]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const nextTargetY = Math.min(
      verticalBounds.max,
      Math.max(verticalBounds.min, controls.target.y),
    );
    const movement = nextTargetY - controls.target.y;
    controls.target.y = nextTargetY;
    camera.position.y += movement;
    controls.update();
  }, [camera, verticalBounds]);

  useEffect(() => {
    const gestureSurface =
      gl.domElement.closest<HTMLElement>(".visualizer-canvas") ??
      gl.domElement.parentElement ??
      gl.domElement;

    const handleTrackpadGesture = (event: WheelEvent) => {
      const controls = controlsRef.current;
      if (!controls) return;
      event.preventDefault();
      event.stopImmediatePropagation();

      const distance = controls.getDistance();

      if (event.ctrlKey) {
        const direction = camera.position.clone().sub(controls.target);
        if (direction.lengthSq() < 0.01) return;
        const zoomFactor = Math.exp(event.deltaY * 0.012);
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
            (current[rotationPivotId] ?? 0) + event.deltaX * 0.0045,
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

    gestureSurface.addEventListener("wheel", handleTrackpadGesture, {
      passive: false,
      capture: true,
    });
    return () => {
      gestureSurface.removeEventListener("wheel", handleTrackpadGesture, {
        capture: true,
      });
    };
  }, [camera, gl, rotationPivotId, verticalBounds]);

  return (
    <>
      <color attach="background" args={["#101114"]} />
      <fog attach="fog" args={["#101114", 25, 62]} />
      <ambientLight intensity={1.25} />
      <directionalLight position={[5, 10, 8]} intensity={1.5} />
      <gridHelper
        args={[100, 50, "#2c2e34", "#1b1c20"]}
        position={[4, -8, 0]}
      />

      <group>
        {graph.edges.map((edge, edgeIndex) => {
          const source = nodeMap.get(edge.source);
          const target = nodeMap.get(edge.target);
          if (!source || !target) return null;
          const connected =
            !selectedId ||
            edge.source === selectedId ||
            edge.target === selectedId;
          const isImport = edge.kind === "imports";
          const hiddenForBeginner =
            experienceMode === "beginner" &&
            isImport &&
            selectedId &&
            !connected;
          if (hiddenForBeginner) return null;
          const route = routedEdgePoints(
            source,
            target,
            isImport,
            edgeIndex,
          );

          return (
            <CubicBezierLine
              key={edge.id}
              start={route.start}
              end={route.end}
              midA={route.midA}
              midB={route.midB}
              color={
                isImport
                  ? connected
                    ? "#a8a8ad"
                    : "#77777d"
                  : connected
                    ? "#ffffff"
                    : "#d3d3d6"
              }
              lineWidth={isImport ? (connected ? 1.8 : 1.2) : 2.4}
              transparent
              opacity={selectedId && !connected ? 0.32 : isImport ? 0.78 : 0.96}
              dashed={isImport}
              dashScale={2}
              dashSize={0.7}
              gapSize={0.28}
              raycast={() => undefined}
            />
          );
        })}

        {renderedNodes.map((node) => (
          <VisualNodeCard
            key={node.id}
            node={node}
            selected={selectedId === node.id}
            open={
              (node.kind === "folder" && expandedFolders.has(node.id)) ||
              (node.kind === "file" && expandedFiles.has(node.id))
            }
            onSelect={() => onSelectNode(node)}
            onToggle={
              node.kind === "folder"
                ? () => onToggleFolder(node.id)
                : node.kind === "file"
                  ? () => onToggleFile(node.id)
                  : undefined
            }
          />
        ))}
      </group>

      <OrbitControls
        ref={controlsRef}
        key={cameraResetKey}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        enableRotate={false}
        enablePan={false}
        minPolarAngle={CAMERA_POLAR_ANGLE}
        maxPolarAngle={CAMERA_POLAR_ANGLE}
        minDistance={MIN_CAMERA_DISTANCE}
        maxDistance={MAX_CAMERA_DISTANCE}
        enableZoom={false}
        target={CAMERA_TARGET}
      />
    </>
  );
}

export function ThreeVisualizer(props: ThreeVisualizerProps) {
  return (
    <Canvas
      className="three-canvas"
      camera={{ position: CAMERA_POSITION, fov: 42, near: 0.1, far: 140 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
    >
      <Suspense fallback={null}>
        <GraphScene {...props} />
      </Suspense>
    </Canvas>
  );
}
