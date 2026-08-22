import { useCallback, useEffect, useRef, useState } from "react";
import type { AnalyzedProject, ProjectPayload } from "../types";
import { analyzeProject } from "./analyzeProject";

interface AnalysisWorkerResponse {
  requestId: number;
  project?: AnalyzedProject;
  error?: string;
  durationMs: number;
}

interface AnalysisState {
  project: AnalyzedProject;
  isAnalyzing: boolean;
  error: string | null;
  durationMs: number | null;
}

export function useAnalyzedProject(payload: ProjectPayload) {
  const skipInitialAnalysisRef = useRef(true);
  const requestIdRef = useRef(0);
  const [retryRevision, setRetryRevision] = useState(0);
  const [state, setState] = useState<AnalysisState>(() => ({
    project: analyzeProject(payload),
    isAnalyzing: false,
    error: null,
    durationMs: null,
  }));

  useEffect(() => {
    if (skipInitialAnalysisRef.current && retryRevision === 0) {
      skipInitialAnalysisRef.current = false;
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setState((current) => ({
      ...current,
      isAnalyzing: true,
      error: null,
      durationMs: null,
    }));

    const worker = new Worker(
      new URL("./analysis.worker.ts", import.meta.url),
      { type: "module", name: "divex-project-analysis" },
    );
    worker.onmessage = (event: MessageEvent<AnalysisWorkerResponse>) => {
      if (event.data.requestId !== requestIdRef.current) return;
      if (import.meta.env.DEV && event.data.durationMs >= 50) {
        console.warn(
          `[Divex:analysis] Project analysis took ${event.data.durationMs} ms in the background worker.`,
        );
      }
      if (event.data.project) {
        setState({
          project: event.data.project,
          isAnalyzing: false,
          error: null,
          durationMs: event.data.durationMs,
        });
      } else {
        setState((current) => ({
          ...current,
          isAnalyzing: false,
          error: event.data.error ?? "Project analysis failed.",
          durationMs: event.data.durationMs,
        }));
      }
      worker.terminate();
    };
    worker.onerror = (event) => {
      if (requestId !== requestIdRef.current) return;
      setState((current) => ({
        ...current,
        isAnalyzing: false,
        error: event.message || "The project analysis worker stopped.",
        durationMs: null,
      }));
      worker.terminate();
    };
    worker.postMessage({ requestId, payload });

    return () => worker.terminate();
  }, [payload, retryRevision]);

  const retry = useCallback(() => {
    setRetryRevision((current) => current + 1);
  }, []);

  return { ...state, retry };
}
