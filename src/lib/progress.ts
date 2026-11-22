import { useEffect, useState } from "react";
const KEY = "jelo-cloud-progress";
const read = (): number[] => { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; } };
export function useProgress() {
  const [done, setDone] = useState<number[]>([]);
  useEffect(() => { setDone(read()); }, []);
  const complete = (d: number) => { const n = Array.from(new Set([...read(), d])); localStorage.setItem(KEY, JSON.stringify(n)); setDone(n); };
  const reset = (d: number) => { const n = read().filter((x) => x !== d); localStorage.setItem(KEY, JSON.stringify(n)); setDone(n); };
  return { done, complete, reset };
}
