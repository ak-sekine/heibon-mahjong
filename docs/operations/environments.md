# 本番・開発の独立公開運用

本手順はIssue #69の独立公開方式を説明する。移行中は実際に有効なworkflow refと独立基準の初期化状況を確認し、候補コードの存在だけで本番切替済みと扱わない。従来の一体公開と移行の履歴は[Issue #47の切替手順](issue-47-cutover.md)および[検証記録](../verification/issue-47-environments.md)に残す。

| 対象 | 本番 | 開発 |
| --- | --- | --- |
| Pages | https://ak-sekine.github.io/heibon-mahjong/ | https://ak-sekine.github.io/heibon-mahjong/dev/ |
| Worker | heibon-mahjong-online | heibon-mahjong-online-dev |
| Environment | worker-production、github-pages | worker-development、github-pages |

開発URLは公開URLでありアクセス制御ではない。本番と開発はWorker・DO・保存キー・PWAを分離するが、同一Originであることをセキュリティ境界とみなさない。DO namespace、データ、Secretsを維持し、削除や変更は個別承認を要する。

## 承認・対象・通常公開

対象SHAの必須CI、通信契約、Chromium/WebKit、環境分離、local-online、PWA、成果物検証を維持する。本番は最新main refのみ、開発は明示的に承認されたIssue候補refとSHAのみ。main統合と開発公開は別に扱い、明示された公開保留を優先する。Environmentの承認・ブランチ制限、Secrets、権限、共有排他、対象のWorker名・URL・Cloudflare accountを確認する。各公開直前にSHAと基準、競合を再確認する。未解決の結果不明、必要証跡・権限不足、品質ゲート失敗時は該当操作を停止する。

承認済みrefから `Verify isolated environments` を手動実行し `publish=true` と `publication_target` を指定する。`publish=false` は実公開しない。

| target | 動作 |
| --- | --- |
| auto | 環境別Pages・Workerの最終正常公開SHAから候補SHAまでのツリー差分を各々判定 |
| pages | Pagesのみ。Workerを再公開・記録更新しない |
| worker | Workerのみ。Pages予約・公開・確定を行わない |
| both | 両独立経路。成功記録と失敗・復旧を分ける |
| none | 明示的に公開しない。autoの差分なしと区別する |

祖先関係を必要とせず累積差分で判定する。未知ファイル・比較失敗・必要な基準不明は公開不要としない。明示指定では他方の未公開差分を公開済みにせず、その基準を更新しない。autoはPages状態とWorkerのCloudflare稼働versionを含む両基準の読み取りが必要。通常の互換変更ではPagesとWorkerのSHA一致や恒常的なWorker先行は要求しない。通信・保存形式の非互換変更と切り戻しは[通信契約](online-compatibility.md)に従い個別に移行順序を判断する。

## Workerの記録と初回公開

各環境の `heibon-independent-worker-production` / `heibon-independent-worker-development` Deploymentは開始記録、`deployed:<version>`、オンライン検証後の `verified:<version>` を区別する。最新の関連記録と単一・traffic 100%のCloudflare稼働versionが一致して初めて基準SHAにする。古い成功記録へ自動的に戻らない。開始記録保存に失敗したらdeployしない。公開要求後の失敗・キャンセル・記録失敗は結果不明として停止する。`deployed` のオンライン失敗は公開済みであり再公開の根拠としない。

独立記録が存在しない環境の初回のみ、`publication_target=worker`、`worker_first_publication=true`、`expected_current_worker_version=<直前に確認し承認されたUUID>` を明示する。現在versionとtraffic、記録不存在、account・対象・SHA・CI・Environmentを公開前に再照合する。既存記録やAPIエラーは拒否する。過去SHAを推測しない。開始記録後は失敗しても削除して初回を繰り返さず、GitHub Deployment、run/attempt、WranglerとCloudflareの証跡、オンライン結果を確認する。安全な旧Workerに限って切り戻しを個別判断し、不明なら前進修正を検討する。

## Pagesのsnapshot・公開・復旧

`pages-verified` のcurrentと確定済みGit commitを正常snapshotの正本とし、本番・開発の共有サイトを合成する。公開対象側のみ候補成果物に置換し、保持側は最後の正常snapshotを使う。stage後のpendingはPages専用であり、候補をcurrentと誤認しない。Git履歴を保持しforce push・履歴削除を禁止する。公開成功、全配信ファイル検証とauditの後に確定する。Workerの成功記録はPagesの失敗で取り消さない。

