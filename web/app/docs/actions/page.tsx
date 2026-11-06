import Link from "next/link";
import { C, Callout, DocHeader, DocRows, DocSection, GuideNext, TrySaying } from "@/components/docs";
import { brand } from "@/lib/brand";
import { guideMetadata, guidePage, trySaying } from "@/lib/guide";

export const metadata = guideMetadata("actions");

const what = [
  { k: "Reminders", v: "In Reminders on a Mac, or a notification at the time on Windows and Linux." },
  { k: "Calendar events", v: "Added to your default calendar. Relative dates are read in your local time." },
  { k: "Apps", v: "Opened by name." },
  { k: "Links", v: "Opened in your default browser." },
  { k: "Browser searches", v: "Opened in your browser, so you see the results yourself." },
  { k: "Your shortcuts", v: "Run by name: Shortcuts on a Mac, a Start menu shortcut or Power Automate flow on Windows, a script on Linux." },
] as const;

export default function ActionsPage() {
  const p = guidePage("actions");
  return (
    <>
      <DocHeader eyebrow="Docs" title={p.title} intro={p.intro} />

      <TrySaying items={trySaying.actions} />

      <DocSection id="what-it-can-do" title="What it can do">
        <DocRows items={what} />
        <p>
          On a Mac, the first time, macOS asks to let {brand.name} use Calendars and Reminders. Nothing else to set up.
        </p>
      </DocSection>

      <DocSection id="undo" title="Undo">
        <p>
          After a reminder or event, the card shows <strong>Undo</strong> for a few seconds. Click it and the item is
          deleted.
        </p>
      </DocSection>

      <DocSection id="what-it-wont-do" title="What it won’t do yet">
        <p>
          Acting inside other apps, like filing a ticket in Linear, is computer use. It’s coming soon. Until then,{" "}
          {brand.name} says so and offers to show you how to do it yourself. On a private page, like your bank, it
          doesn’t act at all.
        </p>
        <Callout title="On Windows and Linux">
          Reminders are scheduled notifications, with Undo, so they need a time. If notifications are off, or Linux has no systemd user
          session, it says so and offers to add it to your calendar instead. Events open as an .ics file in your calendar
          app (or are saved to Downloads if there isn’t one), so they have no Undo. On Linux, “run my … shortcut” runs your own script from{" "}
          <C>{`~/.local/share/${brand.slug}/actions/`}</C> or opens an app of that name (see{" "}
          <Link href="/docs/linux#files-calendar-actions" className="text-foreground underline underline-offset-4">
            Linux setup
          </Link>
          ).
        </Callout>
      </DocSection>

      <GuideNext slug="actions" />
    </>
  );
}
