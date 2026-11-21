# Issue #47 本番ライブ確認記録（2026-11-13）

## 結果

Phase 2開始前の読み取り専用ライブ確認は成功しました。GitHub-hosted runnerから本番WorkerとGitHub PagesへHTTPSで到達し、Worker health、公開SHA、Worker/Pages deployment、Pages公開ファイルのSHA-256を照合しました。

- ライブ確認workflow: [run 43409062362](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43409062362)、develop `a61dd0cdca1d9fb389642e4cb9aaedff4b1f3d2f`、completed/success。
- develop CI: [run 43409062345](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43409062345)、`a61dd0c`、completed/success。verify、local-online、Chromium/WebKit環境分離、Browser UI両engine、matrix auditがすべてsuccess。Worker production/development、online、publishはskip。文書commit `9ef84cf`でもverify/local-online/環境分離はsuccessし、Browser UIは別runで継続中のため、runを区別して記録する。
- Issue #47はOpenのまま。Phase 2公開は開始していない。

## 接続とhealth

| 確認 | 結果 |
|---|---|
| Worker HTTPS | 接続成功。`https://heibon-mahjong-online.ak-sekine.workers.dev/health` |
| `Origin` | `https://ak-sekine.github.io` |
| Worker health | HTTP 200、`{"ok":true,"service":"heibon-mahjong-online"}` |
| CORS | `access-control-allow-origin: https://ak-sekine.github.io` |
| Pages HTTPS | `https://ak-sekine.github.io/heibon-mahjong/`と全公開ファイルへのHTTP GET成功 |

接続エラー、HTTPエラー、認証エラーは発生しませんでした。初期診断runは確認スクリプトのCloudflare応答形式／Pages artifact前提の誤りで3回失敗し、成功扱いしていません。最終runはCloudflare APIのページング形式も反映して再実行しました。

## SHAとdeploymentの照合

| 対象 | ID / SHA |
|---|---|
| 確認時点のmain HEAD | `cb457bb0dfe00455adf66d5f8c51284d0d00081f` |
| Pages成功deployment | GitHub deployment `7709565599`、公開元SHA `d50e8a6a5a67e8767de824bb80d2e83751cf474d` |
| Worker成功deployment記録 | GitHub deployment `7709534462`、公開元SHA `d50e8a6a5a67e8767de824bb80d2e83751cf474d` |
| Cloudflare現行Worker deployment | `4f8aa60f-d881-4481-b4ae-ab6dcc3d8646` |
| Cloudflare version | `e4c69d73-a0aa-4d31-b2f5-ff5bfe1630d4` |

PagesとWorkerのGitHub成功deployment SHAは一致します。main HEADは公開元SHAより1 commit先ですが、GitHub compareでは差分はIssue #32の記録文書3ファイルのみでした（アプリ、Worker、公開設定の差分なし）。このため、公開SHAは`d50e8a6…`として追跡し、HEADとの違いを未公開コード差分として扱いません。

Cloudflare API deployment endpointの`result.deployments[0]`からdeployment IDとversion IDを読みました。Token値はログに出していません。workflowの権限はcontents/actions/deployments readのみで、Cloudflare呼び出しはGETです。

## Pagesファイルのhash照合

成功した公開run `43012562746`の標準Actions artifact一覧に、deploy-pagesが使った内部`github-pages` artifactはありませんでした。そこで、公開main SHAから同一依存lock・本番Worker URLでPages成果物を再buildし、実際の公開JS bundleに含まれるbuild SHAとbuild時刻を使って再現しました。再現buildは公開SHA `d50e8a6…`と一致し、下記16ファイルすべてのartifact SHA-256と直接HTTP GETした公開bytesのSHA-256が一致しました。HTML、manifest、Service Worker、manifest/SW/HTMLが参照するファイルを含み、artifact内の全静的ファイルを取得しています。

内部deploy-pages artifact自体との直接比較ではなく、公開SHA・公開bundleのbuild時刻を固定した再現buildとの比較です。この方法とartifact保持上の制約を記録し、元artifactを取得できたかのようには扱いません。

