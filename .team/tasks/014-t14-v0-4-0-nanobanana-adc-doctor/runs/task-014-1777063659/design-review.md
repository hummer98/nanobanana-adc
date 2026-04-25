# T14 Design Review (rev 2) — `nanobanana-adc doctor` (v0.4.0)

reviewer: Design Reviewer Agent (独立セッション, 2 往復目)
review 対象: `.team/tasks/014-t14-v0-4-0-nanobanana-adc-doctor/runs/task-014-1777063659/plan.md` (改訂版 rev 2, 808 行)
作成日: 2026-04-25
worktree: `/Users/yamamoto/git/nanobanana-adc/.worktrees/task-014-1777063659`

---

## 総評

rev 1 で出した 6 件の Recommendations は **いずれも plan 内で妥当に反映** されており、Optional 9 件も概ね取り込まれています。特に R1（事実誤認）と R2（account/project 欠落）は受け入れ基準に直結する blocker だったので、鮮明に訂正・追加されたのが大きい。§2.3 の `defaultAdcProbe` 疑似コード、§4.1 型スキーマ、§7.1 テストが三者整合していて、Implementer が読み進めて迷うポイントは残っていません。

付録 C に rev 1 blocker / Optional の反映先対応表が付いているのも、Implementer と監査者の双方にとって追跡性が高く好ましい。

事実確認として `node -p "require('./.claude-plugin/plugin.json').version"` を実行し `0.3.0` を確認 — R1 が主張する「plugin.json には既に version field がある」は正しい。

判定を以下に記します。

---

## R1–R6 反映確認

### R1 ✓ `.claude-plugin/plugin.json` version field の事実誤認訂正

- 旧 §9.6（事実誤認の段落）は **削除**。新 §9.6 は metadata server 副作用に置き換え（Optional E1 の反映を兼ねる）
- §3.2 の該当行を `"version": "0.3.0" → "0.4.0"` に訂正し、括弧書きで「既に version フィールドは存在する。新規追加ではない」と明示
- §10.1 の現在値も `フィールド欠如` → `"version": "0.3.0"` に訂正、末尾に「前回 plan の §9.6 は事実誤認であり、本 rev で削除済み」と自己言及
- 付録 C #1 にも反映先が記録されている
- 事実確認: `.claude-plugin/plugin.json.version === "0.3.0"` を手元で検証（一致）

→ **反映 OK**。

### R2 ✓ ADC probe に `account` / `project` を追加

- §2.2 `AdcProbeResult` に `account?: string` / `project?: string` を追加
- §2.2 `DoctorOptions` に `gcloudAccountFetcher` / `gcloudProjectFetcher` / `gcloudAdcFilePathFetcher` の注入点を追加（DI 可能）
- §2.3 `defaultAdcProbe` 内で `client.getCredentials()` から `client_email` or `principal`、`auth.getProjectId()` → `GOOGLE_CLOUD_PROJECT` fallback の順で取得、各 try/catch で **fail-open**
- §4.1 `DoctorReport.adc` に `account?` / `project?` field 追加、snapshot 例 (§4.2) にも `"account": "user@example.com"` / `"project": "my-gcp-proj"` が入っている
- §7.1 test 19 (gcloud あり相当) / test 20 (gcloud なし相当、`ok: true` 維持) の 2 ケース追加
- §1.2 checklist にも「ADC 成功時は `adc.account` と `adc.project` が report に載る（取得できた場合のみ。fail-open）」が追加

→ **反映 OK**。

### R3 ✓ `--verbose` 専用 field ブロックの型への明記

- §4.1 `DoctorReport.verbose?` optional block として `tokenPrefix` / `gcloudAccount` / `gcloudProject` / `gcloudAdcFilePath` / `nodeVersion` / `platform` を列挙
- 「`DoctorOptions.verbose === false` のとき `report.verbose` は `undefined`（JSON では key ごと省略）」運用を §4.1 末尾で明示
- §1.2 checklist に verbose block 追加を反映
- 情報漏洩リスク（他テナント email）への注意書き、README / summary への記載方針を §4.1 末尾に明記
- §7.1 test 17 で「verbose: true → `report.verbose` が定義される」、test 18 で「verbose: false → undefined」を検証

→ **反映 OK**。

### R4 ✓ `CLI_VERSION_STALE` / `npm view` の v0.4.0 不採用決定

- §1.3 スコープ外に明記
- §5.1 判定表は 7 件に整理され、`CLI_VERSION_STALE` は削除
- §5.1 決定事項で「v0.4.0 では実装しない」と明記
- §9.3 で不採用の 4 つの理由（YAGNI / offline UX / diff 肥大 / 別レイヤの責務）を列挙
- CHANGELOG Notes に「v0.5.0 以降の拡張ポイントとして記す」指示

→ **反映 OK**。

### R5 ✓ ADC probe timeout の resource leak 対策

