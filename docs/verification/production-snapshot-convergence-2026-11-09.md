# Production Worker snapshot比較競合の修正

実施日: 2026-11-09

## 調査対象と開始状態

- 対象: [Production Worker diagnostics 42565425036](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42565425036)、job `128990785760`。
- 開始ブランチ: `work`。開始HEADとfetch後のorigin/main: `fae95aa4456514b742cf4949fb0bcf6d753d8c36`。behind/ahead `0/0`、未コミット変更・未pushコミットなし。
- remote: `https://github.com/ak-sekine/heibon-mahjong.git`。
- 通常sandboxのfetchはproxy port 8080への接続に失敗。同じfetchを正規の許可付き実行で成功。GitHub APIも通常sandboxではsocket権限エラー、許可付きでは利用可能。元jobのログはGitHub connectorから取得した。

元ログでは再接続guestの最初のsnapshotがrev5（経過12,417ms）、hostがrev6（12,456ms）だった。その後host rev7（12,557ms）、guest rev7（12,558ms）まで受信しているが、最初のsnapshotを固定した比較が`host 6, guest 5`として失敗した。状態更新は届いており、最初の通知を選ぶテスト側の競合を確認できる。

## 比較処理の変更

- 変更前: 各クライアントの最初の条件成立snapshotを`Promise.all`で取得し、revisionだけを即比較。
- 変更後: `waitForMatchingGameStates`で両ソケットを監視してから状態を各1回要求する。開始前の通知はrevision下限にのみ使用し、成功には使用しない。開始後の最新snapshotだけを各クライアントに保持し、低いrevisionの遅延通知・履歴上の一致へ戻らない。
- 両最新revisionの一致を単一の15秒期限内で待つ。更新で期限は延長せず、通知処理時にも絶対期限を確認する。固定sleep、ポーリング、再試行は追加していない。
- 対象room、既知の認証済みviewerSeat/self.seat、4席、手番・局情報・点数・山枚数等の基本形、本人の手牌、両人間席の接続を確認する。`playing`／`round-ended`／`match-ended`を許可し、`aborted`や不完全な状態は失敗する。再接続だけではrevisionが増えないため、下限と同じrevisionでも新しく受信した有効状態なら使用できる。
- 公開共通状態を深く比較する。除外は`viewerSeat`、`self`、各席の`hand`／`drawnTile`だけ。河、副露、公開手牌、枚数、点数、接続、局情報、ルール、宣言、責任払い、結果と将来追加される共通フィールドを比較に残す。
- 同revisionの内容不一致は即失敗し、後続の一致で隠さない。非収束、無通信、切断、socket error、要求送信例外、期限超過も失敗。成功・失敗時にタイマーと全リスナーを解除する。
- 両方向のMixed-Origin再接続と、その直前の打牌後比較に適用。既存7シナリオ、拒否Origin・不正ticket・privacy検証は維持。
- 診断ログに比較revision、各最新状態の受信時刻（epoch ms）、待機開始時刻・経過時間、方向・処理段階、失敗理由・不一致フィールド名を記録。手牌やトークンを追加ログに出さない。

## ローカル検証

| 検証 | 結果 |
| --- | --- |
| `node tests/online-production-sync.test.ts` | 59/59成功。既存18ケースを維持し、41ケース追加。 |
| `npm test` | 86/86テストファイル成功。 |
| `npm run build` | 成功。TypeScript検査を含む。 |
| `npm run typecheck:worker` | 成功。 |
| `node --check`（production本体とsync helper） | 成功。 |
| `git diff --check` | 成功。 |

追加テストは、両方向の視点で6/5→7/7、複数CPU更新、古い通知の後着、過去の一致履歴・revision下限未満の排除、期限の非延長、遅延タイマー、無通信、切断・error・要求失敗、不正状態、接続フラグの回復、同revisionの各共通フィールド不一致、正常な進行・局終了・対局終了を検証する。時刻・期限・到着順を制御し、ネットワークや固定sleepに依存しない。

## CI・公開への影響

mainへの実装push後、対象SHAの既存Chromium／WebKit検証とProduction Worker diagnosticsを確認し、この節に結果を追記する。

変更範囲はテスト3ファイルと本検証文書だけ。Worker本体、通信プロトコル、ゲーム進行、UI、CI構成は変更していない。アプリケーション変更を含まないため通常は再公開不要だが、既存の公開判定は保持し、実際のActions結果で公開有無を確認する。iPhone Safari実機は今回の自動検証対象外。
