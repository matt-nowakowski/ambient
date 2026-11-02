import React from "react";

/** A shimmering placeholder block; size it with `className`. */
export const Skeleton: React.FC<{
  className?: string;
  style?: React.CSSProperties;
}> = ({ className = "", style }) => (
  <div aria-hidden="true" className={`skeleton ${className}`} style={style} />
);

/** Placeholder rows shaped like a settings list or a feed. */
export const SkeletonRows: React.FC<{ rows?: number; className?: string }> = ({
  rows = 4,
  className = "",
}) => (
  <div className={`flex flex-col gap-4 p-4 ${className}`} aria-busy="true">
    {Array.from({ length: rows }, (_, i) => (
      <div key={i} className="flex items-center gap-3">
        <Skeleton className="size-8 shrink-0 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton
            className="h-3"
            style={{ width: `${60 + ((i * 13) % 30)}%` }}
          />
        </div>
      </div>
    ))}
  </div>
);
