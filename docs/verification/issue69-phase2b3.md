# Issue #69 Phase 2-B-3: 統合候補と未完了項目

この記録は前回候補時点の履歴である。旧 job の削除と Pages 専用再開の現在の候補仕様・検証・制約は [追加記録](issue69-pages-resume.md) を参照する。

この文書は候補ブランチの状態を説明する。main の現行運用は変わっておらず、実公開・実台帳移行・Worker 基準初期化は行っていない。

## 公開対象と品質ゲート

`publication_target` は `auto`（既定）、`pages`、`worker`、`both`、`none`。`publish=false` は公開を実行しない。`auto` は確定済み Pages snapshot と GitHub Deployment／Cloudflare 稼働 version が一致する Worker 記録のそれぞれを候補ツリーと比較し、不明な記録・未解決 Pages pending・差分取得失敗では停止する。`pages` と `worker` は他方の基準を要求しない。`both` は独立した２ job を起動し、一方の成功記録を他方の失敗で取り消さない。`none` の明示と `auto` の差分なしを区別する。`auto` は Worker 状態の読み取りに Worker Environment と Cloudflare token が必要で、権限不足なら停止する。安全条件が成立する場合の `pages` 明示指定は Worker token を要求しない。

現行候補では `auto`・Worker 専用は同一 SHA の full CI を実施する。Pages 専用・双方の本番 reuse は #62 の push CI と Artifact を照合する。Worker 専用で Pages Artifact を取得せず成功済み CI だけを再利用する経路は未実装で、品質ゲートを省略しない。旧一体 job は実行条件を無効化し、旧 deploy.yml は公開直前に失敗させる。旧一体 job の定義・関連テストはまだ残っており、物理削除は未完了。過去 ref の workflow はこの候補だけでは無効化できない。

Pages upload 後、固定した `@actions/artifact` 2.1.3 の同じ runtime 一覧を使い、名前・ID・一意性、別 REST metadata の digest・期限・run/SHA を確認する。検索・一時的 metadata 障害は上限付きで再試行する。ZIP digest と tar の全ファイルを stage と照合し、相違や期限切れで停止する。preflight が成功しても deploy-pages の再検索に失敗する可能性は残る。

成功した Pages の記録復旧は `pages-reconcile.yml` の承認付き job が行う。元の job ID、run/attempt、deploy-pages が記録した deployment ID と SHA、Pages API の成功、source CI、保持側・stage・実配信を照合してから、現在の stage HEAD に対して finalize のみを実行する。別の成功 deployment ID や曖昧なログは拒否する。ログ・API・実配信が取得できなければ停止する。**公開要求前の失敗から、元の検証済み Artifact を再取得・再アップロードして Pages だけを再公開する workflow は未実装。** 既存の手動調査手順で状態を確認し、Phase 2-B-3 完了とは扱わない。

itch.io は手動配布のまま。full CI は本番 endpoint の ZIP・SHA-256・source SHA を Artifact として保存する。ブラウザー用 mock endpoint の itch 検証と、配布後の実機・通信確認を区別する。配布日と結果は手動で記録する。

## 実環境切替の前提（未実施）

1. 本番・開発の旧 main／旧 workflow ref からの公開と手動公開を停止し、共有 Pages の排他と変更中の run がないことを確認する。開発 Pages 更新も共有サイトを合成するため、本番側への同時公開停止と本番 snapshot の保持・実配信確認が必要。Worker の本番停止やデータ変更は不要。
2. `pages-verified` の pending と実配信・両 snapshot を全ファイル照合し、未解決 pending は別途承認の既存手順で解消する。履歴は削除しない。
3. 環境別 Worker の公開 SHA、GH run/attempt、Cloudflare account・Worker・稼働 version・オンライン結果を照合し、独立 Deployment 基準を承認後に初期化する。
4. GH Actions／contents／Deployments／Pages／OIDC、Environment 保護、Cloudflare deploy・deployment read の権限を確認する。`github-pages` の `deployment: false` と既存保護の両立も実環境では未確認。
5. 候補の限定検証を完了後、新旧経路の切替と開発公開を個別承認し、両 Pages の hash と Worker のオンライン検証を行う。その後、main 統合・本番切替を別途承認する。失敗・結果不明なら当該サービスを停止し、標準記録と実配信を再照合する。

AGENTS.md の旧 Worker→Pages 順序・予約・監査・復旧規則は、候補が完成し実運用へ切り替わる際に上記の選択・独立記録・手動復旧・非互換変更の例外へ更新する。今は有効な旧運用として保持する。旧方式は Worker→online→Pages→finalize→audit の一体工程であり、候補は Pages／Worker をそれぞれ選択し、Pages 記録だけの復旧では再デプロイしない。公開要求前失敗の Pages 専用再開が未完成のため、復旧操作数の削減や時間短縮を完了済みと報告しない。
