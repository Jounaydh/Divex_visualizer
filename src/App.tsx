import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useAnalyzedProject } from "./analysis/useAnalyzedProject";
import { AppHeader } from "./app/AppHeader";
import {
  folderIdsForPath,
} from "./app/expansion";
import {
  ProjectSidebar,
  type SidebarView,
} from "./app/ProjectSidebar";
import { VisualizerWorkspace } from "./app/VisualizerWorkspace";
import { WorkspaceResizer } from "./app/WorkspaceResizer";
import type { ExplorerEntry } from "./features/explorer/FileExplorer";
import { isValidExplorerName } from "./features/explorer/explorerNames";
import { canDebugFile, useDebugger } from "./features/debugger/useDebugger";
import {
  WorkspaceTrustBanner,
  WorkspaceTrustDialog,
} from "./features/workspace-trust/WorkspaceTrustUI";
import { useWorkspaceTrust } from "./features/workspace-trust/useWorkspaceTrust";
import { InspectorPanel } from "./features/inspector/InspectorPanel";
import {
  NavigationPalette,
  type NavigationCommand,
} from "./features/navigation/NavigationPalette";
import {
  definitionTarget,
  type NavigationSearchMode,
  type NavigationTarget,
} from "./features/navigation/navigationIndex";
import { useNavigationHistory } from "./features/navigation/useNavigationHistory";
import { useIntegratedTerminal } from "./features/terminal/useIntegratedTerminal";
import { ProjectSettingsDialog } from "./features/project-settings/ProjectSettingsDialog";
import {
  loadProjectSettings,
  saveProjectSettings,
  type ProjectSettings,
} from "./features/project-settings/projectSettings";
import { useProjectLiveRefresh } from "./features/project-settings/useProjectLiveRefresh";
import { DEFAULT_TWO_D_ZOOM } from "./config/ui";
import { sampleProject } from "./data/sampleProject";
import type {
  AnalyzedFile,
  ExperienceMode,
  FolderNode,
  ProjectLoadProgress,
  ProjectPayload,
  ProjectTask,
  TerminalProblem,
  ViewMode,
  VisualNode,
  WslStatusResult,
  WorkflowDirection,
  WorkflowPosition,
} from "./types";

const MIN_EXPLORER_WIDTH = 190;
const MAX_EXPLORER_WIDTH = 480;
const MIN_INSPECTOR_WIDTH = 280;
const MAX_INSPECTOR_WIDTH = 620;
const MIN_VISUALIZER_WIDTH = 420;
const WORKSPACE_RESIZERS_WIDTH = 12;
const TerminalDock = lazy(
  () => import("./features/terminal/TerminalDock"),
);

interface ExplorerClipboard {
  mode: "cut" | "copy";
  entry: ExplorerEntry;
}

interface AppProps {
  safeMode?: boolean;
}

interface NavigationSnapshot {
  node: VisualNode | null;
  showCode: boolean;
  line: number | null;
  viewMode: ViewMode;
}

function navigationSnapshotKey(snapshot: NavigationSnapshot) {
  return [
    snapshot.node?.id ?? "empty",
    snapshot.showCode ? "editor" : "map",
    snapshot.line ?? 0,
    snapshot.viewMode,
  ].join(":");
}

function defaultPaneWidths(workspaceWidth: number) {
  return workspaceWidth <= 1240
    ? { explorer: 240, inspector: 340 }
    : { explorer: 280, inspector: 380 };
}

