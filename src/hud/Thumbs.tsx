import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { commands } from "@/bindings";
import "./extras.css";

/** 👍/👎 on an answer or suggestion card. Rust counts it (when usage
 * counts are on); 👎 also opens "What went wrong?" in the main window. */
export function Thumbs({ id, token }: { id: string; token?: string }) {
  const { t } = useTranslation();
  // The rating belongs to the card it was given for, and the id cannot say
  // which card that was: a new suggestion in the same window reuses the id,
  // because a stable key is exactly what stops the same offer repeating. So the
  // old highlight — and the disabled buttons that came with it — carried over
  // onto the next suggestion. The card's own words can tell them apart, so the
  // caller passes them as a token, and the comparison happens during render.
  const key = JSON.stringify(token === undefined ? id : [id, token]);
  const [rated, setRated] = useState<{ key: string; up: boolean } | null>(null);
  const mine = rated && rated.key === key ? rated : null;
  const rate = (up: boolean) => {
    if (mine) return;
    setRated({ key, up });
    commands.hudAction(id, up ? "rate_up" : "rate_down", null);
  };
  return (
    <span className="hud-thumbs">
      <button
        type="button"
        aria-label={t("hud.rate.up")}
        title={t("hud.rate.up")}
        aria-pressed={mine?.up === true}
        disabled={mine !== null}
        onClick={() => rate(true)}
      >
        <ThumbsUp width={13} height={13} />
      </button>
      <button
        type="button"
        aria-label={t("hud.rate.down")}
        title={t("hud.rate.down")}
        aria-pressed={mine?.up === false}
        disabled={mine !== null}
        onClick={() => rate(false)}
      >
        <ThumbsDown width={13} height={13} />
      </button>
    </span>
  );
}
