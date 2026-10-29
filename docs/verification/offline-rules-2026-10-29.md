# Issue #20 オフライン対局開始後のルール確認

実施日：2026-10-29。Issue：[#20](https://github.com/ak-sekine/heibon-mahjong/issues/20)。関連：[#6](https://github.com/ak-sekine/heibon-mahjong/issues/6)、[Issue #6の仕様・実装・自動検証・実機報告](local-rules-2026-10-29.md)。

## 作業開始時

- 作業ディレクトリ：`/workspace/heibon-mahjong`、ブランチ：`work`。
- 開始時HEAD：`e6808ee39a33d7abaa5deaaa1a29fce468d0777b`。未コミット変更なし、未pushコミットなし。
- origin：`https://github.com/ak-sekine/heibon-mahjong.git`（fetch/push）。
- 通常の`git fetch origin`はgithub.comへの接続前に`Failed to connect to proxy port 8080`で失敗。同じコマンドを正規のネットワーク許可付きで再実行して成功。
- fetch後origin/main：`edef54c3126aa295d532e49cdc177ca6bbb042ba`。開始時HEADはbehind 1 / ahead 0。`git merge --ff-only origin/main`で追従してから変更。
- Issue #20本文とコメント、Issue #6本文・実装報告・完了報告、SPEC、ROADMAP、関連ソースと検証記録を確認。

## 調査と実装

従来は対局形式が`MatchState.format`にあり、次回用の設定は`RulePreferences`とlocalStorageに分かれていました。オンライン待機はWorkerの`OnlineRoomState.rules`を`openReadOnlyRules()`へ渡し、`describeConfirmedRules()`が形式と固定ルールの説明を作っていました。

- オフライン対局中のメニューに「ルール確認」を追加。局進行中と、結果から「卓を見る」で戻った画面で利用できます。対局なし・オンライン対局中は非表示です。
- `GameController.newGame()`から形式だけでなく共通`GameRules`全体を`startMatch()`へ渡し、正規化した新しい凍結オブジェクトを`MatchState.rules`へ保存します。既存の形式引数にも対応します。`format`は同じルールから導出し、既存の判定・精算との互換性を保ちます。
- 確認時は`rulesForMatch(controller.match)`を使います。localStorageや編集中の次回設定を読みません。`rules`のない旧状態だけ対局自身の`format`へフォールバックし、形式もなければ東風戦。不正なルール値は既存の`normalizeGameRules()`で既定値へ戻します。
- 精算・次局は既存の不変更新で同じ`rules`を引き継ぎます。将来#16〜#18で`GameRules`と共通の正規化・説明を拡張するときも、オフライン表示が形式だけを再構築する経路にはなりません。今回、新しい切替項目やゲーム判定は追加していません。
- オンライン用の既存ダイアログ（互換性のため`online-rules-*` IDを維持）と`openReadOnlyRules()`・`renderRulesList()`・`describeConfirmedRules()`を共用します。確定元の説明・aria-label・閉じた後のフォーカス先だけを切り替えます。
- 表示は対局形式、赤ドラ、喰いタン、和了条件、後付け、リーチ・一発、裏ドラ、カンドラ、通常／途中流局、連荘、対局終了の12行。オンラインと同じ項目・説明です。編集・保存操作はなく、「閉じる」またはEscapeで卓に戻ります。
- 開閉処理はゲーム更新・精算・再描画・CPU runnerの停止／再開を呼びません。選択牌も維持します。CPUは通常どおり進行し、ダイアログを開いたことによる一時停止はしません。
- 本文は既存のスクロール領域を使い、ヘッダーと1行の「閉じる」ボタンを維持します。

## 自動検証

| 検証 | 結果 |
| --- | --- |
| `npm test` | 成功。ローカル67テスト群、67 passed、0 failed。追加修正後も成功。本番用手動runのverifyでは1,263テストすべて成功（0 failed）。 |
| `npm run build` | 成功。TypeScriptとVite production build。 |
| `npm run typecheck:worker` | 成功。 |
| `git diff --check` | 成功。 |
| Pythonの構文確認 | 変更したBrowser UIスクリプトとmanifestの`py_compile`成功。 |
| Chromium / WebKit Browser UI | 作業ブランチの[run 40872584378](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40872584378)（`8198baa`）と最終[run 40876987847](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40876987847)（`d0dc154`）の両方で全50スクリプト成功（Chromium 32、WebKit 18）。最終runでもオフライン確認・オンライン待機の既存確認を含めて成功。 |
| GitHub Actions verify | 最終run `40876987847`、SHA `d0dc154a0b0657dbfac7a916008fc7836f21c146`で全1,263テスト、Worker型チェック、build、文書checkが成功。 |
| Worker本番デプロイ | 成功。最終runのdeploy-worker job、2026-10-29 13:14 UTC。https://heibon-mahjong-online.ak-sekine.workers.dev |
| 本番通信テスト | 成功。HTTPS・ルーム・WebSocket・再接続・認証・プライバシーに加え、2人対局とホストのCPU引き継ぎ、切断・再接続、ホスト交代後の1人＋CPU3人、4人対局、3人＋CPU1人のシナリオが成功。 |
| Pages build | 成功。最終runのpages-build jobで本番Worker URLを埋め込んだbuildとartifact作成を確認。 |
| Pages deploy | 成功。最終runのpages-deploy job、2026-10-29 13:15 UTC。https://ak-sekine.github.io/heibon-mahjong/ |
| 公開後のProduction Worker diagnostics | 同じSHAの[run 40880289609](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40880289609)も成功。 |
| iPhone Safari実機 | **未確認**。自動WebKitはiPhone実機確認として扱いません。 |

### 追加・更新した検証範囲

- `tests/rules.test.ts`：東風戦／半荘戦の開始スナップショット、コピー・凍結、開始後に呼出元・次回設定・保存値を変えても現在のルールと対局が不変、全共通説明、精算と次局での同じスナップショットの維持、旧状態と不正値のフォールバック。
- `tests/browser-app-idle.py`：production buildの東風戦／半荘戦からメニューで確認。既存の保存復元・キャンセル検証も維持。
- `tests/browser-offline-rules.py`：実際の開始・メニュー操作、全12項目、読み取り専用、閉じるとEscape、フォーカス復帰、対局オブジェクトと全JSON・選択牌・保存値の開閉前後一致、保存設定の不一致・別の新規対局編集をキャンセルした後の現在値、局結果から卓へ戻る操作、次局後の維持。
- 同スクリプトで320×480、375×547、390×844、430×932、844×390の表示・横溢れ・スクロール最下部・閉じるの1行表示と44px高を確認します。CPU待機はテスト用の制御可能なPromiseで固定し、開閉で同じ待機・AbortSignal・手番・進行段階が維持され、元の待機を解放すればCPUが和了することを検証します。自然な時間経過による進行と開閉による変更を分けています。
- `tests/browser-online-waiting-room.py`：オフライン確認後に同じ画面をオンライン待機で再利用しても、サーバー確定ルール・案内・aria-label・読み取り専用が正しいことを確認。新しいメニュー項目を含むキーボード操作とオンライン開始時の非表示も検証します。
- `tests/run-browser-regressions.py`：既存Browser UIワークフローに新スクリプトのChromium／WebKitを追加。全50スクリプト（Chromium 32、WebKit 18）。

### main初回の回帰テスト失敗と対応

- `8198baa`の作業ブランチでは全テストとBrowser UIが成功しましたが、main初回runの`tests/step14-0-1.test.ts:818`で、参加者の手番を期待する既存テストが`2 !== 3`で失敗しました。verify以降はskipされ、公開は行われていません。
- 該当テストは本番用の暗号学的乱数で座席と牌山を決めた後、特定の人間の手番まで進める前提でした。ランダムな対局はCPUの和了・途中流局などで先に終了できるため、このライフサイクル検証には入力の再現性が必要です。元の入力による同じ失敗はローカル80回では再現しておらず、CIで実際にどの局終了条件が成立したかまではログから特定できていません。
- 該当サブテストだけ`TestContext.mock`で乱数列を固定し、完了時に自動復元します。手番・公開範囲・保存・再接続・重複操作の期待値や待ち上限は変更していません。失敗時は状態・phase・手番・revision・結果を出力するようにしました。本番の乱数・ゲーム処理は変更しません。
- 修正後の対象ファイル20回連続実行（各23テスト）と`npm test`全67テスト群が成功しました。アプリのソースは変更していないため、ローカルbuild・Worker型チェックは同じソースで成功した結果を引き継ぎ、本番ワークフローでも再確認します。
- テストと本記録の追加修正：`d0dc154a0b0657dbfac7a916008fc7836f21c146`。mainへのfast-forward push後、リモートSHAの一致を確認しました。テストのみの変更は通常のpush分類では公開対象外のため、同じSHAで`deploy_to_production=true`を指定した[手動run 40876987847](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40876987847)を起動しました。重複するpush run `40876986361`はcancelledとして停止し、手動runで全検証から実施しました。テストやデプロイ前の検証ゲートは省略していません。
- 手動runのverify job `123458919642`で、該当オンラインライフサイクルテストを含む全1,263テスト、Worker型チェック、buildが成功しました。

## 変更ファイルとコミット

- 実装：`index.html`、`src/main.ts`、`src/model/match.ts`、`src/model/rules.ts`、`src/game/match.ts`、`src/ui/controller.ts`、`src/ui/rule-settings.ts`、`src/online/game-controller.ts`、`src/style.css`。
- テスト：`tests/rules.test.ts`、`tests/browser-offline-rules.py`、`tests/browser-app-idle.py`、`tests/browser-online-waiting-room.py`、`tests/run-browser-regressions.py`、`tests/step14-0-1.test.ts`。
- 文書：`docs/SPEC.md`、`docs/ROADMAP.md`、`docs/verification/README.md`、本記録。
- 実装コミット：`8198baabbc8560086b24478d3be8a14c0f7676e8`。作業ブランチ`issue20-offline-rules`の全自動検証成功後、`origin/main`が基準SHAのままでbehind 0 / ahead 1、作業ツリーに変更なし、push対象が本Issueの1コミットだけであることを確認しました。
- `git push origin HEAD:main`成功（fast-forward、forceなし）。push後の`git ls-remote origin refs/heads/main`で同じ実装SHAを確認。ローカルも`main`へ切り替えました。
- 最終自動検証・本番公開SHA：`d0dc154a0b0657dbfac7a916008fc7836f21c146`。この結果追記は文書のみで、検証済みのアプリ・テストを変更しません。

## iPhone Safari実機で確認する項目

以下は予定項目であり、実機で成功したという記録ではありません。

1. 公開ページで東風戦を開始し、右上メニュー→「ルール確認」で東風戦と全固定ルールが表示されること。
2. 半荘戦で同じ操作をし、「半荘戦（東南戦）」と南4局の終了条件が表示されること。
3. 変更・保存操作がなく、一覧を最後までスクロールでき、横溢れや文字・ボタンの重なりがないこと。縦向き・横向きで「閉じる」が1行で押せること。
4. 閉じると元の卓へ戻り、選択牌・点数・手番・本場・供託に開閉由来の変化がなく、打牌・鳴き・既存メニューが使えること。CPUの自然な進行は継続すること。
5. 結果で「卓を見る」→確認と、次局へ進んだ後の確認でも形式・固定ルールが維持されること。
6. 対局中に別の新規対局設定を編集・確定してから新規対局をキャンセルしても、元の対局ルールが変わらないこと。
7. オンライン待機の既存「ルール確認」も正しく表示され、閉じると待機画面へ戻ること。

Issue #20は実機確認待ちとしてOpenを維持します。ユーザーによる実機確認後、別途本記録を更新し、問題がなければIssueをクローズします。
