import { brand } from "@/lib/brand";
import { guidePage } from "@/lib/guide";
import { ogImage, ogSize } from "@/lib/og";

const { title } = guidePage("getting-started");

export const alt = `${brand.name} — ${title}`;
export const size = ogSize;
export const contentType = "image/png";

export default function Image() {
  return ogImage({ title });
}
