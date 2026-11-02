import { brand } from "@/lib/brand";
import { ogImage, ogSize } from "@/lib/og";

export const alt = `${brand.name} — Simple pricing.`;
export const size = ogSize;
export const contentType = "image/png";

export default function Image() {
  return ogImage({ title: "Simple pricing." });
}
