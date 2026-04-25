# タスク割り当て

## タスク内容

---
id: 016
title: T16: v0.6.0 — doctor の CLOUDSDK_CONFIG 対応と ADC 探索アルゴリズム正規化
priority: medium
created_by: surface:105
created_at: 2026-04-25T21:05:11.161Z
---

## タスク
T15 で追加した `resolveAdcSource` は `google-auth-library` の実際の動作と差があり、`CLOUDSDK_CONFIG` が set されているケースで誤誘導表示になる。これを正しいアルゴリズムに揃え、`CLOUDSDK_CONFIG` を gcloud 設定 dir 全体の override として doctor の独立セクションで見せる。v0.6.0 (minor) として切る前提。

## 背景
T15 (v0.5.0) の `resolveAdcSource` は kind を `env` / `cloudsdk-config` / `default` / `metadata-server` / `unknown` の 5 値としているが、実態として `cloudsdk-config` と `default` は **排他** であって並列ではない:

- `google-auth-library` (および python-genai / 他の SDK) は ADC を解決するとき、`CLOUDSDK_CONFIG` が set されているなら **`$CLOUDSDK_CONFIG/application_default_credentials.json`** を見る
- set されていないときに限って **`$HOME/.config/gcloud/application_default_credentials.json`**（OS default）を見る
- つまり「OS default」と「CLOUDSDK_CONFIG path」は **同じスロットの異なる値**であって、両方が候補として並ぶことはない

現状の v0.5.0 doctor 出力例:

```
ADC source
  resolved:                         default
  env GOOGLE_APPLICATION_CREDENTIALS: (unset)
  default location:                 /home/user/.config/gcloud/application_default_credentials.json   (exists, ...)
  CLOUDSDK_CONFIG path:             (unset)
  ...
```

これは `CLOUDSDK_CONFIG` が set されているとき**両方が `(exists)` として表示されうる**設計で、shadow 関係が見えない。さらに `CLOUDSDK_CONFIG` は ADC だけでなく gcloud 設定 dir 全体（`active_config` / `configurations/` / `credentials.db` / `access_tokens.db` / project ごとの `*_configs.db` / `legacy_credentials/`）を移動させる副作用の大きい env なのに、ADC source 内に埋もれていて存在感が薄い。

## 受け入れ基準

### 1. `resolveAdcSource` のアルゴリズム修正
- [ ] `cloudsdk-config` と `default` の 2 つを `effective-default` という 1 つの kind に統合（または `default` の意味を「effective default」に再定義し、内部 path だけ動的に変える）
- [ ] effective default path の決定ロジック:
  - `CLOUDSDK_CONFIG` が set かつ非空 → `$CLOUDSDK_CONFIG/application_default_credentials.json`
  - そうでなければ `$HOME/.config/gcloud/application_default_credentials.json`（Unix）/ `$APPDATA/gcloud/application_default_credentials.json`（Windows）
- [ ] 解決順序は次に統一: `env` (GOOGLE_APPLICATION_CREDENTIALS) → `effective-default` → `metadata-server` (heuristic) → `unknown`
- [ ] 旧 `cloudsdk-config` を別 kind として残す場合でも、**OS default と同時に表示される状態は無くす**

### 2. JSON schema の後方互換
- [ ] `nanobanana-adc-doctor/v1` schema 名は維持。フィールド追加 / 値の意味再定義は OK だが、既存フィールド名の削除は不可
- [ ] `adcSource.kind` の値変更を行う場合:
  - 案 a (推奨): `default` の意味を「effective default」に再定義し、内部 `path` だけ動的に変わるようにする（kind 値は不変）。`cloudsdk-config` kind は v1 では deprecated として残し v2 で削除
  - 案 b: 新 kind `effective-default` を追加、`default` / `cloudsdk-config` を deprecated に
  - 実装者が選んで summary.md に決定根拠を記載
- [ ] 既存の `cloudsdk-config` を生成しないように切り替える場合、deprecation 期間として v0.6.x では旧値を出さず新値のみ。v0.5 までの consumer 向けは README に migration note

### 3. `Gcloud config dir` 独立セクションの新設
- [ ] doctor の text 出力に top-level セクションを追加。例:
  ```
  Gcloud config dir
    resolved:                       /Users/yamamoto/git/KDG-lab/.config/gcloud
    source:                         env CLOUDSDK_CONFIG
    presence:
      active_config:                exists
      configurations/:              exists (3 entries)
      credentials.db:               exists
      application_default_credentials.json:  exists
    note:                           overrides $HOME/.config/gcloud entirely; gcloud auth list / configurations / ADC are isolated from the OS default
  ```
