# Step 14.1 検証

## ローカル自動検証

2026-10-19に実施しました。

| 検証 | 結果 |
| --- | --- |
| `npm test` | 成功。48テストファイル、pass 48 / fail 0。オンライン10ケースとStep 14.0.1 Durable Object統合11シナリオを含む |
| `npm run typecheck:worker` | 成功 |
| `npm run build` | 成功 |
| `git diff --check` | 成功 |
| `node --check tests/online-production.mjs` | 成功 |
| `python -m py_compile tests/browser-online-waiting-room.py` | 成功 |
| Wrangler `deploy --dry-run --config wrangler.jsonc` | 成功。Room / RateLimit Durable Object bindingを確認 |

オンライン専用テストは、1〜4人での136枚一意性・牌種4枚・初期25,000点、座席別ビューの秘密センチネルと流局時の人間手牌非公開、revision・手番・牌所有検証、オンラインのリーチ・ツモ・カン・九種九牌・次局操作、複数ロン、席ごとのフリテン、JSON復元後の判断窓・精算結果、期限切れの遅延回答拒否、複数人の鳴きとポン優先、1人＋CPU3人の東1局から東4局終了までの決定的human+CPU進行を確認します。既存のDurable Object統合テストは開始権限、SQLite保存・再生成復元、同じ手牌の再接続、重複打牌、サーバーdraw/CPU進行、明示的退出後の中断・ホスト引継ぎを確認します。

CPU時間の参考として、オンラインのリーチ候補スキャンに2.5ms期限、シャンテン選択に2ms区間・3ms中断予算を設けました。Node上の初期手`advanceOnlineCpu` 12サンプルはwall time中央値7.23ms、最大18.16msでした。最大値には初回実行のcold/JIT影響も含まれます。これはCloudflare WorkersのCPU時間ではなく、Worker環境でのCPU制限適合を直接証明しません。超過時は合法な決定的打牌へ切り替え、本番Workerで継続計測します。

## ブラウザー検証

既存の`.github/workflows/browser-ui.yml`が実行する`tests/browser-online-waiting-room.py`に、390×844の2人＋CPU2人の卓、座席回転、各席の伏せ牌、合法操作、打牌同期、CPU河、ロン・鳴き選択肢、局結果、次局、再接続、退出中断を追加しました。AGENTS.mdに従いCodex Cloud内ではChromiumを起動していません。GitHub ActionsのBrowser UI verificationは成功しました。従来の1人用ブラウザー回帰も同じジョブで成功しています。

## 本番Cloudflare・GitHub Actions・Pages

`.github/workflows/deploy.yml`の[run 39304886411](https://github.com/ak-sekine/heibon-mahjong/actions/runs/39304886411)（main SHA `dbf5837311c4c6f2fb1d26a5ee27a3710e7833f7`）で、以下すべて成功しました。

- `verify`（回帰テスト、Worker型検査、Pages build）
- Browser UI verification（既存1人用回帰とオンライン代表ケース）
- 既存Workerへのdeploy
- 2人＋CPU2人の専用本番ルームを使った通信テスト：対局開始、座席別Viewと秘密情報非送信、合法・不正操作、CPU進行、WebSocket切断・再接続、明示的退出
- GitHub Pages build / deploy

本番テスト用クライアントでは、相手向け座席Viewの選択、別接続のメッセージcursor利用、WebSocket更新の到着順序を原因とする検証上の失敗を修正しました。最終runでは2人＋CPU2人の本番通信を含む全jobが成功しました。

ユーザー指定URL: [Cloudflare Worker](https://heibon-mahjong-online.ak-sekine.workers.dev) · [GitHub Pages](https://ak-sekine.github.io/heibon-mahjong/)

## 未確認

- iPhone Safari実機の画面・操作。
