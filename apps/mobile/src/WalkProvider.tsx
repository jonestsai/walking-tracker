import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { activeWalk, activeWalkStartedAt, initialiseQueue } from "./locationQueue";
import { endWalk, flushQueuedFixes, startWalk } from "./tracking";
import type { UnlockingStatus } from "./api";

type WalkContextValue = {
  walking: boolean;
  busy: boolean;
  unlockedCells: string[];
  walkStartedAt: number | null;
  walkNewTiles: number;
  unlockingStatus: UnlockingStatus;
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
  const [unlockingStatus, setUnlockingStatus] = useState<UnlockingStatus>("unlocking");

  useEffect(() => {
    initialiseQueue();
    setWalking(Boolean(activeWalk()));
    setWalkStartedAt(activeWalkStartedAt());
  }, []);

  useEffect(() => {
    if (!walking) return;
    const timer = setInterval(() => {
      void flushQueuedFixes()
        .then(({ awardedCells, unlockingStatus: nextStatus }) => {
          setUnlockedCells((current) => [...new Set([...current, ...awardedCells])]);
          setWalkNewTiles((current) => current + awardedCells.length);
          if (nextStatus) setUnlockingStatus(nextStatus);
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
    unlockingStatus,
    replaceUnlockedCells: setUnlockedCells,
    start: async () => {
      setBusy(true);
      try {
        await startWalk();
        setWalking(true);
        setWalkStartedAt(Date.now());
        setWalkNewTiles(0);
        setUnlockingStatus("unlocking");
      } finally {
        setBusy(false);
      }
    },
    end: async () => {
      setBusy(true);
      try {
        const { awardedCells, unlockingStatus: nextStatus } = await flushQueuedFixes();
        setUnlockedCells((current) => [...new Set([...current, ...awardedCells])]);
        setWalkNewTiles((current) => current + awardedCells.length);
        if (nextStatus) setUnlockingStatus(nextStatus);
        await endWalk();
        setWalking(false);
        setWalkStartedAt(null);
      } finally {
        setBusy(false);
      }
    },
  }), [busy, unlockedCells, unlockingStatus, walkNewTiles, walkStartedAt, walking]);

  return <WalkContext.Provider value={value}>{children}</WalkContext.Provider>;
}

export function useWalk(): WalkContextValue {
  const value = useContext(WalkContext);
  if (!value) throw new Error("useWalk must be used within WalkProvider.");
  return value;
}
