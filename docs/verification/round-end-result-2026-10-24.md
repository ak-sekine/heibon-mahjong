# 流局結果概要と操作ボタン配置

確認日: 2026-10-24

対象コミット: [`5977359268f279c88638205f08e73affd86cb686`](https://github.com/ak-sekine/heibon-mahjong/commit/5977359268f279c88638205f08e73affd86cb686)

## 修正概要

- 通常流局の結果概要を「局・本場・流局」と「テンパイ者」の2行に整理。
- 途中流局では流局理由を表示。
- 流局結果の概要から点数・点数移動の表示を削除。
- 「結果を見る」と「次の局へ」を横並びに配置。
- 画面の高さに合わせて卓サイズを調整。

## 自動テスト

- 対象コミットの[Deploy workflow run 40092798153](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40092798153)で `npm test`、Worker型チェック、Pages build を含む `verify` job が成功。
- 既存の自動テスト58ファイルが成功。対象コミットのCIログではテストランナーが合計1,190件を報告しており、workflow全体も成功しています。

## Chromium / WebKit Browser UI

- 対象コミットの[Browser UI verification run 40092798219](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40092798219)が成功。
- `tests/browser-round-end-ui.py` の流局結果画面確認はChromiumとWebKitで成功。通常流局の2行概要、途中流局理由、流局概要に点数を出さないこと、結果・次局ボタンの表示と動作、ボタンの横並び、画面高に応じた卓の調整を確認。
- Chromiumは320×568、355×700、375×667、390×844、430×932、1280×800で実行。WebKitは同じ幅の確認に加えて320×480、375×547でも実行。
- これらはPlaywrightによるChromium / WebKitのブラウザー検証であり、iPhone Safari実機確認とは区別します。

## デプロイ

- [Deploy workflow run 40092798153](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40092798153)でCloudflare Workersのデプロイ、本番通信テスト、GitHub Pages build / deploy がすべて成功。

## iPhone Safari実機確認

以下は**ユーザーによるiPhone Safari実機確認の報告**です。Codexが実機で確認した結果ではありません。

- 流局時の結果概要表示: OK
- 操作ボタンの画面内表示: OK
- 操作ボタンの動作: OK
- レイアウト全体: 問題なし

## 最終状態

**実機確認済み・完了**
