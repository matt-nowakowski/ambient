import Link from "next/link";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { C, Cmd, DocHeader, DocSection } from "@/components/docs";
import { brand } from "@/lib/brand";
import { releases } from "@/lib/releases";

export const metadata: Metadata = pageMetadata({
  title: "Linux setup",
  description: `Install and set up ${brand.name} on Linux: packages, Wayland shortcuts, paste tools, accessibility for the agent, meeting audio and the recording overlay.`,
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
        <Cmd>{`${bin} --toggle-post-process   # dictate and polish what you said\n${bin} --cancel                # cancel the current recording`}</Cmd>
        <p>
          The Ask shortcut has no flag yet. On Wayland, turn on hands-free in {brand.name} → Settings and say “Hey{" "}
          {brand.name}” instead.
        </p>
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
          KDE), then dotool, then ydotool; on X11 it tries xdotool, then ydotool. With the Direct paste method you can
          pick one yourself: <strong>Typing Tool</strong> in {brand.name} → Settings → Advanced.
        </p>
      </DocSection>

      <DocSection id="accessibility" title="Screen context: turn on accessibility">
        <p>
          The agent reads the text of the window you&rsquo;re in (to summarise it, answer about it or suggest
          something) through <strong>AT-SPI</strong>, the Linux accessibility bus. It&rsquo;s the same thing screen
          readers use, and apps only share their text when it&rsquo;s on. Text only, never pixels; password fields are
          never read, and private windows and the apps on the never-watch list are skipped.
        </p>
        <p>
          <strong>GNOME</strong> (and most GTK desktops):
        </p>
        <Cmd>{`gsettings set org.gnome.desktop.interface toolkit-accessibility true`}</Cmd>
        <p>
          <strong>KDE Plasma:</strong> System Settings &rarr; Accessibility, or run the command above too (Qt apps
          follow the same accessibility bus). Log out and back in so every app picks it up.
        </p>
        <p>
          <strong>Chrome, Chromium, Edge and Electron apps</strong> (Slack, Discord, VS Code) build their
          accessibility tree only when asked. Start them with:
        </p>
        <Cmd>{`google-chrome --force-renderer-accessibility`}</Cmd>
        <p>
          Firefox follows the desktop setting. On <strong>Wayland</strong> there is no other way for an app to know
          which window is in front, so the agent needs accessibility on to see anything; on <strong>X11</strong> it
          knows the app in front either way, and needs accessibility only for the text.
        </p>
      </DocSection>

      <DocSection id="meetings" title="Meeting notes and call audio">
        <p>
          {brand.name} hears the call by recording what your computer plays (the default output&rsquo;s
          &ldquo;monitor&rdquo;) through PipeWire or PulseAudio, and notices a call when another app is using the
          microphone. Both use the PulseAudio tools, which PipeWire systems support too:
        </p>
        <Cmd>{`# Debian / Ubuntu
sudo apt install pulseaudio-utils

# Fedora
sudo dnf install pulseaudio-utils`}</Cmd>
        <p>
          Without them, meeting notes still transcribe your microphone. Audio is never saved. Calls are recognised in
          Zoom, Teams, Slack, Discord and Webex, and in a browser on Google Meet, Teams or Zoom on the web.
        </p>
      </DocSection>

      <DocSection id="files-calendar-actions" title="Files, calendar and your own actions">
        <ul>
          <li>
            <strong>Finding your files</strong> uses GNOME&rsquo;s Tracker index when it&rsquo;s there, then{" "}
            <C>plocate</C> / <C>locate</C>, and otherwise looks through Desktop, Documents, Downloads and your recent
            files.
          </li>
          <li>
            <strong>Meeting prep</strong> reads upcoming events from Evolution Data Server, the calendar store behind
            GNOME Calendar, Evolution and GNOME Online Accounts, when it&rsquo;s running.
          </li>
          <li>
            <strong>Reminders</strong> are <C>systemd-run --user</C> timers that show a <C>notify-send</C> notification,
            so they fire even if {brand.name} isn&rsquo;t running. Without a systemd user session, it offers an .ics
            file for your calendar instead.
          </li>
          <li>
            <strong>&ldquo;Run my &hellip; shortcut&rdquo;</strong> runs your own script from{" "}
            <C>{`~/.local/share/${bin}/actions/`}</C>: the name lowercased with spaces as dashes, so &ldquo;run my
            focus mode shortcut&rdquo; runs <C>focus-mode.sh</C> (with <C>sh</C>). If there&rsquo;s no script, it
            opens an installed app of that name.
          </li>
        </ul>
        <Cmd>{`mkdir -p ~/.local/share/${bin}/actions
printf 'notify-send "Focus mode on"\n' > ~/.local/share/${bin}/actions/focus-mode.sh`}</Cmd>
      </DocSection>

      <DocSection id="overlay" title="Recording overlay and agent panel">
        <p>
          The recording indicator and the agent&rsquo;s panel are drawn with <strong>gtk-layer-shell</strong>, so they
          float above other windows without taking focus on Wayland compositors that support the layer-shell protocol
          (KDE Plasma, Sway, Hyprland). On X11 they are always-on-top windows that never take focus. GNOME on Wayland
          has no layer shell, so there the panel is an ordinary window that GNOME may place and raise as it likes. If
          the overlay misbehaves on your compositor, disable layer shell with:
        </p>
        <Cmd>{`${ENV_PREFIX}_NO_GTK_LAYER_SHELL=1 ${bin}`}</Cmd>
      </DocSection>
    </>
  );
}
