import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { analyzeProject } from "./analysis/analyzeProject";
import { AppHeader } from "./app/AppHeader";
import {
  folderIdsForPath,
} from "./app/expansion";
import { ProjectSidebar } from "./app/ProjectSidebar";
import { VisualizerWorkspace } from "./app/VisualizerWorkspace";
import { WorkspaceResizer } from "./app/WorkspaceResizer";
import type { ExplorerEntry } from "./features/explorer/FileExplorer";
import { InspectorPanel } from "./features/inspector/InspectorPanel";
import { DEFAULT_TWO_D_ZOOM } from "./config/ui";
import { sampleProject } from "./data/sampleProject";
import type {
  AnalyzedFile,
  ExperienceMode,
  FolderNode,
  ProjectPayload,
  ProjectTask,
  ViewMode,
  VisualNode,
  WorkflowDirection,
  WorkflowPosition,
} from "./types";

const MIN_EXPLORER_WIDTH = 190;
const MAX_EXPLORER_WIDTH = 480;
const MIN_INSPECTOR_WIDTH = 280;
const MAX_INSPECTOR_WIDTH = 620;
const MIN_VISUALIZER_WIDTH = 420;
const WORKSPACE_RESIZERS_WIDTH = 12;

interface ExplorerClipboard {
  mode: "cut" | "copy";
  entry: ExplorerEntry;
}

interface AppProps {
  safeMode?: boolean;
}

function defaultPaneWidths(workspaceWidth: number) {
  return workspaceWidth <= 1240
    ? { explorer: 240, inspector: 340 }
    : { explorer: 280, inspector: 380 };
}

