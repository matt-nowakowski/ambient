import Link from "next/link";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { C, Cmd, DocHeader, DocSection } from "@/components/docs";
import { brand, mailto } from "@/lib/brand";
import { defaultShortcut } from "@/lib/releases";

export const metadata: Metadata = pageMetadata({
  title: "Troubleshooting",
  description: `Fix common ${brand.name} problems: the Windows SmartScreen prompt, shortcuts and macOS Secure Input, microphone and accessibility permissions, pasting, a cut-off first word, and other dictation apps.`,
  path: "/docs/troubleshooting",
});

export default function TroubleshootingPage() {
  return (
    <>
      <DocHeader
        eyebrow="Docs"
        title="Troubleshooting"
        intro={`Most problems come down to a permission or another app holding the keyboard. Start here.`}
      />

      <DocSection id="windows-protected-your-pc" title="“Windows protected your PC” when installing">
        <p>
          Windows shows this SmartScreen message for installers from publishers it hasn’t seen much of yet. {brand.name}’s
          Windows installer isn’t code-signed yet (signing is coming), so Windows can’t name the publisher. It isn’t a
          sign that anything is wrong with the file. To install:
        </p>
        <ol>
          <li>
            Click <strong>More info</strong>.
          </li>
          <li>
            Check that the app is <C>{`${brand.name}_…_x64-setup.exe`}</C> (or <C>arm64-setup.exe</C>), then click{" "}
            <strong>Run anyway</strong>.
          </li>
        </ol>
        <p>
          To be sure you have the real installer, download it only from{" "}
          <Link href="/download" className="text-foreground underline underline-offset-4">
            the download page
          </Link>{" "}
          on {brand.domain}, which serves it over HTTPS. Once installed, every update {brand.name} downloads is checked
          against its signing key before it’s applied. If anything looks off, email us before running it.
        </p>
      </DocSection>

      <DocSection
        id="shortcuts-stopped-working-on-macos-secure-input"
        title="Shortcuts stopped working on macOS (Secure Input)"
      >
        <p>
          macOS has a privacy feature called <strong>Secure Input</strong>. While it’s on, the system stops delivering
          keystrokes to other apps — including global shortcuts like {brand.name}’s <C>{defaultShortcut.mac}</C>. It is
          turned on whenever a password field has focus, and some apps enable it on purpose:
        </p>
        <ul>
          <li>A password field in any app or web page (including the macOS login prompt)</li>
          <li>Password managers such as 1Password while unlocked or showing a password prompt</li>
          <li>
            Terminal or iTerm2 with <strong>Secure Keyboard Entry</strong> enabled (Terminal → Secure Keyboard Entry)
          </li>
        </ul>
        <p>
          Apps are supposed to release it when you leave the field, but some don’t. To fix it, switch away from or close
          the app that holds it, or turn off Secure Keyboard Entry in your terminal. To see which process has it on, run:
        </p>
        <Cmd>{`ioreg -l -w 0 | grep SecureInput`}</Cmd>
        <p>
          The output includes <C>kCGSSessionSecureInputPID</C> — the process ID of the app holding Secure Input. Look it
          up with <C>ps -p &lt;pid&gt;</C> or in Activity Monitor. If nothing is listed, Secure Input is off. Locking and
          unlocking your Mac also resets it.
        </p>
      </DocSection>

      <DocSection id="microphone-permission" title="Microphone permission">
        <p>
          {brand.name} needs microphone access to hear you. If recording starts but nothing is transcribed, or the
          waveform stays flat:
        </p>
        <ul>
          <li>
            <strong>macOS:</strong> System Settings → Privacy & Security → Microphone → turn on {brand.name}. Quit and
            reopen {brand.name} afterwards.
          </li>
          <li>
            <strong>Windows:</strong> Settings → Privacy & security → Microphone → allow desktop apps to access your
            microphone.
          </li>
          <li>
            <strong>Linux:</strong> make sure the right input device is selected in {brand.name}’s settings and in your
            sound settings (PipeWire / PulseAudio).
          </li>
        </ul>
        <p>Also check that the right microphone is selected in {brand.name} → Settings.</p>
      </DocSection>

      <DocSection id="accessibility-permission" title="Accessibility permission (macOS)">
        <p>
          On macOS, {brand.name} needs the <strong>Accessibility</strong> permission to listen for its global shortcut
          and to paste text into other apps.
        </p>
        <ol>
          <li>Open System Settings → Privacy & Security → Accessibility.</li>
          <li>Turn on {brand.name}. If it’s already on, turn it off and on again.</li>
          <li>Quit and reopen {brand.name}.</li>
        </ol>
        <p>
          After an update, macOS sometimes keeps a stale entry. If the toggle is on but the shortcut does nothing,
          remove {brand.name} from the list with the <C>−</C> button and add it again.
        </p>
      </DocSection>

      <DocSection id="text-doesnt-paste" title="Text doesn’t paste">
        <p>
          {brand.name} puts the transcript on the clipboard and sends a paste keystroke to the focused app. If you see
          the recording finish but no text appears:
        </p>
        <ul>
          <li>Click into a text field first — the text goes wherever the cursor is.</li>
          <li>On macOS, check the Accessibility permission above.</li>
          <li>
            Some apps (terminals, remote desktops, games) ignore the default paste shortcut. Try a different paste
            method in {brand.name} → Settings → Advanced.
          </li>
          <li>The transcript is also kept in History, so you can copy it from there.</li>
          <li>
            On Linux, a paste tool may be needed — see{" "}
            <Link href="/docs/linux#pasting-text" className="text-foreground underline underline-offset-4">
              Linux setup
            </Link>
            .
          </li>
        </ul>
      </DocSection>

      <DocSection id="first-word-cut-off" title="The first word is cut off">
        <p>
          Opening the mic takes a moment, longer with Bluetooth headsets. <strong>Keep mic ready</strong> keeps it open
          for a minute after you dictate, so the next one catches your first word. Make it longer in {brand.name} →
          Settings → Sound. While it’s open your computer shows the mic in use; that audio stays in memory, never saved or
          sent.
        </p>
      </DocSection>

      <DocSection id="another-dictation-app" title="Another dictation app types too">
        <p>
          If another dictation app uses the same shortcut, both may respond. Check that{" "}
          <strong>Only {brand.name} responds to its shortcuts</strong> is on (the default) in {brand.name} → Settings →
          General. Setup calls it “Make {brand.name} your dictation app”. Or pick a different shortcut. {brand.name} tells you when one is
          running.
        </p>
        <p>
          On a Mac, if Dictation or the emoji picker opens too, set “Press 🌐 key to” to Do Nothing in Keyboard settings.
          On Windows, <C>Win + H</C> also starts voice typing; pick another shortcut.
        </p>
      </DocSection>

      <DocSection id="still-stuck" title="Still stuck?">
        <p>
          Email{" "}
          <a href={mailto("Troubleshooting")} className="text-foreground underline underline-offset-4">
            {brand.supportEmail}
          </a>{" "}
          with your OS version, {brand.name} version and what you tried. Or, from the app, say “Hey {brand.name}, report
          a bug…” or use <strong>Send feedback</strong> in the menu.
        </p>
      </DocSection>
    </>
  );
}
