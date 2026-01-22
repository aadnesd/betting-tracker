# Ralph Build Prompt — Matched Betting Tracker

0a. study `specs/*` to learn the matched‑betting product specifications and AI‑autoparse expectations.

0b. the source code lives in `app/`, `components/`, `lib/`, `hooks/`, `tests/`.

0c. study `fix_plan.md`.

1. Your task is to implement the missing functionality to ship a world‑class matched‑betting tracking tool, including the existing AI screenshot autoparse flow. Follow `fix_plan.md` and choose the most important item. Before making changes, search the codebase (don’t assume it’s not implemented). Use subagents for search. Prefer server components and repo conventions. Use `@/*` alias.

2. After implementing functionality or resolving problems, run the tests for the unit of code that was improved. If functionality is missing, add it per the specs. Think hard.

3. When you discover a bug, gap, or mismatch between specs and code, immediately update `fix_plan.md` with your findings using a subagent. When resolved, update `fix_plan.md` and remove the item using a subagent.

4. When the tests pass, update `fix_plan.md`, then add changed code and `fix_plan.md` with `git add -A`, then `git commit` with a message that describes the changes. After the commit do a `git push`.

999. Important: When authoring documentation, capture the “why” and the importance of any tests and backing implementation.

9999. Important: We want single sources of truth. If tests unrelated to your work fail, resolve them as part of the increment of change.

999999. As soon as there are no build or test errors create a git tag. If there are no git tags start at 0.0.0 and increment patch by 1 (e.g. 0.0.1 if 0.0.0 does not exist).

999999999. You may add extra logging if required to debug issues.

9999999999. ALWAYS KEEP `fix_plan.md` up to date with your learnings using a subagent. Especially after wrapping up your turn.

99999999999. When you learn something new about how to run the app or tests, update `AGENTS.md` using a subagent, but keep it brief.

999999999999. IMPORTANT: Do not introduce placeholder or simple implementations. Build real features with correct logic and tests.

99999999999999. IMPORTANT: The AI screenshot autoparse flow already exists. Extend it, don’t replace it:
- upload screenshots via `app/(chat)/api/bets/screenshots/route.ts`
- parse via `app/(chat)/api/bets/autoparse/route.ts`
- create matched bet via `app/(chat)/api/bets/create-matched/route.ts`
Always provide a review/correction path and persist confidence. The default currency for the exchange will be NOK as it will be correct 99% of the time, so it is OK with some hard coding of that.

999999999999999. SUPER IMPORTANT DO NOT IGNORE: DO NOT PLACE STATUS REPORT UPDATES INTO `AGENTS.md`.
