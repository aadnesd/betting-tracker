#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const repoRoot = resolve(dirname(new URL(import.meta.url).pathname), "..");
const stateDir = join(homedir(), ".local/state/frontend-daily-lessons");
const statePath = join(stateDir, "state.json");
const outputPath = join(repoRoot, "docs/frontend-lessons/today.md");

const lessons = [
  {
    title: "Mental Model: What Runs Where",
    concept:
      "Frontend development is the boundary between product intent and what the user can see, understand, and operate. In this repo, Next.js chooses routes and server rendering, React describes interface state, TypeScript protects data shape, and CSS utilities control presentation.",
    inspect: ["app/", "components/app-sidebar.tsx", "components/ui/button.tsx"],
    exercise:
      "Open three components and write down what each one receives, what it renders, and whether it should be server-rendered or client-rendered.",
    check:
      "You can explain the difference between a route, a component, a prop, local state, and a CSS utility class without looking it up.",
  },
  {
    title: "Read A Component Without Editing It",
    concept:
      "A component is usually easier to understand from the outside in: imports, exported name, props, early returns, event handlers, rendered JSX.",
    inspect: [
      "components/bets/dashboard-summary-cards.tsx",
      "components/ui/card.tsx",
    ],
    exercise:
      "Annotate the render flow in notes: data in, formatting decisions, UI structure out. Do not refactor yet.",
    check:
      "You can point to the line where data enters and the JSX where the user sees it.",
  },
  {
    title: "Spacing And Typography",
    concept:
      "Most UI quality comes from predictable spacing, clear hierarchy, and text that fits. Use fewer sizes and make spacing consistent before adding decoration.",
    inspect: ["app/globals.css", "components/bets/deposit-bonus-card.tsx"],
    exercise:
      "Find one dense UI area and identify heading text, body text, metadata, and actions. Note whether spacing supports scanning.",
    check: "You can name which text should be most prominent and why.",
  },
  {
    title: "Layout With Flex And Grid",
    concept:
      "Flex is best for one-dimensional alignment. Grid is best for repeated columns, rows, and dashboards. Stable dimensions prevent hover, loading, and dynamic text from shifting the page.",
    inspect: [
      "components/bets/exposure-by-event-card.tsx",
      "components/bets/reporting-breakdown-table.tsx",
    ],
    exercise:
      "Choose one layout and sketch its parent/child structure as boxes before reading the classes.",
    check:
      "You can decide whether flex or grid is the simpler layout tool for a given section.",
  },
  {
    title: "Use The Design System First",
    concept:
      "Shared primitives encode behavior, accessibility, and visual consistency. Reach for `components/ui/*` before hand-building buttons, inputs, dialogs, menus, and badges.",
    inspect: [
      "components/ui/button.tsx",
      "components/ui/dialog.tsx",
      "components/ui/badge.tsx",
    ],
    exercise:
      "Find three places where product UI composes primitives. Identify what the primitive handles for the feature component.",
    check:
      "You can explain why a feature component should not manually recreate a button or dialog.",
  },
  {
    title: "Client And Server Components",
    concept:
      'Server components are the default in App Router. Add `"use client"` only when the component needs browser state, effects, event handlers, or client-only APIs.',
    inspect: [
      "app/",
      "components/bets/quick-add-form.tsx",
      "components/bets/bet-settlement-dropdown.tsx",
    ],
    exercise:
      "Pick five components and classify each as server or client. For client components, name the exact browser-side need.",
    check:
      'You can avoid adding `"use client"` just because a component renders UI.',
  },
  {
    title: "State And Derived Values",
    concept:
      "Keep state as small as possible. Store what the user changes directly, then derive display values from it during render.",
    inspect: [
      "components/bets/transaction-form.tsx",
      "components/bets/wallet-form.tsx",
    ],
    exercise:
      "Identify one piece of stored state and one value that could be derived from props or state.",
    check:
      "You can tell whether a value needs `useState` or can be calculated.",
  },
  {
    title: "Forms Need States",
    concept:
      "Good forms handle labels, validation, pending submission, errors, success feedback, and reset behavior. The visual design should make the next valid action obvious.",
    inspect: [
      "components/bets/standalone-bet-form.tsx",
      "components/bets/deposit-bonus-form.tsx",
    ],
    exercise:
      "Trace one form from initial render through submit. List each state the user can encounter.",
    check: "You can spot a missing disabled, loading, or error state.",
  },
  {
    title: "TypeScript For UI",
    concept:
      "TypeScript is most useful in UI when it makes impossible states hard to express: explicit props, discriminated unions, and careful nullable handling.",
    inspect: ["components/bets/bet-status-badge.tsx", "lib/db/schema.ts"],
    exercise:
      "Find a status or type union and follow how it becomes UI text or color.",
    check:
      "You can add a new status and know which switch or mapping must be updated.",
  },
  {
    title: "Data Display For Scanning",
    concept:
      "Dashboards and tables should help users compare, spot exceptions, and act. Alignment, number formatting, badges, and row density matter more than decoration.",
    inspect: [
      "components/bets/individual-bets-table.tsx",
      "components/bets/dashboard-summary-cards.tsx",
    ],
    exercise:
      "Pick one table and identify the primary comparison users are meant to make.",
    check: "You can justify the column order from the user's workflow.",
  },
  {
    title: "Loading And Empty States",
    concept:
      "A loading state preserves layout while data is unavailable. An empty state tells the user what happened and what action, if any, is available.",
    inspect: [
      "components/ui/skeleton.tsx",
      "components/bets/pending-settlement-card.tsx",
    ],
    exercise:
      "Find one loading or empty state and evaluate whether it preserves the page structure.",
    check:
      "You can design an empty state without turning it into onboarding copy.",
  },
  {
    title: "Recoverable Errors",
    concept:
      "Errors should identify the failed action, preserve user work when possible, and give a clear retry or correction path.",
    inspect: ["components/ui/alert.tsx", "components/bets/api-key-manager.tsx"],
    exercise:
      "Find one error message and rewrite it to be shorter, specific, and action-oriented.",
    check: "You can distinguish validation copy from system failure copy.",
  },
  {
    title: "Accessibility Basics",
    concept:
      "Accessible UI is operable by keyboard, understandable to assistive tech, and robust under zoom, focus, and contrast constraints.",
    inspect: [
      "components/ui/input.tsx",
      "components/ui/label.tsx",
      "components/ui/dialog.tsx",
    ],
    exercise:
      "Inspect one form and verify label association, keyboard order, visible focus, and error announcement strategy.",
    check: "You can navigate the workflow without a mouse.",
  },
  {
    title: "Responsive Constraints",
    concept:
      "Responsive design is not just stacking. Use min/max widths, wrapping, stable aspect ratios, and sensible breakpoints so content remains usable.",
    inspect: [
      "components/app-sidebar.tsx",
      "components/bets/bet-intake-wrapper.tsx",
    ],
    exercise:
      "Pick one component and predict what happens at mobile width before testing it.",
    check:
      "You can fix overflow without shrinking all text with viewport units.",
  },
  {
    title: "App Router Structure",
    concept:
      "Routes are folders. Layouts persist around pages. Route groups organize without changing the URL. API routes expose server endpoints.",
    inspect: ["app/(chat)/", "app/(chat)/api/bets/"],
    exercise:
      "Map one visible page to its route file and any API route it uses.",
    check: "You can add a new page without guessing where it belongs.",
  },
  {
    title: "Data Fetching Boundaries",
    concept:
      "Fetch data on the server when possible, then pass the smallest useful shape to client components for interaction.",
    inspect: ["lib/db/queries.ts", "app/"],
    exercise: "Trace one page from database query to rendered component props.",
    check: "You can explain why not every component should fetch its own data.",
  },
  {
    title: "Domain UI",
    concept:
      "Frontend skill includes making domain concepts legible. In matched betting, users need to understand accounts, exposure, settlements, promos, and profit without mental translation.",
    inspect: ["specs/data-model.md", "components/bets/"],
    exercise:
      "Choose one domain term and verify that the UI label, data model, and user action use it consistently.",
    check:
      "You can identify where unclear wording could cause a wrong financial action.",
  },
  {
    title: "When To Extract Components",
    concept:
      "Extract when it clarifies ownership or removes meaningful duplication. Avoid abstractions that hide simple markup behind vague names.",
    inspect: ["components/bets/", "components/ui/"],
    exercise:
      "Find two similar UI sections. Decide whether they should share a component or stay separate, and write the reason.",
    check:
      "You can defend an extraction by behavior and responsibility, not just line count.",
  },
  {
    title: "Charts And Visual Summaries",
    concept:
      "Charts should answer a specific question. Choose labels, scales, legends, and colors for comparison and comprehension.",
    inspect: [
      "components/bets/profit-chart.tsx",
      "components/bets/balance-chart.tsx",
    ],
    exercise:
      "Name the question each chart answers and one misreading it should prevent.",
    check:
      "You can remove chart decoration that does not improve interpretation.",
  },
  {
    title: "Dialogs And Sheets",
    concept:
      "Overlays interrupt flow. Use them for focused tasks, confirmations, or contextual editing, with clear cancel and completion paths.",
    inspect: [
      "components/ui/sheet.tsx",
      "components/bets/quick-transaction-sheet.tsx",
    ],
    exercise: "Trace focus and user intent through one sheet or dialog.",
    check:
      "You can explain why the action belongs in an overlay instead of a full page.",
  },
  {
    title: "Optimistic UI",
    concept:
      "Optimistic UI makes latency feel smaller, but it must handle rollback, duplicate submission, and stale data carefully.",
    inspect: [
      "components/bets/bet-settlement-dropdown.tsx",
      "components/bets/individual-bet-actions.tsx",
    ],
    exercise:
      "Find one mutation and list what the user sees before, during, and after the server responds.",
    check:
      "You can identify the rollback path if the server rejects the change.",
  },
  {
    title: "Playwright Basics",
    concept:
      "Good UI tests use user-visible locators, deterministic data, and direct assertions on behavior rather than implementation details.",
    inspect: ["playwright.config.ts", "tests/"],
    exercise:
      "Read one Playwright test and identify the user story it verifies.",
    check:
      "You can write a test using `getByRole` or visible text before reaching for CSS selectors.",
  },
  {
    title: "Visual Verification",
    concept:
      "Frontend work is not done until it has been seen at realistic sizes and states. Check desktop, mobile, loading, empty, and error states where relevant.",
    inspect: ["tests/e2e", "components/bets/"],
    exercise:
      "Pick one page and manually list the viewport/state matrix you would verify after changing it.",
    check:
      "You can catch text overflow and overlapping controls before review.",
  },
  {
    title: "Performance And Client Cost",
    concept:
      "Every client component, library, and effect has a cost. Keep static display on the server and push interactivity only where it earns its keep.",
    inspect: ["package.json", "components/"],
    exercise:
      'Find one component with `"use client"` and decide whether all of its children need to be client-side.',
    check:
      "You can reduce client work without changing the user-visible behavior.",
  },
  {
    title: "Motion With Restraint",
    concept:
      "Motion should confirm cause and effect, guide attention, or smooth state changes. It should not slow down repeated operational workflows.",
    inspect: ["components/bets/", "package.json"],
    exercise:
      "Find one state change that might benefit from motion and one where motion would be noise.",
    check: "You can explain animation duration and purpose in one sentence.",
  },
  {
    title: "Polish Pass",
    concept:
      "Polish is systematic: align edges, normalize spacing, reduce competing emphasis, check copy, and verify interactive states.",
    inspect: [
      "components/bets/dashboard-summary-cards.tsx",
      "components/bets/free-bet-expiry-banner.tsx",
    ],
    exercise:
      "Do a no-code polish review of one component and list five specific improvements.",
    check:
      "Your notes refer to concrete pixels, states, labels, or hierarchy, not vague taste.",
  },
  {
    title: "Refactor Without Changing Behavior",
    concept:
      "A safe UI refactor preserves props, behavior, tests, and visual output while making the structure easier to change next time.",
    inspect: ["components/bets/"],
    exercise:
      "Pick a component over 150 lines and outline a refactor plan with explicit non-goals.",
    check: "You can say what behavior must remain identical.",
  },
  {
    title: "Production Checks",
    concept:
      "Formatting, linting, type checks, builds, and tests catch different classes of problems. Know what each command proves and what it does not.",
    inspect: ["package.json", "playwright.config.ts"],
    exercise:
      "Run or read the available scripts and write what risk each one reduces.",
    check:
      "You can choose the minimum verification set for a small UI-only change.",
  },
  {
    title: "Small Feature Slice",
    concept:
      "A feature slice crosses product intent, data shape, UI, states, and verification. Keep it small enough to finish completely.",
    inspect: ["specs/", "components/bets/"],
    exercise:
      "Choose a tiny improvement, write the user story, identify touched files, and implement it behind existing patterns.",
    check: "The feature can be demonstrated in under one minute.",
  },
  {
    title: "Review Your Own Frontend Work",
    concept:
      "Strong frontend developers review behavior, accessibility, visual hierarchy, data correctness, performance, and maintainability before asking others to review.",
    inspect: ["git diff", "pnpm lint", "pnpm test"],
    exercise:
      "Review your last UI change as if it came from someone else. Write the top three risks and how you checked them.",
    check: "You can name your next frontend skill gap from evidence.",
  },
];

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function readState() {
  if (!existsSync(statePath)) {
    return { dayIndex: -1, lastRunDate: null };
  }

  return JSON.parse(readFileSync(statePath, "utf8"));
}

