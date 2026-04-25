# タスク割り当て

## タスク内容

---
id: 015
title: T15: v0.5.0 — doctor の ADC source 解決と quota project mismatch 検出
priority: medium
created_by: surface:105
created_at: 2026-04-25T19:39:20.821Z
---

## タスク
T14 で追加した `nanobanana-adc doctor` を拡張し、ADC が**実際にどのファイル / 経路から credential を読んでいるか**を表示する。さらに `quota_project_id` が `GOOGLE_CLOUD_PROJECT` と食い違うケースを warning として検出する。v0.5.0 (minor) として切る前提。

## 背景
v0.4.0 の doctor は ADC 経由の `getAccessToken()` を probe して ok/fail と project (= GOOGLE_CLOUD_PROJECT) を出すだけで、credential の**出どころ**は表示しない。

実環境で気付いた問題:

- `~/.config/gcloud/application_default_credentials.json` の `quota_project_id` が `kdg-context` で、`GOOGLE_CLOUD_PROJECT` の `gen-lang-client-0451899685` と乖離していた。**API 操作は前者、課金は後者**という分かりにくい状態を doctor が見せられない
- どのアカウント (`rr.yamamoto@gmail.com`) のリフレッシュトークンが効いているか doctor から読み取れない
- `GOOGLE_APPLICATION_CREDENTIALS` を別パスに向けても doctor 出力では区別が付かない

## ADC resolution の実態（実装方針の参考）
`google-auth-library` は以下の順で credential を解決:

1. `GOOGLE_APPLICATION_CREDENTIALS` 環境変数（任意のパス）
2. default location: Unix では `$HOME/.config/gcloud/application_default_credentials.json` / Windows では `$APPDATA\gcloud\application_default_credentials.json`
3. gcloud configurations 配下（`CLOUDSDK_CONFIG` env で再配置可能）
4. GCE / Cloud Run / GKE / Cloud Build の **metadata server**（ネットワーク経由、ファイルなし）
5. Workload Identity Federation（外部 IdP との token 交換、設定 JSON 経由）
6. service account impersonation chain

doctor からは 1–3 はファイルパスとして確実に拾える。4 以降は heuristic か "unknown" 扱いで OK。

## 受け入れ基準

### 1. ADC source の解決と表示
- [ ] `src/doctor.ts` に `resolveAdcSource()` 関数を追加し、上記 1–3 を順にチェックして resolved path を返す
- [ ] doctor の出力に `ADC source` セクションを追加。例:
  ```
  ADC source
    env GOOGLE_APPLICATION_CREDENTIALS:  (unset)
    default location:                    /Users/.../application_default_credentials.json  (exists, 388B, mtime 2026-04-26)
    resolved:                            default location
    type:                                authorized_user
    quota_project_id:                    kdg-context
    account:                             rr.yamamoto@gmail.com   (resolved via `gcloud auth list`)
  ```
- [ ] resolved の値は `env`（GOOGLE_APPLICATION_CREDENTIALS から）/ `default`（default location から）/ `cloudsdk-config`（CLOUDSDK_CONFIG 経由） / `metadata-server`（heuristic 検出）/ `unknown` のいずれか
- [ ] JSON 出力（`--json`）にも同じ情報を載せる

### 2. metadata server の heuristic 検出
ネットワーク呼び出しを避けつつ判定する:
- [ ] 環境変数 `K_SERVICE` (Cloud Run) / `GAE_APPLICATION` (App Engine) / `KUBERNETES_SERVICE_HOST` (GKE) / `CLOUD_BUILD_BUILDID` などが set されているかで判定
- [ ] あるいは `--probe-metadata-server` flag を opt-in にして、明示時のみ `169.254.169.254` に短いタイムアウト (300ms 程度) で接続を試す
- [ ] macOS / Linux desktop ではデフォルトで probe **しない**（無駄なネットワーク要求を避ける）。doctor 出力では `metadata server: not probed (no GCE/Cloud Run env detected)` のように明示

