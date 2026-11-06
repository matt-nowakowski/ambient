import Link from "next/link";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { C, Cmd, DocHeader, DocSection } from "@/components/docs";
import { brand, emails, mailto } from "@/lib/brand";

export const metadata: Metadata = pageMetadata({
  title: "Uninstall",
  description: `How to uninstall ${brand.name} on macOS, Windows and Linux, and where it keeps your data so you can remove it too.`,
  path: "/docs/uninstall",
});

const a = "text-foreground underline underline-offset-4";

export default function UninstallPage() {
  const id = brand.identifier;
  return (
    <>
      <DocHeader
        eyebrow="Docs"
        title={`Uninstall ${brand.name}`}
        intro={`Removing the app leaves your history, meetings, screen memory and downloaded models on your computer, in case you come back. To remove everything, delete the folders below too.`}
      />

      <DocSection id="before-you-start" title="Before you start">
        <ul>
          <li>
            If you have Pro, uninstalling doesn’t cancel it. Cancel first in{" "}
            {brand.name} → Account → Manage billing, or at{" "}
            <Link href="/billing" className={a}>
              {brand.domain}/billing
            </Link>
            .
          </li>
          <li>
            Quit {brand.name} from its menu bar or tray icon, so nothing is in
            use.
          </li>
          <li>
            Deleting these folders can’t be undone. Your history, meeting notes
            and screen memory exist only on your computer, so copy out anything
            you want to keep.
          </li>
        </ul>
      </DocSection>

      <DocSection id="macos" title="macOS">
        <ol>
          <li>
            Turn off <strong>Launch on Startup</strong> in {brand.name} →
            Settings → Advanced, then quit {brand.name}.
          </li>
          <li>
            Drag {brand.name} from Applications to the Trash. If it still
            appears under System Settings → General → Login Items, remove it
            there.
          </li>
        </ol>
        <p>
          To remove its data, delete these folders (in Finder, Go → Go to
          Folder…):
        </p>
        <ul>
          <li>
            <C>{`~/Library/Application Support/${id}`}</C>: settings, history,
            meetings, screen memory, and downloaded speech and AI models (in{" "}
            <C>huggingface</C>)
          </li>
          <li>
            <C>{`~/Library/Caches/${id}`}</C>
          </li>
          <li>
            <C>{`~/Library/Logs/${id}`}</C>
          </li>
          <li>
            <C>{`~/Library/WebKit/${id}`}</C>
          </li>
          <li>
            <C>{`~/Library/Preferences/${id}.plist`}</C>, if it’s there
          </li>
        </ul>
        <p>Or in Terminal:</p>
        <Cmd>{`rm -rf ~/Library/Application\\ Support/${id} ~/Library/Caches/${id} \\
  ~/Library/Logs/${id} ~/Library/WebKit/${id} ~/Library/Preferences/${id}.plist`}</Cmd>
        <p>
          Screen memory’s encryption key is in your Keychain. Open Keychain
          Access, search for <C>{id}</C> and delete the item, or run:
        </p>
        <Cmd>{`security delete-generic-password -s ${id}`}</Cmd>
        <p>To reset the permissions you gave it, so a reinstall asks again:</p>
        <Cmd>{`tccutil reset Microphone ${id}
tccutil reset Accessibility ${id}`}</Cmd>
        <p>
          Or remove {brand.name} from System Settings → Privacy & Security →
          Microphone and Accessibility (and Screen & System Audio Recording, if
          you allowed it for meetings).
        </p>
      </DocSection>

      <DocSection id="windows" title="Windows">
        <ol>
          <li>Quit {brand.name} from its tray icon.</li>
          <li>
            Open Settings → Apps → Installed apps, find {brand.name}, and choose{" "}
            <strong>Uninstall</strong>.
          </li>
          <li>
            In the uninstaller, tick{" "}
            <strong>Delete the application data</strong> to remove your data and
            downloaded models as well. Uninstalling always removes it from your
            startup apps.
          </li>
        </ol>
        <p>
          If you uninstalled without ticking it, delete these folders (paste
          each into File Explorer’s address bar):
        </p>
        <ul>
          <li>
            <C>{`%APPDATA%\\${id}`}</C>: settings, history, meetings, screen
            memory and the on-device AI model
          </li>
          <li>
            <C>{`%LOCALAPPDATA%\\${id}`}</C>: downloaded speech models, logs and
            caches
          </li>
        </ul>
      </DocSection>

      <DocSection id="linux" title="Linux">
        <p>Remove the package the way you installed it:</p>
        <Cmd>{`sudo apt remove ${brand.slug}     # .deb
sudo dnf remove ${brand.slug}     # .rpm`}</Cmd>
        <p>For the AppImage, delete the file. Then remove its data:</p>
        <Cmd>{`rm -rf ~/.local/share/${id} ~/.config/${id} ~/.cache/${id}
rm -f ~/.config/autostart/${brand.name}.desktop`}</Cmd>
        <p>
          <C>{`~/.local/share/${id}`}</C> holds your settings, history,
          meetings, screen memory, logs and downloaded models. The others may
          not exist; that’s fine.
        </p>
      </DocSection>

      <DocSection
        id="your-account"
        title="Your account and data on our servers"
      >
        <p>
          Uninstalling only touches your computer. To have what we hold about
          you deleted (your sign-in email and plan, tips emails), email{" "}
          <a href={mailto("Delete my data", emails.legal)} className={a}>
            {emails.legal}
          </a>
          . See{" "}
          <Link href="/privacy#rights" className={a}>
            your rights
          </Link>{" "}
          in the privacy policy; billing records are kept as the law requires.
        </p>
      </DocSection>
    </>
  );
}
