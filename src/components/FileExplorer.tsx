import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  FileJson2,
  Folder,
  FolderOpen,
} from "lucide-react";
import { useState } from "react";
import type { AnalyzedFile, FolderNode } from "../types";

interface FileExplorerProps {
  root: FolderNode;
  selectedId: string | null;
  onSelectFile: (file: AnalyzedFile) => void;
  onSelectFolder: (folder: FolderNode) => void;
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
}: {
  folder: FolderNode;
  depth: number;
  selectedId: string | null;
  onSelectFile: (file: AnalyzedFile) => void;
  onSelectFolder: (folder: FolderNode) => void;
}) {
  const [open, setOpen] = useState(depth < 2);

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
  onSelectFile,
  onSelectFolder,
}: FileExplorerProps) {
  return (
    <div className="file-explorer">
      {root.folders.map((folder) => (
        <FolderBranch
          key={folder.id}
          folder={folder}
          depth={0}
          selectedId={selectedId}
          onSelectFile={onSelectFile}
          onSelectFolder={onSelectFolder}
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
        >
          <FileIcon file={file} />
          <span>{file.name}</span>
        </button>
      ))}
    </div>
  );
}
