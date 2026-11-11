# Issue #47 環境分離設計（2026-11-11）

状態：段階導入。実装・自動検証と外部設定・公開・実機確認を分ける。

## 開始時点

- Issue本文・受入条件・コメント（0件）を確認。
- `work`、HEAD / fetch後origin/main: `cb457bb0dfe00455adf66d5f8c51284d0d00081f`。
- 未コミット変更なし、behind/ahead 0/0、未pushコミットなし。originはak-sekine/heibon-mahjong。
- 通常sandboxのfetchはproxy:8080接続失敗。正規の権限付き同一fetch成功。
- deploy.ymlはmainのみ、最新SHA、npm test、TS build、Worker型検査、Chromium/WebKit、matrix audit、Worker公開後オンライン検証を持つ。最終PagesはAPI URLを渡して再ビルドしている。
- Vite base、HTML、manifest、PWA生成は本番パス固定。登録はBASE_URL由来。
- Worker名heibon-mahjong-online、ROOMS / RATE_LIMITERは同Worker内のSQLite DO。Originは認証境界ではない。
- ブラウザ永続化はrulesのlocalStorage、diagnosticsのlocalStorage（不可時sessionStorage）、参加情報のsessionStorage。IndexedDB/Cookieは使用なし。Cache StorageはSWだけ。対局自体はメモリ上、オンライン状態はDO。

## 決定

1. mainは既存URL、developは`/heibon-mahjong/dev/`。itch modeは独立のまま。
2. 本番storageキーを維持して移行コピーを不要にし、developは専用接頭辞を使う。診断の旧キーfallbackも分離する。
3. 開発SWキャッシュは旧本番SWの削除接頭辞`heibon-mahjong-shell-`の外に置く。本番SWはdev配下のfetchと更新対象clientを除外する。dev登録がactiveになる前の親controllerを更新通知の根拠にしない。旧本番SWのclients.claimによる一時的な親制御はブラウザ仕様上完全には防げないため、devのオフライン準備は専用controller取得後に確認する。既存本番SWの更新を先に公開し、実機確認後にdevを公開する。
4. 開発Workerは別config・別名・独立DO・別GitHub Environmentと別Cloudflareアカウントのtokenを必須とする。Cloudflareの一般的なWorkers編集tokenはアカウント全体へ権限を持つため、別名だけでは本番変更権限を隔離できない。GitHubのproduction secretsはmain限定Environmentへ移し、repository secretsから除去するまで「権限分離完了」としない。
5. 検証済み成果物の合成は専用の保存ブランチ`pages-verified`に完全な公開snapshotとSHA/hash台帳を保存する方式。Git履歴で無期限保持（手動削除禁止、通常artifactは90日）。公開直列化に加え、公開前にpending journalを保存し、成功後に確定。途中失敗・状態不明時はpendingを残して次回を停止。復旧時はPages成功記録とsnapshot digestを照合する。保存先取得失敗を空snapshot扱いしない。初回は検証済み本番が必須、dev未準備なら省略可能。devから初回bootstrap不可。
6. publisherは検証成果物をそのままコピーし再ビルドしない。更新対象branch SHAは公開直前にも再確認し、保持側は公開済みSHAを使う（未検証最新branchを再ビルドしない）。古い再実行は拒否する。同時pushは共通concurrencyで直列化し、最新でない候補を拒否する。
7. 本番ゲートを満たす最終ビルドそのものへのBrowser UI検証が必要。現行main公開を勝手に切り替えない。新しい公開経路は外部設定と初回成果物の確認まで無効。mainへの昇格前にdevelopのCIを確認する。

## 公開順序

本番SW移行版の検証・公開 → 本番PWA既存ユーザー更新確認 → 開発アカウント/Worker設定 → 開発最終ビルド検証 → 本番検証成果物bootstrap → 合成publisherのdry runと障害試験 → legacy publisher停止と新経路の切替 → 各公開SHA確認 → iPhone両環境実機確認。

公開ゲートを満たさない段階ではmain / 本番Worker / Pagesを変更しない。未実施の公開や実機検証は成功としない。
