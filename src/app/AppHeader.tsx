import {
  ChevronRight,
  FileCode2,
  FolderOpen,
  Hammer,
  Play,
  Sparkles,
  SquareTerminal,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BrandMark } from "../components/BrandMark";
import type { ProjectTask } from "../types";

interface AppHeaderProps {
  fileMenuOpen: boolean;
  terminalMenuOpen: boolean;
  terminalEnabled: boolean;
  tasks: ProjectTask[];
  canRunActiveFile: boolean;
  onToggleFileMenu: () => void;
  onToggleTerminalMenu: () => void;
  onCloseMenus: () => void;
  onOpenProject: () => void;
  onNewTerminal: () => void;
  onRunTask: (taskId: string) => void;
  onRunBuildTask: () => void;
  onRunActiveFile: () => void;
}

export function AppHeader({
  fileMenuOpen,
  terminalMenuOpen,
  terminalEnabled,
  tasks,
  canRunActiveFile,
  onToggleFileMenu,
  onToggleTerminalMenu,
  onCloseMenus,
  onOpenProject,
  onNewTerminal,
  onRunTask,
  onRunBuildTask,
  onRunActiveFile,
}: AppHeaderProps) {
  const [taskPickerOpen, setTaskPickerOpen] = useState(false);
  const menuBarRef = useRef<HTMLDivElement>(null);
  const buildTask = tasks.find((task) => task.group === "build");

  useEffect(() => {
    if (!terminalMenuOpen) setTaskPickerOpen(false);
  }, [terminalMenuOpen]);

  useEffect(() => {
    if (!fileMenuOpen && !terminalMenuOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !menuBarRef.current?.contains(event.target)
      ) {
        onCloseMenus();
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseMenus();
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [fileMenuOpen, onCloseMenus, terminalMenuOpen]);

  const runAndClose = (action: () => void) => {
    onCloseMenus();
    action();
  };

  return (
    <header className="titlebar">
      <div className="window-drag-region" />
      <div className="titlebar-brand">
        <BrandMark />
        <strong>Divex</strong>
        <span>Visualizer</span>
        <small>EARLY ACCESS</small>

        <div className="header-menu-bar" ref={menuBarRef}>
          <div className="header-menu">
            <button
              type="button"
              className={fileMenuOpen ? "active" : ""}
              onClick={onToggleFileMenu}
            >
              File
            </button>
            {fileMenuOpen && (
              <div className="header-menu-popover file-menu-popover">
                <button
                  type="button"
                  onClick={() => runAndClose(onOpenProject)}
                >
                  <FolderOpen size={14} />
                  <span>Open Folder…</span>
                </button>
              </div>
            )}
          </div>

          <div className="header-menu">
            <button
              type="button"
              className={terminalMenuOpen ? "active" : ""}
              onClick={onToggleTerminalMenu}
            >
              Terminal
            </button>
            {terminalMenuOpen && (
              <div className="header-menu-popover terminal-menu-popover">
                <button
                  type="button"
                  disabled={!terminalEnabled}
                  onClick={() => runAndClose(onNewTerminal)}
                >
                  <SquareTerminal size={14} />
                  <span>New Terminal</span>
                  <kbd>⌃⇧`</kbd>
                </button>
                <button type="button" disabled>
                  <SquareTerminal size={14} />
                  <span>Split Terminal</span>
                  <kbd>⌘\</kbd>
                </button>
                <button
                  type="button"
                  disabled={!terminalEnabled}
                  onClick={() => runAndClose(onNewTerminal)}
                >
                  <SquareTerminal size={14} />
                  <span>New Terminal Window</span>
                </button>

                <div className="header-menu-separator" />

                <button
                  type="button"
                  disabled={!terminalEnabled}
                  onClick={() => setTaskPickerOpen((open) => !open)}
                >
                  <Play size={14} />
                  <span>Run Task…</span>
                  <ChevronRight size={13} />
                </button>
                <button
                  type="button"
                  disabled={!terminalEnabled || !buildTask}
                  onClick={() => runAndClose(onRunBuildTask)}
                >
                  <Hammer size={14} />
                  <span>Run Build Task…</span>
                  <kbd>⇧⌘B</kbd>
                </button>
                <button
                  type="button"
                  disabled={!terminalEnabled || !canRunActiveFile}
                  onClick={() => runAndClose(onRunActiveFile)}
                >
                  <FileCode2 size={14} />
                  <span>Run Active File</span>
                </button>
                <button type="button" disabled>
                  <Play size={14} />
                  <span>Run Selected Text</span>
                </button>

                <div className="header-menu-separator" />

                <button type="button" disabled>
                  <SquareTerminal size={14} />
                  <span>Show Running Tasks…</span>
                </button>
                <button type="button" disabled>
                  <SquareTerminal size={14} />
                  <span>Restart Running Task…</span>
                </button>
                <button type="button" disabled>
                  <SquareTerminal size={14} />
                  <span>Terminate Task…</span>
                </button>

                <div className="header-menu-separator" />

                <button type="button" disabled>
                  <SquareTerminal size={14} />
                  <span>Configure Tasks…</span>
                </button>
                <button type="button" disabled>
                  <Hammer size={14} />
                  <span>Configure Default Build Task…</span>
                </button>

                {taskPickerOpen && (
                  <div className="terminal-task-picker">
                    <div className="terminal-task-heading">Detected tasks</div>
                    {tasks.length === 0 ? (
                      <p>No project tasks found.</p>
                    ) : (
                      tasks.map((task) => (
                        <button
                          type="button"
                          key={task.id}
                          onClick={() =>
                            runAndClose(() => onRunTask(task.id))
                          }
                        >
                          <Play size={13} />
                          <span>{task.label}</span>
                          <small>{task.group}</small>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="titlebar-center">
        <span className="status-dot" />
        Flutter analyzer
      </div>
      <button type="button" className="ai-button" disabled>
        <Sparkles size={14} />
        Ask Divex
        <span>Later</span>
      </button>
    </header>
  );
}
