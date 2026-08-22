import { useCallback, useEffect, useState } from "react";
import type {
  ProjectToolResult,
  WorkspaceTrustStatus,
} from "../../types";

export function useWorkspaceTrust(rootPath: string, enabled: boolean) {
  const [status, setStatus] = useState<WorkspaceTrustStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [changing, setChanging] = useState(false);
  const [result, setResult] = useState<ProjectToolResult | null>(null);

  useEffect(() => {
    setStatus(null);
    setResult(null);
    if (!enabled || !window.divex) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void window.divex
      .getWorkspaceTrust({ rootPath })
      .then((trustResult) => {
        if (cancelled) return;
        if (trustResult.success && trustResult.status) {
          setStatus(trustResult.status);
        } else {
          setResult(trustResult);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setResult({
            success: false,
            output:
              error instanceof Error
                ? error.message
                : "Workspace trust could not be loaded.",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, rootPath]);

  const setTrusted = useCallback(
    async (trusted: boolean) => {
      if (!enabled || !window.divex) return null;
      setChanging(true);
      setResult(null);
      try {
        const trustResult = await window.divex.setWorkspaceTrust({
          rootPath,
          trusted,
        });
        setResult(trustResult);
        if (trustResult.success && trustResult.status) {
          setStatus(trustResult.status);
          return trustResult.status;
        }
        return null;
      } catch (error) {
        setResult({
          success: false,
          output:
            error instanceof Error
              ? error.message
              : "Workspace trust could not be changed.",
        });
        return null;
      } finally {
        setChanging(false);
      }
    },
    [enabled, rootPath],
  );

  return {
    changing,
    enabled,
    loading,
    needsDecision: enabled && status?.state === "unknown",
    result,
    setTrusted,
    status,
    trusted: enabled && status?.trusted === true,
  };
}

export type WorkspaceTrustManager = ReturnType<typeof useWorkspaceTrust>;
