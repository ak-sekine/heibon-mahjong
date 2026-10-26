# Heibon Mahjong: Codex 作業指示

## プロジェクト

- Heibon Mahjong は TypeScript / Vite による Web 麻雀ゲームで、GitHub Pages で公開する。
- ゲームロジックと描画処理を分離する。非公開牌の物理 ID や牌種を DOM に漏洩させない。
- iPhone Safari での表示を重視する。Chromium の検証結果を iPhone Safari 実機での検証結果と混同しない。

## タスク開始時

- コード・テスト・ドキュメントの変更を始める前に、対象リポジトリと作業ディレクトリを確認し、次を実行・記録する。
  1. 現在のブランチ名（`git branch --show-current`）
  2. 作業ツリーの状態（`git status --short`）
  3. リモート（`git remote -v`）
  4. `git fetch origin` の結果
  5. fetch成功後の `origin/main` SHA と現在のHEAD SHA（`git rev-parse origin/main`、`git rev-parse HEAD`）
  6. `origin/main` とHEADのbehind/ahead（`git rev-list --left-right --count origin/main...HEAD` の2つの数値は左からbehind、ahead）
  7. 未pushコミットの有無と内容（`git log origin/main..HEAD --oneline`）
- `git fetch` に失敗したら、古いリモート追跡情報を最新として扱わない。ネットワーク制限が原因なら、承認された正規のネットワーク許可手順で同じ fetch を再試行する。最新リモート情報を取得できない場合はその事実を報告し、リモート状態が未確認のままpushなどの危険なGit操作を行わない。
- 作業開始時に未コミット変更や未pushコミットがあれば、その差分・コミット内容と所有者を確認して記録する。既存の変更やコミットを無断で削除、上書き、破棄しない。
- 原則として最新の `origin/main` を基準に作業する。ローカルの `origin/main` は fetch 成功前に最新と決めつけず、必要なら実際のリモートを確認する（例：`git ls-remote origin refs/heads/main`）。
- 作業中に作成したコミットSHAを記録する。他のcheckoutや作業環境にローカルコミットがあると仮定しない。作業環境を切り替えた場合は、ブランチ・HEAD・対象コミットの存在と未コミット差分を再確認し、変更を安全に引き継げることを確かめる。

## GitHub 接続とプロキシ

- `Failed to connect to proxy port 8080 after 0 ms` は、それだけでGitHub障害やリポジトリ異常を意味しない。失敗したコマンド、宛先（`github.com` または `api.github.com`）、失敗段階、エラーを確認する。
- 通常のサンドボックス実行で失敗した場合は、Codex Cloudの正規の承認フローでネットワークアクセス許可付き実行を依頼・利用し、同じ診断コマンドを試す。許可が得られなければ停止する。許可付きでも失敗したら段階とエラーを記録して調査する。同じ失敗の無意味な連続再試行はしない。
- `HTTP_PROXY` / `HTTPS_PROXY` の無断変更・解除、直接接続などネットワーク制限の迂回、認証情報の無断変更は禁止。失敗した通信を成功と報告しない。
- AGENTS.md はアクセス権限や許可ドメインを変更しない。

## Git通信とGitHub API

- `git fetch`、`git push`、`git ls-remote` はGit通信（通常 `github.com`）。`gh run list`、`gh run view` はGitHub API（`api.github.com`）を使う。ホストも通信経路も異なる。
- Git通信が成功してもAPIがCONNECT 403で拒否されることがある。APIに接続できないときは確認可能なGit操作を行い、Actionsの結果は未確認と報告する。APIエラーを理由に成功済みGit通信を失敗扱いしない。

## Git操作の安全性

