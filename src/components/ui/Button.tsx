import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "primary"
    | "primary-soft"
    | "secondary"
    | "outline"
    | "warning"
    | "danger"
    | "danger-ghost"
    | "ghost";
  size?: "sm" | "md" | "lg";
}

export const Button: React.FC<ButtonProps> = ({
  children,
  className = "",
  variant = "primary",
  size = "md",
  ...props
}) => {
  const baseClasses =
    "inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium rounded-full border transition-[background-color,border-color,color,opacity,transform,box-shadow] duration-200 ease-[var(--ease-out-soft)] active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-logo-primary/25 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 cursor-pointer select-none";

  const variantClasses = {
    primary:
      "text-on-primary bg-background-ui border-transparent shadow-[0_1px_2px_rgba(0,0,0,0.14),inset_0_0.5px_0_rgba(255,255,255,0.18)] hover:opacity-85",
    "primary-soft":
      "text-text bg-glass-press border-transparent hover:bg-glass-hover",
    secondary:
      "text-text bg-glass-strong border-glass-edge shadow-card hover:bg-glass",
    // For screens where secondary's glass fill reads as disabled (onboarding)
    outline:
      "text-text bg-transparent border-line-strong hover:bg-glass-hover hover:border-ink-3",
    // Secondary's neutral resting look, but hover/focus use the semantic
    // --color-warning token (theme.css) instead of the primary accent — for
    // buttons sitting on warning surfaces like SecureInputWarning
    warning:
      "text-text bg-glass-strong border-glass-edge hover:bg-warning-wash hover:border-warning focus-visible:ring-warning/40",
    danger:
      "text-white bg-error border-transparent hover:opacity-85 focus-visible:ring-error/40",
    "danger-ghost":
      "text-error border-transparent hover:bg-error-wash focus:bg-error-wash",
    ghost: "text-current border-transparent hover:bg-glass-hover",
  };

  const sizeClasses = {
    sm: "h-control-sm px-3 text-small",
    md: "h-control px-4 text-ui",
    lg: "h-control-lg px-5 text-cta",
  };

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
