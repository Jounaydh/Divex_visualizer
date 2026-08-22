import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type {
  AnalyzedFile,
  EditorRecoveryEntry,
  ProjectToolResult,
} from "../../types";
import type { EditorDocument, RecoveryStatus } from "./editorTypes";

interface UseEditorRecoveryOptions {
  rootPath: string;
  filesByPath: Map<string, AnalyzedFile>;
  documentsRef: MutableRefObject<Map<string, EditorDocument>>;
  setResult: Dispatch<SetStateAction<ProjectToolResult | null>>;
}

export function useEditorRecovery({
  rootPath,
  filesByPath,
  documentsRef,
  setResult,
}: UseEditorRecoveryOptions) {
  const [recoveries, setRecoveries] = useState<EditorRecoveryEntry[]>([]);
  const [recoveryStatus, setRecoveryStatus] =
    useState<RecoveryStatus>("idle");
  const recoveryTimersRef = useRef(new Map<string, number>());
  const mountedRef = useRef(true);

  const clearRecoverySnapshot = useCallback(
    async (path: string) => {
      const timer = recoveryTimersRef.current.get(path);
      if (timer !== undefined) window.clearTimeout(timer);
      recoveryTimersRef.current.delete(path);
      if (!window.divex || rootPath === "Demo project") return;
      const clearResult = await window.divex.clearEditorRecovery({
        rootPath,
        filePath: path,
      });
      if (!clearResult.success) throw new Error(clearResult.output);
    },
    [rootPath],
  );

  const writeRecoverySnapshot = useCallback(
    async (document: EditorDocument) => {
      if (!window.divex || rootPath === "Demo project") return;
      if (!document.dirty) {
        await clearRecoverySnapshot(document.file.path);
        if (mountedRef.current) {
          const hasOtherDirtyDocument = [...documentsRef.current.values()].some(
            (candidate) => candidate !== document && candidate.dirty,
          );
          setRecoveryStatus(hasOtherDirtyDocument ? "protected" : "idle");
        }
        return;
      }
      if (mountedRef.current) setRecoveryStatus("saving");
      try {
        const recoveryResult = await window.divex.writeEditorRecovery({
          rootPath,
          filePath: document.file.path,
          content: document.session.getValue(),
        });
        if (mountedRef.current) {
          setRecoveryStatus(recoveryResult.success ? "protected" : "error");
          if (!recoveryResult.success) setResult(recoveryResult);
        }
      } catch (error) {
        if (mountedRef.current) {
          setRecoveryStatus("error");
          setResult({
            success: false,
            output:
              error instanceof Error
                ? error.message
                : "The recovery snapshot could not be saved.",
          });
        }
      }
    },
    [clearRecoverySnapshot, documentsRef, rootPath, setResult],
  );

  const queueRecoverySnapshot = useCallback(
    (document: EditorDocument) => {
      const path = document.file.path;
      const currentTimer = recoveryTimersRef.current.get(path);
      if (currentTimer !== undefined) window.clearTimeout(currentTimer);
      const hasDirtyDocument = [...documentsRef.current.values()].some(
        (candidate) => candidate.dirty,
      );
      setRecoveryStatus(
        document.dirty ? "saving" : hasDirtyDocument ? "protected" : "idle",
      );
      const timer = window.setTimeout(() => {
        recoveryTimersRef.current.delete(path);
        void writeRecoverySnapshot(document);
      }, 350);
      recoveryTimersRef.current.set(path, timer);
    },
    [documentsRef, writeRecoverySnapshot],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      documentsRef.current.forEach((document) => {
        if (document.dirty) void writeRecoverySnapshot(document);
      });
      recoveryTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      recoveryTimersRef.current.clear();
    };
  }, [documentsRef, writeRecoverySnapshot]);

  useEffect(() => {
    if (!window.divex || rootPath === "Demo project") return;
    let cancelled = false;
    void window.divex
      .listEditorRecoveries({ rootPath })
      .then(async (recoveryResult) => {
        if (cancelled) return;
        if (!recoveryResult.success) {
          setResult(recoveryResult);
          return;
        }
        const recoverable: EditorRecoveryEntry[] = [];
        for (const entry of recoveryResult.entries) {
          const diskFile = filesByPath.get(entry.filePath);
          if (diskFile?.content === entry.content) {
            await clearRecoverySnapshot(entry.filePath).catch(() => undefined);
          } else {
            recoverable.push(entry);
          }
        }
        if (!cancelled) {
          setRecoveries(recoverable);
          if (recoverable.length > 0) setRecoveryStatus("protected");
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setRecoveryStatus("error");
          setResult({
            success: false,
            output:
              error instanceof Error
                ? error.message
                : "Editor recovery data could not be loaded.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [clearRecoverySnapshot, filesByPath, rootPath, setResult]);

  useEffect(() => {
    const flushDirtyBuffers = () => {
      documentsRef.current.forEach((document) => {
        if (document.dirty) void writeRecoverySnapshot(document);
      });
    };
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") flushDirtyBuffers();
    };
    window.addEventListener("pagehide", flushDirtyBuffers);
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => {
      window.removeEventListener("pagehide", flushDirtyBuffers);
      document.removeEventListener("visibilitychange", flushWhenHidden);
    };
  }, [documentsRef, writeRecoverySnapshot]);

  return {
    clearRecoverySnapshot,
    queueRecoverySnapshot,
    recoveries,
    recoveryStatus,
    setRecoveries,
    setRecoveryStatus,
    writeRecoverySnapshot,
  };
}
