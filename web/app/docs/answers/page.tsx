import Link from "next/link";
import { Callout, DocHeader, DocSection, GuideNext, TrySaying } from "@/components/docs";
import { brand } from "@/lib/brand";
import { guideMetadata, guidePage, trySaying } from "@/lib/guide";

export const metadata = guideMetadata("answers");

const link = "text-foreground underline underline-offset-4";

export default function AnswersPage() {
  const p = guidePage("answers");
  return (
    <>
      <DocHeader eyebrow="Docs" title={p.title} intro={p.intro} />

      <TrySaying items={trySaying.answers} />

      <DocSection id="about-your-screen" title="About your screen">
        <p>
          “Summarise this”, “translate this” and “what does this error mean” use the text of the window in front of you.
          Turn on <strong>Read what you ask about</strong> in {brand.name} → Privacy first.
        </p>
        <p>Only the text needed to answer is sent, with secrets removed. It reads text, never screenshots.</p>
      </DocSection>

      <DocSection id="web-search" title="Web search">
        <p>It searches only for current or specific facts: news, prices, rates, schedules, businesses.</p>
        <p>Only your question is sent to the search. Turn on Keep everything on this Mac to switch web search off.</p>
      </DocSection>

      <DocSection id="using-the-answer" title="Using the answer">
        <p>
          Insert pastes it where your cursor was. Copy puts it on the clipboard. Esc closes the card. Hold your shortcut
          within 90 seconds to follow up. More in{" "}
          <Link href="/docs/getting-started#the-answer-card" className={link}>
            the answer card
          </Link>
          .
        </p>
        <Callout title="In ChatGPT, Claude and other AI apps">
          Your words are typed as your prompt. Start with “Hey {brand.name}”, or use the Ask shortcut, to get an answer
          from {brand.name} instead.
        </Callout>
      </DocSection>

      <GuideNext slug="answers" />
    </>
  );
}
