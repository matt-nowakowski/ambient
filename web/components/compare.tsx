import { brand } from "@/lib/brand";
import { compareRows as rows, comparedAsOf, competitors, type Cell } from "@/lib/content";
import { Check, Dash } from "./ui";

function Value({ v, strong }: { v: Cell; strong?: boolean }) {
  if (v === true)
    return (
      <span className="inline-flex items-center gap-2">
        <Check className={`size-4 ${strong ? "text-foreground" : "text-muted"}`} />
        <span className="sr-only">Yes</span>
      </span>
    );
  if (v === false || v === "—")
    return (
      <span className="inline-flex items-center gap-2 text-subtle">
        <Dash className="size-4" />
        <span className="sr-only">{v === false ? "No" : "Not stated"}</span>
      </span>
    );
  return <span className={strong ? "text-foreground" : "text-muted"}>{v}</span>;
}

export function Compare() {
  return (
    <div>
      <div className="glass overflow-hidden rounded-[22px]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-[13px] sm:text-[14px]">
            <caption className="sr-only">
              {brand.name} compared with {competitors.join(" and ")}
            </caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="w-[28%] px-4 py-4 font-normal text-subtle sm:px-6">
                  <span className="sr-only">Feature</span>
                </th>
                <th scope="col" className="eyebrow w-[24%] px-4 py-4 !text-foreground sm:px-6">
                  {brand.name}
                </th>
                {competitors.map((c) => (
                  <th key={c} scope="col" className="eyebrow w-[24%] px-4 py-4 sm:px-6">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.label}>
                  <th scope="row" className="px-4 py-3.5 align-top font-light text-muted sm:px-6">
                    {r.label}
                  </th>
                  <td className="px-4 py-3.5 align-top sm:px-6">
                    <Value v={r.us} strong />
                  </td>
                  {r.them.map((v, i) => (
                    <td key={competitors[i]} className="px-4 py-3.5 align-top sm:px-6">
                      <Value v={v} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-4 text-[13px] text-subtle">
        Compared as of {comparedAsOf}; check each product’s site for current details. A dash means we couldn’t
        confirm it from their public pages.
      </p>
    </div>
  );
}
