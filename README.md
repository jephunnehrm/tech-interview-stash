# The Stash

A static, accessible archive of technical interview questions and real-world
exercises/labs. Plain HTML, CSS, and vanilla JS — no build step, no
dependencies, deploys as-is to GitHub Pages.

## Structure

```
index.html                Page structure, ARIA tabs, <template> card markup
styles.css                Card-catalog themed styling
app.js                    Fetches JSON data, renders filters/cards, wires up tabs, review status, and the mock exam
data/questions.json       Interview Q&A entries (optionally carry a code snippet and a reference link)
data/exercises.json       Exercises & labs entries
data/best-practices.json  Best-practice entries, tagged and searchable
data/version.json         Current version/build number, shown in the footer and used for update checks
preview.html              Single-file build (CSS/JS/data inlined) for quick local viewing
build-preview.js          Node script that regenerates preview.html from the sources above
```

## Features

- **Interview Questions, Exercises & Labs, Best Practices** — three content tabs, each with search, category/tag filters, and per-item review status.
- **Code snippets & references** — a question can carry an optional `snippet` (language-tagged code block) and/or `reference` (a link to further reading), shown alongside its answer.
- **Review status (Understood / Revisit)** — every card has two toggle buttons. Marking a card *Understood* or *Revisit* removes it from the default list and files it under that status's own view (via the status bar above the grid); "Clear this list" resets everything in a bucket back to the default list. State is saved in `localStorage` and survives a page refresh.
- **Mock Exam tab** — pick a question count and optional categories, then self-grade each question (Got it / Partially / Missed it) as you go. Ends with a score, a per-category breakdown, a list of missed questions, and a one-click "mark missed as revisit" action. An in-progress exam is also saved in `localStorage` and resumes after a refresh.
- **Version badge & popover** — a small `vX.Y.Z` pill in the top-right of the header shows the running version. Every 5 minutes, and whenever the browser tab regains focus, the page re-fetches `data/version.json` (bypassing the cache) and compares its `build` number to the one the page loaded with. If the live site has moved ahead, a count badge appears on the pill; clicking it opens a popover with the new version number, its release notes, and a one-click "Refresh to update" button — useful since this is a long-lived page people tend to keep open during a study session. Click outside the popover or press Escape to close it.

### Bumping the version

Whenever you push a change that affects what a visitor sees (content or code), bump `data/version.json`:

```json
{
  "version": "1.1.0",
  "build": 2,
  "releasedAt": "2026-09-20",
  "notes": "One-line summary of what changed."
}
```

- `build` must strictly increase by at least 1 on every release — it's the only field the update-notifier actually compares.
- `version` is the human-readable string shown in the badge and its popover; bump it following normal semver judgment.
- Skipping this file on a content-only commit just means visitors with the page already open won't be notified of that change — it won't break anything.

If a change touches `styles.css` or `app.js` specifically, also bump the `?v=1` query string on their `<link>`/`<script>` tags in `index.html` (to the same number as `build` is simplest). GitHub Pages caches static assets for ~10 minutes (`Cache-Control: max-age=600`); a plain refresh within that window can still serve the old file from cache, but changing the query string makes it a new URL the browser has never cached, so the fix is guaranteed to load immediately rather than depending on the cache expiring.

After editing `index.html`, `styles.css`, `app.js`, or the data files, regenerate
the preview with `node build-preview.js`. `preview.html` is not part of the
deployed site and is never referenced by it.

## Running locally

Because `app.js` fetches the JSON files with `fetch()`, opening `index.html`
directly from the filesystem (`file://`) will fail in most browsers due to
CORS restrictions on local file access. Serve the folder instead, for example:

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

If you just need to eyeball the design without a server, open `preview.html`
directly — it has the CSS, JS, and seed data all inlined so it needs no fetch.

## Contributing content

Adding a new question, exercise, category, or role never requires touching
`index.html`, `styles.css`, or `app.js` — only the JSON data files.

### Adding an interview question

Edit `data/questions.json` and append an entry:

```json
{
  "id": "q-unique-id",
  "category": "SQL & Databases",
  "question": "Your question text",
  "answer": "Your answer text. Use \n\n for a paragraph break.",
  "snippet": { "language": "sql", "code": "SELECT ..." },
  "reference": { "label": "Learn more label", "url": "https://..." }
}
```

- `id` must be unique across the file.
- `category` can be an existing category or a brand-new one — new categories
  automatically appear in the sidebar filter with no code changes.
- `snippet` and `reference` are both optional. Only add a `reference` URL you're
  confident is a real, stable page (official docs preferred) — omit it rather than guess.

### Adding a best practice

Edit `data/best-practices.json` and append an entry:

```json
{
  "id": "bp-unique-id",
  "category": ".NET",
  "title": "Short imperative title",
  "description": "Why this practice matters, in a sentence or two.",
  "tags": ["async", "performance"]
}
```

- `id` must be unique across the file.
- `category` and `tags` both feed the Best Practices tab's filter chips automatically.

### Adding an exercise / lab

Edit `data/exercises.json` and append an entry:

```json
{
  "id": "e-unique-id",
  "role": "Architect",
  "problem": "The real-world problem statement",
  "solution": "The solution/approach. Use \n\n for a paragraph break."
}
```

- `id` must be unique across the file.
- `role` can be an existing role (Developer, Tech Lead, Architect, Product
  Owner) or a new one — new roles automatically appear in the sidebar filter.

## Deploying to GitHub Pages

1. Push this repository to GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select the branch (e.g. `main`) and the `/ (root)` folder.
5. Save — GitHub Pages will publish `index.html` at the provided URL.

No build step is required; the site is served exactly as committed.

## Accessibility notes

- Tabs follow the [WAI-ARIA Authoring Practices tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)
  with roving `tabindex` and arrow-key navigation.
- Each answer/solution toggle follows the
  [disclosure pattern](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/):
  `aria-expanded` on the button, `aria-controls` pointing at the panel, and an
  accessible label that updates between "Show"/"Hide" states.
- A skip-to-content link is provided for keyboard and screen reader users.
- Focus is always visible (`:focus-visible` outlines) on interactive elements.
- Layout and colors respect `prefers-reduced-motion` and meet WCAG AA contrast
  ratios.
