import type { Metadata } from "next";
import { Fira_Sans, Fira_Code } from "next/font/google";
import "./globals.css";

const firaSans = Fira_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});
const firaCode = Fira_Code({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "オッズ急落くん — JRAオッズの動きをリアルタイムで",
  description:
    "JRA全レースのオッズをリアルタイム監視。直前で急落した馬=賢い金が入った馬を可視化する情報サービス(無料ベータ)。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" className={`${firaSans.variable} ${firaCode.variable}`}>
      <body className="bg-base text-ink min-h-screen">{children}</body>
    </html>
  );
}