export default function App({ safeMode = false }: AppProps) {
  const [payload, setPayload] = useState<ProjectPayload>(sampleProject);
  const {
    project,
    isAnalyzing,
    error: analysisError,
    retry: retryAnalysis,
  } = useAnalyzedProject(payload);
  const [experienceMode, setExperienceMode] =
    useState<ExperienceMode>("beginner");
  const [viewMode, setViewMode] = useState<ViewMode>("2d");
  const [workflowDirection, setWorkflowDirection] =
    useState<WorkflowDirection>("top-down");
  const [freePositioning, setFreePositioning] = useState(false);
  const [twoDZoom, setTwoDZoom] = useState(DEFAULT_TWO_D_ZOOM);
  const [logicZoom, setLogicZoom] = useState(0.8);
  const [twoDPositions, setTwoDPositions] = useState<
    Record<string, WorkflowPosition>
  >({});
  const [logicPositions, setLogicPositions] = useState<
    Record<string, WorkflowPosition>
  >({});
  const [expandedFolders, setExpandedFolders] = useState(
    () => new Set(["folder:lib"]),
  );
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedNode, setSelectedNode] = useState<VisualNode | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [editorRevealLine, setEditorRevealLine] = useState<number | null>(null);
  const [editorRevealKey, setEditorRevealKey] = useState(0);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [navigationMode, setNavigationMode] =
    useState<NavigationSearchMode>("files");
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [terminalMenuOpen, setTerminalMenuOpen] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false);
  const [workspaceTrustOpen, setWorkspaceTrustOpen] = useState(false);
  const [projectSettings, setProjectSettings] = useState(() =>
    loadProjectSettings(sampleProject.rootPath),
  );
  const [sidebarView, setSidebarView] = useState<SidebarView>("explorer");
  const [gitRefreshKey, setGitRefreshKey] = useState(0);
  const [openingProject, setOpeningProject] = useState(false);
  const [projectLoadProgress, setProjectLoadProgress] =
    useState<ProjectLoadProgress | null>(null);
  const [notice, setNotice] = useState<string | null>(
    safeMode
      ? "Divex recovered in safe mode. The 2D map and large-project protection are active."
      : null,
  );
  const [projectIsLocal, setProjectIsLocal] = useState(false);
  const [explorerClipboard, setExplorerClipboard] =
    useState<ExplorerClipboard | null>(null);
  const [projectTasks, setProjectTasks] = useState<ProjectTask[]>([]);
  const [projectTaskError, setProjectTaskError] = useState<string | null>(null);
  const [pendingTaskConfigurationOpen, setPendingTaskConfigurationOpen] = useState(false);
  const [wslStatus, setWslStatus] = useState<WslStatusResult | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const recoveryCheckedRootRef = useRef("");
  const [workspaceWidth, setWorkspaceWidth] = useState(
    () => window.innerWidth,
  );
  const [paneWidths, setPaneWidths] = useState(() =>
    defaultPaneWidths(window.innerWidth),
  );
  const navigationHistory = useNavigationHistory<NavigationSnapshot>(
    navigationSnapshotKey,
  );
  const workspaceTrust = useWorkspaceTrust(
    payload.rootPath,
    projectIsLocal && Boolean(window.divex),
  );

  useEffect(() => {
    if (!window.divex) return;
    return window.divex.onProjectLoadProgress(setProjectLoadProgress);
  }, []);

  useEffect(() => {
    if (window.divex?.platform !== "win32") return;
    let cancelled = false;
    void window.divex
      .getWslStatus()
      .then((status) => {
        if (!cancelled) setWslStatus(status);
      })
      .catch(() => {
        if (!cancelled) {
          setWslStatus({
            success: false,
            output: "WSL status could not be read.",
            available: false,
            distributions: [],
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (analysisError) {
      setNotice(`Project analysis stopped safely: ${analysisError}`);
    }
  }, [analysisError]);

  useEffect(() => {
    if (workspaceTrust.needsDecision) setWorkspaceTrustOpen(true);
  }, [workspaceTrust.needsDecision]);

  useEffect(() => {
    if (!isAnalyzing) setProjectLoadProgress(null);
  }, [isAnalyzing]);

  useEffect(() => {
    setGitRefreshKey((current) => current + 1);
  }, [payload.files, payload.rootPath]);

  useEffect(() => {
    const settings = loadProjectSettings(payload.rootPath);
    setProjectSettings(settings);
    setViewMode(settings.defaultView);
    setWorkflowDirection(settings.workflowDirection);
    setFreePositioning(settings.freePositioning);
  }, [payload.rootPath]);

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const resizeObserver = new ResizeObserver(([entry]) => {
      if (entry) setWorkspaceWidth(entry.contentRect.width);
    });
    resizeObserver.observe(workspace);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    setPaneWidths((current) => {
      const availableForSidebars = Math.max(
        MIN_EXPLORER_WIDTH + MIN_INSPECTOR_WIDTH,
        workspaceWidth -
          MIN_VISUALIZER_WIDTH -
          WORKSPACE_RESIZERS_WIDTH,
      );
      if (current.explorer + current.inspector <= availableForSidebars) {
        return current;
      }

      let overflow =
        current.explorer + current.inspector - availableForSidebars;
      const inspector = Math.max(
        MIN_INSPECTOR_WIDTH,
        current.inspector - overflow,
      );
      overflow -= current.inspector - inspector;
      const explorer = Math.max(
        MIN_EXPLORER_WIDTH,
        current.explorer - overflow,
      );
      return { explorer, inspector };
    });
  }, [workspaceWidth]);

  useEffect(() => {
    if (!projectIsLocal || !window.divex || !workspaceTrust.trusted) {
      setProjectTasks([]);
      setProjectTaskError(null);
      return;
    }
    let cancelled = false;
    void window.divex
      .listProjectTasks({ rootPath: payload.rootPath })
      .then((result) => {
        if (!cancelled) {
          setProjectTasks(result.tasks ?? []);
          setProjectTaskError(result.success ? null : result.output);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProjectTasks([]);
          setProjectTaskError("Project tasks could not be loaded.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    payload.files,
    payload.rootPath,
    projectIsLocal,
    workspaceTrust.trusted,
  ]);

  const explorerMaxWidth = Math.max(
    MIN_EXPLORER_WIDTH,
    Math.min(
      MAX_EXPLORER_WIDTH,
      workspaceWidth -
        paneWidths.inspector -
        MIN_VISUALIZER_WIDTH -
        WORKSPACE_RESIZERS_WIDTH,
    ),
  );
  const inspectorMaxWidth = Math.max(
    MIN_INSPECTOR_WIDTH,
    Math.min(
      MAX_INSPECTOR_WIDTH,
      workspaceWidth -
        paneWidths.explorer -
        MIN_VISUALIZER_WIDTH -
        WORKSPACE_RESIZERS_WIDTH,
    ),
  );

  const selectedFile = useMemo(() => {
    if (!selectedNode?.path) return null;
    return (
      project.files.find((file) => file.path === selectedNode.path) ?? null
    );
  }, [project.files, selectedNode]);
  const debuggerManager = useDebugger(
    payload.rootPath,
    projectIsLocal && workspaceTrust.trusted && Boolean(window.divex),
  );

  const showTransientNotice = (message: string, duration = 3500) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), duration);
  };
  useProjectLiveRefresh({
    rootPath: payload.rootPath,
    enabled: projectIsLocal && projectSettings.liveRefresh,
    onProject: setPayload,
    onNotice: showTransientNotice,
  });
  const terminal = useIntegratedTerminal({
    rootPath: payload.rootPath,
    enabled:
      projectIsLocal && workspaceTrust.trusted && Boolean(window.divex),
    onNotice: showTransientNotice,
  });

  const resetWorkspace = (
    nextProject: ProjectPayload,
    isLocalProject = false,
  ) => {
    const firstTopLevelFolder = nextProject.files
      .map((file) => file.path.split("/"))
      .find((parts) => parts.length > 1)?.[0];

    recoveryCheckedRootRef.current = "";
    setPayload(nextProject);
    setExpandedFolders(
      new Set(firstTopLevelFolder ? [`folder:${firstTopLevelFolder}`] : []),
    );
    setExpandedFiles(new Set());
    setTwoDZoom(DEFAULT_TWO_D_ZOOM);
    setLogicZoom(0.8);
    setTwoDPositions({});
    setLogicPositions({});
    setSelectedNode(null);
    setShowCode(false);
    setEditorRevealLine(null);
    setEditorRevealKey((current) => current + 1);
    navigationHistory.reset();
    setProjectIsLocal(isLocalProject);
  };

  const toggleFolderFreely = (id: string) => {
    setExpandedFolders((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleFileFreely = (id: string) => {
    setExpandedFiles((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const applyNavigationSnapshot = useCallback(
    (snapshot: NavigationSnapshot) => {
      if (snapshot.node?.path) {
        const ancestorIds = folderIdsForPath(snapshot.node.path);
        setExpandedFolders((current) => {
          const next = new Set(current);
          ancestorIds.forEach((id) => next.add(id));
          return next;
        });
      }
      setSelectedNode(snapshot.node);
      setViewMode(snapshot.viewMode);
      setShowCode(snapshot.showCode);
      setEditorRevealLine(snapshot.line);
      setEditorRevealKey((current) => current + 1);
    },
    [],
  );

  const visitNavigationSnapshot = useCallback(
    (snapshot: NavigationSnapshot) => {
      navigationHistory.visit(snapshot);
      applyNavigationSnapshot(snapshot);
    },
    [applyNavigationSnapshot, navigationHistory],
  );

  const selectFile = (file: AnalyzedFile) => {
    visitNavigationSnapshot({
      node: {
        id: file.id,
        label: file.name,
        subtitle: `${file.symbols.length} symbols · ${file.lineCount} lines`,
        kind: "file",
        path: file.path,
        position: [0, 0, 0],
      },
      showCode,
      line: showCode ? 1 : null,
      viewMode,
    });
  };

  const selectFolder = (folder: FolderNode) => {
    visitNavigationSnapshot({
      node: {
        id: folder.id,
        label: folder.name,
        subtitle: `${folder.folders.length + folder.files.length} direct items`,
        kind: "folder",
        path: folder.path,
        position: [0, 0, 0],
      },
      showCode: false,
      line: null,
      viewMode,
    });
  };

  const selectPath = (path: string) => {
    const file = project.files.find((item) => item.path === path);
    if (file) selectFile(file);
  };

  const openNavigationTarget = useCallback(
    (target: NavigationTarget) => {
      const file = project.files.find((item) => item.path === target.path);
      if (!file) {
        showTransientNotice("That project location is no longer available.");
        return;
      }
      const symbol = target.symbolId
        ? file.symbols.find((item) => item.id === target.symbolId)
        : undefined;
      visitNavigationSnapshot({
        node: symbol
          ? {
              id: symbol.id,
              label: symbol.name,
              subtitle: `${symbol.kind} · line ${symbol.line}`,
              kind: symbol.kind,
              path: file.path,
              parentId: symbol.parentSymbolId ?? file.id,
              position: [0, 0, 0],
            }
          : {
              id: file.id,
              label: file.name,
              subtitle: `${file.symbols.length} symbols · ${file.lineCount} lines`,
              kind: "file",
              path: file.path,
              position: [0, 0, 0],
            },
        showCode: true,
        line: Math.max(1, target.line),
        viewMode,
      });
    },
    [project.files, showTransientNotice, viewMode, visitNavigationSnapshot],
  );

  useEffect(() => {
    if (!pendingTaskConfigurationOpen) return;
    const configuration = project.files.find((file) => file.path === "divex.tasks.json");
    if (!configuration) return;
    setPendingTaskConfigurationOpen(false);
    openNavigationTarget({ kind: "file", path: configuration.path, line: 1 });
  }, [openNavigationTarget, pendingTaskConfigurationOpen, project.files]);

  useEffect(() => {
    const frame = debuggerManager.activeFrame;
    if (!frame?.filePath) return;
    setSidebarView("debugger");
    openNavigationTarget({
      kind: "file",
      path: frame.filePath,
      line: frame.line,
    });
  }, [debuggerManager.activeFrame, openNavigationTarget]);

  const persistFileContent = (path: string, content: string) => {
    setPayload((current) => ({
      ...current,
      files: current.files.map((file) =>
        file.path === path ? { ...file, content } : file,
      ),
    }));
  };

  const openProjectFrom = async (
    chooseProject: () => Promise<ProjectPayload | null>,
    preparationMessage: string,
  ) => {
    setFileMenuOpen(false);
    setTerminalMenuOpen(false);
    setProjectMenuOpen(false);
    setOpeningProject(true);
    setProjectLoadProgress({
      phase: "scanning",
      completed: 0,
      total: 0,
      message: preparationMessage,
    });
    try {
      const nextProject = await chooseProject();
      if (nextProject) {
        resetWorkspace(nextProject, true);
        if (nextProject.loadSummary) {
          const { totalFiles, cachedFiles, durationMs } =
            nextProject.loadSummary;
          showTransientNotice(
            `Loaded ${totalFiles} files in ${durationMs} ms${
              cachedFiles > 0 ? ` · reused ${cachedFiles}` : ""
            }.`,
          );
        }
      }
    } catch (error) {
      showTransientNotice(
        error instanceof Error
          ? error.message
          : "The project could not be opened.",
        4500,
      );
    } finally {
      setOpeningProject(false);
    }
  };

  const applyProjectSettings = (settings: ProjectSettings) => {
    const saved = saveProjectSettings(payload.rootPath, settings);
    setProjectSettings(saved);
    setViewMode(saved.defaultView);
    setWorkflowDirection(saved.workflowDirection);
    setFreePositioning(saved.freePositioning);
    setTwoDPositions({});
    setLogicPositions({});
    setProjectSettingsOpen(false);
    showTransientNotice("Project settings saved.");
  };

  const openProject = async () => {
    if (!window.divex) {
      showTransientNotice(
        "Folder selection is available in the Divex desktop window.",
      );
      return;
    }
    await openProjectFrom(
      () => window.divex!.chooseProject(),
      "Preparing project scan…",
    );
  };

  const openWslProject = async () => {
    if (!window.divex || window.divex.platform !== "win32") {
      showTransientNotice("WSL project support is available on Windows.");
      return;
    }
    if (wslStatus && !wslStatus.available) {
      showTransientNotice(wslStatus.output, 5000);
      return;
    }
    await openProjectFrom(
      () => window.divex!.chooseWslProject(),
      "Connecting to WSL and preparing the project scan…",
    );
  };

  const openMiniWindow = async () => {
    if (!projectIsLocal || !window.divex) {
      showTransientNotice(
        "Open a project before launching Divex Mini.",
      );
      return;
    }
    const result = await window.divex.openMiniWindow({
      rootPath: payload.rootPath,
    });
    showTransientNotice(result.output);
  };

  const createExplorerEntry = async (
    parentPath: string,
    entryKind: "file" | "folder",
    requestedName: string,
  ) => {
    const name = requestedName.trim();
    if (!isValidExplorerName(name)) {
      showTransientNotice("Enter a name that is valid on Windows.");
      return;
    }

    if (projectIsLocal && window.divex) {
      const create = async (nextName: string): Promise<void> => {
        const result = await window.divex!.createProjectEntry({
          rootPath: payload.rootPath,
          parentPath,
          entryKind,
          name: nextName,
        });
        if (result.conflict) {
          const alternative = window.prompt(
            `${result.output}\nEnter a different name:`,
            result.suggestedName ?? nextName,
          );
          if (alternative?.trim() && isValidExplorerName(alternative.trim())) {
            await create(alternative.trim());
          }
          return;
        }
        if (result.success && result.project) {
          resetWorkspace(result.project, true);
        }
        showTransientNotice(result.output, result.success ? 3500 : 4500);
      };
      await create(name);
      return;
    }

    const entryPath = parentPath ? `${parentPath}/${name}` : name;
    const exists =
      payload.files.some(
        (file) =>
          file.path === entryPath || file.path.startsWith(`${entryPath}/`),
      ) || (payload.folders ?? []).includes(entryPath);
    if (exists) {
      showTransientNotice(`“${name}” already exists in this folder.`);
      return;
    }
    resetWorkspace({
      ...payload,
      files:
        entryKind === "file"
          ? [...payload.files, { path: entryPath, content: "" }]
          : payload.files,
      folders:
        entryKind === "folder"
          ? [...new Set([...(payload.folders ?? []), entryPath])]
          : payload.folders,
    });
    showTransientNotice(`Created ${entryKind} ${name} in this demo session.`);
  };

  const duplicateExplorerEntry = async (entry: ExplorerEntry) => {
    if (projectIsLocal && window.divex) {
      const result = await window.divex.duplicateProjectEntry({
        rootPath: payload.rootPath,
        sourcePath: entry.path,
        sourceKind: entry.kind,
      });
      if (result.success && result.project) {
        resetWorkspace(result.project, true);
      }
      showTransientNotice(result.output, result.success ? 3500 : 4500);
      return;
    }

    const parentPath = entry.path.split("/").slice(0, -1).join("/");
    await pasteExplorerEntry(
      {
        kind: "folder",
        name: parentPath.split("/").at(-1) ?? payload.name,
        path: parentPath,
      },
      { entry, mode: "copy" },
    );
  };

  const renameExplorerEntry = async (
    entry: ExplorerEntry,
    newName: string,
  ) => {
    if (!isValidExplorerName(newName)) {
      showTransientNotice("Enter a name that is valid on Windows.");
      return;
    }

    if (projectIsLocal && window.divex) {
      const result = await window.divex.renameProjectEntry({
        rootPath: payload.rootPath,
        entryPath: entry.path,
        newName,
      });
      if (result.success && result.project) {
        resetWorkspace(result.project, true);
      }
      showTransientNotice(result.output, result.success ? 3500 : 4500);
      return;
    }

    const parts = entry.path.split("/");
    parts[parts.length - 1] = newName;
    const nextPath = parts.join("/");
    const prefix = `${entry.path}/`;
    const nextPrefix = `${nextPath}/`;
    const collides =
      payload.files.some((file) => {
        const belongsToEntry =
          file.path === entry.path || file.path.startsWith(prefix);
        if (belongsToEntry) return false;
        return file.path === nextPath || file.path.startsWith(nextPrefix);
      }) ||
      (payload.folders ?? []).some((folder) => {
        const belongsToEntry =
          folder === entry.path || folder.startsWith(prefix);
        if (belongsToEntry) return false;
        return folder === nextPath || folder.startsWith(nextPrefix);
      });
    if (collides) {
      showTransientNotice(`“${newName}” already exists in this folder.`);
      return;
    }
    const nextProject = {
      ...payload,
      files: payload.files.map((file) => {
        if (entry.kind === "file" && file.path === entry.path) {
          return { ...file, path: nextPath };
        }
        if (entry.kind === "folder" && file.path.startsWith(prefix)) {
          return {
            ...file,
            path: `${nextPrefix}${file.path.slice(prefix.length)}`,
          };
        }
        return file;
      }),
      folders: (payload.folders ?? []).map((folder) => {
        if (entry.kind !== "folder") return folder;
        if (folder === entry.path) return nextPath;
        if (folder.startsWith(prefix)) {
          return `${nextPrefix}${folder.slice(prefix.length)}`;
        }
        return folder;
      }),
    };
    resetWorkspace(nextProject);
    showTransientNotice(`Renamed to ${newName} in this demo session.`);
  };

  const deleteExplorerEntry = async (entry: ExplorerEntry) => {
    if (projectIsLocal && window.divex) {
      const result = await window.divex.deleteProjectEntry({
        rootPath: payload.rootPath,
        entryPath: entry.path,
        entryKind: entry.kind,
      });
      if (result.cancelled) return;
      if (result.success && result.project) {
        resetWorkspace(result.project, true);
      }
      showTransientNotice(result.output, result.success ? 3500 : 4500);
      return;
    }

    const confirmed = window.confirm(
      `Delete “${entry.name}” from this demo session?`,
    );
    if (!confirmed) return;
    const prefix = `${entry.path}/`;
    const nextProject = {
      ...payload,
      files: payload.files.filter((file) =>
        entry.kind === "file"
          ? file.path !== entry.path
          : !file.path.startsWith(prefix),
      ),
      folders: (payload.folders ?? []).filter((folder) =>
        entry.kind === "folder"
          ? folder !== entry.path && !folder.startsWith(prefix)
          : true,
      ),
    };
    resetWorkspace(nextProject);
    showTransientNotice(`Deleted ${entry.name} from this demo session.`);
  };

  const copyExplorerEntryPath = async (
    entry: ExplorerEntry,
    relative: boolean,
  ) => {
    if (projectIsLocal && window.divex) {
      const result = await window.divex.copyProjectEntryPath({
        rootPath: payload.rootPath,
        entryPath: entry.path,
        relative,
      });
      showTransientNotice(result.output);
      return;
    }
    await navigator.clipboard.writeText(entry.path);
    showTransientNotice("Relative path copied.");
  };

  const revealExplorerEntry = async (entry: ExplorerEntry) => {
    if (!projectIsLocal || !window.divex) return;
    const result = await window.divex.revealProjectEntry({
      rootPath: payload.rootPath,
      entryPath: entry.path,
    });
    if (!result.success) showTransientNotice(result.output, 4500);
  };

  const refreshExplorer = async () => {
    if (!projectIsLocal || !window.divex) {
      resetWorkspace(sampleProject);
      showTransientNotice("Demo project restored.");
      return;
    }
    setOpeningProject(true);
    setProjectLoadProgress({
      phase: "scanning",
      completed: 0,
      total: 0,
      message: "Checking project changes…",
    });
    try {
      const result = await window.divex.refreshProject({
        rootPath: payload.rootPath,
      });
      if (result.success && result.project) {
        resetWorkspace(result.project, true);
      }
      showTransientNotice(result.output, result.success ? 3500 : 4500);
    } finally {
      setOpeningProject(false);
    }
  };

  const openExplorerEntry = async (entry: ExplorerEntry) => {
    if (!projectIsLocal || !window.divex) {
      showTransientNotice("Open a project to use an external app.");
      return;
    }
    const result = await window.divex.openProjectEntry({
      rootPath: payload.rootPath,
      entryPath: entry.path,
    });
    if (!result.success) showTransientNotice(result.output, 4500);
  };

  const openExplorerTerminal = async (entry: ExplorerEntry) => {
    if (!workspaceTrust.trusted) {
      setWorkspaceTrustOpen(true);
      showTransientNotice("Trust this workspace before opening a terminal.");
      return;
    }
    const directory =
      entry.kind === "folder"
        ? entry.path
        : entry.path.split("/").slice(0, -1).join("/");
    await terminal.createShell(directory || undefined);
  };

  const shareExplorerEntry = async (entry: ExplorerEntry) => {
    if (!projectIsLocal || !window.divex) return;
    const result = await window.divex.shareProjectEntry({
      rootPath: payload.rootPath,
      entryPath: entry.path,
    });
    if (!result.success) showTransientNotice(result.output, 4500);
  };

  const stageExplorerEntry = (
    entry: ExplorerEntry,
    mode: "cut" | "copy",
  ) => {
    setExplorerClipboard({ entry, mode });
    showTransientNotice(
      `${mode === "cut" ? "Cut" : "Copied"} ${entry.name}. Choose a destination and Paste.`,
    );
  };

  const pasteExplorerEntry = async (
    target: ExplorerEntry,
    transferState: ExplorerClipboard | null = explorerClipboard,
  ) => {
    if (!transferState) return;
    const { entry: source, mode } = transferState;

    if (projectIsLocal && window.divex) {
      const transfer = async (destinationName?: string): Promise<void> => {
        const result = await window.divex!.pasteProjectEntry({
          rootPath: payload.rootPath,
          sourcePath: source.path,
          sourceKind: source.kind,
          targetPath: target.path,
          targetKind: target.kind,
          mode,
          destinationName,
        });
        if (result.conflict) {
          const alternative = window.prompt(
            `${result.output}\nMove it with a different name:`,
            result.suggestedName ?? source.name,
          );
          if (alternative?.trim() && isValidExplorerName(alternative.trim())) {
            await transfer(alternative.trim());
          }
          return;
        }
        if (result.success && result.project) {
          resetWorkspace(result.project, true);
          if (
            mode === "cut" &&
            explorerClipboard?.entry.path === source.path
          ) {
            setExplorerClipboard(null);
          }
        }
        showTransientNotice(result.output, result.success ? 3500 : 4500);
      };
      await transfer();
      return;
    }

    const sourcePrefix = `${source.path}/`;
    const destinationDirectory =
      target.kind === "folder"
        ? target.path
        : target.path.split("/").slice(0, -1).join("/");
    if (
      source.kind === "folder" &&
      (destinationDirectory === source.path ||
        destinationDirectory.startsWith(sourcePrefix))
    ) {
      showTransientNotice("A folder cannot be pasted inside itself.");
      return;
    }

    const joinPath = (directory: string, name: string) =>
      directory ? `${directory}/${name}` : name;
    const entryExists = (candidate: string) =>
      payload.files.some(
        (file) =>
          file.path === candidate ||
          file.path.startsWith(`${candidate}/`),
      ) ||
      (payload.folders ?? []).some(
        (folder) =>
          folder === candidate || folder.startsWith(`${candidate}/`),
      );
    const extensionIndex =
      source.kind === "file" ? source.name.lastIndexOf(".") : -1;
    const baseName =
      extensionIndex > 0
        ? source.name.slice(0, extensionIndex)
        : source.name;
    const extension =
      extensionIndex > 0 ? source.name.slice(extensionIndex) : "";
    let destinationPath = joinPath(destinationDirectory, source.name);

    if (mode === "copy") {
      let copyIndex = 1;
      while (entryExists(destinationPath)) {
        const suffix = copyIndex === 1 ? " copy" : ` copy ${copyIndex}`;
        destinationPath = joinPath(
          destinationDirectory,
          `${baseName}${suffix}${extension}`,
        );
        copyIndex += 1;
      }
    } else if (destinationPath === source.path) {
      showTransientNotice("The item is already in this folder.");
      return;
    } else if (entryExists(destinationPath)) {
      showTransientNotice(`“${source.name}” already exists here.`);
      return;
    }

    const sourceFiles = payload.files.filter((file) =>
      source.kind === "file"
        ? file.path === source.path
        : file.path.startsWith(sourcePrefix),
    );
    const sourceFolders = (payload.folders ?? []).filter(
      (folder) =>
        folder === source.path || folder.startsWith(sourcePrefix),
    );
    if (sourceFiles.length === 0 && sourceFolders.length === 0) {
      showTransientNotice("The copied item is no longer available.");
      return;
    }
    const moveFile = (file: ProjectPayload["files"][number]) => ({
      ...file,
      path:
        source.kind === "file"
          ? destinationPath
          : `${destinationPath}/${file.path.slice(sourcePrefix.length)}`,
    });
    const nextProject = {
      ...payload,
      files:
        mode === "copy"
          ? [...payload.files, ...sourceFiles.map(moveFile)]
          : payload.files.map((file) =>
              sourceFiles.includes(file) ? moveFile(file) : file,
            ),
      folders:
        mode === "copy"
          ? [
              ...(payload.folders ?? []),
              ...sourceFolders.map((folder) =>
                folder === source.path
                  ? destinationPath
                  : `${destinationPath}/${folder.slice(sourcePrefix.length)}`,
              ),
            ]
          : (payload.folders ?? []).map((folder) =>
              sourceFolders.includes(folder)
                ? folder === source.path
                  ? destinationPath
                  : `${destinationPath}/${folder.slice(sourcePrefix.length)}`
                : folder,
            ),
    };
    resetWorkspace(nextProject);
    if (mode === "cut") setExplorerClipboard(null);
    showTransientNotice(
      `${mode === "copy" ? "Copied" : "Moved"} ${source.name} in this demo session.`,
    );
  };

  const moveExplorerEntry = async (
    source: ExplorerEntry,
    target: ExplorerEntry,
  ) => {
    await pasteExplorerEntry(target, { entry: source, mode: "cut" });
  };

  const openExternalTerminal = async (profileId?: string) => {
    if (!projectIsLocal || !window.divex) {
      showTransientNotice("Open a project to launch a terminal.");
      return;
    }
    if (!workspaceTrust.trusted) {
      setWorkspaceTrustOpen(true);
      showTransientNotice("Trust this workspace before opening a terminal.");
      return;
    }
    const result = await window.divex.openProjectTerminal({
      rootPath: payload.rootPath,
      profileId: profileId ?? terminal.selectedProfileId ?? undefined,
    });
    if (!result.success) showTransientNotice(result.output, 4500);
  };

  const configureProjectTasks = async () => {
    if (!projectIsLocal || !window.divex) return;
    if (!workspaceTrust.trusted) {
      setWorkspaceTrustOpen(true);
      showTransientNotice("Trust this workspace before configuring executable tasks.");
      return;
    }
    const existing = project.files.find((file) => file.path === "divex.tasks.json");
    if (existing) {
      openNavigationTarget({ kind: "file", path: existing.path, line: 1 });
      return;
    }
    const template = `${JSON.stringify({
      version: 1,
      tasks: [],
      _help: "Add tasks with id, label, group, command, args, optional cwd, and problemMatcher.",
      _example: {
        id: "build",
        label: "Build project",
        group: "build",
        command: "npm",
        args: ["run", "build"],
        cwd: "",
        problemMatcher: "typescript",
      },
    }, null, 2)}\n`;
    const created = await window.divex.createProjectEntry({
      rootPath: payload.rootPath,
      parentPath: "",
      entryKind: "file",
      name: "divex.tasks.json",
    });
    if (!created.success || !created.project || !created.entryPath) {
      showTransientNotice(created.output, 4500);
      return;
    }
    const saved = await window.divex.saveProjectFile({
      rootPath: payload.rootPath,
      filePath: created.entryPath,
      content: template,
    });
    if (!saved.success) {
      showTransientNotice(saved.output, 4500);
      return;
    }
    const nextPayload = {
      ...created.project,
      files: created.project.files.map((file) =>
        file.path === created.entryPath ? { ...file, content: template } : file,
      ),
    };
    setPendingTaskConfigurationOpen(true);
    resetWorkspace(nextPayload, true);
    showTransientNotice("Created divex.tasks.json. Add tasks, then save the file.");
  };

  const openTerminalProblem = (problem: TerminalProblem) => {
    const normalized = problem.path.replaceAll("\\", "/").replace(/^\.\//, "");
    const file = project.files.find(
      (candidate) =>
        candidate.path === normalized || normalized.endsWith(`/${candidate.path}`),
    );
    if (!file) {
      showTransientNotice(`Could not match ${problem.path} to a project file.`, 4500);
      return;
    }
    openNavigationTarget({ kind: "file", path: file.path, line: problem.line });
  };

  const openTerminalLink = async (url: string) => {
    if (!window.divex || !workspaceTrust.trusted) return;
    const result = await window.divex.openTerminalLink({ rootPath: payload.rootPath, url });
    if (!result.success) showTransientNotice(result.output, 4500);
  };

  const runProjectTask = async (taskId: string) => {
    if (!workspaceTrust.trusted) {
      setWorkspaceTrustOpen(true);
      showTransientNotice("Trust this workspace before running tasks.");
      return;
    }
    await terminal.runTask(taskId);
  };

  const runProjectTaskExternally = async (taskId: string, profileId?: string) => {
    if (!window.divex || !workspaceTrust.trusted) {
      setWorkspaceTrustOpen(true);
      return;
    }
    const result = await window.divex.runProjectTask({
      rootPath: payload.rootPath,
      taskId,
      profileId,
    });
    showTransientNotice(result.output, result.success ? 3500 : 4500);
  };

  const runBuildTask = () => {
    const buildTask = projectTasks.find((task) => task.group === "build");
    if (buildTask) void runProjectTask(buildTask.id);
  };

  const runActiveFile = async () => {
    if (!selectedFile) return;
    if (!workspaceTrust.trusted) {
      setWorkspaceTrustOpen(true);
      showTransientNotice("Trust this workspace before running project files.");
      return;
    }
    await terminal.runFile(selectedFile.path);
  };

  const changeView = (mode: ViewMode) => {
    setViewMode(mode);
    setShowCode(false);
  };

  const changeWorkflowDirection = (direction: WorkflowDirection) => {
    setWorkflowDirection(direction);
    setTwoDPositions({});
    setLogicPositions({});
  };

  const toggleFreePositioning = () => {
    setFreePositioning((value) => !value);
  };

  const handleSelectNode = (node: VisualNode) => {
    visitNavigationSnapshot({
      node,
      showCode: false,
      line: null,
      viewMode,
    });
  };

  const openNavigation = useCallback((mode: NavigationSearchMode) => {
    setNavigationMode(mode);
    setNavigationOpen(true);
    setFileMenuOpen(false);
    setTerminalMenuOpen(false);
    setProjectMenuOpen(false);
  }, []);

  const openSelectedSource = useCallback(() => {
    if (!selectedNode || !selectedFile) return;
    const symbol = selectedFile.symbols.find(
      (candidate) => candidate.id === selectedNode.id,
    );
    visitNavigationSnapshot({
      node: selectedNode,
      showCode: true,
      line: symbol?.line ?? 1,
      viewMode,
    });
  }, [
    selectedFile,
    selectedNode,
    viewMode,
    visitNavigationSnapshot,
  ]);

  const closeSelectedSource = useCallback(() => {
    visitNavigationSnapshot({
      node: selectedNode,
      showCode: false,
      line: null,
      viewMode,
    });
  }, [selectedNode, viewMode, visitNavigationSnapshot]);

  const goBack = useCallback(() => {
    const location = navigationHistory.back();
    if (location) applyNavigationSnapshot(location);
  }, [applyNavigationSnapshot, navigationHistory]);

  const goForward = useCallback(() => {
    const location = navigationHistory.forward();
    if (location) applyNavigationSnapshot(location);
  }, [applyNavigationSnapshot, navigationHistory]);

  const selectedDefinition = definitionTarget(
    project,
    selectedNode?.id ?? null,
  );

  useEffect(() => {
    if (!window.divex || !projectIsLocal) return;
    if (recoveryCheckedRootRef.current === payload.rootPath) return;
    recoveryCheckedRootRef.current = payload.rootPath;
    let cancelled = false;
    void window.divex
      .listEditorRecoveries({ rootPath: payload.rootPath })
      .then((result) => {
        if (cancelled || !result.success) return;
        const recoverable = result.entries.find((entry) => {
          const diskFile = payload.files.find(
            (candidate) => candidate.path === entry.filePath,
          );
          return diskFile && diskFile.content !== entry.content;
        });
        if (recoverable) {
          openNavigationTarget({
            kind: "file",
            path: recoverable.filePath,
            line: 1,
          });
          showTransientNotice(
            "Recovery-protected editor changes were found from the previous session.",
            5000,
          );
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [openNavigationTarget, payload.files, payload.rootPath, projectIsLocal]);
  const isMac = window.divex?.platform === "darwin";
  const navigationCommands: NavigationCommand[] = [
    {
      id: "navigation.quick-open",
      title: "Quick Open File",
      description: "Find a project file by name or path",
      shortcut: isMac ? "⌘P" : "Ctrl+P",
      keywords: "search files navigation",
      run: () => openNavigation("files"),
    },
    {
      id: "navigation.symbols",
      title: "Go to Symbol",
      description: "Find a class, function, method, or widget",
      shortcut: isMac ? "⇧⌘O" : "Ctrl+Shift+O",
      keywords: "symbols outline function class",
      run: () => openNavigation("symbols"),
    },
    {
      id: "navigation.text",
      title: "Search Workspace Text",
      description: "Search inside every loaded source file",
      shortcut: isMac ? "⇧⌘F" : "Ctrl+Shift+F",
      keywords: "find text workspace",
      run: () => openNavigation("text"),
    },
    {
      id: "navigation.definition",
      title: "Go to Selected Definition",
      description: "Open the selected file or symbol at its definition",
      disabled: !selectedDefinition,
      keywords: "definition source line",
      run: () => {
        if (selectedDefinition) openNavigationTarget(selectedDefinition);
      },
    },
    {
      id: "navigation.references",
      title: "Find References to Selection",
      description: "List code that imports, calls, creates, or uses it",
      disabled: !selectedNode,
      keywords: "references usages incoming callers",
      run: () => openNavigation("references"),
    },
    {
      id: "view.project-map",
      title: "Show 2D Project Map",
      description: "Open the expandable folder and file structure",
      keywords: "view structure map",
      run: () => changeView("2d"),
    },
    {
      id: "view.logic-map",
      title: "Show Logic Map",
      description: "Open calls, creation, inheritance, and imports",
      keywords: "view relationships workflow",
      run: () => changeView("logic"),
    },
    {
      id: "view.source-control",
      title: "Show Source Control",
      description: "Review, stage, and commit local Git changes",
      shortcut: "Ctrl+Shift+G",
      disabled: !projectIsLocal,
      keywords: "git source control changes commit stage",
      run: () => setSidebarView("source-control"),
    },
    {
      id: "view.source",
      title: showCode ? "Close Source Editor" : "View Selected Source",
      description: showCode
        ? "Return to the active visual map"
        : "Open the selected file at its current symbol",
      disabled: !selectedFile,
      keywords: "editor code source",
      run: showCode ? closeSelectedSource : openSelectedSource,
    },
    {
      id: "project.refresh",
      title: "Refresh Project",
      description: "Scan changed files and rebuild project analysis",
      keywords: "reload rescan",
      run: () => void refreshExplorer(),
    },
    {
      id: "project.open-folder",
      title: "Open Folder…",
      description: "Choose another project from this computer",
      keywords: "workspace project",
      run: () => void openProject(),
    },
    {
      id: "terminal.toggle",
      title: terminal.open ? "Hide Integrated Terminal" : "Show Integrated Terminal",
      description: "Toggle the docked project terminal",
      shortcut: "Ctrl+`",
      disabled: !projectIsLocal || !workspaceTrust.trusted,
      keywords: "terminal shell console panel",
      run: () =>
        terminal.open ? terminal.setOpen(false) : terminal.show(),
    },
    {
      id: "terminal.new",
      title: "New Integrated Terminal",
      description: "Start another interactive shell in this project",
      disabled: !projectIsLocal || !workspaceTrust.trusted,
      keywords: "terminal shell session",
      run: () => void terminal.createShell(),
    },
    {
      id: "workspace.trust",
      title: workspaceTrust.trusted
        ? "Manage Workspace Trust"
        : "Trust This Workspace…",
      description: workspaceTrust.trusted
        ? "Review or revoke execution permission for this folder"
        : "Enable tasks, terminals, scripts, and debugging for this folder",
      disabled: !projectIsLocal,
      keywords: "workspace trust restricted security safe",
      run: () => setWorkspaceTrustOpen(true),
    },
    {
      id: "terminal.terminate",
      title: "Terminate Active Terminal",
      description: "Stop and close the selected terminal session",
      disabled: !terminal.activeSession,
      keywords: "terminal stop kill task",
      run: () => {
        if (terminal.activeSession) {
          void terminal.closeSession(terminal.activeSession.id);
        }
      },
    },
    {
      id: "mode.guided",
      title: "Use Guided Mode",
      description: "Show simpler beginner-friendly explanations",
      keywords: "beginner simple",
      run: () => setExperienceMode("beginner"),
    },
    {
      id: "mode.advanced",
      title: "Use Advanced Mode",
      description: "Show professional relationship details",
      keywords: "senior professional",
      run: () => setExperienceMode("advanced"),
    },
    {
      id: "layout.free-positioning",
      title: freePositioning
        ? "Disable Free Positioning"
        : "Enable Free Positioning",
      description: "Allow workflow cards to be dragged manually",
      keywords: "layout drag cards",
      run: toggleFreePositioning,
    },
  ];

  useEffect(() => {
    const handleNavigationShortcut = (event: KeyboardEvent) => {
      const commandKey = event.metaKey || event.ctrlKey;
      if (event.ctrlKey && event.key === "`") {
        event.preventDefault();
        if (!workspaceTrust.trusted) setWorkspaceTrustOpen(true);
        else if (terminal.open) terminal.setOpen(false);
        else terminal.show();
      } else if (
        commandKey &&
        event.shiftKey &&
        event.key.toLowerCase() === "b"
      ) {
        event.preventDefault();
        if (!workspaceTrust.trusted) setWorkspaceTrustOpen(true);
        else runBuildTask();
      } else if (commandKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        openNavigation(event.shiftKey ? "commands" : "files");
      } else if (
        commandKey &&
        event.shiftKey &&
        event.key.toLowerCase() === "o"
      ) {
        event.preventDefault();
        openNavigation("symbols");
      } else if (
        commandKey &&
        event.shiftKey &&
        event.key.toLowerCase() === "f"
      ) {
        event.preventDefault();
        openNavigation("text");
      } else if (
        event.ctrlKey &&
        event.shiftKey &&
        event.key.toLowerCase() === "g"
      ) {
        event.preventDefault();
        setSidebarView("source-control");
      } else if (
        event.ctrlKey &&
        event.shiftKey &&
        event.key.toLowerCase() === "d"
      ) {
        event.preventDefault();
        setSidebarView("debugger");
      } else if (event.key === "F5" && event.shiftKey) {
        event.preventDefault();
        void debuggerManager.stop();
      } else if (event.key === "F5") {
        event.preventDefault();
        if (!workspaceTrust.trusted) {
          setWorkspaceTrustOpen(true);
          return;
        }
        setSidebarView("debugger");
        if (debuggerManager.session?.state === "stopped") {
          void debuggerManager.control("continue");
        } else if (!debuggerManager.session && selectedFile && canDebugFile(selectedFile.extension)) {
          void debuggerManager.start(selectedFile.path);
        }
      } else if (event.key === "F6") {
        event.preventDefault();
        void debuggerManager.control("pause");
      } else if (event.key === "F10") {
        event.preventDefault();
        void debuggerManager.control("next");
      } else if (event.key === "F11") {
        event.preventDefault();
        void debuggerManager.control(event.shiftKey ? "stepOut" : "stepIn");
      } else if (event.altKey && event.key === "ArrowLeft") {
        event.preventDefault();
        goBack();
      } else if (event.altKey && event.key === "ArrowRight") {
        event.preventDefault();
        goForward();
      }
    };
    window.addEventListener("keydown", handleNavigationShortcut);
    return () =>
      window.removeEventListener("keydown", handleNavigationShortcut);
  }, [
    debuggerManager,
    goBack,
    goForward,
    openNavigation,
    selectedFile,
    terminal,
    workspaceTrust.trusted,
  ]);

  return (
    <main className="app-shell">
      <AppHeader
        fileMenuOpen={fileMenuOpen}
        terminalMenuOpen={terminalMenuOpen}
        terminalEnabled={
          projectIsLocal && workspaceTrust.trusted && Boolean(window.divex)
        }
        miniEnabled={projectIsLocal && Boolean(window.divex)}
        wslEnabled={Boolean(wslStatus?.available)}
        wslLabel={
          wslStatus?.available
            ? wslStatus.defaultDistribution ?? "WSL"
            : wslStatus
              ? "Unavailable"
              : "Checking WSL…"
        }
        tasks={projectTasks}
        hasTerminalSessions={terminal.sessions.length > 0}
        hasActiveTerminal={Boolean(terminal.activeSession)}
        activeTerminalRunning={terminal.activeSession?.status === "running"}
        workspaceTrustState={
          !projectIsLocal
            ? "demo"
            : workspaceTrust.loading
              ? "checking"
              : workspaceTrust.trusted
                ? "trusted"
                : "restricted"
        }
        canGoBack={navigationHistory.canGoBack}
        canGoForward={navigationHistory.canGoForward}
        canRunActiveFile={
          projectIsLocal &&
          workspaceTrust.trusted &&
          Boolean(
            selectedFile &&
              (selectedFile.extension === "dart" ||
                selectedFile.extension === "py" ||
                selectedFile.extension === "pyw" ||
                selectedFile.extension === "java" ||
                selectedFile.extension === "js" ||
                selectedFile.extension === "mjs" ||
                selectedFile.extension === "cjs" ||
                selectedFile.extension === "ts" ||
                selectedFile.extension === "mts" ||
                selectedFile.extension === "cts"),
          )
        }
        onToggleFileMenu={() => {
          setFileMenuOpen((value) => !value);
          setTerminalMenuOpen(false);
        }}
        onToggleTerminalMenu={() => {
          setTerminalMenuOpen((value) => !value);
          setFileMenuOpen(false);
        }}
        onCloseMenus={() => {
          setFileMenuOpen(false);
          setTerminalMenuOpen(false);
        }}
        onOpenProject={openProject}
        onOpenWslProject={() => void openWslProject()}
        onOpenMini={() => void openMiniWindow()}
        onToggleWorkspaceTrust={() => setWorkspaceTrustOpen(true)}
        onNewTerminal={() => void terminal.createShell()}
        onOpenExternalTerminal={() => void openExternalTerminal()}
        onShowTerminal={terminal.show}
        onRestartTerminal={() => void terminal.restartActive()}
        onTerminateTerminal={() => {
          if (terminal.activeSession) {
            void terminal.closeSession(terminal.activeSession.id);
          }
        }}
        onRunTask={(taskId) => void runProjectTask(taskId)}
        onRunBuildTask={runBuildTask}
        onRunActiveFile={() => void runActiveFile()}
        onGoBack={goBack}
        onGoForward={goForward}
        onOpenQuickSearch={() => openNavigation("files")}
      />

      <div className="workspace-trust-slot">
        <WorkspaceTrustBanner
          manager={workspaceTrust}
          projectName={project.name}
          onManage={() => setWorkspaceTrustOpen(true)}
        />
      </div>

      <div
        className="workspace"
        ref={workspaceRef}
        style={
          {
            "--explorer-width": `${paneWidths.explorer}px`,
            "--inspector-width": `${paneWidths.inspector}px`,
          } as CSSProperties
        }
      >
        <ProjectSidebar
          project={project}
          activeView={sidebarView}
          selectedId={selectedNode?.id ?? null}
          selectedFile={selectedFile}
          debuggerManager={debuggerManager}
          workspaceTrusted={workspaceTrust.trusted}
          canUseNativePaths={projectIsLocal && Boolean(window.divex)}
          canShare={
            projectIsLocal &&
            window.divex?.platform === "darwin"
          }
          hasClipboard={Boolean(explorerClipboard)}
          projectMenuOpen={projectMenuOpen}
          gitRefreshKey={gitRefreshKey}
          newFileExtension={projectSettings.newFileExtension}
          gitAutoRefresh={projectSettings.gitAutoRefresh}
          confirmGitDiscard={projectSettings.confirmGitDiscard}
          onChangeView={setSidebarView}
          onToggleProjectMenu={() =>
            setProjectMenuOpen((value) => !value)
          }
          onOpenProject={openProject}
          onOpenWslProject={() => void openWslProject()}
          onLoadDemo={() => {
            resetWorkspace(sampleProject);
            setProjectMenuOpen(false);
          }}
          onOpenProjectSettings={() => {
            setProjectMenuOpen(false);
            setProjectSettingsOpen(true);
          }}
          onOpenWorkspaceTrust={() => {
            setProjectMenuOpen(false);
            setWorkspaceTrustOpen(true);
          }}
          onSelectFile={selectFile}
          onSelectFolder={selectFolder}
          onCreateEntry={(parentPath, kind, name) =>
            void createExplorerEntry(parentPath, kind, name)
          }
          onDuplicateEntry={(entry) => void duplicateExplorerEntry(entry)}
          onMoveEntry={(source, target) =>
            void moveExplorerEntry(source, target)
          }
          onRenameEntry={(entry, newName) =>
            void renameExplorerEntry(entry, newName)
          }
          onDeleteEntry={(entry) => void deleteExplorerEntry(entry)}
          onCopyEntryPath={(entry, relative) =>
            void copyExplorerEntryPath(entry, relative)
          }
          onRevealEntry={(entry) => void revealExplorerEntry(entry)}
          onRefresh={() => void refreshExplorer()}
          onOpenExternal={(entry) => void openExplorerEntry(entry)}
          onOpenTerminal={(entry) => void openExplorerTerminal(entry)}
          onShareEntry={(entry) => void shareExplorerEntry(entry)}
          onCutEntry={(entry) => stageExplorerEntry(entry, "cut")}
          onCopyEntry={(entry) => stageExplorerEntry(entry, "copy")}
          onPasteEntry={(entry) => void pasteExplorerEntry(entry)}
          onOpenGitFile={(path) =>
            openNavigationTarget({ kind: "file", path, line: 1 })
          }
          onGitRepositoryChanged={() => {
            if (!window.divex || !projectIsLocal) return;
            void window.divex
              .refreshProject({ rootPath: payload.rootPath })
              .then((result) => {
                if (result.success && result.project) setPayload(result.project);
              });
          }}
          onOpenDebugFrame={(frame) => {
            if (!frame.filePath) return;
            openNavigationTarget({
              kind: "file",
              path: frame.filePath,
              line: frame.line,
            });
          }}
        />

        <WorkspaceResizer
          className="explorer-resizer"
          label="Resize project explorer"
          value={paneWidths.explorer}
          min={MIN_EXPLORER_WIDTH}
          max={explorerMaxWidth}
          panelSide="before"
          onChange={(explorer) =>
            setPaneWidths((current) => ({ ...current, explorer }))
          }
          onReset={() => {
            const defaults = defaultPaneWidths(workspaceWidth);
            setPaneWidths((current) => ({
              ...current,
              explorer: Math.min(defaults.explorer, explorerMaxWidth),
            }));
          }}
        />

        <VisualizerWorkspace
          project={project}
          selectedFile={selectedFile}
          selectedId={selectedNode?.id ?? null}
          viewMode={viewMode}
          experienceMode={experienceMode}
          showCode={showCode}
          editorRevealLine={editorRevealLine}
          editorRevealKey={editorRevealKey}
          breakpoints={debuggerManager.breakpoints}
          debugLocation={
            debuggerManager.activeFrame?.filePath
              ? {
                  filePath: debuggerManager.activeFrame.filePath,
                  line: debuggerManager.activeFrame.line,
                }
              : null
          }
          executionEnabled={workspaceTrust.trusted}
          twoDZoom={twoDZoom}
          logicZoom={logicZoom}
          workflowDirection={workflowDirection}
          freePositioning={freePositioning}
          twoDPositions={twoDPositions}
          logicPositions={logicPositions}
          expandedFolders={expandedFolders}
          expandedFiles={expandedFiles}
          workspaceTrusted={workspaceTrust.trusted}
          onChangeView={changeView}
          onChangeExperience={setExperienceMode}
          onChangeWorkflowDirection={changeWorkflowDirection}
          onToggleFreePositioning={toggleFreePositioning}
          onResetTwoDPositions={() => {
            if (viewMode === "logic") setLogicPositions({});
            else setTwoDPositions({});
          }}
          onFullscreenError={(message) => {
            showTransientNotice(message);
          }}
          onShowVisualizer={closeSelectedSource}
          onOpenEditorFile={(path) =>
            openNavigationTarget({ kind: "file", path, line: 1 })
          }
          onOpenEditorLocation={(path, line) =>
            openNavigationTarget({ kind: "file", path, line })
          }
          onSelectNode={handleSelectNode}
          onToggleFolderFreely={toggleFolderFreely}
          onToggleFileFreely={toggleFileFreely}
          onTwoDZoomChange={setTwoDZoom}
          onLogicZoomChange={setLogicZoom}
          onTwoDPositionsChange={setTwoDPositions}
          onLogicPositionsChange={setLogicPositions}
          onPersistFile={persistFileContent}
          onToggleBreakpoint={debuggerManager.toggleBreakpoint}
        />

        <WorkspaceResizer
          className="inspector-resizer"
          label="Resize file properties"
          value={paneWidths.inspector}
          min={MIN_INSPECTOR_WIDTH}
          max={inspectorMaxWidth}
          panelSide="after"
          onChange={(inspector) =>
            setPaneWidths((current) => ({ ...current, inspector }))
          }
          onReset={() => {
            const defaults = defaultPaneWidths(workspaceWidth);
            setPaneWidths((current) => ({
              ...current,
              inspector: Math.min(defaults.inspector, inspectorMaxWidth),
            }));
          }}
        />

        <InspectorPanel
          project={project}
          selectedNode={selectedNode}
          selectedFile={selectedFile}
          showCode={showCode}
          onToggleCode={
            showCode ? closeSelectedSource : openSelectedSource
          }
          onClose={() => {
            visitNavigationSnapshot({
              node: null,
              showCode: false,
              line: null,
              viewMode,
            });
          }}
          onSelectPath={selectPath}
          onSelectNode={handleSelectNode}
        />
      </div>

      {(terminal.open || terminal.sessions.length > 0) && (
        <Suspense
          fallback={
            <div className="terminal-loading">
              Loading integrated terminal…
            </div>
          }
        >
          <TerminalDock
            manager={terminal}
            tasks={projectTasks}
            taskError={projectTaskError}
            onOpenExternal={(profileId) => void openExternalTerminal(profileId)}
            onConfigureTasks={() => void configureProjectTasks()}
            onRunExternalTask={(taskId, profileId) => void runProjectTaskExternally(taskId, profileId)}
            onOpenProblem={openTerminalProblem}
            onOpenLink={(url) => void openTerminalLink(url)}
          />
        </Suspense>
      )}

      <NavigationPalette
        open={navigationOpen}
        mode={navigationMode}
        project={project}
        referenceNodeId={selectedNode?.id ?? null}
        commands={navigationCommands}
        onModeChange={setNavigationMode}
        onNavigate={openNavigationTarget}
        onClose={() => setNavigationOpen(false)}
      />

      <ProjectSettingsDialog
        open={projectSettingsOpen}
        projectName={project.name}
        settings={projectSettings}
        onClose={() => setProjectSettingsOpen(false)}
        onSave={applyProjectSettings}
      />

      <WorkspaceTrustDialog
        open={workspaceTrustOpen && workspaceTrust.enabled}
        firstDecision={workspaceTrust.needsDecision}
        projectName={project.name}
        rootPath={payload.rootPath}
        manager={workspaceTrust}
        onClose={() => setWorkspaceTrustOpen(false)}
        onChanged={(trusted) => {
          showTransientNotice(
            trusted
              ? "Workspace trusted. Execution features are enabled."
              : "Restricted Mode enabled. Execution features are disabled.",
          );
        }}
      />

      {(openingProject || isAnalyzing) && (
        <div className="loading-overlay">
          <div className="loader" />
          <strong>
            {isAnalyzing
              ? "Analyzing project in the background…"
              : projectLoadProgress?.message ?? "Loading project…"}
          </strong>
          <span>
            {isAnalyzing
              ? "Mapping files, symbols, imports, and logical relationships"
              : projectLoadProgress?.total
                ? `${projectLoadProgress.completed} of ${projectLoadProgress.total}`
                : "Discovering supported project files"}
          </span>
          {!isAnalyzing &&
            Boolean(projectLoadProgress?.total) && (
              <div className="loading-progress" aria-hidden="true">
                <i
                  style={{
                    width: `${Math.min(
                      100,
                      (projectLoadProgress!.completed /
                        projectLoadProgress!.total) *
                        100,
                    )}%`,
                  }}
                />
              </div>
            )}
        </div>
      )}
      {analysisError && !isAnalyzing && (
        <div className="loading-overlay project-analysis-error">
          <strong>Project analysis stopped safely</strong>
          <span>{analysisError}</span>
          <div>
            <button type="button" onClick={retryAnalysis}>
              Retry analysis
            </button>
            <button type="button" onClick={() => void openProject()}>
              Open another folder
            </button>
            <button
              type="button"
              onClick={() => {
                resetWorkspace(sampleProject);
                retryAnalysis();
              }}
            >
              Load demo project
            </button>
          </div>
        </div>
      )}
      {notice && <div className="toast">{notice}</div>}
    </main>
  );
}
