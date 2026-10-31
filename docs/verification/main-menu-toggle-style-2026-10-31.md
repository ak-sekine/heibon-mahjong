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

push後に対象SHAのActions run、Browser UIのChromium/WebKit結果、WorkerとPagesのデプロイ結果を追記します。公開環境の配信物を取得できるかも確認し、確認できなければ理由とともに未確認と記録します。

## 実機確認

iPhone SafariおよびAndroid Chromeの実機確認は未実施です。ユーザーに、縦横向き・各画面幅・タップ応答・フォーカス・開閉・画面端・PWA表示を確認してもらいます。Issue #24は実機確認が完了するまでOpenのままにします。
