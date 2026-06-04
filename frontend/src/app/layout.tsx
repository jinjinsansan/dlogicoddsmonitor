import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "オッズ急落くん — JRAオッズの動きをリアルタイムで",
  description:
    "JRA全レースのオッズをリアルタイム監視。直前で急落した馬＝賢い金が入った馬を、急落くんが見つける情報サービス(無料ベータ)。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
