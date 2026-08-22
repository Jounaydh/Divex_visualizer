import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  CircleStop,
  Columns2,
  ListRestart,
  Maximize2,
  Minus,
  Play,
  Plus,
  Search,
  Settings2,
  SquareTerminal,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ProjectTask, TerminalProblem, TerminalSession } from "../../types";
import type { IntegratedTerminalManager } from "./useIntegratedTerminal";

interface TerminalDockProps {
  manager: IntegratedTerminalManager;
  tasks: ProjectTask[];
  taskError?: string | null;
  onOpenExternal: (profileId?: string) => void;
  onConfigureTasks: () => void;
  onRunExternalTask: (taskId: string, profileId?: string) => void;
  onOpenProblem: (problem: TerminalProblem) => void;
  onOpenLink: (url: string) => void;
}

interface SearchRequest {
  sequence: number;
  query: string;
  previous: boolean;
}

function TerminalSessionView({
  session,
  visible,
  dockOpen,
  manager,
  searchRequest,
  onOpenLink,
}: {
  session: TerminalSession;
  visible: boolean;
  dockOpen: boolean;
  manager: IntegratedTerminalManager;
  searchRequest: SearchRequest;
  onOpenLink: (url: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const terminal = new Terminal({
      allowProposedApi: false,
      convertEol: true,
      cursorBlink: true,
      cursorStyle: "bar",
      fontFamily: '"SFMono-Regular", "Cascadia Code", "Roboto Mono", Consolas, monospace',
      fontSize: 11,
      fontWeight: "400",
      lineHeight: 1.25,
      macOptionIsMeta: true,
      minimumContrastRatio: 4.5,
      scrollback: 10_000,
      smoothScrollDuration: 90,
      theme: {
        background: "#0e0f12", foreground: "#d6d7db", cursor: "#f4f4f5",
        cursorAccent: "#0e0f12", selectionBackground: "#55586199", black: "#1b1c20",
        brightBlack: "#757880", red: "#d29a9a", brightRed: "#efb1b1", green: "#b8c4b0",
        brightGreen: "#d2dec9", yellow: "#c9bea1", brightYellow: "#e4d7b6", blue: "#aeb8c8",
        brightBlue: "#cbd5e5", magenta: "#c0acc7", brightMagenta: "#dac4e2", cyan: "#a9c4c5",
        brightCyan: "#c2dedf", white: "#d7d8dc", brightWhite: "#ffffff",
      },
    });
    const fit = new FitAddon();
    const search = new SearchAddon();
    terminal.loadAddon(fit);
    terminal.loadAddon(search);
    terminal.loadAddon(new WebLinksAddon((_event, uri) => onOpenLink(uri)));
    terminal.open(hostRef.current);
    terminalRef.current = terminal;
    fitRef.current = fit;
    searchRef.current = search;
    if (session.kind !== "shell") {
      terminal.writeln(`\x1b[90mDivex · ${session.kind === "task" ? "Task" : "Run"}: ${session.title}\x1b[0m`);
    }
    const detachOutput = manager.attachOutput(session.id, (data) => terminal.write(data));
    const input = terminal.onData((data) => {
      if (session.status === "running") manager.sendInput(session.id, data);
    });
    const resizeObserver = new ResizeObserver(() => {
      if (!visible || !dockOpen) return;
      window.requestAnimationFrame(() => {
        try {
          fit.fit();
          manager.resize(session.id, terminal.cols, terminal.rows);
        } catch {
          // Xterm can be between visibility/layout states for one frame.
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
      searchRef.current = null;
    };
    // Each Xterm instance belongs to one immutable terminal session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  useEffect(() => {
    if (terminalRef.current) terminalRef.current.options.disableStdin = session.status !== "running";
  }, [session.status]);

  useEffect(() => {
    if (!visible || !dockOpen) return;
    const frame = window.requestAnimationFrame(() => {
      try {
        fitRef.current?.fit();
        const terminal = terminalRef.current;
        if (terminal) {
          manager.resize(session.id, terminal.cols, terminal.rows);
          terminal.focus();
        }
      } catch {
        // The dock can close while this frame is pending.
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [dockOpen, manager, session.id, visible]);

  useEffect(() => {
    if (!visible || !searchRequest.query) return;
    if (searchRequest.previous) searchRef.current?.findPrevious(searchRequest.query);
    else searchRef.current?.findNext(searchRequest.query);
  }, [searchRequest, visible]);

  return (
    <div
      ref={hostRef}
      className={`terminal-session-view ${visible ? "active" : ""}`}
      aria-label={`${session.title} terminal`}
    />
  );
}

export default function TerminalDock({
  manager,
  tasks,
  taskError,
  onOpenExternal,
  onConfigureTasks,
  onRunExternalTask,
  onOpenProblem,
  onOpenLink,
}: TerminalDockProps) {
  const [height, setHeight] = useState(290);
  const [taskPickerOpen, setTaskPickerOpen] = useState(false);
  const [profilePickerOpen, setProfilePickerOpen] = useState(false);
  const [splitSessionId, setSplitSessionId] = useState<string | null>(null);
  const [activePane, setActivePane] = useState<"primary" | "secondary">("primary");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchRequest, setSearchRequest] = useState<SearchRequest>({ sequence: 0, query: "", previous: false });
  const [problemsOpen, setProblemsOpen] = useState(false);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const splitSession = manager.sessions.find((session) => session.id === splitSessionId) ?? null;
  const primarySession = manager.activeSession;
  const selectedSession = activePane === "secondary" && splitSession ? splitSession : primarySession;
  const selectedProblems = useMemo(
    () => manager.problems.filter((problem) => problem.sessionId === selectedSession?.id),
    [manager.problems, selectedSession?.id],
  );

  useEffect(() => {
    if (splitSessionId && !splitSession) {
      setSplitSessionId(null);
      setActivePane("primary");
    }
  }, [splitSession, splitSessionId]);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!manager.open || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "f") return;
      event.preventDefault();
      setSearchOpen(true);
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [manager.open]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!dragRef.current) return;
      setHeight(Math.max(150, Math.min(window.innerHeight * 0.68, dragRef.current.startHeight + dragRef.current.startY - event.clientY)));
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

  const find = (previous = false) => {
    if (!searchQuery) return;
    setSearchRequest((current) => ({ sequence: current.sequence + 1, query: searchQuery, previous }));
  };

  const splitTerminal = async () => {
    if (splitSession) {
      setSplitSessionId(null);
      setActivePane("primary");
      return;
    }
    const previous = manager.activeSessionId;
    const created = await manager.createShell();
    if (!created) return;
    setSplitSessionId(created.id);
    setActivePane("secondary");
    if (previous) manager.setActiveSessionId(previous);
  };

  return (
    <section className={`terminal-dock ${manager.open ? "open" : "closed"}`} style={{ height: manager.open ? height : 0 }} aria-label="Integrated terminal">
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
          setHeight((current) => Math.max(150, Math.min(window.innerHeight * 0.68, current + (event.key === "ArrowUp" ? 20 : -20))));
        }}
      />

      <header className="terminal-dock-header">
        <div className="terminal-heading">
          <SquareTerminal size={14} />
          <strong>Terminal</strong>
          <span>{manager.sessions.filter((session) => session.status === "running").length} running</span>
        </div>

        <div className="terminal-tabs" role="tablist">
          {manager.sessions.map((session) => (
            <button
              type="button"
              role="tab"
              aria-selected={selectedSession?.id === session.id}
              className={selectedSession?.id === session.id ? "active" : ""}
              key={session.id}
              onClick={() => {
                if (activePane === "secondary" && splitSession) {
                  if (session.id === manager.activeSessionId) setActivePane("primary");
                  else setSplitSessionId(session.id);
                } else if (session.id === splitSessionId) {
                  setActivePane("secondary");
                } else manager.setActiveSessionId(session.id);
              }}
            >
              <i className={session.status} />
              <span>{session.title}</span>
              <small>{session.status === "exited" ? `exit ${session.exitCode ?? "?"}` : session.kind}</small>
              <X size={11} aria-label={`Close ${session.title}`} onClick={(event) => { event.stopPropagation(); void manager.closeSession(session.id); }} />
            </button>
          ))}
        </div>

        <div className="terminal-actions">
          <div className="terminal-profile-menu">
            <button type="button" aria-label="Choose terminal profile" title="Terminal Profile" onClick={() => setProfilePickerOpen((current) => !current)}>
              <Plus size={14} /><ChevronDown size={10} />
            </button>
            {profilePickerOpen && (
              <div className="terminal-profile-popover">
                <strong>Terminal profile</strong>
                {manager.profiles.map((profile) => (
                  <button type="button" className={manager.selectedProfileId === profile.id ? "active" : ""} key={profile.id} onClick={() => {
                    manager.setSelectedProfileId(profile.id);
                    setProfilePickerOpen(false);
                    void manager.createShell(undefined, profile.id);
                  }}>
                    <SquareTerminal size={12} />
                    <span>{profile.label}<small>{profile.description}</small></span>
                    {manager.selectedProfileId === profile.id && <i />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" aria-label="Split terminal" title={splitSession ? "Close Split" : "Split Terminal"} onClick={() => void splitTerminal()}><Columns2 size={14} /></button>
          <button type="button" aria-label="Search terminal" title="Search Terminal (Ctrl+F)" onClick={() => setSearchOpen((current) => !current)}><Search size={13} /></button>
          <div className="terminal-task-menu">
            <button type="button" aria-label="Run project task" title="Run Task" onClick={() => setTaskPickerOpen((current) => !current)}><Play size={13} /><ChevronDown size={10} /></button>
            {taskPickerOpen && (
              <div className="terminal-task-popover">
                <strong>Project tasks</strong>
                {taskError ? <span>{taskError}</span> : tasks.length === 0 ? <span>No tasks detected for this project.</span> : tasks.map((task) => (
                  <div className="terminal-task-row" key={task.id}>
                    <button type="button" title="Run in integrated terminal" onClick={() => { setTaskPickerOpen(false); void manager.runTask(task.id); }}>
                      <Play size={12} />
                      <span>{task.label}<small>{task.detail}</small></span>
                      <small>{task.source === "custom" ? "custom" : task.group}</small>
                    </button>
                    <button type="button" aria-label={`Run ${task.label} in external terminal`} title="Run in External Terminal" onClick={() => { setTaskPickerOpen(false); onRunExternalTask(task.id, manager.selectedProfileId ?? undefined); }}><Maximize2 size={11} /></button>
                  </div>
                ))}
                <button type="button" className="terminal-configure-task" onClick={() => { setTaskPickerOpen(false); onConfigureTasks(); }}>
                  <Settings2 size={12} /><span>Configure custom tasks<small>Open divex.tasks.json</small></span>
                </button>
              </div>
            )}
          </div>
          <button type="button" aria-label="Show terminal problems" title="Problems" className={selectedProblems.length ? "has-problems" : ""} onClick={() => setProblemsOpen((current) => !current)}>
            <AlertCircle size={14} />{selectedProblems.length > 0 && <b>{selectedProblems.length}</b>}
          </button>
          <button type="button" aria-label="Restart active terminal" title="Restart" disabled={!selectedSession} onClick={() => { if (selectedSession) void manager.restartSession(selectedSession.id); }}><ListRestart size={14} /></button>
          <button type="button" aria-label="Terminate active terminal" title="Terminate" disabled={!selectedSession} onClick={() => { if (selectedSession) void manager.closeSession(selectedSession.id); }}><CircleStop size={14} /></button>
          <button type="button" aria-label="Open external terminal" title="Open Selected Profile Externally" onClick={() => onOpenExternal(manager.selectedProfileId ?? undefined)}><Maximize2 size={13} /></button>
          <button type="button" aria-label="Close all terminals" title="Close All Terminals" disabled={manager.sessions.length === 0} onClick={() => void manager.closeAll()}><Trash2 size={13} /></button>
          <button type="button" aria-label="Hide terminal panel" title="Hide Panel" onClick={() => manager.setOpen(false)}><Minus size={14} /></button>
        </div>
      </header>

      <div className="terminal-dock-workarea">
        {searchOpen && (
          <div className="terminal-search-bar">
            <Search size={12} />
            <input ref={searchInputRef} value={searchQuery} placeholder="Search terminal output" onChange={(event) => setSearchQuery(event.target.value)} onKeyDown={(event) => {
              if (event.key === "Enter") find(event.shiftKey);
              if (event.key === "Escape") setSearchOpen(false);
            }} />
            <button type="button" aria-label="Previous result" onClick={() => find(true)}><ChevronUp size={12} /></button>
            <button type="button" aria-label="Next result" onClick={() => find(false)}><ChevronDown size={12} /></button>
            <button type="button" aria-label="Close search" onClick={() => setSearchOpen(false)}><X size={12} /></button>
          </div>
        )}
        <div className={`terminal-dock-body ${splitSession ? "split" : ""} ${problemsOpen ? "with-problems" : ""}`}>
          {manager.sessions.length === 0 ? (
            <div className="terminal-welcome">
              <SquareTerminal size={22} /><strong>No terminal sessions</strong>
              <span>Choose a shell profile or run a project task.</span>
              <button type="button" onClick={() => void manager.createShell()}><Plus size={13} />New terminal</button>
            </div>
          ) : (
            <div className="terminal-panes">
              <div className={`terminal-pane ${activePane === "primary" ? "focused" : ""}`} onPointerDown={() => setActivePane("primary")}>
                {manager.sessions.map((session) => (
                  <TerminalSessionView key={session.id} session={session} visible={primarySession?.id === session.id} dockOpen={manager.open} manager={manager} searchRequest={activePane === "primary" ? searchRequest : { ...searchRequest, query: "" }} onOpenLink={onOpenLink} />
                ))}
              </div>
              {splitSession && (
                <div className={`terminal-pane secondary ${activePane === "secondary" ? "focused" : ""}`} onPointerDown={() => setActivePane("secondary")}>
                  <TerminalSessionView session={splitSession} visible dockOpen={manager.open} manager={manager} searchRequest={activePane === "secondary" ? searchRequest : { ...searchRequest, query: "" }} onOpenLink={onOpenLink} />
                </div>
              )}
            </div>
          )}
          {problemsOpen && (
            <aside className="terminal-problems" aria-label="Terminal problems">
              <header><strong>Problems</strong><span>{selectedProblems.length} for this terminal</span><button type="button" onClick={() => selectedSession && manager.clearProblems(selectedSession.id)}>Clear</button></header>
              {selectedProblems.length === 0 ? <p>No build problems detected.</p> : selectedProblems.map((problem) => (
                <button type="button" key={problem.id} onClick={() => onOpenProblem(problem)}>
                  <i className={problem.severity} /><span>{problem.message}<small>{problem.path}:{problem.line}{problem.column ? `:${problem.column}` : ""}</small></span>
                </button>
              ))}
            </aside>
          )}
        </div>
      </div>
    </section>
  );
}
