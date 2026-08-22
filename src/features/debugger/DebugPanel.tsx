import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Bug,
  ChevronDown,
  ChevronRight,
  Circle,
  FileCode2,
  Pause,
  Play,
  SkipForward,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import type { AnalyzedFile, DebugStackFrame, DebugVariable } from "../../types";
import { canDebugFile, type DebuggerManager } from "./useDebugger";

interface DebugPanelProps {
  manager: DebuggerManager;
  selectedFile: AnalyzedFile | null;
  onOpenFrame: (frame: DebugStackFrame) => void;
}

function VariableRows({
  variables,
  manager,
  depth = 0,
}: {
  variables: DebugVariable[];
  manager: DebuggerManager;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  return (
    <div className="debug-variable-rows">
      {variables.map((variable, index) => {
        const expandable = variable.variablesReference > 0;
        const open = expanded.has(variable.variablesReference);
        const children = manager.variablesByReference[variable.variablesReference];
        return (
          <div key={`${variable.name}:${index}:${depth}`}>
            <button
              type="button"
              className="debug-variable"
              style={{ paddingLeft: 10 + depth * 12 }}
              disabled={!expandable}
              onClick={() => {
                if (!expandable) return;
                setExpanded((current) => {
                  const next = new Set(current);
                  if (next.has(variable.variablesReference)) {
                    next.delete(variable.variablesReference);
                  } else {
                    next.add(variable.variablesReference);
                    if (!children) void manager.loadVariables(variable.variablesReference);
                  }
                  return next;
                });
              }}
            >
              {expandable ? (
                open ? <ChevronDown size={11} /> : <ChevronRight size={11} />
              ) : (
                <span className="debug-variable-indent" />
              )}
              <strong>{variable.name}</strong>
              <span>{variable.value}</span>
              {variable.type && <small>{variable.type}</small>}
            </button>
            {open && children && (
              <VariableRows variables={children} manager={manager} depth={depth + 1} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function DebugPanel({ manager, selectedFile, onOpenFrame }: DebugPanelProps) {
  const [sections, setSections] = useState(() =>
    new Set(["variables", "stack", "breakpoints", "console"]),
  );
  const supported = canDebugFile(selectedFile?.extension);
  const breakpointEntries = Object.entries(manager.breakpoints).flatMap(
    ([filePath, lines]) => lines.map((line) => ({ filePath, line })),
  );
  const toggleSection = (section: string) => {
    setSections((current) => {
      const next = new Set(current);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  return (
    <section className="debug-panel" aria-label="Run and Debug">
      <div className="debug-launch">
        <button
          type="button"
          className="primary"
          disabled={!manager.enabled || !selectedFile || !supported || manager.starting}
          onClick={() => selectedFile && void manager.start(selectedFile.path)}
          title="Start debugging active file (F5)"
        >
          {manager.starting ? <span className="debug-spinner" /> : <Play size={13} />}
          {manager.starting
            ? "Starting…"
            : selectedFile && supported
              ? `Debug ${selectedFile.name}`
              : "Select a Python or Dart file"}
        </button>
      </div>

      {manager.session && manager.session.state !== "terminated" && (
        <div className="debug-controls" aria-label="Debug controls">
          {manager.session.state === "stopped" ? (
            <button type="button" title="Continue (F5)" onClick={() => void manager.control("continue")}>
              <Play size={14} />
            </button>
          ) : (
            <button type="button" title="Pause (F6)" onClick={() => void manager.control("pause")}>
              <Pause size={14} />
            </button>
          )}
          <button type="button" title="Step over (F10)" disabled={manager.session.state !== "stopped"} onClick={() => void manager.control("next")}>
            <SkipForward size={14} />
          </button>
          <button type="button" title="Step into (F11)" disabled={manager.session.state !== "stopped"} onClick={() => void manager.control("stepIn")}>
            <ArrowDownToLine size={14} />
          </button>
          <button type="button" title="Step out (Shift+F11)" disabled={manager.session.state !== "stopped"} onClick={() => void manager.control("stepOut")}>
            <ArrowUpFromLine size={14} />
          </button>
          <button type="button" title="Stop (Shift+F5)" className="danger" onClick={() => void manager.stop()}>
            <Square size={13} />
          </button>
          <span className={`debug-state ${manager.session.state}`}>
            {manager.session.state}
          </span>
        </div>
      )}

      {manager.result && !manager.result.success && (
        <div className="debug-message error">
          <Bug size={13} />
          <span>
            {manager.result.output}
            {/debugpy|Python debugging needs/i.test(manager.result.output) && (
              <button
                type="button"
                disabled={manager.installingAdapter}
                onClick={() => void manager.installPythonAdapter()}
              >
                {manager.installingAdapter ? "Setting up…" : "Set up Python debugger"}
              </button>
            )}
          </span>
        </div>
      )}

      <div className="debug-sections">
        <div className="debug-section">
          <button type="button" className="debug-section-title" onClick={() => toggleSection("variables")}>
            {sections.has("variables") ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Variables
          </button>
          {sections.has("variables") && (
            <div className="debug-section-body">
              {manager.scopes.length === 0 ? (
                <p>Variables appear when execution pauses.</p>
              ) : (
                manager.scopes.map((scope) => (
                  <div className="debug-scope" key={scope.variablesReference}>
                    <strong>{scope.name}</strong>
                    <VariableRows
                      variables={manager.variablesByReference[scope.variablesReference] ?? []}
                      manager={manager}
                    />
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="debug-section">
          <button type="button" className="debug-section-title" onClick={() => toggleSection("stack")}>
            {sections.has("stack") ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Call stack
          </button>
          {sections.has("stack") && (
            <div className="debug-section-body debug-stack">
              {manager.frames.length === 0 ? (
                <p>Pause at a breakpoint to inspect the call stack.</p>
              ) : (
                manager.frames.map((frame) => (
                  <button
                    type="button"
                    className={manager.activeFrame?.id === frame.id ? "active" : ""}
                    key={frame.id}
                    onClick={() => {
                      void manager.selectFrame(frame);
                      onOpenFrame(frame);
                    }}
                  >
                    <FileCode2 size={12} />
                    <span>
                      <strong>{frame.name}</strong>
                      <small>{frame.filePath ?? frame.sourceName ?? "runtime"}:{frame.line}</small>
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="debug-section">
          <button type="button" className="debug-section-title" onClick={() => toggleSection("breakpoints")}>
            {sections.has("breakpoints") ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Breakpoints <small>{breakpointEntries.length}</small>
          </button>
          {sections.has("breakpoints") && (
            <div className="debug-section-body debug-breakpoints">
              {breakpointEntries.length === 0 ? (
                <p>Click the editor gutter beside a line number to add one.</p>
              ) : (
                breakpointEntries.map((entry) => (
                  <div key={`${entry.filePath}:${entry.line}`}>
                    <Circle size={9} fill="currentColor" />
                    <button
                      type="button"
                      onClick={() => onOpenFrame({
                        id: -1,
                        name: entry.filePath,
                        filePath: entry.filePath,
                        line: entry.line,
                        column: 1,
                        threadId: 0,
                      })}
                    >
                      <span>{entry.filePath}</span>
                      <small>Line {entry.line}</small>
                    </button>
                    <button type="button" title="Remove breakpoint" onClick={() => manager.removeBreakpoint(entry.filePath, entry.line)}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="debug-section">
          <button type="button" className="debug-section-title" onClick={() => toggleSection("console")}>
            {sections.has("console") ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Debug console
            {manager.output && (
              <span
                role="button"
                tabIndex={0}
                title="Clear output"
                onClick={(event) => {
                  event.stopPropagation();
                  manager.clearOutput();
                }}
              >
                <X size={11} />
              </span>
            )}
          </button>
          {sections.has("console") && (
            <pre className="debug-console">{manager.output || "Runtime output appears here."}</pre>
          )}
        </div>
      </div>
    </section>
  );
}
