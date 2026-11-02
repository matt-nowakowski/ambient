import Link from "next/link";
import { Callout, DocHeader, DocRows, DocSection, GuideNext } from "@/components/docs";
import { Kbd } from "@/components/ui";
import { brand } from "@/lib/brand";
import {
  guideMetadata,
  guidePage,
  guidePages,
  greetingsNote,
  guideShortcuts,
  handsFree,
  nothingToConnect,
  platformNote,
  routingRules,
  talkingWays,
} from "@/lib/guide";

export const metadata = guideMetadata("getting-started");

const link = "text-foreground underline underline-offset-4";

const examples: Record<string, string> = {
  answers: "“What’s the weather in Lisbon tomorrow?”",
  actions: "“Remind me at 5 to call Sam.”",
  recall: "“What did I say about pricing yesterday?”",
  meetings: "Live notes, nudges and a follow-up email.",
  suggestions: "One next step, at the right moment.",
  privacy: "What it reads, keeps and sends.",
};

export default function GettingStartedPage() {
  const p = guidePage("getting-started");
  return (
    <>
      <DocHeader eyebrow="Docs" title={p.title} intro={p.intro} />

      <DocSection id="talking-to-ambient" title={`Talking to ${brand.name}`}>
        <p>Three ways. Without one of them, the dictation key types.</p>
        <DocRows items={talkingWays} />
        <p>{greetingsNote}</p>
        <p>
          <strong>Hands-free.</strong> Turn it on in {brand.name} → Privacy.
        </p>
        <DocRows items={handsFree} />
      </DocSection>

      <DocSection id="two-shortcuts" title="Two shortcuts">
        <p>Hold to talk. Let go when you’re done.</p>
        <dl>
          <div className="grid gap-2 border-t border-border py-4 sm:grid-cols-[150px_1fr] sm:gap-6">
            <dt className="text-foreground">Dictation key</dt>
            <dd className="space-y-2">
              <p>
                <Kbd>{guideShortcuts.dictate.mac}</Kbd> on Mac, <Kbd>{guideShortcuts.dictate.other}</Kbd> on Windows
                and Linux.
              </p>
              <p>Types what you say. If what you say is a request, the agent handles it.</p>
            </dd>
          </div>
          <div className="grid gap-2 border-t border-border py-4 sm:grid-cols-[150px_1fr] sm:gap-6">
            <dt className="text-foreground">Ask shortcut</dt>
            <dd className="space-y-2">
              <p>
                <Kbd>{guideShortcuts.ask.mac}</Kbd> on Mac, <Kbd>{guideShortcuts.ask.other}</Kbd> on Windows and
                Linux.
              </p>
              <p>Always talks to the agent. Never types.</p>
            </dd>
          </div>
        </dl>
        <p>
          Change either in {brand.name} → Settings. To make the dictation key only ever type, turn off{" "}
          <strong>Understand requests while dictating</strong>.
        </p>
      </DocSection>

      <DocSection id="how-it-decides" title="How it decides">
        <p>From what you say, and the app you’re in.</p>
        <DocRows items={routingRules} />
        <Callout title="“Typed it. Search this instead?”">
          If it typed something that sounded like a question, this chip appears for a few seconds. Press Enter or click
          Search to get an answer instead.
        </Callout>
      </DocSection>

      <DocSection id="the-answer-card" title="The answer card">
        <p>Answers appear in a glass card near the top right. It never takes focus.</p>
        <ul>
          <li>
            <strong>Insert</strong> pastes the answer where your cursor was.
          </li>
          <li>
            <strong>Copy</strong> puts it on the clipboard.
          </li>
          <li>
            <strong>Sources</strong> link to the pages and files it used.
          </li>
          <li>
            <strong>Esc</strong> closes it. Nothing is saved.
          </li>
          <li>
            <strong>Follow up</strong> within 90 seconds: hold your shortcut and say “make it shorter” or “now in
            Spanish”.
          </li>
        </ul>
      </DocSection>

      <DocSection id="what-to-say" title="What you can say">
        <dl>
          {guidePages
            .filter((g) => g.slug !== "getting-started")
            .map((g) => (
              <div key={g.slug} className="grid gap-1 border-t border-border py-3.5 sm:grid-cols-[150px_1fr] sm:gap-6">
                <dt>
                  <Link href={g.path} className={link}>
                    {g.nav}
                  </Link>
                </dt>
                <dd className="text-[13.5px]">{examples[g.slug]}</dd>
              </div>
            ))}
        </dl>
      </DocSection>

      <DocSection id="nothing-to-connect" title="Nothing to connect">
        <p className="text-[17px] font-light leading-snug tracking-[-0.01em] text-foreground">{nothingToConnect.lead}</p>
        <p>{nothingToConnect.body}</p>
        <DocRows items={nothingToConnect.sources} />
        <p>No OAuth. No API keys. The only account is the email you sign in with for Pro.</p>
      </DocSection>

      <DocSection id="turn-on-what-you-want" title="Turn on what you want">
        <p>
          Dictation and questions work straight away. Anything that reads your screen is off until you switch it on in{" "}
          {brand.name} → Privacy. See{" "}
          <Link href="/docs/privacy" className={link}>
            Privacy controls
          </Link>
          .
        </p>
      </DocSection>

      <DocSection id="where-it-works" title="Where it works">
        <p>{platformNote}</p>
        <p>
          The agent is part of Pro. Every install gets {brand.trialDays} days of everything, then Free includes{" "}
          {brand.freePolishPerWeek} AI uses a week.
        </p>
      </DocSection>

      <GuideNext slug="getting-started" />
    </>
  );
}
