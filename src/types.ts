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
  | "config"
  | "folder"
  | "unknown";

export type SymbolKind =
  | "class"
  | "widget"
  | "constructor"
  | "function"
  | "method"
  | "variable";

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

declare global {
  interface Window {
    divex?: {
      chooseProject: () => Promise<ProjectPayload | null>;
      refreshProject: (args: {
        rootPath: string;
      }) => Promise<ProjectMutationResult>;
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
      platform: string;
    };
  }
}
