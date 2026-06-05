---
name: dlogic-ops
description: 急騰急落オッズくん(oddskun.com)とnetkeita(netkeita.com)の稼働状況・データ・ログを確認して日本語で報告する。jinが「オッズくん どう?」「netkeita 大丈夫?」「サイト落ちてない?」「監視状況」「文字化けしてない?」「ログ見て」等と聞いたら使う。調査・報告のみで、修正/再起動/データ再生成は確認なしに行わない。
---

# dlogic 運用チェック（調査・報告）

jin が **オッズくん / netkeita / dlogic** の状況・稼働・データ・ログについて尋ねたら、以下で調べて簡潔な日本語で報告する。

## ① まず素早い状況確認（公開エンドポイント・推奨）
```bash
python3 /root/.hermes/skills/dlogic/dlogic-ops/check_status.py
```
出力に各サービスが🟢/🔴で並ぶ。**🔴があれば「ここが異常」と強調**して報告。多くの質問はこれだけで足りる。

## ② より詳しく調べる時（VPSへSSH・読み取りのみ）
鍵とホスト:
```bash
ssh -i /root/.ssh/dlogic.pem -o StrictHostKeyChecking=no root@210.131.208.243 '<コマンド>'
```
使ってよい**読み取り専用**コマンド例:
- サービス稼働: `systemctl is-active dlogic-odds-monitor dlogic-backend dlogic-linebot netkeita-api nginx redis-server`
- 監視ログ: `tail -n 30 /opt/dlogic/odds-monitor/logs/health_check.log`
- 静的JSON生成ログ: `tail -n 20 /opt/dlogic/odds-monitor/logs/static_build.log`
- 通知ジョブログ: `tail -n 20 /opt/dlogic/odds-monitor/logs/push_sender.log`
- サービスのジャーナル: `journalctl -u dlogic-odds-monitor --no-pager -n 30`

## 各項目の意味
- **オッズくん**: targetLabel=対象開催日 / mode=preview(事前情報)・live(開催中)・finished(結果)。更新が20分以上前=静的JSON生成停止の疑い🔴。開催日(土日)日中に急変0件=Lightpandaのオッズ取得失敗の疑い🔴。
- **netkeita**: その日のレース数＋文字化け検査。会場名が既知でない/空=**文字化け疑い**🔴（過去にnetkeibaのUTF-8移行で全化け障害あり）。
- **公開サイト**: HTTP200=正常。

## 厳守（安全のため）
- 既定は **調査と報告だけ**。**サービス再起動・ファイル編集・プリフェッチ再生成・設定変更は、jinが明示的に指示し、かつ実行前に内容を伝えて確認を取ってからのみ**行う。
- 異常を見つけたら「○○が異常です。対処として△△が考えられます」と**提案に留め**、自動では直さない。
- 別途VPS上で15分毎の常時監視cronが動いており、異常時はTelegramへ自動通知される。本スキルは「今すぐ知りたい/深掘りしたい」時用。
