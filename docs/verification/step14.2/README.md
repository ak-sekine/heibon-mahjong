# Step 14.2 検証

## ローカル自動検証

2026-10-19に実施しました。

| 検証 | 結果 |
| --- | --- |
| `npm test` | 成功。49テストファイル、49成功、失敗0件。河の席回転、1・6・7・18枚、順序、リーチ宣言牌を含む |
| `npm run build` | 成功 |
| `git diff --check` | 成功 |
| `python -m py_compile tests/browser-online-waiting-room.py tests/browser-riichi-discard-layout.py` | 成功 |
| `npm run typecheck:worker` | Workerを変更していないため実行対象外 |

## Browser UI verification

既存の[Browser UI verification workflow](../../../.github/workflows/browser-ui.yml)を使用します。Codex CloudではAGENTS.mdの方針に従いChromiumを起動しません。mainへのpushで実行される対象SHAの結果を、push後に追記します。

- オフライン河: 4席、捨て牌18枚と各宣言牌位置、枚数増加前後の既存牌座標、牌の重なり・卓中央・画面外へのはみ出し。幅320、355、375、390、430、1280px。
- オンライン河: 4つのビューアー席と1・6・7・18枚、宣言牌あり・なし。幅320、375、390、430、1280px。中央情報との重なりと宣言牌以外の座標変化を確認。
- オンライン待機・操作: 共通メニューの開閉とキーボード操作、ルーム作成・参加・退出、共通表示名、sessionStorage、操作ボタンの構造・寸法、非公開牌IDのDOM非表示を確認。
- 代表画面を各幅のオンライン卓と対局結果で撮影し、workflow artifact `browser-ui-<sha>`へ保存します。

## GitHub Actions、本番Worker、Pages

mainへのpush後、`deploy.yml`の対象SHAで`verify`、Browser UI verification、Cloudflare Worker deploy、production test、GitHub Pages build / deploy の実行状態を記録します。

## 未確認

- iPhone Safari実機での表示・操作は未確認です。ユーザーによる実機確認が必要です。
