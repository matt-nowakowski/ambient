import React, { useState, useEffect } from "react";
import { getVersion } from "@tauri-apps/api/app";

import ModelSelector from "../model-selector";
import UpdateChecker from "../update-checker";
import TranscriptionStatus from "./TranscriptionStatus";

interface FooterProps {
  onShowHistory: () => void;
}

const Footer: React.FC<FooterProps> = ({ onShowHistory }) => {
  const [version, setVersion] = useState("");

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const appVersion = await getVersion();
        setVersion(appVersion);
      } catch (error) {
        console.error("Failed to get app version:", error);
        setVersion("0.1.2");
      }
    };

    fetchVersion();
  }, []);

  return (
    <div className="relative z-10 w-full border-t-[0.5px] border-glass-edge pt-2">
      <div className="flex justify-between items-center text-meta px-4 pb-2 text-ink-3">
        <div className="flex items-center gap-4">
          <ModelSelector />
          <TranscriptionStatus onShowHistory={onShowHistory} />
        </div>

        {/* Update Status */}
        <div className="flex items-center gap-1">
          <UpdateChecker />
          <span>•</span>
          {/* eslint-disable-next-line i18next/no-literal-string */}
          <span>v{version}</span>
        </div>
      </div>
    </div>
  );
};

export default Footer;
