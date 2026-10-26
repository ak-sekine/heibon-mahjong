# CPU手番フリーズ修正・診断ログ強化（2026-10-26）

## 発生状況

2026-10-25、iPhone Safariのオフライン4人対局（人間1人・CPU3人）で、東1局・山残り36枚・自分の河9枚の状態からCPU2手番中に停止したと報告された。CPU2の席情報が強調され、操作欄は「局を進めています。」、打牌ボタンは表示されず、数分待っても進まなかった。採取された診断ログは `page_resumed` のみで、CPU処理・描画例外は含まれていなかった。

## 前回調査結果と暫定原因

前回の決定的な再現では、CPU2のリーチ宣言牌をCPU1がポンし、宣言牌がCPU2の `river` から外れた後も `discardHistory` と `riichi.declarationTileId` に残る状態を確認した。描画が宣言牌を河だけから検索し、次の例外を発生させた。

`RangeError: Riichi declaration tile is missing from player 2's river`

この経路ではゲーム状態は次のCPU手番へ進む一方、描画が止まって画面は古い状態のままになる。本記録ではこれを**暫定原因**として修正した。2026-10-25の実機フリーズがこの例外と同一原因だった証拠はなく、原因は未確定である。別の18枚超の河描画経路は[前回の調査記録](mahjong-freeze-investigation-2026-10-25.md)を参照。

不具合の確認状態:

- リーチ宣言牌を鳴いた後の描画例外：修正・自動テスト済み。
- 2026-10-25の実機フリーズ：暫定原因への対策済み。同一原因だったかは未確定。
- 再発時の原因調査：診断ログ強化済み。実機ログでの追跡は未確認。

## 修正内容

- リーチ宣言牌が河に1枚だけある場合は、従来どおり物理IDで識別し横向き表示する。
- 河にない場合は、宣言者の履歴に同じ物理IDが1枚あり、他家の公開副露1つについて鳴き元・鳴き先・`calledTileId`・副露牌配列がすべて一致するときだけ、正常な鳴きとして扱う。その牌は河へ戻さず、河の通常レイアウトを描画する。
- 宣言牌が河に重複する、履歴が重複する、対応する公開副露がない、または副露内の物理IDが一致しない場合は不整合とし、既存の `RangeError` を維持する。描画呼出元で位置・エラー名・短い秘匿除去済みメッセージ・エラーIDを記録して例外を再送出する。
- `riichi`、供託、点数、打牌履歴、鳴き状態、手番を描画処理から変更しない。オンラインの公開View描画も同じ参照判定を使う。

## 追加した診断ログ

ブラウザーの既存診断ログ（同一タブの `sessionStorage`、最大200件）を利用する。満杯時はINFOから先に退避し、WARN/ERRORを優先する。描画例外のメッセージは牌種・牌ID候補、URL、長い識別子、token等をマスクする。非公開手牌、牌山、リクエスト本文、認証情報は記録しない。

- CPU: `local_cpu_turn_started`、`local_cpu_turn_completed`、`local_cpu_turn_failed`。席、手番ID、開始・終了フェーズ、時間、終了理由、エラー名・コードを記録する。
- Runner: `local_runner_started`、`local_runner_completed`、`local_runner_failed`、`local_runner_cancelled`。完了ログは現在フェーズと判断待ち状態を含む。
- 待機: `local_cpu_wait_timer_started`、`local_cpu_wait_timer_fired`、`local_cpu_wait_timer_interrupted`。待機種別、予定・実経過時間を記録する。CPU探索内の `setTimeout(0)` ごとのログは出さない。
- 進行: `local_game_state_transition`、`local_decision_wait_started`、`local_decision_wait_released`、`local_decision_wait_transition`、`local_cpu_to_human_wait`、`local_round_ended`。
- 異常・復帰: `local_game_render_failed`、`local_cpu_turn_stalled`、`window_error`、`unhandled_rejection`、`local_runner_completion_callback_failed`。
- 30秒を超えた未完了CPU手番はWARNを1回記録する。警告はゲーム状態を変えず、手番を飛ばさず、タイムアウトで対局を終了しない。ページ復帰時にも経過時間を確認する。

ログ上で最後のCPU手番開始と完了を手番IDで照合できる。CPU手番開始後に完了がなければ、最後のRunner状態、待機タイマー、処理中／待機中、最後のフェーズ、残っている判断待ちを確認できる。最後の描画失敗には席・河枚数・フェーズ・エラー名・秘匿除去済みメッセージ・発生箇所・エラーIDを含める。

## 再現テスト

`tests/riichi-river.test.ts` にCPU2のリーチ宣言牌をCPU1がポンする決定的な実ゲーム経路を追加した。配牌・宣言・CPUポンを既存ゲームAPIで実行し、鳴かれた宣言牌が履歴とリーチ状態に残り、河には復元されず、宣言者の点数と供託が維持されることを検証する。描画後にRunnerを進め、鳴き後の打牌と次席への進行、描画更新、次の人間向け判断待ちとUI表示の一致を確認する。

