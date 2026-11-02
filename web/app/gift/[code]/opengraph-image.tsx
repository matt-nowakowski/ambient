import { brand } from "@/lib/brand";
import { ogImage, ogSize } from "@/lib/og";

export const alt = `A gift for you: ${brand.name} Pro`;
export const size = ogSize;
export const contentType = "image/png";

export default function Image() {
  return ogImage({ title: ["A gift for you:", `${brand.name} Pro`] });
}
