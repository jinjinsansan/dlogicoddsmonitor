import Link from "next/link";
import type { BoardSignal } from "@/lib/data";
import { SIGNAL_META, fmtOdds, fmtPct, fmtTimeJST } from "@/lib/format";

export default function SignalRow({ s }: { s: BoardSignal }) {
  const meta = SIGNAL_META[s.type];
  return (
    <Link
      href={`/race/${encodeURIComponent(s.raceId)}`}
      className="block border-l-4 bg-surface hover:bg-[#1a2030] transition-colors rounded-r-lg px-4 py-3 cursor-pointer"
      style={{ borderColor: meta.color }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="text-xs font-bold shrink-0 px-1.5 py-0.5 rounded"
            style={{ color: meta.color, backgroundColor: `${meta.color}1A` }}
          >
            {meta.arrow} {meta.short}
          </span>
          <span className="text-sm text-muted truncate">
            {s.venue}
            {s.raceNumber}R
          </span>
        </div>
        <span className="nums text-[11px] text-muted shrink-0">
          {fmtTimeJST(s.notifiedAt)}
        </span>
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-3">
        {s.type === "reversal" ? (
          <div className="text-sm">
            1番人気交代{" "}
            <span className="nums font-semibold">
              {s.newFav ?? s.horseNumber}番
            </span>
            {s.oldFav != null && (
              <span className="text-muted"> ← {s.oldFav}番</span>
            )}
          </div>
        ) : (
          <>
            <div className="text-sm font-semibold shrink-0">{s.horseNumber}番</div>
            <div className="nums text-sm flex items-center gap-2">
              <span className="text-muted">
                {fmtOdds(s.prevOdds)}→{fmtOdds(s.currOdds)}
              </span>
              <span
                className="font-bold"
                style={{ color: meta.color }}
              >
                {fmtPct(s.changePct)}
              </span>
            </div>
          </>
        )}
      </div>
    </Link>
  );
}