追加ケース:

- 河に残る宣言牌の従来表示（既存の全席・河位置テスト）。
- リーチ宣言牌のポン・チー・大明槓後の描画。大明槓は既存ルールの合法な局面で確認。
- リーチ状態、履歴、供託、点数、牌在庫の維持。
- 副露の実牌IDまで含む正常な鳴き判定と、履歴・鳴き根拠・重複IDの不整合拒否。
- オフラインRunner後の手番・河・操作欄の一致。
- オンラインの公開Seat/Meld Viewから共通レイアウト判定への回帰。
- 診断ログのCPU開始・完了・失敗、タイマー発火・中断、進行監視、描画失敗情報、グローバル例外重複識別、秘匿除去、200件上限と異常ログ保持。

## 自動テスト・ビルド

- `npm test`: 成功（62ファイル、62 passed、0 failed、skippedなし）。
- `npm run build`: 成功（TypeScriptチェックとVite production build）。
- `npm run typecheck:worker`: 成功。
- `git diff --check`: 成功。
- Chromium/WebKit Browser UIシナリオと既存シナリオのPython構文確認: 成功。

## ブラウザー検証

Codex Cloud内ではブラウザーを起動していない。リポジトリの [`AGENTS.md`](../../AGENTS.md) と[環境既知制限](codex-cloud-chromium.md)に記録された、この環境のChromium Crashpad初期化時 `SO_PASSCRED` の `EPERM`／ページを開く前の `SIGTRAP` 制約があるため、同一条件での起動は繰り返さない。

