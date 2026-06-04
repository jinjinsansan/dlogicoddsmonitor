import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "急騰急落オッズくん — JRAオッズの動きをリアルタイムで",
  description:
    "JRA全レースのオッズをリアルタイム監視。直前で急落・急騰した馬＝賢い金の動きを、オッズくんが見つける情報サービス(無料ベータ)。",
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
