# EPD 2.0: notes for Claude

## Versioon (the owner's standing rule)

Every update that reaches the game bumps the version, in the same pull request: the look, the content, the
code, the server, the data, anything a player or the server receives. ("Iga kord kui updatid välimust, sisu,
ükskõik mida, updati ka versiooni.")

- **Small update** (a fix, a tweak, balance, wording, polish of one screen): the last number, `2.x.Y`.
  Example: 2.8.0 to 2.8.1.
- **Bigger update** (a new feature, mode or content set, a redesign, anything a player would call new): the
  middle number, `2.X.0`. Example: 2.8.3 to 2.9.0.
- The first number (3.0.0) changes only when the owner says so.
- Where:
  - `package.json` "version" is the only source; the game shows it through `VERSION` in
    `src/ui/screens/shell/helpers.ts`. Set it with `npm version <x.y.z> --no-git-tag-version`, which also
    updates both fields in `package-lock.json`.
  - A new `## x.y.z (YYYY-MM-DD)` section goes at the top of `CHANGELOG.md`: Estonian bullets and a short
    English summary in a `<details>` block, like the sections below it.
- Several pull requests open at once: each takes the next free number when it merges. If main moved on,
  merge main and renumber.
- Changes only to `docs/`, `tests/`, `e2e/`, `.github/`, `.claude/`, `.githooks/` or Markdown files need no new
  version.
- Enforced by `scripts/check-version.mjs`:
  - the CI job "Version bump" (`.github/workflows/ci.yml`);
  - the git pre-push hook in `.githooks/`, switched on by the SessionStart hook in `.claude/settings.json`
    (`git config core.hooksPath .githooks`).
- Every version since 2.0.0, with what it brought, is in `CHANGELOG.md`.
