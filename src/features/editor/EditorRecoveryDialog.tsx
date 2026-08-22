import { FileCode2, History, Trash2 } from "lucide-react";
import type { AnalyzedFile, EditorRecoveryEntry } from "../../types";

interface EditorRecoveryDialogProps {
  entries: EditorRecoveryEntry[];
  filesByPath: Map<string, AnalyzedFile>;
  onRestore: (entry: EditorRecoveryEntry) => void;
  onDiscard: (entry: EditorRecoveryEntry) => void;
  onRestoreAll: () => void;
  onDiscardAll: () => void;
}

export function EditorRecoveryDialog({
  entries,
  filesByPath,
  onRestore,
  onDiscard,
  onRestoreAll,
  onDiscardAll,
}: EditorRecoveryDialogProps) {
  if (entries.length === 0) return null;

  return (
    <div className="editor-recovery-backdrop" role="presentation">
      <section
        className="editor-recovery-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Recover unsaved editor changes"
      >
        <header>
          <span>
            <History size={18} />
            <span>
              <strong>Recover unsaved changes</strong>
              <small>
                Divex preserved these buffers before the previous session ended.
              </small>
            </span>
          </span>
        </header>
        <div className="editor-recovery-list">
          {entries.map((entry) => {
            const recoveredFile = filesByPath.get(entry.filePath);
            return (
              <article key={entry.filePath}>
                <span>
                  <FileCode2 size={14} />
                  <span>
                    <strong>{recoveredFile?.name ?? entry.filePath}</strong>
                    <small>
                      {entry.filePath} · {new Date(entry.updatedAt).toLocaleString()}
                    </small>
                  </span>
                </span>
                <div>
                  <button
                    type="button"
                    disabled={!recoveredFile}
                    title={
                      recoveredFile
                        ? "Restore this buffer into the editor"
                        : "The file is no longer in this project"
                    }
                    onClick={() => onRestore(entry)}
                  >
                    <History size={12} />
                    Restore
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => onDiscard(entry)}
                  >
                    <Trash2 size={12} />
                    Discard
                  </button>
                </div>
              </article>
            );
          })}
        </div>
        <footer>
          <button type="button" className="danger" onClick={onDiscardAll}>
            Discard all
          </button>
          <button
            type="button"
            className="primary"
            disabled={!entries.some((entry) => filesByPath.has(entry.filePath))}
            onClick={onRestoreAll}
          >
            Restore available files
          </button>
        </footer>
      </section>
    </div>
  );
}
