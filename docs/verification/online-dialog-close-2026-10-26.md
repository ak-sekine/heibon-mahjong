# オンラインダイアログ「閉じる」ボタンの再調査

日付: 2026-10-26  
対象コミット: `64c4713`, `3bca908`; 再検査 `25fcf3f` 以降

## 原因

修正CSSはmainに存在していたが、GitHub Pagesへデプロイされていなかった。GitHub Pages APIに記録された直近成功デプロイはrun `40264349235`、SHA `c89609106fd65ae5fbb11a95f04c567a5f6bfdf7`。このコミットの `.online-dialog .online-dialog-close` は `width:44px; padding:4px; box-sizing:border-box` で、`white-space:nowrap` がなかった。枠線を含めると文字領域は約34pxで、「閉じる」が折り返せる。

修正コミット `64c4713` とテスト補正 `3bca908` を含むPages workflowは、verify成功後にBrowser UI検査を通過できず、Pages deployへ到達していなかった。つまり、修正版CSSを載せた成功済みPages deployは存在しなかった。iPhoneが実際に受け取ったレスポンス本文は取得できておらず、Safariキャッシュが原因だった証拠もない。

公開URL `https://ak-sekine.github.io/heibon-mahjong/` のHTML/CSS取得も試みたが、実行環境のproxyがCONNECT要求に403を返し、公開応答本文やキャッシュヘッダーは取得できなかった。サイト自体からのHTTP 403とは確認できていない。

## 前回Browser UI検査の範囲

- `tests/browser-online-waiting-room.py` は実際の作成・参加・待機ダイアログと閉じる要素を使い、CSSの `white-space` と文字Rangeの行矩形を検査していた。
- ただし、Vite開発サーバー上のソースCSSを検査し、Playwright Chromiumだけで実行していた。公開用ビルドとWebKitは検査していなかった。
- 対象幅のダイアログ検査は通過したが、Browser UI workflow全体は成功していなかった。以前は次局進行時にモックが立直牌参照を次局へ残して「東2局」の表示待ちで失敗しており、`25fcf3f` で次局mockの初期化を修正した。
- その後のrun `40346215784` では `npm test` とproduction WebKitのダイアログ検査が通過した一方、既存の待機室フローの末尾で `Riichi declaration tile reference is missing from online seat 1` が発生した。`setSeatPresentation(1, true, false)` が宣言牌参照を設定しながら、河牌を作っていなかったテストfixtureの不整合だった。Browser UI全体が成功していたわけではない。

## 変更・検証

- CSSは `64c4713` の共通オンラインダイアログ修正を維持。オフラインCSSは変更していない。
- `tests/browser-online-dialog-layout.py` を追加。Vite Previewで公開用ビルドを開き、実際にロードしたhashed CSS asset、computed style、文字Rangeと各文字の画面上の行位置、タイトルとの非重複、ダイアログ・ボタンの画面内配置を320/375/390/414pxでWebKit検査する。各画面のスクリーンショットとJSON計測結果をActions artifactへ保存する。通常のオンライン対局フローは既存のChromium検査で継続する。
- 待機室mockで立直ありを設定するとき河牌も生成するよう修正し、参照切れエラーを解消した。
- `npm test`（62/62）、`npm run build`、`npm run typecheck:worker` は成功。ビルド済みCSSに `width:max-content` と `white-space:nowrap` が含まれることを確認。
- 今回の修正を含むBrowser UI / Pages deploy結果は確認中。
- iPhone Safari実機での修正後の再確認は未実施。本件を実機確認済みとは扱わない。
