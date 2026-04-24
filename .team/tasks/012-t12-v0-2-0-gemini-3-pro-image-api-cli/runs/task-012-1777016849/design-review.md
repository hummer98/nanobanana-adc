# Design Review: plan.md (task-012 / v0.2.0)

## Verdict
**Approved**（条件付き — Recommendations は実装中に取り込み可能、本質的な再設計は不要）

## Summary

研究結果（research.md）に基づき、当初想定の 5 オプションを `--person-generation` 1 つに絞り込んだ判断は、一次ソース（`@google/genai` の `ImageConfig` 型定義、Vertex REST スキーマ、AI Studio docs）の裏取りが揃っており、task spec 受け入れ基準 0 が明示的に許容した narrowing と整合する。CLAUDE.md「One binary, two distributions」「ADC is the primary axis」の不変条件にも違反しない。型 / body / CLI / docs / version の各レイヤの設計はいずれも既存パターン（`assertAspect`, `commander.choices`, `as any` cast, conditional spread）の素直な踏襲で、regression risk は最小。

ただし、(1) task spec §8 の実画像生成テストを完全省略する判断、(2) CLI enum を大文字のまま受ける判断、(3) Keep a Changelog 慣習からはみ出る "Scope notes" セクション — の 3 点は実装着手前に Implementer が再確認したほうが良い。いずれも plan 書き直しを要する規模ではない。

## Strengths

- **Scope narrowing の根拠連鎖が明瞭**: research.md §1〜§5 が一次ソース（Google SDK 型定義、フォーラム報告）にひも付いており、5 → 1 への絞り込みが「サボり」ではなく「spec 0 が要請した精査の結果」であることが読み手に伝わる。task spec §3 / §4 を skip する判断も、依存関係（`--count` を採らないから連番命名は不要 / `--mime` を採らないから整合検査は不要）として説明されており飛躍がない。
- **両経路対称性が body 構築でも保たれている**: §7 の Vertex fetch / AI Studio SDK の両 snippet が完全に同じ position・同じ string を送る設計で、CLAUDE.md「No hidden coupling」と整合。マッピング層を増やさない判断が `as any` の表面積も最小化している。
- **型安全の継承**: `assertPersonGeneration` を `assertAspect` と同じく `asserts value is T` の type predicate で書く設計（§5）で、`commander.choices` の runtime guard と TypeScript の型 narrowing が二段で噛み合う。CLI 以外から `generate()` を呼ぶ場合の安全網も保たれる。
- **default の選択（field を送らない）が research と整合**: §12.3 で「`ALLOW_ADULT` を default にしない」根拠が Tier 違い（Vertex のフリーミアム vs エンタープライズ）への配慮として書かれており、CLAUDE.md「ADC is the primary axis」とも整合する。
- **判断ログ §12 が手厚い**: 後続レビューや将来の Implementer が plan の意図を再構成できる粒度で書かれている。特に §12.1（`--person` vs `--person-generation`）は spec からの逸脱を含むため記録の価値が高い。
- **scope 外の明示**: `src/auth.ts` / `bin/nanobanana-adc` / `docs/seed.md` / `skills/.../SKILL.md` を「触らない」と §3 で列挙しており、Implementer の hands-off 範囲が事前に固定されている。

## Recommendations

### 必須

- **[必須] §10.5 / §12.2 の「実画像生成テスト全省略」を、ADC 経路 1 枚だけは復活させる方向に修正することを強く推奨**
  → 該当箇所: plan.md §10.2、§10.5、§12.2

  **理由**:
  1. `imageConfig` 配下に **このコードベースで初めて送る field** を足す変更である。`personGeneration` の field 名と enum 値は research.md §2 で SDK 型定義経由で確認済みだが、実 server が `gemini-3-pro-image-preview` で 400 を返さないことの **end-to-end 検証は本タスクの範囲内でしか行えない**。SessionStart 経由でユーザーが上げて初回エラーになるよりは、Implementer が ADC で 1 枚撮って `200 + image bytes` を確認すべき。
  2. CLAUDE.md「課金が発生する実モデル呼び出しを **CI のデフォルトパス** で回さない」は CI を縛るルールであり、Implementer の手元検証を縛っていない。plan §12.2 の「CLAUDE.md は spec より上位」は正しいが、両者がここで衝突しているわけではない。
  3. `--size 1K --person-generation ALLOW_ADULT` で 1 枚であれば課金は cents オーダー、API key 経路は spec が要求する 2 経路のうちの 1 経路のみ追加負担。

  **修正案**: ADC 経路で 1 枚（`--size 1K --person-generation ALLOW_ADULT`）の実生成だけ復活させ、API key 経路は plan の判断通り省略（CLAUDE.md の「ADC is the primary axis」優先）。summary.md には「ADC 経路: 1 枚生成、API key 経路: server 接続まで（401 確認）に留めた」と書く。

### 推奨

