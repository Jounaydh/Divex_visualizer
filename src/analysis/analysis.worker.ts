import { analyzeProject } from "./analyzeProject";
import type { AnalyzedProject, ProjectPayload } from "../types";

interface AnalysisRequest {
  requestId: number;
  payload: ProjectPayload;
}

interface AnalysisResponse {
  requestId: number;
  project?: AnalyzedProject;
  error?: string;
  durationMs: number;
}

interface WorkerScope {
  onmessage: ((event: MessageEvent<AnalysisRequest>) => void) | null;
  postMessage: (response: AnalysisResponse) => void;
}

const workerScope = globalThis as unknown as WorkerScope;

workerScope.onmessage = (event) => {
  const startedAt = performance.now();
  try {
    workerScope.postMessage({
      requestId: event.data.requestId,
      project: analyzeProject(event.data.payload),
      durationMs: Math.round(performance.now() - startedAt),
    });
  } catch (error) {
    workerScope.postMessage({
      requestId: event.data.requestId,
      error:
        error instanceof Error
          ? error.message
          : "Project analysis failed unexpectedly.",
      durationMs: Math.round(performance.now() - startedAt),
    });
  }
};
