# Heibon Mahjong: Codex 作業指示

## プロジェクト

- Heibon Mahjong は TypeScript / Vite による Web 麻雀ゲームで、GitHub Pages で公開する。
- ゲームロジックと描画処理を分離する。非公開牌の物理 ID や牌種を DOM に漏洩させない。
- iPhone Safari での表示を重視する。Chromium の検証結果を iPhone Safari 実機での検証結果と混同しない。

## タスク開始時

- 対象リポジトリと作業ディレクトリを確認し、`git status --short --branch`、`git rev-parse HEAD`、必要に応じてブランチとリモートを確認する。
- 未コミット変更を保護する。既存の作業ブランチ、履歴、変更を無断で破棄しない。
- 最新 main が必要なら実際のリモートを確認する（例：`git ls-remote origin refs/heads/main`）。ローカルの `origin/main` は古い場合があるため、最新と決めつけない。

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
- push後は可能な範囲でリモートSHAを確認する。mainへの反映はタスクで許可されている場合のみ行う。

## 検証と公開

- コード変更では内容に応じた検証を行う。基本コマンドは `npm test`、`npm run build`、`git diff --check`。
- UI変更ではまず関連局面を確認し、既存のGitHub Actions `Browser UI verification` を利用する。麻雀卓の配置、河、副露、カン、非公開牌ID保護などの既存確認を優先する。
- Codex CloudでChromiumを起動できないとき、同じ起動失敗の調査を繰り返さず既存Actionsによる検証を優先する。
- GitHub Pagesはbuild成功とdeploy成功を別々に確認する。未確認ならそのように報告する。

## 作業効率と報告

- 成功済みの同一テストや同じネットワーク診断を理由なく繰り返さない。必要な検証だけ実施する。
- 原因不明の問題を推測で修正せず、テスト条件を安易に緩和しない。
- 報告では確認した事実、推測、未確認事項、実施できなかった作業を区別する。通信エラー時は失敗コマンド、宛先、失敗段階、通常実行と許可付き実行の結果を示す。
- 詳細な共通手順と障害事例の原本は [`ak-sekine/dev-notes` の `docs/codex-cloud.md`](https://github.com/ak-sekine/dev-notes/blob/main/docs/codex-cloud.md)。このファイルが使えない場合も上記ルールに従う。
