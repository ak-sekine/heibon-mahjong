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
  VITE_ONLINE_API_URL=https://online-mock.invalid指定で検証（本番公開用ZIPではない）。
- Python構文検査・git diff --checkを実施。
- ブラウザーはAGENTS.mdの既知のCloud起動制限に従い既存Deploy内のBrowser UIを使用。
  対象コミットのActions結果で成功・失敗を判定する。実行前時点では未確認。

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
