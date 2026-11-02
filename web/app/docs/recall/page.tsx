import Link from "next/link";
import { Callout, DocHeader, DocRows, DocSection, GuideNext, TrySaying } from "@/components/docs";
import { brand } from "@/lib/brand";
import { guideMetadata, guidePage, trySaying } from "@/lib/guide";

export const metadata = guideMetadata("recall");

const where = [
  { k: "Your dictations", v: "Everything you’ve said to it, kept on your computer." },
  { k: "Your meetings", v: "Notes and transcripts from calls you noted." },
  { k: "Open windows", v: "The text of every window you have open, read when you ask." },
  { k: "The last two minutes", v: "What was on screen a moment ago. In memory only, never saved." },
  { k: "Screen memory", v: "What you’ve seen, saved as text and encrypted on your Mac. Kept 7 days by default." },
  { k: "Spotlight", v: "Your files, Mail messages and notes, through the Mac’s own index." },
  { k: "Drive and Gmail", v: "One-click searches in the browser you’re already signed in to." },
] as const;

export default function RecallPage() {
  const p = guidePage("recall");
  return (
    <>
      <DocHeader eyebrow="Docs" title={p.title} intro={p.intro} />

      <TrySaying items={trySaying.recall} />

      <DocSection id="where-it-looks" title="Where it looks">
        <DocRows items={where} />
        <Callout title="Nothing to connect">
          It never asks for your Google or Microsoft login. Drive and Gmail open in your own browser.
        </Callout>
      </DocSection>

      <DocSection id="turn-it-on" title="Turn it on">
        <p>
          Your dictations work straight away. For open windows and the last two minutes, turn on{" "}
          <strong>Read what you ask about</strong>. For screen memory, turn on{" "}
          <strong>Remember what you’ve seen</strong>. Both are in {brand.name} → Privacy.
        </p>
        <p>
          Screen memory never leaves your Mac. Delete it any time.{" "}
          <Link href="/docs/privacy" className="text-foreground underline underline-offset-4">
            Privacy controls
          </Link>
        </p>
      </DocSection>

      <GuideNext slug="recall" />
    </>
  );
}
