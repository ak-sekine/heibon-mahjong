# 開発Workerの初回作成（Issue #47）

## 実行経路と承認

mainに新しいworkflowを置かず、developのpushイベントで独立した
`Bootstrap development Worker only`を実行する。workflow_dispatchは使用しない。
GitHubはpush先のworkflowを評価するため、デフォルトブランチへの追加は不要。
通常commitではjobをskipし、head commitメッセージが次の文字列と完全一致する場合だけ動く。

```
bootstrap: create development Worker (Issue #47)
```

**ユーザーの明示的な作成許可後にのみ**このメッセージの空commitを作成・pushする。
準備commitのpushは初回作成を起動しない。Environmentの承認ルールがある場合はそれにも従う。
この専用メッセージは通常開発に使用しない。

## 前提

- 最新developで既存`Verify isolated environments`の検証（Chromium/WebKit・local-online・audit含む）が成功していること。
- Repository variable `CLOUDFLARE_ACCOUNT_ID`が既存アカウントのIDであること。
- Environment `worker-development`のsecret名は`CLOUDFLARE_DEVELOPMENT_API_TOKEN`。
  developからの実行をEnvironmentのdeployment branch ruleで許可すること。
- tokenはWorkers編集・DO作成に必要な権限に加え、既存本番Workerのsettingsを読み取れること。
  秘密値の表示・取得・コピーは不要。ローカルへtokenを持ち出さない。
- `DEVELOPMENT_WORKER_URL`は不要。未設定のまま開始できる。
- `DUAL_PAGES_ENABLED`は有効化しない。main・既存公開ゲート・Pages設定を変更しない。

## 許可後の操作

準備commitとCI結果を報告し、ユーザーの明示的な許可を得た後に実行する。
他者の未push変更を含めない。fetchが失敗した場合は停止する。

```bash
git switch develop
git fetch origin refs/heads/develop:refs/remotes/origin/develop
git merge --ff-only refs/remotes/origin/develop
git status --short
# cleanかつ最新CI成功・対象SHA確認後のみ
git commit --allow-empty -m 'bootstrap: create development Worker (Issue #47)'
git push origin HEAD:refs/heads/develop
```

Actionsで上記workflowの**このpushのSHA**を確認する。テスト・Worker型検査・開発configのdry-run後に、
`worker-development` Environment内で作成する。同一Workerの通常デプロイとconcurrency groupを共有し、
実行中キャンセルをしない。作成直前にdevelop最新SHAを再確認する。

## 自動検証と証拠

1. configのWorker名・entry・自己binding・初期migrationを照合。外部script/namespaceやroutes等の追加設定は拒否。
2. Cloudflare APIで本番settingsを読み取り、開発Workerが存在しないことを確認。
   404かつWorker不在のAPIエラー10007だけを不在と認める。403・通信失敗等は停止。
   開発Workerが存在する場合は更新せず停止する。
3. 固定コマンド`wrangler deploy --config wrangler.development.jsonc`のみ実行。
   tokenを含み得るCLI出力はログへ転送しない。失敗時も生のstderrを表示しない。
4. Wranglerの成功出力から実際の`heibon-mahjong-online-dev`のworkers.dev URLを抽出。
   URLなし・複数候補は失敗。登録済みURL変数やアカウント名から補完しない。
5. APIが返す開発ROOMS / RATE_LIMITERのnamespace IDとclassを照合。
   両IDが本番のどのDOとも異なること、および開発DO同士も異なることを確認。
   本番settingsの前後完全一致を確認する。本番Worker・本番DOへの書込APIは呼ばない。
6. 実URLの`/health`を許可Origin付きで検査（200、期待するJSON）。リダイレクトは拒否。
7. `npm run test:online:production`を**取得した開発URLだけ**に向け実行。
   名前は既存スクリプト名であり、本番URLを使用しない。ルーム作成・参加・対局・再接続等を検証し、
   通常終了時は作成したテストルームをcloseする。中断時はテストルームが24時間残る可能性がある。
