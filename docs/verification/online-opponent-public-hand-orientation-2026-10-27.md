# 対面プレイヤー公開手牌の180度回転

## 対象

- 最終実装・検証コードコミット：`4e47ee4bce1ccc24241d4bdeea1004ac7ecab7fc`
- 回転修正コミット：`c9d52b37da8fa57bb882b75caecfd3b9b680ec5c`
- 修正内容：対面席（上席）の公開手牌を180度回転し、既存の手牌・副露・河の変形に影響しないCSSの個別`rotate`を適用。
- 現在の状態：**実機確認済み（一部シナリオ未確認）**

## 自動・ブラウザー検証

対象コミット`4e47ee4bce1ccc24241d4bdeea1004ac7ecab7fc`のGitHub Actions結果：

- [Browser UI verification run 40425489653](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40425489653)：成功。`npm test` 1,231件成功、`npm run build`成功、Chromium／WebKitのブラウザー回帰成功。
- 同runの専用WebKit検証では、九種九牌・対面プレイヤーツモ和了・対面プレイヤーロン和了・自分のツモ和了の4シナリオで公開牌の向きと関連レイアウト検査が成功。
- Playwright WebKitによるブラウザー検証であり、iPhone Safari実機確認を代替しません。
- [Deploy to GitHub Pages and Cloudflare Workers run 40425489606](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40425489606)：失敗。`npm test`は1,231件中1,229件成功、2件失敗。`tests/step14-0-1.test.ts`の「2人オンライン対局で人間の打牌後にCPU手番が進む」テストが進行待ちに失敗しました。Worker型チェック、Pages build、Worker／Pages deployおよび本番テストはスキップされました。この失敗は自動テスト結果として残し、Safari実機結果とは区別します。

## iPhone Safari実機確認

- 確認日：2026年10月27日
- 確認者：ユーザー
- 環境：iPhone Safari
- 和了時の対面公開手牌：正常
- 流局時の対面公開手牌：正常
- 九種九牌の対面公開手牌：**未確認**

この実機報告の状態は**実機確認済み（一部シナリオ未確認）**です。九種九牌は自動WebKit検証では成功していますが、実機では未確認のため、実機成功として扱いません。
