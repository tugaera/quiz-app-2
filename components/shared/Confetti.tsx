"use client";

import { useEffect } from "react";
import confetti from "canvas-confetti";

export default function Confetti() {
  useEffect(() => {
    const end = Date.now() + 1200;
    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        disableForReducedMotion: true,
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        disableForReducedMotion: true,
      });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
  }, []);
  return null;
}
