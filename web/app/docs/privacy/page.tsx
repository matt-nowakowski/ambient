import Link from "next/link";
import { Callout, DocHeader, DocRows, DocSection } from "@/components/docs";
import { brand } from "@/lib/brand";
import { guideMetadata, guidePage } from "@/lib/guide";

export const metadata = guideMetadata("privacy");

const switches = [
  { k: "Read what you ask about", v: "Reads the window in front when you ask, searches your open windows, and keeps the last two minutes in memory." },
  { k: "Remember what you’ve seen", v: "Saves window text on your computer, encrypted, for recall. Never uploaded. 24 hours on Free, 7 days by default on Pro." },
  { k: "Offer suggestions", v: "Spots moments worth a next step. Decided on your computer, or by the cloud if you choose (Pro)." },
  { k: "Hands-free", v: `Listens on your computer for “Hey ${brand.name}”. Nothing is sent until you say it.` },
  { k: "Share anonymous usage counts", v: "Counts and timings only, never what you say, type or see." },
  { k: "Meeting notes", v: "Listens to your microphone and the call while notes are on." },
  { k: "Intelligence", v: "Where the AI runs, chosen in setup: Automatic, On this computer only (nothing sent), Cloud, or No AI." },
] as const;

const never = [
  { k: "Password fields", v: "Never read, in any app." },
  { k: "Password managers and Keychain", v: "Never watched." },
  { k: "Messages, WhatsApp, Signal, Telegram", v: "On the never-watch list by default. Add any app you like." },
  { k: "Private and incognito windows", v: "Skipped." },
  { k: "Crypto wallets", v: "MetaMask, Ledger Live, Phantom, Exodus, Electrum, Trezor and others. Skipped, always." },
  { k: "Recovery phrases and private keys", v: `The whole window is dropped. ${brand.name} shows that it paused there.` },
  { k: "Private pages", v: "Banking, payment, medical, password and ID pages, recognised by what they show, in any language. Ask about one and it says it doesn’t read them." },
] as const;

const onDevice = [
  { k: "What it is", v: "A small AI model run by llama.cpp on your computer. Optional, on every OS." },
  { k: "Models", v: "Qwen3 in four sizes, 0.6 to 2.5 GB. Recommended: Qwen3 1.7B (4-bit), about 1.1 GB. Switch or remove any time." },
  { k: "What runs on it", v: "Polish, smart writing, deciding what you meant, suggestions and short answers." },
  { k: "Without it", v: "“On this computer only” means basic: simple rules, no AI. Answers and writing for you need the cloud." },
  { k: "On a Mac", v: "An alternative to Apple Intelligence." },
] as const;

const check = [
  { k: "Right now", v: "The top of Privacy: what reads your screen and what can send text to the cloud, at a glance." },
  { k: `What ${brand.name} sees`, v: "Click Preview, switch to any window, and see exactly what it would read after redaction." },
  { k: "Requests that left this computer", v: "Every request and exactly what it sent: AI, downloads, update checks, the daily check-in, trial, sign-in and plan checks. Kept 30 days." },
  { k: "What’s stored", v: "Screen memory by app. Delete one app’s, or everything." },
  { k: "What you’ve told me", v: "The suggestions you turned down, and how you like your writing, per app. Undo any of it." },
] as const;

export default function PrivacyDocsPage() {
  const p = guidePage("privacy");
  return (
    <>
      <DocHeader eyebrow="Docs" title={p.title} intro={p.intro} />

      <DocSection id="switches" title="The switches">
        <p>All in {brand.name} → Privacy. Each is off until you turn it on, except Intelligence.</p>
        <DocRows items={switches} />
      </DocSection>

      <DocSection id="never-read" title="Never read">
        <DocRows items={never} />
      </DocSection>

      <DocSection id="what-leaves" title="What leaves your computer">
        <p>Your voice never does. Speech recognition runs on your computer.</p>
        <p>
          When a request needs a model, only the text it needs is sent. Card numbers, API keys, passwords and one-time
          codes are removed on your computer first.
        </p>
        <Callout title="On this computer only">
          Set Intelligence to this and AI runs only on your device (on-device AI, or Apple Intelligence on a Mac), with
          web search off. Nothing is sent for AI at all.
        </Callout>
        <p>
          <strong>No AI</strong> goes further: no model runs anywhere. Dictation is typed as you said it, and asking for
          something that needs AI tells you so.
        </p>
      </DocSection>

      <DocSection id="on-device-ai" title="On-device AI">
        <p>
          Download it in {brand.name} → Privacy → <strong>On-device AI</strong>. Remove it any time.
        </p>
        <DocRows items={onDevice} />
      </DocSection>

      <DocSection id="check-it-yourself" title="Check it yourself">
        <DocRows items={check} />
        <p>
          One click pauses everything for an hour or until tomorrow. The HUD never appears in screen shares or
          recordings.
        </p>
      </DocSection>

      <DocSection id="more" title="More">
        <p>
          The full rules are in the{" "}
          <Link href="/privacy" className="text-foreground underline underline-offset-4">
            Privacy Policy
          </Link>
          .
        </p>
      </DocSection>
    </>
  );
}
