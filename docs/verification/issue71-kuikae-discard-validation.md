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
