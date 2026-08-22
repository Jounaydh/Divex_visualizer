import type * as ace from "ace-builds";
import type { AnalyzedFile } from "../../types";

export interface EditorDocument {
  file: AnalyzedFile;
  session: ace.Ace.EditSession;
  savedContent: string;
  dirty: boolean;
  cursor: { row: number; column: number };
  scrollTop: number;
  scrollLeft: number;
  externalContent?: string;
  conflict?: boolean;
}

export type EditorGroup = "primary" | "secondary";

export type EditorAction = "save" | "save-all" | "format" | "analyze" | null;
export type RecoveryStatus = "idle" | "saving" | "protected" | "error";
