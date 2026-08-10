import { useCallback, useRef, useState } from "react";

export function useNavigationHistory<T>(
  locationKey: (location: T) => string,
  maximumEntries = 100,
) {
  const entriesRef = useRef<T[]>([]);
  const indexRef = useRef(-1);
  const [, setRevision] = useState(0);

  const update = () => setRevision((current) => current + 1);

  const visit = useCallback(
    (location: T) => {
      const current = entriesRef.current[indexRef.current];
      if (current && locationKey(current) === locationKey(location)) return;
      const next = entriesRef.current.slice(0, indexRef.current + 1);
      next.push(location);
      if (next.length > maximumEntries) next.shift();
      entriesRef.current = next;
      indexRef.current = next.length - 1;
      update();
    },
    [locationKey, maximumEntries],
  );

  const back = useCallback(() => {
    if (indexRef.current <= 0) return null;
    indexRef.current -= 1;
    update();
    return entriesRef.current[indexRef.current] ?? null;
  }, []);

  const forward = useCallback(() => {
    if (indexRef.current >= entriesRef.current.length - 1) return null;
    indexRef.current += 1;
    update();
    return entriesRef.current[indexRef.current] ?? null;
  }, []);

  const reset = useCallback(() => {
    entriesRef.current = [];
    indexRef.current = -1;
    update();
  }, []);

  return {
    visit,
    back,
    forward,
    reset,
    canGoBack: indexRef.current > 0,
    canGoForward:
      indexRef.current >= 0 &&
      indexRef.current < entriesRef.current.length - 1,
  };
}
