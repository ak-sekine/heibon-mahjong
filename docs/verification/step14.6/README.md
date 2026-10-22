# Step 14.6 検証

**実施日:** 2026-10-21
**実装記録:** [Step 14.6 — 対局中の退出者をCPUへ引き継ぐ](../../development/step-14.6.md)

## ローカル検証

| 検証 | 結果 |
| --- | --- |
| `npm test` | 成功。53/53。Worker Durable Objectの席移行、ホスト同期、連続退出、最後の人間によるルーム終了、判断窓、Alarm、再接続、退出済み資格情報の拒否を含みます。 |
| `npm run build` | 成功。アプリ側TypeScript検査とVite production build。 |
| `npm run typecheck:worker` | 成功。Worker / Durable Objectの型検査。 |
| `node --check tests/online-production.mjs` | 成功。 |
| Browser UI Python AST | 成功。`tests/browser-online-waiting-room.py`の構文解析。 |
| `git diff --check` | 成功。 |

Workerテストは、ゲームセッションとルーム席を永続化したDurable Objectハーネスを使用し、ゲームrevision・部屋revision、座席の非公開情報、ホスト操作、CPU進行、古いトークン・判断回答、同一requestId再送を確認します。CPU化前後の手牌・ツモ牌・河・副露・リーチ状態・点数・牌山・王牌・精算状態を比較します。

## ブラウザー・本番通信

`tests/browser-online-waiting-room.py`はBrowser UI Actionsで成功しました。320、375、390、430、1280pxの各幅で、CPU交代通知、新ホスト表示、CPU席の表示と非公開手牌の伏せ表示、最後の人間の退出通知を確認しています。

GitHub Actionsの[最終実行](https://github.com/ak-sekine/heibon-mahjong/actions/runs/39695865519)（`77c7eac0fb274512f524522aa6404c978c6a6aaf`）は全ジョブ成功しました。Workerのデプロイと本番通信テストも実行され、`https://heibon-mahjong-online.ak-sekine.workers.dev`で以下のシナリオが成功しています：`two-human-game-host-cpu-handoff-reconnect`、`disconnect-reconnect`、`host-handoff-one-human-three-cpu`、`four-humans-zero-cpu`、`three-humans-one-cpu`。Pages build/deployも成功し、公開先は`https://ak-sekine.github.io/heibon-mahjong/`です。

初回Actions実行（[39694858060](https://github.com/ak-sekine/heibon-mahjong/actions/runs/39694858060)）では、ブラウザーモックが退出後に閉じたルームを再利用したためUI検証が失敗しました。次の参加時に新しい待機ルームを作るよう修正し、最終実行で成功を確認しています。iPhone Safari実機確認は未実施です。