export default function App({ safeMode = false }: AppProps) {
  const [payload, setPayload] = useState<ProjectPayload>(sampleProject);
  const project = useMemo(() => analyzeProject(payload), [payload]);
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
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [terminalMenuOpen, setTerminalMenuOpen] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [openingProject, setOpeningProject] = useState(false);
  const [notice, setNotice] = useState<string | null>(
    safeMode
      ? "Divex recovered in safe mode. The 2D map and large-project protection are active."
      : null,
  );
  const [projectIsLocal, setProjectIsLocal] = useState(false);
  const [explorerClipboard, setExplorerClipboard] =
    useState<ExplorerClipboard | null>(null);
  const [projectTasks, setProjectTasks] = useState<ProjectTask[]>([]);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [workspaceWidth, setWorkspaceWidth] = useState(
    () => window.innerWidth,
  );
  const [paneWidths, setPaneWidths] = useState(() =>
    defaultPaneWidths(window.innerWidth),
  );

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
    if (!projectIsLocal || !window.divex) {
      setProjectTasks([]);
      return;
    }
    let cancelled = false;
    void window.divex
      .listProjectTasks({ rootPath: payload.rootPath })
      .then((result) => {
        if (!cancelled) setProjectTasks(result.tasks ?? []);
      })
      .catch(() => {
        if (!cancelled) setProjectTasks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [payload.files, payload.rootPath, projectIsLocal]);

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

  const showTransientNotice = (message: string, duration = 3500) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), duration);
  };

  const resetWorkspace = (
    nextProject: ProjectPayload,
    isLocalProject = false,
  ) => {
    const firstTopLevelFolder = nextProject.files
      .map((file) => file.path.split("/"))
      .find((parts) => parts.length > 1)?.[0];

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

  const selectFile = (file: AnalyzedFile) => {
    const ancestorIds = folderIdsForPath(file.path);
    setExpandedFolders((current) => {
      const next = new Set(current);
      ancestorIds.forEach((id) => next.add(id));
      return next;
    });
    setSelectedNode({
      id: file.id,
      label: file.name,
      subtitle: `${file.symbols.length} symbols · ${file.lineCount} lines`,
      kind: "file",
      path: file.path,
      position: [0, 0, 0],
    });
    setShowCode(false);
  };

  const selectFolder = (folder: FolderNode) => {
    setSelectedNode({
      id: folder.id,
      label: folder.name,
      subtitle: `${folder.folders.length + folder.files.length} direct items`,
      kind: "folder",
      path: folder.path,
      position: [0, 0, 0],
    });
    setShowCode(false);
  };

  const selectPath = (path: string) => {
    const file = project.files.find((item) => item.path === path);
    if (file) selectFile(file);
  };

  const persistFileContent = (path: string, content: string) => {
    setPayload((current) => ({
      ...current,
      files: current.files.map((file) =>
        file.path === path ? { ...file, content } : file,
      ),
    }));
  };

  const openProject = async () => {
    setFileMenuOpen(false);
    setTerminalMenuOpen(false);
    setProjectMenuOpen(false);
    if (!window.divex) {
      showTransientNotice(
        "Folder selection is available in the Divex desktop window.",
      );
      return;
    }

    setOpeningProject(true);
    try {
      const nextProject = await window.divex.chooseProject();
      if (nextProject) resetWorkspace(nextProject, true);
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

  const renameExplorerEntry = async (
    entry: ExplorerEntry,
    newName: string,
  ) => {
    if (
      !newName ||
      newName === "." ||
      newName === ".." ||
      newName.includes("/") ||
      newName.includes("\\")
    ) {
      showTransientNotice("Enter a name without folder separators.");
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
    const collides = payload.files.some((file) => {
      const belongsToEntry =
        file.path === entry.path || file.path.startsWith(prefix);
      if (belongsToEntry) return false;
      return (
        file.path === nextPath ||
        file.path.startsWith(nextPrefix)
      );
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
    const result = await window.divex.refreshProject({
      rootPath: payload.rootPath,
    });
    if (result.success && result.project) {
      resetWorkspace(result.project, true);
    }
    showTransientNotice(result.output, result.success ? 3500 : 4500);
  };

  const openExplorerEntry = async (entry: ExplorerEntry) => {
    if (!projectIsLocal || !window.divex) {
      showTransientNotice("Open a local project to use an external app.");
      return;
    }
    const result = await window.divex.openProjectEntry({
      rootPath: payload.rootPath,
      entryPath: entry.path,
    });
    if (!result.success) showTransientNotice(result.output, 4500);
  };

  const openExplorerTerminal = async (entry: ExplorerEntry) => {
    if (!projectIsLocal || !window.divex) {
      showTransientNotice("Open a local project to launch a terminal.");
      return;
    }
    const result = await window.divex.openProjectTerminal({
      rootPath: payload.rootPath,
      entryPath: entry.path,
      entryKind: entry.kind,
    });
    if (!result.success) showTransientNotice(result.output, 4500);
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

  const pasteExplorerEntry = async (target: ExplorerEntry) => {
    if (!explorerClipboard) return;
    const { entry: source, mode } = explorerClipboard;

    if (projectIsLocal && window.divex) {
      const result = await window.divex.pasteProjectEntry({
        rootPath: payload.rootPath,
        sourcePath: source.path,
        sourceKind: source.kind,
        targetPath: target.path,
        targetKind: target.kind,
        mode,
      });
      if (result.success && result.project) {
        resetWorkspace(result.project, true);
        if (mode === "cut") setExplorerClipboard(null);
      }
      showTransientNotice(result.output, result.success ? 3500 : 4500);
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
    if (sourceFiles.length === 0) {
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
    };
    resetWorkspace(nextProject);
    if (mode === "cut") setExplorerClipboard(null);
    showTransientNotice(
      `${mode === "copy" ? "Copied" : "Moved"} ${source.name} in this demo session.`,
    );
  };

  const openProjectTerminal = async () => {
    if (!projectIsLocal || !window.divex) {
      showTransientNotice("Open a local project to launch a terminal.");
      return;
    }
    const result = await window.divex.openProjectTerminal({
      rootPath: payload.rootPath,
    });
    if (!result.success) showTransientNotice(result.output, 4500);
  };

  const runProjectTask = async (taskId: string) => {
    if (!projectIsLocal || !window.divex) return;
    const result = await window.divex.runProjectTask({
      rootPath: payload.rootPath,
      taskId,
    });
    showTransientNotice(result.output, result.success ? 3500 : 4500);
  };

  const runBuildTask = () => {
    const buildTask = projectTasks.find((task) => task.group === "build");
    if (buildTask) void runProjectTask(buildTask.id);
  };

  const runActiveFile = async () => {
    if (!projectIsLocal || !window.divex || !selectedFile) return;
    const result = await window.divex.runProjectFile({
      rootPath: payload.rootPath,
      entryPath: selectedFile.path,
    });
    showTransientNotice(result.output, result.success ? 3500 : 4500);
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
    setSelectedNode(node);
    setShowCode(false);
  };

  return (
    <main className="app-shell">
      <AppHeader
        fileMenuOpen={fileMenuOpen}
        terminalMenuOpen={terminalMenuOpen}
        terminalEnabled={projectIsLocal && Boolean(window.divex)}
        tasks={projectTasks}
        canRunActiveFile={
          projectIsLocal &&
          Boolean(
            selectedFile &&
              (selectedFile.extension === "dart" ||
                selectedFile.extension === "py"),
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
        onNewTerminal={() => void openProjectTerminal()}
        onRunTask={(taskId) => void runProjectTask(taskId)}
        onRunBuildTask={runBuildTask}
        onRunActiveFile={() => void runActiveFile()}
      />

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
          selectedId={selectedNode?.id ?? null}
          canUseNativePaths={projectIsLocal && Boolean(window.divex)}
          canShare={
            projectIsLocal &&
            window.divex?.platform === "darwin"
          }
          hasClipboard={Boolean(explorerClipboard)}
          projectMenuOpen={projectMenuOpen}
          onToggleProjectMenu={() =>
            setProjectMenuOpen((value) => !value)
          }
          onOpenProject={openProject}
          onLoadDemo={() => {
            resetWorkspace(sampleProject);
            setProjectMenuOpen(false);
          }}
          onSelectFile={selectFile}
          onSelectFolder={selectFolder}
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
          twoDZoom={twoDZoom}
          logicZoom={logicZoom}
          workflowDirection={workflowDirection}
          freePositioning={freePositioning}
          twoDPositions={twoDPositions}
          logicPositions={logicPositions}
          expandedFolders={expandedFolders}
          expandedFiles={expandedFiles}
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
          onShowVisualizer={() => setShowCode(false)}
          onSelectNode={handleSelectNode}
          onToggleFolderFreely={toggleFolderFreely}
          onToggleFileFreely={toggleFileFreely}
          onTwoDZoomChange={setTwoDZoom}
          onLogicZoomChange={setLogicZoom}
          onTwoDPositionsChange={setTwoDPositions}
          onLogicPositionsChange={setLogicPositions}
          onPersistFile={persistFileContent}
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
          onToggleCode={() => setShowCode((value) => !value)}
          onClose={() => {
            setSelectedNode(null);
            setShowCode(false);
          }}
          onSelectPath={selectPath}
          onSelectNode={handleSelectNode}
        />
      </div>

      {openingProject && (
        <div className="loading-overlay">
          <div className="loader" />
          <strong>Analyzing project…</strong>
          <span>Mapping files, symbols, and imports</span>
        </div>
      )}
      {notice && <div className="toast">{notice}</div>}
    </main>
  );
}
