import type { ErrorInfo } from "react";
import type { RendererErrorReport } from "../types";

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "An unknown renderer error occurred.";
}

function errorStack(error: unknown) {
  return error instanceof Error ? error.stack : undefined;
}

export function createRendererErrorReport(
  source: RendererErrorReport["source"],
  error: unknown,
  details?: {
    componentStack?: ErrorInfo["componentStack"];
    feature?: string;
  },
): RendererErrorReport {
  return {
    source,
    message: errorMessage(error),
    stack: errorStack(error),
    componentStack: details?.componentStack ?? undefined,
    feature: details?.feature,
    route: `${window.location.pathname}${window.location.search}`,
    occurredAt: new Date().toISOString(),
  };
}

export function reportRendererError(report: RendererErrorReport) {
  console.error(`[Divex:${report.source}] ${report.message}`, report);
  void window.divex?.reportRendererError(report).catch((error) => {
    console.error("Divex could not persist the renderer crash report.", error);
  });
}

export function reloadRenderer(safeMode = true) {
  if (window.divex) {
    void window.divex.reloadRenderer({ safeMode });
    return;
  }

  const url = new URL(window.location.href);
  if (safeMode) url.searchParams.set("safeMode", "1");
  else url.searchParams.delete("safeMode");
  window.location.assign(url);
}

export function installGlobalCrashReporting() {
  const handleWindowError = (event: ErrorEvent) => {
    reportRendererError(
      createRendererErrorReport("window-error", event.error ?? event.message),
    );
  };
  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    reportRendererError(
      createRendererErrorReport("unhandled-rejection", event.reason),
    );
  };

  window.addEventListener("error", handleWindowError);
  window.addEventListener("unhandledrejection", handleUnhandledRejection);

  return () => {
    window.removeEventListener("error", handleWindowError);
    window.removeEventListener(
      "unhandledrejection",
      handleUnhandledRejection,
    );
  };
}