### 3. ADC JSON のメタ情報抽出（マスキング厳守）
解決したファイルが読める場合のみ:
- [ ] `type` を読み取って表示。想定値: `authorized_user` / `service_account` / `external_account` / `impersonated_service_account`
- [ ] `quota_project_id` を表示（public な project ID なのでマスク不要）
- [ ] `client_id` は表示してよい（OAuth public client ID）。**ただし `private_key` / `refresh_token` / `private_key_id` は絶対に出力しない**
- [ ] service account の場合は `client_email` を表示（誰として認証するか分かる）

### 4. account の resolution
- [ ] `gcloud auth list --filter='status:ACTIVE' --format='value(account)'` を best-effort で呼んで active account を取得
- [ ] gcloud が PATH に無いか、コマンドが失敗したら `account: <unresolved (gcloud not available)>` 等で正直に表示
- [ ] gcloud 呼び出しは sandbox / 機密性に配慮（standard error は捨てる）

### 5. 新しい warning
T14 の既存 7 warning は維持しつつ追加:
- [ ] `ADC_QUOTA_PROJECT_MISMATCH`: ADC JSON の `quota_project_id` が set されていて、かつ `GOOGLE_CLOUD_PROJECT` env と異なる場合に warning
  - 提案文: `` `gcloud auth application-default set-quota-project ${GOOGLE_CLOUD_PROJECT}` で quota_project を揃えると課金先と操作先が一致します ``
- [ ] `ADC_FILE_MISSING`: `GOOGLE_APPLICATION_CREDENTIALS` が set されているがファイルが存在しない場合（T14 で既にあるか確認、無ければ追加）
- [ ] `ADC_TYPE_UNUSUAL`: `type` が `authorized_user` / `service_account` / `external_account` / `impersonated_service_account` 以外（informational）

### 6. JSON schema
- [ ] `--json` 出力に `adc_source` セクションを追加。下位フィールドは上記を機械可読に表現
- [ ] 既存 JSON フィールドを破壊しない（後方互換）

### 7. テスト
- [ ] `resolveAdcSource()` の unit test:
  - GOOGLE_APPLICATION_CREDENTIALS が set + ファイル存在
  - GOOGLE_APPLICATION_CREDENTIALS set + ファイル不在 → `ADC_FILE_MISSING` warning
  - default location が存在
  - default location も無い + Cloud Run env もない → resolved=`unknown`
  - K_SERVICE set → resolved=`metadata-server`
- [ ] `ADC_QUOTA_PROJECT_MISMATCH` warning の発火/非発火テスト
- [ ] ADC JSON の `type` 別パース（authorized_user / service_account / external_account）
- [ ] gcloud が unavailable な環境のフォールバック挙動
- [ ] `--json` で新フィールドが含まれる検証
- [ ] T14 の既存テストが破壊されていないこと

### 8. masking / privacy
- [ ] `refresh_token` / `private_key` / `private_key_id` を**絶対に出力しない**
- [ ] `--verbose` でも上記は出さない（access token の prefix 8 文字のみは継続して OK）
- [ ] doctor 実装内でこれらのキーを読んだメモリは即座に解放（過度な気遣いだが意識して書く）

### 9. ドキュメント
- [ ] README.md / README.ja.md に doctor の新出力例を追加（特に `ADC source` セクションと `ADC_QUOTA_PROJECT_MISMATCH` warning の例）
- [ ] CHANGELOG に `[0.5.0]` を追加
- [ ] CLAUDE.md の "ファイル責務" 表は doctor.ts のままでよい（拡張だけなので）

### 10. バージョン
- [ ] `package.json` / `.claude-plugin/plugin.json` / `.claude-plugin/marketplace.json` / `src/cli.ts` の version を `0.5.0` に揃える（CI の validate-plugin ジョブが通ること）

