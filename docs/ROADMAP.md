# 実装状況と開発候補

- [Issue #32 操作パネル共通外枠](verification/issue32-common-frame-2026-11-11.md#pc実機による修正後の確認結果-2026-11-13)：2026-11-13の本人PC実機報告で対象修正はOK、修正前の二重枠NGは対象範囲で解消確認済み。自動検証・Pages公開は実機結果と区別。iPhone Safariでの同修正再確認と他のPC必須項目は未確認、IssueはOpen。

この表は原則2026-11-07時点のソースと検証状況です。後続の個別更新は各行の日付・参照記録を確認してください（Issue #32は2026-11-13の本人PC実機報告まで反映）。候補は実装が確定した計画ではありません。現在の仕様は[SPEC.md](SPEC.md)、過去の判断・検証記録は[開発記録](development/README.md)を参照してください。

## 状態の見方

- **完了**：現在のソースに実装され、記載の確認も完了しています。
- **一部実装**：基礎機能はありますが、対象範囲や判断力に制限があります。
- **未実装**：現在のソースに対応する機能がありません。
- **検討中**：開発候補ですが、採用や実装範囲は決まっていません。

## 実装状況

| 機能 | 状態 | 現在の内容 |
| --- | --- | --- |
| オンライン対局の操作待機・復旧 — Issue #29 | 最終確認済み（iPhone Safari OK 6件／NG 0件／未確認0件、completed／Closed） | 成功結果の後は250msだけ対応revisionの状態通知を待ち、欠落時のみ同期します。同期は同じ操作につき最大2回で、失敗時は`retryAfterMs`後に再接続します。操作拒否と同期拒否を分け、未確定操作の`requestId`を維持します。通常成功時の要求数は操作1回あたり2件から1件に減ります。参加者ごとのWebSocket制限30要求/60秒は維持します。修正後の対象SHA `cf367a613cc15ae6ee40598d4e6c795fd75f15ce` はActions run [#41926545076](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41926545076)で検証、Chromium／WebKit、Worker／Pages公開までsuccess。2026-11-05のiPhone Safari実機確認はOK 6件、NG 0件、未確認0件。以前の実機NGと修正前CI失敗も[検証記録](verification/issue29-online-action-pending-2026-11-04.md)に保持。2026-11-01の約1分間の停止原因は未特定です。 |
| PWAインストール・更新管理 — Issue #31 | 実装・公開済み（Issue #31 completed／Closed。後続アイコン変更は完了、PWA回帰2項目未確認） | Issue #31時点の実機・自動検証とClose判定は[記録](verification/issue31-pwa-2026-11-03.md)のとおりです。後続のアイコン差し替えコミット `83804ced632424cfd3a77059589f36e47a21ab09` はActions run [#41621533105](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41621533105)でverify、Chromium／WebKit、Worker production-test、Pages build／deployがsuccess。2026-11-03のiPhone Safari実機結果はアイコン受入3件OK、NG 0件。アイコン変更は完了と判定します。同コミット適用後のオフラインCPU対局とオンライン復帰後のルーム参加・対局は未確認で、成功扱いしません。[アイコン検証記録](verification/pwa-icons-2026-11-03.md)
| レスポンシブレイアウト — Issue #32 | 実装・公開済み／一部実機OK、Close不可・Open維持 | 2026-11-13、本人のPCブラウザー実機報告により操作パネル外枠統一修正はOK。修正前の二重枠NGは今回の対象範囲で解消確認済み。報告は個別項目を列挙していないため、PCのウィンドウ変更、マウス・キーボード、各種ダイアログ・順位、オンライン対局・再接続は未確認。iPhone Safariでの同修正再確認も未確認。2026-11-10の本人iPhone Safari報告4項目は当時の集計でOK 3件・NG 0件・未確認1件（Issue全体ではない）。既存のChromium／WebKit自動検証と実機結果の詳細、過去のPC／iPhone OK・NG、未確認事項は[共通外枠の検証記録](verification/issue32-common-frame-2026-11-11.md#pc実機による修正後の確認結果-2026-11-13)と[単一候補の記録](verification/issue32-single-kan-2026-11-10.md#修正後のiphone-safari実機確認結果)を参照。Issue本文のその他のClose条件が未達のためOpen維持。 |
| CPU難易度 — Issue #33 | 実装・公開・検証済み（iPhone Safari OK 5件／未確認1件、Issue #33 completed／Closed） | 初級・標準・上級を対局共通設定にし、初級は向聴数のみのランダム同点打牌・待ち3種以上でのみリーチ・役牌以外の鳴きなし、標準は既存判断、上級は効率評価同点時のリーチ現物優先を採用。`GameRules` v6、オフライン／Workerルーム正本、旧v1〜v5の標準移行、再接続・再戦を実装。30局面の判断時間、固定局面の合法性・プライバシー・判断差、3シード対局の限定比較を[検証記録](verification/issue33-cpu-difficulty-2026-11-03.md)に記録し、強さの統計的優位は断定しません。Actions run [#41735065139](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41735065139)でChromium40／WebKit30、オンライン本番統合、Worker／Pages公開が成功し、コードSHA `f07baba`で公開しました。2026-11-04のユーザー本人のiPhone Safari実機報告はOK 5件、NG 0件、未確認1件（再接続・次局・再戦後の難易度維持）。関連自動検証成功と区別して記録し、IssueをcompletedでClose。
| オンライン待機画面の進行ボタン — Issue #41 | 完了（実機確認済み範囲と未確認範囲を記録、completed／Closed） | ホスト右側の同じ位置で「準備完了」→「席を確定」→「対局開始」を切り替え、非ホストは準備後に操作を表示しません。追加修正SHA `5d9121fa6e5b2f00c441c9c51c85878ea22a0a5f`のDeploy run [#41474025754](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41474025754)はverify、Chromium／WebKit、matrix audit、release freshness、Worker／Pages公開がsuccess。2026-11-03、ユーザー本人がiPhone Safariで座席確定メッセージの上部1か所表示とプレイヤー一覧下の重複なしをOKと報告。追加修正前のボタン操作は「動作は問題ありません」と総括報告あり。エラー通知、再接続、CPU補充、非ホスト操作など個別に報告されていない実機条件は未確認で、自動検証と区別しています。文書更新run [#41476660809](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41476660809)はdocs-check success、検証・公開ジョブは文書のみの変更分類により正常skip。[進行ボタン検証記録](verification/issue41-online-waiting-room-progress-buttons-2026-11-02.md)／[重複表示の追加修正記録](verification/issue41-seat-finalized-message-duplicate-2026-11-02.md)。 |
| オンライン待機ダイアログ上部の補助ボタン配置 — Issue #43 | 完了・Close可能（実機OK 6件、NG 0件、未確認 0件／Issue Openを維持） | 「オンライン待機／閉じる」「ルームコード／コピー」「対局形式／ルール確認」の3ボタンを共通右列に揃えます。幅88〜112px、高さ44px、13.12px／weight 600、角丸8px。320〜1440pxの縦横10 viewportでChromium／WebKitの右端・寸法・文字・コード・期限・overflowを測定しました。Actions run [#41940009814](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41940009814)（SHA `c57d35cd65adc5cb28c977383c379127f734e305`）はverify、Chromium42／WebKit31、matrix audit、Worker／Pages公開までsuccessし、公開SHAも同一です。2026-11-05にユーザー本人がiPhone Safari／ホーム画面PWAで配置・表示・既存操作・ゲスト待機／準備前後／座席確定後・横画面の指定6項目を確認し、すべてOKと報告しました。既存自動検証とあわせて受入条件充足・Close可能と判断します。Issue本体は今回変更せずOpenを維持し、Closeは検証記録更新後にChatGPT側で実施します。実機再接続は未確認です。対象外の本番Worker診断 [run #41941954653](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41941954653)のWebSocket切断・応答タイムアウトは原因未特定の未解決事項として維持し、Issue #43が原因とは断定しません。[検証記録](verification/issue43-online-waiting-button-alignment-2026-11-05.md)。 |
| Cloudflare互換日付とWebSocket 1006調査 — Issue #45 | completed・Close可能（Issue Openを維持） | 互換日付を`2026-04-07`へ更新し、WebSocket Close応答と回帰テストを追加。Durable Objectの保存形式とmigration履歴は維持しました。Deploy run #42020017286と詳細診断run #42022175635で自動検証・本番通信・接続／切断／再接続が成功し、更新後の診断で1006は未観測です。根本原因は未確定でWorkers Logsとサーバー側終了理由は未確認。再発時はWorkers Logs等で別途調査します。[最終検証記録](verification/issue45-cloudflare-compatibility-2026-11-05.md)。 |
| 鳴き選択UI — Issue #52 | 11/07実機8件OK・11/11縦画面7件OK。自動検証未完了のためOpen | 押した鳴き種類の候補が1件なら`select-call`で即確定し、2件以上なら押した種類だけの候補を表示します。候補と「戻る」は共通枠に置き、複数行では下端を保って上に展開します。「見送る」は種類選択時だけ表示します。実装・公開run [#728](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42357093260)は対象SHA `68aa7e542acc020a0a3a9eba0f8af8c400e8def3`でverify、Chromium／WebKit、matrix audit、Worker／Pages deploy、production testがsuccess。文書run [#729](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42358352307)もdocs-check successです。2026-11-07のユーザー本人によるiPhone Safari実機報告は8件OK、NG 0件。この過去報告は画面方向未記録ですが、別途2026-11-11に本人がiPhone XS／Safari／GitHub Pagesの縦画面で7件OK、NG 0、未確認0と報告し、縦画面の受入条件を達成しました。2026-11-11にキーボード個別検証を追加（run 43001505789は両Browser UI失敗、ログ通信制限で原因未特定・追加検証未確認）し、スマホ横画面は対象外（検証済みではない）と整理しました。Issue #43の別UIの横画面条件は維持します。自動viewport・アクセシブル名検証と実機確認を区別して記録します。[最終検証記録](verification/issue52-call-selection-ui.md#最終仕様と確認結果--2026-11-07)。 |
| 鳴き判断の残り時間表示重複 — Issue #48 | 実装・公開・検証済み（completed／Close可能、Issue Openを維持） | オンライン鳴き／ロン判断のカウントダウンを各判断欄に一度だけ表示し、共通状態文言との重複を解消しました。対象コードSHA `d4bfaa41ccad501f400fc26eca7fc5984f8e1add`はActions [run #42028711294](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42028711294)で単体テスト・build・Worker型検査、Chromium／WebKit、Worker／Pages公開までsuccess。ユーザー本人による2026-11-05のiPhone Safari実機報告はOK 4件、NG 0件、報告4項目の未確認0件。タイムアウト、個々の鳴き種別、具体的画面幅の実機確認は未報告で、自動検証・コード調査と区別します。受入条件を満たしcompletedとしてClose可能と判定しましたが、Issue本体はOpenのままです。[検証記録](verification/issue48-decision-countdown-duplicate-2026-11-05.md)。 |
| オンライン待機画面の進行ボタン — Issue #41 | 完了（実機確認済み範囲と未確認範囲を記録、completed／Closed） | ホスト右側の同じ位置で「準備完了」→「席を確定」→「対局開始」を切り替え、非ホストは準備後に操作を表示しません。追加修正SHA `5d9121fa6e5b2f00c441c9c51c85878ea22a0a5f`のDeploy run [#41474025754](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41474025754)はverify、Chromium／WebKit、matrix audit、release freshness、Worker／Pages公開がsuccess。2026-11-03、ユーザー本人がiPhone Safariで座席確定メッセージの上部1か所表示とプレイヤー一覧下の重複なしをOKと報告。追加修正前のボタン操作は「動作は問題ありません」と総括報告あり。エラー通知、再接続、CPU補充、非ホスト操作など個別に報告されていない実機条件は未確認で、自動検証と区別しています。文書更新run [#41476660809](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41476660809)はdocs-check success、検証・公開ジョブは文書のみの変更分類により正常skip。[進行ボタン検証記録](verification/issue41-online-waiting-room-progress-buttons-2026-11-02.md)／[重複表示の追加修正記録](verification/issue41-seat-finalized-message-duplicate-2026-11-02.md)。 |
| オンライン待機画面の操作ボタン配置 — Issue #34 | 実機確認済み（OK 5、NG 0、未確認0）・completed／Close | 退出を左、準備完了を右の上段に固定し、再接続をその下段の全幅に配置します。接続状態で再接続が表示・非表示になっても上段は固定します。Deploy run [#41446809663](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41446809663) はChromium／WebKit、Worker／Pages公開までsuccess（SHA `6214f8cc73cf509acfe189cc5852a6deba855d97`）。ユーザー本人が2026-11-02にiPhone Safariで指定5項目すべてOKと報告しました（NG 0、未確認0）。[検証記録](verification/issue34-online-waiting-room-buttons-2026-11-02.md)に自動検証と分けて記録し、IssueはcompletedでCloseします。 |
| 対局終了時の最終順位・持ち点 — Issue #12 | 実機確認済み（指定4件OK、NG 0件）・完了／Close | `match-ended`確定後に「対局結果」画面を開き、東風戦／半荘戦、既存順位規則による4人の順位と確定持ち点を表示します。通常局終了時のボタンは「局の結果」「次の局へ」、対局確定終了時は「局の結果」「順位確認」です。2026-11-01にユーザー本人がiPhone Safariでフォント統一・ボタン配置・動作の4項目すべてOKと報告しました。その他の個別実機条件は未確認として区別します。自動検証と実機確認の記録は[検証記録](verification/issue12-match-result-2026-10-31.md)を参照してください。 |
| 対局結果画面と同じオンラインルームでの再戦 — Issue #13 | 完了判定済み | オフラインの次対局操作を「対局結果」画面に移し、オンライン結果画面から同じルームで再戦準備へ進みます。Workerが再戦状態・人間全員のReady・ホスト開始権限・単調増加する対局revisionを管理し、ホスト開始時に新しいセッションと座席抽選を行います。統合テストで初回＋再戦2回（計3対局）、切断・再接続・ホスト移譲・退出、重複・古いメッセージ対策を確認しました。Actions run 41262624930と追加UI修正後run 41267773516でverify、Chromium／WebKit、Deploy gate、production-test、Worker／Pages公開が成功しました。ユーザー本人の「問題ありません」との報告を記録し、個別に報告されていない確認条件や追加修正後のiPhone Safari確認は実機未確認として区別しています。[検証記録](verification/issue13-rematch-2026-11-01.md)参照。 |
| オフライン・オンライン新規対局へのルール設定統合 — Issue #27 | 完了（completed／Closed） | オフライン新規対局とオンラインルーム作成の同一ダイアログ内で、東風戦／半荘戦とルール設定を行います。独立ルール設定ダイアログを撤去し、保存タイミング・Worker正本・参加者の読み取り専用確認を維持しました。スクロールのiPhone Safari実機確認は[記録](verification/issue27-new-game-rules-2026-11-01.md)を参照。 |
| オンラインのルーム作成・参加画面のプレイヤー名表記 — Issue #30 | 実機確認済み・完了条件充足（completedでClose） | 作成・参加フォームのユーザー向けラベルと入力検証メッセージを「プレイヤー名」に統一しました。内部識別子と通信・保存形式は維持しています。2026-11-01のユーザー本人によるiPhone Safari実機確認は6項目すべてOK（NG 0件、未確認0件）です。実装run #503でverify、Chromium／WebKit、Worker production test、Worker／Pages Deployがsuccessし、docs-only run `41307412228`の文書検査もsuccessしました。Pagesの独立HTTP応答は未確認です。[検証記録](verification/issue30-player-name-label-2026-11-01.md) |
| 赤ドラ・裏ドラ・一発・カンドラの個別設定 — Issue #16 | 完了（実機確認済み、completed／Closed） | `GameRules` v2に4真偽値を追加し、初期値はすべてONです。牌生成、得点、役判定、CPUのリーチ候補評価、ルーム保存、ゲームsnapshot、再接続・次局・再戦へ適用します。OFF時は赤牌を通常牌へ置換し、槓自体は維持したうえで追加表・裏ドラを止めます。2026-11-01のユーザー本人によるiPhone Safari確認は7件OK、NG 0件、未確認1件（一発OFF）です。一発OFFの役判定とリーチ役維持は決定的な自動テストで成功しました。Actions run #499は1,319 tests、Chromium／WebKit、Worker production test、Worker／Pages deployがsuccessしました。検証記録：[Issue #16](verification/issue16-local-rules-2026-11-01.md)。 |
| 喰いタン切替 — Issue #17 | 完了・iPhone Safari実機確認（4項目OK、2項目未確認） | `GameRules` v3の喰いタン値を共通ルール編集・保存・Worker同期に追加しました。初期値ONを維持し、OFFでは副露断么九だけの和了を拒否して門前断么九と別役を含む副露手を維持します。2026-11-02のユーザー本人のiPhone Safari確認はOK 4件、NG 0件、未確認2件。CPU判断の自動テストと役なし拒否・フリテン維持の根拠を確認し、片和了の専用複数待ちケースは自動テスト未確認として記録しました。後付けありは固定、後付け禁止・片和了禁止は採用しません。Issue #17はcompletedとしてClose。詳細：[Issue #17検証記録](verification/issue17-local-rules-2026-11-01.md)。 |
| 連荘・途中流局・オーラス終了条件 — Issue #18 | iPhone Safari指定6項目を実機確認済み（OK 6、NG 0、未確認 0）・completed／Closed | `GameRules` schema v4の独立した7項目を実装しました。初期値は親テンパイ連荘・九種九牌・四風連打・四家立直・四開槓がON、アガリやめ・テンパイやめがOFFです。精算、本場・供託、親進行、精算後の単独トップ判定を統合し、CPU・Worker・再接続・次局・再戦へ同じ設定を使います。2026-11-02、ユーザー本人がiPhone Safariで新規対局画面と初期値、設定保存、オフライン確認、オンライン作成・待機、再接続・再戦、CPU対局の次局進行を確認し、指定6項目すべてOKと報告しました。特殊な途中流局・精算やめ条件は実機OKとせず、自動テスト結果と区別しています。Actions run `41382073027`ではChromium 37件／WebKit 25件、Deploy gate、Worker・Pages公開がsuccessしました。Pages直接HTTP応答はCodex Cloudの接続プロキシ制限で未取得です。[検証記録](verification/issue18-local-rules-2026-11-02.md)。 |
| 和了結果概要の点数区分 — Issue #36 | 完了・completed／Close（iPhone Safari実機OK 6件・NG 0件・未確認1件） | 計算済みの`scoreTier`を使い満貫未満は翻数・符数、満貫〜三倍満は翻数・区分、数え役満・役満系は区分のみを表示します。オフライン・オンライン共通表示で、既存の点数計算・支払い・ドラ合計・「局の結果」の符内訳は維持しました。Actions [run #558](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41483482522)でverify、Chromium／WebKit、matrix audit、Worker／Pages公開がsuccess。2026-11-03のユーザー本人によるiPhone Safari確認は7項目中6件OK、役満系の表示1件は実機未確認。3翻70符・4翻30符／40符の個別実機再現も未報告であり、自動テストとは区別しています。[検証記録](verification/issue36-win-score-tier-2026-11-02.md)。 |
| 特殊形ダブル役満・共通ルール基盤 — Issue #37 | completed・Close／自動検証・公開成功／iPhone Safari実機OK 7件（表示・点数） | GameRules/localStorage schema v5を導入し、四暗刻単騎・国士十三面・純正九蓮・大四喜の一括OFF/ONを追加。各役の倍率を候補に保持し、点数・CPU・Worker公開結果で共有します。表示は1倍「役満」、2倍「ダブル役満」、3倍「トリプル役満」、4倍「4倍役満」、5倍以上「N倍役満」に統一します。和了結果詳細の通常役・役満の合計ラベルも「合計：」に統一しました。人和・パオ・複数ロン・三家和の初期値・正規化・保存・同期型も追加しましたが、変更UIとゲーム動作は後続Issueの対象です。初回実装はActions run [#41414647412](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41414647412)、表示名称更新は[#41429120006](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41429120006)、合計ラベル統一は[#41439154842](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41439154842)でverify、Chromium／WebKit、Deploy gate、production-test、Worker／Pages publishがsuccessしました。最新公開SHAは`87d5bf0`。iPhone Safariで表示・点数の7項目がOK（NG 0、未確認 0）。その他の個別実機未報告項目は自動検証と区別して記録し、IssueをcompletedでCloseしました。[Issue #37検証記録](verification/issue37-double-yakuman-2026-11-02.md)。 |
| 人和・固定満貫 — Issue #38 | completed・Close／自動検証・公開成功／iPhone Safari実機OK 5件、NG 0件、未確認3件 | GameRules v5の人和ON/OFFを利用し、子の第一自摸前・局内の鳴き／槓なしの有効ロンだけを独立した固定満貫候補として扱います。通常役候補は役・ドラ込みの和了点（本場・供託を除く）で比較し、8,000点を超える場合だけ通常得点を採用します。Actions run [41546258846](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41546258846)のverify、Chromium／WebKit、matrix audit、release-freshness、Worker／production-test、Pages build／deployがsuccessし、Worker／Pages成功SHAは実装SHA `6c7a84ac0f38e791c7847270f04d455f659ed125`と一致しました。2026-11-03のユーザー本人によるiPhone Safari確認はOK 5件、NG 0件、未確認3件。人和成立局面・高点法・不成立条件の実機確認は未確認のまま、自動テストと区別して記録しました。[検証記録](verification/issue38-renhou-2026-11-02.md)。 |
| 和了概要のドラ合計 — Issue #11 | 実機確認済み（指定4件OK、NG 0件、未確認4件）・完了／completedでClose | 共有の和了概要に計算済みの通常ドラ・裏ドラ・赤ドラ枚数の合計を表示し、0枚は省略します。Actions run 41196608100は実装SHAと一致し、verify、Browser UI、production-test、Worker/Pages deployが成功しました。長い役名の非重複、3種ドラの実機合算、オンラインのホスト・参加者間一致、再接続後の結果復元は未確認で、自動検証済み項目と区別しています。[検証記録](verification/issue11-dora-summary-2026-10-31.md)を参照してください。 |
| 診断ログの閉じるボタン折り返し — Issue #10 | 実機確認済み・完了／Close | `#diagnostic-close`のflex縮小を止めてラベルを1行に固定し、長いビルド情報・ログ本文はダイアログ内で折り返します。Actions run 41191873055で1,301件のテスト、Worker型検査、Chromium/WebKitの320/375/390/414px Browser UI、本番Worker test、Worker/Pages deployがすべてsuccessしました。2026-10-31にユーザー本人がiPhone Safariで「閉じる」の1行表示・閉じる操作、コピー、クリア、ログ本文スクロール、他ダイアログの閉じる操作を確認し、5項目すべてOK（NG 0件）と報告しました。ログ件数別の実機確認、長いビルドID・長文ログの実機再現、機種・iOSバージョン・確認時刻は未報告です。[検証記録](verification/diagnostic-close-issue10-2026-10-31.md) |
| 全ボタン共通配色・右上メニュー — Issue #24 | 完了・Close（実機確認範囲を限定） | 通常操作ボタンの通常 `#F8DC91 / #154E3C`、押下 `#E9C66A / #154E3C`、無効 `#9DA27C / #20352C` を共通化しました。メニュー項目とハンバーガートグルは専用UIに分離済みです。Deploy run 41171398665 はsuccessし、Actionsログで `npm test` 1,292件成功・失敗0件、Chromium 35件・WebKit 21件成功、Worker型検査、build、Worker／Pages deploy成功を確認しました。2026-10-31にユーザー本人がiPhone Safariでメニュー表示と開閉・項目選択・外側タップ・連続タップ・4項目・通常ボタン操作を確認し、正常と報告しました。Android Chrome実機は端末がないため未確認ですが、今回の必須条件から除外しました。PC Firefox実機、PWAインストール状態、公開配信CSSのcomputed style、全ボタン種別・状態の網羅実機確認も未確認で、Close条件ではありません。Android実機検証用のIssueは作成しません。[ハンバーガーメニュー記録](verification/main-menu-toggle-style-2026-10-31.md) · [ドロップダウン記録](verification/menu-dropdown-style-2026-10-31.md) · [全ボタン配色記録](verification/button-role-colors-issue24-2026-10-30.md) · [Issue #24](https://github.com/ak-sekine/heibon-mahjong/issues/24) |
| Browser UI失敗 — Issue #7 | 原因調査完了 | 調査A・Bは別原因と確認し、既存修正を確認済み。回帰テスト強化の [#21](https://github.com/ak-sekine/heibon-mahjong/issues/21)はChromium／WebKit CIと異常系検出を確認し、CI検証済み・完了。親テスト30秒タイムアウトの原因調査 [#22](https://github.com/ak-sekine/heibon-mahjong/issues/22)は別件として継続中。CI時間増加の[#23](https://github.com/ak-sekine/heibon-mahjong/issues/23)は2026-10-30に調査完了・原因未特定でClosed。同一SHAの時間変動を確認したが、runner負荷等との因果関係と計測オーバーヘッドは未分離です。今後の異常は新しいIssueで扱います。[原因調査](verification/browser-ui-issue7-investigation-2026-10-29.md)・[#21回帰検証](verification/browser-ui-regression-issue21-2026-10-29.md)・[#23調査記録](verification/browser-ui-ci-duration-issue23-2026-10-30.md)参照。Browser UI全体の恒久的な安定性を保証するものではありません。 |
| オフライン対局開始後のルール確認 — Issue #20 | 実機確認済み・完了 | メニューから開始時確定の`MatchState.rules`と固定ルールを読み取り専用で表示し、オンライン待機と画面・共通ルール一覧を共用します。次回用の保存設定は参照せず、精算・次局でも確定値を維持します。2026-10-29にユーザーがiPhone Safariで東風戦／半荘戦、縦横の表示・スクロール・閉じる、選択状態・持ち点・通常操作、次局維持、新規対局設定キャンセルとの独立性、オンライン待機の回帰を含む20項目すべてOKと報告しました。「卓を見る」経由、再読み込み後の対局復元時、他端末・全画面サイズ、中断・復帰、異常経路、将来の追加設定は実機未確認です。既存の自動検証・公開結果と区別した[検証記録](verification/offline-rules-2026-10-29.md)参照。#16〜#19のルール追加・仕様調査は対象外です。 |
| CI・Browser UI検証の重複と不要なデプロイ削減 — Issue #15 | 実環境検証済み・完了 | mainのアプリ変更では全自動検証とChromium／WebKitを経たWorker／Pagesデプロイが成功し、docs-only変更では文書checkを実行してアプリ検証とデプロイをskipすることをActions履歴で確認しました。重複Browser UI回帰とrunner時間の実測比較、未確認事項は[検証記録](verification/ci-performance-2026-10-28.md)を参照してください。 |
| Browser UI回帰の壁時計時間短縮 — Issue #28 | 完了／Closed | run 41206140603でChromium／WebKit全56 scenario（34／22）が成功し、回帰区間は18:12.3から8:50.4へ短縮。Phase 3の個別engine job API auditはvalidation-only run 41208917661でsuccessし、Worker／Pages deployはskipしました。性能再現性とChromium CSV直接展開は未確認です。[検証記録](verification/browser-ui-wall-clock-issue28-2026-10-31.md)参照。 |
| 新規対局時のランダム座席 — Issue #5 | 主要機能の実機確認済み・完了 | オフラインは対局開始時に抽選します。オンラインは既存の`finalize-seats`でWorkerが一度抽選し、参加者IDとの対応を保存します。確定後や対局開始後は再抽選しません。座席確定後と開始後の席一致、次局・再読み込み・再接続後の維持を2026-10-29にユーザーがiPhone Safariで確認しました。ホスト交代・CPU引き継ぎ・複数端末での一致・全席・全操作の網羅的な実機確認は未実施です（自動テスト・本番通信テストで確認した範囲とは区別）。[検証記録](verification/random-seat-assignment-2026-10-29.md)参照。 |
| ローカルルール設定・前回値復元・オンライン確認 — Issue #6 | 主要機能の実機確認済み・完了 | 設定可能なのは対局形式（東風戦／半荘戦）のみで初期値は東風戦です。開始受理後に前回値として保存し、オンラインはWorkerがホスト確定値を保持して全員が読み取り専用で確認できます。2026-10-29にユーザーがiPhone Safariで設定・キャンセル・オフライン前回値復元・オンライン表示と局進行・同一iPhone別タブの参加者一致・ホスト退出後のルール維持を確認しました。異なる物理端末での一致などは実機未確認です。固定ルールや未実装ルールは設定対象外で、#16〜#20は独立した後続課題です。[検証記録](verification/local-rules-2026-10-29.md)参照。 |
| オンライン診断ログ | 完了 | ブラウザーで最大500件をlocalStorageに保存し、閲覧・コピーできます。異常・ビルド識別・CPU開始チェックポイントを優先して保持します。Workerは操作・接続・再同期・タイムアウトを構造化ログへ出力し、Workers Logsを永続化します。[確認方法と実環境検証記録](verification/online-diagnostics.md)参照。 |
| 明示操作による対局開始と対局なし状態 | 完了 | 初回起動・再読み込みを待機状態にし、メニューからの開始、オンライン退出・結果後の待機復帰、切断時のオンライン維持を実装・検証しました。単体テスト、ビルド、Worker型チェック、Chromium・WebKitのブラウザー回帰、Worker・Pagesデプロイが成功しています。[検証記録](verification/app-idle-state-2026-10-27.md)参照。 |
| 卓中央の局表示 — Issue #4 | 実機確認済み・完了 | 東風戦／半荘戦の表示削除、局情報・山枚数のモバイル別行表示と更新について、自動テスト、Chromium／WebKit、Workers／Pagesデプロイを確認済みです。5項目のiPhone Safari実機確認は2026-10-29にユーザーが報告しました。全画面幅・全局面・本場数・オンライン再接続の網羅確認は未実施です。[検証記録](verification/center-round-display-2026-10-28.md)参照。 |
| オンライン退出通知の配置修正 | 実機確認済み・完了 | iPhone Safariで、タイトル・メニューボタンとの非重複、通知表示中のメニュー操作、約8秒後の自動消去をユーザーが確認済みです。Chromium／WebKit自動検証と初回の河間隔測定失敗の記録を含みます。[検証記録](verification/online-exit-notice-layout-2026-10-27.md)参照。 |
| オフラインCPU手番フリーズ原因調査・診断強化 | 一部実装 | CPU段階・停滞・復帰・描画の診断機能とテストを実装。2026-10-27に通常のCPU手番、鳴き、状態遷移・描画、復帰スナップショットの記録をユーザーがiPhone Safari実機で確認しました。停滞検知・描画例外・CPU処理中断復帰など異常経路は未確認です。CPU手番フリーズは今回再発しておらず、原因未特定・修正未完了です。[検証記録とログ取得手順](verification/cpu-turn-render-diagnostics-2026-10-26.md)参照。 |
| オフライン鳴きボタン不応答・スクロール — Issue #8 | スクロール不具合は実機確認済み・今回の確認範囲で修正完了／鳴きボタン不応答の根本原因未特定 | 2026-10-30、再修正後にユーザーがiPhone Safari実機で指定5項目すべてOK（NG 0件、未確認0件）と報告しました。チー3候補表示中の手動スクロール、チー3候補の各選択、「見送る」、チー1～2候補、ロン・カン操作パネルを確認しています。スクロール不具合は今回の確認範囲で修正完了と評価します。以前の鳴きボタン不応答の根本原因は未特定のため、Issue #8はOpenのままです。再発報告、修正内容、自動テスト・Chromium／Playwright WebKit・Actions run 41059814959の結果は検証記録に保持しています。[検証記録](verification/call-scroll-diagnostics-issue8-2026-10-30.md)参照。 |
| 河テストモード | 完了 | 開発メニューまたは公開検証ページから17・18・19・23枚の合法な河局面を再現し、オフラインの実打牌を確認できます。23枚局面は最後のツモ後で、打牌すると24枚で荒牌になります。24・25枚は打牌待ち局面として到達できないため選択不可です。[検証記録](verification/river-test-mode-2026-10-25.md)参照。 |
| CPU1（右）の河8枚×3段レイアウト修正 | 完了 | CPU1の18枚開始から19・20枚目の表示、手牌・副露・中央表示・他家の河との非重複、卓枠内表示、荒牌流局までをユーザーがiPhone Safari実機で確認済みです。CPU3（左）、オンライン対局での19枚目以降、25枚目以降の実機確認は未確認です。[検証記録](verification/side-river-8x3-2026-10-25.md)参照。 |
| 対面プレイヤー公開手牌の180度回転 | 実機確認済み（一部シナリオ未確認） | iPhone Safariで和了・流局時は正常。九種九牌は実機未確認です。自動WebKit検証の4シナリオは成功しています。[検証記録](verification/online-opponent-public-hand-orientation-2026-10-27.md)参照。 |
| オンライン次局の全員確認 | 完了 | 人間全員の確認後に次局へ進行。準備状態の永続化・再接続復元・退出時のCPU除外に対応します。[検証記録](verification/online-next-round-ready-2026-10-23.md)参照。 |
| 四人打ち・東風戦・親交代・連荘 | 完了 | 東1局から東4局まで進行し、親の連荘を処理します。 |
| 点数・本場・供託・局精算 | 完了 | 和了、通常流局、途中流局の点棒移動と順位を管理します。 |
| 和了形・対応役・符・点数計算 | 完了 | Step 13.6・13.7・13.8・13.9の追加役を含む対応範囲は[SPEC.md](SPEC.md)を参照してください。 |
| Step 13.6：三色同順・一気通貫・混一色・清一色 | 完了 | 門前・副露の翻数、和了分解、七対子、点数計算、結果表示を実装しました。 |
| Step 13.7：三暗刻・二盃口・小三元・混老頭・混全帯么九・純全帯么九・三色同刻 | 完了 | 和了候補ごとの判定、既存役との複合、翻数、点数、結果表示を実装しました。 |
| Step 13.7.1：自動ターン処理テストの安定化 | 完了 | 待機登録のPromise通知と固定乱数を使い、手動待機テストの同期を決定的にしました。ゲームコードの変更はありません。 |
| Step 13.8：主要役満8種類 | 完了 | 四暗刻・大三元・字一色・緑一色・清老頭・小四喜・大四喜・九蓮宝燈と、既存役満との複合・点数・結果表示を実装しました。 |
| Step 13.9：海底摸月・河底撈魚 | 完了 | 最後の通常ツモ・通常打牌を嶺上牌・槍槓から区別し、役判定、点数、結果表示、局進行を実装しました。 |
| Step 13.10：流し満貫・特殊流局 | 完了 | 流し満貫、九種九牌、四風連打、四家立直と共通の途中流局精算、結果表示を実装しました。 |
| Step 13.11：天和・地和 | 完了 | 親の配牌14枚のツモ和了、子の第一ツモ和了を役満判定へ追加し、既存役満との候補単位の複合、CPU自動和了、結果表示を実装しました。 |
| ツモ・ロン・複数ロン・フリテン | 完了 | 通常和了とカン宣言牌への槍槓を含みます。 |
| 頭ハネ・三家和流局 — Issue #40 | completed／Close・iPhone Safari実機OK 3、NG 0、未確認6 | 複数ロンOFF時の下家→対面→上家優先、三家和の独立設定と途中流局精算、設定UI・保存・オンライン同期、Worker回答収集・結果表示を実装。GameRules v5を維持。固定局面29件、npm test 79テストファイル、build／Worker型チェック成功。Actions [#41594402355](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41594402355)でverify、Chromium 37／WebKit 26 Browser UI、Worker production-test 5シナリオ、Worker／Pages Deployがsuccess。公開SHAはfc638eaec20c3f6f121a9245c2359a37ffd76866。2026-11-03のユーザー本人によるiPhone Safari実機は設定初期値・保存、ルール表示、オンライン回答順・再接続がOK 3件、NG 0件、特殊局面6件が未確認。特殊局面は固定テストの検証範囲と区別して記録し、completedとしてClose。[検証記録](verification/issue40-multiple-ron-2026-11-03.md)参照。 |
| リーチ・ダブル立直・一発・裏ドラ | 完了 | CPUの立直とリーチ後の暗カン制限を含みます。 |
| チー・ポン・喰い替え制限 | 完了 | CPUの基本的な鳴き判断を含みます。 |
| 暗カン・大明カン・加カン — Issue #25 | 実機確認済み・完了（通常対局は未確認） | 親の配牌直後・子の第一通常ツモ後の暗カンを含みます。複数候補の選択、嶺上開花・槍槓・カンドラ・四開槓を実装しています。2026-10-31、ユーザー本人がiPhone Safariでカン検証ページを操作し、ページ全体に問題なしと報告しました。通常オフライン／オンライン対局の親の初手暗カンは対象局面を実機で再現していないため未確認です。候補判定・合法性は通常対局、検証ページ、オンラインサーバーで共通の処理を使用します。従来のカン実機確認は[記録](verification/kan-safari-2026-10-18.md)、Issue #25の自動・実機確認と未確認範囲は[記録](verification/issue25-opening-ankan-2026-10-31.md)を参照してください。 |
| CPUの手牌判断 | 一部実装 | 向聴数・有効牌・見えている牌を使う打牌と、限定的な鳴き・カン・立直判断があります。長期探索や強い戦略はありません。 |
| 対局ルール拡張 — Issue #19 | 設計完了・実装Issueへ分割（#37〜#40 completed） | 人和・パオ・特殊形ダブル役満・複数ロン／三家和の確定仕様、既存コードとの差分、受入テスト計画、連盟公式資料の確認範囲と独自仕様の差を記録。#37は特殊形ダブル役満とGameRules v5共通基盤、#38は人和、#39はパオを実装しました。2026-11-03追加確定仕様（成立済み面子による責任判定、責任成立順に基づく複数責任者のツモ本場）を含むDeploy run [#41588587285](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41588587285)で全ジョブがsuccessし、Worker／Pages成功SHAは`b982f9f3f8750ad7370f66c4f535f3831cdfcfd7`です。#39のiPhone Safari実機結果は2026-11-03にOK 5件・NG 0件・未確認2件。結果画面・次局／オンライン再戦・特殊局面の実機未確認を自動検証と区別し、completedとしてCloseしました。Issue #40「複数ロン・頭ハネ・三家和」は実装・自動検証・Worker／Pages公開済みです。Actions run [#41594402355](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41594402355)のChromium／WebKitを含む全ジョブがsuccessしました。2026-11-03のiPhone Safari実機確認はOK 3件、NG 0件、未確認6件で、特殊局面は固定テストの結果と区別して記録し、#40をcompletedとしてCloseしました。[Issue #19設計記録](verification/issue19-unimplemented-rules-2026-11-02.md) · [Issue #39検証記録](verification/issue39-pao-2026-11-03.md)。 |

## Step 13.6・13.7 完了範囲

Step 13.6と13.7で以下の11種類を実装・検証しました。

| 役候補 | 状態 |
| --- | --- |
| 三色同順 | 完了 |
| 一気通貫 | 完了 |
| 混一色 | 完了 |
| 清一色 | 完了 |
| 三暗刻 | 完了 |
| 二盃口 | 完了 |
| 小三元 | 完了 |
| 混老頭 | 完了 |
| 混全帯么九 | 完了 |
| 純全帯么九 | 完了 |
| 三色同刻 | 完了 |
| その他の未対応役 | 未実装・範囲未定 |

## Step 13.8 完了範囲

主要役満8種類を候補ごとの和了分解・和了牌割当で判定します。役満が成立した候補では一般役とドラを計上せず、異なる役満は各1役満として合算します。

| 役満 | 状態 | 主な条件 |
| --- | --- | --- |
| 四暗刻 | 完了 | 暗刻・暗カン4組。ロンのシャンポン完成を除外し、単騎を含む |
| 大三元 | 完了 | 白・發・中の刻子・カン |
| 字一色 | 完了 | 字牌のみ。通常形と七対子形 |
| 緑一色 | 完了 | 索子2・3・4・6・8と發のみ。發なし可、赤5索不可 |
| 清老頭 | 完了 | 数牌の1・9のみ |
| 小四喜 | 完了 | 風牌3種類が刻子・カン、残りが雀頭 |
| 大四喜 | 完了 | 風牌4種類が刻子・カン |
| 九蓮宝燈 | 完了 | 門前の1色、1112345678999と同色牌1枚。暗カンを含む手は除外 |

Step 13.8までの役満10種類に、Step 13.11で天和・地和を加え、計12種類に対応しています。異なる役満は同じ和了候補内で個別倍率を合算し、同じ種類は1回だけ数えます。特殊形ダブル役満ON時は四暗刻単騎・純正九蓮宝燈・大四喜・国士無双十三面待ちが2役満、OFF時と他の役満は1役満です。天和・地和は倍付けしません。

人和はIssue #38で固定満貫として実装・自動検証・公開済みで、completedとしてCloseしました。2026-11-03のiPhone Safari実機確認は5件OK、NG 0件、3件未確認です。パオはIssue #39で実装し、追加確定仕様を含む26件の固定局面テスト、オンラインWorker共通処理、結果表示を追加しました。Actions run [#41588587285](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41588587285)でChromium／WebKit、production-test、Worker／Pages公開までsuccessし、成功SHAは`b982f9f3f8750ad7370f66c4f535f3831cdfcfd7`です。2026-11-03のiPhone Safari実機結果はOK 5件・NG 0件・未確認2件として[検証記録](verification/issue39-pao-2026-11-03.md)に記載。未確認は結果画面の開閉・表示幅と次局・オンライン再戦の設定維持です。特殊局面も実機未確認として自動テストと区別し、Issue #39はcompletedとしてCloseしました。Issue #19では人和・パオ・特殊形ダブル役満・複数ロン・三家和の仕様を確定し、実装設計を記録しています。四開槓による途中流局と、1人が4回カンしたときに続行するルールを実装しています。[Issue #19設計記録](verification/issue19-unimplemented-rules-2026-11-02.md)。

## Step 13.9 完了範囲

海底摸月と河底撈魚を各1翻で実装しました。通常牌山の取得元とロン窓に記録した最終通常打牌の情報から判定し、嶺上開花・槍槓および役満候補とは複合しません。最終打牌でロンがなければ、既存どおり次のツモ要求時に通常流局します。

## 今後の候補

以下は開発候補の一覧であり、すべて実装が確定したものではありません。

### 役満

| 役満候補 | 状態 |
| --- | --- |
| 四暗刻 | 完了 |
| 大三元 | 完了 |
| 字一色 | 完了 |
| 緑一色 | 完了 |
| 清老頭 | 完了 |
| 小四喜 | 完了 |
| 大四喜 | 完了 |
| 九蓮宝燈 | 完了 |
| 国士無双 | 完了 |
| 四槓子 | 完了 |
| 天和 | 完了 |
| 地和 | 完了 |
| その他の未対応役満 | 未実装・範囲未定 |

四開槓は複数人にカンが分散した局の途中流局ルールとして実装済みです。

### 特殊役・流局

| 機能 | 状態 |
| --- | --- |
| 流し満貫 | 完了。通常荒牌流局で判定し、複数成立・供託・親連荘／交代を含む専用精算 |
| 九種九牌 | 完了。第一ツモ時に任意宣言。暗カンも可能な場合は選択した操作を確定し、暗カン成立後は宣言不可。CPUはツモ和了を優先し、それ以外は自動宣言 |
| 四風連打 | 完了。4人の第一打が同じ風牌なら、4枚目へのロン解決後に成立 |
| 四家立直 | 完了。4人目の宣言牌へのロン解決と供託後に成立 |
| 天和・地和 | 完了。天和は正当な親の配牌時ツモ、地和は鳴き・カンのない子の第一ツモ。いずれも既存役満と複合し、1役満 |
| 人和 — Issue #38 | 完了・completed／Actions・Worker／Pages公開成功、iPhone Safari実機OK 5件・NG 0件・未確認3件 |
| その他必要な流局ルール | 検討中 |

四開槓を含む途中流局は親を維持し、本場を1つ増やし、供託を持ち越し、ノーテン罰符を行いません。途中流局だけを理由に東風戦を終了しません。通常の荒牌流局とは区別して精算します。

## Step 13.10 完了範囲

流し満貫、九種九牌、四風連打、四家立直を実装しました。特殊流局の優先順は、4人目の打牌・リーチ宣言牌へのロンを先に解決し、同時に成立する四風連打と四家立直では四風連打を優先します。流し満貫の複数成立時は成立者ごとの満貫相当支払いを独立して処理し、供託は親から近い成立者1人へまとめて渡します。詳しい成立条件と支払いは[SPEC.md](SPEC.md)を参照してください。

## Step 13.11 完了範囲

天和・地和を各1役満として追加しました。親の配牌14枚によるツモ和了を有効にし、子の第一ツモはそれ以前に通常打牌があっても成立しますが、鳴き・カン後やロンでは成立しません。通常形・七対子・国士無双の候補に追加し、候補内の既存役満と合算します。詳細は[SPEC.md](SPEC.md)を参照してください。特殊形ダブル役満はIssue #37、人和はIssue #38で実装し、人和は実機確認8項目中5件OK、3件未確認でIssue #38をcompletedとしてCloseしました。パオはIssue #39で実装し、自動検証・Browser UI・Worker／PagesのActions成功結果とiPhone Safari実機OK 5件・NG 0件・未確認2件を[記録](verification/issue39-pao-2026-11-03.md)します。特殊局面を含む未確認事項は自動検証と区別し、Issue #39はcompletedでCloseしました。

### その他

| 候補 | 状態 |
| --- | --- |
| CPU思考の改善 | 一部実装。継続候補 |
| 対局ルールの拡張 | 検討中 |
| 対局の中断・再開 | 未実装 |
| 対局履歴・牌譜 | 未実装 |
| 効果音 | 未実装 |
| PWA対応 | 実装・公開済み（Issue #31 completed／Closed。後続アイコン変更の受入3件OKで完了。変更後のオフラインCPU対局・オンライン復帰対局は未確認。詳細は[Issue #31記録](verification/issue31-pwa-2026-11-03.md)・[アイコン記録](verification/pwa-icons-2026-11-03.md)） |
| Step 14.0：Cloudflareオンライン待機基盤 | 完了 | ルーム作成・参加、WebSocket認証、24時間TTL、本番デプロイ・通信テストを実装しました。[検証記録](verification/step14.0/README.md) |
| Step 14.0.1：オンライン待機ルーム完成 | 完了 | Ready、ホスト権限と引き継ぎ、CPU席補充、座席確定、退出、自動再接続、revision・重複要求防止、レート制限を実装しました。[設計・実装記録](development/step-14.0.1.md) · [検証記録](verification/step14.0.1/README.md) |
| Step 14.1：オンライン対局の進行共有 | 完了 | サーバー権威型のゲーム状態・座席別ビュー、打牌・判断窓・CPU進行・局精算・再接続、オンライン卓を実装しました。ローカル検証、GitHub ActionsのBrowser UI、Cloudflare本番通信、Pages build / deployが成功しました。[開発・設計記録](development/step-14.1.md) · [検証記録](verification/step14.1/README.md) |
| Step 14.2：河の配置、共通メニュー、表示名 | 完了 | オンライン・オフラインで共通の河座標、右上メニュー、対局操作領域、待機画面の表示名欄を統一しました。[開発・設計記録](development/step-14.2.md) · [検証記録](verification/step14.2/README.md) |
| Step 14.3：対局UI共通化、河間隔、CPU表示名 | 完了 | 共通操作・点数・卓中央コンポーネント、コンパクトな河座標、ドロップダウンメニュー、オンラインCPU番号を実装しました。ローカル50テスト、build、およびActionsのBrowser UI・Worker deploy・production test・Pages build/deployが成功しました。河レイアウトは2026-10-28にユーザーがiPhone Safariで目視確認済みです（全配置・画面サイズを網羅した確認ではありません）。[開発・設計記録](development/step-14.3.md) · [検証記録](verification/step14.3/README.md) · [河間隔調査](verification/river-spacing-investigation-2026-10-27.md) |
| Step 14.4：メニューとオンラインダイアログの分離 | 完了 | 作成・参加の入力フォームを分離し、ActionsのChromium、Worker本番通信、Pages build/deployまで成功しました。オンライン「閉じる」ボタンは作成・参加・待機の3画面でiPhone Safari実機確認済みです。[開発記録](development/step-14.4.md) · [検証記録](verification/step14.4/README.md) · [閉じるボタン検証記録](verification/online-dialog-close-2026-10-26.md) · [処理時間記録](verification/codex-performance/step14-4-menu-dialog-separation.md) |
| Step 14.5：操作欄のソースコード共通化 | 完了 | 共通ActionPanel、ローカル／オンライン状態アダプター、モード別操作委譲、ActionPanel単体テストを追加しました。mainでBrowser UI、Worker deploy、本番通信検証、Pages build/deployが成功しました。iPhone Safari実機確認は未実施です。[検証記録](verification/step14.5/README.md) · [開発記録](development/step-14.5.md) · [処理時間記録](verification/codex-performance/step14-5-action-panel.md) |
| Step 14.6：対局中の退出者をCPUへ引き継ぎ | 完了 | 対局状態を保ったCPU交代、判断窓の継続、ホスト交代、退出後の認証失効、最後の人間退出時のルーム終了を実装し、53件のテスト、Browser UI、本番通信、Pagesデプロイを確認しました。iPhone Safari実機確認は未実施です。[開発記録](development/step-14.6.md) · [検証記録](verification/step14.6/README.md) |
| Step 14.7：宣言吹き出し表示 | 完了 | オフライン・オンライン共通の宣言表示、オンライン公開イベント履歴、局ごとの重複防止を実装しました。ユーザーがiPhone Safari実機で両モードの表示を確認済みです。以前の無表示報告の原因は未特定です。[開発記録](development/step-14.7.md) · [検証記録](verification/step14.7/README.md) |
| Issue #46：itch.io HTML5配布準備 | 一部完了／共有Originを完全一致で許可・鳴き判断UI実装・実機確認待ち | iPhone Safariの報告とCloudflare HTTPログで `https://html-classic.itch.zone` を実測し、Worker許可リストへ完全一致で追加。Pages Originと既存開発Origin、参加者token、WebSocket ticket、Durable Object認可、レート制限を維持します。Deploy run [#42081081997](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42081081997)ではverify、Chromium／WebKit、matrix audit、Worker deploy、本番相互Origin通信、Pages build/deployがsuccessし、WorkerとPagesの成功SHAは`4924682d58feefaee16b3f7026c359ef6be5e179`です。2026-11-06にオフライン・オンライン共通の鳴き判断ダイアログを実装し、最大7候補、卓確認・再表示、期限継続、Chromium／WebKit小画面検証、本番Worker・Pages deployがsuccess（run [#42148701975](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42148701975)、SHA `d963ca9fd4cf2a6970ec69cce6bf9ad28623ddbd`）。後続のtest-only run [#421558](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42155800715)ではChromium全jobと両エンジンのブラウザー回帰がsuccessし、WebKitのstandalone itch smokeのみ初期手牌待ちでtimeout（詳細は検証記録）。 test-only SHA `f258f855b06bd3c4e6b6bd229b10e6374a018a90`で状態ベース待機と物理牌ID追跡へ修正し、Browser UI run [#42225801512](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42225801512)でChromium／WebKit各6回のSmoke、各Browser UI suite、制御失敗の診断artifact検証がsuccessしました。両方向のroom/game sync、切断・再接続、拒否Originとinvalid ticketもproduction testで確認しました。iPhone実機のHandshake Origin、鳴きダイアログ操作、相互対戦・再接続、Draft公開準備は未確認。IssueはOpenです。[itch検証記録](verification/issue46-itch-html5-2026-11-05.md#2026-11-05-実測-origin-許可と相互接続検証) · [鳴き判断ダイアログ検証記録](verification/call-decision-dialog-2026-11-06.md)。今回、鳴き判断の通常操作を種類別ボタンへ変更し、同一種類の表示候補が複数あるときだけ共通ダイアログで選ぶUIを実装しました。Deploy gate run [#42247363486](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42247363486)はChromium／WebKit、両エンジンのstandalone itch smoke前後、matrix audit、Worker deploy、本番7シナリオ、Pages build／deployまでsuccessし、両サービスのSHAは`c95cb315074ddfd5fe4ff9232b6564edcba250a1`です。[種類別ボタンUI検証記録](verification/call-type-buttons-2026-11-06.md)。iPhone Safari／公開中のitch.io実機確認は未完了のためIssue #46はOpenを維持します。 |

各項目を着手する際は、実装範囲を決めてからこの表と[SPEC.md](SPEC.md)を更新します。

2026-11-09（当時の履歴）: iPhone Safari実機での「ポンは候補切替でパネル全体が上へ移動し、カンは下端を維持して上へ伸びる」という報告を受け、全候補の位置・高さ管理を共通化しました。[設計・検証記録](verification/issue32-candidate-anchor-2026-11-09.md)。過去の実機履歴を維持し、修正後のiPhone Safari／PC再確認は未確認、Issue #32はOpenです。

2026-11-10: 後続の単一カン即時実行修正後の本人実機報告とClose再評価は[単一候補の検証記録](verification/issue32-single-kan-2026-11-10.md#修正後のiphone-safari実機確認結果)を参照してください。最新状態は上表に反映し、以前の未確認記録は当時の履歴として保持します。

### Issue #55 最終照合（2026-11-11）

PWAヘッダーの本人iPhone Safari報告は6 OK／0 NG／1未確認（複数タブ）。
カン10件とPWA7件を[最終調査記録](verification/issue55-pwa-header.md#2026-11-11-最終調査本人実機報告)で個別評価する。
最新CIの操作欄37→81pxは通知前後の比較状態を調査し、テストを入力待ち境界へ修正した。
修正SHA `95987876a8f16aeddc4e734d3c69b75fe4bec4fe`のDeploy [#42952119677](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42952119677)は全ゲート・Chromium45本／WebKit35本・Pages公開success。
17受入条件はすべて達成、完了・Close可能と判断する。依頼どおりIssue #55はCloseしない。
カンの位置・ツールバー操作とPWA複数タブは実機未確認のまま記録し、実機OKとはしない。
Issue #32のPC実機や#52の方向別実機・focusの残課題とは区別する。

## Issue #47 環境分離

一部実装：環境別build・PWA/Storage・Worker設定・検証成果物合成と公開ゲートを追加。外部設定、公開移行、実Worker分離とiPhone Safari確認は未完了。[設計](development/issue-47-environments.md) / [運用](operations/environments.md) / [検証](verification/issue-47-environments.md)。