- fast-forwardを優先し、force pushは禁止。`reset --hard`、意図しないrebase・merge、既存履歴の破棄はしない。
- push後は可能な範囲でリモートSHAを確認する。mainへの反映は下記の標準運用に従い、ユーザーから別途保留指示がある場合は従う。
- commit前に、変更対象が今回の依頼範囲内であること、意図しないファイル変更がないこと、必要な検証結果と実行できなかった検証が明確であること、`git diff --check` が成功することを確認する。必要なテスト・ビルドは変更内容に応じて実行する。既存コミット履歴の改変は明示的な指示がない限り行わない。
- push前に `git fetch origin` を成功させ、`git status`、`git log origin/main..HEAD --oneline`、`git diff origin/main...HEAD --stat`、`git rev-list --left-right --count origin/main...HEAD`（behind/ahead）を確認し、push先ブランチが意図した対象であることを確認する。
- 今回の依頼と無関係なコミットがpush対象にある場合、またはコミット数が想定より多い場合は、理由を調査して解決するまでpushしない。大きな差分は規模だけで機械的に拒否せず、正規の既存開発履歴と今回の作業差分を区別する。
- pushが拒否されたら、force pushや自動審査・セキュリティ制限の回避をせず、失敗を成功として報告しない。原則として同じ作業環境で調査し、ブランチ名、現在のHEAD、対象コミットSHA、リモートSHA、未pushコミットと未コミット変更を記録・保持する。原因不明のまま `reset`、`rebase`、`cherry-pick` などを行わない。別環境へ移る場合は対象コミットと差分の安全な引き継ぎを確認する。
- 対象コミットが見つからないときは、復旧できたと報告しない。まず現在のmainに対象修正があるか確認し、必要なら修正の再実装を提案する。
- 明示的な許可なしに `git push --force`、`git push --force-with-lease`、共有済みコミットの履歴改変、未保存変更を破棄する `git reset --hard`、無関係な作業を含む大量コミットのpush、自動審査の回避、既存の未pushコミットの無断削除を行わない。

## mainへの反映（標準運用）

- **通常の開発タスクは、必要な修正・検証・commitに続けてmainへのpushまでを完了範囲とする。** ユーザーが明示的に「作業ブランチで停止」「mainに反映しない」と指定した場合は、その指示を優先する。毎回main反映の確認を求める必要はない。
- 変更内容に応じたローカルテスト・ビルド・関連UI検証が実行され、既知の失敗や未解決の重大な問題がなく、差分が依頼範囲に収まる場合は、最新リモートmainを確認し、安全にfast-forwardできる方法でmainへpushする。作業ブランチを使った場合も同様。既存変更・履歴を破棄せず、force pushしない。
- テスト失敗、重大な不具合、検証に不可欠なテスト自体の実行不能、競合、予期しないリモート更新、破壊的変更などがある場合は、原因と影響を確認し、安全に続行できなければmain反映を保留して報告する。「テスト未実行」を「テスト成功」と扱わない。
- GitHub Actionsの確認はpush後に可能な範囲で実施する。**`api.github.com` のForbiddenや通信制限でActionsの結果を取得できないことだけを、main反映の停止理由にしない。** Git通信でmainの更新が確認できたら、Actionsの状態は「未確認」と区別して報告する。
- push後にActionsの失敗が判明したら、ログと原因を調べて報告・修正する。成功したpushを無断で巻き戻さない。ブラウザ検証ZIPや代表画像のChatGPTによる毎回の追加レビューは必須ではなく、不具合発生時・検証失敗時に実施する。
- 文書のみの変更では、ゲームのテスト・ビルドを理由なく再実行しない。UI変更のSafari実機確認はユーザーが公開後に行うものとし、実機未確認の事実を明記する。

## 検証と公開

- コード変更では内容に応じた検証を行う。基本コマンドは `npm test`、`npm run build`、`git diff --check`。
- UI変更ではまず関連局面を確認し、既存のGitHub Actions `Browser UI verification` を利用する。麻雀卓の配置、河、副露、カン、非公開牌ID保護などの既存確認を優先する。
- Codex Cloudでは、実行サンドボックスのseccomp制限によりChromiumのCrashpad初期化中の `setsockopt(SOL_SOCKET, SO_PASSCRED)` が `EPERM` となり、ページを開く前に `SIGTRAP` で終了する既知の制限がある。診断時の実行ファイル・バージョン・起動条件と根拠は [`docs/verification/codex-cloud-chromium.md`](docs/verification/codex-cloud-chromium.md) を参照する。
- この環境ではPlaywrightの `chromium_sandbox=True` を指定し、`--no-sandbox` を使わない最小起動も同じCrashpadエラーで失敗した。安全に使えるCodex Cloud内の起動方法は確認できていない。`--no-sandbox` の追加、Chromiumサンドボックスの無効化、`danger-full-access`、seccompやシステム権限の変更、失敗の握りつぶしは禁止する。
- 既知の同一実行環境ではChromiumを毎回起動せず、単体テスト・TypeScript・ビルドはCodex Cloudで、ブラウザーUI検証は既存のGitHub Actions `Browser UI verification` で行う。新しいブラウザー検証は既存ワークフローに追加する。
- GitHub Actionsの実行結果は対象コミットの実行を確認してから報告する。未実行または結果未確認は「未実施／未確認」とし、成功扱いしない。ブラウザーテスト未実行とActionsでの成功を区別する。
- 同じ起動エラーは再調査しない。Codex Cloudの実行環境・サンドボックスが更新された場合、または新たな正規の安全な起動方法が利用可能になった場合に限り、socketpair確認と単一ページの最小起動で再検証する。
- iPhone Safari実機確認はChromium / GitHub Actionsの結果と分けて扱う。
- GitHub Pagesはbuild成功とdeploy成功を別々に確認する。未確認ならそのように報告する。

