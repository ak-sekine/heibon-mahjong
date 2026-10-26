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

- 原因は閉じるボタンの幅が44px固定で、「閉じる」の文字幅を確保できず折り返せたこと。`64c4713` でボタンに `width:max-content`、`flex:none`、`white-space:nowrap`、タイトルに `min-width:0` を指定した。オフライン側のCSSは変更していない。
- `tests/browser-online-dialog-layout.py` を追加。Vite Previewで公開用ビルドを開き、実際にロードしたhashed CSS asset、computed style、文字Rangeと各文字の画面上の行位置、タイトルとの非重複、ダイアログ・ボタンの画面内配置を320/375/390/414pxでWebKit検査する。各画面のスクリーンショットとJSON計測結果をActions artifactへ保存する。通常のオンライン対局フローは既存のChromium検査で継続する。
- 待機室mockで立直ありを設定するとき河牌も生成するよう修正し、参照切れエラーを解消した。
- Git履歴で確認した関連コミット：`64c4713`（共通オンラインCSS修正）、`3bca908`（フォーム幅比較の先行検査調整）、`25fcf3f`（公開用ビルドでのオンラインダイアログWebKit検査を追加）、`92117bd`・`b0bc079`（実際の待機ダイアログと検査実行の調整）、`c21526d`（待機室の立直fixture修正）。コミット実体を優先し、`c21526d` はBrowser UI全体を強化したコミットではなくfixture修正として記録する。
- 先行作業での自動検証結果：`npm test` 62件成功、`npm run build` 成功、`npm run typecheck:worker` 成功。Browser UI成功、公開用ビルドのWebKit検査は3画面×4画面幅（320/375/390/414px）の計12条件すべて成功。これらは今回再実行した結果ではない。
- GitHub Actions [run 40349629551](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40349629551) は成功し、Pages deploymentも成功。対象SHAは `c21526d1ec3919efd067afff24f8ad5b61036c4a`。これらも先行作業の結果であり、この記録作業では再実行していない。

## iPhone Safari実機確認

2026-10-26、ユーザーがiPhone Safari実機で修正後の次の3画面を確認し、すべて「閉じる」ボタンが1行表示だったと報告しました。

| 画面 | ユーザー報告 |
| --- | --- |
| 新しくルームを作る | OK：1行表示 |
| ルームに参加する | OK：1行表示 |
| オンライン待機 | OK：1行表示 |

これはユーザーによる実機確認結果です。CodexがiPhoneを操作して確認したものではありません。記録対象は上記3画面のボタン表示に限ります。

## 完了判定

対象3画面の修正後の自動検証・Pages deployment成功と、ユーザーによるiPhone Safari実機確認を記録しました。本件は **実機確認済み・完了** です。
