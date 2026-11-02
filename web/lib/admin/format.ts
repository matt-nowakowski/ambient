/** Number formats shared by the admin page (server) and its charts (client). */
export type Fmt = "money" | "money0" | "int" | "compact" | "pct" | "pct1";

export function format(v: number, f: Fmt): string {
  switch (f) {
    case "money":
      return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case "money0":
      return `$${Math.round(v).toLocaleString("en-US")}`;
    case "int":
      return Math.round(v).toLocaleString("en-US");
    case "compact":
      return Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v);
    case "pct":
      return `${Math.round(v * 100)}%`;
    case "pct1":
      return `${(v * 100).toFixed(1)}%`;
  }
}

