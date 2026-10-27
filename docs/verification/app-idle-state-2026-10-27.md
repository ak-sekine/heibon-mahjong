# 対局開始方式と待機状態の検証

実施日：2026-10-27

## 実施内容

- `npm test`：成功。63件のテストファイルが通過。
- `npm run build`：成功。
- `npm run typecheck:worker`：成功。
- `git diff --check`：成功。

## ブラウザー検証

`tests/browser-app-idle.py` は初回表示・再読み込み、320px幅の待機画面、メニューからの東風戦・半荘戦開始を確認します。既存の `tests/browser-online-waiting-room.py` は明示開始を前提にしたオンライン作成・参加・再接続、対局結果からの待機復帰、退出後の待機状態を確認します。

| GitHub Actions | Run ID | 対象 SHA | 結果 |
| --- | ---: | --- | --- |
| Browser UI verification | [40510397433](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40510397433) | `13a64789b93a798a9d3fdcd5fa8ea366b9757a3f` | 成功。ChromiumとWebKitの指定ブラウザー回帰を実行。待機画面、オンライン対局、卓・結果・診断を含む既存回帰も通過。 |
| Deploy to GitHub Pages and Cloudflare Workers | [40510397391](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40510397391) | `13a64789b93a798a9d3fdcd5fa8ea366b9757a3f` | 成功。Worker型チェック・Pages build、内包ブラウザー回帰、production test、Workerデプロイ、Pages build/deployを確認。 |

iPhone Safari実機確認は未実施です。
