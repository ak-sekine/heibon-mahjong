# Issue #69: Pages 専用再開の候補

これは候補ブランチの仕様であり、main の現行運用ではない。実公開、実台帳の移行、Worker 基準の初期化は未実施である。

通常は `environments.yml` の `publish=true`、`publication_target=auto` を使う。`pages`、`worker`、`both`、`none` は明示指定で、`publish=false` は公開しない。Pages と Worker は別々に記録する。Worker と auto は現状 full CI を行う。本番 Pages の通常 reuse は、同一 SHA の成功した push CI と封印済み Artifact を #62 の条件で照合する。itch.io は検証済み ZIP を手動配布し、SHA・digest・配布日・確認結果を記録する。

## 要求前失敗からの Pages 再開

承認された `environments.yml` の dispatch で、元のソース ref、`publish=true`、`publication_target=pages`、`pages_resume=true`、`resume_snapshot` に未確定 stage commit、`resume_parent` にその親 commit を指定する。本番 ref は最新 main、開発 ref は承認済み Issue 候補である必要がある。Environment 承認と共有排他は引き続き必要。Worker の deploy と記録更新は実行しない。

候補は現在の台帳 HEAD、親、保留中の環境・SHA・元公開 run/attempt、元 run の Pages job と最後の github-pages Deployment を照合する。deploy-pages が未実行だったことを完了済みの先行失敗と skip で示すか、固定された deploy-pages v4 実装の Artifact 検索で要求前に停止したことを該当ログとスタックで示す。実行失敗、deployment ID 不在、旧版の配信だけでは未公開と判断しない。ログ欠損・キャンセル・結果不明・他の公開 run・証跡矛盾は停止する。stage の親が確定 snapshot で、現在の配信全ファイルが親と一致することも確認する。

新しい stage は元 CI と Artifact の証跡（種類、環境、SHA、run/attempt、Artifact ID・名前・digest・期限）を保存する。元の必須 job、ZIP digest、封印済み候補の環境・SHA・Worker URL・snapshot digest を照合する。本番 push reuse の条件は緩和しない。証跡のない過去の stage、期限切れ・消失・矛盾する Artifact は自動再開できない。独立した調査と既存の承認済み復旧を使用し、再利用できなければ通常の検証済み公開経路を使う。

条件が成立した場合、旧 stage を履歴を残して revert し、親と全ファイルが一致することを確認してから push する。元 Artifact を再取得・検証・再アップロードし、新しい run/attempt で新 stage を作る。通常の Pages 公開、オンライン検証、全配信ファイル照合、確定、audit を再利用する。元 CI と新しい公開 run は別々に記録する。revert 後・新 stage 前に中断すると親の確定状態が残り、旧 stage は履歴で保持される。この場合は旧 stage が HEAD ではないため同じ再開操作は拒否され、通常の検証済み経路に戻す必要がある。

要求後に結果が不明なら再公開せず停止し、GitHub Pages deployment、実配信、stage と保持側を照合する。実公開成功後に確定が失敗した場合は `pages-reconcile.yml` で元 CI と新公開 run、実際の deployment ID、stage・保持側・実配信を照合し、再公開せず記録のみ確定する。証跡が不足すれば停止を維持する。

## 検証と切替

非公開 Actions run [45948557979](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45948557979) は実際の固定依存 wrapper で runtime Artifact 一覧・名前・ID・REST metadata・ZIP/tar と stage の照合に成功した。[45948683288](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45948683288) は前者の Artifact を別 run から digest 照合して取得・再アップロードし、同 wrapper を通した。公開要求は行っていない。上限付き検索、重複・期限・不一致・タイムアウトは隔離テストで扱う。旧一体 job の定義は候補から削除し、Pages が使う予約処理と過去の pending 調査・復旧処理は残す。旧 ref そのものは使用不能になっていない。

実環境切替は別承認とし、次の順に実施する。

1. 旧 main・旧 workflow ref・手動公開を停止し、稼働 run がないことと共有 Pages の排他を確認する。開発 Pages の合成中も本番 Pages 公開の停止と本番 snapshot の保護が必要である。本番 Worker の停止・データ変更は不要。
2. `pages-verified` の pending を確認し、必要なら別承認で解消する。両環境の正常 snapshot と実配信を全ファイル照合し、履歴を保持する。
3. 環境別 Worker の公開 SHA、GitHub run/attempt、Cloudflare アカウント・Worker・稼働 version・オンライン状態を照合し、承認後に独立 Deployment 基準を初期化する。
4. GitHub Actions・contents・Deployments・Pages・OIDC と Environment 保護、Cloudflare deploy・deployment read を確認する。`github-pages` の `deployment: false` と実設定の両立を含め未確認である。
5. 新旧経路の切替と開発公開を個別承認し、共有 Pages 両環境の hash、Worker とオンラインを検証する。その後、main 統合・本番切替を別途承認する。異常・不明時は当該サービスを停止し証跡を再照合する。

切替時は AGENTS.md と運用文書の旧 Worker 先行・一体予約・監査・復旧手順を、対象選択、サービス別記録、Pages の保留と再照合、非互換変更時の例外判断に更新する。現時点では旧 main の規則が有効である。

旧方式の通常公開は Worker、オンライン、Pages、確定、audit の一体工程で、Pages 要求前失敗後も旧手順の調査と再検証が必要だった。候補はサービス別に対象を選び、条件が揃った Pages 要求前失敗は旧 stage の解消と新 stage により Worker 再公開・全 CI 再実行を避ける。成功後の記録失敗は再公開せず確定する。実環境での所要時間や操作回数の削減率は未測定である。
