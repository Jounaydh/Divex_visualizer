import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  DebugBreakpoint,
  DebugEvent,
  DebugScope,
  DebugSession,
  DebugStackFrame,
  DebugVariable,
  ProjectToolResult,
} from "../../types";

const DEBUGGABLE_EXTENSIONS = new Set(["dart", "py", "pyw"]);

export function canDebugFile(extension?: string) {
  return Boolean(extension && DEBUGGABLE_EXTENSIONS.has(extension.toLowerCase()));
}

function breakpointStorageKey(rootPath: string) {
  return `divex.debug.breakpoints:${rootPath}`;
}

function loadBreakpoints(rootPath: string): Record<string, number[]> {
  if (!rootPath || rootPath === "Demo project") return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(breakpointStorageKey(rootPath)) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([filePath, lines]) =>
        Array.isArray(lines)
          ? [[filePath, lines.map(Number).filter((line) => Number.isInteger(line) && line > 0)]]
          : [],
      ),
    );
  } catch {
    return {};
  }
}

export interface DebuggerManager {
  enabled: boolean;
  starting: boolean;
  installingAdapter: boolean;
  session: DebugSession | null;
  breakpoints: Record<string, number[]>;
  verifiedBreakpoints: DebugBreakpoint[];
  frames: DebugStackFrame[];
  activeFrame: DebugStackFrame | null;
  scopes: DebugScope[];
  variablesByReference: Record<number, DebugVariable[]>;
  output: string;
  result: ProjectToolResult | null;
  start: (filePath: string) => Promise<void>;
  stop: () => Promise<void>;
  control: (action: "continue" | "pause" | "next" | "stepIn" | "stepOut") => Promise<void>;
  toggleBreakpoint: (filePath: string, line: number) => void;
  removeBreakpoint: (filePath: string, line: number) => void;
  selectFrame: (frame: DebugStackFrame) => Promise<void>;
  loadVariables: (variablesReference: number) => Promise<void>;
  clearOutput: () => void;
  installPythonAdapter: () => Promise<void>;
}

