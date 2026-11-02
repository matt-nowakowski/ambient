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
        <p>Every kind can be turned on or off in {brand.name} → Privacy → Suggestions you get, including the apps you muted.</p>
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
          Turn on <strong>Offer suggestions</strong> in {brand.name} → Privacy. It is decided on your Mac from the
          window’s text. No model is called and nothing is sent until you accept. Mac only for now.
        </p>
      </DocSection>

      <GuideNext slug="suggestions" />
    </>
  );
}