- [ ] CLOUDSDK_CONFIG が unset のときは `source: default ($HOME/.config/gcloud)` として表示。note は省略
- [ ] presence 表示は best-effort（読み取り権限がないファイルは `unreadable` 扱い、エラーで落とさない）
- [ ] JSON 出力にも対応する `gcloudConfigDir` オブジェクトを追加（camelCase 統一）

### 4. ADC source セクションの簡素化
- [ ] `default location` と `CLOUDSDK_CONFIG path` の 2 行を削除し、`effectiveDefault` 1 行に集約:
  ```
  ADC source
    resolved:                       effective-default   (env GOOGLE_APPLICATION_CREDENTIALS unset)
    env GOOGLE_APPLICATION_CREDENTIALS: (unset)
    effective default:              /Users/yamamoto/git/KDG-lab/.config/gcloud/application_default_credentials.json   (exists, 403 B, 2026-04-08T15:30:19Z)
    metadata server:                not probed (no GCE/Cloud Run env detected)
    type:                           authorized_user
    quotaProjectId:                 gen-lang-client-0451899685
    clientId:                       764086051850-...
    account:                        rr.yamamoto@gmail.com
  ```
- [ ] effective default の path が CLOUDSDK_CONFIG override の結果か OS default かは、`Gcloud config dir` セクションで判別できるので ADC source 側では明示しない（duplicated になる）

### 5. 新 warning
- [ ] `CLOUDSDK_CONFIG_OVERRIDE` (severity: `info`):
  - `CLOUDSDK_CONFIG` が set かつ非空のときに発火
  - 文言例: `` gcloud config directory is overridden to `<path>` via CLOUDSDK_CONFIG; gcloud auth / configurations / ADC are isolated from $HOME/.config/gcloud ``
  - 既存の `ADC_FILE_MISSING` などが effective default のパス missing でも引き続き正しく発火すること
- [ ] T15 の既存 warning（`ADC_QUOTA_PROJECT_MISMATCH` / `ADC_FILE_MISSING` / `ADC_TYPE_UNUSUAL` / `GEMINI_API_KEY_SHADOWS_ADC` 等）はすべて維持

### 6. テスト
- [ ] `CLOUDSDK_CONFIG` set + その path に ADC 存在 → resolved=effective-default で path が CLOUDSDK_CONFIG 配下、`CLOUDSDK_CONFIG_OVERRIDE` warning 発火
- [ ] `CLOUDSDK_CONFIG` set + path に ADC 不在 → resolved=`unknown` or `effective-default with missing file`、`ADC_FILE_MISSING` 系の warning が出るかは仕様判断
- [ ] `CLOUDSDK_CONFIG` unset → 従来通り OS default location
- [ ] `GOOGLE_APPLICATION_CREDENTIALS` set + `CLOUDSDK_CONFIG` set → env が勝つ（resolved=`env`）。`CLOUDSDK_CONFIG_OVERRIDE` warning は引き続き発火
- [ ] T15 の secrets leak canary regression が維持されること
- [ ] JSON schema の `gcloudConfigDir` フィールドが parse 可能、`adcSource` 既存 consumer への影響を確認

### 7. ドキュメント
- [ ] README.md / README.ja.md の doctor 出力例を更新（新 `Gcloud config dir` セクションと簡素化された `ADC source` を反映）
- [ ] warning 表に `CLOUDSDK_CONFIG_OVERRIDE` を追加（README.ja.md の対訳表も）
- [ ] CHANGELOG `[0.6.0]`:
  - Changed: ADC source resolution algorithm aligned with google-auth-library; `cloudsdk-config` kind の取り扱い変更（具体は実装の選択次第）
  - Added: `Gcloud config dir` section (text), `gcloudConfigDir` (JSON), `CLOUDSDK_CONFIG_OVERRIDE` warning
  - Notes: schema migration / consumer impact

### 8. バージョン
- [ ] `package.json` / `.claude-plugin/plugin.json` / `.claude-plugin/marketplace.json` / `src/cli.ts` の 4 箇所を `0.6.0` に揃える

