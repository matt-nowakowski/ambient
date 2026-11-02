// Rehearsal contact sheet: a grid of frames from public/rehearse/preview.mp4.
import React from "react";
import { AbsoluteFill, OffthreadVideo, staticFile } from "remotion";

export type SheetProps = { from: number; step: number; cols: number; rows: number; tall?: boolean };

export const Sheet: React.FC<SheetProps> = ({ from, step, cols, rows, tall }) => {
  const w = 1920 / cols;
  const h = tall ? (w * 16) / 9 : (w * 9) / 16;
  return (
    <AbsoluteFill style={{ background: "#222" }}>
      {Array.from({ length: cols * rows }).map((_, i) => {
        const f = from + i * step;
        return (
          <div key={i} style={{ position: "absolute", left: (i % cols) * w, top: Math.floor(i / cols) * (h + 26), width: w - 4, height: h + 22 }}>
            <OffthreadVideo src={staticFile("rehearse/preview.mp4")} startFrom={f} muted style={{ width: w - 4, height: h }} />
            <div style={{ color: "#fff", font: "16px Geist, sans-serif", padding: "2px 6px" }}>
              {(f / 30).toFixed(2)}s · f{f}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
