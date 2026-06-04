"use client";
import { useRef } from "react";

// オッズくん マスコット（pico = ピン型ディテクター, 出荷既定）。幾何学SVG。
function shade(hex: string, amt: number) {
  const n = parseInt(hex.replace("#", ""), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.round(r + (amt > 0 ? (255 - r) * amt : r * amt));
  g = Math.round(g + (amt > 0 ? (255 - g) * amt : g * amt));
  b = Math.round(b + (amt > 0 ? (255 - b) * amt : b * amt));
  const c = (x: number) => Math.max(0, Math.min(255, x)).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}
const ID = (p: string) => p + Math.random().toString(36).slice(2, 8);

function Defs({ uid, color }: { uid: string; color: string }) {
  const dark = shade(color, -0.45), light = shade(color, 0.4);
  return (
    <defs>
      <linearGradient id={`${uid}-b`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={light} /><stop offset="0.52" stopColor={color} /><stop offset="1" stopColor={dark} />
      </linearGradient>
      <radialGradient id={`${uid}-g`} cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor={color} stopOpacity="0.5" /><stop offset="1" stopColor={color} stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}
function Eyes({ cx = 100, cy = 96, dx = 20, ry = 15, rx = 13, color, happy }: any) {
  const light = shade(color, 0.45);
  if (happy) {
    return (
      <g className="ky-blink" style={{ transformOrigin: `${cx}px ${cy}px` }}>
        <path d={`M${cx - dx - 8} ${cy + 3} Q${cx - dx} ${cy - 10} ${cx - dx + 8} ${cy + 3}`} fill="none" stroke="#04060C" strokeWidth="5.5" strokeLinecap="round" />
        <path d={`M${cx + dx - 8} ${cy + 3} Q${cx + dx} ${cy - 10} ${cx + dx + 8} ${cy + 3}`} fill="none" stroke="#04060C" strokeWidth="5.5" strokeLinecap="round" />
      </g>
    );
  }
  return (
    <g className="ky-blink" style={{ transformOrigin: `${cx}px ${cy}px` }}>
      <ellipse cx={cx - dx} cy={cy} rx={rx} ry={ry} fill="#04060C" />
      <ellipse cx={cx + dx} cy={cy} rx={rx} ry={ry} fill="#04060C" />
      <circle cx={cx - dx + 4} cy={cy - 5} r="4" fill="#fff" />
      <circle cx={cx + dx + 4} cy={cy - 5} r="4" fill="#fff" />
      <circle cx={cx - dx} cy={cy + 5} r="2" fill={light} opacity="0.8" />
      <circle cx={cx + dx} cy={cy + 5} r="2" fill={light} opacity="0.8" />
    </g>
  );
}
function Mouth({ cx = 100, cy = 120, mood, color }: any) {
  const light = shade(color, 0.45);
  if (mood === "happy") return <g><ellipse cx={cx} cy={cy + 2} rx="13" ry="8" fill="#04060C" /><ellipse cx={cx} cy={cy + 5} rx="9" ry="4" fill={light} opacity="0.7" /></g>;
  if (mood === "alert") return <ellipse cx={cx} cy={cy} rx="5" ry="7" fill="#04060C" />;
  return <ellipse cx={cx} cy={cy} rx="8" ry="3.5" fill="#04060C" />;
}
function Chevron({ cx = 100, y = 152, w = 14, stroke = 6 }: any) {
  return (
    <g>
      <path d={`M${cx - w} ${y} L${cx} ${y + 12} L${cx + w} ${y}`} fill="none" stroke="#fff" strokeOpacity="0.85" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
      <path d={`M${cx - w} ${y + 12} L${cx} ${y + 24} L${cx + w} ${y + 12}`} fill="none" stroke="#fff" strokeOpacity="0.4" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

export function Mascot({ size = 160, mood = "idle", color = "#00E5FF", idle = true, glow = true }:
  { size?: number; mood?: "idle" | "alert" | "happy"; color?: string; idle?: boolean; glow?: boolean }) {
  const uid = useRef(ID("p")).current;
  const dark = shade(color, -0.45), deep = shade(color, -0.62);
  return (
    <svg width={size} height={size * 1.18} viewBox="0 0 200 236"
      className={`ky-mascot ${idle ? "ky-float" : ""} ${mood === "alert" ? "ky-alert" : ""}`}
      style={{ overflow: "visible", display: "block" }} role="img" aria-label="オッズくん">
      <Defs uid={uid} color={color} />
      {glow && <ellipse cx="100" cy="120" rx="94" ry="98" fill={`url(#${uid}-g)`} className="ky-aura" />}
      <line x1="100" y1="34" x2="100" y2="14" stroke={dark} strokeWidth="5" strokeLinecap="round" />
      <circle cx="100" cy="11" r="9" fill={color} className="ky-antenna-glow" />
      <circle cx="100" cy="11" r="9" fill="none" stroke={color} strokeWidth="3" className="ky-ping" />
      <ellipse cx="100" cy="226" rx="56" ry="9" fill="#000" opacity="0.28" className="ky-shadow" />
      <path d="M44 96 Q44 36 100 36 Q156 36 156 96 L156 132 Q156 170 128 188 L100 206 L72 188 Q44 170 44 132 Z" fill={`url(#${uid}-b)`} stroke={deep} strokeWidth="3" />
      <ellipse cx="74" cy="74" rx="20" ry="13" fill="#fff" opacity="0.14" />
      <Eyes color={color} happy={mood === "happy"} />
      <circle cx="60" cy="116" r="7" fill={dark} opacity="0.5" /><circle cx="140" cy="116" r="7" fill={dark} opacity="0.5" />
      <Mouth mood={mood} color={color} />
      <Chevron y={150} />
    </svg>
  );
}

export function MascotMark({ size = 30, color = "#00E5FF" }: { size?: number; color?: string }) {
  const uid = useRef(ID("pm")).current;
  const dark = shade(color, -0.45), deep = shade(color, -0.62);
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" style={{ display: "block", overflow: "visible" }} aria-hidden="true">
      <Defs uid={uid} color={color} />
      <line x1="100" y1="40" x2="100" y2="20" stroke={dark} strokeWidth="7" strokeLinecap="round" />
      <circle cx="100" cy="16" r="11" fill={color} className="ky-antenna-glow" />
      <path d="M40 96 Q40 40 100 40 Q160 40 160 96 L160 130 Q160 168 132 186 L100 204 L68 186 Q40 168 40 130 Z" fill={`url(#${uid}-b)`} stroke={deep} strokeWidth="4" />
      <ellipse cx="82" cy="98" rx="14" ry="16" fill="#04060C" /><ellipse cx="122" cy="98" rx="14" ry="16" fill="#04060C" />
      <circle cx="86" cy="92" r="4.5" fill="#fff" /><circle cx="126" cy="92" r="4.5" fill="#fff" />
      <path d="M84 150 L100 163 L116 150" fill="none" stroke="#fff" strokeOpacity="0.85" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
