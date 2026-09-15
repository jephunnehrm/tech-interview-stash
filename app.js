(function () {
  "use strict";

  /** @typedef {{ id: string, category: string, question: string, answer: string, snippet?: {language: string, code: string}, reference?: {label: string, url: string} }} QuestionEntry */
  /** @typedef {{ id: string, role: string, problem: string, solution: string, snippet?: {language: string, code: string}, reference?: {label: string, url: string} }} ExerciseEntry */
  /** @typedef {{ id: string, category: string, title: string, description: string, tags: string[] }} PracticeEntry */

  const STORAGE_KEYS = {
    status: "stash:status:v1",
    activeTab: "stash:activeTab:v1",
    exam: "stash:exam:v1",
    interview: "stash:interview:v1",
  };

  const VERSION_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  // UI-only grouping of the (flat) question categories, for the sidebar and Interview Mode.
  // Adding a brand-new category to data/questions.json is still all that's required for it to
  // show up in the app — it just lands in an "Other" group here until added to a list below.
  const CATEGORY_GROUPS = [
    {
      label: ".NET",
      categories: [
        "C#: Language & Types",
        "C#: Memory & Runtime",
        "C#: Async & Concurrency",
        ".NET & C# Version Features",
        ".NET Core",
        "Legacy .NET & WCF",
      ],
    },
    { label: "Databases", categories: ["SQL & Databases", "T-SQL & SQL Server"] },
    {
      label: "Identity & Security",
      categories: ["Identity & OAuth", "Entra ID", "Okta", "IAM", "Security"],
    },
    {
      label: "Frontend",
      categories: ["JavaScript", "TypeScript", "React", "Vue", "Angular", "HTML & CSS"],
    },
    {
      label: "Architecture",
      categories: [
        "System Design",
        "Design Patterns",
        "Microservices",
        "Distributed Systems & Scalability",
        "Object-Oriented Programming",
      ],
    },
    {
      label: "Cloud",
      categories: ["Azure & Azure DevOps", "AWS", "Docker & Containers", "Kubernetes"],
    },
    {
      label: "DevOps",
      categories: [
        "CI/CD",
        "Git & Version Control",
        "Agile & DevOps Practices",
        "PowerShell & Python Scripting",
        "Power Platform",
      ],
    },
    { label: "Testing", categories: ["Testing"] },
    { label: "AI", categories: ["AI for Developers"] },
    {
      label: "Production",
      categories: [
        "Production Troubleshooting",
        "Monitoring & Observability",
        "Application Support & ITSM",
      ],
    },
    { label: "Staff Engineer", categories: ["Staff Engineer"] },
    { label: "Behavioral", categories: ["Leadership & Behavioral"] },
  ];

  // Interview Mode's fixed 60-minute agenda: label, minutes, and which category group(s) (or,
  // for Coding, which exercises role) it draws questions from.
  const INTERVIEW_SECTIONS = [
    { key: "intro", label: "Introduction", minutes: 5, kind: "intro" },
    {
      key: "csharp",
      label: "C# / .NET",
      minutes: 10,
      kind: "questions",
      categories: ["C#: Language & Types", "C#: Memory & Runtime", "C#: Async & Concurrency", ".NET & C# Version Features"],
    },
    { key: "backend", label: "API / Backend", minutes: 10, kind: "questions", categories: [".NET Core"] },
    { key: "sql", label: "SQL", minutes: 10, kind: "questions", categories: ["SQL & Databases", "T-SQL & SQL Server"] },
    {
      key: "design",
      label: "System Design",
      minutes: 10,
      kind: "questions",
      categories: ["System Design", "Microservices", "Distributed Systems & Scalability", "Design Patterns"],
    },
    { key: "coding", label: "Coding (no AI, no Google)", minutes: 10, kind: "coding", role: "Coding & Algorithms" },
    { key: "behavioral", label: "Behavioral", minutes: 5, kind: "questions", categories: ["Leadership & Behavioral"] },
  ];

  const state = {
    questions: /** @type {QuestionEntry[]} */ ([]),
    exercises: /** @type {ExerciseEntry[]} */ ([]),
    bestPractices: /** @type {PracticeEntry[]} */ ([]),
    activeCategories: new Set(),
    activeRoles: new Set(),
    activeBpCategories: new Set(),
    activeBpTags: new Set(),
    searchQuestions: "",
    searchExercises: "",
    searchBestPractices: "",
    statusMap: new Map(),
    statusView: { questions: "active", exercises: "active", bestpractices: "active" },
    examCategories: new Set(),
    exam: null,
    interview: null,
    localVersion: null,
  };

  let interviewTimerId = null;

  const els = {
    tabQuestions: document.getElementById("tab-questions"),
    tabExercises: document.getElementById("tab-exercises"),
    tabBestPractices: document.getElementById("tab-bestpractices"),
    tabExam: document.getElementById("tab-exam"),
    tabInterview: document.getElementById("tab-interview"),
    panelQuestions: document.getElementById("panel-questions"),
    panelExercises: document.getElementById("panel-exercises"),
    panelBestPractices: document.getElementById("panel-bestpractices"),
    panelExam: document.getElementById("panel-exam"),
    panelInterview: document.getElementById("panel-interview"),
    layout: document.getElementById("layout"),
    sidebar: document.getElementById("sidebar"),
    categoryFilterPanel: document.querySelector('[data-filter-panel="questions"]'),
    roleFilterPanel: document.querySelector('[data-filter-panel="exercises"]'),
    bpFilterPanel: document.querySelector('[data-filter-panel="bestpractices"]'),
    categoryFilters: document.getElementById("category-filters"),
    roleFilters: document.getElementById("role-filters"),
    bpCategoryFilters: document.getElementById("bp-category-filters"),
    bpTagFilters: document.getElementById("bp-tag-filters"),
    bpTagFilterToggle: document.getElementById("bp-tag-filter-toggle"),
    questionsGrid: document.getElementById("questions-grid"),
    exercisesGrid: document.getElementById("exercises-grid"),
    bestPracticesGrid: document.getElementById("bestpractices-grid"),
    searchQuestions: document.getElementById("search-questions"),
    searchExercises: document.getElementById("search-exercises"),
    searchBestPractices: document.getElementById("search-bestpractices"),
    questionsCount: document.getElementById("questions-count"),
    exercisesCount: document.getElementById("exercises-count"),
    bestPracticesCount: document.getElementById("bestpractices-count"),
    questionsEmpty: document.getElementById("questions-empty"),
    exercisesEmpty: document.getElementById("exercises-empty"),
    bestPracticesEmpty: document.getElementById("bestpractices-empty"),
    questionTemplate: document.getElementById("question-card-template"),
    exerciseTemplate: document.getElementById("exercise-card-template"),
    practiceTemplate: document.getElementById("practice-card-template"),
    questionsStatusBar: document.getElementById("questions-status-bar"),
    exercisesStatusBar: document.getElementById("exercises-status-bar"),
    bestPracticesStatusBar: document.getElementById("bestpractices-status-bar"),
    // Exam
    examSetup: document.getElementById("exam-setup"),
    examQuiz: document.getElementById("exam-quiz"),
    examResults: document.getElementById("exam-results"),
    examCount: document.getElementById("exam-count"),
    examCategoryChecks: document.getElementById("exam-category-checks"),
    examPoolNote: document.getElementById("exam-pool-note"),
    examStartBtn: document.getElementById("exam-start-btn"),
    examProgressLabel: document.getElementById("exam-progress-label"),
    examProgressFill: document.getElementById("exam-progress-fill"),
    examQuestionTag: document.getElementById("exam-question-tag"),
    examQuestionPrompt: document.getElementById("exam-question-prompt"),
    examRevealBtn: document.getElementById("exam-reveal-btn"),
    examAnswer: document.getElementById("exam-answer"),
    examSnippet: document.getElementById("exam-snippet"),
    examReference: document.getElementById("exam-reference"),
    examGradeActions: document.getElementById("exam-grade-actions"),
    examQuitBtn: document.getElementById("exam-quit-btn"),
    examScoreHeadline: document.getElementById("exam-score-headline"),
    examBreakdown: document.getElementById("exam-breakdown"),
    examMissedList: document.getElementById("exam-missed-list"),
    examRevisitMissedBtn: document.getElementById("exam-revisit-missed-btn"),
    examRetakeBtn: document.getElementById("exam-retake-btn"),
    // Version badge / popover
    siteEyebrow: document.getElementById("site-eyebrow"),
    versionWidget: document.getElementById("version-widget"),
    versionBadge: document.getElementById("version-badge"),
    versionBadgeLabel: document.getElementById("version-badge-label"),
    versionBadgeCount: document.getElementById("version-badge-count"),
    versionPopover: document.getElementById("version-popover"),
    versionPopoverCurrent: document.getElementById("version-popover-current"),
    versionPopoverUpToDate: document.getElementById("version-popover-uptodate"),
    versionPopoverAvailable: document.getElementById("version-popover-available"),
    versionPopoverHeadline: document.getElementById("version-popover-headline"),
    versionPopoverNotes: document.getElementById("version-popover-notes"),
    versionPopoverRefresh: document.getElementById("version-popover-refresh"),
    // Interview Mode
    interviewSetup: document.getElementById("interview-setup"),
    interviewSession: document.getElementById("interview-session"),
    interviewResults: document.getElementById("interview-results"),
    interviewAgenda: document.getElementById("interview-agenda"),
    interviewStartBtn: document.getElementById("interview-start-btn"),
    interviewSectionLabel: document.getElementById("interview-section-label"),
    interviewTimer: document.getElementById("interview-timer"),
    interviewProgressLabel: document.getElementById("interview-progress-label"),
    interviewProgressFill: document.getElementById("interview-progress-fill"),
    interviewNoAiBanner: document.getElementById("interview-noai-banner"),
    interviewQuestionTag: document.getElementById("interview-question-tag"),
    interviewQuestionPrompt: document.getElementById("interview-question-prompt"),
    interviewYourAnswer: document.getElementById("interview-your-answer"),
    interviewRevealBtn: document.getElementById("interview-reveal-btn"),
    interviewAnswer: document.getElementById("interview-answer"),
    interviewSnippet: document.getElementById("interview-snippet"),
    interviewReference: document.getElementById("interview-reference"),
    interviewGradeActions: document.getElementById("interview-grade-actions"),
    interviewNextNoScoreBtn: document.getElementById("interview-next-noscore-btn"),
    interviewSkipSectionBtn: document.getElementById("interview-skip-section-btn"),
    interviewQuitBtn: document.getElementById("interview-quit-btn"),
    interviewScoreHeadline: document.getElementById("interview-score-headline"),
    interviewBreakdown: document.getElementById("interview-breakdown"),
    interviewMissedList: document.getElementById("interview-missed-list"),
    interviewCopyAiPromptBtn: document.getElementById("interview-copy-ai-prompt-btn"),
    interviewRevisitMissedBtn: document.getElementById("interview-revisit-missed-btn"),
    interviewRetakeBtn: document.getElementById("interview-retake-btn"),
  };

  init();

  async function init() {
    loadStatusMap();
    wireTabs();
    wireStatusBar(els.questionsStatusBar, "questions", renderQuestions);
    wireStatusBar(els.exercisesStatusBar, "exercises", renderExercises);
    wireStatusBar(els.bestPracticesStatusBar, "bestpractices", renderBestPractices);

    const [questions, exercises, bestPractices] = await Promise.all([
      fetchJson("data/questions.json"),
      fetchJson("data/exercises.json"),
      fetchJson("data/best-practices.json"),
    ]);

    state.questions = questions || [];
    state.exercises = exercises || [];
    state.bestPractices = bestPractices || [];

    renderGroupedFilterChips({
      container: els.categoryFilters,
      groups: CATEGORY_GROUPS,
      values: uniqueSorted(state.questions.map((q) => q.category)),
      activeSet: state.activeCategories,
      onChange: renderQuestions,
    });

    renderFilterChips({
      container: els.roleFilters,
      values: uniqueSorted(state.exercises.map((e) => e.role)),
      activeSet: state.activeRoles,
      onChange: renderExercises,
    });

    renderFilterChips({
      container: els.bpCategoryFilters,
      values: uniqueSorted(state.bestPractices.map((p) => p.category)),
      activeSet: state.activeBpCategories,
      onChange: renderBestPractices,
    });

    renderFilterChips({
      container: els.bpTagFilters,
      values: uniqueSorted(state.bestPractices.flatMap((p) => p.tags || [])),
      activeSet: state.activeBpTags,
      onChange: renderBestPractices,
      small: true,
    });

    els.bpTagFilterToggle.addEventListener("click", () => {
      const expanded = els.bpTagFilterToggle.getAttribute("aria-expanded") === "true";
      const next = !expanded;
      els.bpTagFilterToggle.setAttribute("aria-expanded", String(next));
      els.bpTagFilters.hidden = !next;
    });

    els.searchQuestions.addEventListener("input", () => {
      state.searchQuestions = els.searchQuestions.value;
      renderQuestions();
    });

    els.searchExercises.addEventListener("input", () => {
      state.searchExercises = els.searchExercises.value;
      renderExercises();
    });

    els.searchBestPractices.addEventListener("input", () => {
      state.searchBestPractices = els.searchBestPractices.value;
      renderBestPractices();
    });

    renderQuestions();
    renderExercises();
    renderBestPractices();

    initExam();
    initInterviewMode();
    initVersionCheck();
  }

  async function fetchJson(path) {
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error(err);
      return [];
    }
  }

  function uniqueSorted(values) {
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
  }

  /* ---------------------------------- Persisted review status ---------------------------------- */

  function loadStatusMap() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.status);
      const obj = raw ? JSON.parse(raw) : {};
      state.statusMap = new Map(Object.entries(obj));
    } catch (err) {
      console.error("Failed to load saved status", err);
      state.statusMap = new Map();
    }
  }

  function saveStatusMap() {
    try {
      const obj = Object.fromEntries(state.statusMap);
      localStorage.setItem(STORAGE_KEYS.status, JSON.stringify(obj));
    } catch (err) {
      console.error("Failed to save status", err);
    }
  }

  function getStatus(id) {
    return state.statusMap.get(id) || "active";
  }

  function toggleStatus(id, status, onChange) {
    const current = state.statusMap.get(id);
    if (current === status) {
      state.statusMap.delete(id);
    } else {
      state.statusMap.set(id, status);
    }
    saveStatusMap();
    onChange();
  }

  function clearStatusBucket(items, bucket, onChange) {
    items.forEach((item) => {
      if (state.statusMap.get(item.id) === bucket) state.statusMap.delete(item.id);
    });
    saveStatusMap();
    onChange();
  }

  function wireStatusBar(barEl, key, onChange) {
    const buttons = barEl.querySelectorAll(".status-btn");
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        state.statusView[key] = btn.dataset.status;
        onChange();
      });
    });
    const clearBtn = barEl.querySelector(".status-clear-btn");
    clearBtn.dataset.forKey = key;
  }

  function updateStatusBar(barEl, view, counts, fullItems, onChange) {
    const buttons = barEl.querySelectorAll(".status-btn");
    buttons.forEach((btn) => {
      const status = btn.dataset.status;
      btn.setAttribute("aria-pressed", String(status === view));
      const countEl = btn.querySelector(".status-btn__count");
      if (countEl) countEl.textContent = `(${counts[status] || 0})`;
    });
    const clearBtn = barEl.querySelector(".status-clear-btn");
    if (view === "active") {
      clearBtn.hidden = true;
    } else {
      clearBtn.hidden = false;
      clearBtn.textContent = `Clear this list (${counts[view] || 0})`;
      clearBtn.onclick = () => clearStatusBucket(fullItems, view, onChange);
    }
  }

  /* ---------------------------------- Filter chips ---------------------------------- */

  function renderFilterChips({ container, values, activeSet, onChange, small }) {
    container.innerHTML = "";

    const allButton = createChip({
      label: "All",
      pressed: activeSet.size === 0,
      small,
      onClick: () => {
        activeSet.clear();
        syncChipStates(container, activeSet);
        onChange();
      },
    });
    container.appendChild(allButton);

    values.forEach((value) => {
      const button = createChip({
        label: value,
        pressed: activeSet.has(value),
        small,
        onClick: () => {
          if (activeSet.has(value)) {
            activeSet.delete(value);
          } else {
            activeSet.add(value);
          }
          syncChipStates(container, activeSet);
          onChange();
        },
      });
      button.dataset.value = value;
      container.appendChild(button);
    });
  }

  function renderGroupedFilterChips({ container, groups, values, activeSet, onChange }) {
    container.innerHTML = "";

    const allWrap = document.createElement("div");
    allWrap.className = "chip-list category-filters__all";
    allWrap.appendChild(
      createChip({
        label: "All",
        pressed: activeSet.size === 0,
        onClick: () => {
          activeSet.clear();
          syncChipStates(container, activeSet);
          onChange();
        },
      })
    );
    container.appendChild(allWrap);

    const expandAllBtn = document.createElement("button");
    expandAllBtn.type = "button";
    expandAllBtn.className = "filter-group__expand-all";
    let allExpanded = false;
    const groupToggles = [];

    const setAllExpanded = (expanded) => {
      allExpanded = expanded;
      groupToggles.forEach(({ toggle, chipList }) => {
        toggle.setAttribute("aria-expanded", String(expanded));
        chipList.hidden = !expanded;
      });
      expandAllBtn.textContent = expanded ? "Hide categories" : "Show all categories";
    };

    expandAllBtn.addEventListener("click", () => setAllExpanded(!allExpanded));
    container.appendChild(expandAllBtn);

    const grouped = new Set();

    const renderGroup = (label, categoryValues) => {
      const section = document.createElement("div");
      section.className = "filter-group";

      const chipListId = `filter-group-${slugify(label)}`;

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "filter-group__toggle";
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-controls", chipListId);
      const heading = document.createElement("span");
      heading.className = "sidebar__heading";
      heading.textContent = label;
      toggle.appendChild(heading);
      toggle.insertAdjacentHTML(
        "beforeend",
        '<svg class="icon icon-chevron" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 10l5 5 5-5z"/></svg>'
      );

      const chipList = document.createElement("div");
      chipList.className = "chip-list chip-list--wrap";
      chipList.id = chipListId;
      chipList.hidden = true;

      categoryValues.forEach((value) => {
        const chip = createChip({
          label: value,
          pressed: activeSet.has(value),
          onClick: () => {
            if (activeSet.has(value)) {
              activeSet.delete(value);
            } else {
              activeSet.add(value);
            }
            syncChipStates(container, activeSet);
            onChange();
          },
        });
        chip.dataset.value = value;
        chipList.appendChild(chip);
      });

      toggle.addEventListener("click", () => {
        const expanded = toggle.getAttribute("aria-expanded") === "true";
        toggle.setAttribute("aria-expanded", String(!expanded));
        chipList.hidden = expanded;
      });

      groupToggles.push({ toggle, chipList });

      section.appendChild(toggle);
      section.appendChild(chipList);
      container.appendChild(section);
    };

    groups.forEach(({ label, categories }) => {
      const inGroup = categories.filter((c) => values.includes(c));
      if (!inGroup.length) return;
      inGroup.forEach((c) => grouped.add(c));
      renderGroup(label, inGroup);
    });

    const leftover = values.filter((v) => !grouped.has(v));
    if (leftover.length) renderGroup("Other", leftover);

    setAllExpanded(false);
  }

  function slugify(label) {
    return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  function createChip({ label, pressed, onClick, small }) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = small ? "chip chip--small" : "chip";
    button.setAttribute("aria-pressed", String(pressed));
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  function syncChipStates(container, activeSet) {
    const chips = container.querySelectorAll(".chip");
    chips.forEach((chip) => {
      const value = chip.dataset.value;
      if (value === undefined) {
        chip.setAttribute("aria-pressed", String(activeSet.size === 0));
      } else {
        chip.setAttribute("aria-pressed", String(activeSet.has(value)));
      }
    });
  }

  /* ---------------------------------- Cards ---------------------------------- */

  function matchesQuery(query, ...fields) {
    if (!query) return true;
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return fields.some((field) => field && field.toLowerCase().includes(needle));
  }

  function renderQuestions() {
    let filtered = state.activeCategories.size
      ? state.questions.filter((q) => state.activeCategories.has(q.category))
      : state.questions;

    filtered = filtered.filter((q) =>
      matchesQuery(state.searchQuestions, q.question, q.answer, q.category)
    );

    const counts = statusCounts(filtered);
    updateStatusBar(els.questionsStatusBar, state.statusView.questions, counts, filtered, renderQuestions);

    const visible = filtered.filter((q) => getStatus(q.id) === state.statusView.questions);

    els.questionsGrid.innerHTML = "";
    visible.forEach((entry) => {
      els.questionsGrid.appendChild(
        buildCard({
          template: els.questionTemplate,
          idPrefix: "question",
          entry,
          tag: entry.category,
          prompt: entry.question,
          reveal: entry.answer,
          showLabel: "Show answer",
          hideLabel: "Hide answer",
          onStatusChange: renderQuestions,
        })
      );
    });

    updateCount(els.questionsCount, visible.length, filtered.length, "question");
    els.questionsEmpty.hidden = visible.length !== 0;
  }

  function renderExercises() {
    let filtered = state.activeRoles.size
      ? state.exercises.filter((e) => state.activeRoles.has(e.role))
      : state.exercises;

    filtered = filtered.filter((e) =>
      matchesQuery(state.searchExercises, e.problem, e.solution, e.role)
    );

    const counts = statusCounts(filtered);
    updateStatusBar(els.exercisesStatusBar, state.statusView.exercises, counts, filtered, renderExercises);

    const visible = filtered.filter((e) => getStatus(e.id) === state.statusView.exercises);

    els.exercisesGrid.innerHTML = "";
    visible.forEach((entry) => {
      els.exercisesGrid.appendChild(
        buildCard({
          template: els.exerciseTemplate,
          idPrefix: "exercise",
          entry,
          tag: entry.role,
          prompt: entry.problem,
          reveal: entry.solution,
          showLabel: "Show solution",
          hideLabel: "Hide solution",
          onStatusChange: renderExercises,
        })
      );
    });

    updateCount(els.exercisesCount, visible.length, filtered.length, "exercise");
    els.exercisesEmpty.hidden = visible.length !== 0;
  }

  function renderBestPractices() {
    let filtered = state.activeBpCategories.size
      ? state.bestPractices.filter((p) => state.activeBpCategories.has(p.category))
      : state.bestPractices;

    if (state.activeBpTags.size) {
      filtered = filtered.filter((p) => (p.tags || []).some((t) => state.activeBpTags.has(t)));
    }

    filtered = filtered.filter((p) =>
      matchesQuery(state.searchBestPractices, p.title, p.description, p.category, (p.tags || []).join(" "))
    );

    const counts = statusCounts(filtered);
    updateStatusBar(els.bestPracticesStatusBar, state.statusView.bestpractices, counts, filtered, renderBestPractices);

    const visible = filtered.filter((p) => getStatus(p.id) === state.statusView.bestpractices);

    els.bestPracticesGrid.innerHTML = "";
    visible.forEach((entry) => {
      els.bestPracticesGrid.appendChild(buildPracticeCard(entry, renderBestPractices));
    });

    updateCount(els.bestPracticesCount, visible.length, filtered.length, "best practice");
    els.bestPracticesEmpty.hidden = visible.length !== 0;
  }

  function statusCounts(items) {
    const counts = { active: 0, understood: 0, revisit: 0 };
    items.forEach((item) => {
      const status = getStatus(item.id);
      counts[status] = (counts[status] || 0) + 1;
    });
    return counts;
  }

  function updateCount(el, shown, total, noun) {
    const plural = shown === 1 ? noun : `${noun}s`;
    el.textContent =
      shown === total
        ? `${total} ${plural}`
        : `${shown} of ${total} ${total === 1 ? noun : `${noun}s`}`;
  }

  function wireStatusToggles(card, id, onStatusChange) {
    const understoodBtn = card.querySelector(".status-toggle--understood");
    const revisitBtn = card.querySelector(".status-toggle--revisit");
    const current = getStatus(id);
    understoodBtn.setAttribute("aria-pressed", String(current === "understood"));
    revisitBtn.setAttribute("aria-pressed", String(current === "revisit"));
    understoodBtn.addEventListener("click", () => toggleStatus(id, "understood", onStatusChange));
    revisitBtn.addEventListener("click", () => toggleStatus(id, "revisit", onStatusChange));
  }

  function populateSnippetAndReference(container, entry) {
    const snippetEl = container.querySelector(".card__snippet");
    const codeEl = snippetEl ? snippetEl.querySelector("code") : null;
    const referenceEl = container.querySelector(".card__reference");

    if (entry.snippet && entry.snippet.code) {
      codeEl.textContent = entry.snippet.code;
      // stays hidden (per the template default) until the reveal toggle shows it alongside the answer
    } else if (snippetEl) {
      snippetEl.hidden = true;
    }

    if (entry.reference && entry.reference.url) {
      referenceEl.textContent = `${entry.reference.label || "Learn more"} ↗`;
      referenceEl.href = entry.reference.url;
      // stays hidden until the reveal toggle shows it alongside the answer
    } else if (referenceEl) {
      referenceEl.hidden = true;
    }
  }

  function attachSnippetExpand(snippetEl) {
    if (!snippetEl) return;
    const btn = snippetEl.querySelector(".snippet-expand-btn");
    if (!btn) return;
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      if (document.fullscreenElement === snippetEl) {
        document.exitFullscreen();
      } else if (snippetEl.requestFullscreen) {
        snippetEl.requestFullscreen().catch((err) => console.error("Fullscreen request failed", err));
      }
    });
  }

  document.addEventListener("fullscreenchange", () => {
    const current = document.fullscreenElement;
    document.querySelectorAll(".snippet-expand-btn").forEach((btn) => {
      const snippetEl = btn.closest(".card__snippet");
      const isFullscreen = snippetEl === current;
      btn.setAttribute("aria-pressed", String(isFullscreen));
      btn.setAttribute("aria-label", isFullscreen ? "Collapse code snippet" : "Expand code snippet");
      const expandIcon = btn.querySelector(".icon-expand");
      const collapseIcon = btn.querySelector(".icon-collapse");
      if (expandIcon) expandIcon.hidden = isFullscreen;
      if (collapseIcon) collapseIcon.hidden = !isFullscreen;
    });
  });

  function buildCard({ template, idPrefix, entry, tag, prompt, reveal, showLabel, hideLabel, onStatusChange }) {
    const fragment = template.content.cloneNode(true);
    const card = fragment.querySelector(".card");
    const tagEl = fragment.querySelector(".card__tag");
    const promptEl = fragment.querySelector(".card__prompt");
    const answerEl = fragment.querySelector(".card__answer");
    const button = fragment.querySelector(".reveal-btn");
    const label = fragment.querySelector(".reveal-btn__label");
    const eyeIcon = fragment.querySelector(".icon-eye");
    const eyeOffIcon = fragment.querySelector(".icon-eye-off");

    const answerId = `${idPrefix}-answer-${entry.id}`;

    tagEl.textContent = tag;
    promptEl.textContent = prompt;
    answerEl.textContent = reveal;
    answerEl.id = answerId;
    button.setAttribute("aria-controls", answerId);
    label.textContent = showLabel;

    populateSnippetAndReference(fragment, entry);
    attachSnippetExpand(fragment.querySelector(".card__snippet"));
    wireStatusToggles(fragment, entry.id, onStatusChange);

    button.addEventListener("click", () => {
      const expanded = button.getAttribute("aria-expanded") === "true";
      const next = !expanded;
      button.setAttribute("aria-expanded", String(next));
      answerEl.hidden = !next;
      label.textContent = next ? hideLabel : showLabel;
      eyeIcon.hidden = next;
      eyeOffIcon.hidden = !next;
      const snippetEl = card.querySelector(".card__snippet");
      const referenceEl = card.querySelector(".card__reference");
      if (snippetEl && entry.snippet) snippetEl.hidden = !next;
      if (referenceEl && entry.reference) referenceEl.hidden = !next;
    });

    return card;
  }

  function buildPracticeCard(entry, onStatusChange) {
    const fragment = els.practiceTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".card");
    const tagEl = fragment.querySelector(".card__tag");
    const titleEl = fragment.querySelector(".card__prompt--title");
    const descEl = fragment.querySelector(".card__answer--practice");
    const tagsEl = fragment.querySelector(".card__tags");

    tagEl.textContent = entry.category;
    titleEl.textContent = entry.title;
    descEl.textContent = entry.description;

    (entry.tags || []).forEach((tag) => {
      const span = document.createElement("span");
      span.className = "tag-chip";
      span.textContent = tag;
      tagsEl.appendChild(span);
    });

    wireStatusToggles(fragment, entry.id, onStatusChange);

    return card;
  }

  /* ---------------------------------- Tabs (WAI-ARIA APG pattern) ---------------------------------- */

  function wireTabs() {
    const tabs = [els.tabQuestions, els.tabExercises, els.tabBestPractices, els.tabExam, els.tabInterview];
    const panels = {
      "tab-questions": els.panelQuestions,
      "tab-exercises": els.panelExercises,
      "tab-bestpractices": els.panelBestPractices,
      "tab-exam": els.panelExam,
      "tab-interview": els.panelInterview,
    };
    const filterPanels = {
      "tab-questions": els.categoryFilterPanel,
      "tab-exercises": els.roleFilterPanel,
      "tab-bestpractices": els.bpFilterPanel,
      "tab-exam": null,
      "tab-interview": null,
    };

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => activateTab(tab));
      tab.addEventListener("keydown", (event) => {
        const currentIndex = tabs.indexOf(tab);
        let nextIndex = null;

        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
          nextIndex = (currentIndex + 1) % tabs.length;
        } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
          nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        } else if (event.key === "Home") {
          nextIndex = 0;
        } else if (event.key === "End") {
          nextIndex = tabs.length - 1;
        }

        if (nextIndex !== null) {
          event.preventDefault();
          tabs[nextIndex].focus();
          activateTab(tabs[nextIndex]);
        }
      });
    });

    function activateTab(tab) {
      tabs.forEach((t) => {
        const selected = t === tab;
        t.setAttribute("aria-selected", String(selected));
        t.tabIndex = selected ? 0 : -1;
        panels[t.id].hidden = !selected;
        const filterPanel = filterPanels[t.id];
        if (filterPanel) filterPanel.hidden = !selected;
      });

      const showSidebar = tab.id !== "tab-exam" && tab.id !== "tab-interview";
      els.sidebar.hidden = !showSidebar;
      els.layout.classList.toggle("no-sidebar", !showSidebar);

      try {
        localStorage.setItem(STORAGE_KEYS.activeTab, tab.id);
      } catch (err) {
        console.error("Failed to persist active tab", err);
      }
    }

    let restoredTabId = null;
    try {
      restoredTabId = localStorage.getItem(STORAGE_KEYS.activeTab);
    } catch (err) {
      console.error("Failed to read persisted active tab", err);
    }
    const restoredTab = tabs.find((t) => t.id === restoredTabId);
    if (restoredTab) activateTab(restoredTab);
  }

  /* ---------------------------------- Mock exam ---------------------------------- */

  function initExam() {
    attachSnippetExpand(els.examSnippet);

    renderFilterChips({
      container: els.examCategoryChecks,
      values: uniqueSorted(state.questions.map((q) => q.category)),
      activeSet: state.examCategories,
      onChange: updateExamPoolNote,
    });

    els.examCount.addEventListener("change", updateExamPoolNote);
    updateExamPoolNote();

    els.examStartBtn.addEventListener("click", startExam);
    els.examRevealBtn.addEventListener("click", revealExamAnswer);
    els.examQuitBtn.addEventListener("click", () => finishExam(true));
    els.examGradeActions.querySelectorAll(".grade-btn").forEach((btn) => {
      btn.addEventListener("click", () => gradeCurrent(parseFloat(btn.dataset.score)));
    });
    els.examRetakeBtn.addEventListener("click", resetExamToSetup);
    els.examRevisitMissedBtn.addEventListener("click", markMissedAsRevisit);

    restoreExamInProgress();
  }

  function examPool() {
    return state.examCategories.size
      ? state.questions.filter((q) => state.examCategories.has(q.category))
      : state.questions;
  }

  function updateExamPoolNote() {
    const pool = examPool();
    els.examPoolNote.textContent = `${pool.length} question${pool.length === 1 ? "" : "s"} available in the selected categories.`;
  }

  function shuffle(array) {
    const copy = array.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function startExam() {
    const pool = shuffle(examPool());
    const countValue = els.examCount.value;
    const count = countValue === "all" ? pool.length : Math.min(parseInt(countValue, 10), pool.length);

    if (count === 0) {
      els.examPoolNote.textContent = "No questions match the selected categories.";
      return;
    }

    state.exam = {
      poolIds: pool.slice(0, count).map((q) => q.id),
      index: 0,
      scores: [],
      revealed: false,
    };
    persistExam();
    showExamQuiz();
    renderExamQuestion();
  }

  function currentExamQuestion() {
    const id = state.exam.poolIds[state.exam.index];
    return state.questions.find((q) => q.id === id);
  }

  function showExamQuiz() {
    els.examSetup.hidden = true;
    els.examResults.hidden = true;
    els.examQuiz.hidden = false;
  }

  function renderExamQuestion() {
    const entry = currentExamQuestion();
    const total = state.exam.poolIds.length;
    const position = state.exam.index + 1;

    els.examProgressLabel.textContent = `Question ${position} of ${total}`;
    els.examProgressFill.style.width = `${((position - 1) / total) * 100}%`;

    els.examQuestionTag.textContent = entry.category;
    els.examQuestionPrompt.textContent = entry.question;

    els.examAnswer.textContent = entry.answer;
    els.examAnswer.hidden = true;
    els.examSnippet.hidden = true;
    els.examReference.hidden = true;
    els.examGradeActions.hidden = true;
    els.examRevealBtn.hidden = false;
    state.exam.revealed = false;

    if (entry.snippet && entry.snippet.code) {
      els.examSnippet.querySelector("code").textContent = entry.snippet.code;
    }
    if (entry.reference && entry.reference.url) {
      els.examReference.textContent = `${entry.reference.label || "Learn more"} ↗`;
      els.examReference.href = entry.reference.url;
    }

    persistExam();
  }

  function revealExamAnswer() {
    const entry = currentExamQuestion();
    els.examAnswer.hidden = false;
    if (entry.snippet && entry.snippet.code) els.examSnippet.hidden = false;
    if (entry.reference && entry.reference.url) els.examReference.hidden = false;
    els.examGradeActions.hidden = false;
    els.examRevealBtn.hidden = true;
    state.exam.revealed = true;
    persistExam();
  }

  function gradeCurrent(score) {
    const entry = currentExamQuestion();
    state.exam.scores.push({ id: entry.id, category: entry.category, score });

    if (state.exam.index + 1 >= state.exam.poolIds.length) {
      finishExam(false);
    } else {
      state.exam.index += 1;
      renderExamQuestion();
    }
  }

  function finishExam(early) {
    if (!state.exam) return;

    const scores = state.exam.scores;
    const total = early ? scores.length : state.exam.poolIds.length;
    const earned = scores.reduce((sum, s) => sum + s.score, 0);
    const pct = total ? Math.round((earned / total) * 100) : 0;

    els.examScoreHeadline.textContent = `${earned} / ${total} — ${pct}%${early ? " (ended early)" : ""}`;

    const byCategory = {};
    scores.forEach((s) => {
      if (!byCategory[s.category]) byCategory[s.category] = { earned: 0, total: 0 };
      byCategory[s.category].earned += s.score;
      byCategory[s.category].total += 1;
    });

    els.examBreakdown.innerHTML = "";
    Object.keys(byCategory).sort().forEach((cat) => {
      const row = document.createElement("div");
      row.className = "exam-breakdown__row";
      const stats = byCategory[cat];
      row.innerHTML = `<div class="exam-breakdown__row-label">${escapeHtml(cat)}</div><div class="exam-breakdown__row-score">${stats.earned} / ${stats.total}</div>`;
      els.examBreakdown.appendChild(row);
    });

    const missed = scores.filter((s) => s.score < 1);
    els.examMissedList.innerHTML = "";
    if (missed.length) {
      const heading = document.createElement("p");
      heading.className = "sidebar__heading";
      heading.textContent = `To review (${missed.length})`;
      els.examMissedList.appendChild(heading);
      missed.forEach((s) => {
        const q = state.questions.find((item) => item.id === s.id);
        const div = document.createElement("div");
        div.className = "exam-missed-item";
        div.textContent = q ? q.question : s.id;
        els.examMissedList.appendChild(div);
      });
    }

    state.exam.lastMissedIds = missed.map((s) => s.id);
    state.exam.finished = true;

    els.examSetup.hidden = true;
    els.examQuiz.hidden = true;
    els.examResults.hidden = false;

    clearPersistedExam();
  }

  function markMissedAsRevisit() {
    const missedIds = (state.exam && state.exam.lastMissedIds) || [];
    missedIds.forEach((id) => state.statusMap.set(id, "revisit"));
    saveStatusMap();
    renderQuestions();
    els.examRevisitMissedBtn.disabled = true;
    els.examRevisitMissedBtn.textContent = "Marked for revisit";
  }

  function resetExamToSetup() {
    state.exam = null;
    clearPersistedExam();
    els.examResults.hidden = true;
    els.examQuiz.hidden = true;
    els.examSetup.hidden = false;
    els.examRevisitMissedBtn.disabled = false;
    els.examRevisitMissedBtn.textContent = "Mark missed as revisit";
    updateExamPoolNote();
  }

  function persistExam() {
    if (!state.exam) return;
    try {
      localStorage.setItem(STORAGE_KEYS.exam, JSON.stringify(state.exam));
    } catch (err) {
      console.error("Failed to persist exam progress", err);
    }
  }

  function clearPersistedExam() {
    try {
      localStorage.removeItem(STORAGE_KEYS.exam);
    } catch (err) {
      console.error("Failed to clear persisted exam", err);
    }
  }

  function restoreExamInProgress() {
    let saved = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.exam);
      saved = raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.error("Failed to restore exam progress", err);
    }
    if (!saved || saved.finished || !Array.isArray(saved.poolIds) || !saved.poolIds.length) return;

    const stillValid = saved.poolIds.every((id) => state.questions.some((q) => q.id === id));
    if (!stillValid) {
      clearPersistedExam();
      return;
    }

    state.exam = saved;
    showExamQuiz();
    if (state.exam.revealed) {
      renderExamQuestion();
      revealExamAnswer();
    } else {
      renderExamQuestion();
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  /* ---------------------------------- Interview Mode ---------------------------------- */

  function initInterviewMode() {
    attachSnippetExpand(els.interviewSnippet);
    renderInterviewAgenda();

    els.interviewStartBtn.addEventListener("click", startInterview);
    els.interviewRevealBtn.addEventListener("click", revealInterviewAnswer);
    els.interviewGradeActions.querySelectorAll(".grade-btn").forEach((btn) => {
      btn.addEventListener("click", () => gradeInterviewCurrent(parseFloat(btn.dataset.score)));
    });
    els.interviewNextNoScoreBtn.addEventListener("click", handleInterviewNextNoScore);
    els.interviewSkipSectionBtn.addEventListener("click", () => {
      if (state.interview) advanceToInterviewSection(state.interview.sectionIndex + 1);
    });
    els.interviewQuitBtn.addEventListener("click", () => finishInterview(true));
    els.interviewYourAnswer.addEventListener("input", handleInterviewAnswerInput);
    els.interviewCopyAiPromptBtn.addEventListener("click", copyInterviewAiPrompt);
    els.interviewRevisitMissedBtn.addEventListener("click", markInterviewMissedAsRevisit);
    els.interviewRetakeBtn.addEventListener("click", resetInterviewToSetup);

    restoreInterviewInProgress();
  }

  function renderInterviewAgenda() {
    els.interviewAgenda.innerHTML = "";
    INTERVIEW_SECTIONS.forEach((section) => {
      const li = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = section.label;
      const minutes = document.createElement("span");
      minutes.textContent = `${section.minutes} min`;
      li.appendChild(label);
      li.appendChild(minutes);
      els.interviewAgenda.appendChild(li);
    });
  }

  function currentInterviewSection() {
    return INTERVIEW_SECTIONS[state.interview.sectionIndex];
  }

  function currentInterviewItemId() {
    if (!state.interview) return null;
    const section = currentInterviewSection();
    if (section.kind === "intro") return null;
    return state.interview.sectionPoolIds[state.interview.sectionPoolIndex] || null;
  }

  function buildInterviewSectionPool(section) {
    if (section.kind === "questions") {
      const pool = state.questions.filter((q) => section.categories.includes(q.category));
      return shuffle(pool).map((q) => q.id);
    }
    if (section.kind === "coding") {
      const pool = state.exercises.filter((e) => e.role === section.role);
      return shuffle(pool).map((e) => e.id);
    }
    return [];
  }

  function lookupInterviewItem(section, id) {
    if (section.kind === "coding") return state.exercises.find((e) => e.id === id);
    return state.questions.find((q) => q.id === id);
  }

  function startInterview() {
    state.interview = {
      sectionIndex: -1,
      sectionPoolIds: [],
      sectionPoolIndex: 0,
      sectionEndsAt: 0,
      scores: [],
      answers: {},
      revealed: false,
      finished: false,
      lastMissedIds: [],
    };
    els.interviewSetup.hidden = true;
    els.interviewResults.hidden = true;
    els.interviewSession.hidden = false;
    advanceToInterviewSection(0);
  }

  function advanceToInterviewSection(index) {
    clearInterviewTimer();

    if (!state.interview || index >= INTERVIEW_SECTIONS.length) {
      finishInterview(false);
      return;
    }

    const section = INTERVIEW_SECTIONS[index];
    state.interview.sectionIndex = index;
    state.interview.sectionPoolIds = buildInterviewSectionPool(section);
    state.interview.sectionPoolIndex = 0;
    state.interview.sectionEndsAt = Date.now() + section.minutes * 60 * 1000;
    state.interview.revealed = false;

    els.interviewSectionLabel.textContent = `${section.label} — section ${index + 1} of ${INTERVIEW_SECTIONS.length}`;
    els.interviewNoAiBanner.hidden = section.kind !== "coding";

    persistInterview();
    startInterviewTimer();
    renderInterviewItem();
  }

  function renderInterviewItem() {
    const section = currentInterviewSection();

    if (section.kind === "intro") {
      els.interviewQuestionTag.textContent = "Introduction";
      els.interviewQuestionPrompt.textContent = "Tell me about yourself.";
      els.interviewYourAnswer.value = "";
      els.interviewProgressLabel.textContent = "Take a moment to think through your answer, out loud if you can.";
      els.interviewProgressFill.style.width = "0%";
      showInterviewControlsForUnrevealed(section);
      return;
    }

    const total = state.interview.sectionPoolIds.length;
    if (total === 0) {
      els.interviewQuestionTag.textContent = section.label;
      els.interviewQuestionPrompt.textContent = "No questions are available for this section yet.";
      els.interviewYourAnswer.value = "";
      els.interviewProgressLabel.textContent = "";
      els.interviewProgressFill.style.width = "0%";
      showInterviewControlsForUnrevealed(section);
      return;
    }

    const id = state.interview.sectionPoolIds[state.interview.sectionPoolIndex];
    const entry = lookupInterviewItem(section, id);
    const position = state.interview.sectionPoolIndex + 1;

    els.interviewProgressLabel.textContent = `Question ${position} of ${total}`;
    els.interviewProgressFill.style.width = `${((position - 1) / total) * 100}%`;

    els.interviewQuestionTag.textContent = section.kind === "coding" ? entry.role : entry.category;
    els.interviewQuestionPrompt.textContent = section.kind === "coding" ? entry.problem : entry.question;
    els.interviewYourAnswer.value = state.interview.answers[id] || "";

    els.interviewAnswer.textContent = section.kind === "coding" ? entry.solution : entry.answer;
    els.interviewSnippet.querySelector("code").textContent =
      entry.snippet && entry.snippet.code ? entry.snippet.code : "";
    if (entry.reference && entry.reference.url) {
      els.interviewReference.textContent = `${entry.reference.label || "Learn more"} ↗`;
      els.interviewReference.href = entry.reference.url;
    }

    showInterviewControlsForUnrevealed(section);
    persistInterview();
  }

  function showInterviewControlsForUnrevealed(section) {
    state.interview.revealed = false;
    const noQuestionAvailable = section.kind !== "intro" && state.interview.sectionPoolIds.length === 0;
    const immediateNext = section.kind === "intro" || noQuestionAvailable;

    els.interviewAnswer.hidden = true;
    els.interviewSnippet.hidden = true;
    els.interviewReference.hidden = true;
    els.interviewGradeActions.hidden = true;
    els.interviewNextNoScoreBtn.hidden = !immediateNext;
    els.interviewRevealBtn.hidden = immediateNext;
  }

  function revealInterviewAnswer() {
    const section = currentInterviewSection();
    const id = state.interview.sectionPoolIds[state.interview.sectionPoolIndex];
    const entry = id ? lookupInterviewItem(section, id) : null;

    els.interviewAnswer.hidden = false;
    if (entry && entry.snippet && entry.snippet.code) els.interviewSnippet.hidden = false;
    if (entry && entry.reference && entry.reference.url) els.interviewReference.hidden = false;
    els.interviewRevealBtn.hidden = true;
    if (section.kind === "questions") {
      els.interviewGradeActions.hidden = false;
    } else {
      els.interviewNextNoScoreBtn.hidden = false;
    }
    state.interview.revealed = true;
    persistInterview();
  }

  function handleInterviewAnswerInput() {
    const id = currentInterviewItemId();
    if (!id) return;
    state.interview.answers[id] = els.interviewYourAnswer.value;
    persistInterview();
  }

  function gradeInterviewCurrent(score) {
    const section = currentInterviewSection();
    const id = state.interview.sectionPoolIds[state.interview.sectionPoolIndex];
    const entry = lookupInterviewItem(section, id);
    state.interview.scores.push({ id, category: entry.category, score });
    advanceInterviewQuestion();
  }

  function handleInterviewNextNoScore() {
    const section = currentInterviewSection();
    if (section.kind === "intro" || state.interview.sectionPoolIds.length === 0) {
      advanceToInterviewSection(state.interview.sectionIndex + 1);
    } else {
      advanceInterviewQuestion();
    }
  }

  function advanceInterviewQuestion() {
    state.interview.sectionPoolIndex += 1;
    if (state.interview.sectionPoolIndex >= state.interview.sectionPoolIds.length) {
      advanceToInterviewSection(state.interview.sectionIndex + 1);
    } else {
      persistInterview();
      renderInterviewItem();
    }
  }

  function startInterviewTimer() {
    updateInterviewTimerDisplay();
    interviewTimerId = setInterval(() => {
      const secondsLeft = Math.max(0, Math.round((state.interview.sectionEndsAt - Date.now()) / 1000));
      updateInterviewTimerDisplay(secondsLeft);
      if (secondsLeft <= 0) {
        clearInterviewTimer();
        advanceToInterviewSection(state.interview.sectionIndex + 1);
      }
    }, 1000);
  }

  function clearInterviewTimer() {
    if (interviewTimerId) {
      clearInterval(interviewTimerId);
      interviewTimerId = null;
    }
  }

  function updateInterviewTimerDisplay(secondsLeftOverride) {
    if (!state.interview) return;
    const secondsLeft =
      typeof secondsLeftOverride === "number"
        ? secondsLeftOverride
        : Math.max(0, Math.round((state.interview.sectionEndsAt - Date.now()) / 1000));
    const minutes = Math.floor(secondsLeft / 60);
    const seconds = secondsLeft % 60;
    els.interviewTimer.textContent = `${minutes}:${String(seconds).padStart(2, "0")}`;
    els.interviewTimer.classList.toggle("interview-timer--low", secondsLeft <= 30);
  }

  function finishInterview(early) {
    if (!state.interview) return;
    clearInterviewTimer();

    const scores = state.interview.scores;
    const total = scores.length;
    const earned = scores.reduce((sum, s) => sum + s.score, 0);
    const pct = total ? Math.round((earned / total) * 100) : 0;

    els.interviewScoreHeadline.textContent = total
      ? `${earned} / ${total} — ${pct}%${early ? " (ended early)" : ""}`
      : `No self-graded questions in this session${early ? " (ended early)" : ""}.`;

    const byCategory = {};
    scores.forEach((s) => {
      if (!byCategory[s.category]) byCategory[s.category] = { earned: 0, total: 0 };
      byCategory[s.category].earned += s.score;
      byCategory[s.category].total += 1;
    });

    els.interviewBreakdown.innerHTML = "";
    Object.keys(byCategory)
      .sort()
      .forEach((cat) => {
        const row = document.createElement("div");
        row.className = "exam-breakdown__row";
        const stats = byCategory[cat];
        row.innerHTML = `<div class="exam-breakdown__row-label">${escapeHtml(cat)}</div><div class="exam-breakdown__row-score">${stats.earned} / ${stats.total}</div>`;
        els.interviewBreakdown.appendChild(row);
      });

    const missed = scores.filter((s) => s.score < 1);
    els.interviewMissedList.innerHTML = "";
    if (missed.length) {
      const heading = document.createElement("p");
      heading.className = "sidebar__heading";
      heading.textContent = `To review (${missed.length})`;
      els.interviewMissedList.appendChild(heading);
      missed.forEach((s) => {
        const q = state.questions.find((item) => item.id === s.id);
        const div = document.createElement("div");
        div.className = "exam-missed-item";
        div.textContent = q ? q.question : s.id;
        els.interviewMissedList.appendChild(div);
      });
    }

    state.interview.lastMissedIds = missed.map((s) => s.id);
    state.interview.finished = true;

    els.interviewSession.hidden = true;
    els.interviewResults.hidden = false;

    els.interviewCopyAiPromptBtn.disabled = false;
    els.interviewCopyAiPromptBtn.textContent = "Copy prompt for AI review";
    els.interviewRevisitMissedBtn.disabled = false;
    els.interviewRevisitMissedBtn.textContent = "Mark missed as revisit";

    clearPersistedInterview();
  }

  function copyInterviewAiPrompt() {
    if (!state.interview) return;
    const scores = state.interview.scores;

    if (!scores.length) {
      els.interviewCopyAiPromptBtn.textContent = "Nothing graded to review";
      setTimeout(() => {
        els.interviewCopyAiPromptBtn.textContent = "Copy prompt for AI review";
      }, 2000);
      return;
    }

    const lines = [
      "Please review my mock-interview answers below. For each question, I've included the model answer and what I actually wrote. Give me feedback on accuracy, clarity, and anything I should tighten up.\n",
    ];
    scores.forEach((s) => {
      const entry = state.questions.find((q) => q.id === s.id);
      if (!entry) return;
      const myAnswer = (state.interview.answers[s.id] || "").trim() || "(no answer typed)";
      const gradeLabel = s.score === 1 ? "Got it" : s.score === 0.5 ? "Partially" : "Missed it";
      lines.push(
        `Category: ${entry.category}\nQ: ${entry.question}\nModel answer: ${entry.answer}\nMy answer: ${myAnswer}\nSelf-grade: ${gradeLabel}\n`
      );
    });

    const text = lines.join("\n");
    navigator.clipboard
      .writeText(text)
      .then(() => {
        els.interviewCopyAiPromptBtn.textContent = "Copied!";
        setTimeout(() => {
          els.interviewCopyAiPromptBtn.textContent = "Copy prompt for AI review";
        }, 2000);
      })
      .catch((err) => {
        console.error("Failed to copy AI review prompt", err);
        els.interviewCopyAiPromptBtn.textContent = "Copy failed — select text manually";
      });
  }

  function markInterviewMissedAsRevisit() {
    const missedIds = (state.interview && state.interview.lastMissedIds) || [];
    missedIds.forEach((id) => state.statusMap.set(id, "revisit"));
    saveStatusMap();
    renderQuestions();
    els.interviewRevisitMissedBtn.disabled = true;
    els.interviewRevisitMissedBtn.textContent = "Marked for revisit";
  }

  function resetInterviewToSetup() {
    state.interview = null;
    clearInterviewTimer();
    clearPersistedInterview();
    els.interviewResults.hidden = true;
    els.interviewSession.hidden = true;
    els.interviewSetup.hidden = false;
  }

  function persistInterview() {
    if (!state.interview) return;
    try {
      localStorage.setItem(STORAGE_KEYS.interview, JSON.stringify(state.interview));
    } catch (err) {
      console.error("Failed to persist interview progress", err);
    }
  }

  function clearPersistedInterview() {
    try {
      localStorage.removeItem(STORAGE_KEYS.interview);
    } catch (err) {
      console.error("Failed to clear persisted interview progress", err);
    }
  }

  function restoreInterviewInProgress() {
    let saved = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.interview);
      saved = raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.error("Failed to restore interview progress", err);
    }
    if (!saved || saved.finished || !Number.isInteger(saved.sectionIndex) || saved.sectionIndex < 0) return;

    const section = INTERVIEW_SECTIONS[saved.sectionIndex];
    if (!section) {
      clearPersistedInterview();
      return;
    }

    const stillValid =
      !Array.isArray(saved.sectionPoolIds) ||
      saved.sectionPoolIds.every((id) => Boolean(lookupInterviewItem(section, id)));
    if (!stillValid) {
      clearPersistedInterview();
      return;
    }

    const wasRevealed = Boolean(saved.revealed);
    state.interview = saved;
    els.interviewSetup.hidden = true;
    els.interviewResults.hidden = true;
    els.interviewSession.hidden = false;
    els.interviewSectionLabel.textContent = `${section.label} — section ${saved.sectionIndex + 1} of ${INTERVIEW_SECTIONS.length}`;
    els.interviewNoAiBanner.hidden = section.kind !== "coding";

    renderInterviewItem();
    if (wasRevealed) revealInterviewAnswer();
    startInterviewTimer();
  }

  /* ---------------------------------- Version badge / popover ---------------------------------- */

  async function initVersionCheck() {
    state.localVersion = await fetchJson("data/version.json");
    if (!state.localVersion || !state.localVersion.version) return;

    els.versionBadgeLabel.textContent = `v${state.localVersion.version}`;
    els.siteEyebrow.textContent = `Vol. ${state.localVersion.build} — an ongoing index`;
    els.versionPopoverCurrent.textContent =
      `You're running v${state.localVersion.version} (build ${state.localVersion.build}).`;
    renderVersionPopover(null);

    els.versionBadge.addEventListener("click", (event) => {
      event.stopPropagation();
      setVersionPopoverOpen(els.versionPopover.hidden);
    });

    els.versionPopoverRefresh.addEventListener("click", () => window.location.reload());

    document.addEventListener("click", (event) => {
      if (!els.versionPopover.hidden && !els.versionWidget.contains(event.target)) {
        setVersionPopoverOpen(false);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !els.versionPopover.hidden) {
        setVersionPopoverOpen(false);
        els.versionBadge.focus();
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") checkForUpdate();
    });

    setInterval(checkForUpdate, VERSION_CHECK_INTERVAL_MS);
  }

  function setVersionPopoverOpen(open) {
    els.versionBadge.setAttribute("aria-expanded", String(open));
    els.versionPopover.hidden = !open;
  }

  async function checkForUpdate() {
    if (!state.localVersion) return;
    try {
      const res = await fetch(`data/version.json?_=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return;
      const remote = await res.json();
      if (!remote || typeof remote.build !== "number") return;

      renderVersionPopover(remote.build > state.localVersion.build ? remote : null);
    } catch (err) {
      console.error("Version check failed", err);
    }
  }

  function renderVersionPopover(remote) {
    if (!remote) {
      els.versionBadgeCount.hidden = true;
      els.versionPopoverUpToDate.hidden = false;
      els.versionPopoverAvailable.hidden = true;
      return;
    }

    const behind = remote.build - state.localVersion.build;
    els.versionBadgeCount.hidden = false;
    els.versionBadgeCount.textContent = String(behind);

    els.versionPopoverUpToDate.hidden = true;
    els.versionPopoverAvailable.hidden = false;
    els.versionPopoverHeadline.textContent =
      `A new version is available: v${remote.version} — you're ${behind} version${behind === 1 ? "" : "s"} behind.`;
    els.versionPopoverNotes.textContent = remote.notes || "";
  }
})();
