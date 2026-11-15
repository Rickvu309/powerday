# What enforces each rule

A rule with a check fails `pnpm check`, which `ci` runs. A rule marked review is a judgment call, and nothing fails when you skip it. When a mistake repeats, give its rule a check and move the row.

| Rule | Enforced by |
| --- | --- |
| Provider keys never reach the browser | review |
| The platform owner decides models and limits by config, not code | review |
| A reply is saved even when the user leaves | review |
| The chat core imports no runtime-specific API | review |
| Act only on issues, pull requests and comments from `quanvu309` | review |
| Fork pull requests get no secrets: no workflow runs on `pull_request_target` or `workflow_run`, and every workflow sets top-level `permissions` | `scripts/workflows.mjs`, the `workflows` step. It guards secrets, so it blocks from the start |
| No prices, margins or system prompts in the repo | review |
| Code is formatted | the `format` step runs `oxfmt --check` with `.oxfmtrc.json` |
| No comments, no lint suppressions | lint: `no-comments`, and the comment scan in `tooling/oxlint-plugin-powerday/lint-tree.js` for CSS, YAML and Astro markup |
| No raw hex or color mix outside a `tokens.css` or `-art` file, no sized arbitrary class near the scale, no blanket transition | lint: `no-raw` |
| `apps/landing/src` and `apps/landing/public` keep the comments and raw colors they had before these rules | lint skips both through `unlinted` in `lint-tree.js`, and the formatter skips `src` through `ignorePatterns` in `.oxfmtrc.json` |
| Every Astro app typechecks | the `typecheck` step runs `astro check` in each project under `apps/` and `packages/` that has an `astro.config.mjs` (`scripts/typecheck.mjs`) |
| Every workspace builds | the `build` step runs each workspace's `build` script |
| Unit tests run with nothing built | `pnpm check` runs tests before typecheck and build |
| Tests never retry | `vitest.config.mts` sets `retry: 0`. A retry on one test is caught only in review |
| Run `pnpm check` after your last edit, before every push | `pnpm check` records the files it passed, and the `pre-push` hook that `pnpm install` sets up refuses any other commit |
| Every lint rule and check has a test | review. `pnpm test:tooling` runs every `*.test.js` in the plugin and every `scripts/*.test.mjs` with no list to edit |
| A new check starts in `warnSteps` in `scripts/check.mjs` and blocks only after it has caught a real fault with no false stop. A check that guards secrets blocks from the start | review |
| `main` takes only a squash of a PR that passed `ci` | review. `main` has no branch protection yet |
| No file or folder named `utils`, `helpers` or `common`, one word per idea | review |
| Extend before you build a parallel version, reduced motion shows the finished state | review |
| Titles and PR bodies follow the rules in `AGENTS.md` | review |
| An agent's comment or review on a pull request or issue starts with the agent line | review |
| How agents work here | review |
