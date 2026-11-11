# Issue #55 PWAヘッダー内更新通知（2026-11-10）

## 範囲と開始状態

暗カン・加カン、ゲーム進行、通信、Workerは変更しない。
作業ブランチwork、未コミット変更なし、未pushコミットなし。
開始HEAD／fetch後origin/main: c646007818baedc2b5bc6f6b0550b824a302f969、behind/ahead 0/0。
origin: https://github.com/ak-sekine/heibon-mahjong.git。
通常のfetchはproxy:8080接続段階で失敗。正規の許可付き同一fetchは成功。

## 変更

従来はmain先頭の通知行が卓を押し下げていた。通知を既存ヘッダー内へ移し、
高さ44px固定・タイトル省略・更新ボタン44px高で収めた。
メニューと卓サイズ、main余白は変更しない。状態説明は視覚的に隠して
aria-describedbyとlive regionを維持する。複数タブのブロック理由はアラートでも表示する。
登録条件、確認承認、延期、controllerchange後の再読み込み、重複生成防止は維持。
itchの登録スキップ、相対パス、ビルド構成は変更なし。

## 自動検証

- npm test: 86件成功、失敗0。
- npm run build: 成功。
- npm run build:itch: Worker URL未設定では既存設定のエラー。CIと同じ
  VITE_ONLINE_API_URL=https://online-mock.invalid指定で成功（本番公開用ZIPではない）。
- Python構文検査・git diff --checkを実施。
- ブラウザーはAGENTS.mdの既知のCloud起動制限に従い既存Deploy内のBrowser UIを使用。
  対象コミットc536da35f0af099d4e28408177411dc38a749904の両エンジンとも成功。

PWAテストは実際のService Worker更新を使用する。320×568、375×560、375×635、
390×844、430×844で通知なし／あり／キャンセル後／ブロック後を実測する。
ヘッダー44px、卓のXY幅高さ・操作パネル矩形・scrollXY不変、横overflowなし、
タイトルとボタン非重複、両ボタン44×44以上、メニュー開閉・更新クリックをassertする。
確認中はブラウザー標準confirmでJS評価が停止するため、その間のDOM実測は行えない。
confirmの発生とdismiss、前後の寸法不変を検証する（確認中の寸法は未実測）。
測定JSONはBrowser UI artifactのpwa-header-chromium.json／pwa-header-webkit.jsonに保存。
既存のオフラインCPU対局、更新失敗復旧、明示承認、複数タブ、再読み込み、キャッシュ削除も維持。

## iPhone Safari実機（すべて未確認）

Safariとホーム画面PWAのそれぞれで、次をユーザー本人が確認する。

1. 通知なしで従来のヘッダー表示となる。
2. 新版検出時のみヘッダー内に「更新あり」が表示される。
3. 卓・操作欄が下がらず、スクロールがジャンプしない。
4. 更新とメニューを別々に操作できる。狭い画面でも重ならない。
5. 更新承認で再読み込みされる。
6. キャンセル・延期後も対局を継続できる。
7. 別タブがある場合は理由が通知され、閉じて再試行できる。

自動WebKit検証は実機確認の代替ではない。Issue #55のCloseは行わない。

## Actionsと実測結果（2026-11-11追記）

[Deploy run 42925490208](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42925490208)
でChromium／WebKitのPWA・Browser UI全件成功、両エンジン監査成功。
itchスモークは両エンジンとも前後各3回成功。既存オンラインBrowser UIと本番オンライン検証も成功。
測定JSONは[Chromium](issue55-pwa-header-chromium.json)／[WebKit](issue55-pwa-header-webkit.json)。
artifact ZIPはダウンロード先ドメインがForbiddenのため取得できず、GitHubコネクターの
各完了ジョブログに出力された測定JSONを取得・保存した。

以下の卓・操作欄の値は両エンジン共通。単位CSS px。
通知なし→あり→キャンセル→複数タブブロックで全て同一。
旧実装自体の寸法は未実測で、変更前比較はソース上の通常フローの通知行との比較。

| Viewport | ヘッダー高 | 卓 X,Y,幅,高さ | 操作欄Y | scroll X,Y | 横overflow |
|---|---:|---|---:|---|---|
|320×568|44|10,108,300,300|412|0,0|なし|
|375×560|44|41.5,108,292,292|404|0,0|なし|
|375×635|44|0,108,375,375|487|0,0|なし|
|390×844|44|0,116,390,390|514|0,0|なし|
|430×844|44|0,116,430,430|554|0,0|なし|

更新ボタンのYは全て8、高さ44、幅はChromium 76／WebKit 76.65625。
メニューは全てY=8、44×44。通知前後でメニュー座標も同一。

| Viewport | 更新X Chromium | 更新X WebKit | メニューX（共通） |
|---|---:|---:|---:|
|320×568|190|189.34375|270|
|375×560|237|236.34375|321|
|375×635|237|236.34375|321|
|390×844|252|251.34375|336|
|430×844|292|291.34375|376|

ボタン非重複、画面内、メニュー開閉、更新confirm・キャンセル・再試行、
ブロックalert、承認後の再読み込み・キャッシュ切替に成功。
全測定はスクロール先頭で実施。スクロール途中の通知発生は未実測。

## 追加要件の受入判定

1. ヘッダー44px・卓／操作欄Y不変: 自動検証OK。
2. 幅320／375／390／430で非重複・操作・横スクロールなし: 自動検証OK。
3. 更新承認・キャンセル・複数タブブロック・再読み込み: OK。
4. Chromium／WebKitのPWA・Browser UI回帰: OK。標準confirm表示中の寸法は未実測。
5. npm test・build・PWA検証: OK。itchビルド・スモークもOK。
6. iPhone実機チェック項目の用意と区別: OK。実機結果自体は未確認。
7. 変更・検証・コミット・公開状況の報告: 本記録と最終報告に記載。PR作成なし。

暗カン・加カンUIのClose判断は今回行わず、IssueはOpenのままとする。

## 公開状態

実装コミット: c536da35f0af099d4e28408177411dc38a749904。
mainへのfast-forward push成功、push後のgit ls-remoteも同SHA。
Deploy全体、Pages build、Pages deployはすべてsuccess。
公開先: https://ak-sekine.github.io/heibon-mahjong/ 。
この環境から公開URLへのcurlは通常実行でproxy接続失敗、許可付き実行ではHTTP 403。
したがって公開ページを直接取得しての反映確認は未確認。CIによるデプロイ成功とは区別する。
Actions全体ログZIPも配信先Forbiddenのため、GitHubコネクターの個別ジョブログと
GitHub APIの対象SHA・ジョブ結果で確認した。履歴改変・PR作成・Issue更新なし。