- §9.1 で **選択肢 a（`setTimeout().unref()`）を採用決定** として明記。選択理由（依存なし・実装簡単・SDK 非依存）を書き下している
- §2.3 `defaultAdcProbe` の実装コードに `timeoutHandle.unref()` が入っている（`AbortController` + `setTimeout(…, 5000)` + `timeoutHandle.unref()` の構成）
- `finally { clearTimeout(timeoutHandle); }` で本体完了時の掃除も入っている
- §7.1 test 21 で timeout ケースを fake probe で検証（`report.adc.error.includes('timeout')`）

→ **反映 OK**。実装側で `AbortController` も併用している（signal 付与 + abort 検知）のは念押しとして良い。

### R6 ✓ precedence 整合性 integration test

- §2.3 末尾に方針を明示:「同一 env を両関数に与え、`resolveAuth().mode` と `resolveAuthRoute(env).selected` が一致」を確認、ADC 経路は除外、api-key-flag / api-key-env の 2 パターンに絞る
- §7.1 test 30 として具体的な assert を記載（`resolveAuth({apiKeyFlag: 'X', ...}).mode === 'api-key'` と `resolveAuthRoute(env, 'X').selected === 'api-key-flag'` 等）
- §7.2 step 8 に「precedence 整合性 test 30 を最後に足す（`auth.ts` の import が必要なため）」を明記

→ **反映 OK**。

---

## Optional 反映状況

付録 C に反映先が表で整理されている。すべて取り込まれていることを spot-check で確認:

| Optional | 反映の所在 | 状態 |
|---------|-----------|------|
| A2-1 GEMINI_API_KEY 単独時の warning 非発火理由 | §5.1 決定事項 3 項目目 | ✓ |
| A2-2 summary.md パス | §1.2 checklist / §10.3 | ✓（両方とも `.team/tasks/.../summary.md` を明記） |
| C3 `classifyInstallMethod('')` | §6 `if (!argv1) return 'unknown'` ガード、§7.1 test 7 に `''` ケース併記 | ✓ |
| C7 `nowMs` 固定 inject | §7.1 冒頭「テスト共通規約」で「全テストで `opts.nowMs = () => 0` を必ず渡す」と明記 | ✓ |
| D1 adcProbe throw 耐性 | §7.1 test 22（`() => { throw new Error('boom') }` → `report.adc.ok === false`, `error === 'boom'`） | ✓ |
| D4 各 e2e で `--json \| jq -e .` | §8 冒頭「共通」、§8.1/8.2/8.3 全てに追加 | ✓ |
| E1 metadata server 副作用 note | §9.6（新）として独立節を立てた | ✓ |
| F-1 `computeWarnings` 関数分割 | §7.2 step 4 で `warnNoAuth` ... `warnApiKeyFormatSuspect` の 7 個の純関数に分割、各 `DoctorWarning \| null` を返す方針 | ✓ |
| G-1 `claude plugin validate .` | §10.3 で「CI に委ねる」と宣言 | ✓ |

---

## 新規 blocker

**なし。**

細かく読んで、実装者が plan を開いて迷う箇所 / 致命的な不整合が残っていないかを重点チェックしましたが、blocker 相当の指摘は見つかりませんでした。以下は **参考情報（optional 扱い、Approved を妨げない）** として Implementer 判断で取り込めば良い nit 類のみ。

### 参考（optional、実装中に判断）

- §2.3 の `defaultAdcProbe` 実装コード中、`AbortController` を作って `controller.abort()` を 5s 後に呼ぶが、`client.getAccessToken()` に `signal` を渡していない（コード中コメント「AbortSignal を渡して metadata server 打鍵も cancel 可能にする」はあるが実際の引数渡しは書かれていない）。R5 の決定で「選択肢 a（setTimeout().unref()）を採用し、AbortController は副次」としているので実質的には `setTimeout(...).unref()` の方が effective。`controller` は `signal.aborted` の検査に使うだけなので、実装時に「signal を渡す/渡さない」を SDK の対応状況で決めれば良い。Implementer に判断を委ねてよい。
- §7.1 test 21 の fake は「10 ms 後に `{ok:false, error:'timeout (5s)'}` を resolve」する形で、実時間 5s を待たず **ラッパー挙動のシミュレーション** をする方針。これは §2.2 の `opts.adcProbe` 注入点で既に正当化されている（`buildDoctorReport` 側の timeout ラッパーではなく、`defaultAdcProbe` 内部の timeout ラッパーを test するわけではない）。仕様としては一貫しているが、実装者が「defaultAdcProbe 内の timeout 動作自体を unit test したい」と思った場合は §7.1 に追加テストを書いても OK、という余地は plan に残っている。
- §4.1 `DoctorReport.verbose.tokenPrefix` と `DoctorReport.adc.tokenPrefix` が **二重掲示**（コメントで「発見性のため」明記）。意図どおりだが JSON サイズが僅かに増える。許容範囲。

---

## 判定

## **Approved**

R1–R6 すべて妥当に反映され、Optional 9 件も取り込み済み。新規 blocker なし。付録 C の対応表が Implementer と Conductor 双方の追跡性を高めており、plan を rev 2 として成立させる品質に達しています。

Phase 3（実装）に進めてください。
