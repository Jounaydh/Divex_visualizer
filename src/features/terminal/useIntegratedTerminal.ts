import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  TerminalEvent,
  TerminalProblem,
  TerminalProfile,
  TerminalSession,
  TerminalSessionResult,
} from "../../types";
import { consumeTerminalProblems } from "./problemMatchers";

const MAX_PENDING_OUTPUT = 1024 * 1024;
const MAX_PROBLEMS = 500;
type OutputListener = (data: string) => void;

interface IntegratedTerminalOptions {
  rootPath: string;
  enabled: boolean;
  onNotice: (message: string, duration?: number) => void;
}

export function useIntegratedTerminal({ rootPath, enabled, onNotice }: IntegratedTerminalOptions) {
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState<TerminalProfile[]>([]);
  const [selectedProfileId, setSelectedProfileIdState] = useState<string | null>(null);
  const [problems, setProblems] = useState<TerminalProblem[]>([]);
  const sessionsRef = useRef<TerminalSession[]>([]);
  const listenersRef = useRef(new Map<string, Set<OutputListener>>());
  const pendingOutputRef = useRef(new Map<string, string>());
  const problemRemaindersRef = useRef(new Map<string, string>());
  const noticeRef = useRef(onNotice);
  noticeRef.current = onNotice;

  useEffect(() => {
    if (!window.divex) return;
    return window.divex.onTerminalEvent((event: TerminalEvent) => {
      if (event.type === "data") {
        const session = sessionsRef.current.find((candidate) => candidate.id === event.sessionId);
        if (session?.problemMatcher) {
          const parsed = consumeTerminalProblems(
            problemRemaindersRef.current.get(event.sessionId) ?? "",
            event.data,
            rootPath,
            event.sessionId,
            session.problemMatcher,
          );
          problemRemaindersRef.current.set(event.sessionId, parsed.remainder);
          if (parsed.problems.length > 0) {
            setProblems((current) => [...current, ...parsed.problems].slice(-MAX_PROBLEMS));
          }
        }
        const listeners = listenersRef.current.get(event.sessionId);
        if (listeners?.size) listeners.forEach((listener) => listener(event.data));
        else {
          const current = pendingOutputRef.current.get(event.sessionId) ?? "";
          pendingOutputRef.current.set(event.sessionId, `${current}${event.data}`.slice(-MAX_PENDING_OUTPUT));
        }
        return;
      }

      setSessions((current) => {
        const next = current.map((session) =>
          session.id === event.sessionId
            ? { ...session, status: "exited" as const, exitCode: event.exitCode }
            : session,
        );
        sessionsRef.current = next;
        return next;
      });
      const exitMessage = `\r\n\x1b[90m[Process exited with code ${event.exitCode}]\x1b[0m\r\n`;
      const listeners = listenersRef.current.get(event.sessionId);
      if (listeners?.size) listeners.forEach((listener) => listener(exitMessage));
      else pendingOutputRef.current.set(event.sessionId, exitMessage);
    });
  }, [rootPath]);

  useEffect(() => {
    let cancelled = false;
    if (!enabled || !window.divex) {
      setProfiles([]);
      setSelectedProfileIdState(null);
      return;
    }
    void window.divex.listTerminalProfiles({ rootPath }).then((result) => {
      if (cancelled) return;
      const next = result.profiles ?? [];
      setProfiles(next);
      const remembered = window.localStorage.getItem(`divex:terminal-profile:${rootPath}`);
      setSelectedProfileIdState(
        next.some((profile) => profile.id === remembered) ? remembered : next[0]?.id ?? null,
      );
    });
    return () => { cancelled = true; };
  }, [enabled, rootPath]);

  useEffect(() => {
    setSessions([]);
    sessionsRef.current = [];
    setActiveSessionId(null);
    setOpen(false);
    setProblems([]);
    listenersRef.current.clear();
    pendingOutputRef.current.clear();
    problemRemaindersRef.current.clear();
    return () => { if (window.divex) void window.divex.closeAllTerminals(); };
  }, [rootPath]);

  useEffect(() => {
    if (enabled) return;
    if (window.divex) void window.divex.closeAllTerminals();
    setSessions([]);
    sessionsRef.current = [];
    setActiveSessionId(null);
    setOpen(false);
    setProblems([]);
    listenersRef.current.clear();
    pendingOutputRef.current.clear();
    problemRemaindersRef.current.clear();
  }, [enabled]);

  const acceptSession = useCallback((result: TerminalSessionResult) => {
    if (!result.success || !result.session) {
      noticeRef.current(result.output, 4500);
      return null;
    }
    setSessions((current) => {
      const next = [...current, result.session!];
      sessionsRef.current = next;
      return next;
    });
    setActiveSessionId(result.session.id);
    setOpen(true);
    return result.session;
  }, []);

  const createShell = useCallback(async (cwd?: string, profileId?: string) => {
    if (!enabled || !window.divex) {
      noticeRef.current("Open and trust a workspace to start a terminal.", 4500);
      return null;
    }
    return acceptSession(await window.divex.createTerminal({
      rootPath,
      cwd,
      cols: 100,
      rows: 28,
      profileId: profileId ?? selectedProfileId ?? undefined,
    }));
  }, [acceptSession, enabled, rootPath, selectedProfileId]);

  const runTask = useCallback(async (taskId: string) => {
    if (!enabled || !window.divex) return null;
    return acceptSession(await window.divex.runTaskInTerminal({ rootPath, taskId, cols: 100, rows: 28 }));
  }, [acceptSession, enabled, rootPath]);

  const runFile = useCallback(async (entryPath: string) => {
    if (!enabled || !window.divex) return null;
    return acceptSession(await window.divex.runFileInTerminal({ rootPath, entryPath, cols: 100, rows: 28 }));
  }, [acceptSession, enabled, rootPath]);

  const attachOutput = useCallback((sessionId: string, listener: OutputListener) => {
    const listeners = listenersRef.current.get(sessionId) ?? new Set<OutputListener>();
    listeners.add(listener);
    listenersRef.current.set(sessionId, listeners);
    const pending = pendingOutputRef.current.get(sessionId);
    if (pending) {
      listener(pending);
      pendingOutputRef.current.delete(sessionId);
    }
    return () => {
      const current = listenersRef.current.get(sessionId);
      current?.delete(listener);
      if (current?.size === 0) listenersRef.current.delete(sessionId);
    };
  }, []);

  const sendInput = useCallback((sessionId: string, data: string) => {
    if (window.divex) void window.divex.writeTerminal({ sessionId, data });
  }, []);
  const resize = useCallback((sessionId: string, cols: number, rows: number) => {
    if (window.divex) void window.divex.resizeTerminal({ sessionId, cols, rows });
  }, []);

  const closeSession = useCallback(async (sessionId: string) => {
    if (window.divex) await window.divex.closeTerminal({ sessionId });
    pendingOutputRef.current.delete(sessionId);
    problemRemaindersRef.current.delete(sessionId);
    listenersRef.current.delete(sessionId);
    setProblems((current) => current.filter((problem) => problem.sessionId !== sessionId));
    setSessions((current) => {
      const index = current.findIndex((session) => session.id === sessionId);
      const next = current.filter((session) => session.id !== sessionId);
      sessionsRef.current = next;
      setActiveSessionId((active) => active !== sessionId
        ? active
        : next[Math.min(Math.max(0, index - 1), next.length - 1)]?.id ?? null);
      if (next.length === 0) setOpen(false);
      return next;
    });
  }, []);

  const closeAll = useCallback(async () => {
    if (window.divex) await window.divex.closeAllTerminals();
    pendingOutputRef.current.clear();
    problemRemaindersRef.current.clear();
    listenersRef.current.clear();
    setSessions([]);
    sessionsRef.current = [];
    setProblems([]);
    setActiveSessionId(null);
    setOpen(false);
  }, []);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [activeSessionId, sessions],
  );

  const restartSession = useCallback(async (sessionId: string) => {
    const previous = sessionsRef.current.find((session) => session.id === sessionId);
    if (!previous) return;
    await closeSession(previous.id);
    if (previous.kind === "task" && previous.taskId) await runTask(previous.taskId);
    else if (previous.kind === "file" && previous.filePath) await runFile(previous.filePath);
    else await createShell(undefined, previous.profileId);
  }, [closeSession, createShell, runFile, runTask]);

  const restartActive = useCallback(async () => {
    if (activeSession) await restartSession(activeSession.id);
  }, [activeSession, restartSession]);

  const show = useCallback(() => {
    setOpen(true);
    if (sessions.length === 0) void createShell();
  }, [createShell, sessions.length]);

  const setSelectedProfileId = useCallback((profileId: string) => {
    if (!profiles.some((profile) => profile.id === profileId)) return;
    setSelectedProfileIdState(profileId);
    window.localStorage.setItem(`divex:terminal-profile:${rootPath}`, profileId);
  }, [profiles, rootPath]);

  const clearProblems = useCallback((sessionId?: string) => {
    setProblems((current) => sessionId
      ? current.filter((problem) => problem.sessionId !== sessionId)
      : []);
  }, []);

  return {
    activeSession,
    activeSessionId,
    attachOutput,
    clearProblems,
    closeAll,
    closeSession,
    createShell,
    open,
    problems,
    profiles,
    resize,
    restartActive,
    restartSession,
    runFile,
    runTask,
    selectedProfileId,
    sendInput,
    sessions,
    setActiveSessionId,
    setOpen,
    setSelectedProfileId,
    show,
  };
}

export type IntegratedTerminalManager = ReturnType<typeof useIntegratedTerminal>;
