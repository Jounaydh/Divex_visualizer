import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  TerminalEvent,
  TerminalSession,
  TerminalSessionResult,
} from "../../types";

const MAX_PENDING_OUTPUT = 1024 * 1024;

type OutputListener = (data: string) => void;

interface IntegratedTerminalOptions {
  rootPath: string;
  enabled: boolean;
  onNotice: (message: string, duration?: number) => void;
}

export function useIntegratedTerminal({
  rootPath,
  enabled,
  onNotice,
}: IntegratedTerminalOptions) {
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const listenersRef = useRef(new Map<string, Set<OutputListener>>());
  const pendingOutputRef = useRef(new Map<string, string>());
  const noticeRef = useRef(onNotice);
  noticeRef.current = onNotice;

  useEffect(() => {
    if (!window.divex) return;
    return window.divex.onTerminalEvent((event: TerminalEvent) => {
      if (event.type === "data") {
        const listeners = listenersRef.current.get(event.sessionId);
        if (listeners?.size) {
          listeners.forEach((listener) => listener(event.data));
        } else {
          const current = pendingOutputRef.current.get(event.sessionId) ?? "";
          pendingOutputRef.current.set(
            event.sessionId,
            `${current}${event.data}`.slice(-MAX_PENDING_OUTPUT),
          );
        }
        return;
      }

      setSessions((current) =>
        current.map((session) =>
          session.id === event.sessionId
            ? {
                ...session,
                status: "exited",
                exitCode: event.exitCode,
              }
            : session,
        ),
      );
      const exitMessage = `\r\n\x1b[90m[Process exited with code ${event.exitCode}]\x1b[0m\r\n`;
      const listeners = listenersRef.current.get(event.sessionId);
      if (listeners?.size) {
        listeners.forEach((listener) => listener(exitMessage));
      } else {
        pendingOutputRef.current.set(event.sessionId, exitMessage);
      }
    });
  }, []);

  useEffect(() => {
    setSessions([]);
    setActiveSessionId(null);
    setOpen(false);
    listenersRef.current.clear();
    pendingOutputRef.current.clear();
    return () => {
      if (window.divex) void window.divex.closeAllTerminals();
    };
  }, [rootPath]);

  const acceptSession = useCallback(
    (result: TerminalSessionResult) => {
      if (!result.success || !result.session) {
        noticeRef.current(result.output, 4500);
        return null;
      }
      setSessions((current) => [...current, result.session!]);
      setActiveSessionId(result.session.id);
      setOpen(true);
      return result.session;
    },
    [],
  );

  const createShell = useCallback(
    async (cwd?: string) => {
      if (!enabled || !window.divex) {
        noticeRef.current("Open a local project to start a terminal.", 4500);
        return null;
      }
      return acceptSession(
        await window.divex.createTerminal({
          rootPath,
          cwd,
          cols: 100,
          rows: 28,
          title: "Terminal",
        }),
      );
    },
    [acceptSession, enabled, rootPath],
  );

  const runTask = useCallback(
    async (taskId: string) => {
      if (!enabled || !window.divex) return null;
      return acceptSession(
        await window.divex.runTaskInTerminal({
          rootPath,
          taskId,
          cols: 100,
          rows: 28,
        }),
      );
    },
    [acceptSession, enabled, rootPath],
  );

  const runFile = useCallback(
    async (entryPath: string) => {
      if (!enabled || !window.divex) return null;
      return acceptSession(
        await window.divex.runFileInTerminal({
          rootPath,
          entryPath,
          cols: 100,
          rows: 28,
        }),
      );
    },
    [acceptSession, enabled, rootPath],
  );

  const attachOutput = useCallback(
    (sessionId: string, listener: OutputListener) => {
      const listeners =
        listenersRef.current.get(sessionId) ?? new Set<OutputListener>();
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
    },
    [],
  );

  const sendInput = useCallback((sessionId: string, data: string) => {
    if (window.divex) {
      void window.divex.writeTerminal({ sessionId, data });
    }
  }, []);

  const resize = useCallback(
    (sessionId: string, cols: number, rows: number) => {
      if (window.divex) {
        void window.divex.resizeTerminal({ sessionId, cols, rows });
      }
    },
    [],
  );

  const closeSession = useCallback(
    async (sessionId: string) => {
      if (window.divex) {
        await window.divex.closeTerminal({ sessionId });
      }
      pendingOutputRef.current.delete(sessionId);
      listenersRef.current.delete(sessionId);
      setSessions((current) => {
        const index = current.findIndex((session) => session.id === sessionId);
        const next = current.filter((session) => session.id !== sessionId);
        setActiveSessionId((active) => {
          if (active !== sessionId) return active;
          return next[Math.min(Math.max(0, index - 1), next.length - 1)]?.id ?? null;
        });
        if (next.length === 0) setOpen(false);
        return next;
      });
    },
    [],
  );

  const closeAll = useCallback(async () => {
    if (window.divex) await window.divex.closeAllTerminals();
    pendingOutputRef.current.clear();
    listenersRef.current.clear();
    setSessions([]);
    setActiveSessionId(null);
    setOpen(false);
  }, []);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [activeSessionId, sessions],
  );

  const restartActive = useCallback(async () => {
    if (!activeSession) return;
    const previous = activeSession;
    await closeSession(previous.id);
    if (previous.kind === "task" && previous.taskId) {
      await runTask(previous.taskId);
    } else if (previous.kind === "file" && previous.filePath) {
      await runFile(previous.filePath);
    } else {
      await createShell();
    }
  }, [activeSession, closeSession, createShell, runFile, runTask]);

  const show = useCallback(() => {
    setOpen(true);
    if (sessions.length === 0) void createShell();
  }, [createShell, sessions.length]);

  return {
    activeSession,
    activeSessionId,
    attachOutput,
    closeAll,
    closeSession,
    createShell,
    open,
    resize,
    restartActive,
    runFile,
    runTask,
    sendInput,
    sessions,
    setActiveSessionId,
    setOpen,
    show,
  };
}

export type IntegratedTerminalManager = ReturnType<
  typeof useIntegratedTerminal
>;
