/** The tray icon, matching src-tauri/resources/tray_*.png (drawn by
 * brand/generate-icons.swift): the orb's Ring form, 8 dots on a circle.
 * Uses currentColor like a macOS template image. */
type TrayIconState = "idle" | "recording" | "transcribing";

const DOTS = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
  return { cx: 32 + Math.cos(a) * 21, cy: 32 + Math.sin(a) * 21 };
});
// Transcribing: a comet tail around the ring.
const TAIL = [1, 0.85, 0.7, 0.55, 0.42, 0.32, 0.24, 0.18];

const TrayIcon = ({
  state,
  size,
}: {
  state: TrayIconState;
  size: number | string;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    {DOTS.map((d, i) => (
      <circle
        key={i}
        cx={d.cx}
        cy={d.cy}
        r={5}
        opacity={state === "transcribing" ? TAIL[i] : 1}
      />
    ))}
    {state === "recording" && <circle cx={32} cy={32} r={9} />}
  </svg>
);

export default TrayIcon;
