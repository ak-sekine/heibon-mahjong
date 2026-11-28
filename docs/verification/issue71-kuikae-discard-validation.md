# Issue #71 オンライン対局の喰い替え禁止

2026-11-28。GitHub APIで確認したmainは `9cf364ac28bc3c4f0f770a22ff9431825dc9df47`。ローカルHEADと一致。ネットワーク許可付きのgit fetchはHTTPS認証で失敗し、gh auth statusも資格情報を無効と判定した。候補はローカル検証まで。

固定した136牌の局面で、四筒・五筒から三筒をチーすると修正前の通知に三筒と六筒の物理IDが含まれることを再現した。鳴き成立時の禁止牌種を、Workerの打牌判定と同じ isForbiddenDiscard で通知一覧から除外する。実機報告ではチーが受理されrevision 42で打牌拒否31件、他の牌は打牌可能。実際に送信された各IDとWorkerの個別例外は未確認。

固定テストは順子の両端・中央、ポンで残る赤五筒、保存からの復元、古い選択IDでの打牌ボタン無効化、合法打牌後の両者ビューを確認する。直接指定は既存reducerが拒否し、状態は不変。Workerは既存のRangeErrorをinvalid_actionに変換し前のセッションを保持する。新規ケースの実WebSocket経由の実行は未実施。既存クライアントは同じ一覧で牌ボタンと送信を制御し、revision更新で選択を解除する。同一revisionでも一覧外の選択から打牌は送信されない。オフラインは既存の選択制御で禁止牌を除外する。

限定・関連単体134件、クライアントとWorkerの型検査、差分検査成功。Chromium/WebKit、候補CI、main CI、公開・公開後auditは未実施。IssueはOpen。統合と公開にはGit認証の復旧と必須CI成功が必要。

v1の項目・型と保存形式は同一。既存Pagesと#46 ZIPのクライアントには修正済みWorkerが返す一覧を適用できるため、機能上はWorker更新で足りる見込み。既存の公開分類はgame-view.tsをboth扱いするため、実公開前に正常公開済みツリーとの差分とWorker専用経路の適合を確認する。分類や公開ゲートを変更しない。#46 ZIPの再生成は今回の修正に不要と見込む。Draft上のZIP同一性は未確認。

公開後にiPhone SafariのPagesとitchの2人卓でチー・ポンを行い、禁止牌の選択不可、別牌の打牌、両画面の同期と進行を記録する。可能なら再接続後も同じ手順を行う。三筒チー後の六筒が出現しなければ、その局面だけを未確認とする。PagesビルドSHAとitch ZIP digest、確認日、端末を記録する。

## 継続対応

Cloudのネットワーク許可付きGit接続でfetchと候補pushが成功。基準mainに追加変更はなく、既存検証と同じ `8d968ea17b538d52c469999a26ab236d5c19ca9a` を使用した。候補 [46111215186](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46111215186) とfast-forward後のmain [46112079496](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46112079496) はChromium・WebKit全グループ、verify、local-online、環境分離、audit成功。実WebSocketの既存回帰では通常打牌と再接続を確認。喰い替えの固定局面そのものはreducerと操作パネルでの確認で、同局面の実WebSocket・専用ブラウザー操作試験は未実施。

公開前に、Pages台帳 `5fff1df032e672948187bb610f54691b3086c70f` のpendingなしと本番Pages・独立Workerの正常SHA `77c6c35cc381ffe6987f4ace8bca8cff0fe1653f` を照合。Workerの直前の検証済み記録はDeployment 8121540156、version `01b049b2-0c4a-4055-b5c1-22a870d61d5f`。累積差分のうちゲーム実行コードの変更はgame-view.tsだけで、createPlayerGameViewの呼び出し元はWorker。既存クライアントの合法牌一覧を使う処理とv1契約は同一のため、既存の明示的なWorker専用経路を選択した。公開分類とゲートを変更していない。#46の既存ZIPは技術上再使用可能。Draftとの一致は未確認。

本番Worker専用の公開runは [46112839558](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46112839558)。

公開runは成功。独立Deployment 8125234245 はソース `8d968ea17b538d52c469999a26ab236d5c19ca9a`、version `439310d5-241a-4f6c-bf62-fdb6ea152056` でdeployed・verified。公開先で両Originを使用する既存オンライン検証とWorker稼働versionの照合、公開runのauditと最終summaryが成功。Pages公開ジョブはskip、台帳HEADは公開前と同一でpendingなし。別の公開後監査runは追加実行していない。#46のZIPの差し替えは今回の修正には不要。本人の相互対戦による確認を待つためClose不可。