公開前失敗が肯定的証跡で確定した場合、[Pages専用再開手順](../verification/issue69-pages-resume.md)に従い元run、CI、Artifact、stage、親、現配信を照合してから `pages_resume=true`、`publication_target=pages`、`resume_snapshot`、`resume_parent` を指定する。旧stageは履歴を残して解除し、元の検証済みArtifactから新runのstageを作る。要求後の不明状態は再公開せず停止し、Pages deployment・元run・stageと実配信を再照合する。公開成功後の確定失敗は `pages-reconcile.yml` で元のdeployment ID、stage、親と実配信を確認し、公開せず記録だけ確定する。競合や古いstage、証跡不足では停止する。旧pendingは新形式と混同せず、旧履歴・旧専用復旧手順を参照して個別に判断する。

Artifactの完全性、保持側snapshot、合成成果物、配信された全ファイルは別々に確認する。特に全ファイルhash照合は配信時の欠損・変質や保持側の混入を検出するため維持し、release.jsonやArtifact検証のみで代替したと扱わない。公開後はPagesの独立auditとWorkerのオンライン検証・記録を対象別に確認する。失敗したauditだけを理由に再公開しない。

## 本番公開時の検証結果再利用（Issue #62）

本番Pagesの `production_validation=reuse` は同一main SHAの成功したpush CI attempt 1、全必須jobとaudit、検証済みArtifact ID・ZIP digest・期限を照合する。取得ZIPと展開後のsnapshotを別々に検証し再ビルドしない。失効・欠損・証跡不足なら停止し、承認範囲内で必要な full 検証を選ぶ。Worker専用経路はPages成果物の取得を前提とせず、必要な全CIを維持する。itch.ioは検証済みZIPの独立手動配布とし、SHA・ZIP digest・配布日・動作確認を記録する。PagesやWorkerとの同時更新・SHA一致は求めない。

## 移行・旧経路

新旧の公開経路を併用せず、移行期間は管理者と合意して旧main・develop・過去refの公開、再実行、外部手動公開を停止する。実行中・待機中・承認待ちrunを確認し、共有Pagesの競合を防ぐ。本番サービスの閲覧・Worker稼働は停止しない。新方式側で旧jobを削除しても過去refの実行を技術的に防ぐとは限らない。各操作直前に公開状態・pending・排他・Environment/権限を再確認し、不足時は停止する。

旧 `deploy.yml` および旧一体型の本番監査・#47/#67復旧workflowは、独立公開後のPages・WorkerのSHA一致を通常要件として使わない。旧履歴や旧pendingを調査する場合だけ、それぞれの前提と影響を確認して利用する。新方式はPages専用auditと `pages-reconcile.yml`、Worker独立Deployment・Cloudflareとオンライン検証を用いる。旧refの停止を運用上確実にしてから、各環境の独立Worker基準を確立し、承認された開発検証、main統合、本番切替へ進む。

## PWA・保存状態とiPhone Safari実機確認

ブラウザは最長一致のService Worker scopeを優先する。開発SWがまだない初回訪問や有効化前は本番の親controllerが付く場合があるため、開発専用controller取得後にオフライン準備完了を確認する。

本番キーは旧値を維持しコピー/削除しない。devは専用キー。manifest id/start_url/scope、script URL、precache、cache名を分離する。本番SWはdev fetchと更新時のclient数判定からdevを除く。本番SWはclients.claimを使わず、初回訪問は有効化後に再読み込みしてからオフラインを確認する。開発SWは旧本番SWが一時的にclaimした場合に開発scopeを再claimする。未更新の本番SWによる親制御を完全に排除できると仮定しない。

PWA更新は対局の区切りで行う。同環境の複数タブは更新をブロックし、他環境タブではブロックしない。全サイトデータ削除を通常の更新手順にしない。本番データを失うため、問題時も環境別キー/cache/registrationだけを確認する。

ユーザーが次を両環境で確認し、日付・iOS/Safari版・起動方法・OK/NGを記録する。manifestだけでホーム画面追加が完全に分離されるとは扱わない。

1. 既存本番PWAを残した状態で更新し、旧ルールと再接続情報が保持されること。
2. Safariで両URLを開き、CPU対局・打牌と各アイコン/表示を確認。
3. 各URLからホーム画面へ追加し、別アイコンとして起動でき、それぞれのURLに留まること。
4. 両版を一度オンラインで起動→完全終了→機内モードでホーム画面から起動しCPU対局。新規インストール直後の本番は再読み込み後にも確認する。
5. 開発のみ更新/本番のみ更新し、反対側の更新通知・cache・オフライン起動・保存設定が変わらないこと。旧本番SWが残る状態からの移行も確認する。
6. 同環境2タブで更新ブロック、反対環境タブだけなら更新可能なこと。
7. 新規テストルームのみ使用し、各Workerで作成→参加→対局→再接続。他環境のtokenで復帰できないこと、作成したルームが反対環境に現れないこと。6文字コードが偶然一致してもWorkerごとに独立した別ルームであり、コードだけでは環境を識別できない。公開済みの他人のルームを変更しない。

未確認が残る間はIssue #47をCloseしない。
