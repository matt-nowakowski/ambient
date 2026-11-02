import Link from "next/link";
import { Callout, DocHeader, DocRows, DocSection } from "@/components/docs";
import { brand } from "@/lib/brand";
import { guideMetadata, guidePage } from "@/lib/guide";

export const metadata = guideMetadata("privacy");

const switches = [
  { k: "Read what you ask about", v: "Reads the window in front when you ask, searches your open windows, and keeps the last two minutes in memory." },
  { k: "Remember what you’ve seen", v: "Saves window text on your Mac, encrypted, for recall. Never uploaded. 7 days by default." },
  { k: "Offer suggestions", v: "Spots moments worth a next step. Decided on your Mac." },
  { k: "Meeting notes", v: "Listens to your microphone and the call while notes are on." },
  { k: "Keep everything on this Mac", v: "Uses Apple Intelligence for every AI step and turns off web search. Nothing is sent." },
] as const;

const never = [
  { k: "Password fields", v: "Never read, in any app." },
  { k: "Password managers and Keychain", v: "Never watched." },
  { k: "Messages, WhatsApp, Signal, Telegram", v: "On the never-watch list by default. Add any app you like." },
  { k: "Private and incognito windows", v: "Skipped." },
  { k: "Crypto wallets", v: "MetaMask, Ledger Live, Phantom, Exodus, Electrum, Trezor and others. Skipped, always." },
  { k: "Recovery phrases and private keys", v: `The whole window is dropped. ${brand.name} shows that it paused there.` },
] as const;

const check = [
  { k: `What ${brand.name} sees`, v: "Click Preview, switch to any window, and see exactly what it would read after redaction." },
  { k: "Requests that left this Mac", v: "Every request and exactly what it sent. Kept 30 days." },
  { k: "What’s stored", v: "Screen memory by app. Delete one app’s, or everything." },
] as const;

export default function PrivacyDocsPage() {
  const p = guidePage("privacy");
  return (
    <>
      <DocHeader eyebrow="Docs" title={p.title} intro={p.intro} />

      <DocSection id="switches" title="The switches">
        <p>All in {brand.name} → Privacy. Each is off until you turn it on.</p>
        <DocRows items={switches} />
      </DocSection>

      <DocSection id="never-read" title="Never read">
        <DocRows items={never} />
      </DocSection>

      <DocSection id="what-leaves" title="What leaves your Mac">
        <p>Your voice never does. Speech recognition runs on your computer.</p>
        <p>
          When a request needs a model, only the text it needs is sent. Card numbers, API keys, passwords and one-time
          codes are removed on your Mac first.
        </p>
        <Callout title="Keep everything on this Mac">
          Turn it on and every AI step runs on Apple Intelligence, with web search off. Nothing is sent at all.
        </Callout>
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
