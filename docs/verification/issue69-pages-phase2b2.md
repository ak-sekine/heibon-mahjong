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

### 本番独立公開への切替（2026-11-28）

main `77c6c35cc381ffe6987f4ace8bca8cff0fe1653f`、必須CI [46045430838](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46045430838) 成功を基準に、ユーザーが確認・承認した単一100%の本番Worker version `ad3804cb-fcf9-470a-8581-a443d51bae50` と独立記録なしを初回公開処理で再照合した。ユーザーはROOMS・RATE_LIMITER bindingの存在を確認したが、完全なnamespace ID等は画面で取得していない。旧Pages公開SHAから本候補へのWorker・DO設定・共有通信／ゲームコードの差分はない。

[Worker初回公開 46083763674](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46083763674) は成功。独立Deployment 8121540156 は開始pending、`deployed:01b049b2-0c4a-4055-b5c1-22a870d61d5f`、オンライン検証後 `verified:01b049b2-0c4a-4055-b5c1-22a870d61d5f` を記録した。Pages・itch由来の両Origin間のルーム・対局同期を含む本番オンライン検証が成功した。これは現在のitch.io配布物そのものの実機確認ではない。Worker公開時にPagesはskipされ、pages-verified HEADは変更されなかった。

[Pages専用公開 46084987199](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46084987199) はmain push CI run 46045430838 attempt 1のArtifact 15222420956、ZIP digest `sha256:d7579ac3178a8f8d3941d7487eb99f964d425bdfdbe5b0b667d5505d621c6f11`（期限 2027-02-25 17:54:28 UTC）を再利用し成功、全配信ファイル照合と独立auditに成功した。確定commit `5fff1df032e672948187bb610f54691b3086c70f`、本番snapshotDigest `ff3de58d7e3ea1eb206fb85560ec11e5e332b7f00b726843445077504d6718cb`、pending null。開発snapshot SHA `da1962ce27c500d9e01b998df2f0828794a7c1cd`、digest `ee6ddf1402f38dc6eb52f591a42c36f5a9effe06067825222cfd5ab3d7f710bf` と `site/dev` は保持された。共有 `environments.json` は本番更新に伴い変更。Pages公開でWorker jobはskipされ、本番独立Deploymentは1件のまま、開発Deployment 8111581288は `verified:132dd0c6-57e4-444b-9515-0bda6392ca2f` を保持した。開発Worker稼働versionの別途直接再照合は未実施。

本番Pages・PWAおよび現在のitch.io Draft実配布物について、ユーザー実機での起動、CPU対局、Pages↔itch.ioの卓作成・参加・基本操作・同期・再接続を次段階で確認する。itch.io ZIPの元SHA・digestは不明で、既存配布物との実機互換性を今回のOriginテスト成功だけで保証しない。Issue #69はOpenのまま。

## Issue #69 最終評価（2026-11-28）

### ユーザー本人による実機確認

2026-11-28、本番Pages・PWAおよび現在のitch.io Draftについて、ユーザーが次の11項目をすべてOKと報告した。NG 0、報告対象内の未確認0。

1. 本番Pagesの正常起動。
2. 本番PagesのCPU対局・基本操作。
3. 本番PWAの更新・再起動。
4. 本番PWAのCPU対局・基本操作。
5. itch.io Draftの正常起動。
6. itch.io DraftのCPU対局・基本操作。
7. Pagesで卓を作成しitch.ioから参加。
8. itch.ioで卓を作成しPagesから参加。
9. Pages・itch.io間の操作・状態同期。
10. Pages・itch.io間の切断後の再接続。
11. 本番・開発の設定・保存情報の分離。

先に記録した開発環境のiPhone Safari実機8項目と合わせ、ユーザー報告はOK 19、NG 0、報告対象内の未確認0。現在のDraftを使った検証でありZIP再アップロードは行っていない。ユーザーによる実機報告と、以下のActions自動検証は別の証跡である。

### 自動検証・公開証跡

