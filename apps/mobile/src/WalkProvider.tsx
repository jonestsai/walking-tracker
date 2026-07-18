import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { activeWalk, activeWalkStartedAt, initialiseQueue } from "./locationQueue";
import { endWalk, flushQueuedFixes, startWalk } from "./tracking";

type WalkContextValue = {
  walking: boolean;
  busy: boolean;
  unlockedCells: string[];
  walkStartedAt: number | null;
  walkNewTiles: number;
  replaceUnlockedCells: (cells: string[]) => void;
  start: () => Promise<void>;
  end: () => Promise<void>;
};

const WalkContext = createContext<WalkContextValue | null>(null);

export function WalkProvider({ children }: PropsWithChildren) {
  const [walking, setWalking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [unlockedCells, setUnlockedCells] = useState<string[]>([]);
  const [walkStartedAt, setWalkStartedAt] = useState<number | null>(null);
  const [walkNewTiles, setWalkNewTiles] = useState(0);

  useEffect(() => {
    initialiseQueue();
    setWalking(Boolean(activeWalk()));
    setWalkStartedAt(activeWalkStartedAt());
  }, []);

  useEffect(() => {
    if (!walking) return;
    const timer = setInterval(() => {
      void flushQueuedFixes()
        .then((cells) => {
          setUnlockedCells((current) => [...new Set([...current, ...cells])]);
          setWalkNewTiles((current) => current + cells.length);
        })
        .catch(console.warn);
    }, 5_000);
    return () => clearInterval(timer);
  }, [walking]);

  const value = useMemo<WalkContextValue>(() => ({
    walking,
    busy,
    unlockedCells,
    walkStartedAt,
    walkNewTiles,
    replaceUnlockedCells: setUnlockedCells,
    start: async () => {
      setBusy(true);
      try {
        await startWalk();
        setWalking(true);
        setWalkStartedAt(Date.now());
        setWalkNewTiles(0);
      } finally {
        setBusy(false);
      }
    },
    end: async () => {
      setBusy(true);
      try {
        const cells = await flushQueuedFixes();
        setUnlockedCells((current) => [...new Set([...current, ...cells])]);
        setWalkNewTiles((current) => current + cells.length);
        await endWalk();
        setWalking(false);
        setWalkStartedAt(null);
      } finally {
        setBusy(false);
      }
    },
  }), [busy, unlockedCells, walkNewTiles, walkStartedAt, walking]);

  return <WalkContext.Provider value={value}>{children}</WalkContext.Provider>;
}

export function useWalk(): WalkContextValue {
  const value = useContext(WalkContext);
  if (!value) throw new Error("useWalk must be used within WalkProvider.");
  return value;
}
