import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import {
  ChevronDown,
  CircleStop,
  ListRestart,
  Maximize2,
  Minus,
  Play,
  Plus,
  SquareTerminal,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ProjectTask, TerminalSession } from "../../types";
import type { IntegratedTerminalManager } from "./useIntegratedTerminal";

interface TerminalDockProps {
  manager: IntegratedTerminalManager;
  tasks: ProjectTask[];
  onOpenExternal: () => void;
}

function TerminalSessionView({
  session,
  active,
  dockOpen,
  manager,
}: {
  session: TerminalSession;
  active: boolean;
  dockOpen: boolean;
  manager: IntegratedTerminalManager;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const terminal = new Terminal({
      allowProposedApi: false,
      convertEol: true,
      cursorBlink: true,
      cursorStyle: "bar",
      fontFamily:
        '"SFMono-Regular", "Cascadia Code", "Roboto Mono", Consolas, monospace',
      fontSize: 11,
      fontWeight: "400",
      letterSpacing: 0,
      lineHeight: 1.25,
      macOptionIsMeta: true,
      minimumContrastRatio: 4.5,
      scrollback: 10_000,
      smoothScrollDuration: 90,
      theme: {
        background: "#0e0f12",
        foreground: "#d6d7db",
        cursor: "#f4f4f5",
        cursorAccent: "#0e0f12",
        selectionBackground: "#55586199",
        black: "#1b1c20",
        brightBlack: "#757880",
        red: "#d29a9a",
        brightRed: "#efb1b1",
        green: "#b8c4b0",
        brightGreen: "#d2dec9",
        yellow: "#c9bea1",
        brightYellow: "#e4d7b6",
        blue: "#aeb8c8",
        brightBlue: "#cbd5e5",
        magenta: "#c0acc7",
        brightMagenta: "#dac4e2",
        cyan: "#a9c4c5",
        brightCyan: "#c2dedf",
        white: "#d7d8dc",
        brightWhite: "#ffffff",
      },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(hostRef.current);
    terminalRef.current = terminal;
    fitRef.current = fit;
    if (session.kind !== "shell") {
      terminal.writeln(
        `\x1b[90mDivex · ${session.kind === "task" ? "Task" : "Run"}: ${session.title}\x1b[0m`,
      );
    }
    const detachOutput = manager.attachOutput(session.id, (data) =>
      terminal.write(data),
    );
    const input = terminal.onData((data) => {
      if (session.status === "running") manager.sendInput(session.id, data);
    });
    const resizeObserver = new ResizeObserver(() => {
      if (!active || !dockOpen) return;
      window.requestAnimationFrame(() => {
        try {
          fit.fit();
          manager.resize(session.id, terminal.cols, terminal.rows);
        } catch {
          // Xterm may be between visibility/layout states for one frame.
        }
      });
    });
    resizeObserver.observe(hostRef.current);

    return () => {
      resizeObserver.disconnect();
      input.dispose();
      detachOutput();
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
    // A terminal instance belongs to one immutable session id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (terminal) {
      terminal.options.disableStdin = session.status !== "running";
    }
  }, [session.status]);

  useEffect(() => {
    if (!active || !dockOpen) return;
    const frame = window.requestAnimationFrame(() => {
      try {
        fitRef.current?.fit();
        const terminal = terminalRef.current;
        if (terminal) {
          manager.resize(session.id, terminal.cols, terminal.rows);
          terminal.focus();
        }
      } catch {
        // The dock can close while this layout frame is pending.
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [active, dockOpen, manager, session.id]);

  return (
    <div
      ref={hostRef}
      className={`terminal-session-view ${active ? "active" : ""}`}
      aria-label={`${session.title} terminal`}
    />
  );
}

export default function TerminalDock({
  manager,
  tasks,
  onOpenExternal,
}: TerminalDockProps) {
  const [height, setHeight] = useState(290);
  const [taskPickerOpen, setTaskPickerOpen] = useState(false);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!dragRef.current) return;
      setHeight(
        Math.max(
          150,
          Math.min(
            window.innerHeight * 0.68,
            dragRef.current.startHeight +
              dragRef.current.startY -
              event.clientY,
          ),
        ),
      );
    };
    const end = () => {
      dragRef.current = null;
      document.documentElement.classList.remove("is-resizing-terminal");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
  }, []);

  return (
    <section
      className={`terminal-dock ${manager.open ? "open" : "closed"}`}
      style={{ height: manager.open ? height : 0 }}
      aria-label="Integrated terminal"
    >
      <div
        className="terminal-resize-handle"
        role="separator"
        aria-label="Resize terminal"
        aria-orientation="horizontal"
        tabIndex={manager.open ? 0 : -1}
        onDoubleClick={() => setHeight(290)}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = { startY: event.clientY, startHeight: height };
          document.documentElement.classList.add("is-resizing-terminal");
        }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
          event.preventDefault();
          setHeight((current) =>
            Math.max(
              150,
              Math.min(
                window.innerHeight * 0.68,
                current + (event.key === "ArrowUp" ? 20 : -20),
              ),
            ),
          );
        }}
      />

      <header className="terminal-dock-header">
        <div className="terminal-heading">
          <SquareTerminal size={14} />
          <strong>Terminal</strong>
          <span>
            {manager.sessions.filter((session) => session.status === "running").length} running
          </span>
        </div>

        <div className="terminal-tabs" role="tablist">
          {manager.sessions.map((session) => (
            <button
              type="button"
              role="tab"
              aria-selected={manager.activeSessionId === session.id}
              className={manager.activeSessionId === session.id ? "active" : ""}
              key={session.id}
              onClick={() => manager.setActiveSessionId(session.id)}
            >
              <i className={session.status} />
              <span>{session.title}</span>
              <small>
                {session.status === "exited"
                  ? `exit ${session.exitCode ?? "?"}`
                  : session.kind}
              </small>
              <X
                size={11}
                aria-label={`Close ${session.title}`}
                onClick={(event) => {
                  event.stopPropagation();
                  void manager.closeSession(session.id);
                }}
              />
            </button>
          ))}
        </div>

        <div className="terminal-actions">
          <button
            type="button"
            aria-label="New integrated terminal"
            title="New Terminal"
            onClick={() => void manager.createShell()}
          >
            <Plus size={14} />
          </button>
          <div className="terminal-task-menu">
            <button
              type="button"
              aria-label="Run project task"
              title="Run Task"
              onClick={() => setTaskPickerOpen((current) => !current)}
            >
              <Play size={13} />
              <ChevronDown size={10} />
            </button>
            {taskPickerOpen && (
              <div className="terminal-task-popover">
                <strong>Project tasks</strong>
                {tasks.length === 0 ? (
                  <span>No tasks detected for this project.</span>
                ) : (
                  tasks.map((task) => (
                    <button
                      type="button"
                      key={task.id}
                      onClick={() => {
                        setTaskPickerOpen(false);
                        void manager.runTask(task.id);
                      }}
                    >
                      <Play size={12} />
                      <span>{task.label}</span>
                      <small>{task.group}</small>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            aria-label="Restart active terminal"
            title="Restart"
            disabled={!manager.activeSession}
            onClick={() => void manager.restartActive()}
          >
            <ListRestart size={14} />
          </button>
          <button
            type="button"
            aria-label="Terminate active terminal"
            title="Terminate"
            disabled={!manager.activeSession}
            onClick={() => {
              if (manager.activeSession) {
                void manager.closeSession(manager.activeSession.id);
              }
            }}
          >
            <CircleStop size={14} />
          </button>
          <button
            type="button"
            aria-label="Open external terminal"
            title="Open External Terminal"
            onClick={onOpenExternal}
          >
            <Maximize2 size={13} />
          </button>
          <button
            type="button"
            aria-label="Close all terminals"
            title="Close All Terminals"
            disabled={manager.sessions.length === 0}
            onClick={() => void manager.closeAll()}
          >
            <Trash2 size={13} />
          </button>
          <button
            type="button"
            aria-label="Hide terminal panel"
            title="Hide Panel"
            onClick={() => manager.setOpen(false)}
          >
            <Minus size={14} />
          </button>
        </div>
      </header>

      <div className="terminal-dock-body">
        {manager.sessions.length === 0 ? (
          <div className="terminal-welcome">
            <SquareTerminal size={22} />
            <strong>No terminal sessions</strong>
            <span>Start a shell or run a detected project task.</span>
            <button type="button" onClick={() => void manager.createShell()}>
              <Plus size={13} />
              New terminal
            </button>
          </div>
        ) : (
          manager.sessions.map((session) => (
            <TerminalSessionView
              key={session.id}
              session={session}
              active={manager.activeSessionId === session.id}
              dockOpen={manager.open}
              manager={manager}
            />
          ))
        )}
      </div>
    </section>
  );
}
