# 検証記録の目次

このディレクトリには過去の自動テスト、ビルド、Chromiumブラウザー確認などのログを保存しています。**iPhone Safari実機の確認結果は、確認者と報告範囲が分かる専用記録に分けます。** 各ログの数値や未完了事項は実施当時の結果です。

## 実機確認

- [カン機能 — iPhone Safari実機、2026-10-18](kan-safari-2026-10-18.md)。ユーザー報告による総括記録です。シナリオ別ログやスクリーンショットの記録ではありません。

## 自動・ブラウザー検証

| 記録 | 主な対象 |
| --- | --- |
| [Step 13.8](step13.8/README.md) | 主要役満8種類、候補単位の複合、点数、結果表示。Browser UI verification はGitHub Actionsで実施。 |
| [Step 13.9](step13.9/README.md) | 海底摸月・河底撈魚、最終通常ツモ／打牌の局進行。Browser UI verification はGitHub Actionsで実施。 |
| [Step 13.10](step13.10/README.md) | 流し満貫、九種九牌、四風連打、四家立直と局精算。Browser UI verification はGitHub Actionsで実施。 |
| [Step 13.11](step13.11/README.md) | 天和・地和、配牌時ツモ、役満複合、CPU自動和了と局精算。Browser UI verification はGitHub Actionsで実施。 |
| [Step 14.0](step14.0/README.md) | Cloudflare Workers本番URL、HTTPS、ルーム、WebSocket座席同期、再接続、認証・非公開情報の検証。 |
| [Step 14.0.1](step14.0.1/README.md) | Ready、CPU補充、権限引き継ぎ、退出、revision、重複要求、レート制限、本番WebSocket・Browser UI検証。 |
| [Step 14.1](step14.1/README.md) | サーバー権威型オンライン対局、座席別情報保護、進行・再接続、ローカル結合、Cloudflare本番WebSocket・Browser UI検証。 |
| [Step 13.7](step13.7/README.md) | 一般役7種類の候補判定、点数計算、結果表示。Browser UI verification はGitHub Actionsで実施。 |
| [Step 13.5.5](step13.5.5/README.md) | 正方形卓、牌・河・副露の配置、実カン操作、画面サイズごとの検証。初回の未完了事項と後続修正も時系列で保存。 |
| [Step 13.5.4](step13.5.4/README.md) | 卓上牌の寸法と画面表示。 |
| [Step 13.5.3](step13.5.3/README.md) | 卓上牌の寸法と左右席情報。 |
| [Step 13.5.2](step13.5.2/README.md) | 卓画面再設計後の回帰確認。 |
| [Step 13.5.1](step13.5.1/README.md) | 槍槓の宣言牌表示と操作確認。 |
| [Step 13.5](step13.5/README.md) | カン・嶺上開花・槍槓の単体、ビルド、Chromium記録。 |
| [Step 13.3.1](step13.3.1/) / [Step 13.3](step13.3/) | 和了結果の表・裏ドラ表示と回帰確認。 |
| [中央情報表示](center-info/README.md) | 卓中央の局情報・ドラ・供託の配置。 |
| [カン検証ページの説明](../kan-verification.md) | 公開検証ページと各操作シナリオの説明。 |
| [Step 13.4の検証ログ](../validation/step13.4/) / [副露UI修正](../validation/call-ui-fix.md) | 副露操作と表示の検証資料。 |

画像と画面別の測定データは[スクリーンショット](../screenshots/)にあります。既存のログ・画像は文書整理では移動・削除していません。
