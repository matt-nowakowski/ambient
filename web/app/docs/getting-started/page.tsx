import Link from "next/link";
import { Callout, DocHeader, DocRows, DocSection, GuideNext } from "@/components/docs";
import { Kbd } from "@/components/ui";
import { brand, freeMeetingsPerMonth } from "@/lib/brand";
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
  setupSteps,
  talkingWays,
} from "@/lib/guide";

export const metadata = guideMetadata("getting-started");

const link = "text-foreground underline underline-offset-4";

const examples: Record<string, string> = {
  writing: "“Tell him I can’t make it, be polite.”",
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

      <DocSection id="setup" title="Setup">
        <p>A couple of minutes, once. Permissions is skipped on Linux, and when everything is already allowed.</p>
        <DocRows items={setupSteps} />
        <p>Then a short tour: what the agent does, that it offers help, and what it may read.</p>
      </DocSection>

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
              <p>
                Types what you say, polishes it, or{" "}
                <Link href="/docs/writing" className={link}>
                  writes it for you
                </Link>
                . If it’s a request, the agent handles it.
              </p>
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
          <strong>Understand requests while dictating</strong>. Another dictation app on the same keys? Only {brand.name}{" "}
          responds, unless you{" "}
          <Link href="/docs/troubleshooting#another-dictation-app" className={link}>
            turn that off
          </Link>
          .
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
            <strong>Sources</strong>, up to three, link to the pages and files it used.
          </li>
          <li>
            <strong>Select</strong> any text to copy it. Click code to copy it.
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

      <DocSection id="turn-on-what-you-want" title="Choose what it may do">
        <p>
          Dictation and questions work straight away. To understand you, {brand.name} reads the window you’re in, where your
          system allows, redacted and never on private pages, and offers suggestions when it can help. Both are on from the
          start: turn either off in the tour after setup or in {brand.name} → Privacy (<strong>Read what you ask about</strong>,{" "}
          <strong>Offer suggestions</strong>). Screen memory, meeting notes and hands-free stay off until you turn them on. See{" "}
          <Link href="/docs/privacy" className={link}>
            Privacy controls
          </Link>
          .
        </p>
      </DocSection>

      <DocSection id="where-it-works" title="Where it works">
        <p>{platformNote}</p>
        <p>
          Free gets all of it, with weekly limits: {brand.freePolishPerWeek} AI uses, up to{" "}
          {brand.freeSuggestionsPerWeek} suggestions and {freeMeetingsPerMonth} meetings a month. Dictation is unlimited.
          Every install starts with {brand.trialDays} days of Pro, no card.{" "}
          <Link href="/pricing" className={link}>
            Plans
          </Link>
        </p>
      </DocSection>

      <DocSection id="feedback" title="Tell us what broke">
        <p>
          Say “Hey {brand.name}, report a bug…”, click 👍 or 👎 on any answer, or use <strong>Send feedback</strong> in
          the menu. It comes straight to the team.
        </p>
      </DocSection>

      <GuideNext slug="getting-started" />
    </>
  );
}
