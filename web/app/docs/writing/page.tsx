import Link from "next/link";
import { Callout, DocHeader, DocRows, DocSection, GuideNext, TrySaying } from "@/components/docs";
import { brand } from "@/lib/brand";
import { guideMetadata, guidePage, trySaying, writingOutcomes, writingSettings } from "@/lib/guide";

export const metadata = guideMetadata("writing");

const link = "text-foreground underline underline-offset-4";

export default function WritingPage() {
  const p = guidePage("writing");
  return (
    <>
      <DocHeader eyebrow="Docs" title={p.title} intro={p.intro} />

      <TrySaying items={trySaying.writing} />

      <DocSection id="what-it-does" title="What it does">
        <p>When it isn’t sure, it types what you said. Plain dictation never waits on a model.</p>
        <DocRows items={writingOutcomes} />
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
          AI polish is on for new installs, with a clear switch in setup and in Account. Only text it actually polishes or
          writes counts as an AI use (unlimited on Pro, {brand.freePolishPerWeek} a week on Free); deciding how to write
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
