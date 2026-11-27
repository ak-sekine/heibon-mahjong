# Issue #69 Phase 2-B-2: Pages 専用候補

## Phase 3-B 開発公開とauto停止（2026-11-27）

公開した候補SHAは `da1962ce27c500d9e01b998df2f0828794a7c1cd`。開発Worker初回公開 [run 46010218955](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46010218955) はオンライン検証まで成功。公開前に承認・照合したversionは `2f35e7e9-8e31-4cb8-9032-d20299e7e7a3`、公開後は `132dd0c6-57e4-444b-9515-0bda6392ca2f`。独立Deployment `8111581288` は候補SHA、`deployed:` と `verified:` のsuccessを記録した。Worker公開直後のPages台帳HEADは旧 `3c96a4ef4606d4890dd6c34bd0d0b59ece0b642c` のまま。

開発Pages専用公開 [run 46019125645](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46019125645) はCI、Pages公開、実配信照合、確定、独立auditが成功し、Worker公開jobはskip。確定commit `1fe28edd010856a79e9f300732d13ce7735181e4` の開発SHAは候補SHA、snapshotDigestは `ee6ddf1402f38dc6eb52f591a42c36f5a9effe06067825222cfd5ab3d7f710bf`、pendingはnull。検証済みArtifact IDは `15207002494`、ZIP digestは `sha256:0fd172832c9e65bfe01332c36169292bf3793a3fbd4c66827d474221825790f9`。本番Pagesの製品ファイルとrelease.jsonは旧確定commitとの差分なし。共有environments.jsonは開発更新に伴い変化した。Worker独立記録は同じverified statusのまま、本番Workerの最新GitHub公開記録 `8074552298` も維持されていた。

両基準SHAの一致とpendingなしを確認して実行したauto [run 46021197973](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46021197973) は必須CIで停止した。WebKit group 2の `tests/browser-round-end-ui.py` は320×480で対局結果ダイアログを閉じた後に再表示されなかったためassertion failureとなった。原因は未確定。publish jobはskipされ、autoの差分判定・Cloudflare現version再照合は未実行。Worker独立記録とPages台帳HEADは変更されていない。再実行や追加実装は行っていない。

CI内のChromium/WebKit・環境分離・local-online、Pages公開時の既存オンライン検証は成功したが、auto runのWebKit failureを含むため開発環境の全自動確認は完了扱いにしない。公開後のiPhone Safariでは開発Pagesの起動、CPU対局、オンライン卓作成・参加・操作・同期・再接続、PWA更新・再起動と本番との区別をユーザーが確認する。本番Workerの稼働versionは直接確認していない。

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

### WebKit group 2 失敗調査（2026-11-27）

[失敗run 46021197973](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46021197973/job/140581878590) の `browser-round-end-ui.py` は、320×480で対局結果を閉じた後の局結果再表示で失敗した。ログ上は `#show-result` が表示・有効で、pointerdown / mousedown / pointerup / mouseup は同じボタンに届いたが、clickは記録されず、再表示処理も呼ばれなかった。対象DOMの置換やJavaScriptエラーは記録されていない。押下前のフォーカスは `show-match-result`、押下後は `show-result` だった。

テストはダイアログ表示中にviewportを320×320へ変更し、閉じる・キーボードで再表示・再度閉じる操作の後、320×480へ戻してクリックしている。ダイアログのcloseイベントにはフォーカス復元処理があるが、このサイズでは詳細な時系列トレースが有効でなく、close処理・viewport復元・フォーカスとclick不成立の因果関係は確認できない。Playwright/WebKit固有か実利用でも起こるかも判別できない。同じ公開SHAの [候補CI 46007635096](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46007635096)、[Worker公開 46010218955](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46010218955)、[Pages公開 46019125645](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46019125645) では同じWebKitシナリオが成功しているが、それだけで原因や再現性を確定できない。失敗Artifact 15208572340 の取得先は得られたが、アーカイブ取得はHTTP 403となり、診断JSON・スクリーンショットを個別に確認できなかった。

原因をテスト固有と断定できないため、製品・テストの修正、根拠のない再試行およびauto実行は行わない。次の調査では保存済みArtifactをアクセス可能な方法で確認し、必要なら320×480に限定してclose・focus・viewport・pointer/clickの時系列を観測する。観測結果を基に実UIとテスト操作を区別してから最小修正を判断する。

