export type ExperienceMode = "beginner" | "advanced";
export type ViewMode = "2d" | "logic" | "3d";
export type WorkflowDirection =
  | "top-down"
  | "bottom-up"
  | "left-right"
  | "right-left";

export interface WorkflowPosition {
  x: number;
  y: number;
}

export type FileKind =
  | "dart"
  | "java"
  | "python"
  | "html"
  | "javascript"
  | "css"
  | "config"
  | "folder"
  | "unknown";

export type SourceLanguage = Exclude<
  FileKind,
  "config" | "folder" | "unknown"
>;

export type SymbolKind =
  | "class"
  | "interface"
  | "widget"
  | "constructor"
  | "function"
  | "method"
  | "variable"
  | "element"
  | "selector";

export type LogicalRelationKind =
  | "starts"
  | "defines"
  | "imports"
  | "calls"
  | "creates"
  | "extends"
  | "implements"
  | "uses";

export interface ProjectFile {
  path: string;
  content: string;
}

export interface ProjectPayload {
  name: string;
  rootPath: string;
  files: ProjectFile[];
  loadSummary?: ProjectLoadSummary;
}

export interface ProjectLoadSummary {
  totalFiles: number;
  cachedFiles: number;
  readFiles: number;
  durationMs: number;
}

export interface ProjectLoadProgress {
  phase: "scanning" | "reading";
  completed: number;
  total: number;
  message: string;
}

export interface ProjectChangeEvent {
  rootPath: string;
  paths: string[];
  changedAt: string;
}

export interface ProjectWatchError {
  rootPath: string;
  message: string;
}

export interface MiniWindowStateResult extends ProjectToolResult {
  alwaysOnTop: boolean;
}

export interface CodeSymbol {
  id: string;
  name: string;
  kind: SymbolKind;
  signature: string;
  line: number;
  endLine: number;
  parentSymbolId?: string;
  description: string;
}

export interface CodeRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  sourcePath: string;
  targetPath?: string;
  targetName: string;
  kind: Exclude<LogicalRelationKind, "starts" | "defines" | "imports">;
  line: number;
  confidence: "exact" | "inferred";
  explanation: string;
}

export interface AnalyzedFile extends ProjectFile {
  id: string;
  name: string;
  extension: string;
  kind: FileKind;
  imports: string[];
  importLinks: Array<{
    value: string;
    targetPath?: string;
  }>;
  resolvedImports: string[];
  symbols: CodeSymbol[];
  lineCount: number;
}

export interface FolderNode {
  id: string;
  name: string;
  path: string;
  folders: FolderNode[];
  files: AnalyzedFile[];
}

export interface AnalyzedProject {
  name: string;
  rootPath: string;
  root: FolderNode;
  files: AnalyzedFile[];
  languages: SourceLanguage[];
  languageSummary: string;
  relationships: CodeRelationship[];
  relationshipCount: number;
}

export type VisualNodeKind =
  | "project"
  | "folder"
  | "file"
  | "external"
  | SymbolKind;

export interface VisualNode {
  id: string;
  label: string;
  subtitle: string;
  kind: VisualNodeKind;
  path?: string;
  parentId?: string;
  position: [number, number, number];
  itemCount?: number;
}

export interface VisualEdge {
  id: string;
  source: string;
  target: string;
  kind: "contains" | LogicalRelationKind;
  label?: string;
  explanation?: string;
  confidence?: CodeRelationship["confidence"];
}

export interface ProjectToolResult {
  success: boolean;
  output: string;
  content?: string;
}

export interface ProjectMutationResult extends ProjectToolResult {
  project?: ProjectPayload;
  entryPath?: string;
  cancelled?: boolean;
}

export interface ProjectTask {
  id: string;
  label: string;
  group: "build" | "test" | "run" | "other";
}

export interface ProjectTaskListResult extends ProjectToolResult {
  tasks?: ProjectTask[];
}

export type TerminalSessionKind = "shell" | "task" | "file";
export type TerminalSessionStatus = "running" | "exited";

export interface TerminalSession {
  id: string;
  title: string;
  kind: TerminalSessionKind;
  taskId?: string;
  filePath?: string;
  cwd: string;
  status: TerminalSessionStatus;
  exitCode?: number;
  startedAt: string;
}

export interface TerminalSessionResult extends ProjectToolResult {
  session?: TerminalSession;
}

export interface TerminalSessionListResult extends ProjectToolResult {
  sessions?: TerminalSession[];
}

export type TerminalEvent =
  | {
      sessionId: string;
      type: "data";
      data: string;
    }
  | {
      sessionId: string;
      type: "exit";
      exitCode: number;
      signal?: number;
    };

export interface GitFileStatus {
  path: string;
  originalPath?: string;
  indexStatus: string;
  worktreeStatus: string;
  label: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  conflicted: boolean;
}

export interface GitRepositoryStatus {
  available: boolean;
  isRepository: boolean;
  repositoryRoot?: string;
  branch: string;
  detached: boolean;
  ahead: number;
  behind: number;
  entries: GitFileStatus[];
}

export interface GitStatusResult extends ProjectToolResult {
  status: GitRepositoryStatus;
}

export interface GitDiffResult extends ProjectToolResult {
  content?: string;
  truncated?: boolean;
}

export interface RendererErrorReport {
  source: "react-boundary" | "window-error" | "unhandled-rejection";
  message: string;
  stack?: string;
  componentStack?: string;
  feature?: string;
  route: string;
  occurredAt: string;
}

