"use client";

import { useEffect, useRef, useState } from "react";

type Opts = {
  questionStartedAtIso: string | null;
  serverAnchorIso: string;
  timeLimitSecs: number;
  onExpire?: () => void;
};

/** Counts down locally after anchor; re-initializes when anchor/question changes. */
export function useServerAnchoredTimer(opts: Opts) {
  const onExpire = useRef(opts.onExpire);
  onExpire.current = opts.onExpire;
  /** Avoid firing onExpire on every effect re-run when the round is already over. */
  const expiredKeyRef = useRef<string | null>(null);

  const [remainingMs, setRemainingMs] = useState(() => {
    if (!opts.questionStartedAtIso) return opts.timeLimitSecs * 1000;
    const elapsed =
      Date.parse(opts.serverAnchorIso) - Date.parse(opts.questionStartedAtIso);
    if (!Number.isFinite(elapsed)) return opts.timeLimitSecs * 1000;
    return Math.max(0, opts.timeLimitSecs * 1000 - elapsed);
  });

  const startedAt = opts.questionStartedAtIso;
  const anchorDep = startedAt ? opts.serverAnchorIso : "";

  useEffect(() => {
    const roundKey = startedAt
      ? `${startedAt}|${opts.timeLimitSecs}`
      : "";

    let rem0: number;
    if (!startedAt) {
      rem0 = opts.timeLimitSecs * 1000;
    } else {
      const elapsed = Date.parse(anchorDep) - Date.parse(startedAt);
      rem0 = Number.isFinite(elapsed)
        ? Math.max(0, opts.timeLimitSecs * 1000 - elapsed)
        : opts.timeLimitSecs * 1000;
    }
    setRemainingMs(rem0);
    if (rem0 <= 0) {
      if (startedAt && expiredKeyRef.current !== roundKey) {
        expiredKeyRef.current = roundKey;
        onExpire.current?.();
      }
      return;
    }
    expiredKeyRef.current = null;

    let frame = 0;
    const t0 = performance.now();
    const tick = () => {
      const next = Math.max(0, rem0 - (performance.now() - t0));
      setRemainingMs(next);
      if (next <= 0) {
        if (expiredKeyRef.current !== roundKey) {
          expiredKeyRef.current = roundKey;
          onExpire.current?.();
        }
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [startedAt, anchorDep, opts.timeLimitSecs]);

  return remainingMs;
}
