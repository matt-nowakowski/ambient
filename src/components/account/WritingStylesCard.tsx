import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { AppWindow, Globe, Plus, X } from "lucide-react";
import { toast } from "sonner";
import {
  commands,
  type AppStyle,
  type StylePlace,
  type WritingStyle,
} from "@/bindings";
import { useSettings } from "../../hooks/useSettings";
import { Button } from "../ui/Button";
import { InfoTooltip } from "../ui/InfoTooltip";
import { Dropdown } from "../ui/Dropdown";
import { Input } from "../ui/Input";

const STYLES: WritingStyle[] = ["casual", "polished", "as_said"];

/** What was typed, as a website host or an app name. A bundle id
 * ("com.tinyspeck.slackmacgap") or "slack.exe" is an app. */
export const parsePlace = (raw: string): StylePlace | null => {
  const text = raw.trim();
  if (!text) return null;
  const host = text
    .replace(/^[a-z]+:\/\//i, "")
    .split(/[/?#]/)[0]
    .replace(/^www\./i, "")
    .toLowerCase();
  const reverseDns = /^(com|org|net|io|dev|app|co)\./.test(host);
  const program = /\.(exe|app|desktop)$/.test(host);
  if (
    /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) &&
    !reverseDns &&
    !program &&
    !/\s/.test(text)
  ) {
    return { target: host, label: host, site: true };
  }
  return { target: text, label: text, site: false };
};

/** Writing styles per app and website: an explicit preference smart
 * writing follows there (a site beats its browser, which beats the
 * Writing setting). Recent apps and sites are suggested when adding. */
export const WritingStylesCard: React.FC = () => {
  const { t } = useTranslation();
  const { getSetting, updateSetting, isUpdating } = useSettings();
  const styles = getSetting("app_styles") ?? [];
  const [adding, setAdding] = useState(false);
  const [typed, setTyped] = useState("");
  const [recent, setRecent] = useState<StylePlace[]>([]);
  const busy = isUpdating("app_styles");

  const save = (next: AppStyle[]) => updateSetting("app_styles", next);

  const open = async () => {
    setAdding(true);
    try {
      setRecent(await commands.recentStylePlaces());
    } catch {
      setRecent([]);
    }
  };

  const add = (place: StylePlace | null) => {
    if (!place) return;
    const exists = styles.some(
      (s) =>
        s.site === place.site &&
        s.target.toLowerCase() === place.target.toLowerCase(),
    );
    if (exists) {
      toast.error(t("account.styles.duplicate", { name: place.label }));
      return;
    }
    save([...styles, { ...place, style: "casual" }]);
    setTyped("");
    setAdding(false);
  };

  const options = STYLES.map((s) => ({
    value: s,
    label: t(`account.styles.options.${s}`),
    description: t(`account.styles.hints.${s}`),
  }));

  return (
    <section className="glass rounded-panel p-card">
      <div className="flex items-center gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-card bg-glass-press">
          <AppWindow width={15} height={15} strokeWidth={1.75} />
        </span>
        <h2 className="flex min-w-0 flex-1 items-center gap-1.5 text-ui font-medium">
          {t("account.styles.title")}
          <InfoTooltip
            text={
              <>
                {t("account.styles.description")} {t("account.styles.empty")}
              </>
            }
          />
        </h2>
      </div>

      {styles.length > 0 ? (
        <ul className="mt-4 divide-y divide-glass-edge border-t-[0.5px] border-glass-edge">
          {styles.map((s, i) => {
            const Icon = s.site ? Globe : AppWindow;
            return (
              <li
                key={`${s.site ? "site" : "app"}-${s.target}`}
                className="flex items-center gap-3 py-row-y"
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-glass-press text-text">
                  <Icon width={14} height={14} strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1 truncate text-ui">
                  {s.label}
                </span>
                <Dropdown
                  className="w-36 shrink-0"
                  options={options}
                  selectedValue={s.style}
                  disabled={busy}
                  onSelect={(v) =>
                    save(
                      styles.map((x, j) =>
                        j === i ? { ...x, style: v as WritingStyle } : x,
                      ),
                    )
                  }
                />
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  aria-label={t("account.styles.remove", { name: s.label })}
                  onClick={() => save(styles.filter((_, j) => j !== i))}
                >
                  <X width={13} height={13} strokeWidth={1.75} />
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {adding ? (
        <div className="mt-3 space-y-2">
          {recent.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-meta text-ink-3">
                {t("account.styles.recent")}
              </span>
              {recent.map((p) => (
                <Button
                  key={`${p.site ? "site" : "app"}-${p.target}`}
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  className="inline-flex items-center gap-1"
                  onClick={() => add(p)}
                >
                  {p.site ? (
                    <Globe width={11} height={11} strokeWidth={1.75} />
                  ) : (
                    <AppWindow width={11} height={11} strokeWidth={1.75} />
                  )}
                  <span>{p.label}</span>
                </Button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Input
              type="text"
              variant="compact"
              className="max-w-56"
              autoFocus
              value={typed}
              placeholder={t("account.styles.placeholder")}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add(parsePlace(typed));
                }
                if (e.key === "Escape") setAdding(false);
              }}
            />
            <Button
              variant="primary"
              size="md"
              disabled={!typed.trim() || busy}
              onClick={() => add(parsePlace(typed))}
            >
              {t("account.styles.addButton")}
            </Button>
            <Button variant="ghost" size="md" onClick={() => setAdding(false)}>
              {t("account.styles.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 inline-flex items-center gap-1"
          disabled={busy}
          onClick={open}
        >
          <Plus width={13} height={13} strokeWidth={1.75} />
          {t("account.styles.add")}
        </Button>
      )}
    </section>
  );
};
