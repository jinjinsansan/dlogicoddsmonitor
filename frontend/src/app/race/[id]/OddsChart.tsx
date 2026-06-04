"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { fmtTimeJST } from "@/lib/format";

const LINE_COLORS = [
  "#22D3EE", "#FB7185", "#A78BFA", "#F59E0B", "#34D399",
  "#60A5FA", "#F472B6", "#FBBF24", "#4ADE80", "#818CF8",
];

export default function OddsChart({
  trend,
  horses,
}: {
  trend: { t: string; odds: Record<string, number> }[];
  horses: number[]; // 表示する馬番(急変馬)
}) {
  if (!trend.length || !horses.length) {
    return (
      <div className="text-center text-muted text-sm py-10">
        オッズ推移データがまだありません。
      </div>
    );
  }

  const data = trend.map((p) => {
    const row: Record<string, any> = { time: fmtTimeJST(p.t) };
    for (const h of horses) {
      const v = p.odds[String(h)];
      if (typeof v === "number" && v > 0) row[String(h)] = v;
    }
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid stroke="#1F2937" strokeDasharray="3 3" />
        <XAxis dataKey="time" stroke="#94A3B8" fontSize={11} />
        <YAxis
          reversed
          stroke="#94A3B8"
          fontSize={11}
          domain={["auto", "auto"]}
          width={40}
        />
        <Tooltip
          contentStyle={{
            background: "#131826",
            border: "1px solid #1F2937",
            borderRadius: 8,
            fontSize: 12,
          }}
          labelStyle={{ color: "#94A3B8" }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {horses.map((h, i) => (
          <Line
            key={h}
            type="monotone"
            dataKey={String(h)}
            name={`${h}番`}
            stroke={LINE_COLORS[i % LINE_COLORS.length]}
            dot={false}
            strokeWidth={2}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
