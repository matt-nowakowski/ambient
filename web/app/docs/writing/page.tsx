import Link from "next/link";
import { Callout, DocHeader, DocRows, DocSection, GuideNext, TrySaying } from "@/components/docs";
import { brand } from "@/lib/brand";
import { guideMetadata, guidePage, trySaying, writingOutcomes, writingSettings, writingYours } from "@/lib/guide";

export const metadata = guideMetadata("writing");

const link = "text-foreground underline underline-offset-4";

export default function WritingPage() {
  const p = guidePage("writing");
  return (
    <>
      <DocHeader eyebrow="Docs" title={p.title} intro={p.intro} />

      <TrySaying items={trySaying.writing} />

      <DocSection id="what-it-does" title="What it does">
        <p>
          It judges from what’s on screen, not a list of apps: a reply under a message drafts in Messages, Slack and Mail
          alike, and goes to the sender, not to you. When it isn’t sure, it types what you said.
        </p>
        <p>
          Dictate right after text you’ve typed and it adds the space and capital you’d expect, in any app. In code
          editors and terminals it leaves case alone.
        </p>
        <DocRows items={writingOutcomes} />
      </DocSection>

      <DocSection id="make-it-yours" title="Make it yours">
        <DocRows items={writingYours} />
      </DocSection>

      <DocSection id="take-it-back" title="Take it back">
        <p>
          Click <strong>Use my words</strong> on the chip, or say “use my words”, “undo that” or “just what I said”.
          After a rewrite, <strong>Undo rewrite</strong> puts your original text back.
        </p>
        <p>
          It learns per app: take its writing back in Slack and it rewrites less in Slack. See and undo what it learned in{" "}
          {brand.name} → Privacy → Writing → <strong>What you’ve told me</strong>.
        </p>
      </DocSection>

      <DocSection id="setting" title="The Writing setting">
        <p>In {brand.name} → Account → Writing.</p>
        <DocRows items={writingSettings} />
        <Callout title="Polished needs AI polish">
          AI polish is off for new installs, so your words appear the moment you stop. Turn it on in setup or in Account.
          Writing for you works either way. Only text it actually polishes or writes counts as an AI use (unlimited on Pro, {brand.freePolishPerWeek} a week on Free); deciding how to write
          never does. When they run out, it types what you said. See{" "}
          <Link href="/pricing" className={link}>
            plans
          </Link>
          .
        </Callout>
      </DocSection>

      <GuideNext slug="writing" />
    </>
  );
}