- GitHub Actions Browser UI run [40315925328](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40315925328)、commit `3004ead02eb84703323925713596320dd75e7721`: `browser-table-ui.py` の300 sceneと今回追加したCPU2リーチ牌ポンの専用シナリオが成功。専用シナリオはChromiumとWebKitの両方で成功し、CPU1の手番・供託・非公開手牌のDOM非表示を確認した。
- 同runの後半で `browser-online-waiting-room.py` が結果表示を待つテストに失敗した。mockが和了者をリーチ中として返しながら公開宣言牌をriverに含めていなかったため、共通描画処理が不整合を検出した。mock fixtureを[commit `70173e7`](https://github.com/ak-sekine/heibon-mahjong/commit/70173e7450f2f56e151ef18e34a95ccc5d5048c4)で修正し、和了者の公開宣言牌を含めた。
- 最終fixture修正後のrun [40317932010](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40317932010)、commit `70173e7450f2f56e151ef18e34a95ccc5d5048c4`: `npm test`とproduction buildは成功。記録時点（2026-10-26 12:00 UTC）で、開始から約10分経過した `playwright install --with-deps chromium webkit` がまだ実行中のため、その後の全Browser UI suite結果は未確定。

2026-10-26にGitHub Actionsの実際の最終状態を確認した。修正コミット `ed5033a15a2d10d23fa825200e8b05a0bfc4e251` が `main` の先頭で、このコミット自体は `[skip ci]` のためActions runはない。直前のfixture修正コミット `70173e7450f2f56e151ef18e34a95ccc5d5048c4` のBrowser UI run [40317932010](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40317932010) は **failure** で終了した。`npm test`、production build、PlaywrightのChromium/WebKit installは成功したが、`browser-online-waiting-room.py` が結果後の `東2局` 表示を30秒待ってタイムアウトした。専用のリーチ宣言牌ポンシナリオの成功を含む前段のシナリオ記録は残っているが、このrun全体を成功とは扱わない。関連するDeploy run [40317931989](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40317931989) では `npm test`、Worker型チェック、Pages buildを含むverify jobは成功し、Browser UI jobは同じ理由で失敗、後続のdeploy jobはskipされた。

この記録を反映した文書のみのコミット `5c56604e1cc0e2842d2c75de2287c8dee02d4f26` に対してもActions run [40331396230](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40331396230)（Browser UI）と[40331396181](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40331396181)（Deploy）が起動した。2026-10-26 13:38 UTC時点では両方in progressで、Browser UIは「Vite and browser regressions」を実行中だったため、最終結果は未確認。このrunは検証記録・README・ROADMAPのみを変更したコミットに対するもので、ゲーム本体・テスト・診断ログ実装を変更していない。

上記のChromium/WebKit確認はGitHub ActionsのLinux browser CIであり、iPhone Safari実機確認とは区別する。

## 未確認事項

- 2026-10-25の実機フリーズがリーチ宣言牌の描画例外と同一原因だったかは未確定。
- CPU2のリーチ宣言牌をCPU1が鳴く特定局面のiPhone Safari実機確認は未実施。今回の半荘戦実機確認ではこの局面を再現していない。
- 強化したCPU手番・Runner・状態遷移の診断イベントがiPhone Safari実機で記録されることは未確認。今回提示されたログにはこれらのイベントが含まれていない。
- バックグラウンド復帰時の実機タイマー遅延と、実機でのCPU診断イベントの記録動作は未確認。
- 修正コードを含む直前のBrowser UI Actions runは[失敗](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40317932010)。結果後の局表示待ちタイムアウトであり、全Browser UI suite成功とは確認できていない。文書のみの後続runは進行中で、[実行状況](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40331396230)の最終結果は未確認（2026-10-26 13:38 UTC時点）。
- 診断ログの例外メッセージ除去は既知のID・牌表記パターンと長い識別子を対象にする。Safariが生成したすべての例外文字列を網羅する保証はない。

## iPhone Safari実機確認項目

1. オフラインCPU3人対局でCPU2がリーチし、その宣言牌をCPU1がポンした後、河を含む画面が更新されCPU1の手番・操作表示が進む。
2. 可能なら同じ宣言牌のチーと合法な大明槓でも描画が継続し、鳴かれた牌が元の河に戻らない。
3. ポン後に自分の手番へ戻るケースで、内部手番・強調席・操作欄・打牌ボタンが一致する。
4. メニューの診断ログにCPU開始・完了、必要に応じ待機タイマーとフェーズ遷移が記録される。ログに非公開手牌・山の順序・牌ID・tokenがない。
5. 対局中にSafariをバックグラウンドへ移動して復帰する。停止があれば `page_resumed`、未完了手番、待機中／処理中、停滞警告の前後関係を保存する。
6. 描画例外が発生した場合は、画面を握りつぶさず `local_game_render_failed` にフェーズ・河枚数・エラー名・発生箇所・エラーIDが残る。

実機確認前に作成した当時の記録。現在の判定は次の追記で更新する。

## 2026-10-26 実機検証・完了判定の追記

### ユーザー報告によるiPhone Safari実機検証

- 検証日：2026-10-26
- 検証者：ユーザー（ユーザーからの実機確認報告）
- 環境：iPhone Safari
- 対局：オフライン、CPU3人
- 対局形式：半荘戦
- 結果：半荘戦を最後まで正常にプレイできた。対局進行に問題はなく、CPU手番中のフリーズは再発しなかった。

これはユーザーによるiPhone Safari実機確認であり、Codexが端末を操作・検証したものではない。CPU2のリーチ宣言牌をCPU1がポンする特定局面は実機で再現していないため、その個別ケースのiPhone Safari実機確認済みとはしない。

### 提示された診断ログ

```text
2026-10-26T12:23:38.077Z INFO page_resumed {"source":"visibilitychange"}
2026-10-26T12:23:41.242Z INFO page_hidden {"source":"pagehide"}
2026-10-26T13:01:59.150Z INFO page_resumed {"source":"visibilitychange"}
2026-10-26T13:07:13.512Z INFO page_resumed {"source":"visibilitychange"}
2026-10-26T13:25:27.932Z INFO page_resumed {"source":"visibilitychange"}
```

- INFOは5件。`page_resumed` は4件、`page_hidden` は1件。
- 提示されたログにWARN・ERRORは含まれていない。これは実行中に例外が一切発生しなかったことの証拠とは扱わない。
- CPU手番・Runner・状態遷移の診断イベントは提示ログに含まれていない。このログだけでは、追加したCPU診断ログの実機記録動作が正常であることまでは確認できない。

### 完了判定

状態：**暫定原因への修正済み・iPhone Safari半荘戦実機確認済み・対応完了**

完了の根拠：

1. リーチ宣言牌を鳴いた後の描画例外は、実ゲーム経路を使った自動回帰テストで修正確認済み。
2. 既存の自動テスト、ビルド、Worker型チェックは成功したと報告されている。直前のActions runでもverify jobのテスト、Worker型チェック、Pages buildの成功を確認した。
3. CPU手番・Runner・状態遷移・タイマー・描画例外等の診断ログ強化は実装済み。
4. ユーザーがiPhone SafariでオフラインCPU3人の半荘戦を最後まで正常にプレイし、CPU手番フリーズの再発がなかったと報告した。

完了判定にあたっての留保事項：

- 2026-10-25の実機フリーズと描画例外が同一原因だったかは未確定。
- リーチ宣言牌をCPUが鳴く特定ケースのiPhone Safari実機確認は未実施。
- 強化したCPU診断ログの実機記録動作は未確認。
- Browser UIの最新Actions runは失敗で終了している。run [40317932010](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40317932010) の全suite成功は確認できていない。
- 今後フリーズが再発した場合は、強化された診断ログを取得して再調査する。

これらの留保事項を残したうえで、今回の暫定原因への修正対応は完了扱いとする。過去の実機フリーズの真因が確定したという意味ではない。
