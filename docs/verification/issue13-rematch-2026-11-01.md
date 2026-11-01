# Issue #13 対局結果画面とオンライン再戦の検証

更新日: 2026-11-01
Issue: [#13](https://github.com/ak-sekine/heibon-mahjong/issues/13)
実装起点: `origin/main` `67fc6873b2973edd6933ee8cb7ee235173b2f12e`
実装commit SHA: `36654ff23951881521bd14e4a639d1cefe040b5b`（Browser UI修正 `026894cf8c8752de183c3161771eaf4c8077c81e`、検証フロー修正 `2dc23cea94f81d7e61fb82f1deb9f51ff1a5fb4f`）
GitHub Actions run: [41262624930](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41262624930) 成功
公開対象SHA: `2dc23cea94f81d7e61fb82f1deb9f51ff1a5fb4f`
Worker: 成功 — `https://heibon-mahjong-online.ak-sekine.workers.dev`
GitHub Pages: 成功 — `https://ak-sekine.github.io/heibon-mahjong/`

## 調査した既存仕様

- 作業開始時はmainとorigin/mainを一致させ、未コミット変更がない状態から開始しました。Issue本文と全コメントを確認し、最新コメントと2026-11-01時点のmainの実装に合わせて、再戦ボタンはIssue #12の「対局結果」画面に置きました。
- Issue #12の順位表示は既存の順位計算と、オンラインのWorker確定済み`PlayerGameView`を使います。新しい順位計算や長期結果保存は追加していません。
- 変更前、オンラインルームは`waiting`または`finalized`で、対局終了はWorkerセッションの`match-ended`でした。最終結果画面を開く操作とは別に、操作パネルに「ローカル卓へ戻る」がありました。対局終了後に同じルームでReadyを取り直す状態はありませんでした。
- 既存プロトコルにはルーム`revision`、対局`gameRevision`、ホスト権限、参加トークン、再接続用の座席・接続情報がありました。オンラインの初回座席はWorkerが`finalize-seats`時に抽選・保存し、進行中は固定します。

## 実装後の画面と状態遷移

### オフライン

- 局結果ダイアログから「次の対局を始める」を除き、「対局結果」ダイアログへ移しました。局結果は和了・流局結果の閲覧に専念します。
- 「対局結果」には最終順位・持ち点を維持し、既存の新規対局確認・開始処理をボタンから呼び出します。順位画面の表示・閉じる・再表示では対局状態を更新しません。

### オンライン

- 対局確定終了時の操作パネルから「ローカル卓へ戻る」を削除しました。局結果・対局結果の既存操作と、退出メニューは維持します。
- オンラインの「対局結果」には「新しい対局を始める」を表示します。表示・閉じるだけでは状態を変更しません。ボタンを押すとWorkerへ`prepare-rematch`を送り、同じルームの待機画面に移行します。
- Workerは既存の`RoomStatus` (`waiting` / `finalized` / `closed`)を変えず、加算フィールド`rematchWaiting`で再戦準備を示します。対局終了後の遷移は`finalized + match-ended`から`finalized + rematchWaiting`です。人間全員のReadyを取り直し、全員がReadyになっても自動開始しません。
- ホストの開始要求は`start-game`を再利用します。Workerがホスト、全人間の接続とReady、現行`expectedGameRevision`、前回セッションの終了を検証します。成功時のみルーム参加者とCPU構成から新しい座席対応を抽選し、新しいゲームセッションを保存します。

## Workerの権限・冪等性・初期化

- `prepare-rematch`は認証済みで接続中の人間なら誰でも実行できます。Durable ObjectのSQLite同期トランザクションで、最初の有効要求だけが再戦状態を設定し、全人間の`ready`と全席の`game_seat`をクリアしてルームrevisionを1回更新します。同じ準備状態への競合・再送は成功を返しても再初期化・再revisionしません。
- `start-game`はホストだけが実行できます。Workerが全人間の接続とReadyを確認し、同時要求はSQLite transactionで直列化します。最初の開始が新セッションを保存し、後続開始は`already_started`または`not_host`で拒否されます。
- ゲームの`gameRevision`はルーム内の全対局を通じて単調増加します。既存`expectedGameRevision`を使うため、前回対局の古い操作要求は新対局で`stale_revision`になります。プロトコル識別子`heibon-mahjong.v1`と既存`RoomStatus`は変更せず、ルーム状態への追加フィールドは任意項目として読み取ります。新しい`prepare-rematch`アクションは対応Workerを必要とし、Deploy gateの順序（Worker後にPages）で新クライアントが先行しないようにします。既存クライアント向けの既存イベント・操作形式は維持します。
- 再戦開始時はルール（ルーム形式）、人間席・認証・表示名、ホスト、CPU席数を保ち、前回のゲームセッションを再利用せず新規生成します。初期点、東1局、本場・供託、山・手牌・河・副露、ドラ、宣言・判断窓などは初期化されます。`prepare-rematch`時点では確定席を無効化し、ホスト開始時に新しいFisher–Yates抽選を行います。抽選結果をWorkerが保存するため、対局中と再接続後は同じ対応を使います。
- 再戦準備中はWorkerから前回ゲームビューを送らず、再接続したクライアントは現在の待機状態を受け取ります。別の参加者が準備へ移行した場合もルーム状態をbroadcastし、各画面の卓・結果操作を無効化します。退出、切断、再接続、CPU引継ぎ、ホスト移譲は既存のWorker経路を維持します。

## ローカル自動検証

| 検証 | 結果 |
| --- | --- |
| `npm test` | 成功。73個のNode test entry、失敗0、skip 0。Worker統合を含む`tests/step14-0-1.test.ts`成功。 |
| `npm run build` | 成功。アプリTypeScript型検査とVite production buildを含む。 |
| `npm run typecheck:worker` | 成功。 |
| Browser UI Python構文検査 | 成功。 |
| Browser UI engine manifest選択テスト | 5件成功。Issue #28のengine別matrixを維持し、計60シナリオ（Chromium 36、WebKit 24）に更新。 |
| GitHub Actions Browser UI | run 41262624930でChromium 36／WebKit 24のmatrix全件成功。2ページ・2クライアントの再戦シナリオはChromium／WebKit双方で成功し、320×360pxの順位画面レイアウトも検査。matrix audit成功。 |
| `git diff --check` | 成功。 |

Worker統合シナリオは同じルームで初回対局と2回の再戦を行い、準備競合の冪等性、再戦待機状態への再接続、再接続時に前回ゲームビューを送らないこと、非ホスト開始拒否、未準備開始拒否、全員Ready後の自動開始がないこと、同時開始、初期点・局・本場・供託・手牌・河・副露・宣言状態のリセット、CPU／人間の席重複防止、前回revisionの遅延操作拒否を検証します。さらに再戦待機中のホスト退出後、CPU引継ぎ・新ホスト移譲・再戦開始が成立することを確認します。Browser UIにはChromiumとWebKitのそれぞれで、ホストと別ページの参加者を起動し、参加者側の再戦開始から待機同期、Ready、ホスト開始までを確認する専用2クライアントシナリオを追加しました。

Codex Cloud環境ではブラウザー起動を行っていません。Browser UIの実結果はGitHub ActionsのChromium／WebKit jobで確認しました。初回run [41261581310](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41261581310)はテストがPlaywrightの独立ページ生成APIを誤用して失敗しました。続くrun [41261829731](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41261829731)では2クライアント再戦シナリオが両engineで成功した一方、Chromiumの後続退出テストで重複したメニュークリックが見つかりました。テスト手順を修正した最終run 41262624930では両engineのmatrixが全件成功しました。失敗をskipやassertion変更で隠していません。

## GitHub Actions・公開

最終run [41262624930](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41262624930) は全job成功しました。`verify`、Browser UI Chromium／WebKit、Browser UI matrix audit、release-freshness、Worker deploy、production-test、Pages build／deployが成功し、Deploy gateを通過しました。production-testでは2人対局、CPU引継ぎ、再接続、ホスト移譲など5シナリオが成功しました。公開対象SHA `2dc23cea94f81d7e61fb82f1deb9f51ff1a5fb4f` に対する Worker と GitHub Pages の公開が完了しています。

## 2026-11-01 追加修正：対局結果ボタンの左右配置

- 起点は更新済み`origin/main`と同じSHA `78df436a572939a8462a7856b1c6b930dc700fdd`です。
- オフライン／オンライン共通の対局結果ダイアログでDOM順を「閉じる」→「次の対局」に変更しました。これにより左に「閉じる」、右にオフライン「次の対局を始める」／オンライン「新しい対局を始める」が並び、DOM／Tab順も視覚順と一致します。共通ボタンclass、クリック処理、順位・点数表示、オンライン再戦処理、CSSは変更していません。
- `match-result-dialog.test.ts`にDOM順検証を追加しました。既存のオフライン新規対局ルート・オンライン再戦handler・順位表示テストは維持しています。
- `browser-round-end-ui.py`はオフラインの320〜430pxを含む各幅でボタンの実座標、同一行、非重複、ダイアログ内包含、1行表示を検証します。`browser-online-waiting-room.py`はChromium／WebKitの2クライアント再戦シナリオで320×360px時の左右順、非重複、折返し、包含を検証します。
- 関連テスト、`npm test`（73成功、失敗0、skip 0）、`npm run build`、`npm run typecheck:worker`、Browser UIスクリプトのPython構文検査、`git diff --check`はローカルで成功しました。
- GitHub Actions run [41267773516](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41267773516)（head SHA `ca8be6027c4fdb57841ba3ab18ca36f6ebdbfeff`）は全job成功しました。Chromium／WebKit Browser UI、Browser UI matrix audit、回帰テスト、Worker型チェック、Pages build、release-freshnessを確認しました。Deploy gateを通過し、Workerデプロイとproduction-test、Pages deployも成功しました。
- 公開記録のWorker／Pages SHAはいずれも`ca8be6027c4fdb57841ba3ab18ca36f6ebdbfeff`です。Worker URLは`https://heibon-mahjong-online.ak-sekine.workers.dev`、GitHub Pages URLは`https://ak-sekine.github.io/heibon-mahjong/`です。Pagesのdeploy jobはdeployment SHAを記録し`Reported success!`を返しました。
- Codex環境からGitHub Pages URLへHTTPアクセスした確認は、Envoy proxyのCONNECT 403で実施できませんでした。Pages公開の確認根拠は、このActions runのPages deploy成功記録です。Codex環境内ではBrowser UIも起動しておらず、ブラウザー結果はActions上のChromium／WebKitです。

## iPhone Safari実機確認

2026-11-01、ユーザー本人がiPhone Safari実機でオフラインの対局結果画面を確認しました。対局結果画面の機能上の問題は報告されていません。一方、「閉じる」が右、「次の対局を始める」が左に配置されていたため、操作の意味に合わせて左右を入れ替える追加修正が依頼されました。オンライン動作について実機確認済みとの報告はありません。今回の追加修正後の実機確認は未実施です。

今回、ユーザー本人からIssue #13について「問題ありません」との確認報告がありました。判定は**報告された確認範囲で問題なし**です。この報告では、確認した受け入れ条件、端末・ブラウザー、操作条件、確認日時は個別に示されていません。したがって、この報告を個別項目の実機確認や追加修正後のiPhone Safari確認として扱いません。

これまでに明示されたiPhone Safari確認は、上記の左右配置修正前のオフライン対局結果画面に限られます。追加修正後の実機確認とオンライン再戦の実機確認は未確認です。以下は実機で確認する場合の項目で、今回の報告に含まれていたとは見なしません。

1. オフライン対局終了後、「対局結果」を開き、順位・持ち点を確認する。「閉じる」後に再度開いて値が変わらないことを確認し、「次の対局を始める」から既存確認画面を通じて新しい対局が始まることを確認する。局結果画面に同じボタンが出ていないことも確認する。
2. 2クライアントでオンライン対局を終了し、「対局結果」を開閉しただけでは再戦準備にならないことを確認する。非ホストから「新しい対局を始める」を押し、両端末が同じルームの待機画面へ移ることを確認する。
3. 320〜430px相当の縦画面で順位・点数・ボタンが重ならず、横にはみ出さず、必要なら結果本文をスクロールできることを確認する。
4. 人間全員をReadyにしても自動開始せず、ホストの「対局開始」でだけ始まること、同じルームコード・人間参加者・CPU構成・ルールが維持され、新対局の点数・局・河・手牌が初期化されることを確認する。
5. 再戦待機中に再読み込み・再接続し、待機状態と準備表示を復元することを確認する。退出は既存のルーム操作メニューから行えることを確認する。

## 受け入れ条件と完了判定

受け入れ条件は、個別の根拠に基づいて分類します。ユーザーの「問題ありません」という総括報告だけから、個別条件の実機確認を推定していません。

| # | 受け入れ条件 | 判定 | 根拠 |
| --- | --- | --- | --- |
| 1 | オンライン終了画面のボタン表示と結果閲覧 | 確認済み | `tests/match-result-dialog.test.ts`の結果表示・開閉テストとDOM順テスト、`tests/browser-online-waiting-room.py`の結果閲覧非干渉・320×360pxボタン配置検査。Actions run [41267773516](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41267773516)のChromium／WebKit成功。 |
| 2 | 同一ルーム・同一メンバー・CPU・ルール設定の維持 | 確認済み | `tests/step14-0-1.test.ts`の再戦世代テスト、`tests/browser-online-waiting-room.py`の2クライアント検査で、ルームコード、人間参加者、CPU席、ルールを照合。実装は`36654ff`、追加UI修正は`ca8be60`。 |
| 3 | 新しい対局の状態初期化 | 確認済み | `tests/step14-0-1.test.ts`で初期点・東1局・本場・供託・手牌・河・副露・宣言状態等を検査。Chromium／WebKit Browser UIでも初期局面を確認。 |
| 4 | 全員準備完了とホスト操作による開始 | 確認済み | `tests/step14-0-1.test.ts`と`tests/browser-online-waiting-room.py`で未準備時の開始拒否、全員Ready後の自動開始なし、ホスト開始を検査。 |
| 5 | 非ホスト操作、二重開始、古いメッセージへの対策 | 確認済み | Worker統合テスト`tests/step14-0-1.test.ts`で非ホスト・同時開始・重複開始・前世代の遅延操作を検査。Workerは単調増加する`gameRevision`とSQLite transactionを使用（`36654ff`）。 |
| 6 | 切断・再接続・ホスト移譲・退出 | 確認済み | `tests/step14-0-1.test.ts`で再戦待機の再接続・状態復元、ホスト退出後のCPU引継ぎと新ホスト開始を検査。Browser UIでは退出導線も検査。Actions run `41262624930`と`41267773516`が成功。 |
| 7 | 連続3対局以上のテスト | 確認済み | `tests/step14-0-1.test.ts`の「rematch keeps the room, resets readiness and starts fresh matches once across generations」は初回対局と再戦2回を実行（計3対局）。 |
| 8 | Chromium／WebKitのBrowser UIテスト | 確認済み | Actions run [41262624930](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41262624930)で再戦シナリオを含むChromium／WebKit matrix、run [41267773516](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41267773516)で追加後のボタン順・レイアウト検査が成功。 |
| 9 | オフライン対局と既存オンライン機能の回帰確認 | 確認済み | `npm test`（73成功、失敗0、skip 0）、`npm run build`、`npm run typecheck:worker`、両Actions runのverify／Browser UI／production-test成功。オフライン結果画面とオンライン既存操作のBrowser UI回帰を含む。 |
| 10 | SPEC・ROADMAP・検証記録の更新 | 確認済み | `docs/SPEC.md`は実装時に更新済み。今回`docs/ROADMAP.md`、本検証記録、`docs/verification/README.md`を更新し、Issue #13の記録と状態を揃えます。 |

**完了判定：Close可能。** 実装と受け入れ条件を裏付ける自動検証、Chromium／WebKit Browser UI、対象SHAのWorker／Pages公開が成功し、ユーザー本人から報告された確認範囲で問題なしとの報告が得られました。上表の確認済みはコード・自動検証・文書の根拠による分類です。今回のユーザー報告を全項目の実機確認とは扱っていません。

未確認事項は、追加修正後のiPhone Safari実機確認、オンライン再戦を含む個別の実機操作、ユーザー報告の対象端末・ブラウザー・操作条件・日時です。これらは推測で補わず、今回の完了判定で実機確認済みとは記録しません。