### 11. 動作確認
- [ ] 実環境で `nanobanana-adc doctor` を 4 パターンで実行し summary に貼る:
  - a. 現在の環境（quota_project=kdg-context、GOOGLE_CLOUD_PROJECT=gen-lang-client-...）→ `ADC_QUOTA_PROJECT_MISMATCH` warning が出る
  - b. `gcloud auth application-default set-quota-project gen-lang-client-0451899685` 実行後 → mismatch 解消、warning 消滅
  - c. `GOOGLE_APPLICATION_CREDENTIALS=/tmp/nonexistent.json nanobanana-adc doctor` → `ADC_FILE_MISSING` warning
  - d. `nanobanana-adc doctor --json | jq .adc_source` → JSON parse 可能、フィールドが想定通り
- [ ] パターン b で実機ファイルを書き換えるのが嫌なら mock test で代替可。実機で b を実行するかは実装者判断（summary に明記）

## スコープ外
- Workload Identity Federation の詳細解析（external_account の token-source URL 等の deep parse）
- service account impersonation chain の追跡
- リリース作業（`/release 0.5.0`）— T15 完了後、別途
- Claude Code plugin 側の状態診断は引き続き対象外

## 参考
- `src/doctor.ts` — 既存の doctor 実装（拡張起点）
- `src/auth.ts` — 認証優先順位
- google-auth-library の README にある ADC resolution 順序
- Google Cloud docs:
  - Application Default Credentials: https://cloud.google.com/docs/authentication/application-default-credentials
  - quota project: https://cloud.google.com/docs/authentication/troubleshoot-adc#user-creds-without-quota-project

## 注意
- `.npmrc` の `save-exact=true` / `ignore-scripts=true` に整合する dependency のみ追加可
- gcloud コマンドの呼び出しは optional（ない環境でも doctor は動くこと）
- ADC JSON の任意フィールドを読むときは未知 type に備える（panic させない）
- CI の `validate-plugin` ジョブが v0.5.0 への 4 箇所同期を要求するので version bump 漏れに注意


## 作業ディレクトリ

すべての作業は git worktree `/Users/yamamoto/git/nanobanana-adc/.worktrees/task-015-1777147332` 内で行う。
```bash
cd /Users/yamamoto/git/nanobanana-adc/.worktrees/task-015-1777147332
```
main ブランチに直接変更を加えてはならない。

ブランチ名: `task-015-1777147332/task`

## 作業開始前の確認（ブートストラップ）

worktree は tracked files のみ含む。作業開始前に以下を確認すること:
- `package.json` があれば `npm install` を実行
- `.gitignore` に記載されたランタイムディレクトリ（`node_modules/`, `dist/`, `workspace/` 等）の有無を確認し、必要なら再構築
- `.envrc` や環境変数の設定

## 出力ディレクトリ

```
/Users/yamamoto/git/nanobanana-adc/.team/tasks/015-t15-v0-5-0-doctor-adc-source-quota-project-mismatch/runs/task-015-1777147332
```

結果サマリーは `/Users/yamamoto/git/nanobanana-adc/.team/tasks/015-t15-v0-5-0-doctor-adc-source-quota-project-mismatch/runs/task-015-1777147332/summary.md` に書き出す。

## マージ先ブランチ

このタスクの成果は `main` にマージすること。
納品方法（ローカルマージ or PR）は conductor-role.md の完了時の処理に従う。

## 完了通知

完了処理は `conductor-role.md` の「完了時の処理」（Step 1〜12）に従う。特に:
- Step 11: `cmux-team close-task --task-id <TASK_ID> --deliverable-kind <files|merged|pr|none> ... --journal "..."` がタスクを close し、内部で daemon に CONDUCTOR_DONE を送信する。**`--deliverable-kind` は必須**で Step 9 の納品方式と対応付ける（merged / pr / files / none）。詳細は `conductor-role.md` Step 11 を参照
- Step 12: 完了レポートをセッション上に表示する

**`cmux-team send CONDUCTOR_DONE --success true` を自分で呼び出さない** — close-task がその役割を果たす。rebase 衝突等で close-task を呼ばず abort したい場合のみ `conductor-role.md` Step 8 の `--success false` 経路を使う。
