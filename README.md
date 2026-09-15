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
data/version.json         Current version/build number, shown in the version badge and used for update checks
preview.html              Single-file build (CSS/JS/data inlined) for quick local viewing
build-preview.js          Node script that regenerates preview.html from the sources above
scripts/bump-version.js   Bumps data/version.json + index.html's cache-busting query strings, then rebuilds preview.html
.github/workflows/bump-version.yml  Runs bump-version.js automatically on every push to main
```

## Features

- **Interview Questions, Exercises & Labs, Best Practices** — three content tabs, each with search, category/tag filters, and per-item review status.
- **Code snippets & references** — a question can carry an optional `snippet` (language-tagged code block) and/or `reference` (a link to further reading), shown alongside its answer.
- **Review status (Understood / Revisit)** — every card has two toggle buttons. Marking a card *Understood* or *Revisit* removes it from the default list and files it under that status's own view (via the status bar above the grid); "Clear this list" resets everything in a bucket back to the default list. State is saved in `localStorage` and survives a page refresh.
- **Mock Exam tab** — pick a question count and optional categories, then self-grade each question (Got it / Partially / Missed it) as you go. Ends with a score, a per-category breakdown, a list of missed questions, and a one-click "mark missed as revisit" action. An in-progress exam is also saved in `localStorage` and resumes after a refresh.
- **Version badge & popover** — a small `vX.Y.Z` pill in the top-right of the header shows the running version (the header's "Vol. N" line tracks the same build number too). Every 5 minutes, and whenever the browser tab regains focus, the page re-fetches `data/version.json` (bypassing the cache) and compares its `build` number to the one the page loaded with. If the live site has moved ahead, a count badge appears on the pill; clicking it opens a popover with the new version number, its release notes, and a one-click "Refresh to update" button — useful since this is a long-lived page people tend to keep open during a study session. Click outside the popover or press Escape to close it.
- **Expandable code snippets** — each snippet has a small expand button in its corner that opens it in the browser's native fullscreen view (larger text, centered, scrollable) for reading longer code comfortably; the same button collapses it back, and Escape/the browser's own fullscreen exit works too.

### Version bumping is automatic

`.github/workflows/bump-version.yml` runs `scripts/bump-version.js` on every push to `main`: it increments `data/version.json`'s `build` by 1, bumps `version`'s patch number (e.g. `1.0.0` → `1.0.1`), sets `releasedAt` to today, copies the triggering commit's first line into `notes`, updates the `?v=` cache-busting query string on `styles.css`/`app.js` in `index.html` to match the new build, regenerates `preview.html`, and pushes that as a `github-actions[bot]` commit tagged `[skip-version-bump]` (which — along with checking the actor — is how the workflow avoids re-triggering itself in a loop).

This means you never hand-edit `data/version.json` — every push gets a new build number automatically, which is what the version badge's "N versions behind" check relies on. If you want a real minor/major release (not just the auto patch bump), edit `version`'s major/minor segment yourself in your commit; the next automatic run will keep incrementing the patch from there.

The workflow needs "Read and write permissions" enabled for the default `GITHUB_TOKEN` (**Settings → Actions → General → Workflow permissions**) — without it, the commit-back step will fail with a permissions error.

After editing `index.html`, `styles.css`, `app.js`, or the data files locally,
regenerate the preview with `node build-preview.js` to check your work —
`preview.html` is not part of the deployed site and is never referenced by it;
the version-bump workflow also regenerates it on every push regardless.

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
