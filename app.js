(function () {
  "use strict";

  /** @typedef {{ id: string, category: string, question: string, answer: string }} QuestionEntry */
  /** @typedef {{ id: string, role: string, problem: string, solution: string }} ExerciseEntry */

  const state = {
    questions: /** @type {QuestionEntry[]} */ ([]),
    exercises: /** @type {ExerciseEntry[]} */ ([]),
    activeCategories: new Set(),
    activeRoles: new Set(),
  };

  const els = {
    tabQuestions: document.getElementById("tab-questions"),
    tabExercises: document.getElementById("tab-exercises"),
    panelQuestions: document.getElementById("panel-questions"),
    panelExercises: document.getElementById("panel-exercises"),
    categoryFilterPanel: document.querySelector('[data-filter-panel="questions"]'),
    roleFilterPanel: document.querySelector('[data-filter-panel="exercises"]'),
    categoryFilters: document.getElementById("category-filters"),
    roleFilters: document.getElementById("role-filters"),
    questionsGrid: document.getElementById("questions-grid"),
    exercisesGrid: document.getElementById("exercises-grid"),
    questionsCount: document.getElementById("questions-count"),
    exercisesCount: document.getElementById("exercises-count"),
    questionsEmpty: document.getElementById("questions-empty"),
    exercisesEmpty: document.getElementById("exercises-empty"),
    questionTemplate: document.getElementById("question-card-template"),
    exerciseTemplate: document.getElementById("exercise-card-template"),
  };

  init();

  async function init() {
    wireTabs();

    const [questions, exercises] = await Promise.all([
      fetchJson("data/questions.json"),
      fetchJson("data/exercises.json"),
    ]);

    state.questions = questions || [];
    state.exercises = exercises || [];

    renderFilterChips({
      container: els.categoryFilters,
      groupLabel: "category",
      values: uniqueSorted(state.questions.map((q) => q.category)),
      activeSet: state.activeCategories,
      onChange: renderQuestions,
    });

    renderFilterChips({
      container: els.roleFilters,
      groupLabel: "role",
      values: uniqueSorted(state.exercises.map((e) => e.role)),
      activeSet: state.activeRoles,
      onChange: renderExercises,
    });

    renderQuestions();
    renderExercises();
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

  /* ---------------------------------- Filter chips ---------------------------------- */

  function renderFilterChips({ container, values, activeSet, onChange }) {
    container.innerHTML = "";

    const allButton = createChip({
      label: "All",
      count: null,
      pressed: activeSet.size === 0,
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
        count: null,
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
      button.dataset.value = value;
      container.appendChild(button);
    });
  }

  function createChip({ label, pressed, onClick }) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
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

  function renderQuestions() {
    const filtered = state.activeCategories.size
      ? state.questions.filter((q) => state.activeCategories.has(q.category))
      : state.questions;

    els.questionsGrid.innerHTML = "";
    filtered.forEach((entry) => {
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
        })
      );
    });

    updateCount(els.questionsCount, filtered.length, state.questions.length, "question");
    els.questionsEmpty.hidden = filtered.length !== 0;
  }

  function renderExercises() {
    const filtered = state.activeRoles.size
      ? state.exercises.filter((e) => state.activeRoles.has(e.role))
      : state.exercises;

    els.exercisesGrid.innerHTML = "";
    filtered.forEach((entry) => {
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
        })
      );
    });

    updateCount(els.exercisesCount, filtered.length, state.exercises.length, "exercise");
    els.exercisesEmpty.hidden = filtered.length !== 0;
  }

  function updateCount(el, shown, total, noun) {
    const plural = shown === 1 ? noun : `${noun}s`;
    el.textContent =
      shown === total
        ? `${total} ${plural}`
        : `${shown} of ${total} ${total === 1 ? noun : `${noun}s`}`;
  }

  function buildCard({ template, idPrefix, entry, tag, prompt, reveal, showLabel, hideLabel }) {
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

    button.addEventListener("click", () => {
      const expanded = button.getAttribute("aria-expanded") === "true";
      const next = !expanded;
      button.setAttribute("aria-expanded", String(next));
      answerEl.hidden = !next;
      label.textContent = next ? hideLabel : showLabel;
      eyeIcon.hidden = next;
      eyeOffIcon.hidden = !next;
    });

    return card;
  }

  /* ---------------------------------- Tabs (WAI-ARIA APG pattern) ---------------------------------- */

  function wireTabs() {
    const tabs = [els.tabQuestions, els.tabExercises];
    const panels = {
      "tab-questions": els.panelQuestions,
      "tab-exercises": els.panelExercises,
    };
    const filterPanels = {
      "tab-questions": els.categoryFilterPanel,
      "tab-exercises": els.roleFilterPanel,
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
        filterPanels[t.id].hidden = !selected;
      });
    }
  }
})();