## ドキュメント構成と運用

### 文書の役割

- `README.md`：プロジェクト概要、主な機能、起動・テスト方法、文書への入口。
- `docs/SPEC.md`：ソースコードに照合した現在のゲーム仕様の正本。
- `docs/ROADMAP.md`：機能の実装状況と今後の開発候補。
- `docs/development/`：過去のStepごとの開発目的、実装、設計判断、問題、当時の検証結果。
- `docs/verification/`：自動テスト、ブラウザー、公開ページ、実機確認などの結果。
- `docs/screenshots/`：検証画像と関連する画面測定データ。

### 更新ルール

- 新しい機能でゲーム仕様が変わった場合は、ソースを確認して `docs/SPEC.md` を更新する。
- Stepが完了したら `docs/ROADMAP.md` の実装状況を更新する。
- 今後の開発候補は確定した計画と混同せず、状態を `完了`・`一部実装`・`未実装`・`検討中` に分ける。
- 重要な開発経緯は `docs/development/` に記録する。実施日、関連コミット、検証資料が分かる場合はリンクする。
- 実行した検証結果は `docs/verification/` に記録する。自動検証、Chromium、公開後の実機確認を区別し、確認者や報告範囲を明記する。
- `README.md` にStep単位の詳細ログや大量のテスト出力を追加しない。
- 過去の開発記録、検証ログ、スクリーンショットを無断で削除・上書きしない。古い仕様は当時の記録として残し、現在の状態は正本側を更新する。
- 文書は最新ソースと矛盾しないようにする。過去の記録と現在仕様を混ぜず、矛盾があればソースに基づいて現行文書を正す。
- 文書の移動・分割後は相対リンクを確認し、必要な資料へ辿れる状態を保つ。

### Codexの参照ルール

- 通常の実装タスクでは、まず `docs/SPEC.md` と関連ソースを確認する。
- 必要に応じて `docs/ROADMAP.md` と該当するStepの開発記録・検証記録を参照する。
- 作業と関係のない過去の全開発記録を毎回すべて読む必要はない。
- ドキュメントだけを変更するタスクでは、変更内容に必要なソースと既存記録を確認し、ゲームのテスト・ビルドは理由なく再実行しない。

## 作業効率と報告

- 成功済みの同一テストや同じネットワーク診断を理由なく繰り返さない。必要な検証だけ実施する。
- 原因不明の問題を推測で修正せず、テスト条件を安易に緩和しない。
- 完了報告には、作業開始時のHEADとfetch後の `origin/main` SHA、変更ファイル、テスト・ビルド結果と実行できなかった検証、作成したコミットSHA、push先と成功・失敗、push後に確認したリモートSHA、作業ツリーの状態、未解決事項を含める。push成功時はリモート参照を確認し、対象コミットの反映を検証する。
- 完了報告では、関連するGitHub Actionsのブラウザー検証がすべて成功した場合、成功した検証と実行結果を中心に簡潔に報告し、既知のChromium起動制限を毎回詳述しない。ブラウザー検証が未実施・未確認の場合、または新しい失敗が発生した場合は、その状態と理由を明確に報告する。
- 報告では確認した事実、推測、未確認事項、実施できなかった作業を区別する。通信エラー時は失敗コマンド、宛先、失敗段階、通常実行と許可付き実行の結果を示す。
- 詳細な共通手順と障害事例の原本は [`ak-sekine/dev-notes` の `docs/codex-cloud.md`](https://github.com/ak-sekine/dev-notes/blob/main/docs/codex-cloud.md)。このファイルが使えない場合も上記ルールに従う。
