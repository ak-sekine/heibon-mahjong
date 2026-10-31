# 右上メニューのドロップダウン表示 — 2026-10-31

## 修正前の問題と原因

Issue #24の共通ボタン配色をメニュー項目にも適用していたため、メニュー項目が通常の操作ボタンと同じ黄色になっていました。HTMLでは各項目に `ui-button` と役割クラスが付き、`src/style.css`末尾の `button.ui-button` 共通規則が、先行する `.main-menu-items button` より強い詳細度で黄色を適用していました。

## 変更したUI

- メニュー項目から `ui-button` と役割クラスを外し、専用の `main-menu-item` に分離しました。ハンバーガーボタンは従来どおり `ui-button` のままです。
- パネルは `#fffdf7`、文字は `#154e3c`、細い境界線、10px角丸、控えめな影にしました。項目は44px以上、左揃え、白系背景で、項目間を細線で区切ります。
- hover・押下時は淡い緑系背景、キーボードフォーカス時は濃い緑のアウトラインを使います。文字サイズ拡大時に折り返せるよう項目は通常の折り返しを許可しています。
- パネル幅は216px以上・240px以下を基本に画面幅で制限し、既存の右上配置とセーフエリア対応を維持します。
- メニューの外側タップ、Escape、矢印キー、Home/End、開閉時の `aria-expanded`、選択後の閉じる挙動は維持しました。フォーカスがメニュー外に移った場合はメニューも閉じます。
- 通常操作ボタンの通常／押下／無効色と、ハンバーガーボタンの黄色は変更していません。

## 変更ファイル

- `index.html`
- `src/style.css`
- `src/ui/main-menu.ts`
- `tests/button-roles.test.ts`
- `tests/browser-online-waiting-room.py`
- `tests/browser-button-roles.py`

## ローカル検証

- `npm test`: 70/70成功。
- `npm run build`: TypeScript検査とVite build成功。
- `npm run typecheck:worker`: 成功。
- Browser UIに配色、44px以上の高さ、区切り線、メニュー開閉ボタンの黄色、画面幅320/375/390/414/768/1280pxでの横はみ出し、844×390px横向き時の表示範囲を確認する検証を追加しました。
- Browser配色検証で、通常操作ボタンを黄色状態、メニュー項目を白系通常状態／薄緑hover・押下状態として分けて確認します。
- アプリファイルを含む変更を自動デプロイ対象とすることを、差分分類器で確認しました。
- `git diff --check`: 成功。

## Browser UI結果

- Deploy workflow run [41168193838](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41168193838) 内のBrowser UIがsuccessしました。
- Chromium 35件、WebKit 21件、計56件成功。menu itemの背景・文字色・44px高・hover・押下、menu buttonの黄色、320/375/390/414/768/1280px幅での横はみ出し、844×390px横向きでの配置、既存の開閉・Escape・矢印キー・外側タップ・メニュー選択・対局操作／ダイアログ／鳴き操作の回帰を確認しました。
- Browser UI自体はPlaywright上のChromium／WebKit検証です。iPhone Safari／Android Chromeの実機検証ではありません。

## GitHub Actions・公開

- 実装コミット: `f88f6c03a6fadc2b188b33f963e03c6cae49c8a9`、フォーカス修正 `e4de22f9c363d9ccb734471c574940e92247f260`、Browser assertion追従 `c0ac785b58bebd08a88b2a58248b2b1047e4e46b`。すべて`main`へpush済み。
- Browser UIが検出したメニュートグルのfocusout問題を [修正コミット `e4de22f`](https://github.com/ak-sekine/heibon-mahjong/commit/e4de22f9c363d9ccb734471c574940e92247f260) で修正しました。
- その後の [run 41166855271](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41166855271) は、最後のbutton-role検証で `#new-game` の黄色背景期待値を検出。専用メニュー項目の白系通常色・hover・押下色にassertionを更新し、通常ボタンは黄色を期待するよう分離しました。更新はコミット `c0ac785` です。
- 実装コミットと追従テストの変更を対象にするrun `41168193838` は `deploy_required=true`、`pending_release=true`。分類は`validation-only`ですが、前回の未配信アプリ差分がpending releaseとして検出されたため、アプリ変更を含めて自動配信しました。run全体はsuccessです。
- `release-freshness`: success。
- `deploy-worker`: success。Worker URL `https://heibon-mahjong-online.ak-sekine.workers.dev`。記録されたWorker SHAは `c0ac785b58bebd08a88b2a58248b2b1047e4e46b`。
- `production-test`: success。
- `pages-build` / `pages-deploy`: success。GitHub Pages deploymentの`pages_build_version`および記録SHAは `c0ac785b58bebd08a88b2a58248b2b1047e4e46b`。したがってActions上のWorker／Pages公開対象SHAは一致します。
- 公開配信物の直接取得: `https://ak-sekine.github.io/heibon-mahjong/` への通常curlはproxy port 8080に接続できず失敗。許可付き再試行はHTTP 403でした。公開HTML/CSSとブラウザー上のcomputed styleは取得できず**未確認**です。これはActions上のdeploy successとは区別します。

## 実機確認の引き継ぎ

### iPhone Safariでのユーザー確認 — 2026-10-31

ユーザー本人がiPhone Safariで公開中のHEIBON MAHJONGを確認しました。ユーザー提供のメニュー開／閉スクリーンショットでは、展開中の緑系背景と枠線、白系背景の項目、濃緑文字、項目間の区切り線、配置と文字の折り返しに問題がないことが確認されています。

スクリーンショットによる表示確認と別に、ユーザーはメニューを開く・閉じる、4項目を選ぶ、メニュー外タップで閉じる、連続タップ、通常操作ボタンを使う操作が「すべて正常」と報告しました。実機操作はユーザー本人によるもので、CodexがiPhoneを操作したものではありません。メニュートグルを含む表示の詳細と自動テストとの区別は[ハンバーガーメニュー検証記録](main-menu-toggle-style-2026-10-31.md)にまとめています。

### 未確認とIssueの状態

Android Chrome実機、PC Firefox実機、PWAインストール状態、公開配信CSSのcomputed style、すべてのボタン種別・状態の網羅的な実機確認は未確認です。Chromium／WebKitの自動検証（run [41171398665](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41171398665)）と、iPhone Safariでのユーザー確認は別々の結果として記録しています。当時の「Android実機確認完了までOpen」とした状態は、次の最終判定で更新しました。

## Issue #24最終完了判定 — 2026-10-31

ドロップダウン項目の白系背景・濃緑文字・区切り線・控えめな影・淡い緑のhover／押下表示・キーボードフォーカス表示への修正は完了しています。ハンバーガートグルも通常操作ボタンCSSから分離済みです。自動検証結果とユーザー本人によるiPhone Safariの表示・操作確認を根拠に、Issue #24は完了・Closeしました。

Android Chrome実機（端末なし）、PC Firefox実機、PWAインストール状態、公開配信CSSのcomputed style、全ボタン種別・状態の網羅的な実機確認は未確認で、今回のClose条件からは除外しています。詳細な完了根拠は[全ボタン配色記録](button-role-colors-issue24-2026-10-30.md)、実機の確認者・報告範囲は[ハンバーガーメニュー記録](main-menu-toggle-style-2026-10-31.md)を参照してください。
