# オンライン待機ダイアログの補助ボタン配置 — Issue #43、2026-11-05

## 変更内容

- 待機ダイアログのタイトル行、ルームコード行、対局形式行を、それぞれ情報左・操作ボタン右の2列に揃えました。
- 3つのボタンは共通の右列を使い、幅96〜112px、高さ44px、角丸8px、同じ文字サイズ・太さ・余白に統一しました。幅は320px程度の狭幅で96px、通常幅で最大112pxです。
- ルームコードの省略表示をなくし、有効期限をコードの直下に保ちました。ルーム情報の後に既存配色の区切り線を追加しました。
- 既存の`ui-button ui-button--b`、要素ID、イベントリスナー、`aria-label`を維持しています。`src/online/waiting-room.ts`、参加者一覧、下部操作、再接続、オンライン／オフラインのゲーム処理は変更していません。

## 検証

- 作業基準：`origin/main` / `92480dc523c05d343065203b12dbca64dedbccc7`。作業開始時の`work`は7コミット遅れており、fetch後にfast-forwardしました。作業開始時・fetch後とも作業ツリーはクリーンでした。
- `npm test`：82件成功、失敗0件。
- `npm run build`：成功（TypeScript、Vite、PWA shell）。
- Browser UI runner選択テスト：7件成功。待機ダイアログ測定をChromium／WebKit両方のマニフェストに追加しました。
- `git diff --check`：成功。
- `npm run typecheck:worker`：Workerのソースを変更していないため対象外です。
- 対象コミットのGitHub Actions `Browser UI verification`、Deploy gate、Worker／Pagesの結果：実行後に追記します。待機ダイアログは320〜1440pxの縦・横・PC幅で3ボタンの`BoundingClientRect`、文字の一行表示、コード、有効期限、横方向のoverflowを検証します。右端の許容誤差は、ブラウザーの小数CSSピクセル処理を考慮した0.5pxです。
- GitHub Pagesのデプロイ結果・公開SHA：Actions完了後に追記します。

## 実機確認と受入条件

- iPhone Safari縦画面／横画面、ホーム画面PWA、ホスト／ゲスト、準備前後、座席確定前後、再接続の実機確認は未実施です。Chromium／WebKitの自動結果で置き換えません。
- ボタンの配置・寸法・タップ領域・文言の一行表示、6文字コードと期限、狭幅／横幅／PC幅、横overflow：自動テストとActionsの実行後に結果を記録します。
- 既存ボタン動作と待機室下部操作：自動テストを含めActionsの対象コミット実行後に結果を記録します。
- Issue #43はOpenのままにし、実機確認結果とあわせてClose可否を別途判断します。
