import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  ExternalLink,
  FolderOpen,
  Move,
  Pause,
  Pin,
  PinOff,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAnalyzedProject } from "../analysis/useAnalyzedProject";
import { folderIdsForPath } from "../app/expansion";
import { BrandMark } from "../components/BrandMark";
import { FeatureErrorBoundary } from "../components/FeatureErrorBoundary";
import { DEFAULT_TWO_D_ZOOM } from "../config/ui";
import { sampleProject } from "../data/sampleProject";
import { TwoDVisualizer } from "../features/project-map/TwoDVisualizer";
import type {
  ProjectPayload,
  ViewMode,
  VisualNode,
  WorkflowDirection,
  WorkflowPosition,
} from "../types";

const LogicalWorkflowVisualizer = lazy(() =>
  import("../features/logic-map/LogicalWorkflowVisualizer").then(
    (module) => ({ default: module.LogicalWorkflowVisualizer }),
  ),
);

type LiveStatus = "ready" | "watching" | "updating" | "paused" | "error";

interface SearchResult {
  id: string;
  label: string;
  detail: string;
  path: string;
  kind: VisualNode["kind"];
  fileId: string;
}

const MINI_VIEW_KEY = "divex-mini:view";
const MINI_LIVE_KEY = "divex-mini:live";
const MINI_ROOT_KEY = "divex-mini:last-root";
const MINI_DIRECTION_KEY = "divex-mini:direction";
const MINI_FREE_POSITIONING_KEY = "divex-mini:free-positioning";
const MINI_DIRECTIONS = [
  { value: "top-down", label: "Top to bottom", Icon: ArrowDown },
  { value: "bottom-up", label: "Bottom to top", Icon: ArrowUp },
  { value: "left-right", label: "Left to right", Icon: ArrowRight },
  { value: "right-left", label: "Right to left", Icon: ArrowLeft },
] as const;

function storedViewMode(): ViewMode {
  return localStorage.getItem(MINI_VIEW_KEY) === "logic" ? "logic" : "2d";
}

function storedDirection(): WorkflowDirection {
  const value = localStorage.getItem(MINI_DIRECTION_KEY);
  return MINI_DIRECTIONS.some((direction) => direction.value === value)
    ? (value as WorkflowDirection)
    : "top-down";
}

function allTopLevelFolderIds(
  payload: ReturnType<typeof useAnalyzedProject>["project"],
) {
  return new Set(payload.root.folders.map((folder) => folder.id));
}