- 本番main公開SHA `77c6c35cc381ffe6987f4ace8bca8cff0fe1653f`：同一SHAの[main必須CI・audit 46045430838](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46045430838)。公開後の記録のみを含む開始時mainは `8716a6a212984e5dd678d22b093ce0cc643a1e24`。
- 開発Worker：[46010218955](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46010218955)、独立Deployment `8111581288`、verified version `132dd0c6-57e4-444b-9515-0bda6392ca2f`。開発Pages：[46019125645](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46019125645)、公開SHA `da1962ce27c500d9e01b998df2f0828794a7c1cd`、snapshotDigest `ee6ddf1402f38dc6eb52f591a42c36f5a9effe06067825222cfd5ab3d7f710bf`。開発[auto 46029408933](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46029408933) はnoneで公開jobをskipした。
- 本番Worker：[46083763674](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46083763674)、独立Deployment `8121540156`、verified version `01b049b2-0c4a-4055-b5c1-22a870d61d5f`。本番Pages：[46084987199](https://github.com/ak-sekine/heibon-mahjong/actions/runs/46084987199)、CI由来Artifact `15222420956`、ZIP digest `sha256:d7579ac3178a8f8d3941d7487eb99f964d425bdfdbe5b0b667d5505d621c6f11`、確定commit `5fff1df032e672948187bb610f54691b3086c70f`、snapshotDigest `ff3de58d7e3ea1eb206fb85560ec11e5e332b7f00b726843445077504d6718cb`。実配信全ファイル照合と独立audit成功。Pages公開後も開発snapshotとWorker記録は保持された。
- [復旧の検証記録](issue69-pages-resume.md)は固定Action wrapperの非公開Actionsと障害時の隔離テストを示す。失敗を本番へ注入して実復旧した結果ではない。[運用規則](../operations/environments.md)・[通信契約](../operations/online-compatibility.md)とAGENTS.mdはmainに反映済み。

### Issue作業範囲８件の評価

1. **達成：現行調査・安全要件の棚卸し。** [段階調査](issue69-phase2b.md)、[Worker記録](issue69-worker-phase2b1.md)、[Pages記録](issue69-pages-resume.md)と運用文書に依存・処理・安全要件を記録。段階記録の未実装表記は当時の履歴であり、後続の本最終記録を参照する。
2. **達成：通信契約・互換性方針。** #70の[v1契約](../operations/online-compatibility.md)、固定テスト、保存・再接続と今回の実機19項目を根拠とする。全過去版の無期限互換や将来の非互換保存変更を保証しない。
3. **達成：独立対象判定。** `publication-plan.mjs`・`tests/publication-plan.test.mjs`とworkflowのテストでUI、Worker、共有、文書、未知・累積差分を検証。実環境の各専用公開とauto noneは上記runで確認。非互換変更は順序を個別判断する。
4. **達成：Pages保持・合成・再照合設計。** currentとPages固有pending、snapshot digestと不変Git履歴、共有排他、証跡に基づく停止・復旧を[手順](issue69-pages-resume.md)に記録。異常系は隔離検証であり、実事故の完全自動復旧を保証しない。
5. **達成：Artifact検索・限定復旧。** 名前・ID・REST digest・期限・上限付き再検索は既存テストと非公開Actions [45948557979](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45948557979)、[45948683288](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45948683288)で確認。公開前・結果不明・記録失敗を区別し、証拠不足時は停止する。
6. **達成：itch.io独立手動配布。** ZIPのSHA・digest・配布日・確認結果の記録方法を運用文書に整理し、現在のDraftはユーザー実機で確認。既存ZIPの元SHA・digest・配布日は不明。
7. **達成：通常公開の品質・hash評価。** Artifact、保持snapshot、合成物、実配信の各保証を区別し、全配信hash照合を維持。オンライン検証失敗とdeploy成功の記録を分ける。
8. **達成：移行・復旧・文書。** 履歴を保持し、pending・実配信照合を前提に開発、本番の順で移行。現行手順は[環境運用](../operations/environments.md)とAGENTS.mdに反映し、成果と限定事項を本記録に残した。

### Issue受入条件８件の評価

1. **達成：調査・設計・移行。** 上記作業範囲1・2・8と段階記録に根拠。未確認の全旧版互換は保証範囲外。
2. **達成：一体予約の廃止。** Worker独立DeploymentとPages専用pending/snapshotに分離。Pages固有pendingは共有サイト保護のため維持し、worker-onlyは依存しない。
3. **達成：対象別経路。** 分類・workflowの隔離テスト、開発・本番それぞれのworker-only/pages-only公開、開発auto noneで確認。both・未知・非祖先は隔離テストであり、双方変更の障害を本番へ注入していない。
4. **達成：相互非干渉・復旧。** 専用公開の実配信audit、保持側snapshot・開発 `site/dev` 非変更を確認。失敗候補・競合・キャンセル・結果不明の保護は隔離テストで確認。
5. **達成：Artifact・障害時の限定復旧。** 検索失敗・不一致・期限・タイムアウト等の隔離テストと実Actions wrapper検証を実施。公開前失敗の再開・成功後の記録復旧は隔離検証で、実環境への障害注入はしていない。証跡不足時は安全停止する。
6. **達成：通信・実機。** #70の固定契約・保存復元テスト、両Originの本番オンライン自動検証に加え、現在配布中のPages・Draft・PWAについてユーザー報告19項目OK。全旧PWAの無期限互換は保証しない。
7. **達成：CI・品質。** main `77c6c35...` の必須CI/audit、実公開run、Artifact完全性・全配信hashを確認。Environment承認・Secrets・DO保護を維持。DO bindingの完全なnamespace IDの直接取得は未実施である。
8. **達成：運用・比較・段階検証。** 候補CI→main CI→承認済み開発・本番公開と本比較を記録。旧refからの運用上の公開停止を継続する。将来の権限変更や非互換移行は別判断。

### 旧方式と新方式の比較

| 項目 | 旧一体方式 | 独立方式・証拠の範囲 |
| --- | --- | --- |
| 通常 | Worker→online→Pages→確定→auditの一体工程 | 対象サービスごとに公開・検証・確定。bothは独立記録 |
| Pagesのみ | Worker公開を含む | Worker skip。開発46019125645、本番46084987199で実確認 |
| Workerのみ | Pages予約・合成・公開・確定を伴う | Pages skip。開発46010218955、本番46083763674で実確認 |
| 文書・テストのみ | 一体方式の公開判定に依存 | 累積製品差分なしをauto none。開発46029408933で実確認 |
| CI・Artifact | 検証済み成果物再利用あり、部分失敗後の一体復旧が課題 | 本番Pages 46084987199で46045430838のArtifactを再利用。Worker・autoのfull検証は維持 |
| Pages要求前の失敗 | 一体予約の調査・復旧と再検証 | 証拠に基づくstage解消、新stageと元Artifact再利用。Worker再公開不要を隔離テストで確認 |
| Pages成功後の記録失敗 | 一体予約の証跡照合・確定 | Pagesのみ別runで証跡を照合して記録を確定、再公開しない。隔離テストで確認 |
| 保持側 | 共有サイト合成・全hash照合 | 正常snapshotから合成・全hash照合を維持。実公開で両方向の保持とauditを確認 |

参考runの開始〜終了（GitHubのcreatedAt/updatedAt）は旧#67失敗 `45710701975` が3分34秒、本番Worker `46083763674` が12分47秒、本番Pages reuse `46084987199` が2分32秒、開発Pages full `46019125645` が12分40秒。旧runは失敗、本番Pagesは既存CIを再利用、開発Pagesはfull検証という異なる条件で、同一処理の比較や時間削減率を意味しない。復旧操作回数・所要時間の実測比較はない。

### 残る未確認事項とClose評価

- 以前のWebKit click未発生の根本原因は未確定。限定診断で非再現、後続必須CIとユーザーの結果再表示確認は成功した。発生原因を解明済みとしない。
- 既存itch.io Draftの元ZIPのSHA・digest・配布日は不明。現在配布物のユーザー実機検証は成功し、今後の配布時は情報を記録する。過去の来歴を推測しない。
- DO bindingの完全namespace IDは今回直接取得していない。ユーザーは両bindingの存在を確認し、公開候補と従来のWorker/DO設定に差分はなく、既存保存・オンラインテストは成功した。直接ID照合済みとはしない。
- 本番公開後の開発Worker versionのCloudflare直接再照合は未実施。開発独立Deploymentのverified記録と非公開jobのskipは確認したが、現在の実稼働versionを別途確認済みとはしない。

これらは本Issueの合意済み保証範囲と報告対象の実機確認を超える未確認事項で、現状の証跡上はCloseを妨げる必須作業とは判断しない。新たな非互換・実機異常・公開状態の不一致が判明した場合は別途調査する。最終文書commitとその文書CIがmainで成功した後にClose可能と評価する。Issue状態の変更は行わず、ChatGPTへ評価を引き継ぐ。
