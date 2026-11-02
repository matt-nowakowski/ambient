import React from "react";

interface SettingsGroupProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
}

export const SettingsGroup: React.FC<SettingsGroupProps> = ({
  title,
  description,
  children,
}) => {
  return (
    <div data-search-row className="space-y-label">
      {title && (
        <div className="px-row-x">
          <h2 className="text-section font-medium text-ink-3">{title}</h2>
          {description && (
            <p className="text-meta text-ink-3 mt-1">{description}</p>
          )}
        </div>
      )}
      <div className="glass rounded-panel overflow-visible">
        <div className="divide-y divide-glass-edge">{children}</div>
      </div>
    </div>
  );
};
