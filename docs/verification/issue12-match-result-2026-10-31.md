# Issue #12 対局結果画面の検証

更新日: 2026-10-31  
実装基準: `origin/main` `da15b3dade362f63774eacf8957fdd48d9c95cdc`  
検証対象SHA: commit後に記録  
GitHub Actions: push後に記録

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
| `npm test` | 73ファイル成功、失敗0、skip 0 |
| `npm run build`（TypeScript型検査を含む） | 成功 |
| `npm run typecheck:worker` | 成功 |
| Browser UI Python構文検査 | 成功 |
| `git diff --check` | 成功 |
| Codex CloudでのChromium／WebKit起動 | 未実施。既知の実行環境制限に従い、Chromiumを起動せずActionsで確認する |

全体テストの初回実行では、静的ボタン数を固定した既存 `button-roles.test.ts` が新しいボタンを未登録として失敗しました。役割クラスとボタン数を更新して再実行し、73/73成功しました。テストのskip、アサーション削除、タイムアウト延長はありません。

## GitHub Actionsと公開

| 項目 | 結果 |
| --- | --- |
| 対象SHA | commit後に記録 |
| Actions run URL | push後に記録 |
| verify／build／Worker型チェック | Actions後に記録 |
| Browser UI Chromium | Actions後に記録 |
| Browser UI WebKit | Actions後に記録 |
| Worker／Pages deploy | Actions後に記録 |

## iPhone Safari実機確認

未実施です。ユーザー確認後、縦画面での表示、4人の順位と最終点、長い名前、小画面スクロール、「閉じる」の1行表示、閉じる後の再表示、局結果画面の継続利用をこの記録へ追記します。自動ブラウザー検証は実機確認の代替にしません。
