# Issue #12 対局結果画面の検証

更新日: 2026-10-31
実装基準: `origin/main` `da15b3dade362f63774eacf8957fdd48d9c95cdc`
最終検証・公開対象SHA: `844913b1c6961c768fbfa30b5aa54ebefaf24481`
GitHub Actions: [Verify and deploy main @ 844913b](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41215069863)

## 実装前に確認した処理

- `settleRound()` が親連荘・流局・東風戦／半荘戦の終了条件を処理し、終了状態を `status: 'match-ended'` と `lastSettlement.matchEnded` で確定します。最終局の連荘中は `round-ended` のままです。
- `rankPlayers()` は持ち点降順、同点時は小さいPlayer ID順です。SPECにも同じ規則が記載されています。
- オフラインは `MatchState` と `controller.playerNames`、オンラインはサーバーが作る `PlayerGameView` の `status`・`result`・`seats`（名前・持ち点）を使えます。オンラインの再接続・CPU交代後もこのビュー復元経路を再利用し、新しい通信メッセージは追加していません。
- 通常の局結果は既存の `ResultDialog` と「結果を見る」を維持します。次局操作は既存の `next-round` 経路のままです。
- 関連Issue #13はオンライン対局後に同じルームで再戦する別仕様です。本変更ではオンラインの既存「ローカル卓へ戻る」導線を維持し、再戦状態や通信を変更していません。

## ローカル検証

| 検証 | 結果 |
| --- | --- |
| 関連単体テスト（操作状態、順位進行、対局結果ダイアログ、テンプレート、ボタン役割） | 5ファイル成功 |
| `npm test` | ローカル実装時73ファイル成功。最終SHAのActionsでは1,310件成功、失敗0、skip 0 |
| `npm run build`（TypeScript型検査を含む） | 成功 |
| `npm run typecheck:worker` | 成功 |
| Browser UI Python構文検査 | 成功 |
| `git diff --check` | 成功 |
| Codex CloudでのChromium／WebKit起動 | 未実施。既知の実行環境制限に従い、Chromiumを起動せずActionsで確認する |

初回の単体テストでは、静的ボタン数を固定した既存 `button-roles.test.ts` が失敗しました。役割クラスと `kan-test.html` のボタン数を実装に合わせて更新し、最終SHAでは全1,310件が成功しています。テストのskip、アサーション削除、タイムアウト延長はありません。

## GitHub Actionsと公開

| 対象SHA | Actions run | 結果 |
| --- | --- | --- |
| `a2505944637100a84e05c4a07548f389995ba50c` | [41212306279](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41212306279) | verify成功。docs-checkは検証記録の末尾空白で失敗。Chromium／WebKitは対局未開始時に `controller.match` を読む初期化不具合で失敗。公開はゲートによりスキップ。 |
| `30058c9ea673d2df1e4084a54dc2f803f7c01bf9` | [41212680020](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41212680020) | docs-check／verify成功。Chromium／WebKitは `browser-river-capacity.py` のオンラインコントローラーfixtureが新しい依存を渡さず失敗。公開はスキップ。 |
| `a5df29eb75b224ba398316b154b30f8f060be95c` | [41213151678](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41213151678) | docs-check／verify成功。Chromium／WebKitは共通 `main.ts` を使う `kan-test.html` にダイアログDOMがなく失敗。公開はスキップ。 |
| `4a157577dd5dc7dfd5022e789acf0827dac6f3d4` | [41213751792](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41213751792) | docs-check成功。verifyは `kan-test.html` の静的ボタン数期待値で失敗し、Browser UIは実行されず、公開はスキップ。 |
| `0e321428a57348bf4a5bccdf1615ec9ac8340620` | [41214005069](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41214005069) | docs-check／verify成功。WebKit成功。Chromiumは320pxの最終オンライン操作列で横はみ出しを検出。公開はスキップ。 |
| `844913b1c6961c768fbfa30b5aa54ebefaf24481` | [41215069863](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41215069863) | detect-changes／docs-check／verify成功。Browser UI Chromium／WebKitとマトリクス監査成功。Worker公開、Production test、Pages build、Pages deploy成功。 |

最終SHAのBrowser UIでは、Chromium 34実行、WebKit 22実行がすべて成功し、失敗・timeoutは0件でした。`browser-round-end-ui.py` も両方で成功し、4人の結果表示、開閉・再表示、名前・点数表示、スクロール、閉じるボタンの1行表示を確認しました。Pages公開先は https://ak-sekine.github.io/heibon-mahjong/ 、Workerは https://heibon-mahjong-online.ak-sekine.workers.dev です。

## iPhone Safari実機確認

未実施です。ユーザー確認後、縦画面での表示、4人の順位と最終点、長い名前、小画面スクロール、「閉じる」の1行表示、閉じる後の再表示、局結果画面の継続利用をこの記録へ追記します。自動ブラウザー検証は実機確認の代替にしません。