| 公開パス | SHA-256（公開bytes = 再現build） |
|---|---|
| `assets/main-BS7BQ-VH.js` | `700bcfbc9055240368ae4972b628e93f3d6c5b5b387bcc39f1378cd270562970` |
| `assets/main-CaJFw03I.css` | `2a7a79c0788b04dc0844d1ee84e09c16e20a488f75fb4567f6386d30ad5dd6c8` |
| `assets/page-CaK4tI26.js` | `95b55beced52424cb3f3899f0f404702f7f3c47fb7922c0ab39cdd88d5583530` |
| `assets/style-B3aHcN8H.js` | `d6bfacf17b204f2d0b3380fc44981d090bd7b43ddbd86a9cdbff410791dc39ed` |
| `assets/style-Dxl6LO0b.css` | `a4ae0da958ab40c7aebce047a6b07dd7314421ca044b19b75fca780211074fdb` |
| `assets/test-CsEXJM0C.js` | `5321dd844f860ae74fcb8f4b6a2d001c76ccababef316fabd242af709a132024` |
| `call-test.html` | `c5f7e51a9989e4951c12c9bcf2b0b1528f4d50045791f8e628482559511690f0` |
| `icons/icon-180.png` | `9a58f7f37981373eb144bbf5857f0598e1307224d29ce8cc626ec8bdffdafb90` |
| `icons/icon-192.png` | `e93570632d88d79a0899d87620bf9b633a8b92cfd73511d0dcae2e567fed444d` |
| `icons/icon-512.png` | `7a085a12c12882b1e00bf1fca5d1d3d95086b5a7f070648acae930f1b698eb42` |
| `icons/icon-maskable-512.png` | `703c1d5b452996a1671efb5c246acbcd5c2a35d8815c414be49b511bf30b96c9` |
| `index.html` | `b0144174821d46bf2477bea5808d9503ae2d09bae5a9b455fa534e20f42f41cc` |
| `kan-test.html` | `7d31da05736b9cf1f8afdea548d17154f29e0db8844acd5398229104665f610a` |
| `manifest.webmanifest` | `9298c553712a5ebda07fcc8adc7cd08cae88c210a4e8f52d902d022b3a8e401c` |
| `sw.js` | `de678c2124b85963d83d75876d6b09f9545958df373a9ef893cf1a10a26c759c` |
| `test.html` | `4db03993a83e624e06c27cb6d7b818bc789798a974c1d24848c8db7e86173abf` |

manifestの`id`、`start_url`、`scope`はいずれも`/heibon-mahjong/`でした。Service Workerのprecache URLは同スコープ内で、参照先は全てartifact内に存在し、HTTP 200で取得できました。

## CIとライブ確認を分けた判定

- **CI:** run `43409062345` on `a61dd0c`はcompleted/success。verify（npm test、TypeScript/Worker型検査、本番/開発/itch buildとseal）、local-online、Chromium/WebKit分離テスト、Browser UI両engine、matrix auditがsuccess。worker-production、worker-development、online、publishはskip。文書commit `9ef84cf`のrun `43409994632`ではverify/local-online/環境分離がsuccessし、Browser UIが実行中の状態を別記録として維持する。
- **ライブ確認:** run `43409062362` success。Worker health/CORS、Cloudflare deployment/version、Pages 16ファイルのHTTP/hash照合すべて成功。
- **未確認:** iPhone Safariでのインストール済みPWA更新、保存状態維持、offline CPU、オンライン対局と再接続。今回はGETのみで対局・ルーム作成を行っていない。実Pages artifactそのものとの直接比較はartifact保持制約により未実施で、SHA固定の再現buildを比較元に使用。

## 公開前判定と変更有無

