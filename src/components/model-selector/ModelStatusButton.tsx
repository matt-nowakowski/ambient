import React from "react";
import { Orb, type OrbVariant } from "../orb/Orb";
import { Shimmer } from "../ui/Transitions";

type ModelStatus =
  | "ready"
  | "loading"
  | "downloading"
  | "verifying"
  | "error"
  | "unloaded"
  | "none";

interface ModelStatusButtonProps {
  status: ModelStatus;
  displayText: string;
  isDropdownOpen: boolean;
  /** Ready, and transcribing in the background. */
  busy?: boolean;
  onClick: () => void;
  className?: string;
}

const ModelStatusButton: React.FC<ModelStatusButtonProps> = ({
  status,
  displayText,
  isDropdownOpen,
  busy = false,
  onClick,
  className = "",
}) => {
  // Live states show an AICSS orb instead of the dot: Loading (C1) while the
  // model loads, Streaming (C3) while it downloads, Analyzing (C4) while it's
  // verified, Thinking (S1) while a file is transcribed in the background.
  const orb: OrbVariant | null =
    status === "loading"
      ? "C1"
      : status === "downloading"
        ? "C3"
        : status === "verifying"
          ? "C4"
          : status === "ready" && busy
            ? "S1"
            : null;

  const getStatusColor = (status: ModelStatus): string => {
    switch (status) {
      case "ready":
        return "bg-moss";
      case "error":
        return "bg-error";
      case "unloaded":
        return "bg-ink-3";
      case "none":
        return "bg-error";
      default:
        return "bg-ink-3";
    }
  };

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 hover:text-text transition-colors ${className}`}
      title={`Model status: ${displayText}`}
    >
      {orb ? (
        <Orb
          variant={orb}
          size={14}
          label={displayText}
          style={{ "--orb-fg": "currentColor" } as React.CSSProperties}
        />
      ) : (
        <div className={`w-2 h-2 rounded-full ${getStatusColor(status)}`} />
      )}
      <span className="max-w-28 truncate">
        {/* Shimmer on in-progress labels (transitions.dev "Shimmer text"). */}
        <Shimmer
          text={displayText}
          active={orb !== null}
          className="max-w-full truncate align-bottom"
        />
      </span>
      <svg
        className={`w-3 h-3 transition-transform ${isDropdownOpen ? "rotate-180" : ""}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 9l-7 7-7-7"
        />
      </svg>
    </button>
  );
};

export default ModelStatusButton;
