import { useCallback, useEffect, useState, type RefObject } from "react";

export function useElementFullscreen<T extends HTMLElement>(
  targetRef: RefObject<T | null>,
) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const syncFullscreenState = () => {
      setIsFullscreen(document.fullscreenElement === targetRef.current);
    };

    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () =>
      document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, [targetRef]);

  const toggleFullscreen = useCallback(async () => {
    if (document.fullscreenElement === targetRef.current) {
      await document.exitFullscreen();
      return;
    }

    if (document.fullscreenElement) await document.exitFullscreen();
    await targetRef.current?.requestFullscreen();
  }, [targetRef]);

  return { isFullscreen, toggleFullscreen };
}