function writeState(state) {
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function nextState() {
  const state = readState();
  const date = todayKey();

  if (state.lastRunDate === date) {
    return state;
  }

  return {
    dayIndex: Math.min((state.dayIndex ?? -1) + 1, lessons.length - 1),
    lastRunDate: date,
  };
}

function renderLesson(state) {
  const lesson = lessons[state.dayIndex] ?? lessons.at(-1);
  const inspectList = lesson.inspect.map((item) => `- \`${item}\``).join("\n");

  return `# Day ${state.dayIndex + 1}: ${lesson.title}

Date: ${state.lastRunDate}

## Concept

${lesson.concept}

## Inspect

${inspectList}

## Exercise

${lesson.exercise}

## Done When

${lesson.check}

## Commands

\`\`\`bash
pnpm lint
\`\`\`

Only run broader checks when today's exercise includes code changes.
`;
}

function notify(message) {
  try {
    execFileSync("osascript", [
      "-e",
      `display notification ${JSON.stringify(message)} with title "Frontend lesson ready"`,
    ]);
  } catch {
    // Notification support is best-effort; the lesson file is still generated.
  }
}

const state = nextState();
writeState(state);
writeFileSync(outputPath, renderLesson(state));
notify(`Day ${state.dayIndex + 1}: ${lessons[state.dayIndex].title}`);

if (process.argv.includes("--open")) {
  execFileSync("open", [outputPath]);
}

console.log(outputPath);