declare global {
  interface Window {
    divex?: {
      chooseProject: () => Promise<ProjectPayload | null>;
      onProjectLoadProgress: (
        callback: (progress: ProjectLoadProgress) => void,
      ) => () => void;
      refreshProject: (args: {
        rootPath: string;
      }) => Promise<ProjectMutationResult>;
      watchProject: (args: {
        rootPath: string;
      }) => Promise<ProjectToolResult & { rootPath?: string }>;
      stopWatchingProject: () => Promise<ProjectToolResult>;
      onProjectChanged: (
        callback: (change: ProjectChangeEvent) => void,
      ) => () => void;
      onProjectWatchError: (
        callback: (error: ProjectWatchError) => void,
      ) => () => void;
      renameProjectEntry: (args: {
        rootPath: string;
        entryPath: string;
        newName: string;
      }) => Promise<ProjectMutationResult>;
      deleteProjectEntry: (args: {
        rootPath: string;
        entryPath: string;
        entryKind: "file" | "folder";
      }) => Promise<ProjectMutationResult>;
      revealProjectEntry: (args: {
        rootPath: string;
        entryPath: string;
      }) => Promise<ProjectToolResult>;
      copyProjectEntryPath: (args: {
        rootPath: string;
        entryPath: string;
        relative: boolean;
      }) => Promise<ProjectToolResult>;
      openProjectEntry: (args: {
        rootPath: string;
        entryPath: string;
      }) => Promise<ProjectToolResult>;
      openProjectTerminal: (args: {
        rootPath: string;
        entryPath?: string;
        entryKind?: "file" | "folder";
      }) => Promise<ProjectToolResult>;
      listProjectTasks: (args: {
        rootPath: string;
      }) => Promise<ProjectTaskListResult>;
      runProjectTask: (args: {
        rootPath: string;
        taskId: string;
      }) => Promise<ProjectToolResult>;
      runProjectFile: (args: {
        rootPath: string;
        entryPath: string;
      }) => Promise<ProjectToolResult>;
      createTerminal: (args: {
        rootPath: string;
        cwd?: string;
        cols?: number;
        rows?: number;
        title?: string;
      }) => Promise<TerminalSessionResult>;
      runTaskInTerminal: (args: {
        rootPath: string;
        taskId: string;
        cols?: number;
        rows?: number;
      }) => Promise<TerminalSessionResult>;
      runFileInTerminal: (args: {
        rootPath: string;
        entryPath: string;
        cols?: number;
        rows?: number;
      }) => Promise<TerminalSessionResult>;
      listTerminalSessions: () => Promise<TerminalSessionListResult>;
      writeTerminal: (args: {
        sessionId: string;
        data: string;
      }) => Promise<ProjectToolResult>;
      resizeTerminal: (args: {
        sessionId: string;
        cols: number;
        rows: number;
      }) => Promise<ProjectToolResult>;
      closeTerminal: (args: {
        sessionId: string;
      }) => Promise<ProjectToolResult>;
      closeAllTerminals: () => Promise<ProjectToolResult>;
      onTerminalEvent: (
        callback: (event: TerminalEvent) => void,
      ) => () => void;
      shareProjectEntry: (args: {
        rootPath: string;
        entryPath: string;
      }) => Promise<ProjectToolResult>;
      pasteProjectEntry: (args: {
        rootPath: string;
        sourcePath: string;
        sourceKind: "file" | "folder";
        targetPath: string;
        targetKind: "file" | "folder";
        mode: "cut" | "copy";
      }) => Promise<ProjectMutationResult>;
      saveProjectFile: (args: {
        rootPath: string;
        filePath: string;
        content: string;
      }) => Promise<ProjectToolResult>;
      formatDartFile: (args: {
        rootPath: string;
        filePath: string;
        content: string;
      }) => Promise<ProjectToolResult>;
      analyzeFlutter: (args: {
        rootPath: string;
      }) => Promise<ProjectToolResult>;
      getGitStatus: (args: {
        rootPath: string;
      }) => Promise<GitStatusResult>;
      getGitDiff: (args: {
        rootPath: string;
        filePath: string;
        staged: boolean;
      }) => Promise<GitDiffResult>;
      stageGitFile: (args: {
        rootPath: string;
        filePath: string;
      }) => Promise<ProjectToolResult>;
      unstageGitFile: (args: {
        rootPath: string;
        filePath: string;
      }) => Promise<ProjectToolResult>;
      stageAllGitChanges: (args: {
        rootPath: string;
      }) => Promise<ProjectToolResult>;
      unstageAllGitChanges: (args: {
        rootPath: string;
      }) => Promise<ProjectToolResult>;
      commitGitChanges: (args: {
        rootPath: string;
        message: string;
      }) => Promise<ProjectToolResult>;
      reportRendererError: (
        report: RendererErrorReport,
      ) => Promise<{ success: boolean }>;
      reloadRenderer: (args: {
        safeMode: boolean;
      }) => Promise<void>;
      openMiniWindow: (args: {
        rootPath: string;
      }) => Promise<ProjectToolResult>;
      getMiniWindowState: () => Promise<MiniWindowStateResult>;
      setMiniAlwaysOnTop: (args: {
        alwaysOnTop: boolean;
      }) => Promise<MiniWindowStateResult>;
      platform: string;
    };
  }
}
