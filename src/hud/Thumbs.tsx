import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { commands } from "@/bindings";
import "./extras.css";

/** 👍/👎 on an answer or suggestion card. Rust counts it (when usage
 * counts are on); 👎 also opens "What went wrong?" in the main window. */
export function Thumbs({ id }: { id: string }) {
  const { t } = useTranslation();
  const [rated, setRated] = useState<"up" | "down" | null>(null);
  useEffect(() => setRated(null), [id]);
  const rate = (up: boolean) => {
    if (rated) return;
    setRated(up ? "up" : "down");
    commands.hudAction(id, up ? "rate_up" : "rate_down", null);
  };
  return (
    <span className="hud-thumbs">
      <button
        type="button"
        aria-label={t("hud.rate.up")}
        title={t("hud.rate.up")}
        aria-pressed={rated === "up"}
        disabled={rated !== null}
        onClick={() => rate(true)}
      >
        <ThumbsUp width={13} height={13} />
      </button>
      <button
        type="button"
        aria-label={t("hud.rate.down")}
        title={t("hud.rate.down")}
        aria-pressed={rated === "down"}
        disabled={rated !== null}
        onClick={() => rate(false)}
      >
        <ThumbsDown width={13} height={13} />
      </button>
    </span>
  );
}
