# Issue #66 座席確定後の準備状態復元

調査起点は main の `90457acfb28d11df0704580ee1d058a8aff447cc`。Issue は Open。報告時の再現環境は GitHub Pages 版の iPhone Safari 縦画面で、半荘戦のホスト1人とCPU3人。 [Issue #66](https://github.com/ak-sekine/heibon-mahjong/issues/66)

## 原因と修正

- `closeDialog()` は初回対局開始前に `stopAutomaticConnection()` でWebSocketを閉じる。Workerの `socketEnded()` は接続とReadyを解除する。再接続は保存済みのトークンと同じ参加者IDを使い、未準備の最新ルーム状態を返す。席とホスト権限は保持される。 [クライアント](../../src/online/waiting-room.ts) · [Worker](../../worker/room.ts)
- 修正前は `renderControls()` が `waiting` と再戦準備にしか「準備完了」を表示せず、Workerの `set-ready` も初回の `finalized` では `room_finalized` を返した。人間全員の接続とReadyを求める開始条件を満たせなかった。
- 修正後は初回対局開始前の `finalized` で、未準備の人間に「準備完了」を表示する。Workerはゲームセッションが存在しないときに `ready: true` を受理する。Readyの復元は本人の明示操作で行う。ホストの操作位置はReady受理後に「対局開始」に切り替わり、他の人間の接続・準備状況に応じて案内と無効状態を表示する。非ホストはホストの操作を待つ。
- Workerは同じルーム内でReadyとルームrevisionを更新する。座席、CPU、ルール、認証とホスト権限は保持される。開始権限と全員接続・Ready、操作IDの再送、revision照合は既存の検証を通る。初回対局中・終了済みのReady要求は拒否し、再戦準備は既存経路で扱う。 [仕様](../SPEC.md#オンライン待機と対局)

## 自動検証
- `npm test` は許可付き実行で1,601件成功。通常実行は既存の公開成果物検証がPythonの起動時にEPERMで失敗した。Pagesビルド、Worker型検査、差分の空白検査、itch.io ZIP生成とZIP整合性検査は成功。

- WorkerのSQLite Durable Objectテストで修正前に1人・2人のReady復元要求が失敗し、修正後は成功。既存の再戦、退出、ホスト交代を含む関連テストも確認した。 [Workerテスト](../../tests/step14-0-1.test.ts)
- ブラウザーの既存モックテストに、半荘戦のホスト1人＋CPU3人での閉じる・復帰・準備・明示開始、2人参加での非ホストの再読み込みと準備復元、ホストの一時切断、他者の未準備・切断時の無効表示、390pxと1280pxでの操作位置を追加した。 [ブラウザーテスト](../../tests/browser-online-waiting-room.py)
- 修正・統合対象SHAは `258a112c41a74ad056b73b7e36347c1d52a862fe`。候補・mainともに同じSHAの push run の attempt 1 で、Chromium・WebKit各2グループ、環境分離、ローカル実Workerでのオンライン検証、最終auditが成功した。候補成功後にmainへfast-forwardした。 [候補CI](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45621620531) · [main CI](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45623722447)
- Workerで、1人・複数人の復帰、同じ認証情報での再接続、確定済みの構成と設定の維持、未準備時の開始拒否、非ホストの開始拒否、対局中・終了後のReady拒否、古いrevisionの拒否、requestIdの再送、二重開始の拒否を確認した。既存の座席確定、再戦、退出・ホスト交代も成功した。
- Chromium・WebKitで、待機画面を閉じたホストの復帰、非ホストの再読み込み、ホストの一時切断、自他の準備・接続状況に応じた表示と開始可否、390×844と1280×900での操作位置を確認した。ブラウザーでの操作・表示には決定的なWorkerモックを使用し、本物のSQLite状態遷移はWorkerテストで確認した。 [Chromiumの操作結果](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45621620531/job/139231793074) · [WebKitの操作結果](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45621620531/job/139231793066)

## 本番公開と実機

- 2026-11-25にmainの `258a112c41a74ad056b73b7e36347c1d52a862fe` を本番公開。main CIの検証済みPages成果物（ID `15026217765`）を `production_validation=reuse` で再利用した。Worker、本番オンライン検証、Pagesデプロイ、台帳確定、独立した公開後auditはすべて成功した。 [本番公開run](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45625634710) · [公開後audit](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45625634710/job/139247069263)
- 確定台帳 `f719984b5b6d5777cfb299d696083ca5dc099702` は `pending: null`。配信中の環境メタデータは台帳の公開情報と一致し、本番Workerの `/health` が成功した。 [確定台帳](https://github.com/ak-sekine/heibon-mahjong/blob/f719984b5b6d5777cfb299d696083ca5dc099702/state.json) · [配信中の環境メタデータ](https://ak-sekine.github.io/heibon-mahjong/environments.json)
- 本番接続先を使うitch.io配布用 `heibon-mahjong.zip` を公開runで生成した。CIの両ブラウザーでitch向け起動検証が成功し、本番オンライン検証ではPagesとitch系Originの双方向ルーム同期が成功した。公開runの成果物を取得し、外側のハッシュと内側の配布ZIPの整合性を確認した。配布ZIPのSHA-256は `ac334fe3b3d52c69a692edca73ae32c2eba0640a615cb590c22755cbb5db7450`。itch.ioへのアップロードは未実施で、現在の配布版への修正版反映は未確認。 [配布用成果物](https://github.com/ak-sekine/heibon-mahjong/actions/runs/45625634710/artifacts/15028890015)

修正版のiPhone Safari実機は、Pages版・itch.io版ともユーザー確認待ち。自動ブラウザー検証とは別に、次を各配布版の縦画面で確認する。

1. 半荘戦のルームを作り、ホスト1人で「準備完了」「席を確定」を押す。ルームコード、東南西北の配置、CPU3人の構成を控える。
2. 待機ダイアログの「閉じる」を押し、メニューの「ルーム操作」で再度開く。自分が「接続中・未準備」で「準備完了」を押せることを確認する。
3. 「準備完了」を押し、同じ位置が「対局開始」に切り替わることを確認する。ルームコード、座席、CPU、対局形式が一致することを確認し、「対局開始」で卓が開くことを確認する。
4. 2人参加でも座席確定後にホスト・非ホストそれぞれの切断と復帰を試す。非ホストの切断中と接続後の未準備時はホストの開始が無効で、それぞれの案内が表示されること、非ホストに開始ボタンが出ないことを確認する。

## 2026-11-25 ユーザー本人の実機確認

ユーザー本人がiPhone Safari縦画面で、Pages版とitch.io版のそれぞれ8項目を確認した。上記の実機確認待ちとアップロード未実施は、公開作業時点の記録。

| 確認項目 | Pages版 | itch.io版 |
|---|---|---|
| 準備完了・座席確定ができる | OK | OK |
| 待機画面を閉じて再度開ける | OK | OK |
| 接続中・未準備と表示される | OK | OK |
| 準備完了ボタンが表示される | OK | OK |
| 準備完了ボタンを操作できる | OK | OK |
| 同じ位置が対局開始ボタンに切り替わる | OK | OK |
| ルーム・座席・CPU構成・対局形式が維持される | OK | OK |
| 対局を正常に開始できる | OK | OK |

Pages版はOK 8、NG 0、未確認0。itch.io版はOK 8、NG 0、未確認0。合計はOK 16、NG 0、今回の確認対象内の未確認0。

複数人参加時の実機動作、実機上の再読み込み・一時的な通信切断、端末の詳細バージョン、itch.ioの実配信SHAは未確認。今回の実機報告からは、itch.ioで動作を確認したビルドと配布成果物 `15028890015` のSHA一致や、アップロードの実施者・日時は確認できない。

## 最終受入評価

| # | 評価 | 根拠 |
|---|---|---|
| 1 | 達成 | ホスト1人＋CPU3人で、座席確定後に閉じて復帰し、準備完了から開始できることをWorkerとChromium・WebKitで確認。Pages版・itch.io版とも本人が一連の操作を実機で確認した。 |
| 2 | 達成 | 複数人ルームでホスト・非ホストが切断と復帰後にReadyを復元できることをWorkerとブラウザーの自動検証で確認した。 |
| 3 | 達成 | 非ホストの再読み込みとホストの一時切断後に、復帰時の最新状態で操作できることをChromium・WebKitで確認した。 |
| 4 | 達成 | Ready復元前後で確定済み座席・CPU構成・参加者・ルールが一致することをWorkerとブラウザーで検証し、本人もルーム・座席・CPU構成・対局形式の維持を両配布版で確認した。 |
| 5 | 達成 | Workerで未準備時・非ホストの開始、二重開始、対局中・終了後の不正なReadyを拒否。両ブラウザーで切断中・未準備時の開始不可と、全員の接続・Ready後のホストによる明示開始を確認した。 |
| 6 | 達成 | Workerと既存の関連自動検証で、座席確定前の準備と座席確定、再戦準備、退出・ホスト交代、古いrevisionの拒否とrequestIdの再送保護を確認した。 |
| 7 | 達成 | Chromium・WebKitで390×844と1280×900の操作位置と状態別の案内を確認。iPhone Safari縦画面では本人が両配布版で表示、操作、同じ位置での切り替えを確認した。 |
| 8 | 達成 | 修正SHA `258a112c41a74ad056b73b7e36347c1d52a862fe` の候補・main CIは単体、Worker、Chromium・WebKit、auditが成功。本番公開と公開後auditが成功し、確定台帳と配信中のPagesメタデータが同じSHAを示した。 |
| 9 | 達成 | iPhone Safari縦画面でのPages版の再現手順とitch.io版の共通処理を本人が確認。各8項目の結果を上の実機記録に記載した。 |

受入条件9件すべて達成。複数人・再読み込み・一時切断の受入評価には自動検証を用いた。実機で未確認の項目とitch.io実配信SHAは、上記の受入条件で求められた実機再現手順の範囲外。必須の追加実装・確認作業はなく、文書のmain統合と同SHAの文書CI・auditの成功をもってClose可能と判定する。IssueはOpenのままとし、Close操作は別途行う。
