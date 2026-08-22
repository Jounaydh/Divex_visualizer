export type ExperienceMode = "beginner" | "advanced";
export type ViewMode = "2d" | "logic";
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
  | "typescript"
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
  | "selector"
  | "type"
  | "enum"
  | "namespace";

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

export type ProjectEnvironment =
  | { kind: "native"; platform: string }
  | { kind: "wsl"; distribution: string; linuxPath: string }
  | { kind: "sample" };

export interface ProjectPayload {
  name: string;
  rootPath: string;
  files: ProjectFile[];
  folders?: string[];
  environment?: ProjectEnvironment;
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
  environment?: ProjectEnvironment;
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
  conflict?: boolean;
  unchanged?: boolean;
  suggestedName?: string;
}

export interface ProjectTask {
  id: string;
  label: string;
  group: "build" | "test" | "run" | "other";
  source?: "detected" | "custom";
  detail?: string;
  problemMatcher?: TerminalProblemMatcher;
}

export interface ProjectTaskListResult extends ProjectToolResult {
  tasks?: ProjectTask[];
}

export interface EditorRecoveryEntry {
  version: 1;
  rootPath: string;
  filePath: string;
  content: string;
  updatedAt: string;
}

export interface EditorRecoveryListResult extends ProjectToolResult {
  entries: EditorRecoveryEntry[];
}

export interface EditorRecoveryWriteResult extends ProjectToolResult {
  entry?: EditorRecoveryEntry;
}

export interface WslDistribution {
  name: string;
  system: boolean;
}

export interface WslStatusResult extends ProjectToolResult {
  available: boolean;
  defaultDistribution?: string;
  distributions: WslDistribution[];
}

export type WorkspaceTrustState = "unknown" | "trusted" | "restricted";

export interface WorkspacePermissionDetail {
  id: "source" | "scripts" | "terminals" | "debugging" | "external" | "extensions";
  label: string;
  enabled: boolean;
  detail: string;
}

export interface WorkspaceTrustStatus {
  rootPath: string;
  state: WorkspaceTrustState;
  trusted: boolean;
  decidedAt?: string;
  permissions?: WorkspacePermissionDetail[];
}

export interface WorkspaceTrustResult extends ProjectToolResult {
  status?: WorkspaceTrustStatus;
}

export type TerminalSessionKind = "shell" | "task" | "file";
export type TerminalSessionStatus = "running" | "exited";
export type TerminalProblemMatcher = "auto" | "dart" | "python" | "typescript" | "java" | "gcc";

export interface TerminalProfile {
  id: string;
  label: string;
  description: string;
  kind: string;
}

export interface TerminalProfileListResult extends ProjectToolResult {
  profiles?: TerminalProfile[];
}

export interface TerminalProblem {
  id: string;
  sessionId: string;
  path: string;
  line: number;
  column?: number;
  severity: "error" | "warning" | "info";
  message: string;
}

