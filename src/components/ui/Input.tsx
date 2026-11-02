import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  variant?: "default" | "compact";
}

export const Input: React.FC<InputProps> = ({
  className = "",
  variant = "default",
  disabled,
  ...props
}) => {
  const baseClasses =
    "px-3 py-1 text-ui bg-glass-strong border-[0.5px] border-glass-edge shadow-card rounded-control text-start transition-all duration-150 placeholder:text-ink-3";

  const interactiveClasses = disabled
    ? "opacity-60 cursor-not-allowed bg-wash border-line"
    : "hover:border-line-strong focus:outline-none focus:border-ink-3 focus:ring-4 focus:ring-logo-primary/[0.07]";

  const variantClasses = {
    default: "px-3 py-2",
    compact: "px-2 py-1",
  } as const;

  return (
    <input
      className={`${baseClasses} ${variantClasses[variant]} ${interactiveClasses} ${className}`}
      disabled={disabled}
      {...props}
    />
  );
};
