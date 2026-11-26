# Issue #69 Phase 2-B 候補の検証・未導入事項

この候補は最新 main `fa4d4437f8e5b6ca015b3db3e353d12bc4423968` に旧候補の４ファイルを引き継いだもの。公開 workflow と現行の `pages-verified` は変更しておらず、以下の分離・移行はまだ導入されていない。#70 の v1 固定通信契約・必須 CI を保持し、配布先 SHA 同一や手動互換フラグを要求しない。

## 対象判定

候補の `publication-plan.mjs` は配布先ごとの成功 SHA を入力として各ツリーを直接比較し、非祖先同士も対象とする。入力は信頼済みの環境別成功記録であることが前提。main または承認済み開発 SHA との一致、Environment・Secrets、同一 SHA の CI・成果物の出所と完全性の検証は呼び出し側の責任で、この候補では workflow に接続していない。明示対象が一方の場合、他方の未公開変更は deferred として返し成功記録を更新しない。基準欠損・不明なパス・差分取得失敗では停止する。

共通 `src/game`・`src/model`・`src/analysis` とオンライン契約は双方、UI・PWA は Pages、Worker 固有は Worker、依存定義は双方として扱う。検証・公開処理の既知ファイルは配信物の変更と区別するが、テスト・CI の実行を不要にするものではない。未知ファイルは停止する。

## 公開状態と安全停止

現行 `publication-reservation.mjs` は予約 snapshot の ref・run・attempt と Pages 全体の digest を照合し、`deploy-isolated-worker.mjs` はその予約に依存する。`artifacts.mjs` の stage は保持側 snapshot を照合してから候補を `pending` として保存し、公開成功後の finalize で current とする。`pages-publication` の排他と本番 audit・配信全ファイル照合を維持している。

単純にこの依存を外すと Worker が成功しても信頼できる配布先別基準 SHA の記録・結果不明の識別がなく、また Pages の公開成功後の記録失敗・キャンセル時に保持側が最後の成功版か判断できない。既存 `deployment-state.mjs` は旧 `heibon-production-worker` / `heibon-production-pages` 用であり、現行の本番・開発 Worker の独立した正本としてそのまま扱えない。非成功や結果不明の新しい公開を無視して過去の成功を返すこともある。公開経路・一体予約の変更は、有効な成功／失敗／不明の対応と再照合が成立するまで停止する。

推奨する移行順序は、最新 `pending` の解消確認、公開中の両環境と snapshot・Worker deployment の照合、履歴保持、Pages と Worker の独立した成功参照の初期化、障害・競合を含む検証、承認された切替。保持側の欠損・不一致、古い候補、結果不明、公開成功後の保存失敗では該当する Pages 公開を停止し、標準 deployment・不変 snapshot・実配信を照合する。古い pending を削除するだけの移行は禁止。移行中は共有 Pages への競合公開を止め、実環境や履歴を無断で変更しない。必要な参照・ロック・不明状態の最小構成と実際の権限は未確定である。

## Artifact と復旧

`actions/deploy-pages@v4` の同梱 `@actions/artifact` 2.1.3 は Actions の内部 ListArtifacts を呼び、結果に name、id、size、createdAt を返す。digest や有効期限は一覧に含まれない。候補 helper は検索結果の一意性・ID と、別途取得した REST metadata の digest・期限を分けて確認し、ZIP の digest 検証は既存 `reuse-production-ci.mjs` の `checkArchive` を再利用する。現在は mock のみで、Actions 実行文脈の内部検索や別 run/attempt の取得・再アップロードには未接続である。元 CI の成功証跡と公開・再開 run の ID は分け、元 CI の検証条件を緩めない。

検索だけがデプロイ要求前に失敗した場合の候補は、元 CI と成果物を再照合し、Pages 専用 run で再アップロードする方法。要求後の結果不明や成功後の記録失敗では再公開しないで標準記録・実配信を照合する。現状、この再開経路と同一検索ライブラリの利用権限は実証できておらず、成功済み Worker を再公開せず安全に再開できると保証しない。

## 品質・itch.io

CI の Chromium/WebKit、環境分離、オンライン、固定通信契約、Artifact digest、Environment・Secrets・DO 保護を維持する。Artifact ZIP の hash は受け渡し bytes、保持側 snapshot の digest は保存内容、合成 digest は合成後 bytes、公開後全ファイル hash は実配信それぞれの整合を検証する。代表ファイル・公開版識別だけでは実配信全体の一致は保証できないため、今回全ファイル照合を縮小しない。

itch.io は手動配布を維持し、ZIP の source SHA・ZIP digest・配布日・動作確認を記録する。現在の Draft の SHA は不明であり、Pages と Worker の同時更新は要求しない。一般公開・自動アップロードは #46 側の範囲である。
