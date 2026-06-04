export type SignalType = "drop" | "surge" | "reversal";

export const SIGNAL_META: Record<
  SignalType,
  { label: string; short: string; color: string; arrow: string }
> = {
  drop: { label: "急落", short: "急落", color: "#22D3EE", arrow: "▼" },
  surge: { label: "急騰", short: "急騰", color: "#FB7185", arrow: "▲" },
  reversal: { label: "1番人気逆転", short: "逆転", color: "#A78BFA", arrow: "⇄" },
};

export function fmtOdds(o: number | null | undefined): string {
  if (o == null || o <= 0) return "—";
  return o.toFixed(1);
}

export function fmtPct(p: number | null | undefined): string {
  if (p == null) return "";
  const s = p > 0 ? "+" : "";
  return `${s}${p.toFixed(1)}%`;
}

// "HH:mm" (JST). 入力は ISO 文字列。
export function fmtTimeJST(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  });
}
