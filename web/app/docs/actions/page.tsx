import { Callout, DocHeader, DocRows, DocSection, GuideNext, TrySaying } from "@/components/docs";
import { brand } from "@/lib/brand";
import { guideMetadata, guidePage, trySaying } from "@/lib/guide";

export const metadata = guideMetadata("actions");

const what = [
  { k: "Reminders", v: "Added to your Mac’s Reminders, with a due time if you give one." },
  { k: "Calendar events", v: "Added to your default calendar. Relative dates are read in your local time." },
  { k: "Apps", v: "Opened by name." },
  { k: "Links", v: "Opened in your default browser." },
  { k: "Browser searches", v: "Opened in your browser, so you see the results yourself." },
  { k: "Your Shortcuts", v: "Run by name from the Shortcuts app." },
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
          The first time, macOS asks to let {brand.name} use Calendars and Reminders. Nothing else to set up.
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
          {brand.name} says so and does nothing.
        </p>
        <Callout title="On Windows and Linux">
          Apps, links and browser searches work. Reminders and events open as an .ics file in your calendar app, so
          there is no Undo. Shortcuts are Mac only.
        </Callout>
      </DocSection>

      <GuideNext slug="actions" />
    </>
  );
}