export interface TerminalSession {
  id: string;
  title: string;
  kind: TerminalSessionKind;
  taskId?: string;
  filePath?: string;
  profileId?: string;
  problemMatcher?: TerminalProblemMatcher;
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

export type DebugSessionState =
  | "starting"
  | "running"
  | "stopped"
  | "terminated";

export interface DebugBreakpoint {
  id?: number;
  filePath: string;
  line: number;
  verified: boolean;
  message?: string;
}

export interface DebugSession {
  id: string;
  adapter: "python" | "dart";
  filePath: string;
  state: DebugSessionState;
  startedAt: string;
}

export interface DebugStackFrame {
  id: number;
  name: string;
  filePath?: string;
  sourceName?: string;
  line: number;
  column: number;
  threadId: number;
}

export interface DebugScope {
  name: string;
  variablesReference: number;
  expensive?: boolean;
  namedVariables?: number;
  indexedVariables?: number;
}

export interface DebugVariable {
  name: string;
  value: string;
  type?: string;
  variablesReference: number;
  namedVariables?: number;
  indexedVariables?: number;
}

export type DebugEvent =
  | {
      sessionId: string;
      type: "started";
      adapter: string;
      filePath: string;
    }
  | {
      sessionId: string;
      type: "stopped";
      reason: string;
      description?: string;
      threadId?: number;
    }
  | { sessionId: string; type: "continued"; threadId?: number }
  | { sessionId: string; type: "terminated"; exitCode?: number }
  | {
      sessionId: string;
      type: "output";
      category: string;
      output: string;
    }
  | {
      sessionId: string;
      type: "breakpoint";
      breakpoint?: Partial<DebugBreakpoint>;
    };

export interface DebugSessionResult extends ProjectToolResult {
  session?: DebugSession;
}

export interface DebugBreakpointResult extends ProjectToolResult {
  breakpoints?: DebugBreakpoint[];
}

export interface DebugStackResult extends ProjectToolResult {
  frames: DebugStackFrame[];
  threadId?: number;
}

export interface DebugScopeResult extends ProjectToolResult {
  scopes: DebugScope[];
}

export interface DebugVariableResult extends ProjectToolResult {
  variables: DebugVariable[];
}

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
  upstream?: string;
  branches: string[];
  remotes: string[];
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
      chooseWslProject: () => Promise<ProjectPayload | null>;
      getWslStatus: () => Promise<WslStatusResult>;
      getWorkspaceTrust: (args: {
        rootPath: string;
      }) => Promise<WorkspaceTrustResult>;
      setWorkspaceTrust: (args: {
        rootPath: string;
        trusted: boolean;
      }) => Promise<WorkspaceTrustResult>;
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
      createProjectEntry: (args: {
        rootPath: string;
        parentPath: string;
        entryKind: "file" | "folder";
        name: string;
      }) => Promise<ProjectMutationResult>;
      duplicateProjectEntry: (args: {
        rootPath: string;
        sourcePath: string;
        sourceKind: "file" | "folder";
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
        profileId?: string;
      }) => Promise<ProjectToolResult>;
      listTerminalProfiles: (args: {
        rootPath: string;
      }) => Promise<TerminalProfileListResult>;
      openTerminalLink: (args: {
        rootPath: string;
        url: string;
      }) => Promise<ProjectToolResult>;
      listProjectTasks: (args: {
        rootPath: string;
      }) => Promise<ProjectTaskListResult>;
      runProjectTask: (args: {
        rootPath: string;
        taskId: string;
        profileId?: string;
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
        profileId?: string;
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
      startDebugSession: (args: {
        rootPath: string;
        filePath: string;
        breakpoints: Array<{ filePath: string; lines: number[] }>;
      }) => Promise<DebugSessionResult>;
      setDebugBreakpoints: (args: {
        sessionId: string;
        filePath: string;
        lines: number[];
      }) => Promise<DebugBreakpointResult>;
      getDebugStack: (args: {
        sessionId: string;
        threadId?: number;
      }) => Promise<DebugStackResult>;
      getDebugScopes: (args: {
        sessionId: string;
        frameId: number;
      }) => Promise<DebugScopeResult>;
      getDebugVariables: (args: {
        sessionId: string;
        variablesReference: number;
        start?: number;
        count?: number;
      }) => Promise<DebugVariableResult>;
      controlDebugSession: (args: {
        sessionId: string;
        action: "continue" | "pause" | "next" | "stepIn" | "stepOut";
        threadId?: number;
      }) => Promise<ProjectToolResult>;
      stopDebugSession: (args: {
        sessionId: string;
      }) => Promise<ProjectToolResult>;
      installPythonDebugAdapter: (args: {
        rootPath: string;
      }) => Promise<ProjectToolResult>;
      onDebugEvent: (callback: (event: DebugEvent) => void) => () => void;
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
        destinationName?: string;
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
      listEditorRecoveries: (args: {
        rootPath: string;
      }) => Promise<EditorRecoveryListResult>;
      writeEditorRecovery: (args: {
        rootPath: string;
        filePath: string;
        content: string;
      }) => Promise<EditorRecoveryWriteResult>;
      clearEditorRecovery: (args: {
        rootPath: string;
        filePath: string;
      }) => Promise<ProjectToolResult>;
      initializeGitRepository: (args: {
        rootPath: string;
      }) => Promise<ProjectToolResult>;
      changeGitBranch: (args: {
        rootPath: string;
        branch: string;
        create: boolean;
      }) => Promise<ProjectToolResult>;
      syncGitRepository: (args: {
        rootPath: string;
        action: "fetch" | "pull" | "push";
      }) => Promise<ProjectToolResult>;
      stashGitChanges: (args: {
        rootPath: string;
        action: "save" | "pop";
      }) => Promise<ProjectToolResult>;
      discardGitChanges: (args: {
        rootPath: string;
        filePath?: string;
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
