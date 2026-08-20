import {
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  ClipboardPaste,
  Database,
  ExternalLink,
  FileCode2,
  FileJson2,
  Files,
  Folder,
  FolderOpen,
  FolderSearch,
  Link2,
  Pencil,
  RefreshCw,
  Scissors,
  Share2,
  SquareTerminal,
  Trash2,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { AnalyzedFile, FolderNode } from "../../types";

export interface ExplorerEntry {
  kind: "file" | "folder";
  name: string;
  path: string;
}

interface FileExplorerProps {
  root: FolderNode;
  selectedId: string | null;
  canUseNativePaths: boolean;
  canExecuteProject: boolean;
  canShare: boolean;
  hasClipboard: boolean;
  onSelectFile: (file: AnalyzedFile) => void;
  onSelectFolder: (folder: FolderNode) => void;
  onRenameEntry: (entry: ExplorerEntry, newName: string) => void;
  onDeleteEntry: (entry: ExplorerEntry) => void;
  onCopyEntryPath: (entry: ExplorerEntry, relative: boolean) => void;
  onRevealEntry: (entry: ExplorerEntry) => void;
  onRefresh: () => void;
  onOpenExternal: (entry: ExplorerEntry) => void;
  onOpenTerminal: (entry: ExplorerEntry) => void;
  onShareEntry: (entry: ExplorerEntry) => void;
  onCutEntry: (entry: ExplorerEntry) => void;
  onCopyEntry: (entry: ExplorerEntry) => void;
  onPasteEntry: (entry: ExplorerEntry) => void;
}

interface ContextMenuState {
  entry: ExplorerEntry;
  x: number;
  y: number;
}

function FileIcon({ file }: { file: AnalyzedFile }) {
  if (file.kind === "config") return <FileJson2 size={14} />;
  if (file.kind === "sql") return <Database size={14} />;
  return <FileCode2 size={14} />;
}

function FolderBranch({
  folder,
  depth,
  selectedId,
  onSelectFile,
  onSelectFolder,
  onOpenContextMenu,
  onEntryKeyDown,
}: {
  folder: FolderNode;
  depth: number;
  selectedId: string | null;
  onSelectFile: (file: AnalyzedFile) => void;
  onSelectFolder: (folder: FolderNode) => void;
  onOpenContextMenu: (
    event: ReactMouseEvent,
    entry: ExplorerEntry,
  ) => void;
  onEntryKeyDown: (
    event: ReactKeyboardEvent,
    entry: ExplorerEntry,
  ) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const folderEntry: ExplorerEntry = {
    kind: "folder",
    name: folder.name,
    path: folder.path,
  };

  return (
    <div className="explorer-branch">
      <button
        type="button"
        className={`explorer-row ${selectedId === folder.id ? "selected" : ""}`}
        style={{ paddingLeft: 12 + depth * 14 }}
        onClick={() => {
          setOpen((value) => !value);
          onSelectFolder(folder);
        }}
        onContextMenu={(event) => {
          onSelectFolder(folder);
          onOpenContextMenu(event, folderEntry);
        }}
        onKeyDown={(event) => onEntryKeyDown(event, folderEntry)}
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        {open ? <FolderOpen size={15} /> : <Folder size={15} />}
        <span>{folder.name}</span>
        <small>{folder.files.length + folder.folders.length}</small>
      </button>

      {open && (
        <div>
          {folder.folders.map((child) => (
            <FolderBranch
              key={child.id}
              folder={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelectFile={onSelectFile}
              onSelectFolder={onSelectFolder}
              onOpenContextMenu={onOpenContextMenu}
              onEntryKeyDown={onEntryKeyDown}
            />
          ))}
          {folder.files.map((file) => (
            <button
              type="button"
              className={`explorer-row file-row ${
                selectedId === file.id ? "selected" : ""
              }`}
              style={{ paddingLeft: 31 + depth * 14 }}
              key={file.id}
              onClick={() => onSelectFile(file)}
              onContextMenu={(event) => {
                onSelectFile(file);
                onOpenContextMenu(event, {
                  kind: "file",
                  name: file.name,
                  path: file.path,
                });
              }}
              onKeyDown={(event) =>
                onEntryKeyDown(event, {
                  kind: "file",
                  name: file.name,
                  path: file.path,
                })
              }
            >
              <FileIcon file={file} />
              <span>{file.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function FileExplorer({
  root,
  selectedId,
  canUseNativePaths,
  canExecuteProject,
  canShare,
  hasClipboard,
  onSelectFile,
  onSelectFolder,
  onRenameEntry,
  onDeleteEntry,
  onCopyEntryPath,
  onRevealEntry,
  onRefresh,
  onOpenExternal,
  onOpenTerminal,
  onShareEntry,
  onCutEntry,
  onCopyEntry,
  onPasteEntry,
}: FileExplorerProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(
    null,
  );
  const menuRef = useRef<HTMLDivElement>(null);
  const revealLabel =
    window.divex?.platform === "darwin"
      ? "Reveal in Finder"
      : "Reveal in File Explorer";
  const shortcutModifier =
    window.divex?.platform === "darwin" ? "⌘" : "Ctrl+";

  useEffect(() => {
    if (!contextMenu) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !menuRef.current?.contains(event.target)
      ) {
        setContextMenu(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setContextMenu(null);
    };
    const closeMenu = () => setContextMenu(null);

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("blur", closeMenu);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("blur", closeMenu);
    };
  }, [contextMenu]);

  const openContextMenu = (
    event: ReactMouseEvent,
    entry: ExplorerEntry,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const menuWidth = 224;
    const menuHeight = 392;
    setContextMenu({
      entry,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
      y: Math.max(
        8,
        Math.min(event.clientY, window.innerHeight - menuHeight - 8),
      ),
    });
  };

  const runAction = (action: () => void) => {
    setContextMenu(null);
    action();
  };

  const promptForRename = (entry: ExplorerEntry) => {
    const nextName = window.prompt(`Rename ${entry.kind}`, entry.name);
    if (
      nextName !== null &&
      nextName.trim() &&
      nextName.trim() !== entry.name
    ) {
      onRenameEntry(entry, nextName.trim());
    }
  };

  const handleEntryKeyDown = (
    event: ReactKeyboardEvent,
    entry: ExplorerEntry,
  ) => {
    const shortcutKey = event.metaKey || event.ctrlKey;
    if (shortcutKey && event.key.toLowerCase() === "x") {
      onCutEntry(entry);
    } else if (shortcutKey && event.key.toLowerCase() === "c") {
      onCopyEntry(entry);
    } else if (
      shortcutKey &&
      event.key.toLowerCase() === "v" &&
      hasClipboard
    ) {
      onPasteEntry(entry);
    } else if (event.key === "F2") {
      promptForRename(entry);
    } else if (
      event.key === "Delete" ||
      (event.metaKey && event.key === "Backspace")
    ) {
      onDeleteEntry(entry);
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      className="file-explorer"
      onScroll={() => setContextMenu(null)}
    >
      {root.folders.map((folder) => (
        <FolderBranch
          key={folder.id}
          folder={folder}
          depth={0}
          selectedId={selectedId}
          onSelectFile={onSelectFile}
          onSelectFolder={onSelectFolder}
          onOpenContextMenu={openContextMenu}
          onEntryKeyDown={handleEntryKeyDown}
        />
      ))}
      {root.files.map((file) => (
        <button
          type="button"
          className={`explorer-row file-row root-file ${
            selectedId === file.id ? "selected" : ""
          }`}
          key={file.id}
          onClick={() => onSelectFile(file)}
          onContextMenu={(event) => {
            onSelectFile(file);
            openContextMenu(event, {
              kind: "file",
              name: file.name,
              path: file.path,
            });
          }}
          onKeyDown={(event) =>
            handleEntryKeyDown(event, {
              kind: "file",
              name: file.name,
              path: file.path,
            })
          }
        >
          <FileIcon file={file} />
          <span>{file.name}</span>
        </button>
      ))}

      {contextMenu && (
        <div
          className="explorer-context-menu"
          ref={menuRef}
          role="menu"
          aria-label={`${contextMenu.entry.name} actions`}
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.entry.kind === "file" && (
            <button
              type="button"
              role="menuitem"
              onClick={() =>
                runAction(() => onOpenExternal(contextMenu.entry))
              }
              disabled={!canUseNativePaths || !canExecuteProject}
            >
              <ExternalLink size={14} />
              Open in Default App
            </button>
          )}
          {canUseNativePaths && (
            <button
              type="button"
              role="menuitem"
              onClick={() =>
                runAction(() => onRevealEntry(contextMenu.entry))
              }
            >
              <FolderSearch size={14} />
              {revealLabel}
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() =>
              runAction(() => onOpenTerminal(contextMenu.entry))
            }
            disabled={!canUseNativePaths || !canExecuteProject}
          >
            <SquareTerminal size={14} />
            Open in Terminal
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => runAction(onRefresh)}
          >
            <RefreshCw size={14} />
            Refresh Explorer
          </button>
          <div className="context-menu-separator" />
          {canShare && (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() =>
                  runAction(() => onShareEntry(contextMenu.entry))
                }
              >
                <Share2 size={14} />
                Share…
              </button>
              <div className="context-menu-separator" />
            </>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() =>
              runAction(() => onCutEntry(contextMenu.entry))
            }
          >
            <Scissors size={14} />
            Cut
            <kbd>{shortcutModifier}X</kbd>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() =>
              runAction(() => onCopyEntry(contextMenu.entry))
            }
          >
            <Files size={14} />
            Copy
            <kbd>{shortcutModifier}C</kbd>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() =>
              runAction(() => onPasteEntry(contextMenu.entry))
            }
            disabled={!hasClipboard}
          >
            <ClipboardPaste size={14} />
            Paste
            <kbd>{shortcutModifier}V</kbd>
          </button>
          <div className="context-menu-separator" />
          <button
            type="button"
            role="menuitem"
            onClick={() =>
              runAction(() => onCopyEntryPath(contextMenu.entry, false))
            }
            disabled={!canUseNativePaths}
          >
            <Link2 size={14} />
            Copy Path
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() =>
              runAction(() => onCopyEntryPath(contextMenu.entry, true))
            }
          >
            <ClipboardCopy size={14} />
            Copy Relative Path
          </button>
          <div className="context-menu-separator" />
          <button
            type="button"
            role="menuitem"
            onClick={() =>
              runAction(() => promptForRename(contextMenu.entry))
            }
          >
            <Pencil size={14} />
            Rename
            <kbd>F2</kbd>
          </button>
          <button
            type="button"
            className="danger"
            role="menuitem"
            onClick={() =>
              runAction(() => onDeleteEntry(contextMenu.entry))
            }
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