調査時点のGitHub記録では開発Worker独立Deployment 8111581288 は公開SHA `da1962ce27c500d9e01b998df2f0828794a7c1cd`、最新statusは `success` / `verified:132dd0c6-57e4-444b-9515-0bda6392ca2f`。Pages stateは開発の同SHA、本番 `8b66b925fad1eab2a773a512e0e36b9e87eb3b01`、pending null。Cloudflare稼働versionの今回の直接再確認や実配信の全ファイル再照合は行っていない。autoは候補SHA変更後の実行承認と、必須CI・直前の公開状態確認を必要とする。

### 320×480 WebKit 限定再現診断（2026-11-27）

既存ResultReopenTraceをWebKit 320×480にも適用し、既存の1280×800での診断は維持した。操作・assertionは変更せず、主要mark・window captureイベント・上限・停止理由・欠落件数をログに要約した。候補 `50555c9cff141008d01d6c4d9d5cdc1e3c71d561` の [限定診断 46025650946](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46025650946) は1回実行し成功、元の失敗は再現しなかった。追加診断は行っていない。

320×480の記録では、320×320で最終順位を閉じた後にフォーカスが再表示ボタンへ戻り、viewportを320×480へ復元すると局結果ボタンは同じDOM tokenのまま `(11, 240.59375, 146, 44)` から `(11, 400.59375, 146, 44)` に移動した。クリック直前のhit testは当該ボタンで、pointerdown、mousedown、pointerup、mouseup、clickが到達し、window capture時点ではdefaultPreventedはいずれもfalseだった。pointercancel、lostpointercaptureは記録されず、結果ダイアログは開いてフォーカスが卓表示ボタンへ移った。既存assertionがResultDialog.openの1回呼び出しを確認した。traceの停止理由はtest-finished、480件上限でdropped 0、主要markはすべて存在した。window capture時点のdefaultPreventedは後続の処理による変更を証明しない。

成功した1回の時系列は元の失敗を説明せず、製品不具合とテスト固有問題のいずれとも特定できない。既存の失敗ArtifactのHTTP 403を繰り返さず、成功するまでの再試行も行わなかった。自動CIの結果は診断コミットに紐付く実行を参照する。auto公開は実行していない。

### Phase 3-B auto再検証（2026-11-27）

承認済み候補 `0d6cb4715203bcf76ee4ca72388d4381fdcf943f` に対する [auto run 46029408933](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46029408933) は成功した。手動入力は `publish=true`、`publication_target=auto`、`worker_first_publication=false`、期待version空欄、`pages_resume=false`、`production_validation=full`。同runのverify、local-online、Chromium/WebKit両group、環境分離とauditは成功した。plan-autoは正常snapshot・全実配信ファイルと独立Worker記録・Cloudflare稼働versionを既存処理で照合し成功、summaryは `classification=none`、Pages・Workerの公開jobはskip、no-publicationは成功した。

前後ともpages-verified HEADは `1fe28edd010856a79e9f300732d13ce7735181e4`、pending null、本番Pages SHA `8b66b925fad1eab2a773a512e0e36b9e87eb3b01`、開発Pages SHA `da1962ce27c500d9e01b998df2f0828794a7c1cd`、開発snapshotDigest `ee6ddf1402f38dc6eb52f591a42c36f5a9effe06067825222cfd5ab3d7f710bf`。開発Workerの独立Deployment 8111581288は同公開SHA、最新status 23312614759は `success` / `verified:132dd0c6-57e4-444b-9515-0bda6392ca2f` のままだった。今回のrunでWorker・Pagesの公開処理は実行されていない。Cloudflare稼働versionの照合はplan-autoの成功に基づき、run後の別途直接照合は行っていない。

開発Worker初回公開・オンライン検証は[run 46010218955](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46010218955)、開発Pages専用公開・確定・auditは[run 46019125645](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46019125645)で成功済み。今回のautoと合わせPhase 3-Bの自動検証を完了とする。過去のWebKit失敗の原因は未確定。iPhone Safari実機での開発Pages起動、CPU対局、オンライン卓作成・参加・同期・再接続、PWA起動と環境分離は未確認であり、自動検証と区別する。本番Workerの現在versionを直接確認していない。main統合・本番切替は未実施。

### 開発環境のiPhone Safari実機確認（2026-11-28）

ユーザー本人による報告：開発Pages正常起動、CPU対局の開始・基本操作、局結果・最終順位を閉じた後の再表示、オンライン卓の作成・参加、操作・状態同期、切断後の再接続、開発PWAの更新・再起動、本番・開発の設定・保存情報の分離はいずれもOK。OK 8件、NG 0件、報告対象内の未確認0件。過去のWebKit失敗は限定診断で非再現、後続必須CI成功、今回の実機確認OKだが、根本原因は未確定。