### 9. 動作確認
- [ ] 4 パターンを summary.md に貼る:
  - a. 通常（CLOUDSDK_CONFIG unset）→ Gcloud config dir source=default、CLOUDSDK_CONFIG_OVERRIDE 非発火
  - b. `CLOUDSDK_CONFIG=/tmp/empty-gcloud-dir nanobanana-adc doctor`（空 dir）→ presence で各ファイル "missing"、override warning
  - c. `CLOUDSDK_CONFIG=$HOME/git/KDG-lab/.config/gcloud nanobanana-adc doctor` → effective default が KDG-lab 配下、override warning、ADC type/quota が KDG-lab JSON のもの
  - d. `nanobanana-adc doctor --json` で `gcloudConfigDir` と `adcSource` 両方を `jq` で確認

## スコープ外
- gcloud configurations の個別表示（configurations 名の列挙など）— gcloud topic configurations の薄い再実装になるので保留
- `credentials.db` / `access_tokens.db` の deep parse（SQLite を開く必要、scope 外）
- リリース作業（`/release 0.6.0`）— T16 完了後、別途
- doctor の `effective quota`（`GOOGLE_CLOUD_QUOTA_PROJECT` env を考慮した課金先計算）— 別タスクで検討（v0.7.0 候補）

## 参考
- `src/doctor.ts` — 既存の `resolveAdcSource` の修正対象
- `google-auth-library` の ADC resolution: https://github.com/googleapis/google-auth-library-nodejs/blob/main/src/auth/googleauth.ts
- gcloud topic configurations: `CLOUDSDK_CONFIG` で gcloud 設定 dir 全体が移動する仕様
- T15 の summary.md / CHANGELOG `[0.5.0]` — 拡張ベース

## 注意
- T15 の secrets masking ルール（`refresh_token` / `private_key` / `private_key_id` を絶対に出さない、leak canary regression）を厳守
- gcloud が PATH に居ない / `CLOUDSDK_CONFIG` が指す dir が存在しない / 読めない、いずれのケースでも doctor は exit 0
- `presence` 表示は best-effort で、stat に失敗した場合は `unreadable` などで明示し、panic させない
- CI の `validate-plugin` ジョブが v0.6.0 への 4 箇所 version 同期を要求するので注意


## 作業ディレクトリ

すべての作業は git worktree `/Users/yamamoto/git/nanobanana-adc/.worktrees/task-016-1777152365` 内で行う。
```bash
cd /Users/yamamoto/git/nanobanana-adc/.worktrees/task-016-1777152365
```
main ブランチに直接変更を加えてはならない。

ブランチ名: `task-016-1777152365/task`

## 作業開始前の確認（ブートストラップ）

worktree は tracked files のみ含む。作業開始前に以下を確認すること:
- `package.json` があれば `npm install` を実行
- `.gitignore` に記載されたランタイムディレクトリ（`node_modules/`, `dist/`, `workspace/` 等）の有無を確認し、必要なら再構築
- `.envrc` や環境変数の設定

## 出力ディレクトリ

```
/Users/yamamoto/git/nanobanana-adc/.team/tasks/016-t16-v0-6-0-doctor-cloudsdk-config-adc/runs/task-016-1777152365
```

結果サマリーは `/Users/yamamoto/git/nanobanana-adc/.team/tasks/016-t16-v0-6-0-doctor-cloudsdk-config-adc/runs/task-016-1777152365/summary.md` に書き出す。

## マージ先ブランチ

このタスクの成果は `main` にマージすること。
納品方法（ローカルマージ or PR）は conductor-role.md の完了時の処理に従う。

## 完了通知

完了処理は `conductor-role.md` の「完了時の処理」（Step 1〜12）に従う。特に:
- Step 11: `cmux-team close-task --task-id <TASK_ID> --deliverable-kind <files|merged|pr|none> ... --journal "..."` がタスクを close し、内部で daemon に CONDUCTOR_DONE を送信する。**`--deliverable-kind` は必須**で Step 9 の納品方式と対応付ける（merged / pr / files / none）。詳細は `conductor-role.md` Step 11 を参照
- Step 12: 完了レポートをセッション上に表示する

**`cmux-team send CONDUCTOR_DONE --success true` を自分で呼び出さない** — close-task がその役割を果たす。rebase 衝突等で close-task を呼ばず abort したい場合のみ `conductor-role.md` Step 8 の `--success false` 経路を使う。