- **[推奨] CLI enum を大文字のままにする決定（§6 / §12.1）に、case-insensitive 受理 か lowercase alias を追加することを検討**
  → 該当箇所: plan.md §4 Step 4、§6、§12.1

  **理由**:
  1. シェルで `--person-generation ALLOW_ADULT` を入力するのは zsh / bash の補完が効かない場面ではタイポ率が高い（特にアンダースコア + 全大文字）。
  2. task spec が「CLI では小文字表記、送信時にマッピング」と明示しているため、上書きするなら justification を強くしておくべき。plan §12.1 の「learnability」は反論可能（「CLI で小文字 → API で大文字」は他の CLI ツールでもよくあるパターン）。
  3. 実装コストが小さい: `commander` の `.argParser` で `(v) => v.toUpperCase()` を 1 行通すだけで lowercase 入力も受理可能。`.choices()` は upper のままで OK。
  4. これにより `allow_all` も `ALLOW_ALL` も受理でき、help 出力には大文字を表示してドキュメント参照性も維持できる。

  **修正案**: §6 の Option 定義を以下に変更（plan に取り込まなくても、Implementer が裁量で入れて良いレベル）:

  ```ts
  .addOption(
    new Option('--person-generation <mode>', 'control person generation')
      .choices(['ALLOW_ALL', 'ALLOW_ADULT', 'ALLOW_NONE'])
      .argParser((v) => v.toUpperCase()),
  )
  ```

  ※ `commander` の評価順序は argParser → choices なので、この組み合わせで lowercase 入力 → upper 化 → choices チェックが通る。

  リスクとして、`commander` のバージョンによっては argParser の戻り値が choices チェック前か後か挙動が異なる可能性があるため、Implementer は `--person-generation allow_all` の手元検証を必須にする。

- **[推奨] CHANGELOG の "Scope notes" セクションは Keep a Changelog の標準セクション名外**
  → 該当箇所: plan.md §8.3

  Keep a Changelog 1.1.0 が定める節は `Added` / `Changed` / `Deprecated` / `Removed` / `Fixed` / `Security` の 6 つ。"Scope notes" は parser 互換性に影響しないが、`release-please` 等の自動 changelog ツールを将来導入した場合に無視される可能性がある。

  **修正案 (どちらでも可)**:
  - (a) "Scope notes" を `### Notes` にリネーム（Keep a Changelog は厳密には Notes も標準ではないが、より一般的）
  - (b) Scope notes を `### Added` セクションの直前に通常段落として置き、見出しを使わない
  - (c) plan のまま "Scope notes" で行く（実害は無い、可読性は良い）

  Reviewer の preference は (b)。理由: 「採用しなかったもの」は changelog の本旨ではなく、PR description / plan / research.md に既に記録されている。CHANGELOG は「ユーザー視点で何が変わったか」に絞る方がノイズが少ない。

- **[推奨] バージョン同期 4 箇所に加えて `package-lock.json` の整合を明記**
  → 該当箇所: plan.md §3、§5 Step 5、§9

  `package.json` の `version` を上げると `npm install` 時に `package-lock.json` の root entry も更新される。ローカル開発で `npm install` を後から走らせ忘れると、lockfile diff が漏れて CI で `npm ci` が失敗する。

  **修正案**: §5 Step 5 に「`npm install --package-lock-only` を実行して `package-lock.json` を同期する」を追加。`grep -rEn '"version"...'` の確認対象にも `package-lock.json` を含める（ただし lockfile には依存パッケージのバージョンも入るので、ピンポイントで `package-lock.json` の root `"version"` を見るのが良い）。

- **[推奨] `commander.choices` の case-sensitivity を §11 の残リスクに明記**
  → 該当箇所: plan.md §11

  上記の lowercase alias を採用しない場合は、`--person-generation allow_all` がエラー終了することを Implementer が知っているべき。`error: option '--person-generation <mode>' argument 'allow_all' is invalid. Allowed choices are ALLOW_ALL, ALLOW_ADULT, ALLOW_NONE.` という commander のエラーメッセージはユーザーに「大文字で書け」と伝えてくれるので機能としては破綻しないが、リスクとして §11 に 1 行入れておくと判断の透明性が増す。

- **[推奨] AI Studio Tier の `ALLOW_ALL` rejection 注記の根拠が Imagen 経路報告である点を README/CHANGELOG にも残す**
  → 該当箇所: plan.md §8.1 (d)、§8.2、§11.1

  research.md §2 が "Imagen 経路の報告で、Gemini API 側での再現は未確認" と明示しているので、README に書く際も「報告がある (unconfirmed for Gemini API path)」のニュアンスを失わない方が良い。plan §8.1 (d) の文面は "Some AI Studio API-key tiers reject `ALLOW_ALL`" と断定気味。

  **修正案**: README 注記を以下のニュアンスに:
  > Note: There are reports that some AI Studio API-key tiers may reject `ALLOW_ALL` with a 400 error (not yet confirmed for the Gemini API path). If you hit this, fall back to `ALLOW_ADULT` or omit the flag.

### Nit（採用任意）

