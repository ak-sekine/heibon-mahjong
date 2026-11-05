# 検証記録の目次

このディレクトリには過去の自動テスト、ビルド、Chromiumブラウザー確認などのログを保存しています。**iPhone Safari実機の確認結果は、確認者と報告範囲が分かる専用記録に分けます。** 各ログの数値や未完了事項は実施当時の結果です。

- [Issue #46 itch.io Worker Origin許可・相互接続検証](issue46-itch-html5-2026-11-05.md#2026-11-05-実測-origin-許可と相互接続検証) — iPhone Safariで報告されたHTTP Origin `https://html-classic.itch.zone`を完全一致で許可し、REST/CORS、WebSocket認証、二方向本番通信、自動回帰、デプロイ結果を追記します。Handshake Originと実機相互対戦は自動テスト結果と分けて記録します。

## Issue調査

- [Issue #46 Origin診断追加、2026-11-05](issue46-itch-html5-2026-11-05.md#2026-11-05-origin診断追加記録) — 既存診断ダイアログに実行Origin表示・コピーと、Workerで拒否されたHTTP／WebSocket Originの安全な構造化観測を追加。run [#42062625984](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42062625984)でChromium／WebKit、Worker deploy／本番通信検証、Pages deployが成功し、[itch artifact](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42062625984/artifacts/13433286148)を確認。Draftの実Origin、PC、オフラインCPU、Pages↔itch対戦は未確認。IssueはOpenを維持。
- [itch.io HTML5 Draft準備 — Issue #46、2026-11-05](issue46-itch-html5-2026-11-05.md) — itch用相対base ZIPとPages PWA分離、公式ZIP制限、Draft手順、Origin実測・許可設定、素材・権利確認を記録。run [#42042381292](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42042381292) attempt 3でChromium／WebKit、Worker／Pages deployがsuccess。Production diagnostics [#42048287656](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42048287656)もsuccess。Draftと実Originは未確認のためIssueはOpenのまま。
- [鳴き判断の残り時間メッセージ重複 — Issue #48、2026-11-05](issue48-decision-countdown-duplicate-2026-11-05.md) — 対象コードSHA `d4bfaa41ccad501f400fc26eca7fc5984f8e1add`のDeploy run [#42028711294](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42028711294)でnpm test／build／Worker型チェック、Chromium 42／WebKit 32 scenario、Worker／Pages公開がsuccess。2026-11-05のユーザー本人によるiPhone Safari実機報告はOK 4件、NG 0件、報告された4項目について未確認0件。タイムアウト、個々の鳴き種別、具体的な画面幅は実機未確認として、自動検証・コード調査と区別して記録。受入条件を満たしcompletedとしてClose可能と判断。Issue本体はOpenのまま維持し、Closeは完了報告確認後に別途実施します。文書更新run [#42031364488](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42031364488)のdocs-checkもsuccessし、コード検証・デプロイjobはdocs-onlyのためskip。[検証記録](issue48-decision-countdown-duplicate-2026-11-05.md)参照。
- [Cloudflare互換日付とWebSocket 1006 — Issue #45、2026-11-05](issue45-cloudflare-compatibility-2026-11-05.md) — compatibility_dateの導入履歴、関連公式変更、`webSocketClose`応答、run #41941954653の事実と未確認事項を記録。`2026-04-07`へ更新し、Deploy run #42020017286と詳細diagnostic run #42022175635でWorker型検査、単体テスト、build、Chromium／WebKit、本番通信、接続・切断・再接続が成功。詳細診断で1006は未観測です。根本原因とサーバー側終了理由は未確定でWorkers Logsも未取得ですが、受入条件を満たしIssue #45はcompleted・Close可能（Issue本体はOpenを維持）と判定します。
- [オンラインルーム作成画面のフォーカス枠 — Issue #44、2026-11-05](issue44-focus-outline-clipping-2026-11-05.md) — run [#41965193092](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41965193092)（Worker／Pages SHA `4264a24e87f98331f95533a80f719c8e85c32b3b`）でChromium 42／WebKit 31 scenario、フォーカス枠回帰テスト、matrix audit、regression tests／build、Worker本番検証、Worker／Pages deployがsuccess。2026-11-05のユーザー本人によるiPhone Safari実機確認はOK 6件、NG 0件、今回の報告6項目の未確認0件。未報告のホーム画面PWA、320px相当の実機表示、「閉じる」操作は未確認として区別。初回の別画面WebKit timeoutと再実行時artifact不一致は原因未特定の履歴として保持。文書更新run [#42002567021](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42002567021)はdocs-check・変更分類がsuccessし、ゲーム検証・Deploy関連jobはdocs-only分類により正常skip。主要受入条件を満たしcompleted・Close可能と判断、Issue本体は変更せずOpenを維持します。
- [オンライン待機ダイアログの補助ボタン配置 — Issue #43、2026-11-05](issue43-online-waiting-button-alignment-2026-11-05.md) — run [#41940009814](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41940009814)でChromium 42／WebKit 31 scenario、matrix audit、Worker／Pages deployが成功（公開SHA `c57d35c`）。320〜1440pxで3ボタンは88〜112×44px、右端・書体を統一し、コード／期限表示とoverflowなしを実測。別のproduction Worker diagnostics run [#41941954653](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41941954653)は再接続後の`set-ready`応答待ちで失敗（原因未特定）。2026-11-05のユーザー本人によるiPhone Safari／ホーム画面PWA実機確認はOK 6件、NG 0件、未確認 0件（指定6項目）。既存自動検証とあわせて完了・Close可能と判断し、Issue本体は変更せずOpenを維持（CloseはChatGPT側で実施）。実機再接続は未確認。別の本番Worker診断のWebSocket切断・応答タイムアウトは対象外の未解決事項として維持し、Issue #43が原因とは断定しません。
- [オンライン対局の操作待機・復旧 — Issue #29、2026-11-04〜11-05](issue29-online-action-pending-2026-11-04.md) — 以前のiPhone Safari実機NGと修正過程のCI失敗を履歴として保持し、`rate_limited`による打牌拒否の原因、Actions run #41926545076と対象SHA `cf367a613cc15ae6ee40598d4e6c795fd75f15ce`、最終実機OK 6件（NG 0、未確認0）を記録。2026-11-01の約1分間の停止原因は未特定です。completedとしてClose。
- [CPU難易度 — Issue #33、2026-11-03〜11-04](issue33-cpu-difficulty-2026-11-03.md) — 初級／標準／上級の仕様、合法性と非公開情報境界、固定局面差、処理時間、限定的な対局比較、オンライン保存・再接続・再戦の自動検証を記録。Issue #33本体の2026-11-04 iPhone Safari実機結果はOK 5件・NG 0件・未確認1件（再接続・次局・再戦後の難易度維持）。別記録として、コミット `60de19ca` によるUI簡素化後の実機確認はOK 3件・NG 0件・未確認0件。Actionsの自動検証結果とは区別し、Issue #33はcompleted／Closed。強さの統計的優劣は未立証。
- [PWAインストール・更新管理 — Issue #31、2026-11-03](issue31-pwa-2026-11-03.md) — iPhone Safari実機OK 7件・NG 0件、Chromium／WebKitでの更新・複数タブ・旧キャッシュ・復旧試験、run `41607845715`の成功、Worker／Pages双方の公開SHA `96b3350…`、Android実機と直接HTTP取得の未確認事項、completed／Close判定を記録。
- [PWAアイコン変更 — 2026-11-03](pwa-icons-2026-11-03.md) — コミット `83804ced` の実機結果はOK 3件・NG 0件・未確認2件。アイコン受入は完了、オフラインCPU対局とオンライン復帰後の対局は未確認。Actions run `41621533105` の自動検証／公開結果と実機確認を分けて記録。

- [和了結果の点数区分 — Issue #36、2026-11-02〜11-03](issue36-win-score-tier-2026-11-02.md) — 計算済みscoreTierによる共通表示、run #558のverify・Chromium／WebKit・matrix audit・Worker／Pages公開成功、2026-11-03のiPhone Safari実機OK 6件・NG 0件・未確認1件（数え役満／通常・複合役満）、個別満貫境界の実機未報告を自動検証と区別して記録。完了条件を満たしIssue #36はcompletedでClose。
- [オンライン待機画面の進行ボタン — Issue #41、2026-11-02〜11-03](issue41-online-waiting-room-progress-buttons-2026-11-02.md) — ホストの準備・座席確定・対局開始の同位置切替と回帰、最終Deploy run `41474025754`の検証・Chromium／WebKit・Worker／Pages成功、追加修正後のiPhone Safari報告、実機未確認項目、completed／Close判定を記録します。
- [座席確定メッセージの重複表示 — Issue #41追加修正、2026-11-02〜11-03](issue41-seat-finalized-message-duplicate-2026-11-02.md) — 原因と修正、回帰検証、iPhone Safariでの重複解消OK、Actionsと公開結果、実機未確認範囲を記録します。文書更新run `41476660809`の検証・公開ジョブは、文書のみの変更分類により正常にskipされました。
- [オンライン待機画面の操作ボタン配置 — Issue #34、2026-11-02](issue34-online-waiting-room-buttons-2026-11-02.md) — 左右の退出・準備完了、下段全幅の再接続を固定し、Chromium／WebKitの複数幅で配置・接続遷移を検証する。自動検証・公開・iPhone Safari実機確認の状態を記録。ユーザー本人のiPhone Safari実機確認5件OK（NG 0、未確認0）を記録し、IssueはcompletedでClose。
- [人和・責任払い・ダブル役満・三家和 — Issue #19、2026-11-02](issue19-unimplemented-rules-2026-11-02.md) — 調査対象commit `834bdc8`のコード調査、確定仕様、連盟公式「～2024年度」資料の取得確認とHEIBON MAHJONG独自仕様との差、実装設計、テスト計画、残リスクを記録。実装Issueは[#37](https://github.com/ak-sekine/heibon-mahjong/issues/37)特殊形ダブル役満、[#38](https://github.com/ak-sekine/heibon-mahjong/issues/38)人和、[#39](https://github.com/ak-sekine/heibon-mahjong/issues/39)パオ、[#40](https://github.com/ak-sekine/heibon-mahjong/issues/40)複数ロン・三家和。Issue #19は設計完了条件を満たしcompletedでClose。
- [大三元・大四喜・四槓子のパオ — Issue #39、2026-11-03](issue39-pao-2026-11-03.md) — 役ごとの責任者確定、成立済み面子と責任成立順、ツモ・ロン・複合役満精算、GameRules v5、Worker snapshot／保存／復元、26固定局面テスト、run #41588587285のChromium／WebKit・Deploy gate・Worker production-test・Worker／Pages成功SHA（`b982f9f3f8750ad7370f66c4f535f3831cdfcfd7`）を記録します。2026-11-03のiPhone Safari実機報告はOK 5件・NG 0件・未確認2件。未確認（局の結果、次局・オンライン再戦）と特殊局面を自動検証と区別し、Issue #39をcompletedとしてCloseしました。
- [複数ロン・頭ハネ・三家和 — Issue #40、2026-11-03](issue40-multiple-ron-2026-11-03.md) — GameRules v5設定、共通ロン判定、途中流局精算、リーチ／四風連打／槍槓、パオとの統合、Worker回答収集・復元を記録。ローカル79テストファイルとIssue #40固定局面29ケース、型チェック・buildは成功。Actions run [#41594402355](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41594402355)のverify、Chromium 37／WebKit 26、Worker production-test 5シナリオ、Worker／Pages Deployがsuccessし、両公開SHAはfc638eaec20c3f6f121a9245c2359a37ffd76866。2026-11-03のユーザー本人によるiPhone Safari実機確認は **OK 3件、NG 0件、未確認6件**。特殊局面6件は実機未確認のまま、自動テストと区別して記録。主要受入条件の実装・自動検証・公開と実機正常報告を総合し、Issue #40はcompletedでClose。
- [連荘・途中流局・オーラス終了条件 — Issue #18、2026-11-02](issue18-local-rules-2026-11-02.md) — `GameRules` schema v4の7設定、既定値補完、オフライン・オンライン・CPU・再接続・再戦、自動テストとActions run `41382073027`（Chromium 37／WebKit 25、Worker／Pages Deploy成功）を記録。ユーザー本人のiPhone Safari実機確認は指定6項目すべてOK（NG 0、未確認0）。特殊局面は自動検証と実機未確認を区別し、Issue #18はcompletedとしてClose。
- [オンラインのルーム作成・参加画面のプレイヤー名表記 — Issue #30、2026-11-01](issue30-player-name-label-2026-11-01.md) — ラベル・入力検証文言、実機と自動検証の結果を区別して記録。iPhone Safari実機は6項目OK、NG 0件、未確認0件。実装run #503でverify、Chromium／WebKit、production-test、Worker／Pages Deployがsuccessし、docs-only run `41307412228`も文書検査success。Pagesの独立HTTP応答は未確認です。完了条件充足・Issue #30はcompletedでClose。
- [赤ドラ・裏ドラ・一発・カンドラの個別設定 — Issue #16、2026-11-01](issue16-local-rules-2026-11-01.md) — 初期値、4項目の独立判定、牌・和了・得点・CPU・Worker同期と固定局面テスト、Actions run #499とWorker／Pages deploy、ユーザー本人のiPhone Safari実機確認を記録。実機確認は7件OK、NG 0件、未確認1件（一発OFF）。Issue #16はcompletedとしてClosed。
- [新規対局画面へのルール設定統合 — Issue #27、2026-11-01](issue27-new-game-rules-2026-11-01.md) — オフライン・オンラインのルール統合、保存／Worker同期、run #490のBrowser UI・Worker／Pages公開、docs-only run #491、iPhone Safari実機確認（追加修正の6項目がOK）と未確認範囲・Close判定を記録。Issue #27はcompletedとしてClose。
- [対局結果画面と同じオンラインルームでの再戦 — Issue #13、2026-11-01](issue13-rematch-2026-11-01.md) — 実装、Worker統合テスト、連続3対局、Chromium／WebKit検証、run 41262624930・41267773516のDeploy gate／Worker／Pages成功と完了判定を記録。ユーザー本人の「問題ありません」報告は確認範囲のみ記録し、追加修正後のiPhone Safari実機確認など詳細条件は未確認です。Pages直接HTTP応答は未確認です。
- [対局終了時の最終順位・持ち点 — Issue #12、2026-10-31〜11-01](issue12-match-result-2026-10-31.md) — 終了判定、既存順位ルール、オフライン／サーバー確定ビューの再利用、ボタン表記・フォント修正、単体・全体テスト、Chromium／WebKit Actions結果を記録。2026-11-01にユーザー本人がiPhone Safariで修正後のボタン表示・操作4項目すべてOK（NG 0、未確認0）と報告し、Issue #12を完了判定。報告外の実機条件は未確認として区別。
- [Browser UI回帰の壁時計時間短縮 — Issue #28、Phase 1〜3、2026-10-31](browser-ui-wall-clock-issue28-2026-10-31.md) — run 41206140603で56 scenario (Chromium 34／WebKit 22) の成功とwall clock 18:12.3から8:50.4への短縮を確認。Phase 3のmatrix auditはrun 41208917661で実Actions API queryを実行してsuccessしました。失敗・cancel・skip・job欠落を拒否するstatus tests、artifact、残存riskを記録。
- [Open Issue調査結果 — 2026-10-31](open-issue-investigation-2026-10-31.md) — 対象13件の分類、調査SHA、コード実態、テスト結果、原因未特定・仕様判断待ち、およびIssue #24の調査後の完了状態を記録。

## 実機確認

- [和了概要のドラ合計 — Issue #11、iPhone Safari実機、2026-10-31](issue11-dora-summary-2026-10-31.md)。ユーザー本人が4項目OK、NG 0件と報告。長い役名の非重複、通常・裏・赤ドラ合算の実機確認、オンラインのホスト・参加者間一致、再接続後の結果復元は未確認で、成功扱いしていません。自動検証・公開結果と分けて記録し、Issue #11は依頼範囲を完了・Closeしました。 |
- [診断ログ画面の「閉じる」ボタン — Issue #10、iPhone Safari実機、2026-10-31](diagnostic-close-issue10-2026-10-31.md)。ユーザー本人が「閉じる」の1行表示・閉じる操作、コピー、クリア、ログ本文スクロール、オンライン作成・参加など他ダイアログの閉じる操作を確認し、5項目すべてOK（NG 0件）と報告しました。個別ログ件数、長いビルドID・長文ログの実機再現、機種、iOSバージョン、確認時刻は未報告です。自動検証と区別し、Issue #10は完了・Closeしました。 |
- [配牌直後・第一ツモ直後の暗カン — Issue #25、iPhone Safari実機、2026-10-31](issue25-opening-ankan-2026-10-31.md)。ユーザー本人がカン検証ページ全体を問題なしと報告しました。個別項目は明示的なOK報告がないため個別成功扱いにしていません。通常オフライン／オンライン対局での親の初手暗カンは、対象局面を実機で再現していないため未確認です。自動・Browser UI結果と区別しています。 |
- [右上ハンバーガー／ドロップダウンメニュー — Issue #24、iPhone Safari実機、2026-10-31](main-menu-toggle-style-2026-10-31.md)。ユーザー提供の開／閉画像とユーザー本人による操作報告を記録。自動検証と合わせてIssue #24を完了・Closeしました。Android Chrome実機、PC Firefox実機、PWAインストール、公開配信CSSのcomputed style、全ボタンの網羅実機確認は未確認で、今回の必須条件ではありません。詳細は[ドロップダウン記録](menu-dropdown-style-2026-10-31.md)と[ボタン配色記録](button-role-colors-issue24-2026-10-30.md)を参照。 |
- [オフライン鳴き操作とスクロール診断 — Issue #8、iPhone Safari実機、2026-10-30](call-scroll-diagnostics-issue8-2026-10-30.md)。初回実機確認（OK 4件、未確認3件）と再発報告・再修正・自動検証履歴を保持。再修正後のユーザー本人による実機確認は指定5項目すべてOK（NG 0件、未確認0件）。スクロール不具合は今回の確認範囲で修正完了。以前の鳴きボタン不応答の根本原因は未特定のためIssueはOpenです。 |
- [オフライン対局開始後のルール確認 — Issue #20、iPhone Safari実機、2026-10-29](offline-rules-2026-10-29.md)。ユーザーが東風戦／半荘戦、読み取り専用、縦横の表示・スクロール・閉じる、選択状態・持ち点・通常操作、次局維持、新規対局設定キャンセルとの独立性、オンライン待機の既存確認の4段階・計20項目すべてOKと報告しました。実機確認済み・完了。「卓を見る」経由、再読み込み後に対局が復元される場合、他端末・全画面サイズ、中断・復帰、例外・保存データ破損、将来の追加設定は実機未確認です。内部のコピー・凍結は実装・自動テストによる確認と区別しています。
- [新規対局開始時のランダム座席 — Issue #5、iPhone Safari実機、2026-10-29](random-seat-assignment-2026-10-29.md)。オフライン・オンラインの抽選、確定時の席表示、確定後と開始後の席一致、次局・再読み込み・再接続後の席維持をユーザーが確認済みです。主要機能の実機確認済み・完了。ホスト交代・CPU引き継ぎ・複数端末での一致・4席すべての網羅・全操作は実機未確認で、自動テスト・本番通信テストの確認範囲とは区別しています。 |
- [卓中央の局表示 — Issue #4、iPhone Safari実機、2026-10-29](center-round-display-2026-10-28.md)。表示形式の非表示、局情報の読みやすさ、局・山の別行、ドラ・河との非重複、進行に伴う更新の5項目をユーザーが確認済みです。Codexによる実機操作ではありません。全画面幅・全局面・本場数・オンライン再接続の網羅確認は未実施です。自動検証と区別しています。
- [開発用「牌表示確認」の削除 — Issue #3、iPhone Safari実機、2026-10-28](tile-preview-removal-2026-10-28.md)。通常・カン検証・テストページに開発用表示がないことをユーザーが確認。オフライン対局と結果表示は目視で問題なさそうとの報告（網羅的検証ではありません）。オンライン対局は対象外です。自動検証結果とは区別しています。
- [Browser UI河間隔測定の調査 — iPhone Safari実機目視、2026-10-28](river-spacing-investigation-2026-10-27.md)。ユーザー報告「問題なさそうです。」を河レイアウトの目視上問題なしとして記録。1pxの数値測定や全配置・画面サイズ・19／24枚目・左右CPUの個別実機確認は未実施です。Issue #14はclosed（completed）。自動テストの確認範囲とは区別しています。
- [オンライン退出通知の配置修正 — iPhone Safari実機、2026-10-28](online-exit-notice-layout-2026-10-27.md)。タイトル・メニューボタンとの非重複、通知表示中のメニュー操作、約8秒後の自動消去をユーザーが確認済みです。Chromium／WebKitの自動検証結果と初回の河間隔測定失敗も同記録に保持しています。
- [対面プレイヤー公開手牌の180度回転 — iPhone Safari実機、2026-10-27](online-opponent-public-hand-orientation-2026-10-27.md)。和了・流局時は正常、九種九牌は実機未確認です。自動テスト／WebKit結果と区別しています。
- [CPU手番診断 — iPhone Safari実機、2026-10-27](cpu-turn-render-diagnostics-2026-10-26.md)。schema 2の正常なCPU手番、鳴き、状態遷移・描画、復帰スナップショットをユーザーが確認。停滞検知・描画例外・CPU処理中断復帰は未確認で、フリーズ原因は未特定です。
- [オンラインダイアログ「閉じる」ボタン — iPhone Safari実機、2026-10-26](online-dialog-close-2026-10-26.md)。新しくルームを作る／ルームに参加する／オンライン待機の3画面すべてで1行表示をユーザーが確認済みです。関連する自動検証とPages deploymentの記録も同じファイルにあります。
- [左右の河19枚目以降のレイアウト — iPhone Safari実機、2026-10-26追記](side-river-8x3-2026-10-25.md)。CPU1（右）の18→19→20枚目と荒牌流局までをユーザーが実機確認。CPU3（左）、オンライン対局、25枚目以降は未確認です。自動テスト・Chromium・WebKit結果と分けて記録しています。
- [流局結果概要と操作ボタン配置 — iPhone Safari実機、2026-10-24](round-end-result-2026-10-24.md)。ユーザー報告の実機確認と、対象コミットの自動・ブラウザー検証／デプロイ結果を区別して記録しています。
- [カン機能 — iPhone Safari実機、2026-10-18](kan-safari-2026-10-18.md)。ユーザー報告による総括記録です。シナリオ別ログやスクリーンショットの記録ではありません。

## 自動・ブラウザー検証

- [レスポンシブレイアウト — Issue #32、2026-11-03](issue32-responsive-layout-2026-11-03.md) — 320×568〜1440×900の既存10代表viewportと縦横回転相当を維持し、PCの1280×720／1366×768／1440×900／1920×1080を追加検証。run [#41666741261](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41666741261)（SHA `74570f3ccdb7c8b808822de998840937aeb26a02`）でChromium40／WebKit30 scenario、Deploy gate、Worker／Pages公開がすべてsuccess。本人報告の卓・文字NGを修正し公開済みですが、PC実機で本人が再確認するまでIssue #32はOpenを維持します。iPhone Safari／PWA追加修正3件はOKを維持。ほかのPC実機項目とAndroid・タブレット実機は未確認です。
- [人和・固定満貫 — Issue #38、2026-11-02〜11-03](issue38-renhou-2026-11-02.md) — 実装SHA `6c7a84ac0f38e791c7847270f04d455f659ed125`、固定局面テストとActions run `41546258846`のverify・Chromium／WebKit・Worker／Pages公開成功を照合。公開SHAは実装SHAと一致。2026-11-03のiPhone Safari実機確認はOK 5件、NG 0件、未確認3件。人和成立局面・高点法・不成立条件の実機再現は未確認で、自動検証と区別して記録。自動検証で受け入れ条件を確認できたためIssue #38はcompletedでClose。
- [特殊形ダブル役満・GameRules v5 — Issue #37、2026-11-02](issue37-double-yakuman-2026-11-02.md) — 4形の判定・倍率、v1〜v4移行とv5保存、オフライン／オンライン／Worker同期、iPhone Safari実機OK 7件（表示・点数）、その他の実機未報告項目は自動検証と区別して記録。completedでClose。結果詳細の合計ラベル統一を含む公開SHA `87d5bf0`、Actions run [#41439154842](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41439154842)はverify・Chromium／WebKit・Worker／Pages gate成功。
- [喰いタンON/OFF — Issue #17](issue17-local-rules-2026-11-01.md) — `GameRules` v3、ON/OFFの役・翻数・点数、CPU鳴き、保存・オンライン同期、自動テスト・GitHub Actions結果を記録します。2026-11-02のユーザー本人によるiPhone Safari実機確認はOK 4件、NG 0件、未確認2件。CPU判断は自動テスト根拠あり。片和了の一方のみ役成立する専用ケースは自動テスト未確認で、その範囲を記録してIssue #17をcompletedとしてClose。

- [和了概要のドラ合計 — Issue #11、2026-10-31](issue11-dora-summary-2026-10-31.md) — オフライン・オンライン共通表示、既存 `doraCounts` による合算、点数系不変、オンライン結果のJSON復元、自動検証とActions run 41196608100（実装SHA一致、検証・Browser UI・production-test・Worker/Pages deploy成功）を記録。ユーザー本人によるiPhone Safari実機確認はOK 4件、NG 0件、未確認4件で、実機未確認事項は自動検証と区別しています。
- [診断ログの「閉じる」折り返し — Issue #10、2026-10-31](diagnostic-close-issue10-2026-10-31.md) — 320/375/390/414pxの寸法ベースBrowser UI確認、初回テスト呼び出しエラーと修正後のCI/deploy successを記録。ユーザー本人のiPhone Safari実機確認（5項目OK）を追記し、実機確認結果と自動検証を区別してIssueを完了・Closeしました。
- [Issue #25 配牌直後・第一ツモ直後の暗カン — 2026-10-31](issue25-opening-ankan-2026-10-31.md) — 初期配牌の合法性、オフライン・オンライン候補、複数候補選択、通常打牌、嶺上牌・ドラ、九種九牌・四槓散了との整合性、Actions run 41185324829とユーザー本人のSafari総括確認を記録。通常対局での親の初手暗カンは実機未確認です。
- [右上メニューのドロップダウン表示 — Issue #24関連](menu-dropdown-style-2026-10-31.md) — メニュー項目を通常ボタンの単色配色から分離し、Browser UI・自動デプロイと、ユーザーによるiPhone Safari実機確認を記録。
- [右上ハンバーガーメニューボタンのナビゲーション表示 — Issue #24](main-menu-toggle-style-2026-10-31.md) — トグルを通常操作ボタンCSSから分離し、白い三本線・状態表示・キーボードフォーカスを検証。2026-10-31のユーザー実機報告と未確認範囲を追記。
- [未デプロイ変更の検出と安全な回収 — 2026-10-31](deploy-pending-changes-recovery-2026-10-31.md) — Worker/Pages別GitHub Deployment SHA、pending app diffの回収、部分成功・古いSHAの処理、20自動テスト、run 41158609151の全ゲート・両deploy・SHA記録成功。公開HTMLとcomputed styleはproxy 403で未確認。
- [Issue #24 ボタン色の単色統一](button-role-colors-issue24-2026-10-30.md) — 初回役割別配色の履歴、単色化の現在仕様、computed style・自動テスト・実機未確認事項。
- [Issue #24 作業時間調査](issue24-work-duration-investigation-2026-10-31.md) — 前回204分の履歴上の事実と未確認事項、今回の実測分析、Issue #23との比較、改善候補。
- [Issue #24 作業計測ログ](issue24-work-timing-2026-10-31.md) — 単調時計・UTC壁時計による今回のフェーズ、コマンド、テスト、GitHub Actionsの記録。

| 記録 | 主な対象 |
| --- | --- |
| [全ボタンの共通配色・状態表現 — Issue #24](button-role-colors-issue24-2026-10-30.md) | 役割別トークン・静的／動的ボタン、オンライン処理状態、新規対局A/D2切替、returnToLocalGameの分類、単体テストとChromium／WebKit CI結果、コントラストを記録。iPhone Safariのメニュー表示と操作はユーザー確認済み。Android Chromeおよび全ボタン種別・状態の網羅的な実機確認は未確認。 |
| [オフライン鳴き操作とスクロール診断 — Issue #8](call-scroll-diagnostics-issue8-2026-10-30.md) | 再発原因の初回表示 `scrollBy` 経路、削除したviewport補正、スクロール元・パネル高さ診断を記録。375×448pxの候補別 `scrollY`／矩形、手動位置維持、ボタン操作・対局進行をChromium／Playwright WebKitで確認。Actions run 41059814959でBrowser UI、本番Worker検証、Pages公開まで成功。再修正後のユーザーによるiPhone Safari実機確認は5項目すべてOK。スクロール不具合は今回の確認範囲で修正完了、鳴きボタン不応答の根本原因は未特定のためIssueはOpen。 |
| [Browser UI・オンラインCPU進行の回帰 — Issue #21](browser-ui-regression-issue21-2026-10-29.md) | リーチ結果から次局、CPU打牌のポンによる河からの除去の固定局面と検証結果。main統合後のChromium／WebKit CIと異常系の検出を確認し、CI検証済み・完了。未確認事項とIssue #22・#23への引き継ぎを記録。 |
| [Browser UI CI実行時間増加の原因調査 — Issue #23](browser-ui-ci-duration-issue23-2026-10-30.md) | Phase 1・Phase 2の計測を記録。同一SHAでも時間が変動し、全runで52シナリオ成功。runner資源等は一部計測したが因果関係と計測オーバーヘッドは未分離で、根本原因未特定。調査完了・Issue #23 Closed。今後の異常は新しいIssueで扱う。 |
| [Browser UI失敗の原因調査 — Issue #7](browser-ui-issue7-investigation-2026-10-29.md) | 東2局待ちとCPU進行誤判定の別原因、既存修正、検証と未確認事項。回帰強化は #21、別タイムアウト調査は #22。 |
| [オフライン対局開始後のルール確認 — Issue #20](offline-rules-2026-10-29.md) | 対局開始時スナップショット、オンラインとの共通画面、読み取り専用・開閉の非干渉、前回設定との分離、次局維持、小画面のスクロール。既存の自動検証・Actions・公開結果と初回CI失敗・修正履歴を保持し、2026-10-29のユーザー報告によるiPhone Safari実機確認20項目（すべてOK）と実機未確認事項を追記。実機確認済み・完了。 |
| [ローカルルール設定・オンラインルール確認 — Issue #6](local-rules-2026-10-29.md) | 設定可能項目（東風戦／半荘戦のみ・初期値東風戦）、固定・未実装ルール、保存復元、Worker正本、Actions run 40857841888の自動検証・本番デプロイ結果、2026-10-29のユーザー報告によるiPhone Safari実機確認、実機未確認事項、後続Issue #16〜#20を記録。主要機能の実機確認済み・完了。 |
| [新規対局開始時のランダム座席 — Issue #5](random-seat-assignment-2026-10-29.md) | Fisher–Yates抽選、オンライン`finalize-seats`での確定と座席維持、非公開情報保護。既存の自動テスト・Chromium／WebKit・Actions・本番デプロイと、2026-10-29にユーザーが報告したiPhone Safari実機確認を区別し、未確認シナリオも記載しています。 |
| [CI・Browser UI回帰の重複実行と時間計測 — Issue #15](ci-performance-2026-10-28.md) | 現行・変更後のCIフロー、文書変更の分類、高速テスト方法、Browser UI実行の時間計測、Actions run比較。2026-10-29に実アプリ変更のWorker／Pages本番デプロイ成功とdocs-onlyの検証成功を追記。 |
| [卓中央の局表示 — Issue #4](center-round-display-2026-10-28.md) | 東風戦・半荘戦の表示削除、東／南場・本場・山枚数、320〜430pxとPC幅のオンライン／オフライン表示。Chromium／WebKitとデプロイは記録済み。2026-10-29のユーザーによるiPhone Safari実機確認5項目を追記し、網羅対象外も明記。 |
| [開発用「牌表示確認」の削除 — Issue #3](tile-preview-removal-2026-10-28.md) | 牌カタログの削除と、通常対局・カン検証ページの共通牌描画回帰確認。自動テスト、Browser UI、iPhone Safari実機確認を区別しています。 |
| [オンライン退出通知の配置修正](online-exit-notice-layout-2026-10-27.md) | Chromium／WebKitの退出フロー・モバイル配置・操作・自動消去、2026-10-28のユーザーによるiPhone Safari実機確認（完了）。 |
| [Browser UI河間隔測定の調査](river-spacing-investigation-2026-10-27.md) | 回転SVG牌面rectのずれに対するCSS修正、自動回帰検証、2026-10-28のユーザーによるiPhone Safari目視確認、Issue #14の完了。初回失敗等の未確認事項を明記。 |
| [オンラインダイアログの閉じるボタン修正](online-dialog-close-2026-10-26.md) | 修正履歴、公開用ビルド／WebKitの12条件、Pages deployment、ユーザーによる3画面のiPhone Safari実機確認（完了）。 |
| [流局結果概要と操作ボタン配置](round-end-result-2026-10-24.md) | 通常／途中流局の概要表示、Chromium / WebKitのモバイル表示、デプロイ結果、ユーザー報告のiPhone Safari実機確認。 |
| [オンライン診断ログ](online-diagnostics.md) | ブラウザーのlocalStorageログ、Worker構造化ログ、Cloudflare確認方法、保存範囲と検証制限。 |
| [CPU手番フリーズ原因未特定・診断強化](cpu-turn-render-diagnostics-2026-10-26.md) | CPU段階、Runner停滞・Safari復帰、描画失敗、ビルド識別ログの実装と検証。2026-10-27に通常動作の一部をiPhone Safari実機で確認。異常経路は未確認で、フリーズ原因は未特定。 |
| [九種九牌の公開手牌](kyuushu-public-hand.md) | 宣言者14枚のオンライン・オフライン公開、非公開手牌保護、結果の再表示・再接続・次局解除。GitHub ActionsのChromium/WebKit確認成功。 |
| [対面プレイヤー公開手牌の180度回転](online-opponent-public-hand-orientation-2026-10-27.md) | 自動WebKitの4シナリオは成功。iPhone Safari実機では和了・流局を確認済み、九種九牌は未確認。別のDeploy workflowでオンラインCPU手番テストが失敗し、デプロイ工程は未実施。 |
| [Heibon Mahjong テスト環境](test-environment.md) | オフライン固定局面の九種九牌4シナリオ、136枚整合性、公開範囲、320〜430px幅。 |
| [Step 13.8](step13.8/README.md) | 主要役満8種類、候補単位の複合、点数、結果表示。Browser UI verification はGitHub Actionsで実施。 |
| [Step 13.9](step13.9/README.md) | 海底摸月・河底撈魚、最終通常ツモ／打牌の局進行。Browser UI verification はGitHub Actionsで実施。 |
| [Step 13.10](step13.10/README.md) | 流し満貫、九種九牌、四風連打、四家立直と局精算。Browser UI verification はGitHub Actionsで実施。 |
| [Step 13.11](step13.11/README.md) | 天和・地和、配牌時ツモ、役満複合、CPU自動和了と局精算。Browser UI verification はGitHub Actionsで実施。 |
| [Step 14.0](step14.0/README.md) | Cloudflare Workers本番URL、HTTPS、ルーム、WebSocket座席同期、再接続、認証・非公開情報の検証。 |
| [Step 14.0.1](step14.0.1/README.md) | Ready、CPU補充、権限引き継ぎ、退出、revision、重複要求、レート制限、本番WebSocket・Browser UI検証。 |
| [Step 14.1](step14.1/README.md) | サーバー権威型オンライン対局、座席別情報保護、進行・再接続、ローカル結合、Cloudflare本番WebSocket・Browser UI検証。 |
| [Step 14.2](step14.2/README.md) | オンライン・オフライン河の共通座標、4席回転、リーチ宣言牌、メニュー、共通操作領域、表示名欄。 |
| [Step 14.3](step14.3/README.md) | 共通操作・点数・卓中央UIに加え、オンライン待機ダイアログの表示名・参加条件と320〜430px幅を確認。 |
| [Step 14.6](step14.6/README.md) | 明示的な対局中退出のCPU交代、Worker Durable Object状態遷移、ホスト移行、退出後トークン拒否、決断窓・CPU Alarm、プライバシー保護。 |
| [Step 13.7](step13.7/README.md) | 一般役7種類の候補判定、点数計算、結果表示。Browser UI verification はGitHub Actionsで実施。 |
| [Step 13.5.5](step13.5.5/README.md) | 正方形卓、牌・河・副露の配置、実カン操作、画面サイズごとの検証。初回の未完了事項と後続修正も時系列で保存。 |
| [Step 13.5.4](step13.5.4/README.md) | 卓上牌の寸法と画面表示。 |
| [Step 13.5.3](step13.5.3/README.md) | 卓上牌の寸法と左右席情報。 |
| [Step 13.5.2](step13.5.2/README.md) | 卓画面再設計後の回帰確認。 |
| [Step 13.5.1](step13.5.1/README.md) | 槍槓の宣言牌表示と操作確認。 |
| [Step 13.5](step13.5/README.md) | カン・嶺上開花・槍槓の単体、ビルド、Chromium記録。 |
| [Step 13.3.1](step13.3.1/) / [Step 13.3](step13.3/) | 和了結果の表・裏ドラ表示と回帰確認。 |
| [中央情報表示](center-info/README.md) | 卓中央の局情報・ドラ・供託の配置。 |
| [カン検証ページの説明](../kan-verification.md) | 公開検証ページと各操作シナリオの説明。 |
| [Step 13.4の検証ログ](../validation/step13.4/) / [副露UI修正](../validation/call-ui-fix.md) | 副露操作と表示の検証資料。 |

画像と画面別の測定データは[スクリーンショット](../screenshots/)にあります。既存のログ・画像は文書整理では移動・削除していません。
