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

実装コミット: [`bdca9e56ba3aa5fc34c64323ef2765c2de4a5f1c`](https://github.com/ak-sekine/heibon-mahjong/commit/bdca9e56ba3aa5fc34c64323ef2765c2de4a5f1c)。PRを作らず`HEAD:main`へfast-forward pushし、`git ls-remote`でも同SHAを確認した。

| Actions | 対象SHA | 結果 |
| --- | --- | --- |
| [Deploy/CI 42710900478](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42710900478) | `bdca9e5` | 失敗。verify成功、Chromium成功、WebKit失敗。matrix auditもWebKit失敗を検出して失敗。 |
| [Production diagnostics 42710915285](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42710915285) | `bdca9e5` | 成功、7/7シナリオ。 |
| [Production diagnostics 42711143474](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42711143474) | `bdca9e5` | 成功、7/7シナリオ。 |
| [Production diagnostics 42711941425](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42711941425) | `bdca9e5` | 成功、7/7シナリオ。 |
| [Browser UI再検証 42712350604](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42712350604) | `bdca9e5` | 全体成功。Chromium 45/45、WebKit 35/35成功。同じテスト条件で1回追加実行。 |

1回目の診断ログ（job `129479907833`）の比較結果:

| 方向 | 段階 | 比較revision | 待機ms | host受信時刻(epoch ms) | guest受信時刻(epoch ms) |
| --- | --- | ---: | ---: | ---: | ---: |
| Pages→secondary | 打牌後 | 3 | 8 | 1794262837520 | 1794262837518 |
| Pages→secondary | 再接続 | 5 | 54 | 1794262838073 | 1794262838068 |
| secondary→Pages | 打牌後 | 3 | 63 | 1794262840615 | 1794262840615 |
| secondary→Pages | 再接続 | 3 | 79 | 1794262841168 | 1794262841089 |

secondary→Pagesの打牌後はhost rev3／guest rev2の一時差をログに記録し、rev3へ収束して成功した。再接続区間自体にはこの実行でrevision差を観測していない。snapshot失敗・タイムアウトはなかった。元の6/5→7/7の到着順と複数CPU更新は決定的な単体テストで検証しており、本番の偶発的な再現と区別する。

2回目（job `129480683317`）も全比較が`reason: matched`。revision差・snapshot失敗・タイムアウトはなかった。

| 方向 | 段階 | 比較revision | 待機ms | host受信時刻(epoch ms) | guest受信時刻(epoch ms) |
| --- | --- | ---: | ---: | ---: | ---: |
| Pages→secondary | 打牌後 | 5 | 23 | 1794262923259 | 1794262923263 |
| Pages→secondary | 再接続 | 5 | 1 | 1794262923736 | 1794262923736 |
| secondary→Pages | 打牌後 | 3 | 12 | 1794262926214 | 1794262926214 |
| secondary→Pages | 再接続 | 3 | 37 | 1794262926725 | 1794262926689 |

3回目（job `129483475352`）も全比較が`reason: matched`。両方向の打牌後でhost rev3／guest rev2からrev3に収束した。再接続区間自体のrevision差、snapshot失敗・タイムアウトは観測していない。

| 方向 | 段階 | 比較revision | 待機ms | host受信時刻(epoch ms) | guest受信時刻(epoch ms) |
| --- | --- | ---: | ---: | ---: | ---: |
| Pages→secondary | 打牌後 | 3 | 14 | 1794263240627 | 1794263240629 |
| Pages→secondary | 再接続 | 3 | 53 | 1794263241080 | 1794263241028 |
| secondary→Pages | 打牌後 | 3 | 10 | 1794263242926 | 1794263242927 |
| secondary→Pages | 再接続 | 7 | 2 | 1794263243388 | 1794263243388 |

成功した既存7シナリオは`two-human-game-host-cpu-handoff-reconnect`、`disconnect-reconnect`、`host-handoff-one-human-three-cpu`、`four-humans-zero-cpu`、`three-humans-one-cpu`と、両方向の`room-and-game-sync`。本番診断は同じ実装SHAで3回手動起動し、失敗による再実行は行っていない。

### WebKit初回失敗の調査

初回Chromium job `129480624140`は45/45スクリプト成功（suite約919.49秒）。局結果テストも6 viewportすべて成功し、前後のitch smokeと制御された失敗の診断検証も成功した。環境はPlaywright 1.65.0／Chromium revision 1254（Chrome 158.0.8127.18）。

CI attempt 1のWebKit job `129480624228`で、既存`tests/browser-round-end-ui.py:761`が失敗した。1280×800で対局結果を閉じて`#show-result`を押した後、局結果ダイアログが開かなかった。ログと失敗画像では`resultOpen=false`、`resultDisplay=none`、`matchOpen=false`、`newGameOpen=false`、`showResult.hidden=false`／`disabled=false`、`activeElement=show-result`、`status=match-ended`、`hasSettlement=true`、開いているdialogなし。実際にダイアログが開いておらず、単なる可視性判定の誤検知とは確認できない。

- このブラウザーテストはproduction snapshot helperを読み込まない。対象ブラウザーテストと`src/ui/result-dialog.ts`は直前の実ブラウザー成功run [42563507924](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42563507924)と同一。直前のDeploy run `42565378053`は文書のみで両ブラウザーがskipされていたため、ブラウザー成功の根拠に使わない。
- 成功時はPlaywright 1.64.1／WebKit 2370、今回は1.65.0／2388。Ubuntu 26.04・runner image `20261101.186.1`・Python 3.12.16は同じ。ただし旧版にも再表示付近の既知の失敗記録がある（[既存調査](issue32-responsive-layout-2026-11-03.md)、run `42454352930`）ため、バージョン更新を原因と断定しない。
- 初回ログと画像を保持した（Actions artifact `browser-ui-webkit-bdca9e56ba3aa5fc34c64323ef2765c2de4a5f1c-1`、id `13715783295`）。click配信と開閉順序を区別するイベント記録がなく、原因は未確定。条件緩和・固定sleep・アプリ変更は行わず、同じコミット・テストを既存Browser UI workflowで1回追加実行して再現性を確認する。単一jobの再実行ではattempt別のbuild artifactが不足する構成のため、buildと両ブラウザーを含む既存workflowを手動起動した。初回失敗は取り消さない。

追加WebKit job `129485601060`は35/35シナリオ成功（suite 658.746秒）。`browser-round-end-ui.py`も131.704秒で、1280×800と短いスマホ2サイズを含む8 viewportすべて成功した。前後のitch smoke各3回と、意図的な失敗による診断検証も成功。環境は初回失敗と同じPlaywright 1.65.0／WebKit 2388・Ubuntu 26.04 image `20261101.186.1`・Python 3.12.16。artifact `13716059750`に結果を保持している。同条件で成功したことは間欠的な失敗と整合するが、再表示問題の修正を意味しない。根本原因は未確定のまま残る。

追加Chromium job `129485601123`も45/45スクリプト成功、タイムアウトなし。suiteは22:31:45.273–22:44:39.440 UTC（約774.17秒）。環境は初回Chromiumと同じPlaywright 1.65.0／Chromium revision 1254。前後のitch smokeと意図的な失敗の診断検証も成功し、追加Browser UI workflow全体は`success`になった。初回Deploy/CIの失敗を、追加実行の成功で成功扱いに読み替えない。

残る未確認事項は、既存WebKit結果再表示の間欠的失敗の根本原因、元の6/5→7/7という再接続到着順の本番での再現、iPhone Safari実機。snapshot比較の当該到着順と異常系は単体テストで確認済みだが、有限回の本番成功を将来の全競合の解消証明にはしない。

変更範囲はテスト3ファイルと本検証文書だけ。Worker本体、通信プロトコル、ゲーム進行、UI、CI構成は変更していない。公開判定は`validation-only`、`deploy_required=false`、`pending_release=false`、`state_reliable=true`だった。初回CIでWorker deploy、Pages build／deploy、deploy用production-testはすべてskip。WorkerとPagesの再公開は行われていない。本番検証は上記3回の独立したdiagnostics workflowで実行した。iPhone Safari実機は今回の自動検証対象外。
