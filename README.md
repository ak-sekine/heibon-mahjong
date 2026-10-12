# quill-mahjong
A lightweight, browser-based Japanese Mahjong game. Play anytime, anywhere.

初期画面のみ実装しています。ゲーム機能はまだありません。

## 開発

Node.js 24を使用します（`nvm use`）。

```sh
npm ci
npm run dev
```

## ビルドと確認

```sh
npm run build
npm run preview
```

プレビューURLの `/quill-mahjong/` を開いてください。
Vite + TypeScript、HTML/CSSのみを使用し、外部画像・Webフォントは使用していません。

## GitHub Pages

リポジトリの **Settings → Pages → Build and deployment → Source** を
**GitHub Actions** に設定してください。Actionsが無効なら有効化し、
`github-pages`環境に承認ルールがある場合はデプロイを承認してください。

`main`へのpushでビルド・デプロイします。設定後に再実行する場合は、
**Actions → Deploy to GitHub Pages → Run workflow → main** を選択します。

公開URL: https://ak-sekine.github.io/quill-mahjong/

## iPhoneでの確認

Safariで公開URLを開き、縦画面で中央に「Quill Mahjong」と
「Coming Soon」が表示されること、横スクロールがないことを確認してください。
アドレスバーの展開・収納時、ノッチ・ホームインジケータ付近の余白も確認してください。
