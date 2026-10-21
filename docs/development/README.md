# 開発記録の目次

ここにあるStep記録は、開発当時の目的・実装・設計判断・制約・検証状態を保存する歴史資料です。過去の「現在の仕様」や「未実装」という表現は記録時点を指します。現行仕様は[SPEC](../SPEC.md)、現在の実装状況と候補は[ROADMAP](../ROADMAP.md)を参照してください。

READMEから移した各Stepの本文と、本文にあった検証資料・スクリーンショットへのリンクを保全しています。相対リンクは移動先から開けるよう更新しています。ログや画像は[検証記録の目次](../verification/README.md)と[スクリーンショット](../screenshots/)にもあります。

| Step | 主な内容 | 実施日 | 記録 |
| --- | --- | --- | --- |
| 旧README前半 | 初期仕様説明、Step 5の検証ログなど。日付記載なし | 不明 | [保存記録](legacy-preface.md) |
| 6 | 和了形判定（通常形・七対子・国士無双） | 2026-10-12 | [記録](step-06.md) · [commit](https://github.com/ak-sekine/heibon-mahjong/commit/01f1e8d) |
| 7 | 基本役判定 | 2026-10-12 | [記録](step-07.md) · [commit](https://github.com/ak-sekine/heibon-mahjong/commit/6998020) |
| 8 | ツモ和了と局結果 | 2026-10-12 | [記録](step-08.md) · [commit](https://github.com/ak-sekine/heibon-mahjong/commit/ffc3b3e) |
| 8.1 | 赤ドラの翻数と結果表示 | 2026-10-12 | [記録](step-08.1.md) · [commit](https://github.com/ak-sekine/heibon-mahjong/commit/d14d951) |
| 8.2 | 表ドラ表示牌と通常ドラ | 2026-10-12 | [記録](step-08.2.md) · [commit](https://github.com/ak-sekine/heibon-mahjong/commit/4f1f1da) |
| 8.3 | 最大5枚のドラ表示レイアウト（旧配置） | 2026-10-12 | [記録](step-08.3.md) · [commit](https://github.com/ak-sekine/heibon-mahjong/commit/ed4c321) |
| 8.3.1 | 卓中央へのドラ表示移動 | 2026-10-12 | [記録](step-08.3.1.md) · [commit](https://github.com/ak-sekine/heibon-mahjong/commit/fe3cea1) |
| 9 | CPUツモ和了 | 2026-10-12 | [記録](step-09.md) · [commit](https://github.com/ak-sekine/heibon-mahjong/commit/60b8ce3) |
| 10 | ロン、フリテン、同時ロン | 2026-10-12 | [記録](step-10.md) · [commit](https://github.com/ak-sekine/heibon-mahjong/commit/baa2408) |
| 11 | 符・点数計算 | 2026-10-12 | [記録](step-11.md) · [commit](https://github.com/ak-sekine/heibon-mahjong/commit/4981f21) |
| 12 | 東風戦の点棒管理・局進行 | 2026-10-13 | [記録](step-12.md) · [commit](https://github.com/ak-sekine/heibon-mahjong/commit/a1a7d9b) |
| 12.3 / 12.4 | 局結果ダイアログ、結果フッター、新しい対局の確認 | 2026-10-13 | [まとめて読む](step-12.3.md) · [commit 12.3](https://github.com/ak-sekine/heibon-mahjong/commit/b6b2522) · [commit 12.4](https://github.com/ak-sekine/heibon-mahjong/commit/1f5fc17) |
| 13.1 | ユーザーのリーチ宣言と供託 | 2026-10-13 | [記録](step-13.1.md) · [commit](https://github.com/ak-sekine/heibon-mahjong/commit/496a352) |
| 13.1.1 | 供託点棒の表示 | 2026-10-13 | [記録](step-13.1.1.md) · [commit](https://github.com/ak-sekine/heibon-mahjong/commit/569b82f) |
| 13.1.2 | 操作ボタンの表示・配色統一 | 2026-10-13 | [記録](step-13.1.2.md) · [commit](https://github.com/ak-sekine/heibon-mahjong/commit/77baffc) |
| 13.2 | CPUリーチ、リーチ後フリテン、宣言牌表示 | 2026-10-14 | [記録](step-13.2.md) · [commit](https://github.com/ak-sekine/heibon-mahjong/commit/9aa29aa) |
| 13.2.1 | 向聴数・有効牌を使ったCPU打牌 | 2026-10-14 | [記録](step-13.2.1.md) · [commit](https://github.com/ak-sekine/heibon-mahjong/commit/405128d) |
| 13.3 | 一発、ダブル立直、裏ドラ | 2026-10-14 | [記録](step-13.3.md) · [commit](https://github.com/ak-sekine/heibon-mahjong/commit/ec63f06) |
| 13.3.1 | 和了結果のドラ表示 | 2026-10-15 | [記録](step-13.3.1.md) · [commit](https://github.com/ak-sekine/heibon-mahjong/commit/dfd1f12) |
| 13.4 | ポン・チー、副露和了と得点 | 2026-10-15 | [記録](step-13.4.md) · [commit](https://github.com/ak-sekine/heibon-mahjong/commit/6b0fe30) |
| 13.5 | 暗カン・大明カン・加カン、槍槓、嶺上開花 | 2026-10-15 | [記録](step-13.5.md) · [commit](https://github.com/ak-sekine/heibon-mahjong/commit/0310e7d) |
| 13.5.1 | 槍槓の宣言牌表示 | 2026-10-16 | [記録](step-13.5.1.md) · [commit](https://github.com/ak-sekine/heibon-mahjong/commit/abbace3) |
| 13.5.2 | 4人卓の再設計と副露牌表示 | 2026-10-16 | [記録](step-13.5.2.md) · [commit](https://github.com/ak-sekine/heibon-mahjong/commit/b919a18) |
| 13.5.3 | 卓上牌サイズと左右席情報 | 2026-10-16 | [記録](step-13.5.3.md) · [commit](https://github.com/ak-sekine/heibon-mahjong/commit/36e9dc6) |
| 13.5.4 | 卓上牌を手牌の基準サイズへ拡大 | 2026-10-17 | [記録](step-13.5.4.md) · [commit](https://github.com/ak-sekine/heibon-mahjong/commit/070e0e9) |
| 13.5.5 | 正方形卓、河・副露の重なり修正、自動・ブラウザー検証 | 2026-10-17〜18 | [開発記録](step-13.5.5.md) · [詳細検証](../verification/step13.5.5/README.md) · [基盤commit](https://github.com/ak-sekine/heibon-mahjong/commit/4393318) · [最終実装commit](https://github.com/ak-sekine/heibon-mahjong/commit/f15501867220670173b73e647996c7ef60de86b4) |
| 13.7 | 残りの一般役7種類 | 2026-10-18 | [開発記録](step-13.7.md) · [検証記録](../verification/step13.7/README.md) |
| 13.7.1 | 自動ターン処理テストの安定化 | 2026-10-18 | [開発記録](step-13.7.1.md) · [検証記録](../verification/step13.7.1/README.md) |
| 13.8 | 主要役満8種類 | 2026-10-18 | [開発記録](step-13.8.md) · [検証記録](../verification/step13.8/README.md) |
| 13.9 | 海底摸月・河底撈魚 | 2026-10-18 | [開発記録](step-13.9.md) · [検証記録](../verification/step13.9/README.md) |
| 13.10 | 流し満貫・九種九牌・四風連打・四家立直 | 2026-10-18〜19 | [開発記録](step-13.10.md) · [検証記録](../verification/step13.10/README.md) |
| 13.11 | 天和・地和 | 2026-10-19 | [開発記録](step-13.11.md) · [検証記録](../verification/step13.11/README.md) |
| 14.0 | Cloudflare Workersによるオンライン待機と座席同期 | 2026-10-19 | [開発記録](step-14.0.md) · [本番検証記録](../verification/step14.0/README.md) |
| 14.0.1 | Ready、ホスト管理、CPU席、退出、再接続、同期・レート制限 | 2026-10-19 | [設計・実装記録](step-14.0.1.md) · [検証記録](../verification/step14.0.1/README.md) |
| 14.1 | サーバー権威型オンライン東風戦、座席別表示、CPU・判断窓・局進行 | 2026-10-19 | [開発・設計記録](step-14.1.md) · [検証記録](../verification/step14.1/README.md) |
| 14.2 | 河の位置修正、ヘッダーメニュー、共通操作領域、表示名欄統一 | 2026-10-19 | [開発記録](step-14.2.md) · [検証記録](../verification/step14.2/README.md) |
| 14.3 | 対局UI共通化、河間隔修正、オンラインCPU表示名 | 2026-10-20 | [開発記録](step-14.3.md) · [検証記録](../verification/step14.3/README.md) · [処理時間記録](../verification/codex-performance/ui-unification.md) |
| 14.4 | メニューとオンラインダイアログの分離 | 2026-10-21 | [開発記録](step-14.4.md) · [検証記録](../verification/step14.4/README.md) · [処理時間記録](../verification/codex-performance/step14-4-menu-dialog-separation.md) |
| 14.5 | オンライン・オフライン操作欄の状態描画とイベント委譲の共通化 | 2026-10-21 | [開発記録](step-14.5.md) · [検証記録](../verification/step14.5/README.md) · [処理時間記録](../verification/codex-performance/step14-5-action-panel.md) |

Step 13.5のiPhone Safari実機確認は[2026-10-18の検証記録](../verification/kan-safari-2026-10-18.md)を参照してください。
