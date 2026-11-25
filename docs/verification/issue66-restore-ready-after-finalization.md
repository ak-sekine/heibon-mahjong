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
- 対象SHA、Chromium・WebKit、必須CIとauditは各実行のhead SHAと結果を参照する。 [候補ブランチのCI](https://github.com/ak-sekine/heibon-mahjong/actions/workflows/environments.yml?query=branch%3Aissue%2F66-restore-ready-after-finalization) · [mainのCIと公開run](https://github.com/ak-sekine/heibon-mahjong/actions/workflows/environments.yml?query=branch%3Amain)

## 本番公開と実機

公開結果は本番の公開台帳と公開後auditで確認する。記録開始時の公開SHAは `d2b9bb2322bf40fde07e5beb3797fbbc80f12515`、台帳進行中の予約はなし。 [公開台帳](https://github.com/ak-sekine/heibon-mahjong/blob/pages-verified/state.json)

修正版のiPhone Safari実機は、Pages版・itch.io版ともユーザー確認待ち。自動ブラウザー検証とは別に、次を各配布版の縦画面で確認する。

1. 半荘戦のルームを作り、ホスト1人で「準備完了」「席を確定」を押す。ルームコード、東南西北の配置、CPU3人の構成を控える。
2. 待機ダイアログの「閉じる」を押し、メニューの「ルーム操作」で再度開く。自分が「接続中・未準備」で「準備完了」を押せることを確認する。
3. 「準備完了」を押し、同じ位置が「対局開始」に切り替わることを確認する。ルームコード、座席、CPU、対局形式が一致することを確認し、「対局開始」で卓が開くことを確認する。
4. 2人参加でも座席確定後にホスト・非ホストそれぞれの切断と復帰を試す。非ホストの切断中と接続後の未準備時はホストの開始が無効で、それぞれの案内が表示されること、非ホストに開始ボタンが出ないことを確認する。
