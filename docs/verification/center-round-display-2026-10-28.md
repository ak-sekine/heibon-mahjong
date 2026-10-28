# 卓中央の局表示 — Issue #4 — 2026-10-28

## 修正前の問題と原因

iPhone Safariのスクリーンショットでは、卓中央に「東1局 東風戦 山69枚」が小さく表示され、読み取りづらいとの報告がありました。ソースでは共通の局ラベル描画処理が `data-format-label` を設定し、CSS疑似要素が東風戦／半荘戦を追加していました。卓中央は牌寸法を基準にした狭い領域で、文字も最大11px相当の clamp 指定でした。

## 変更内容

- 共通局表示から対局形式の文字・属性を外し、局情報、本場数、残り枚数だけを描画します。
- 0本場は省略し、1本場以降は局情報に表示します。山の残り枚数は従来どおりゲーム状態から受け取ります。
- 599px以下は局情報と山表示を別行にし、主要テキストを16pxに設定します。王牌枚数は補助表示として同じ行に収めます。
- PC幅では従来の横並び、文字サイズ、卓寸法を保ちます。
- 描画処理はオンラインとオフラインで共通です。対局形式の設定・局進行・通信処理は変更していません。

## 変更ファイル

- `.github/workflows/browser-ui.yml`
- `src/main.ts`
- `src/rendering/match.ts`
- `src/rendering/shared-table-components.ts`
- `src/style.css`
- `tests/browser-dora-rows.py`
- `tests/shared-table-components.test.ts`
- `tests/browser-center-round-display.py`
- `docs/verification/README.md`
- `docs/verification/center-round-display-2026-10-28.md`

## 検証結果

- `npm test`: 成功（64個のテストファイルが成功、失敗0）。東風戦・半荘戦共通の局ラベル、東場・南場、0本場省略、1本場以上、動的な山枚数を確認。
- `npm run build`: 成功。
- `npm run typecheck:worker`: 成功。
- `git diff --check`: 成功。
- Browser UIテスト: 新しい検証を既存 `Browser UI verification` に追加。320、375、390、430、1280pxでオンライン／オフライン、両対局形式、東場／南場、本場数、山枚数、領域内配置、折返し、ドラ・河との干渉をChromiumとWebKitで測定し、スクリーンショットを保存します。対象コミットのActions実行前のため、結果は未確認です。
- iPhone Safari実機: ユーザーからの実機確認報告がないため未確認です。

## 公開・コミット

- 対象実装コミットSHA: `1e42c29bf3c124f20fe41db3cc2c6b6fc7467ba1`（Issue #4の実装・テスト）。
- GitHub Actions、Pages、Workersデプロイ: 対象コミットの実行結果を確認後に追記します。

## 未確認事項

- Chromium／WebKitのブラウザー計測とスクリーンショット。
- GitHub Pages／Workersのデプロイ完了。
- iPhone Safari実機の目視確認。
