import { useSyncExternalStore } from "react";

const KEY = "jelo-cloud-progress";
const EMPTY: number[] = [];
let current = EMPTY;
let storageSnapshot: string | null | undefined;
const listeners = new Set<() => void>();

export function parseProgress(raw: string | null): number[] {
  try {
    const data: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(data)) return EMPTY;
    return [
      ...new Set(
        data.filter(
          (day): day is number =>
            typeof day === "number" && Number.isInteger(day) && day >= 1 && day <= 100,
        ),
      ),
    ].sort((a, b) => a - b);
  } catch {
    return EMPTY;
  }
}

function getSnapshot() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw !== storageSnapshot) {
      current = parseProgress(raw);
      storageSnapshot = raw;
    }
  } catch {
    // Keep the in-memory progress if storage is unavailable.
  }
  return current;
}

function onStorage(event: StorageEvent) {
  if (event.key === KEY || event.key === null) listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

function complete(day: number) {
  const done = getSnapshot();
  if (done.includes(day)) return;
  current = [...done, day].sort((a, b) => a - b);
  try {
    const raw = JSON.stringify(current);
    window.localStorage.setItem(KEY, raw);
    storageSnapshot = raw;
  } catch {
    // Other views in the current tab can still read the result.
  }
  listeners.forEach((listener) => listener());
}

export function useProgress() {
  return { done: useSyncExternalStore(subscribe, getSnapshot, () => EMPTY), complete };
}
