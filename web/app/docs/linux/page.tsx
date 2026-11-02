import Link from "next/link";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { C, Cmd, DocHeader, DocSection } from "@/components/docs";
import { brand } from "@/lib/brand";
import { releases } from "@/lib/releases";

export const metadata: Metadata = pageMetadata({
  title: "Linux setup",
  description: `Install and set up ${brand.name} on Linux: packages, Wayland shortcuts, paste tools and the recording overlay.`,
  path: "/docs/linux",
});

const ENV_PREFIX = brand.slug.toUpperCase().replace(/[^A-Z0-9]/g, "_");

export default function LinuxPage() {
  const bin = brand.slug;
  return (
    <>
      <DocHeader
        eyebrow="Docs"
        title="Linux setup"
        intro={`${brand.name} runs on X11 and Wayland. Install a package, then set up a shortcut and a paste tool for your desktop.`}
      />

      <DocSection id="install" title="Install">
        <p>
          Download the package for your distribution from the{" "}
          <Link href="/download" className="text-foreground underline underline-offset-4">
            download page
          </Link>
          .
        </p>
        <p>
          <strong>Debian, Ubuntu</strong> (.deb)
        </p>
        <Cmd>{`sudo apt install ./${releases.linuxDeb.file}`}</Cmd>
        <p>
          <strong>Fedora, RHEL, openSUSE</strong> (.rpm)
        </p>
        <Cmd>{`sudo dnf install ./${releases.linuxRpm.file}`}</Cmd>
        <p>
          <strong>Any distribution</strong> (AppImage)
        </p>
        <Cmd>{`chmod +x ${releases.linuxAppImage.file}\n./${releases.linuxAppImage.file}`}</Cmd>
      </DocSection>

      <DocSection id="wayland" title="Wayland and global shortcuts">
        <p>
          Wayland doesn’t let apps register global keyboard shortcuts the way X11 does, so {brand.name}’s built-in
          shortcut may not fire. Instead, bind a shortcut in your desktop environment to the command line flag:
        </p>
        <Cmd>{`${bin} --toggle-transcription`}</Cmd>
        <p>
          The first press starts recording, the second stops it and pastes the text. This works because the command
          signals the already-running instance of {brand.name}.
        </p>
        <ul>
          <li>
            <strong>GNOME:</strong> Settings → Keyboard → View and Customize Shortcuts → Custom Shortcuts → add the
            command above.
          </li>
          <li>
            <strong>KDE Plasma:</strong> System Settings → Shortcuts → Add New → Command or Script.
          </li>
          <li>
            <strong>Sway / Hyprland:</strong> add a <C>bindsym</C> / <C>bind</C> line that runs the command.
          </li>
        </ul>
        <p>Other flags you can bind:</p>
        <Cmd>{`${bin} --toggle-post-process   # record with AI post-processing\n${bin} --cancel                # cancel the current recording`}</Cmd>
      </DocSection>

      <DocSection id="pasting-text" title="Pasting text">
        <p>
          To type into other apps, {brand.name} uses a helper tool. Install the one that fits your session:
        </p>
        <ul>
          <li>
            <strong>wtype</strong> — Wayland on wlroots compositors (Sway, Hyprland). Not supported by GNOME or KDE.
          </li>
          <li>
            <strong>ydotool</strong> — works on any Wayland compositor and on X11. Requires the <C>ydotoold</C> daemon
            running and access to <C>/dev/uinput</C>.
          </li>
          <li>
            <strong>xdotool</strong> — X11 sessions.
          </li>
        </ul>
        <Cmd>{`# Debian / Ubuntu\nsudo apt install wtype ydotool xdotool\n\n# Fedora\nsudo dnf install wtype ydotool xdotool`}</Cmd>
        <p>
          {brand.name} picks the first available tool automatically: on Wayland it tries wtype (except on GNOME and
          KDE), then dotool, then ydotool; on X11 it tries xdotool, then ydotool.
        </p>
      </DocSection>

      <DocSection id="overlay" title="Recording overlay">
        <p>
          The recording indicator is drawn with <strong>gtk-layer-shell</strong>, so it can float above other windows on
          Wayland compositors that support the layer-shell protocol. If the overlay misbehaves on your compositor,
          disable it with:
        </p>
        <Cmd>{`${ENV_PREFIX}_NO_GTK_LAYER_SHELL=1 ${bin}`}</Cmd>
      </DocSection>
    </>
  );
}
