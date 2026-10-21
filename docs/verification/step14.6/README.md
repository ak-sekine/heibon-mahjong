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

`tests/browser-online-waiting-room.py`には、退出者をCPUに置き換えた状態、既存のCPU1〜CPU3名、公開手牌の伏せ表示、残存ホストへの退出通知、新ホストの表示、最後の人間の退出通知を確認するシナリオを追加しました。Codex Cloud内のChromium起動は行っていません。Browser UI Actionsでの実行結果はmain反映後に追記します。

この環境では`ONLINE_API_URL`が設定されていないため、`npm run test:online:production`とCloudflare本番通信は実行していません。本番通信結果はGitHub Actionsで実際に確認できた場合だけ記録します。iPhone Safari実機確認も未実施です。
