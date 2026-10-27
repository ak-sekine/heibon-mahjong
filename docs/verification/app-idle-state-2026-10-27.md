# 対局開始方式と待機状態の検証

実施日：2026-10-27

## 実施内容

- `npm test`：成功。63件のテストファイルが通過。
- `npm run build`：成功。
- `npm run typecheck:worker`：成功。
- 追加したブラウザーテスト2件のPython構文確認：成功。
- `git diff --check`：成功。

## ブラウザー検証

`tests/browser-app-idle.py` は初回表示・再読み込み、320px幅の待機画面、メニューからの東風戦・半荘戦開始を確認します。既存の `tests/browser-online-waiting-room.py` は明示開始を前提にしたオンライン作成・参加・再接続、対局結果からの待機復帰、退出後の待機状態を確認します。これらを `.github/workflows/browser-ui.yml` のChromium・WebKit実行に追加しました。

この実行環境内のブラウザーUI結果は未確認です。GitHub Actionsの対象コミット実行結果はpush後に追記します。iPhone Safari実機確認も未実施です。
