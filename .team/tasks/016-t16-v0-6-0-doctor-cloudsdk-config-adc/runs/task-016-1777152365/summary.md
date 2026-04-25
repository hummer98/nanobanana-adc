# T16 — v0.6.0 doctor の CLOUDSDK_CONFIG 対応と ADC 探索アルゴリズム正規化

- Task ID: 016
- Branch: `task-016-1777152365/task` → merged into `main`
- Worktree: `/Users/yamamoto/git/nanobanana-adc/.worktrees/task-016-1777152365`
- Phases: Plan → Design Review (2 rounds → Approved) → TDD Impl → Inspection (GO)

## 概要

T15 (v0.5.0) の `resolveAdcSource` を `google-auth-library` の実動作に揃え、`CLOUDSDK_CONFIG` を gcloud 設定 dir 全体の override として doctor の独立セクションで露出する v0.6.0 minor リリース。schema 名 `nanobanana-adc-doctor/v1` は維持。

## 設計判断

- **案 a 採用** (`adcSource.kind` の値集合は v0.5 から不変)。`'default'` の意味を「effective default」に再定義し、内部 `path` のみ動的に変える。`'cloudsdk-config'` kind は v0.6 では runtime で生成しない (型定義は v1 schema 期間中残し v2 で削除予告)
  - **理由**: v0.5 consumer の主要分岐 `if kind === 'default'` を壊さないことが最低コストの後方互換維持。`cloudsdk-config` は v0.5 でも狭い条件下のみ到達するレアパスで、生成停止しても破壊的影響は実質ない
- **text 表記**: 選択肢 C を採用 — `resolved: default (effective default)`。JSON kind と text 表示の語彙を揃えつつ意味を補足
- **新セクション**: `Gcloud config dir` を text + JSON 両方に追加。CLOUDSDK_CONFIG override / OS default の判別はここで行う
- **新 warning**: `CLOUDSDK_CONFIG_OVERRIDE` (severity: info) — `CLOUDSDK_CONFIG` set かつ非空で発火

## 完了したサブタスク

- [x] Phase 1: plan.md (44 KB / 657 lines) — 設計判断・新シグネチャ・テスト計画 10 項目を網羅
- [x] Phase 2: design review 2 往復（初回 Changes Requested → Must fix 3 件 (M1 text 表記裁定 / M2 GAC+CLOUDSDK_CONFIG 同時 set warning assert / M3 plan.json L3 既存 version) を反映 → Approved）
- [x] Phase 3: TDD 実装 (test-first → green → docs → version 同期 4 箇所)
- [x] Phase 4: inspection.md GO 判定（122 tests pass / tsc 0 errors / secrets masking regression 維持）
- [x] 完了処理: artifact 登録、commit、main rebase、ローカル ff-only merge、worktree 削除、close-task

## 変更ファイル

| File | + | − | 役割 |
|---|---|---|---|
| `src/doctor.ts` | +281 | −46 | resolveAdcSource アルゴリズム正規化、resolveGcloudConfigDir 新規、`CLOUDSDK_CONFIG_OVERRIDE` warning、text renderer 拡張、JSON `gcloudConfigDir` 出力 |
| `src/doctor.test.ts` | +469 | −10 | CLOUDSDK_CONFIG 4 ケース・leak canary regression・JSON parse・新 warning 発火・defaultLocation === effectiveDefault 同値性 |
| `README.md` / `README.ja.md` | +109 / +57 | −9 / −9 | doctor 出力例更新、warning 表に `CLOUDSDK_CONFIG_OVERRIDE` 追記、migration note |
| `CHANGELOG.md` | +63 | 0 | `[0.6.0]` Changed/Added/Notes |
| `package.json` / `.claude-plugin/plugin.json` / `.claude-plugin/marketplace.json` / `src/cli.ts` | — | — | バージョン 4 箇所同期 (0.5.0 → 0.6.0) |
| `package-lock.json` | +2 | −2 | version bump 反映 |

合計: **10 files / +950 / −66 lines**

## テスト結果

- `bun test`: **122 pass / 0 fail** (across 3 files, 575ms)
- `bunx tsc --noEmit`: **exit 0** (型エラー 0)
- secrets masking regression (`refresh_token` / `private_key` / `private_key_id` leak canary): **維持**

## バージョン同期

```
package.json:                "version": "0.6.0"
.claude-plugin/plugin.json:  "version": "0.6.0"
.claude-plugin/marketplace.json: "version": "0.6.0"
src/cli.ts CLI_VERSION:      const CLI_VERSION = '0.6.0';
src/cli.ts .version():       .version('0.6.0');
```

CI `validate-plugin` ジョブが要求する 4 箇所の同期を確認。

## 動作確認 4 パターン

`runs/task-016-1777152365/manual-runs/` に保存:

- **a-default.txt** — CLOUDSDK_CONFIG unset → Gcloud config dir source=default、CLOUDSDK_CONFIG_OVERRIDE 非発火
- **b-empty-cloudsdk.txt** — `CLOUDSDK_CONFIG=/tmp/empty-gcloud-dir` → presence で各ファイル "missing"、override warning 発火
- **c-kdg-cloudsdk.txt** — `CLOUDSDK_CONFIG=$HOME/git/KDG-lab/.config/gcloud` → effective default が KDG-lab 配下、override warning、ADC type/quota が KDG-lab JSON のもの
- **d-json-full.txt / d-json-extract.txt** — `nanobanana-adc doctor --json` で `gcloudConfigDir` と `adcSource` 両方を `jq` で確認

## 納品

- 納品方式: ローカル ff-only merge into `main`
- マージコミット: 後段で記録

## 残課題・将来タスク（スコープ外）

- gcloud configurations 列挙（gcloud topic configurations の薄い再実装になる）
- `credentials.db` / `access_tokens.db` の deep parse
- `effective quota`（`GOOGLE_CLOUD_QUOTA_PROJECT` env を考慮した課金先計算）— v0.7.0 候補
- リリース作業（`/release 0.6.0`）— 別タスク
