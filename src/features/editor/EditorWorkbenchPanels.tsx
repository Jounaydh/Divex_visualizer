import { CircleAlert, GitCompareArrows, X } from "lucide-react";
import type { EditorDiagnostic } from "./flutterDiagnostics";
import { buildSideBySideDiff } from "./editorWorkspace";

export function EditorDiffPanel({
  fileName,
  leftLabel,
  leftContent,
  rightContent,
  onClose,
}: {
  fileName: string;
  leftLabel: string;
  leftContent: string;
  rightContent: string;
  onClose: () => void;
}) {
  const allRows = buildSideBySideDiff(leftContent, rightContent);
  const rows = allRows.slice(0, 4000);
  const changes = allRows.filter((row) => row.changed).length;
  return (
    <aside className="editor-workbench-panel editor-diff-panel" aria-label={`Diff for ${fileName}`}>
      <header>
        <GitCompareArrows size={13} />
        <strong>{fileName}</strong>
        <span>{changes} changed line{changes === 1 ? "" : "s"}</span>
        <button type="button" aria-label="Close diff" onClick={onClose}><X size={12} /></button>
      </header>
      <div className="editor-diff-headings"><span>{leftLabel}</span><span>Editor buffer</span></div>
      <div className="editor-diff-grid">
        {rows.map((row) => (
          <div className={row.changed ? "changed" : ""} key={row.line}>
            <pre><i>{row.line}</i>{row.left || " "}</pre>
            <pre><i>{row.line}</i>{row.right || " "}</pre>
          </div>
        ))}
        {allRows.length > rows.length && (
          <p className="editor-diff-truncated">
            Showing the first {rows.length.toLocaleString()} of {allRows.length.toLocaleString()} lines.
          </p>
        )}
      </div>
    </aside>
  );
}

export function EditorDiagnosticsPanel({
  diagnostics,
  onOpen,
  onClose,
}: {
  diagnostics: EditorDiagnostic[];
  onOpen: (diagnostic: EditorDiagnostic) => void;
  onClose: () => void;
}) {
  return (
    <aside className="editor-workbench-panel editor-diagnostics-panel" aria-label="Workspace diagnostics">
      <header>
        <CircleAlert size={13} />
        <strong>Workspace diagnostics</strong>
        <span>{diagnostics.length} problem{diagnostics.length === 1 ? "" : "s"}</span>
        <button type="button" aria-label="Close diagnostics" onClick={onClose}><X size={12} /></button>
      </header>
      {diagnostics.length === 0 ? (
        <p>No workspace diagnostics reported. Run the workspace analyzer to refresh this panel.</p>
      ) : diagnostics.map((diagnostic, index) => (
        <button type="button" key={`${diagnostic.path}:${diagnostic.line}:${diagnostic.column}:${index}`} onClick={() => onOpen(diagnostic)}>
          <i className={diagnostic.severity} />
          <span>{diagnostic.message}<small>{diagnostic.path}:{diagnostic.line}:{diagnostic.column} · {diagnostic.code}</small></span>
        </button>
      ))}
    </aside>
  );
}
