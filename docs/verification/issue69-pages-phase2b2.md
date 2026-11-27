# Issue #69 Phase 2-B-2: Pages 専用候補

この文書は候補の挙動と移行前提を示す。実公開・現行台帳の移行・復旧は未実施。現行運用の規則を置き換えない。

## Pages 専用経路

`publication_target=pages` は既存の CI・Environment `github-pages` 承認と共有 `pages-publication` 排他の下で動く。Worker 用 Environment・Secrets・Wrangler・Worker Deployment 記録に依存しない。対象環境の固定 Worker URL を確認して既存オンライン試験を行う。Worker の独立記録が未初期化でも参照しない。本番 `production_validation=reuse` は #62 の成功 CI と ZIP digest を再検証する。再利用しない run も、同一 run の upload 出力 ID・digest と REST metadata・ダウンロードした ZIP を照合してから安全に展開する。開発の対象は Issue ref とし、同一 SHA の成功済み push CI と現在の main を確認する。

確定済み `pages-verified` の対象環境 SHA と候補の Git ツリーを直接比較し、他方の Worker 差分は不明のままとする。実配信と確定済み site の全ファイルを比較し、stage は各環境の snapshot digest、候補の封印・環境・URL を検証して対象だけを置換する。stage の前の commit が確定済み親であり、stage commit の `site` は pending 候補である。pending を push して初めて Pages deployment を要求する。成功した deploy step の後、親と stage の snapshot・保持側バイト、合成 digest と実配信全ファイルを検証し、その後だけ finalize する。最終 audit は確定済み両 snapshot と Pages deployment・配信を確認し、Worker と Pages の SHA 一致を要求しない。

- stage の push 前の失敗は実台帳が変わらない。push の結果自体が不明な場合は remote ref を確認する。
- stage push 後、deploy step 前であることが元 run・attempt と Pages の証跡から確定できた場合は、親 commit と現在の実配信を全ファイル照合する。復旧の承認後、HEAD がその stage commit のままであることと、stage の差分が `state.json`・`site/` に限られることを確認し、その commit を revert する。revert 結果の `state.json` と `site/` が親と完全一致することを確認し、fast-forward で保存する。結果不明または後続 commit がある場合は停止する。後続の Pages 専用再開 workflow は Phase 2-B-3 で実装する。
- deploy 要求後の失敗・キャンセル・結果不明では pending を保持して停止する。配信内容だけから成功と推測せず、GitHub Pages の deployment と Actions の実行証跡を確認する。
- deploy 成功後に配信確認や finalize が失敗した場合は再公開しない。段階 snapshot と実配信を照合して記録だけを復旧する。後述の検査が失敗する、または結果を確定できない場合は停止する。
- finalize push の結果が不明な場合は `pages-verified` の実 HEAD と commit 内容を照合する。より新しい HEAD があれば古い候補を適用しない。

## 別 run での読取専用再照合

公開を停止し共有ロックを確保してから、`pages-verified` の pending commit とその唯一の親を、それぞれ履歴を持つ別 checkout に固定する。元の `deploy-pages` step のログから Pages deployment ID を取得する。次のコマンドは検査のみで、finalize や deploy を行わない。

```sh
RECOVERY_SNAPSHOT=<pending-commit> RECOVERY_PARENT=<parent-commit> \\
PAGES_DEPLOYMENT_ID=<pages-deployment-id> GH_TOKEN=<read-token> \\
GITHUB_REPOSITORY=ak-sekine/heibon-mahjong \\
node .github/scripts/pages-independent-recovery.mjs <pending-checkout> <parent-checkout>
```

この検査は HEAD・親、元 run/attempt・Pages deploy step の成功、GitHub Pages API の `succeed`、同じ run に対応する GitHub Environment deployment、元 CI の各必須 job、snapshot と保持側の完全性、現在の全配信ファイルを照合する。元と別の run から実行できるが、証跡の run/attempt は元の値を照合する。成功後も、記録変更は別途承認された復旧操作とし、再度 ref と排他を確認して `finalize` し、fast-forward のみで反映する。deploy step の成功を確証できない場合、この検査は停止する。ログ・Pages API・実配信を個別に再照合し、確認できない状態を自動確定しない。

## 切替と未確認事項

新旧 workflow ref 間の排他を候補 workflow だけで保証したとは扱わない。切替時は公開停止、旧 main・旧 ref の経路無効化、既存 pending の解消、実配信と両 snapshot の照合、Worker・Pages 基準の確認を実施する。Phase 2-B-1 の独立 Worker 記録がある環境では旧一体経路は停止したままとする。実サービスの Pages write・OIDC・Environment・contents write・Actions read 権限と実配信は未確認。旧 workflow ref からの競合、Cloudflare/GitHub 外部操作、Artifact の別 run への再アップロードと上限付き検索の接続は後続 Phase で検証する。
