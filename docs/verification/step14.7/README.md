# Step 14.7 検証記録

実施日：2026-10-22

対象：宣言吹き出し表示

## 自動検証

- `npm test`：成功、54テスト。
- `npm run build`：成功。
- `npm run typecheck:worker`：成功。
- `python -m py_compile tests/browser-declaration-bubbles.py tests/browser-online-waiting-room.py`：成功。
- `git diff --check`：成功。

## ブラウザーUI

320px・1280pxのオフライン／オンライン卓、4方向、5種の文字、入力を遮らないこと、同席連続宣言によるタイマーリセット、2秒後の消去を確認する `tests/browser-declaration-bubbles.py` を追加しました。既存のオンライン卓UI検証にもイベント受信・描画確認を追加しています。

ChromiumのUI実行は既存のBrowser UI GitHub Actionsで確認します。結果は対象コミットの実行を確認後に記録します。iPhone Safari実機は未確認です。
