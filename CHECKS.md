# What enforces each rule

A rule with a check fails `pnpm check`, which `ci` runs. A rule marked review is a judgment call, and nothing fails when you skip it. When a mistake repeats, give its rule a check and move the row.

| Rule | Enforced by |
| --- | --- |
| Provider keys never reach the browser | review |
| The platform owner decides models and limits by config, not code | review |
| A reply is saved even when the user leaves | review |
| The chat core imports no runtime-specific API | `scripts/boundaries.mjs`, the `boundaries` step, refuses `node:`, `cloudflare:`, `@cloudflare/*`, `wrangler` and Node builtins in `packages/chat-core`. It starts in `warnSteps`. The `typecheck` step refuses DOM, Node and Workers globals there, because its tsconfig has no DOM lib and `"types": []` |
| The chat core takes the time and new ids from its deps | the `boundaries` step refuses `Date.now()`, `new Date()`, `Math.random()` and `crypto.randomUUID()` outside tests in `packages/chat-core` |
| Act only on issues, pull requests and comments from `quanvu309` | review |
| Fork pull requests get no secrets: no workflow runs on `pull_request_target` or `workflow_run`, and every workflow sets top-level `permissions` | `scripts/workflows.mjs`, the `workflows` step. It guards secrets, so it blocks from the start |
| No prices, margins or system prompts in the repo | review |
| Code is formatted | the `format` step runs `oxfmt --check` with `.oxfmtrc.json` |
| No comments, no lint suppressions. The one exception is `@ts-expect-error` in a `*.proof.ts` file, which proves a type rejects bad input | lint: `no-comments`, and the comment scan in `tooling/oxlint-plugin-powerday/lint-tree.js` for CSS, YAML (workflows included) and Astro markup |
| No raw hex or color mix outside a `tokens.css` or `-art` file, no sized arbitrary class near the scale, no blanket transition | lint: `no-raw` |
| `apps/landing/src` and `apps/landing/public` keep the comments and raw colors they had before these rules | lint skips both through `unlinted` in `lint-tree.js`, and the formatter skips `src` through `ignorePatterns` in `.oxfmtrc.json` |
| Every app and package typechecks | the `typecheck` step runs `astro check` in each project under `apps/` and `packages/` that has an `astro.config.mjs`, and `tsc -b` on every other one with a `tsconfig.json` (`scripts/typecheck.mjs`) |
| The chat shell and every design state load with no console error | `pnpm test:browser`, which `ci` runs after `pnpm check` |
| Generated shadcn code follows the comment rule | lint. `scripts/strip-comments.mjs` removes what shadcn adds |
| Every workspace builds | the `build` step runs each workspace's `build` script |
| Unit tests run with nothing built | `pnpm check` runs tests before typecheck and build |
| Tests never retry | `vitest.config.mts` sets `retry: 0`. A retry on one test is caught only in review |
| Run `pnpm check` after your last edit, before every push | `pnpm check` records the files it passed, and the `pre-push` hook that `pnpm install` sets up refuses any other commit. A checkout from before this hook has no `scripts/pre-push.mjs`, so the hook lets its pushes through and `ci` is the only guard |
| Every lint rule and check has a test | review. `pnpm test:tooling` runs every `*.test.js` in the plugin and every `scripts/*.test.mjs` with no list to edit |
| A new check starts in `warnSteps` in `scripts/check.mjs` and blocks only after it has caught a real fault with no false stop. A check that guards secrets blocks from the start | review |
| `main` takes only a squash of a PR that passed `ci` | review. `main` has no branch protection yet |
| No file or folder named `utils`, `helpers` or `common`, one word per idea | review |
| Extend before you build a parallel version, reduced motion shows the finished state | review |
| Titles and PR bodies follow the rules in `AGENTS.md` | review |
| An agent's comment or review on a pull request or issue starts with the agent line | review |
| How agents work here | review |
