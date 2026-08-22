import { useEffect, useRef } from "react";
import type { ProjectPayload } from "../../types";

interface UseProjectLiveRefreshOptions {
  rootPath: string;
  enabled: boolean;
  onProject: (project: ProjectPayload) => void;
  onNotice: (message: string, duration?: number) => void;
}

export function useProjectLiveRefresh({
  rootPath,
  enabled,
  onProject,
  onNotice,
}: UseProjectLiveRefreshOptions) {
  const onProjectRef = useRef(onProject);
  const onNoticeRef = useRef(onNotice);
  onProjectRef.current = onProject;
  onNoticeRef.current = onNotice;

  useEffect(() => {
    if (!window.divex || !enabled) {
      if (window.divex) void window.divex.stopWatchingProject();
      return;
    }

    let disposed = false;
    let refreshing = false;
    let refreshQueued = false;

    const refreshFromDisk = async () => {
      if (refreshing) {
        refreshQueued = true;
        return;
      }
      refreshing = true;
      try {
        const result = await window.divex!.refreshProject({ rootPath });
        if (!disposed && result.success && result.project) {
          onProjectRef.current(result.project);
        }
      } catch (error) {
        if (!disposed) {
          onNoticeRef.current(
            error instanceof Error
              ? error.message
              : "Live project refresh failed.",
            4500,
          );
        }
      } finally {
        refreshing = false;
        if (refreshQueued && !disposed) {
          refreshQueued = false;
          void refreshFromDisk();
        }
      }
    };

    const stopChanged = window.divex.onProjectChanged((change) => {
      if (change.rootPath === rootPath) void refreshFromDisk();
    });
    const stopError = window.divex.onProjectWatchError((error) => {
      if (!disposed && error.rootPath === rootPath) {
        onNoticeRef.current(`Live refresh stopped: ${error.message}`, 5000);
      }
    });
    void window.divex.watchProject({ rootPath });

    return () => {
      disposed = true;
      stopChanged();
      stopError();
      void window.divex?.stopWatchingProject();
    };
  }, [enabled, rootPath]);
}
