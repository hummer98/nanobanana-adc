# T16 design-review-v2.md — v0.6.0 doctor の CLOUDSDK_CONFIG 対応 plan 再レビュー

- Reviewer: Design Reviewer Agent (cmux-team)
- Plan (revised): `runs/task-016-1777152365/plan.md`
- 前回レビュー: `runs/task-016-1777152365/design-review.md`
- Worktree: `/Users/yamamoto/git/nanobanana-adc/.worktrees/task-016-1777152365`
- Base commit: `7d29ac8` (T15 / v0.5.0)

---

## 1. 判定

**Approved**

## 2. 判定理由

前回 Must fix の 3 件はいずれも plan に明確に反映済み (M1: §1.1 で選択肢 C を裁定 + §6.3 / §7.4 #83b で assert、M2: §7.3 に #79b 追加 + 擬似コードも提示、M3: §9 の表が `.claude-plugin/plugin.json` L3 既存 version の事実通りに書き換えられ、§11 リスク表の事実誤認記述も「既に存在するので値の置換のみ」に書き換え済み)。初回指摘で評価した強み (JSON schema additive、TDD 順序、secrets masking §12、exit 0 不変条件) はいずれも損なわれていないため、Phase 3 (実装) に進んで良い。

---

## 3. Must fix の検証結果

### M1. テキスト出力の `resolved:` 表示文字列の裁定 — ✅ 解消

検証ポイント:
1. **選択肢の裁定が明示されたか**: plan §1.1 「text 表示文字列の裁定 (Design Review M1)」で**選択肢 C** (`resolved: default (effective default)`) を採用すると明示し、4 つの理由 (JSON kind と text を乖離させない / タスク本文 §4 の `effective-default` 例との橋渡し / 案 a の趣旨を破らない / CHANGELOG / README への反映方針) が記述されている。
2. **§1 と §6.3 で矛盾なく書かれているか**:
   - §1.1 の裁定 → §6.3 after 例 `resolved: default (effective default) (env GOOGLE_APPLICATION_CREDENTIALS unset)` と一致。
   - §6.3 末尾の擬似コード `renderResolvedKind(kind)` で「`kind === 'default'` のときだけ `(effective default)` を付ける」と実装方針も固定。
   - §1.1 末尾の TypeScript `AdcSourceKind` 型再定義 (kind 値集合は v0.5 互換、`'cloudsdk-config'` は @deprecated) と JSON kind は `'default'` のままという裁定も整合。
3. **assert する追加テストが §7 にあるか**:
   - **#83b** (§7.4) 追加: `adcSourceResolver` stub で `resolved:'default'` を返すケースで `text.match(/^\s*resolved:\s+default \(effective default\)/m)` を assert。さらに `resolved:'env'` の stub で素の `env` のまま (括弧書きが付かない) ことも assert。JSON 側は `parsed.adcSource.resolved === 'default'` のままとも assert で固定。

### M2. 「GAC + CLOUDSDK_CONFIG 同時 set」での `CLOUDSDK_CONFIG_OVERRIDE` 発火を assert するテスト追加 — ✅ 解消

検証ポイント:
1. **§7.3 warning テストブロックに #79b として追加されたか**: plan §7.3 のテーブルに `#79b` 行が追加されており、入力 (`env={GOOGLE_APPLICATION_CREDENTIALS:'/env/sa.json', CLOUDSDK_CONFIG:'/cs', GOOGLE_CLOUD_LOCATION:'global'}` + `adcSourceResolver` で `resolved:'env'` + `envCredentials.exists=true` を返す stub) と期待 (`report.adcSource.resolved==='env'` AND `report.warnings.map(w => w.code).includes('CLOUDSDK_CONFIG_OVERRIDE')===true`) が表に書かれている。
2. **擬似コードの提示**: 前回 review で提案した #79b 案コードがそのまま §7.3 末尾に擬似コードブロックとして引用されており、実装者が test stub を書く際の手戻りが無い。
3. **テスト件数の整合**: §7.5 直前の集計が「合計 17 ケース追加 (#70–#74 5 件 + #75–#78 4 件 + #79, #79b, #80 3 件 + #81, #82, #83, #83b 4 件 + #84 1 件)」と更新済みで、#79b と #83b の追加が正しく反映されている (5+4+3+4+1=17)。

### M3. `.claude-plugin/plugin.json` に top-level `version` フィールド既存の事実を反映 — ✅ 解消

検証ポイント:
1. **§9 の version 同期表 4 行すべてが事実通りに書き換えられたか**:
   - `package.json` L3 `"version": "0.5.0"` → `0.6.0` ✅
   - `.claude-plugin/plugin.json` **L3 `"version": "0.5.0"`** → `0.6.0` ✅ (前回の「version フィールド無し前提」記述が消え、L3 に既に存在する事実通りに「値の置換」として記述)
   - `.claude-plugin/marketplace.json` L15 `"version": "0.5.0"` → `0.6.0` ✅
   - `src/cli.ts` L19 `const CLI_VERSION = '0.5.0'` / L24 `.version('0.5.0')` 両方 → `0.6.0` ✅
2. **CI `validate-plugin` ジョブの動作根拠が明記されたか**: plan §9 の本文に「CI の `validate-plugin` ジョブ (`.github/workflows/ci.yml` L40〜L65) は `require('./.claude-plugin/plugin.json').version` を取り、`package.json` のそれと一致しないと exit 1 で失敗するため、`.claude-plugin/plugin.json` L3 の更新は **必須**」と書かれており、前回指摘した CI 制約が plan に取り込まれている。
3. **CI の grep ルール注記**: §9 末尾に「`.version('...')` (commander) は厳密チェック対象 / `CLI_VERSION` constant 自体は厳密チェック外だが L19 で定義され L119 の `version: CLI_VERSION` 経由で実 CLI 表示に効く」と注記され、実装者が L19/L24 のどちらか片方だけ更新する誤りを防ぐ説明がある。
4. **§11 リスク表からも該当の事実誤認記述が消えているか**: §11 のリスク行が「4 箇所 (`package.json` / `.claude-plugin/plugin.json` / `.claude-plugin/marketplace.json` / `src/cli.ts`) の version 文字列のうち 1 箇所を更新し忘れる」に書き換わっており、末尾に「`.claude-plugin/plugin.json` L3 にも `version` フィールドは既に存在するので新規追加ではなく値の置換のみ」と明記。前回指摘した「現ファイルに version フィールドが無い」誤認記述は消去済み。

---

## 4. 追加指摘 (任意)

前回 Nice to have として挙げた 5 件のうち、plan に取り込まれていないのは N1〜N5 のうち以下:

- **N1** (`defaultLocation === effectiveDefault` の同値性 assert #85): 取り込まれていない。ただし §7.6 の `adcSourceStub` ヘルパで `defaultLocation: ed` (= effectiveDefault と同オブジェクト) を fix しており、buildDoctorReport を経由する全テストで暗黙に同値性が維持される構造のため、assert を 1 行追加しないことで生じる事故リスクは小さい。Phase 3 で実装者の判断で追加しても、follow-up に回しても可。
- **N2** (presence camelCase ↔ text label 対応表): 取り込まれていない。§3.1 の TypeScript 型定義と §6.2 の text 例から実装者が読み取れる粒度なので必須ではない。
- **N3** (`'cloudsdk-config'` 分岐 consumer 向け migration note): plan §4.3 README migration note に「`adcSource.resolved === 'cloudsdk-config'` は v0.6 で生成停止しています」と 1 文追加されており、前回指摘の趣旨は最低限満たされている (詳細な consumer 例は未追加だが、必須ではない)。
- **N4** (ADC_FILE_MISSING の発火条件裁定): plan §5.2 で「effective default 自体が missing のときに新 warning は導入しない / 既存の `ADC_FILE_MISSING` は GAC が指す path 不在のときだけ発火 (不変)」と裁定されており、Cloud Run 誤発火を避ける根拠も書かれている。summary.md への申し送りは Phase 4 (close) 段階での conductor 判断。
- **N5** (`note:` 行の改行幅): 取り込まれていない。実装時に `KV_WIDTH=34` 枠を超える場合の挙動 (折返し or 短縮) は doctor.ts 側の `kv` ヘルパに依存するため、Phase 3 で実装者が確認する形で許容できる。

これらは Phase 3 進行のブロッカーではない。実装担当者が plan §10 step 7 (renderer) や step 13 (LEAK_CANARY 確認) を進める中で必要に応じて取り込む / follow-up に回す判断で問題ない。

その他の差し戻しに値する新たな観点は見当たらない。secrets masking §12 / TDD 順序 §10 / JSON schema additive §4.2 / exit 0 不変条件 §3.4 §11 はすべて初回レビューの強度を維持しており、新 plan で損なわれていない。

---

## 5. 総括

**Phase 3 (実装) に進んで良い。**

3 件の Must fix はすべて適切に反映され、前回 plan の弱点 (text 表示文字列の裁定不在 / GAC+CLOUDSDK_CONFIG 同時 set テスト欠落 / plugin.json version 事実誤認) が解消された。残る Nice to have は実装中の判断 / follow-up で対応可能であり、再レビュー不要で Approved 相当。

実装担当者は plan §10 の TDD 順序 (テスト #70–#84 を先に追加 → RED 確認 → 型 → resolveAdcSource → resolveGcloudConfigDir → warning → renderer → LEAK_CANARY 拡張 → version 同期 4 箇所 → docs → CHANGELOG draft) に従って進めれば、Phase 3 完了時点で `npm run build` / `npm run typecheck` / `npm test` がすべて GREEN になることが plan から十分予測できる。
