# オッズ急落くん ネイティブアプリ化 検討メモ

作成: 2026-06-06 / 対象: https://www.oddskun.com （Next.js App Router + Vercel, PWA）

> 結論：**技術的には複雑ではない**（既に完全なPWAなので「ガワで包む」だけ。書き直し不要）。
> 本当の難所は **コードではなくストア審査（特にApple）と Push通知の移行**。

---

## 現状（アプリ化の8割は完了済み）
`frontend/` は既に**完全なPWA**：
- `public/manifest.webmanifest`（マニフェスト）
- アイコン一式：`icon-192.png` / `icon-512.png` / `apple-touch-icon.png` / `icon.svg` / `favicon-32.png`
- `public/sw.js`（Service Worker）
- `src/lib/push.ts`（Web Push / VAPID。iOS Safari PWA・Androidで通知動作中）
- `src/app/layout.tsx` で manifest・viewport 設定済み

→ 既に**ホーム画面追加でアプリ風に使え、Push通知も動作している**。

---

## 方法の選択肢（労力順）

| 方法 | 対象 | 労力 | 中身 |
|---|---|---|---|
| **PWAのまま** | iOS/Android | ゼロ（済） | ホーム画面追加で既にアプリ風・Push動作中 |
| **PWABuilder → TWA** | **Android** | 小（数日） | PWAからPlay Store用パッケージを自動生成。Chromeで包む(TWA) |
| **Capacitor で包む** | iOS/Android | 中 | WebViewネイティブアプリ化。ストア対応・ネイティブPush(FCM/APNs) |
| ネイティブ書き直し(RN/Flutter) | — | 大 | この種のアプリには不要・非推奨 |

---

## 本当の難所は2つ

### ① Apple審査（最大のリスク）🍏
- オッズくんは**競馬オッズ＝ギャンブル隣接**。Appleは厳格：
  - **17+指定**が必要になる可能性大
  - 「**賭けを助けない情報/エンタメ**」と明確に位置づけ・免責が必要
  - 地域によるギャンブル規制対応を求められることがある
  - 最悪、リジェクトの可能性も想定
- **Google Playは比較的寛容**（競馬情報アプリはほぼ通るが、ギャンブルポリシーには配慮）

### ② Push通知の移行
- **Android（TWA）**：今の **Web Push がそのまま動く**（楽）
- **iOS（WebViewネイティブ）**：iOSのWKWebViewはWeb Push制限あり → ネイティブ化するなら
  **APNs（Apple Push）対応**が必要（Capacitorが橋渡し）。
  ※現状の VAPID Web Push は iOSの「PWA(ホーム画面追加)」では動くが、WKWebViewラッパーでは別対応。

---

## 費用
- **Google Play**：$25（買い切り）
- **Apple Developer Program**：$99 / 年

---

## 労力の体感
- **Android：数日**（PWABuilderで生成 → 申請）
- **iOS：審査次第で読めない**（コードより審査が律速）

---

## おすすめの進め方（フェーズ）
1. **まず Android（PWABuilder → Play Store）**
   - 労力小・寛容・**今のWeb Pushがそのまま動く**
   - 短期で「ストアにある」状態を作りユーザー獲得/信頼性UP
2. **次に iOS（Capacitor でラップ）**
   - Apple審査を見据え「情報/エンタメ・17+・賭け非助長」で整える
   - Push は APNs 対応 or PWA運用を継続

> どちらも**既存Webをそのまま表示**するので、本体の改修は最小限。
> サイトを更新すればアプリにも即反映（WebViewのため）。

---

## 次アクション候補
- [ ] `manifest.webmanifest` がストア(TWA/PWABuilder)要件を満たすか点検（name/short_name/icons/display/start_url 等）
- [ ] PWABuilder でAndroidパッケージ試作 → Play Console 申請
- [ ] Apple Developer 登録 → Capacitorラップ → 審査用に「情報/エンタメ・免責・17+」を整備
- [ ] iOS Push を APNs 対応するか、PWA運用を継続するか方針決定

---
_関連: `RESUME_ODDS_KYURAKU.md`（設計正本）, `docs/BETA_SITE_DESIGN.md`（サイト設計）, `HANDOFF_20260606.md`。_