function timeLabel(value: string | null) {
  if (!value) return "Waiting for changes";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export default function MiniApp() {
  const params = new URLSearchParams(window.location.search);
  const requestedRoot =
    params.get("rootPath") || localStorage.getItem(MINI_ROOT_KEY) || "";
  const [payload, setPayload] = useState<ProjectPayload>(sampleProject);
  const { project, isAnalyzing, error, retry } = useAnalyzedProject(payload);
  const [projectIsLocal, setProjectIsLocal] = useState(false);
  const [loadingProject, setLoadingProject] = useState(Boolean(requestedRoot));
  const [viewMode, setViewMode] = useState<ViewMode>(storedViewMode);
  const [workflowDirection, setWorkflowDirection] =
    useState<WorkflowDirection>(storedDirection);
  const [freePositioning, setFreePositioning] = useState(
    () => localStorage.getItem(MINI_FREE_POSITIONING_KEY) === "1",
  );
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [liveEnabled, setLiveEnabled] = useState(
    () => localStorage.getItem(MINI_LIVE_KEY) !== "0",
  );
  const [liveStatus, setLiveStatus] = useState<LiveStatus>("ready");
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [changedPaths, setChangedPaths] = useState<string[]>([]);
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [selectedId, setSelectedId] = useState("project");
  const [selectedNode, setSelectedNode] = useState<VisualNode | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(["folder:lib"]),
  );
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(
    () => new Set(),
  );
  const [twoDZoom, setTwoDZoom] = useState(DEFAULT_TWO_D_ZOOM);
  const [logicZoom, setLogicZoom] = useState(0.8);
  const [twoDPositions, setTwoDPositions] = useState<
    Record<string, WorkflowPosition>
  >({});
  const [logicPositions, setLogicPositions] = useState<
    Record<string, WorkflowPosition>
  >({});
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const viewMenuRef = useRef<HTMLDivElement>(null);
  const activeRootRef = useRef("");
  const liveEnabledRef = useRef(liveEnabled);
  const refreshRunningRef = useRef(false);
  const queuedPathsRef = useRef(new Set<string>());
  const queuedChangedAtRef = useRef<string | null>(null);

  useEffect(() => {
    document.body.classList.add("mini-mode");
    return () => document.body.classList.remove("mini-mode");
  }, []);

  useEffect(() => {
    localStorage.setItem(MINI_VIEW_KEY, viewMode);
    setViewMenuOpen(false);
  }, [viewMode]);

  useEffect(() => {
    localStorage.setItem(MINI_DIRECTION_KEY, workflowDirection);
  }, [workflowDirection]);

  useEffect(() => {
    localStorage.setItem(
      MINI_FREE_POSITIONING_KEY,
      freePositioning ? "1" : "0",
    );
  }, [freePositioning]);

  useEffect(() => {
    if (!viewMenuOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !viewMenuRef.current?.contains(event.target)
      ) {
        setViewMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setViewMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [viewMenuOpen]);

  useEffect(() => {
    liveEnabledRef.current = liveEnabled;
    localStorage.setItem(MINI_LIVE_KEY, liveEnabled ? "1" : "0");
  }, [liveEnabled]);

  useEffect(() => {
    setExpandedFolders(allTopLevelFolderIds(project));
    setExpandedFiles(new Set());
    setSelectedId("project");
    setSelectedNode(null);
    setTwoDPositions({});
    setLogicPositions({});
  }, [project.rootPath]);

  const loadRoot = useCallback(async (rootPath: string) => {
    if (!window.divex || !rootPath) {
      setLoadingProject(false);
      return;
    }
    setLoadingProject(true);
    setLiveStatus("updating");
    const result = await window.divex.refreshProject({ rootPath });
    if (result.success && result.project) {
      activeRootRef.current = result.project.rootPath;
      setPayload(result.project);
      setProjectIsLocal(true);
      setLastUpdate(new Date().toISOString());
      localStorage.setItem(MINI_ROOT_KEY, result.project.rootPath);
      setLiveStatus(liveEnabledRef.current ? "watching" : "paused");
    } else {
      setLiveStatus("error");
    }
    setLoadingProject(false);
  }, []);

  useEffect(() => {
    if (requestedRoot && window.divex) {
      void loadRoot(requestedRoot);
    } else {
      activeRootRef.current = sampleProject.rootPath;
      setLiveStatus(window.divex ? "ready" : "paused");
      setLoadingProject(false);
    }
    if (window.divex) {
      void window.divex.getMiniWindowState().then((state) => {
        setAlwaysOnTop(state.alwaysOnTop);
      });
    }
    // The requested root is fixed for this renderer lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshFromDisk = useCallback(
    async (paths: string[] = [], changedAt = new Date().toISOString()) => {
      paths.forEach((filePath) => queuedPathsRef.current.add(filePath));
      queuedChangedAtRef.current = changedAt;
      if (refreshRunningRef.current) return;
      const rootPath = activeRootRef.current;
      if (!rootPath || !window.divex) return;

      refreshRunningRef.current = true;
      try {
        while (queuedPathsRef.current.size > 0) {
          const currentPaths = [...queuedPathsRef.current];
          const currentChangedAt =
            queuedChangedAtRef.current ?? new Date().toISOString();
          queuedPathsRef.current.clear();
          queuedChangedAtRef.current = null;
          setLiveStatus("updating");
          setChangedPaths(currentPaths);
          const result = await window.divex.refreshProject({ rootPath });
          if (!result.success || !result.project) {
            setLiveStatus("error");
            break;
          }
          setPayload(result.project);
          setLastUpdate(currentChangedAt);
          setLiveStatus(liveEnabledRef.current ? "watching" : "paused");
          if (!liveEnabledRef.current) break;
        }
      } finally {
        refreshRunningRef.current = false;
      }
    },
    [],
  );

  useEffect(() => {
    if (!projectIsLocal || !window.divex) return;
    const rootPath = payload.rootPath;
    activeRootRef.current = rootPath;
    const stopChangedListener = window.divex.onProjectChanged((change) => {
      if (change.rootPath !== activeRootRef.current) return;
      if (!liveEnabledRef.current) {
        change.paths.forEach((filePath) =>
          queuedPathsRef.current.add(filePath),
        );
        queuedChangedAtRef.current = change.changedAt;
        setChangedPaths([...queuedPathsRef.current]);
        setLiveStatus("paused");
        return;
      }
      void refreshFromDisk(change.paths, change.changedAt);
    });
    const stopErrorListener = window.divex.onProjectWatchError((watchError) => {
      if (watchError.rootPath === activeRootRef.current) {
        setLiveStatus("error");
      }
    });
    void window.divex.watchProject({ rootPath }).then((result) => {
      if (!result.success) setLiveStatus("error");
      else setLiveStatus(liveEnabledRef.current ? "watching" : "paused");
    });
    return () => {
      stopChangedListener();
      stopErrorListener();
      void window.divex?.stopWatchingProject();
    };
  }, [payload.rootPath, projectIsLocal, refreshFromDisk]);

  const searchResults = useMemo<SearchResult[]>(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    const results: SearchResult[] = [];
    project.files.forEach((file) => {
      if (
        file.name.toLowerCase().includes(query) ||
        file.path.toLowerCase().includes(query)
      ) {
        results.push({
          id: file.id,
          label: file.name,
          detail: file.path,
          path: file.path,
          kind: "file",
          fileId: file.id,
        });
      }
      file.symbols.forEach((symbol) => {
        if (
          symbol.name.toLowerCase().includes(query) ||
          symbol.signature.toLowerCase().includes(query)
        ) {
          results.push({
            id: symbol.id,
            label: symbol.name,
            detail: `${symbol.kind} · ${file.path}:${symbol.line}`,
            path: file.path,
            kind: symbol.kind,
            fileId: file.id,
          });
        }
      });
    });
    return results.slice(0, 8);
  }, [project.files, searchQuery]);

  const selectSearchResult = (result: SearchResult) => {
    setExpandedFolders((current) => {
      const next = new Set(current);
      folderIdsForPath(result.path).forEach((id) => next.add(id));
      return next;
    });
    if (result.kind !== "file") {
      setExpandedFiles((current) => new Set(current).add(result.fileId));
    }
    setSelectedId(result.id);
    setSelectedNode({
      id: result.id,
      label: result.label,
      subtitle: result.detail,
      kind: result.kind,
      path: result.path,
      position: [0, 0, 0],
    });
    setSearchQuery("");
    setSearchFocused(false);
  };

  const openFolder = async () => {
    if (!window.divex) return;
    const nextProject = await window.divex.chooseProject();
    if (!nextProject) return;
    activeRootRef.current = nextProject.rootPath;
    setPayload(nextProject);
    setProjectIsLocal(true);
    setLastUpdate(new Date().toISOString());
    localStorage.setItem(MINI_ROOT_KEY, nextProject.rootPath);
  };

  const toggleLive = () => {
    const next = !liveEnabledRef.current;
    liveEnabledRef.current = next;
    setLiveEnabled(next);
    setLiveStatus(next ? "watching" : "paused");
    if (next && queuedPathsRef.current.size > 0) {
      void refreshFromDisk(
        [],
        queuedChangedAtRef.current ?? new Date().toISOString(),
      );
    }
  };

  const toggleAlwaysOnTop = async () => {
    if (!window.divex) {
      setAlwaysOnTop((current) => !current);
      return;
    }
    const result = await window.divex.setMiniAlwaysOnTop({
      alwaysOnTop: !alwaysOnTop,
    });
    if (result.success) setAlwaysOnTop(result.alwaysOnTop);
  };

  const openSelectedInEditor = async () => {
    if (!selectedNode?.path || !window.divex || !projectIsLocal) return;
    await window.divex.openProjectEntry({
      rootPath: payload.rootPath,
      entryPath: selectedNode.path,
    });
  };

  const resetActiveLayout = () => {
    if (viewMode === "logic") {
      setLogicPositions({});
      setLogicZoom(0.8);
    } else {
      setTwoDPositions({});
      setTwoDZoom(DEFAULT_TWO_D_ZOOM);
    }
    setViewMenuOpen(false);
  };

  const statusLabel =
    liveStatus === "updating" || isAnalyzing
      ? "Updating map…"
      : liveStatus === "watching"
        ? "Live"
        : liveStatus === "paused"
          ? "Paused"
          : liveStatus === "error"
            ? "Watch stopped"
            : "Ready";

  return (
    <main className="mini-shell">
      <header className="mini-titlebar">
        <div className="mini-drag-region" />
        <div className="mini-brand">
          <BrandMark />
          <strong>Divex Mini</strong>
        </div>
        <nav className="mini-view-tabs" aria-label="Mini visualizer view">
          <button
            type="button"
            className={viewMode === "2d" ? "active" : ""}
            onClick={() => setViewMode("2d")}
          >
            2D
          </button>
          <button
            type="button"
            className={viewMode === "logic" ? "active" : ""}
            onClick={() => setViewMode("logic")}
          >
            Logic
          </button>
        </nav>
        <div className="mini-search">
          <Search size={12} />
          <input
            aria-label="Search files and symbols"
            placeholder="Find code"
            value={searchQuery}
            onFocus={() => setSearchFocused(true)}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setSearchQuery("");
                setSearchFocused(false);
                event.currentTarget.blur();
              }
              if (event.key === "Enter" && searchResults[0]) {
                selectSearchResult(searchResults[0]);
              }
            }}
          />
          {searchQuery && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearchQuery("")}
            >
              <X size={11} />
            </button>
          )}
          {searchFocused && searchQuery && (
            <div className="mini-search-results" role="listbox">
              {searchResults.length > 0 ? (
                searchResults.map((result) => (
                  <button
                    type="button"
                    role="option"
                    key={result.id}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectSearchResult(result)}
                  >
                    <strong>{result.label}</strong>
                    <span>{result.detail}</span>
                  </button>
                ))
              ) : (
                <p>No matching files or symbols</p>
              )}
            </div>
          )}
        </div>
        <div className="mini-window-actions">
          <div className="mini-view-menu-wrap" ref={viewMenuRef}>
            <button
              type="button"
              className={viewMenuOpen ? "active" : ""}
              aria-label="View"
              aria-haspopup="menu"
              aria-expanded={viewMenuOpen}
              title="View options"
              onClick={() => setViewMenuOpen((current) => !current)}
            >
              <SlidersHorizontal size={13} />
              <span>View</span>
              <ChevronDown size={10} />
            </button>
            {viewMenuOpen && (
              <div className="mini-view-options" role="menu">
                <header>
                  <strong>Map direction</strong>
                  <span>Choose how the active map flows.</span>
                </header>
                <div className="mini-direction-options">
                  {MINI_DIRECTIONS.map(({ value, label, Icon }) => (
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={workflowDirection === value}
                      className={
                        workflowDirection === value ? "selected" : ""
                      }
                      key={value}
                      onClick={() => {
                        setWorkflowDirection(value);
                        setViewMenuOpen(false);
                      }}
                    >
                      <Icon size={13} />
                      <span>{label}</span>
                      {workflowDirection === value && <Check size={12} />}
                    </button>
                  ))}
                </div>
                <div className="mini-view-divider" />
                <button
                  type="button"
                  className="mini-view-setting"
                  role="menuitemcheckbox"
                  aria-checked={freePositioning}
                  onClick={() => setFreePositioning((current) => !current)}
                >
                  <Move size={13} />
                  <span>
                    <strong>Free positioning</strong>
                    <small>Drag cards anywhere.</small>
                  </span>
                  <i className={freePositioning ? "on" : ""}>
                    <b />
                  </i>
                </button>
                <button
                  type="button"
                  className="mini-reset-layout"
                  onClick={resetActiveLayout}
                >
                  <RotateCcw size={13} />
                  Reset layout and zoom
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            className={liveEnabled ? "active" : ""}
            aria-label={liveEnabled ? "Pause live updates" : "Resume live updates"}
            title={liveEnabled ? "Pause live updates" : "Resume live updates"}
            onClick={toggleLive}
          >
            {liveEnabled ? <Pause size={13} /> : <RefreshCw size={13} />}
          </button>
          <button
            type="button"
            className={alwaysOnTop ? "active" : ""}
            aria-label={
              alwaysOnTop ? "Turn off always on top" : "Keep window on top"
            }
            title={
              alwaysOnTop ? "Turn off always on top" : "Keep window on top"
            }
            onClick={() => void toggleAlwaysOnTop()}
          >
            {alwaysOnTop ? <PinOff size={13} /> : <Pin size={13} />}
          </button>
          <button
            type="button"
            aria-label="Open another project"
            title="Open another project"
            disabled={!window.divex}
            onClick={() => void openFolder()}
          >
            <FolderOpen size={13} />
          </button>
        </div>
      </header>

      <section className="mini-canvas">
        <FeatureErrorBoundary
          featureName={viewMode === "logic" ? "Mini logic map" : "Mini 2D map"}
          resetKey={`${payload.rootPath}:${viewMode}:${project.files.length}`}
          recoveryActions={[
            {
              label: "Retry map",
              primary: true,
              onSelect: retry,
            },
          ]}
        >
          <Suspense
            fallback={
              <div className="mini-loading">
                <div className="loader" />
                Loading logic map…
              </div>
            }
          >
            {viewMode === "logic" ? (
              <LogicalWorkflowVisualizer
                project={project}
                selectedId={selectedId}
                zoom={logicZoom}
                direction={workflowDirection}
                freePositioning={freePositioning}
                customPositions={logicPositions}
                autoFocusOnLayout={false}
                defaultFiltersOpen={false}
                onZoomChange={setLogicZoom}
                onCustomPositionsChange={setLogicPositions}
                onSelectNode={(node) => {
                  setSelectedId(node.id);
                  setSelectedNode(node);
                }}
              />
            ) : (
              <TwoDVisualizer
                project={project}
                expandedFolders={expandedFolders}
                expandedFiles={expandedFiles}
                selectedId={selectedId}
                zoom={twoDZoom}
                direction={workflowDirection}
                freePositioning={freePositioning}
                customPositions={twoDPositions}
                autoFocusOnLayout={false}
                onZoomChange={setTwoDZoom}
                onCustomPositionsChange={setTwoDPositions}
                onSelectNode={(node) => {
                  setSelectedId(node.id);
                  setSelectedNode(node);
                }}
                onToggleFolder={(id) =>
                  setExpandedFolders((current) => {
                    const next = new Set(current);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })
                }
                onToggleFile={(id) =>
                  setExpandedFiles((current) => {
                    const next = new Set(current);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })
                }
              />
            )}
          </Suspense>
        </FeatureErrorBoundary>

        {(loadingProject || isAnalyzing) && (
          <div className="mini-update-pill" aria-live="polite">
            <div className="loader" />
            {loadingProject ? "Loading project…" : "Updating relationships…"}
          </div>
        )}
        {error && (
          <div className="mini-error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={retry}>
              Retry
            </button>
          </div>
        )}
      </section>

      <footer className="mini-statusbar">
        <div className={`mini-live-status status-${liveStatus}`}>
          <i />
          <strong>{statusLabel}</strong>
          <span>{timeLabel(lastUpdate)}</span>
        </div>
        <div className="mini-change-summary" title={changedPaths.join("\n")}>
          {changedPaths.length > 0
            ? `${changedPaths[0]}${
                changedPaths.length > 1
                  ? ` +${changedPaths.length - 1}`
                  : ""
              }`
            : `${project.files.length} files · ${project.relationshipCount} links`}
        </div>
        {selectedNode?.path && (
          <button
            type="button"
            className="mini-open-editor"
            disabled={!projectIsLocal}
            onClick={() => void openSelectedInEditor()}
          >
            <span>{selectedNode.label}</span>
            <ExternalLink size={11} />
          </button>
        )}
      </footer>
    </main>
  );
}