今回のライブ到達性と公開bytes照合により、前回の「proxy CONNECT 403により現行本番のhealthと公開PWAの確認が未完了」という停止理由は解消しました。Phase 2は公開開始の許可を意味しません。Phase 2の公開操作、既存iPhone Safari PWA移行確認、後続Phaseに必要な別の開始前提は未実施です。Issueの公開移行手順に従い、公開前確認を再評価してください。

この記録と読み取り専用workflow/script以外に本番変更はありません。main、Pages、Worker、Durable Objects、`DUAL_PAGES_ENABLED`、旧workflow、`pages-verified`を変更していません。PRを作らず、Issue #47をOpenのまま維持します。

## 2026-11-13 Phase 2実機報告と完了判定

> この節は同日後刻にユーザー本人から受け取った既存PWAのiPhone Safari実機結果を追加したもの。上記の「実機未確認」「Phase 2未実施」は、このライブ監査時点の状態を表す記録として保持する。

本番公開workflow [run 43430225160](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43430225160)、統合後CI [run 43426274255](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43426274255)、公開後ライブ監査 [run 43434482360](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43434482360)、Worker診断 [run 43434482361](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43434482361) のjob結果をGitHub Actions APIで再取得し、成功を確認した。Worker deploy、production-test、Pages build/deploy、公開後audit、Worker診断はいずれもsuccess。公開元SHAは`c3b84944daaa8fbba3b4b603c0d3f8430e9afb58`。

Worker deployment/versionは`3b6587ac-79fd-49a8-b6d1-2f77a9022331` / `85e9510f-3f21-45c1-b0ff-4a4de66e7749`、Pages deploymentは`7766490026`。公開artifact `published-pages-c3b84944daaa8fbba3b4b603c0d3f8430e9afb58-1`（ID `14043735340`）のActions API digestは`sha256:fe5744e7b7178a92db884c8926d1e637c9668eb79b7cc4c0da4fb4d1b0813aff`で既存記録と一致。既存の公開後監査記録では実artifactと公開URLの全16ファイルがSHA-256 MATCH。

### 実機報告（本人申告、2026-11-13）

端末はiPhone Safariの既存ホーム画面PWA。iOS/Safariバージョン詳細は未記録。

| No. | 確認項目 | 結果 |
|---:|---|---|
| 1 | 既存ホーム画面PWAが起動する | OK |
| 2 | 更新通知があれば更新でき、再起動後も正常動作する | OK |
| 3 | 既存ルール設定が保持されている | OK |
| 4 | 既存オンライン参加・再接続情報が保持されている | 未検証 |
| 5 | CPU対局を開始し、ツモ・打牌ができる | OK |
| 6 | 鳴きなどの操作が正常にできる | OK |
| 7 | 機内モード・Wi-Fi OFFでPWAを再起動し、CPU対局できる | OK |
| 8 | 通常Safariから本番URLを開き、正常に起動できる | OK |

**集計：OK 7件、NG 0件、未検証1件。** 未検証の理由について本人から「オンライン対局していませんでした。」との補足があり、更新前後のオンライン参加・再接続情報を比較できなかった。保存データ内部を直接調査していないため、保存キーや再接続情報が存在しなかったとは断定しない。iPhone実機のオンライン対局・再接続は成功済みとして扱わない。更新通知の表示有無、Service Worker内部のversion照合など、個別に報告されていない詳細も補わない。

Phase 2手順上の本番Worker/Pages/SHA/artifact確認に加え、既存ホーム画面PWA起動、ルール設定保持、CPU対局・操作、オフライン起動が本人報告で確認されたため、**Phase 2：完了**と判定する。オンライン参加・再接続情報の更新前後保持、iPhone実機でのオンライン対局・再接続、iOS/Safariバージョン詳細はIssue #47全体の残件として維持する。Issue #47はOpen。Phase 3以降は未着手であり、初期登録・公開経路切替・新workflow publishを開始していない。

詳細とPhaseごとの境界は[Issue #47検証記録](issue-47-environments.md#2026-11-13-phase-2完了記録)、[公開移行手順](../operations/issue-47-cutover.md#実施状況2026-11-13)を参照。
