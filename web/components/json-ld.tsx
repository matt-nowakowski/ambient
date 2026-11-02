import { jsonLd } from "@/lib/seo";

export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(data)} />;
}