8. 最後に空の表示名でjoin要求を最大13回送信。入力検証で400となりルームに参加しないこと、
   開発RATE_LIMITERが429と正のretryAfterMsを返すことを確認する。
   実ルームの状態は変更しないが、runner IPの開発join枠を最大10分間消費する。
   フルオンライン検証の後に実行し、このquotaの影響を避ける。

Summaryに実URL、ソースSHA、開発DO namespace ID、各段階の結果を残す。
**最終stepの成功とrun全体のsuccessを確認してから**登録する。
URL取得後に検証失敗した場合もSummaryにはURLが残るが、検証済みとして扱わない。
本番DOへテスト要求を送らず、Cloudflareのnamespace IDによって保存先の独立性を確認する。
実環境間の同コードアクセス・token拒否E2Eはこの処理の対象外で、Issue #47の未確認項目として維持する。

## 実URLのGitHub登録

成功したrunのSummaryから実URLを取得し、報告する。推測したURLを登録しない。
Repository Settings → Secrets and variables → Actions → Variables → New repository variableで、
`DEVELOPMENT_WORKER_URL`へその値を登録する。CLIを使う場合も同じ確認済み値を渡す。

```bash
gh variable set DEVELOPMENT_WORKER_URL --repo ak-sekine/heibon-mahjong --body "$ACTUAL_VERIFIED_URL"
```

`ACTUAL_VERIFIED_URL`は成功runで確認した値を手元で指定する変数であり、自動推測しない。
このworkflowはGitHub変数の書込権限を持たず、自動登録しない。URL登録後もPages公開・本番昇格は別作業。

## 失敗時

デプロイ前の失敗は作成しない。作成成功後にAPI確認・health・オンライン検証が失敗しても
Worker/DOは自動削除・rollbackしない。run再実行は既存Worker検出で停止する。
実状態・返却URL・失敗箇所を確認し、修正や既存開発Worker更新は別途判断する。
本番config・本番migration・本番tokenに切り替えて再試行しない。Issue #47はOpenを維持する。

## 2026-11-12 初回作成の完了結果

ユーザーの明示的許可後に実行し、開発Workerを作成済み。
確認済みの実URLは **https://heibon-mahjong-online-dev.ak-sekine.workers.dev**。
[完了run 43227915964](https://github.com/ak-sekine/heibon-mahjong/actions/runs/43227915964)はsuccess。
今後は初回作成を再実行せず、通常の開発Worker更新を別途判断する。
この作業では`DEVELOPMENT_WORKER_URL`を自動登録していない。登録する値は上記の確認済み実URL。

```bash
gh variable set DEVELOPMENT_WORKER_URL --repo ak-sekine/heibon-mahjong --body 'https://heibon-mahjong-online-dev.ak-sekine.workers.dev'
```

初回runではWranglerがエラー終了したが、読み取り診断により開発WorkerとDOは作成済みと判明した。
コードを再アップロードせず、`wrangler triggers deploy --config wrangler.development.jsonc`で公開トリガーだけを完了し、
Wranglerの返却URLを取得して全検証に成功した。初回エラーの生出力は抑制済みのため、元の詳細原因は未確定。

診断が必要な場合は、専用メッセージ`bootstrap: inspect development Worker (Issue #47)`のdevelop pushで
`inspect` jobだけを起動できる。Secret値やsettings全体は出さず、HTTP状態・APIエラーコード・
settingsのSHA256とDO bindingの識別子だけを出力する。Cloudflare APIはGETのみ。

今回追加した完了経路は`bootstrap: complete development Worker (Issue #47)`で起動する。
これは既存開発Workerのsettingsが診断時の固定SHA256と一致し、DO分離を確認できた場合だけ
公開トリガーを適用する一回限りの復旧経路。通常更新には使用しない。
ハッシュ不一致時に値を機械的に差し替えず、実状態を再確認する。
エラー表示は固定category・数値API code・終了status/signalに限定し、生のCLI出力を表示しない。
