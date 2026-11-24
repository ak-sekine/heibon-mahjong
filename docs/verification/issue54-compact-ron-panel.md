# Issue #54 ロン判断の表示と検証

基準は main `404bb12c197ead4f7b377df983066c396261ef6a`。2026-11-07の報告では、iPhone Safariのitch.io版でロン判断の下側がSafari UIに重なった。表示領域の実寸は報告されていない。[Issue #54](https://github.com/ak-sekine/heibon-mahjong/issues/54)

旧表示は共通操作領域のインフロー配置で、当たり牌の画像と説明が独立した1行を占めていた。CSSの指定では画像の高さが67.2 CSS px、行間が6 CSS pxなので、通常の1行メッセージではパネル内の高さが約73.2 CSS px減る見込み。これはオンラインの通常時のCSS算出値。制限時間のないオフラインではメッセージ行も省く。ボタンの最小高さは従来どおり44 CSS px。#32のレスポンシブな卓配置と、#52の鳴き種類・候補の位置制御を前提とし、ロン判断は表示内容を簡素化する。河の対象牌の強調と加カン時の卓上プレビューは引き続き卓内に表示される。

## 自動検証

- 単体テストでは、共通操作パネルのフォーカス、オンラインの残り時間・期限切れ、赤牌を含むロン・見逃し・槍槓と卓の描画を確認する。
- 既存のChromium／WebKitの宣言フローにローカル対局の320、375、390 CSS px幅と高さ変更を追加した。visual viewport、祖先クリッピング、座標ヒット、ボタン高さ、判断開始前後の卓とスクロール、ロン和了・見逃しを検査する。座標クリックを使うため、Playwrightのクリック前スクロールによる見切れの隠蔽を避けられる。
- 既存の操作パネルテストではオンラインの残り10秒から9秒への更新、両ボタンのイベント、期限経過後の無効化を検査する。待機室のオンライン対局フローでは375×667から375×550 CSS pxへの変更、見逃し送信と卓・スクロール位置を検査する。
- itch形式ZIPは既存のパッケージ処理と展開検査を使う。既存のitch smokeは起動や打牌の検証をカバーする。実際のitch.io iframeとSafariのツールバーによる可視領域は実機確認で扱う。

## iPhone Safari実機確認

Pages版とitch.io版を更新後にそれぞれ縦画面で開く。同じ版でオフラインとオンラインを確認し、機種、iOSバージョン、配布先、結果を記録する。本人確認は未実施。

- ロン機会で当たり牌の画像・牌名・説明が操作領域に出ず、2ボタンが横一列に収まり押せる。
- Safariのツールバーが表示された状態と縮んだ状態でボタンが全体表示され、itch.ioの埋め込み枠でも押せる。
- ロン和了、見逃し、オンラインでのカウントダウンと時間切れが機能する。
- 判断の開始と終了、可視領域の変化で意図せずスクロールせず、卓や鳴き・通常操作に崩れがない。

## 候補作成時の結果

限定テスト83件、`npm test` 1,599件、Pagesビルド、Worker型検査、itchビルドとZIPのCRC検査、変更したPythonの構文、`git diff --check` は成功。通常のサンドボックスでは既存のZIPテストでPython子プロセスが `EPERM` となったため、許可付きで同じテストと全テストを実行して成功を確認した。ブラウザー実測と必須CIはGitHub Actionsの対象SHAで確認する。

初回候補 `b385e99` のChromium／WebKitは、オフラインの各幅で高さ44 CSS pxのボタン、375 CSS px幅で各113.66 CSS pxの横幅、判断前後の卓位置・寸法とスクロール維持を確認した。オンラインの375×667では両ボタンの下端が576 CSS pxだった一方、ヒット検査に含めた矩形の角は8 CSS pxの角丸の外側だった。後続候補では矩形全体のviewport検査を維持し、ヒットはボタン中心と上下左右の縁の内側で確認する。[初回候補CI](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45424290473)

## 最終自動検証・本番公開（2026-11-24 UTC）

アプリの候補・main統合・公開SHAは `0a1d8c76907e4bf844943c18c237d01bfe400908`。候補pushと同じSHAのmain pushは、各attempt 1で必須ジョブ、Chromium／WebKit各2グループ、環境分離とローカルオンライン検証、最終auditが成功した。最後の候補で角丸の外側の誤判定を解消し、矩形内判定と実座標クリックの両方が通った。[候補CI](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45426117041) · [main CI](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45428497046) · [main最終audit](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45428497046/job/138574465524)

375 CSS px幅の両ブラウザー実測では、各ボタンは113.66×44 CSS px、間隔は6 CSS pxだった。判断欄の高さはオフライン44 CSS px、オンライン68 CSS px。旧判断欄は1行メッセージの条件で約141.2 CSS pxと見積もった。これはオンライン実測68 CSS pxに旧画像行67.2 CSS pxと追加行間6 CSS pxを加えたCSSからの推定値。以下はボタン下端の実測。卓の矩形は判断開始前後と見逃し終了前後で同一viewport内の一致を確認した。スクロール位置は0のままだった。外側の操作枠の位置制御を追加せず、既存の卓サイズ設定で収まった。

| モード | viewport | ボタン下端 |
|---|---|---:|
| オフライン | 375×667 | 552 CSS px |
| オフライン | 375×567 | 460 CSS px |
| オンライン | 375×667 | 576 CSS px |
| オンライン | 375×550 | 475 CSS px |

検証済みPages成果物の再利用で、本番Worker、実オンライン検証、Pages配信、台帳確定、独立した公開後auditが成功した。公開HTMLのSHA-256は公開 `release.json` の値と一致し、旧ロン対象DOMの削除を確認した。開発の配信SHAは `99f6d146049133a1471bd62265089f5b65500563` を維持した。[本番run](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45430705243) · [公開後audit](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45430705243/job/138577402981) · [公開release.json](https://ak-sekine.github.io/heibon-mahjong/release.json)

本番run由来のitch.zipは、外側artifactのSHA-256、内外ZIPのCRC、直下の `index.html`、相対参照、バンドルの公開SHAと本番Worker URLを確認した。アップロード対象の `heibon-mahjong.zip` は92,034 bytes、SHA-256は `2ed4272893a189b326b23c520b0f0744a534dd559324f2a0c8426ed1d330462c`。itch.ioでの差し替えは手動。artifactを展開して内側のZIPをUploadsに設定し、ブラウザープレイ用として保存する。[本番itch artifact](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45430705243/artifacts/14937649445)

条件1〜7は上記の自動検証範囲で成功。条件8のiPhone Safari本人確認はPages、itch.ioとも未実施。条件9の自動・実機の範囲は本記録に記載した。本人の結果を確認するまではOpen継続。

## 追加対応 — ロン・鳴き判断の操作枠を統一

ユーザーから2026-11-25のiPhone Safari縦画面・itch.io版の観察として、ポンの2ボタンは幅全体を使い、ロンの2ボタンは中央に寄り、枠の高さと余白も異なるとの報告があった。旧版で当たり牌画像・説明の削除を確認し、提示画像では見切れは見られなかった。この報告は追加修正前の状態を示す。

鳴き種類選択のGridを `.decision-controls` と `.decision-buttons` に共通化した。ロンと鳴きはいずれも全列にまたがるステータスとボタン行を持ち、空のステータスは行ごと非表示になる。2ボタンは均等な列を使い、複数種類の鳴きは同じauto-fit規則で列を作る。外側の操作枠の余白、内側の枠、ボタン間隔も共通のCSSで指定する。イベント、ラベル、配色と候補選択の配置・操作は既存の経路を使う。

既存のBrowser UIテストで、実オフライン局面の375×667、375×567、1280×720と、残り時間付きオンラインfixtureの各幅を比較する。操作枠・判断パネル・ステータス・ボタン行・ボタンの矩形に加え、余白、枠線、角丸、背景色、文字サイズを比較し、代表画面を既存のBrowser UI artifactに保存する。列幅と行端にはCSSサブピクセル丸め用に0.02 CSS pxの許容値を設け、同一条件のロンとポンの測定値同士は完全一致を要求する。既存の実局面テストでは短いviewportでの押下、通常の鳴き、複数候補、Tabとキーボード操作、卓とスクロール位置を検証する。修正後のiPhone Safari実機確認はPages版・itch.io版とも未実施。

### 追加対応の計測・公開結果

375×667 CSS pxのオフライン比較。外枠は背景を描画する領域、判断パネルはその内側のGrid。旧版の外枠とポンの数値はmain `3c276ac` のCSSからの算出値（safe area 0、空のステータス行が作る6 CSS pxの間隔を含む）。旧ロンのボタンは前回CI実測。修正後はChromium／WebKitの両方で実測した。

| 対象 | 旧外枠 | 旧判断パネル | 旧ボタン各 | 修正後の外枠 | 修正後の判断パネル | 修正後のボタン各 |
|---|---:|---:|---:|---:|---:|---:|
| ポン | 367×70 | 365×68 | 170.5×44 | 367×64 | 365×62 | 170.5×44 |
| ロン | 367×66 | 353×44 | 113.66×44 | 367×64 | 365×62 | 170.5×44 |

両者の修正後の判断パネルは、375×667で `(x,y)=(5,500)`、375×567で `(5,412)`。PC 1280×720では外枠450×108、判断パネル436×62、各206×44。オンライン375×844の同一fixtureでは外枠375×88、判断パネル373×86、ステータス行355×18、各ボタン174.5×44で一致した。間隔は全例6 CSS px。位置・余白、枠線、角丸、色、文字サイズを含む比較に差はなかった。PCの小数座標はブラウザーがレイアウトをCSSサブピクセルで返すためで、ポン・ロンで同じ値だった。実際のオンライン対局フローの375×550では、各170.5×44、下端480 CSS pxで可視性と見逃しの座標クリックを確認。実オフライン局面でフォーカス、Tab、Space、押下、卓の矩形、スクロール0を確認した。[Chromiumオフライン画像](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45497503652/artifacts/14970826730) · [Chromiumオンライン画像](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45497503652/artifacts/14970297072) · [WebKit画像](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45497503652/artifacts/14970706599)

限定86件、全1,599件、Pagesビルド、Worker型検査、Python構文、差分の空白検査が成功。アプリ候補・main統合・本番公開のSHAは `d2b9bb2322bf40fde07e5beb3797fbbc80f12515`。同一SHAの候補・mainでChromium／WebKit各2グループ、分離、ローカルオンラインと最終auditが成功した。既存の鳴き種類・複数候補・戻る・キーボード、ロン成立・見逃し・期限切れ、itchパッケージの起動テストも成功。[候補CI](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45497503652) · [main CI](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45499359359) · [main最終audit](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45499359359/job/138823984917)

本番公開は検証済みPages成果物を再利用し、Worker、本番オンライン、Pages、台帳確定、公開後auditが成功した。配信HTML、release・台帳のSHAとハッシュ、Worker healthを照合した。本番runのitch ZIPは92,017 bytes、SHA-256 `84723b98fed11b36fe1a8d1b3045ba97d6669f49bd6c99c2d06718ffb849cd91`。外側artifactのハッシュ、内外ZIPのCRC、ルートHTMLの共通構造、アセットの相対参照、同一公開SHAと本番Worker URLを確認した。[本番run](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45501201166) · [公開後audit](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45501201166/job/138826470796) · [本番itch ZIP artifact](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45501201166/artifacts/14969554937)

実機では、Pages版とZIP差し替え後のitch.io版をiPhone Safari縦画面で開き、同じステータス条件のポン・ロンを比較する。枠とボタンの寸法、Safariツールバー表示時の可視性と押下、卓とスクロール、オンラインの残り時間、複数候補からの戻るを確認する。修正後の実機確認とitch.ioでの差し替えは未実施。IssueはOpen継続。