## 選択フィードバック追加

従来の選択不可要件を変更。オンライン・オフラインとも禁止牌を選択・強調表示し、指定理由を既存欄へ出す。合法牌一覧・打牌拒否は従来どおり。本人の打牌手番だけに任意の kuikaeForbiddenTileIds を付け、項目のない旧Workerでは従来の選択制限を維持する。選択から文言を導出し、既存の接続・送信・判断・局終了表示を優先する。PagesとWorkerの両方、および新itch ZIPの検証が必要。旧クライアントは追加項目を無視できるためWorkerを先に公開可能。

固定局面の単体・Workerハンドラ試験を追加し、既存Browser UIの短画面シナリオでオンライン・オフラインの選択・解除・合法打牌を検証する。Workerハンドラの試験は隔離されたSQLiteとテストソケットを使う。実ネットワーク上のWebSocket固定局面試験とは区別する。

候補 `32c3dd7a48369e4dbf155550d35575d69a0646e2` の[CI 46115547301](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46115547301)は、短画面の禁止牌選択を含むChromium・WebKitの全グループ、オンライン、環境分離、auditに成功。同一SHAをmainへfast-forwardした。関連テスト109件とクライアント・Worker型検査、差分検査も成功。別のローカル作業コピーで本物のWorkerと一時SQLiteを起動し、固定局面だけをテスト用の入口で投入。実WebSocketで三筒・六筒を直接指定し、どちらも invalid_action と revision 42、再取得した対局ビュー不変を確認。合法牌の打牌は両クライアントでrevision 43と同じ公開河を確認した。固定局面の入口はリポジトリと公開バンドルに含まれない。

同一SHAの[main CI 46116410833](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46116410833)も全必須ジョブとauditに成功。オフラインでは固定局面で禁止牌を選んだ後の confirm() 直接呼び出しが無操作となることを確認した。本番の公開前基準はWorker `8d968ea`、Pages `77c6c35`、Pages台帳 `5fff1df`（pendingなし）。Worker→Pagesの順で独立公開する。旧Workerと新クライアントの組み合わせでも禁止牌の打牌はできない。