export function useDebugger(rootPath: string, enabled: boolean): DebuggerManager {
  const [starting, setStarting] = useState(false);
  const [installingAdapter, setInstallingAdapter] = useState(false);
  const [session, setSession] = useState<DebugSession | null>(null);
  const [breakpoints, setBreakpoints] = useState<Record<string, number[]>>(() =>
    loadBreakpoints(rootPath),
  );
  const [verifiedBreakpoints, setVerifiedBreakpoints] = useState<DebugBreakpoint[]>([]);
  const [frames, setFrames] = useState<DebugStackFrame[]>([]);
  const [activeFrame, setActiveFrame] = useState<DebugStackFrame | null>(null);
  const [scopes, setScopes] = useState<DebugScope[]>([]);
  const [variablesByReference, setVariablesByReference] = useState<
    Record<number, DebugVariable[]>
  >({});
  const [output, setOutput] = useState("");
  const [result, setResult] = useState<ProjectToolResult | null>(null);
  const sessionRef = useRef(session);
  const threadIdRef = useRef<number | undefined>(undefined);
  const breakpointsRef = useRef(breakpoints);
  sessionRef.current = session;
  breakpointsRef.current = breakpoints;

  const loadFrameScopes = useCallback(async (sessionId: string, frame: DebugStackFrame) => {
    if (!window.divex) return;
    const scopeResult = await window.divex.getDebugScopes({
      sessionId,
      frameId: frame.id,
    });
    if (!scopeResult.success) {
      setResult(scopeResult);
      return;
    }
    setScopes(scopeResult.scopes);
    const entries = await Promise.all(
      scopeResult.scopes.map(async (scope) => {
        const variableResult = await window.divex!.getDebugVariables({
          sessionId,
          variablesReference: scope.variablesReference,
        });
        return [scope.variablesReference, variableResult.variables] as const;
      }),
    );
    setVariablesByReference(Object.fromEntries(entries));
  }, []);

  const refreshStack = useCallback(
    async (sessionId: string, threadId?: number) => {
      if (!window.divex) return;
      const stackResult = await window.divex.getDebugStack({ sessionId, threadId });
      if (!stackResult.success) {
        setResult(stackResult);
        return;
      }
      threadIdRef.current = stackResult.threadId;
      setFrames(stackResult.frames);
      const firstFrame = stackResult.frames[0] ?? null;
      setActiveFrame(firstFrame);
      if (firstFrame) await loadFrameScopes(sessionId, firstFrame);
      else {
        setScopes([]);
        setVariablesByReference({});
      }
    },
    [loadFrameScopes],
  );

  useEffect(() => {
    const previousSession = sessionRef.current;
    if (previousSession && window.divex) {
      void window.divex.stopDebugSession({ sessionId: previousSession.id });
    }
    sessionRef.current = null;
    setSession(null);
    setBreakpoints(loadBreakpoints(rootPath));
    setVerifiedBreakpoints([]);
    setFrames([]);
    setActiveFrame(null);
    setScopes([]);
    setVariablesByReference({});
    setOutput("");
    setResult(null);
  }, [rootPath]);

  useEffect(() => {
    if (enabled) return;
    const current = sessionRef.current;
    if (current && window.divex) {
      void window.divex.stopDebugSession({ sessionId: current.id });
    }
    sessionRef.current = null;
    setSession(null);
    setFrames([]);
    setActiveFrame(null);
    setScopes([]);
    setVariablesByReference({});
  }, [enabled]);

  useEffect(() => {
    if (!rootPath || rootPath === "Demo project") return;
    localStorage.setItem(breakpointStorageKey(rootPath), JSON.stringify(breakpoints));
  }, [breakpoints, rootPath]);

  useEffect(() => {
    if (!window.divex) return;
    return window.divex.onDebugEvent((event: DebugEvent) => {
      if (sessionRef.current && event.sessionId !== sessionRef.current.id) return;
      if (event.type === "output") {
        setOutput((current) => `${current}${event.output}`.slice(-80_000));
      } else if (event.type === "stopped") {
        setSession((current) =>
          current ? { ...current, state: "stopped" } : current,
        );
        threadIdRef.current = event.threadId;
        void refreshStack(event.sessionId, event.threadId);
      } else if (event.type === "continued") {
        setSession((current) =>
          current ? { ...current, state: "running" } : current,
        );
        setFrames([]);
        setActiveFrame(null);
        setScopes([]);
        setVariablesByReference({});
      } else if (event.type === "terminated") {
        setSession((current) =>
          current ? { ...current, state: "terminated" } : current,
        );
      }
    });
  }, [refreshStack]);

  const start = useCallback(async (filePath: string) => {
    if (!window.divex || !enabled) {
      setResult({
        success: false,
        output: "Open and trust a local or WSL workspace before debugging.",
      });
      return;
    }
    if (sessionRef.current) {
      await window.divex.stopDebugSession({ sessionId: sessionRef.current.id });
      setSession(null);
    }
    setStarting(true);
    setResult(null);
    setOutput("");
    setFrames([]);
    setActiveFrame(null);
    setScopes([]);
    setVariablesByReference({});
    try {
      const startResult = await window.divex.startDebugSession({
        rootPath,
        filePath,
        breakpoints: Object.entries(breakpointsRef.current).map(([path, lines]) => ({
          filePath: path,
          lines,
        })),
      });
      setResult(startResult);
      if (startResult.session) setSession(startResult.session);
    } catch (error) {
      setResult({
        success: false,
        output: error instanceof Error ? error.message : "The debugger could not start.",
      });
    } finally {
      setStarting(false);
    }
  }, [enabled, rootPath]);

  const stop = useCallback(async () => {
    const current = sessionRef.current;
    if (!window.divex || !current) return;
    const stopResult = await window.divex.stopDebugSession({ sessionId: current.id });
    setResult(stopResult);
    setSession(null);
    setFrames([]);
    setActiveFrame(null);
    setScopes([]);
    setVariablesByReference({});
  }, []);

  const control = useCallback(
    async (action: "continue" | "pause" | "next" | "stepIn" | "stepOut") => {
      const current = sessionRef.current;
      if (!window.divex || !current) return;
      const controlResult = await window.divex.controlDebugSession({
        sessionId: current.id,
        action,
        threadId: threadIdRef.current,
      });
      if (!controlResult.success) setResult(controlResult);
    },
    [],
  );

  const updateRemoteBreakpoints = useCallback(
    async (filePath: string, lines: number[]) => {
      const current = sessionRef.current;
      if (!window.divex || !current || current.state === "terminated") return;
      const breakpointResult = await window.divex.setDebugBreakpoints({
        sessionId: current.id,
        filePath,
        lines,
      });
      if (!breakpointResult.success) setResult(breakpointResult);
      if (breakpointResult.breakpoints) {
        setVerifiedBreakpoints((existing) => [
          ...existing.filter((item) => item.filePath !== filePath),
          ...breakpointResult.breakpoints!,
        ]);
      }
    },
    [],
  );

  const toggleBreakpoint = useCallback(
    (filePath: string, line: number) => {
      setBreakpoints((current) => {
        const existing = current[filePath] ?? [];
        const nextLines = existing.includes(line)
          ? existing.filter((candidate) => candidate !== line)
          : [...existing, line].sort((left, right) => left - right);
        const next = { ...current };
        if (nextLines.length) next[filePath] = nextLines;
        else delete next[filePath];
        void updateRemoteBreakpoints(filePath, nextLines);
        return next;
      });
    },
    [updateRemoteBreakpoints],
  );

  const removeBreakpoint = useCallback(
    (filePath: string, line: number) => {
      setBreakpoints((current) => {
        const nextLines = (current[filePath] ?? []).filter((item) => item !== line);
        const next = { ...current };
        if (nextLines.length) next[filePath] = nextLines;
        else delete next[filePath];
        void updateRemoteBreakpoints(filePath, nextLines);
        return next;
      });
    },
    [updateRemoteBreakpoints],
  );

  const selectFrame = useCallback(async (frame: DebugStackFrame) => {
    const current = sessionRef.current;
    if (!current) return;
    setActiveFrame(frame);
    await loadFrameScopes(current.id, frame);
  }, [loadFrameScopes]);

  const loadVariables = useCallback(async (variablesReference: number) => {
    const current = sessionRef.current;
    if (!window.divex || !current || !variablesReference) return;
    const variableResult = await window.divex.getDebugVariables({
      sessionId: current.id,
      variablesReference,
    });
    if (!variableResult.success) {
      setResult(variableResult);
      return;
    }
    setVariablesByReference((existing) => ({
      ...existing,
      [variablesReference]: variableResult.variables,
    }));
  }, []);

  const installPythonAdapter = useCallback(async () => {
    if (!window.divex || !enabled) return;
    setInstallingAdapter(true);
    setResult(null);
    try {
      const installResult = await window.divex.installPythonDebugAdapter({ rootPath });
      setResult(installResult);
    } catch (error) {
      setResult({
        success: false,
        output: error instanceof Error ? error.message : "Python debugger setup failed.",
      });
    } finally {
      setInstallingAdapter(false);
    }
  }, [enabled, rootPath]);

  return useMemo(
    () => ({
      enabled,
      starting,
      installingAdapter,
      session,
      breakpoints,
      verifiedBreakpoints,
      frames,
      activeFrame,
      scopes,
      variablesByReference,
      output,
      result,
      start,
      stop,
      control,
      toggleBreakpoint,
      removeBreakpoint,
      selectFrame,
      loadVariables,
      clearOutput: () => setOutput(""),
      installPythonAdapter,
    }),
    [
      activeFrame,
      breakpoints,
      control,
      enabled,
      frames,
      installPythonAdapter,
      installingAdapter,
      loadVariables,
      output,
      removeBreakpoint,
      result,
      scopes,
      selectFrame,
      session,
      start,
      starting,
      stop,
      toggleBreakpoint,
      variablesByReference,
      verifiedBreakpoints,
    ],
  );
}
