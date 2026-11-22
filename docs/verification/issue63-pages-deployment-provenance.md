# Issue #63 共有 Pages 補助監査

2026-11-22 に Codex が失敗 run、GitHub API、公開台帳を読み取り専用で照合した。

| 対象 | 公開元 SHA | 公開 run |
| --- | --- | --- |
| 本番 | `3c52d17b7c301cb8a4ff5d22fa53bb5594cade94` | [44917709085](https://github.com/ak-sekine/heibon-mahjong/actions/runs/44917709085) |
| 開発 | `c3a6b6c4eeb72c82b8152ea299511df26e49c435` | [44625491003](https://github.com/ak-sekine/heibon-mahjong/actions/runs/44625491003) |

最新共有 deployment `7965544141` は main の公開元 SHA で 2026-11-21 15:42:27 UTC に作成された。最新 status `22804946609` は成功で、[本番 Pages 公開 job](https://github.com/ak-sekine/heibon-mahjong/actions/runs/44917709085/job/136895578247) を指す。先に開発版、後から本番版が公開された。

[失敗監査](https://github.com/ak-sekine/heibon-mahjong/actions/runs/44920763797/job/136896076872) の artifact `14713731628` は snapshot `305479dc1986552246a4fcf67bdbdd3ae487fc41` と照合し、本番・開発ともファイル 16/16 件、本番メタデータ 2 件・開発 1 件、両 Worker の deployment が一致した。唯一の失敗は最新共有 deployment に開発版 SHA を要求する `DEPLOYMENT_SHA_MISMATCH` だった。現行 API と修正前のコードでも同じ来歴エラーを再現した。ローカル環境から Pages 本体へのアクセスにはプロキシ制限があった。

監査は最新 deployment の ref と保存済み SHA を照合する。成功 status の Actions job URL から同一リポジトリの run と job を特定し、run のブランチ・SHA・公開 workflow・成功状態、現在の attempt の Pages job と品質ゲート、deployment の作成時刻を検証する。Worker の検証と両環境のファイル・メタデータ照合を継続し、公開ファイル取得後にリモート参照を再取得する。公開操作を伴わない。