本番Worker [46117258131](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46117258131) は公開・両Originのオンライン検証・稼働version照合に成功。Deployment 8125800589、verified version `53f5c0eb-e0c3-4e28-adc0-d23e69d246fa`。続く本番Pages [46118159491](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46118159491) は同一SHAのmain CI成果物を再利用し、Workerとのオンライン検証、公開、実配信ファイル照合、独立auditが成功。Pages台帳 `d8a85638e557f0278242d6750ea1c7795c523113`、pendingなし。開発Pages SHAとWorkerのverified記録は保持。技術的なitch候補は [#46検証記録](issue46-itch-html5-2026-11-05.md) を参照。Draftの更新、ユーザー実機確認、Issue Closeは未実施。

## 2026-11-28 ユーザー実機確認・最終受入評価

ユーザー本人の報告による実機確認。対象として報告されたitch.io配布候補は [artifact `15252075166`](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46115547301/artifacts/15252075166)、ソースSHA `32c3dd7a48369e4dbf155550d35575d69a0646e2`、候補内側ZIP SHA-256 `62228077b80acfdcf4761721903d5bf5259ffe61e6981fd2cc9159ecdfa783a4`、100,030 bytes。本人がこの候補をアップロードしたとの報告を記録する。Draft管理画面やアップロード済みファイルのdigestは独立照合しておらず、配布候補とアップロード済みZIPのバイト一致を確認したとは扱わない。

### 実機報告

| 環境 | 確認項目 | 結果 |
| --- | --- | --- |
| Pages・itch.io間オンライン対局 | チー後の喰い替え禁止牌を選択できる | OK |
| Pages・itch.io間オンライン対局 | ポン後の喰い替え禁止牌を選択できる | OK |
| Pages・itch.io間オンライン対局 | 禁止牌が通常牌と同じ選択表示になる | OK |
| Pages・itch.io間オンライン対局 | 「喰い替え禁止のため、この牌は打牌できません。」と表示される | OK |
| Pages・itch.io間オンライン対局 | 禁止牌選択中は打牌ボタンが無効になる | OK |
| Pages・itch.io間オンライン対局 | 合法牌を選び直すとメッセージが通常表示に戻る | OK |
| Pages・itch.io間オンライン対局 | 合法牌を正常に打牌できる | OK |
| Pages・itch.io間オンライン対局 | Pages版とitch.io版で対局状態が同期する | OK |
| Pages・itch.io間オンライン対局 | 選択解除時に禁止メッセージが消える | OK |
| オフラインCPU対局 | 禁止牌を選択でき、通常の選択表示になる | OK |
| オフラインCPU対局 | 禁止牌選択時に指定メッセージが表示される | OK |
| オフラインCPU対局 | 禁止牌選択中は打牌ボタンが無効になる | OK |
| オフラインCPU対局 | 合法牌を選び直すと正常に打牌できる | OK |
| オフラインCPU対局 | 選択解除時に禁止メッセージが消える | OK |

集計は報告対象14件すべてOK、NG 0件、報告対象内の未確認0件。特記事項なし。当初の実機報告時点では端末・OS・ブラウザーの内訳、再接続後の操作、個別の牌・牌種の組み合わせは報告されていなかった。その後、2026-11-28の追加回答で、Pages版・itch.io版の相互オンライン対局にはiPhone Safariを使用したと確認された。これによりオンライン9項目のブラウザーはiPhone Safariと記録するが、機種・iOS、各クライアントを動かした端末の組み合わせ、オフラインCPU対局の端末・ブラウザー、再接続後、特定の実機牌局面は未確認のままとする。PCや他ブラウザーの実機確認も報告されていない。特定のチー端牌・中央牌、ポン、赤牌の決定的ケースは自動テストで別途確認済みであり、これを実機報告には含めない。

### 端末・ブラウザーについての追加回答（2026-11-28）

「今回のPages版とitch.io版の相互対戦では、iPhone Safariを使用しましたか」という質問に対し、ユーザー本人から「iPhone Safariで確認しました」と回答があった。先の実機報告にあるオンライン9項目は、Pages版とitch.io版の相互対戦でiPhone Safariを使用して確認したものとして記録する。Safariを使った側のクライアント、対戦相手側の端末・ブラウザー、iPhoneの機種・iOSは報告されていない。オフラインCPU対局5項目もSafariで確認したとは扱わない。

### 最終仕様と受入評価

今回の評価では、旧Issue本文にある「喰い替え禁止牌を選択できない」という文言に代え、選択は可能だが通常表示のまま打牌不可理由を表示し、確定・送信を防止する現在の仕様を適用する。オンライン・オフラインで同じ操作仕様とする。Workerの合法牌一覧と不正打牌拒否は維持する。

| 受入範囲 | 結果 | 根拠・制限 |
| --- | --- | --- |
| 禁止牌と合法牌の選択・表示 | 達成 | チー後・ポン後および通常牌と同じ表示は本人の実機報告でOK。固定局面の自動テストとChromium／WebKit Browser UIも成功。具体的な実機牌組み合わせは未報告。 |
| 禁止理由・打牌ボタン・選び直し・解除 | 達成 | 指定文言、ボタン無効、合法牌への変更、選択解除はオンライン・オフラインの実機報告でOK。禁止牌の確定・送信を防ぐBrowser UI検証、Worker拒否、実WebSocket直接送信試験も成功。 |
| 喰い替え・赤牌・合法打牌・状態保護 | 達成 | 決定的な牌局面のテストとWorkerの実WebSocket試験で確認。禁止牌の直接送信はinvalid_actionとなりrevision・対局状態不変、合法打牌は双方へ同期。個別組み合わせは実機では未報告。 |
| 既存制限・通信互換性・再接続 | 達成（自動検証） | 既存テスト、通信契約、再接続回帰、CIで確認。ユーザー実機の再接続操作は今回報告されていないため実機範囲には含めない。 |
| Chromium・WebKit、CI・audit | 達成 | 候補CI [46115547301](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46115547301)、同一製品SHAのmain CI [46116410833](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46116410833) と文書コミットのmain docs-only CI・audit [46133821064](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46133821064) が成功。 |
| 本番公開・新itch.io候補・ユーザー実機 | 達成 | Worker [46117258131](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46117258131)、Pages [46118159491](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46118159491) の公開と公開後確認が成功。候補ZIPはartifact `15252075166`。ユーザーは上記14項目をOKと報告したが、アップロード済みZIPとのdigest一致は独立確認していない。 |

**最終評価：今回指定された最終仕様の必須受入条件は達成し、Issue #71はClose可能と評価する。** オンライン9項目はiPhone Safariで実施したとの追加報告がある。機種・iOS、Safariを使った側のクライアント、オフラインCPU対局5項目の端末・ブラウザー、再接続、具体的な実機牌組み合わせは引き続き未確認であり、補完しない。再接続と牌組み合わせは自動検証で確認されており、指定された実機操作14項目はすべてOKとの報告である。Issue本文・チェックボックス・状態はこの作業では変更しない。旧本文の選択不可記述との整合・Issueの最終更新とCloseは別途ChatGPT側の操作に委ねる。

## 2026-11-28 候補CIのWebKit group 1失敗

文書のみの候補SHA `c354056459ff9d869794eeb34e366af8df31c466` に対する [Environments run 46138662149](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46138662149) は失敗した。`origin/main`との差分は本書と[#46検証記録](issue46-itch-html5-2026-11-05.md)のMarkdown 2件だけで、製品コード・テスト・CI設定に差分はない。

初回push時のworkflowログで `BASE_REF=0000000000000000000000000000000000000000`、`run_full_suite=true`、`classification=application-or-unknown` を確認した。これは信頼できる差分基準がないとき全体検証を選ぶ既存の安全側動作であり、分類異常ではない。run 46138662149では `docs-check`、`verify`、`local-online`、両engineのisolation、Chromium両group、WebKit group 2が成功し、WebKit group 1が失敗、`audit`も失敗した。失敗済みの全体run・auditを成功扱いしない。

WebKit job [140959900731](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46138662149/job/140959900731) のログには、`tests/browser-candidate-geometry.py` が1280×720を完了した後、次の既定viewportに入って失敗した記録がある。テストの既定順序から失敗viewportは **1366×768** と特定できる。例外は896行目で、selector `#online-game-controls [data-panel-part="candidate-options"] button` の先頭要素を取得する `Locator.evaluate` が30秒でタイムアウトした。例外行はオンライン分岐の「候補画面を戻るで閉じた後、再び開き、候補を確定する」部分にあるため、処理段階は再表示操作後・候補確定前である。

同じ箇所のソース上では、鳴き種類ボタンに対するhit-test・enabled・画面内検査を通過した後に `page.mouse.click` と2回の `requestAnimationFrame` 待機が行われ、その後に候補ボタンを取得する。この実行順序は確認できるが、このviewport／scenarioにはclickイベント観測器がなく、clickイベントや製品のclick handlerが動いたかは確認できない。失敗ログから確定できるのは、候補ボタンselectorの要素を待ち時間内に取得できなかったことまでである。

失敗診断artifact [15261700069](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46138662149/artifacts/15261700069) は未期限切れで、metadata上の外側artifactは924,931 bytes、SHA-256 `0acaf785d0e2b1b26a16e4f95b46fc0c76e6542f8473abd7af691c863492e735`。正規connectorから返されたファイル参照とGitHub artifact API URLの両方を使った取得はHTTP 403となり、内部の診断JSONを確認できなかった。したがって**失敗scenarioは未特定**とする。候補画面のDOM詳細、鳴き判断・送信待ち・期限切れの状態、ページエラー、最後のmeasurementに記録されたviewport以外の値は推測で補わない。

このため `targeted_candidate_geometry` は実行していない。viewport・online modeは分かるがscenarioを限定できず、全scenarioへの拡張は失敗局面だけの診断という条件を満たさない。追加実行は行わない。

### 関連する過去事象との比較

- [Issue #73](https://github.com/ak-sekine/heibon-mahjong/issues/73) はWebKit 320×480で最終順位を閉じた後、局結果ボタンに対するポインター操作のclickが発生せず、再表示されない事象を記録する。今回の失敗は1366×768のオンライン鳴き候補画面で候補ボタンselectorが取得できない事象であり、操作対象と観測された症状が異なる。同じWebKitの再表示操作だけでは共通原因と判断できない。
- [Issue #52の1440×900オンラインchi診断](issue52-webkit-chi-reopen-diagnostics.md)では、候補再表示の取得タイムアウト後、同じSHAの独立Browser UIと限定診断で再表示・1回送信が成功したが、根本原因は未確定である。その診断観測は1440×900のonline chiに限られ、今回の1366×768・scenario不明の失敗を説明しない。
- [Issue #32の候補座標記録](issue32-candidate-anchor-2026-11-09.md)には、過去の狭いviewportでの配置不備と、後続のChromium／WebKit候補座標matrix成功（132局面ずつ）が記録されている。今回も同じcandidate geometryテスト系列だが、今回は座標assertionでなく再表示後の候補ボタン取得で失敗している。過去のレイアウト修正やmatrix成功から、今回の原因を特定することはできない。

今回の差分は文書だけなのでこの失敗を文書変更による製品退行とみなす証拠はない。一方、既存製品・テスト経路に間欠的な候補再表示問題がある可能性も否定できない。発生画面が#73とは異なるため、共通原因の証拠が得られるまでは候補画面再表示の別Issueで追跡するのが適切である。
