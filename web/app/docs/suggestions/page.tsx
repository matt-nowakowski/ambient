import Link from "next/link";
import { DocHeader, DocRows, DocSection, GuideNext, TrySaying } from "@/components/docs";
import { brand } from "@/lib/brand";
import { guideMetadata, guidePage, suggestionMoments, trySaying } from "@/lib/guide";

export const metadata = guideMetadata("suggestions");

export default function SuggestionsPage() {
  const p = guidePage("suggestions");
  return (
    <>
      <DocHeader eyebrow="Docs" title={p.title} intro={p.intro} />

      <TrySaying title="When one appears, try saying" items={trySaying.suggestions} />

      <DocSection id="every-moment" title="Every moment it offers something">
        <DocRows items={suggestionMoments} />
      </DocSection>

      <DocSection id="answering" title="Answering">
        <p>
          A suggestion is one line in the corner. Press <strong>Enter</strong> to accept or <strong>Esc</strong> to
          dismiss, or just say it. It never takes focus and fades after a few seconds.
        </p>
        <p>
          What you turn down shows in {brand.name} → Privacy → Suggestions you get → <strong>What you’ve told me</strong>,
          with Undo.
        </p>
      </DocSection>

      <DocSection id="quiet-by-design" title="Quiet by design">
        <ul>
          <li>At most 3 an hour by default.</li>
          <li>The same window doesn’t get the same offer twice in an hour.</li>
          <li>Dismiss a kind and it backs off.</li>
          <li>Pause everything for an hour, or until tomorrow, from Privacy.</li>
        </ul>
      </DocSection>

      <DocSection id="turn-it-on" title="Turn it on">
        <p>
          Off until you turn it on: in setup (“It offers help, too”), or with <strong>Offer suggestions</strong> in{" "}
          {brand.name} → Privacy. It works on macOS, Windows and Linux (on Linux, turn{" "}
          <Link href="/docs/linux#accessibility" className="text-foreground underline underline-offset-4">
            accessibility on
          </Link>
          ).
        </p>
        <p>
          It decides on your computer from the window’s text, and nothing is sent until you accept. On Pro you can choose
          to have the cloud decide instead. Free gets up to {brand.freeSuggestionsPerWeek} suggestions a week.
        </p>
      </DocSection>

      <GuideNext slug="suggestions" />
    </>
  );
}
