# 右上ハンバーガーメニューボタンのナビゲーション表示 — 2026-10-31

## 修正前の問題と原因

Issue #24の共通ボタン配色により、右上のメニュートグルにも黄色い操作ボタン背景と影が表示されていました。原因は `index.html` の `#main-menu-toggle` に `ui-button ui-button--b` が付いており、`src/style.css` 後方の共通 `.ui-button` ルールが通常状態・押下状態・フォーカス状態を適用していたことです。トグル固有CSSの詳細度と読み込み位置だけでは共通ルールから分離できていませんでした。

## 変更内容

- `#main-menu-toggle` から `ui-button` と役割クラスを除き、`.main-menu-toggle` をナビゲーション専用にしました。
- 通常は透明背景、白い三本線、影なし、44×44px、角丸8pxです。hoverは `#23684b`、押下は `#2d7655`、`aria-expanded="true"` は `#286b4e` と控えめな緑の枠線で示します。
- `:focus-visible` に3pxの明るいシアン系アウトラインを付けました。通常操作ボタンのCSSは `.ui-button` に限定され、ナビゲーショントグルには適用されません。
- `main-menu-item` の白系パネル、濃緑文字、区切り線、hover・押下色、フォーカス表示は変更していません。
- 開閉イベントやフォーカス管理は変更していません。既存実装が `aria-expanded` を開閉と同期し、再タップ、外側タップ、Escape、メニュー項目選択、矢印キー、Home/End、フォーカス復帰を処理します。

## 変更ファイル

- `index.html`
- `src/style.css`
- `tests/button-roles.test.ts`
- `tests/browser-button-roles.py`
- `tests/browser-online-waiting-room.py`
- `docs/verification/README.md`
- `docs/verification/main-menu-toggle-style-2026-10-31.md`

## ローカル検証

- `npm test`: 70/70成功。
- `npm run build`: TypeScript検査とVite build成功。
- `npm run typecheck:worker`: 成功。
- `git diff --check`: 成功。
- Browser UIの変更では、透明背景・白いアイコン・影なし・44×44px、hover・押下・展開状態、展開中の枠線を320/375/390/414/768/1280pxで検査するassertionを追加しました。通常操作ボタンの共通黄色配色と、メニュー項目の白系配色・hover・押下は引き続き検査します。
- Browser UIはCodex Cloud内で直接実行していません。リポジトリの実行指示に従い、Chromium/WebKitのPlaywright検証はpush後のGitHub Actions `Browser UI verification` で確認します。
- 変更ファイル分類では `index.html` と `src/style.css` がアプリ変更となり、deploy workflowの自動デプロイ対象です。実行結果はpush後に記録します。

## Browser UI、Actions、デプロイ

- 最初のDeploy run [41170842630](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41170842630) は、Browser UIで追加したテストがマウス解放クリックの後にもう一度クリックし、展開中を確認する前に閉じていたため失敗しました。製品コードではなくテスト手順の重複でした。`11c547d8e2a9d4a6be190e91a9eab4a63d940c00` で余分なクリックを除き、修正版runで再検証しました。
- 修正版のDeploy run [41171398665](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41171398665) はsuccessです。`detect-changes`、`docs-check`、`verify`、Browser UI、`release-freshness`、Worker deploy、本番Worker検証、Pages build/deployの全jobがsuccessしました。自動デプロイ判定は対象SHAをデプロイ対象とし、手動デプロイは不要でした。
- Browser UIはChromium 35件、WebKit 21件の全56検証がsuccessしました。`tests/browser-button-roles.py` は両ブラウザーでsuccessし、透明背景・白い三本線・影なし・44×44px、hover／押下／展開中、フォーカス表示、通常操作ボタンの黄色、メニュー項目の白系配色を確認しました。幅320/375/390/414/768/1280pxと、既存の回転・開閉・Escape・外側タップ・キーボード・対局／ダイアログ／オンライン操作回帰も確認しています。
- GitHub ActionsはWorker `https://heibon-mahjong-online.ak-sekine.workers.dev` のdeploy、本番HTTPS・ルーム・WebSocket・再接続・認証・プライバシー検証、Pages build/deployをすべて成功として記録しました。Worker SHAとPages SHAはいずれも `11c547d8e2a9d4a6be190e91a9eab4a63d940c00` です。
- 公開Pagesの `https://ak-sekine.github.io/heibon-mahjong/` は、通常のcurlがproxy port 8080への接続失敗、許可付きcurlもHTTP 403 Forbiddenとなりました。そのため公開HTML/CSSと配信後のcomputed styleは未確認です。これはActions上のdeploy successとは別の確認結果です。

## 実機確認

### iPhone Safariでの確認 — 2026-10-31

- 確認者: ユーザー本人（Codexは実機を操作していません）
- 環境: iPhone Safari
- 対象: 公開中のHEIBON MAHJONG
- 画像: ユーザー提供のメニュー開／閉スクリーンショット

スクリーンショットによる表示確認では、ハンバーガーアイコンが白色で、黄色いボタン背景がなく、閉じた状態のボタン背景が透明であることを確認しました。展開中は緑系の背景と枠線が表示され、メニュー項目は白系背景・濃緑文字で、項目間に区切り線があります。配置と文字の折り返しも画像上問題ありませんでした。ドロップダウン項目の表示については[メニュー検証記録](menu-dropdown-style-2026-10-31.md)にも要点を記録しています。

画像とは別に、ユーザーは「すべて正常です」と報告しました。確認した操作は、メニューを開く・閉じる、項目を選ぶ、メニュー外をタップして閉じる、連続タップ、4つの項目を操作する、通常の操作ボタンを使うことです。これはユーザーによる実機操作の報告であり、自動テスト結果とは区別します。

### 自動検証との区別

- `npm test`: 70/70成功。
- GitHub Actions Deploy run [41171398665](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41171398665): success。Browser UIはChromium 35件、WebKit 21件が成功し、WorkerとPagesのdeployもsuccessしました。
- 関連Actions記録のWorker／Pages対象SHAは `11c547d8e2a9d4a6be190e91a9eab4a63d940c00` です。前回報告されたmain SHA `d607dc24e451b0ae1cf4284ccedd9ba0dd54c07b` は今回の作業開始時に `origin/main` と一致しました。スクリーンショットから公開配信SHAを特定したものではありません。

Chromium／WebKitとActionsの結果はiPhone Safari実機の直接操作を意味しません。公開配信CSSのcomputed styleも未確認です。

### 完了範囲と未確認事項

今回完了した範囲は、iPhone Safariでのメニュートグルとドロップダウンの表示、および上記のユーザー報告に含まれる開閉・項目選択・通常ボタン操作です。Issue #24全体の実機確認完了とは扱いません。

Android Chrome実機、PC Firefox実機、PWAインストール状態、公開配信CSSのcomputed style、すべてのボタン種別・状態の網羅的な実機確認は未確認です。Issue本文と既存コメントがAndroid Chromeの実機確認も完了前の条件としているため、Issue #24はOpenのままです。全ボタン配色の検証履歴は[Issue #24ボタン配色記録](button-role-colors-issue24-2026-10-30.md)、目次は[検証README](README.md)を参照してください。
