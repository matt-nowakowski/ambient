"use client";

import { useEffect, useState } from "react";

/** transitions.dev "toast": rises in with blur; auto-dismisses. */
export function Toast({ message, onClose, duration = 5000 }: { message: string | null; onClose: () => void; duration?: number }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(message);

  useEffect(() => {
    if (!message) {
      const id = requestAnimationFrame(() => setOpen(false));
      return () => cancelAnimationFrame(id);
    }
    const raf = requestAnimationFrame(() => {
      setText(message);
      requestAnimationFrame(() => setOpen(true));
    });
    const t = setTimeout(onClose, duration);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [message, onClose, duration]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        className={`t-toast glass-dark pointer-events-auto flex max-w-md items-center gap-3 rounded-[22px] py-2.5 pl-5 pr-2.5 text-[12.5px] font-medium ${open ? "is-open" : ""}`}
      >
        <span>{text}</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full px-2.5 py-1 text-[10.5px] text-white/50 hover:text-white"
          tabIndex={open ? 0 : -1}
        >
          Close
        </button>
      </div>
    </div>
  );
}
