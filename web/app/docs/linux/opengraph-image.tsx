import { brand } from "@/lib/brand";
import { ogImage, ogSize } from "@/lib/og";

export const alt = `${brand.name} — Linux setup`;
export const size = ogSize;
export const contentType = "image/png";

export default function Image() {
  return ogImage({ title: "Linux setup" });
}
