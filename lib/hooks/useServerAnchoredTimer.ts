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

  const [remainingMs, setRemainingMs] = useState(() => {
    if (!opts.questionStartedAtIso) return opts.timeLimitSecs * 1000;
    const elapsed =
      Date.parse(opts.serverAnchorIso) - Date.parse(opts.questionStartedAtIso);
    return Math.max(0, opts.timeLimitSecs * 1000 - elapsed);
  });

  useEffect(() => {
    const rem0 = !opts.questionStartedAtIso
      ? opts.timeLimitSecs * 1000
      : Math.max(
          0,
          opts.timeLimitSecs * 1000 -
            (Date.parse(opts.serverAnchorIso) -
              Date.parse(opts.questionStartedAtIso))
        );
    setRemainingMs(rem0);
    let expired = false;
    if (rem0 <= 0) {
      onExpire.current?.();
      expired = true;
    }
    if (expired) return;

    let frame = 0;
    const t0 = performance.now();
    const tick = () => {
      const next = Math.max(0, rem0 - (performance.now() - t0));
      setRemainingMs(next);
      if (next <= 0) {
        onExpire.current?.();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [
    opts.questionStartedAtIso,
    opts.serverAnchorIso,
    opts.timeLimitSecs,
  ]);

  return remainingMs;
}
