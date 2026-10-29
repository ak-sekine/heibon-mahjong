# Issue #21 リーチ次局・オンラインCPU進行の回帰検証 — 2026-10-29

[Issue #21](https://github.com/ak-sekine/heibon-mahjong/issues/21)では、[Issue #7の原因調査](browser-ui-issue7-investigation-2026-10-29.md)で確認した別々のテスト不具合を固定局面で検出する。ゲーム本体の仕様・動作は変更しない。

作業開始時HEADは `e6808ee39a33d7abaa5deaaa1a29fce468d0777b`、fetch後のorigin/mainは `976ae62180fde61c169574af92c1f97d9809340d`、作業ツリーはclean。最新mainを基準に作業した。

## 回帰テストと固定局面

- A：`tests/browser-online-waiting-room.py` のmockで東1局のリーチ結果を作り、宣言牌IDが河に存在し描画されることを確認して結果を開き、「次の局へ」で東2局に進む。全席の河・リーチ・宣言牌参照の初期化、描画済みの河、局表示、結果画面の非表示、未処理ページ例外を確認する。単独実行用の `HEIBON_ONLINE_NEXT_ROUND_ONLY=1` を設け、Browser UI manifestにもChromiumとWebKitの各シナリオを登録する。
- B：`tests/online-game.test.ts` は `callStart` の136枚の固定牌山・手牌・ツモで、人間0の打牌後にCPU席1が東を打ち、CPU席2がその牌をポンし打牌、人間席3へ戻る遷移を実際のオンラインゲーム処理で検証する。打牌履歴、ポンの牌ID・出所、CPU席1の空の河、revision 10→15、phase、playing、手番を確認する。席番号は0始まりであり、この固定fixtureのCPU表示名はPlayer 1・Player 2である。
- `tests/cpu-progress.ts` の判定を既存の `tests/step14-0-1.test.ts` でも使い、revisionと打牌履歴・副露履歴を参照する。人間の打牌だけではCPU進行としない。既存の乱数固定は維持する。

## 検出能力

Bは隔離した一時変更で旧来のCPU席1の河のみの判定を適用すると固定テストが期待どおり失敗した。現行判定では成功。Aは初期化行を除去すると空の河と宣言牌参照が不整合になることを検出する設計だが、ブラウザーを起動できずmutation検証は未実施。テスト用の一時変更は含めない。

## 前回ローカル実行結果

| 検証 | 結果 |
| --- | --- |
| A単独・反復 | Chromiumは環境の既知の起動制限により未実行。WebKitは起動失敗、ブラウザーのインストールも403で失敗。反復未実施。 |
| B単独・反復 | 単独成功、20回中20成功・0失敗。 |
| 関連テスト | オンラインゲーム・Step 14.0.1の2ファイル成功。 |
| npm test | 67ファイル成功、失敗0、skip 0。親テストのタイムアウトは観測されなかった。 |
| build、Worker型チェック、diff check | 成功。 |
| Chromium／WebKit Browser UI全体 | 未確認。WebKitの限定シナリオは全フローの代替ではない。 |

## 前回時点の未確認事項とIssue #22

ブラウザーでのAの実行・反復・mutation、Chromium／WebKit全体、iPhone Safari実機、Actionsと公開結果は未確認。[Issue #22](https://github.com/ak-sekine/heibon-mahjong/issues/22)の親テスト30秒タイムアウトは別件で、タイムアウト延長・skip・CI順序変更は行っていない。原因は未特定であり、Issue #22自体は変更しない。

## 専用ブランチでのCI検証

検証中。開始時HEADと最新origin/mainはいずれも `976ae62180fde61c169574af92c1f97d9809340d`。未コミット差分と未追跡ファイルを `/workspace/issue21-backup` に保存し、`test/issue-21-browser-regression` に移した。検証対象は `05848b334ac5eb73cb0f105337823a8d617cdcd8`。mainには未反映。

静的レビューで東1局のリーチ宣言牌が河に存在すること、結果から次局を操作すること、次局mockの宣言参照・河の初期化と東2局表示、例外捕捉を照合した。描画検証の無効化や次局状態の補正はない。旧不具合時に局表示待ちだけでタイムアウトしないよう、状態または例外を先に観測し直接assertする。

[正常系run 40897247248](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40897247248) は成功。npm testとbuild成功、Browser UI 52件（Chromium 33、WebKit 19）成功。A専用シナリオはChromium・WebKitとも成功、Chromium待機室全フローも成功。WebKit待機室はA専用および限定シナリオで、待機室全フローではない。BはCIのnpm testで成功し、既存オンラインテストも成功した。B単独20回および旧判定の検出は前節のローカル結果。Aの20回反復は未実施。

[異常系run 40897377113](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40897377113) は別ブランチ `test/issue-21-mutation-check` の `c6aa244918307362cc8329146f79b5f8af3c7f0c` で、次局mockの宣言参照初期化のみを意図的に無効化した。同じworkflowのChromium Aが `Riichi declaration tile reference is missing from online seat 0` のRangeErrorを直接assertして失敗し、タイムアウトではなかった。正常系Chromium Aの成功と比較して検出を確認。manifestは最初の失敗で停止するため異常系WebKitは未実行。意図的変更は正常系やmainに含めない。異常系ブランチ先端では `3c214055443250d8fcde4af87466be865e3c42c1` で初期化を復元し、対象ファイルが正常系検証commitと一致することを確認した。

Worker型チェックとdiff checkは前回ローカルで成功。実機検証、Aの反復とWebKit異常系は未確認。Issue #22は変更していない。
