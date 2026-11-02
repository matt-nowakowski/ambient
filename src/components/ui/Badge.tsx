import React from "react";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  className?: string;
}

const Badge: React.FC<BadgeProps> = ({
  children,
  variant = "primary",
  className = "",
}) => {
  const variantClasses = {
    primary: "bg-logo-primary",
    secondary: "bg-line text-ink-2",
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-meta font-medium ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
};

export default Badge;
