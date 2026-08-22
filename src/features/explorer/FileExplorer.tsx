import {
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  ClipboardPaste,
  CopyPlus,
  ExternalLink,
  FileCode2,
  FileJson2,
  FilePlus2,
  Files,
  Folder,
  FolderOpen,
  FolderPlus,
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
  type DragEvent as ReactDragEvent,
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
  executionEnabled: boolean;
  canShare: boolean;
  hasClipboard: boolean;
  newFileExtension: string;
  onSelectFile: (file: AnalyzedFile) => void;
  onSelectFolder: (folder: FolderNode) => void;
  onCreateEntry: (
    parentPath: string,
    kind: ExplorerEntry["kind"],
    name: string,
  ) => void;
  onDuplicateEntry: (entry: ExplorerEntry) => void;
  onMoveEntry: (source: ExplorerEntry, target: ExplorerEntry) => void;
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

interface DragHandlers {
  draggedEntry: ExplorerEntry | null;
  dropTargetPath: string | null;
  onDragStart: (
    event: ReactDragEvent<HTMLButtonElement>,
    entry: ExplorerEntry,
  ) => void;
  onDragEnd: () => void;
  onDragOver: (
    event: ReactDragEvent<HTMLElement>,
    target: ExplorerEntry,
  ) => void;
  onDrop: (
    event: ReactDragEvent<HTMLElement>,
    target: ExplorerEntry,
  ) => void;
}

function parentPath(path: string) {
  const normalized = path.replaceAll("\\", "/");
  const separator = normalized.lastIndexOf("/");
  return separator < 0 ? "" : normalized.slice(0, separator);
}

function FileIcon({ file }: { file: AnalyzedFile }) {
  if (file.kind === "config") return <FileJson2 size={14} />;
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
  drag,
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
  drag: DragHandlers;
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
        draggable
        className={`explorer-row ${selectedId === folder.id ? "selected" : ""} ${
          drag.draggedEntry?.path === folder.path ? "dragging" : ""
        } ${drag.dropTargetPath === folder.path ? "drop-target" : ""}`}
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
        onDragStart={(event) => drag.onDragStart(event, folderEntry)}
        onDragEnd={drag.onDragEnd}
        onDragOver={(event) => drag.onDragOver(event, folderEntry)}
        onDrop={(event) => drag.onDrop(event, folderEntry)}
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
              drag={drag}
            />
          ))}
          {folder.files.map((file) => {
            const fileEntry: ExplorerEntry = {
              kind: "file",
              name: file.name,
              path: file.path,
            };
            return (
              <button
                type="button"
                draggable
                className={`explorer-row file-row ${
                  selectedId === file.id ? "selected" : ""
                } ${drag.draggedEntry?.path === file.path ? "dragging" : ""}`}
                style={{ paddingLeft: 31 + depth * 14 }}
                key={file.id}
                onClick={() => onSelectFile(file)}
                onContextMenu={(event) => {
                  onSelectFile(file);
                  onOpenContextMenu(event, fileEntry);
                }}
                onKeyDown={(event) => onEntryKeyDown(event, fileEntry)}
                onDragStart={(event) => drag.onDragStart(event, fileEntry)}
                onDragEnd={drag.onDragEnd}
                onDragOver={(event) => drag.onDragOver(event, folderEntry)}
                onDrop={(event) => drag.onDrop(event, folderEntry)}
              >
                <FileIcon file={file} />
                <span>{file.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function FileExplorer({
  root,
  selectedId,
  canUseNativePaths,
  executionEnabled,
  canShare,
  hasClipboard,
  newFileExtension,
  onSelectFile,
  onSelectFolder,
  onCreateEntry,
  onDuplicateEntry,
  onMoveEntry,
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
  const rootEntry: ExplorerEntry = {
    kind: "folder",
    name: root.name,
    path: "",
  };
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [draggedEntry, setDraggedEntry] = useState<ExplorerEntry | null>(null);
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const revealLabel =
    window.divex?.platform === "darwin"
      ? "Reveal in Finder"
      : "Reveal in File Explorer";
  const shortcutModifier = window.divex?.platform === "darwin" ? "⌘" : "Ctrl+";

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

  const openContextMenu = (event: ReactMouseEvent, entry: ExplorerEntry) => {
    event.preventDefault();
    event.stopPropagation();
    const menuWidth = 224;
    const menuHeight = 560;
    setContextMenu({
      entry,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8)),
    });
  };

  const runAction = (action: () => void) => {
    setContextMenu(null);
    action();
  };

  const entryDirectory = (entry: ExplorerEntry) =>
    entry.kind === "folder" ? entry.path : parentPath(entry.path);

  const promptForCreate = (
    entry: ExplorerEntry,
    kind: ExplorerEntry["kind"],
  ) => {
    const label = kind === "file" ? "file" : "folder";
    const defaultName =
      kind === "file" ? `untitled.${newFileExtension}` : "new_folder";
    const name = window.prompt(`Create ${label}`, defaultName)?.trim();
    if (name) onCreateEntry(entryDirectory(entry), kind, name);
  };

  const promptForRename = (entry: ExplorerEntry) => {
    const nextName = window.prompt(`Rename ${entry.kind}`, entry.name);
    if (nextName !== null && nextName.trim() && nextName.trim() !== entry.name) {
      onRenameEntry(entry, nextName.trim());
    }
  };

  const handleEntryKeyDown = (
    event: ReactKeyboardEvent,
    entry: ExplorerEntry,
  ) => {
    const shortcutKey = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    if (shortcutKey && event.shiftKey && key === "n") {
      promptForCreate(entry, "folder");
    } else if (shortcutKey && key === "n") {
      promptForCreate(entry, "file");
    } else if (shortcutKey && key === "d") {
      onDuplicateEntry(entry);
    } else if (shortcutKey && key === "x") {
      onCutEntry(entry);
    } else if (shortcutKey && key === "c") {
      onCopyEntry(entry);
    } else if (shortcutKey && key === "v" && hasClipboard) {
      onPasteEntry(entry);
    } else if (event.key === "F2") {
      promptForRename(entry);
    } else if (event.key === "Delete" || (event.metaKey && event.key === "Backspace")) {
      onDeleteEntry(entry);
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  const resetDrag = () => {
    setDraggedEntry(null);
    setDropTargetPath(null);
  };

  const drag: DragHandlers = {
    draggedEntry,
    dropTargetPath,
    onDragStart: (event, entry) => {
      event.stopPropagation();
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", entry.path);
      setDraggedEntry(entry);
      setContextMenu(null);
    },
    onDragEnd: resetDrag,
    onDragOver: (event, target) => {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      setDropTargetPath(target.path);
    },
    onDrop: (event, target) => {
      event.preventDefault();
      event.stopPropagation();
      if (draggedEntry && draggedEntry.path !== target.path) {
        onMoveEntry(draggedEntry, target);
      }
      resetDrag();
    },
  };

  const contextIsRoot = contextMenu?.entry.path === "";

  return (
    <div
      className={`file-explorer ${dropTargetPath === "" ? "root-drop-target" : ""}`}
      onScroll={() => setContextMenu(null)}
      onContextMenu={(event) => openContextMenu(event, rootEntry)}
      onDragOver={(event) => drag.onDragOver(event, rootEntry)}
      onDrop={(event) => drag.onDrop(event, rootEntry)}
    >
      <div className="explorer-management-bar">
        <button
          type="button"
          title="New file (Ctrl+N)"
          aria-label="New file"
          onClick={() => promptForCreate(rootEntry, "file")}
        >
          <FilePlus2 size={14} />
        </button>
        <button
          type="button"
          title="New folder (Ctrl+Shift+N)"
          aria-label="New folder"
          onClick={() => promptForCreate(rootEntry, "folder")}
        >
          <FolderPlus size={14} />
        </button>
        <button
          type="button"
          title="Refresh Explorer"
          aria-label="Refresh Explorer"
          onClick={onRefresh}
        >
          <RefreshCw size={13} />
        </button>
      </div>

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
          drag={drag}
        />
      ))}
      {root.files.map((file) => {
        const fileEntry: ExplorerEntry = {
          kind: "file",
          name: file.name,
          path: file.path,
        };
        return (
          <button
            type="button"
            draggable
            className={`explorer-row file-row root-file ${
              selectedId === file.id ? "selected" : ""
            } ${draggedEntry?.path === file.path ? "dragging" : ""}`}
            key={file.id}
            onClick={() => onSelectFile(file)}
            onContextMenu={(event) => {
              onSelectFile(file);
              openContextMenu(event, fileEntry);
            }}
            onKeyDown={(event) => handleEntryKeyDown(event, fileEntry)}
            onDragStart={(event) => drag.onDragStart(event, fileEntry)}
            onDragEnd={drag.onDragEnd}
            onDragOver={(event) => drag.onDragOver(event, rootEntry)}
            onDrop={(event) => drag.onDrop(event, rootEntry)}
          >
            <FileIcon file={file} />
            <span>{file.name}</span>
          </button>
        );
      })}

      {contextMenu && (
        <div
          className="explorer-context-menu"
          ref={menuRef}
          role="menu"
          aria-label={`${contextMenu.entry.name} actions`}
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => runAction(() => promptForCreate(contextMenu.entry, "file"))}
          >
            <FilePlus2 size={14} />
            New File
            <kbd>{shortcutModifier}N</kbd>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => runAction(() => promptForCreate(contextMenu.entry, "folder"))}
          >
            <FolderPlus size={14} />
            New Folder
            <kbd>{shortcutModifier}Shift+N</kbd>
          </button>
          {!contextIsRoot && (
            <button
              type="button"
              role="menuitem"
              onClick={() => runAction(() => onDuplicateEntry(contextMenu.entry))}
            >
              <CopyPlus size={14} />
              Duplicate
              <kbd>{shortcutModifier}D</kbd>
            </button>
          )}
          <div className="context-menu-separator" />
          {contextMenu.entry.kind === "file" && (
            <button
              type="button"
              role="menuitem"
              onClick={() => runAction(() => onOpenExternal(contextMenu.entry))}
              disabled={!canUseNativePaths || !executionEnabled}
              title={
                executionEnabled
                  ? "Open this file in its default application"
                  : "Trust this workspace before opening project files externally"
              }
            >
              <ExternalLink size={14} />
              Open in Default App
            </button>
          )}
          {canUseNativePaths && (
            <button
              type="button"
              role="menuitem"
              onClick={() => runAction(() => onRevealEntry(contextMenu.entry))}
            >
              <FolderSearch size={14} />
              {revealLabel}
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => runAction(() => onOpenTerminal(contextMenu.entry))}
            disabled={!canUseNativePaths || !executionEnabled}
            title={
              executionEnabled
                ? "Open a terminal in this location"
                : "Trust this workspace to open a terminal"
            }
          >
            <SquareTerminal size={14} />
            Open in Terminal
          </button>
          <button type="button" role="menuitem" onClick={() => runAction(onRefresh)}>
            <RefreshCw size={14} />
            Refresh Explorer
          </button>
          {canShare && !contextIsRoot && (
            <>
              <div className="context-menu-separator" />
              <button
                type="button"
                role="menuitem"
                onClick={() => runAction(() => onShareEntry(contextMenu.entry))}
              >
                <Share2 size={14} />
                Share…
              </button>
            </>
          )}
          <div className="context-menu-separator" />
          {!contextIsRoot && (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => runAction(() => onCutEntry(contextMenu.entry))}
              >
                <Scissors size={14} />
                Cut
                <kbd>{shortcutModifier}X</kbd>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => runAction(() => onCopyEntry(contextMenu.entry))}
              >
                <Files size={14} />
                Copy
                <kbd>{shortcutModifier}C</kbd>
              </button>
            </>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => runAction(() => onPasteEntry(contextMenu.entry))}
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
            onClick={() => runAction(() => onCopyEntryPath(contextMenu.entry, false))}
            disabled={!canUseNativePaths}
          >
            <Link2 size={14} />
            Copy Path
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => runAction(() => onCopyEntryPath(contextMenu.entry, true))}
          >
            <ClipboardCopy size={14} />
            Copy Relative Path
          </button>
          {!contextIsRoot && (
            <>
              <div className="context-menu-separator" />
              <button
                type="button"
                role="menuitem"
                onClick={() => runAction(() => promptForRename(contextMenu.entry))}
              >
                <Pencil size={14} />
                Rename
                <kbd>F2</kbd>
              </button>
              <button
                type="button"
                className="danger"
                role="menuitem"
                onClick={() => runAction(() => onDeleteEntry(contextMenu.entry))}
              >
                <Trash2 size={14} />
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
