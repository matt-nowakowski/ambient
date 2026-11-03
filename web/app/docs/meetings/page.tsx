import { C, Callout, DocHeader, DocRows, DocSection, GuideNext, TrySaying } from "@/components/docs";
import { brand, freeMeetingsPerMonth } from "@/lib/brand";
import { guideMetadata, guidePage, trySaying } from "@/lib/guide";

export const metadata = guideMetadata("meetings");

const nudges = [
  { k: "They asked you something", v: "Find it: looks for the answer in your files, or on the web." },
  { k: "You promised something", v: "Remind me: adds a reminder so you follow through." },
  { k: "A question worth asking", v: "Copy: puts it on the clipboard to paste into the chat." },
] as const;

const after = [
  { k: "Summary", v: "What the call was about, in a few sentences." },
  { k: "Decisions", v: "What was agreed." },
  { k: "Action items", v: "Who does what, and by when." },
  { k: "Questions for you", v: "What they asked that still needs an answer." },
  { k: "Follow-up email", v: "A draft, ready to copy and send." },
] as const;

export default function MeetingsPage() {
  const p = guidePage("meetings");
  return (
    <>
      <DocHeader eyebrow="Docs" title={p.title} intro={p.intro} />

      <TrySaying items={trySaying.meetings} />

      <DocSection id="start" title="Start notes">
        <p>
          Click <strong>Start notes</strong> in {brand.name} → Meetings. Or turn on meeting suggestions: when a call app
          is open and your microphone is in use, it asks “Take notes for this call?”
        </p>
        <p>Works with Zoom, Google Meet, Microsoft Teams, FaceTime and Slack huddles. If it plays on your computer, it works.</p>
      </DocSection>

      <DocSection id="during-the-call" title="During the call">
        <p>
          A live transcript, with <strong>You</strong> and <strong>Them</strong> kept apart: your microphone and the
          call audio are transcribed separately, on your computer. Rolling notes build as you talk.
        </p>
        <p>Nudges appear when they matter. Answer with a click or by voice.</p>
        <DocRows items={nudges} />
      </DocSection>

      <DocSection id="after-the-call" title="After the call">
        <p>
          Click Stop and summarise. When the call ends, a card says your notes are ready: open them, copy them, or, signed
          in, click <strong>Email to me</strong>.
        </p>
        <DocRows items={after} />
      </DocSection>

      <DocSection id="consent" title="Let people know">
        <p>When notes start, {brand.name} offers a message to paste into the call chat:</p>
        <Callout title="Consent message">
          “Heads up: I’m using {brand.name} to take notes on this call.”
        </Callout>
        <p>No bot joins, so nobody sees a notetaker in the participant list. Telling them is on you.</p>
      </DocSection>

      <DocSection id="privacy" title="Audio and privacy">
        <p>
          Audio is transcribed on your computer and never saved. Only the transcript text is sent, to write the summary.
          Notes stay on your computer until you delete them.
        </p>
        <p>
          To hear the call, a Mac needs macOS 13 or later and the Screen Recording permission (audio only). Windows
          needs nothing extra. Linux uses PipeWire or PulseAudio (needs <C>pulseaudio-utils</C>).
        </p>
        <p>
          Free includes {freeMeetingsPerMonth} meetings a month. Pro is unlimited.
        </p>
      </DocSection>

      <GuideNext slug="meetings" />
    </>
  );
}
