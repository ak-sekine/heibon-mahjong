# 検証記録の目次

このディレクトリには過去の自動テスト、ビルド、Chromiumブラウザー確認などのログを保存しています。**iPhone Safari実機の確認結果は、確認者と報告範囲が分かる専用記録に分けます。** 各ログの数値や未完了事項は実施当時の結果です。

## 実機確認

- [右上ハンバーガー／ドロップダウンメニュー — Issue #24、iPhone Safari実機、2026-10-31](main-menu-toggle-style-2026-10-31.md)。ユーザー提供の開／閉画像でアイコン・背景・パネル・項目の表示を確認。ユーザーは開閉、項目選択、外側タップ、連続タップ、4項目と通常ボタンの操作をすべて正常と報告しました。Android Chromeなど未確認範囲があり、Issue #24はOpenです。自動検証・deployの詳細は[ドロップダウン記録](menu-dropdown-style-2026-10-31.md)と[ボタン配色記録](button-role-colors-issue24-2026-10-30.md)を参照。 |
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