- **[nit] §3 表の「予想行数」で `src/cli.ts` が `+15 / -3` だが、実際には `Option` の import は既存にあるため import 行追加は不要。±1〜2 行誤差。**
- **[nit] §4 Step 8 の「`dist/` は `.gitignore` 下にあり git 追跡外」は事実だが、`.gitignore` は `dist/` だけでなく `*.js` も列挙している。意図が冗長保護なのか / 過去の経緯なのかは不明。本タスクのスコープ外だが、将来 cleanup 候補として記録しておくと良い。**
- **[nit] §10.2 の `--prompt x --person-generation ALLOW_ADULT --api-key dummy` smoke test は 401 で死ぬはずだが、`@google/generative-ai@0.24.1` の SDK エラーメッセージが「`personGeneration` field がリジェクトされる」型のエラーを返した場合に区別できない。recommendation 必須の 1 枚実生成があれば不要だが、省略する場合は「401 メッセージに `personGeneration` の文字列が含まれない」を success criteria に明示するとより安全。**

## Questions / Assumptions

以下は plan が暗黙に仮定しているが、明示すると Implementer の判断負荷が減る:

- **Q1: `src/cli.ts` で `assertPersonGeneration` を呼ぶタイミング**
  plan §5 は「存在すれば assertPersonGeneration に通してから GenerateOptions.personGeneration に詰める」と書いているが、`commander.choices` を通った後の値は `string | undefined`。`assertPersonGeneration` の型シグネチャは `value: string` を取るので、`opts.personGeneration ?? undefined` のチェックを忘れると undefined を渡してしまう。Implementer は `if (opts.personGeneration) { assertPersonGeneration(opts.personGeneration); }` の form を踏むべき。

- **Q2: SessionStart hook 経由で 0.2.0 が反映されるか**
  Reviewer 観点 I で問われている点。`.claude-plugin/plugin.json` の SessionStart hook 1 番目は `diff -q "${CLAUDE_PLUGIN_ROOT}/package.json" "${CLAUDE_PLUGIN_DATA}/package.json"` で diff があれば `npm install --omit=dev` を再実行する。**version 文字列が変わるので diff になる → re-install される** はず。ただし hook 3 番目は `[ -f "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" ] || (... tsc ...)` という存在チェックなので、**v0.1.1 で生成された stale な dist/cli.js が残っていると tsc が走らない**。これは plan の責務外の既知挙動だが、リリース後に「plugin 経由で 0.2.0 を入れたが `--version` が `0.1.1` を返す」というバグ報告が出る可能性がある。
  → 推奨: plan §11 の Risk に 1 行追加するか、別タスクで SessionStart hook を `version mismatch` 検知に拡張する案を seed.md に記録。本タスクのスコープ外で良い。

- **Q3: README §8.1 (d) のリンク `./.team/tasks/...`**
  plan §8.1 末尾で「実リンクは .team 配下を公開しない運用なら、文章のみに留める方が良い」と既に planner が懸念表明済み。Reviewer も同意 — `.team/` は内部運用ディレクトリで、git tracking されていても publish された npm tarball には含まれない可能性が高い（`.npmignore` / `files` フィールド要確認）。リンクは入れず、本文だけにする方針を §8.1 で確定させる方が Implementer の迷いが減る。

- **A1（assumption）: CONTRIBUTING.md / docs/seed.md は変更不要**
  plan は CONTRIBUTING.md に言及していない。本変更はリリース手順や開発フローに影響しないので妥当。docs/seed.md は task spec §5 で明示的に「触らない」とされている。両者ともに plan の (暗黙の) 判断は正しい。

- **A2（assumption）: `responseModalities: ['IMAGE']` と `imageConfig.personGeneration` の併用は安全**
  research.md には明示記載がないが、`@google/genai` `ImageConfig` 型で `personGeneration` が定義されている以上、`responseModalities=['IMAGE']` の generateContent 呼び出しと併用前提と解釈できる。両経路 snippet（plan §7）でも同じ構造なので integrity OK。

## References

- 読んだファイル:
  - `plan.md` (レビュー対象)
  - `research.md` (前提調査)
  - `conductor-prompt.md` (task spec)
  - `CLAUDE.md` (project invariants)
  - `src/cli.ts` (現状の commander 使い方)
  - `src/generate.ts` (現状の `imageConfig` 構築 / `assertAspect` パターン / `as any` cast 範囲)
  - `src/auth.ts` (認証優先順位、変更不要であることの確認)
  - `CHANGELOG.md` (Keep a Changelog 既存書式)
  - `.claude-plugin/plugin.json` (SessionStart hook の挙動、version 同期対象)
  - `.claude-plugin/marketplace.json` (version 同期対象)
  - `.gitignore` (`dist/` / `*.js` 除外確認)
- 参照した一次/SDK:
  - research.md 経由で確認した `js-genai` `ImageConfig` 型定義 (`personGeneration` field 存在、`numberOfImages`/`seed`/`negativePrompt` 不在)
  - `@google/generative-ai@0.24.1` の `GenerationConfig` 型に `imageConfig` が未定義であることの既存コード確認 (`src/generate.ts:160` の `as any`)
- 適用した規約:
  - CLAUDE.md「ADC is the primary axis」「One binary, two distributions」「No hidden coupling」「region-less host invariant」
  - task spec 受け入れ基準 0（互換性のあるパラメータだけを対象とする）
