# Step 14.7 検証記録

実施日：2026-10-22（自動検証・ユーザー実機確認を反映）

対象：宣言吹き出し表示

## 自動検証

- `npm test`：成功、54テスト。
- `npm run build`：成功。
- `npm run typecheck:worker`：成功。
- `python -m py_compile tests/browser-declaration-bubbles.py tests/browser-declaration-gameplay.py tests/browser-online-waiting-room.py`：成功。
- `git diff --check`：成功。
- Browser UI verification は [コミット `da7244a` の実行](https://github.com/ak-sekine/heibon-mahjong/actions/runs/39870440612)で成功しました。単体テスト、ビルド、Chromium／WebKitのブラウザーUI検証を含みます。

## ブラウザーUI

`tests/browser-declaration-bubbles.py` は320px・1280pxのオフライン／オンライン卓で、4方向の配置、5種の文字、入力を遮らないこと、同席連続宣言によるタイマーリセット、2秒後の消去を確認します。

`tests/browser-declaration-gameplay.py` は実際のリーチ操作を使う結合テストです。オフラインではローカル対局コントローラーと操作ボタン、オンラインではゲームエンジン・公開ビュー・オンラインコントローラーの状態受信と操作ボタンを通します。320×568の画面で、吹き出しの即時表示、画面内・最前面での視認性、表示開始から1.8秒後も表示されること、2.1秒後に消えていることを確認します。Chromiumと、モバイル設定のWebKitで実行しました。WebKitはSafari実機そのものではなく、オンラインテストも実際のWebSocket通信までは行いません。

## iPhone Safari実機

2026-10-22、ユーザーから、iPhone Safari実機でオフライン対局・オンライン対局の両方に吹き出しが正常表示されたとの確認を受けました。端末機種、iOS／Safariのバージョン、確認した宣言の種類、画面記録は共有されていません。

## 以前の無表示報告

以前報告された「オンライン・オフラインの実対局で吹き出しが表示されない」症状は、自動結合テストでは再現しませんでした。実際のリーチ操作から描画処理までの経路と画面表示はChromium／WebKitで確認でき、iPhone Safariについても上記のユーザー実機確認があります。ただし、当初の無表示の原因は特定されていません。キャッシュや配信アセットなど、個別の原因を確認した事実はありません。調査中にゲーム本体のコード変更は行っていません。
