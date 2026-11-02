"use client";

import { useEffect, useState, type ReactNode } from "react";

/** transitions.dev "texts reveal": lines rise in with blur, staggered. */
export function RevealLines({ lines, className = "" }: { lines: ReactNode[]; className?: string }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <span className={`t-stagger ${shown ? "is-shown" : ""} ${className}`}>
      {lines.map((l, i) => (
        <span key={i} className={`t-stagger-line t-stagger-line--${Math.min(i + 1, 4)}`}>
          {l}
        </span>
      ))}
    </span>
  );
}

/** transitions.dev "text states swap": cycles words with a blur/slide swap. */
export function SwapWord({ words, interval = 2200 }: { words: string[]; interval?: number }) {
  const [i, setI] = useState(0);
  const [stage, setStage] = useState<"idle" | "exit" | "enter">("idle");

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let t1: ReturnType<typeof setTimeout>, t2: ReturnType<typeof setTimeout>;
    const id = setInterval(() => {
      setStage("exit");
      t1 = setTimeout(() => {
        setI((n) => (n + 1) % words.length);
        setStage("enter");
        t2 = setTimeout(() => setStage("idle"), 20);
      }, 150);
    }, interval);
    return () => {
      clearInterval(id);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [words.length, interval]);

  return (
    <span
      className={`t-text-swap ${stage === "exit" ? "is-exit" : stage === "enter" ? "is-enter-start" : ""}`}
      aria-live="off"
    >
      {words[i]}
    </span>
  );
}
