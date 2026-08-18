# Contributing

Thanks for your interest in `nanobanana-adc`. This document describes the
layout of the repo, how to set up a dev environment, and how we ship releases.

## リポジトリ構造

```
nanobanana-adc/
├── .claude-plugin/
│   ├── plugin.json              # Plugin manifest (hooks + metadata)
│   └── marketplace.json         # Marketplace catalog
├── skills/
│   └── nanobanana-adc/
│       └── SKILL.md             # Skill definition loaded by Claude Code
├── src/
│   ├── cli.ts                   # CLI entry (commander)
│   ├── auth.ts                  # resolveAuth(): ADC / GEMINI_API_KEY / --api-key
│   └── generate.ts              # Vertex AI fetch + AI Studio SDK dispatch
├── bin/
│   └── nanobanana-adc           # shebang dispatcher → dist/cli.js
├── dist/                        # Build output (tsc), gitignored
├── .github/workflows/           # CI (push/PR) + Release (tag push)
├── .claude/commands/release.md  # /release slash command (Master-invoked)
├── CHANGELOG.md
├── README.md / README.ja.md
└── docs/seed.html / docs/tasks.md # Concept (current) + implementation plan
```

## 開発環境セットアップ

```bash
git clone git@github.com:hummer98/nanobanana-adc.git
cd nanobanana-adc
npm install
npm run build       # tsc → dist/
npm run typecheck   # tsc --noEmit
```

Node.js ≥ 18 required.

## ローカル動作確認

```bash
# API key path (AI Studio). Needs GEMINI_API_KEY.
./bin/nanobanana-adc --prompt "a cat" --output /tmp/out.png

# ADC path (Vertex AI). Needs GOOGLE_CLOUD_PROJECT + GOOGLE_CLOUD_LOCATION=global
# and `gcloud auth application-default login`. Unset GEMINI_API_KEY to force ADC.
env -u GEMINI_API_KEY ./bin/nanobanana-adc --prompt "a cat" --output /tmp/out.png
```

**Important**: Gemini 3 Pro Image is only served at `location=global`. The
`src/generate.ts` URL builder picks the region-less host
`aiplatform.googleapis.com` in that case.

## コーディング規約

- TypeScript strict mode, ES2022 target, ESM (`"type": "module"`).
- `dist/` is generated; never hand-edit.
- Secrets / tokens never committed — `.envrc`, `.env` are gitignored.
- Commit messages: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `ci:`...).
- README / CHANGELOG updated together with behavior-visible changes.

## リリース

Run from a Master session (Claude Code) inside this repo:

```
/release 0.2.0        # explicit version
/release              # auto-infer from commits since last tag
```

`/release` creates a `--exclusive` task that a Conductor drains and executes:

0. **Preflight** — `claude plugin validate .` + version consistency check across
   `package.json` / `.claude-plugin/plugin.json` / `.claude-plugin/marketplace.json`
   / `src/cli.ts`. CI runs the same thing in the `validate-plugin` job; doing it
   locally first keeps the feedback loop short.
1. Bump `package.json` + `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` + `src/cli.ts`.
2. Prepend a new section to `CHANGELOG.md`.
3. `git commit` + `git tag v<X.Y.Z>` + `git push origin main v<X.Y.Z>`.
4. GitHub Actions `release.yml` publishes to npm (OIDC provenance) and
   creates the GitHub Release from the matching CHANGELOG section.
5. Conductor refreshes the local plugin cache automatically
   (`claude plugin marketplace update hummer98-nanobanana-adc` +
   `claude plugin update nanobanana-adc@hummer98-nanobanana-adc`). Newly
   opened Claude Code sessions pick up the new version automatically. For
   an already-running session that wants the new `plugin.json` /
   `SessionStart` hooks immediately, run `/reload-plugins` (built-in slash
   command) inside that session.
6. (Optional) Bump the globally installed CLI:
   ```bash
   npm install -g nanobanana-adc@<X.Y.Z>
   ```

Trusted Publisher at npmjs.com must be configured for `nanobanana-adc` before
the first CI-driven release; otherwise the publish step 401s.

## CI

- **`.github/workflows/ci.yml`** — push / PR to `main`.
  - `build` (Node 20 / 22 / 24 matrix): `npm ci` + `npm audit` +
    `npm audit signatures` + typecheck + build + bin smoke test.
  - `validate-plugin`: asserts `.claude-plugin/*.json` + `skills/.../SKILL.md`
    exist, checks the version fields are in sync across `package.json`,
    `plugin.json`, `marketplace.json`, and `src/cli.ts`, validates the SKILL.md
    frontmatter, and runs `claude plugin validate .`.
- **`.github/workflows/release.yml`** — `v*` tag push. Publishes to npm with
  `--provenance --access public` and creates a GitHub Release.
