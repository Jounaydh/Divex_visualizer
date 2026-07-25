export type ExperienceMode = "beginner" | "advanced";
export type ViewMode = "3d" | "2d";

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
  | "function"
  | "method"
  | "variable";

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
  description: string;
}

export interface AnalyzedFile extends ProjectFile {
  id: string;
  name: string;
  extension: string;
  kind: FileKind;
  imports: string[];
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
  relationshipCount: number;
}

export type VisualNodeKind =
  | "project"
  | "folder"
  | "file"
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
  kind: "contains" | "imports";
}

export interface ProjectToolResult {
  success: boolean;
  output: string;
  content?: string;
}

declare global {
  interface Window {
    divex?: {
      chooseProject: () => Promise<ProjectPayload | null>;
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
