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
        <p>It looks again when something new appears in a window: a new message, a new error.</p>
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
          <li>At most 10 an hour, and fewer each time you dismiss one.</li>
          <li>The same window never gets the same offer twice.</li>
          <li>Dismiss a kind twice and it rests for a day.</li>
          <li>Pause everything for an hour, or until tomorrow, from Privacy.</li>
        </ul>
      </DocSection>

      <DocSection id="turn-it-on" title="On or off">
        <p>
          On from the start. Turn it off in the tour after setup (“It offers help, too”), or with{" "}
          <strong>Offer suggestions</strong> in {brand.name} → Privacy. It works on macOS, Windows and Linux (on Linux, turn{" "}
          <Link href="/docs/linux#accessibility" className="text-foreground underline underline-offset-4">
            accessibility on
          </Link>
          ).
        </p>
        <p>
          It decides on your computer from the window’s text. With{" "}
          <Link href="/docs/privacy#on-device-ai" className="text-foreground underline underline-offset-4">
            on-device AI
          </Link>{" "}
          it judges better; without it, simple rules. On Pro, with Intelligence on Cloud, or after you say yes to the
          one-time offer on Automatic, the cloud decides instead, from a redacted snippet of the window. Each check is
          listed in Privacy. With No AI, simple rules only. Free gets up to {brand.freeSuggestionsPerWeek} suggestions a week.
        </p>
      </DocSection>

      <GuideNext slug="suggestions" />
    </>
  );
}
