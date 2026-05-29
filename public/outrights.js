import { state, currentUser, saveState, emptyOutrights } from "./store.js";
import { $, escapeHtml, canEditOutrights, formatDeadline } from "./utils.js";
import { renderScoreboard } from "./scoreboard.js";

export function renderOutrightsSection() {
  const o = currentUser.outrights;
  const display = $("outrights-display");
  const hint = $("outrights-deadline-hint");
  const editBtn = $("edit-outrights-btn");
  const form = $("main-outrights-form");

  display.innerHTML = `
    <div class="outrights-item"><span class="label">Победитель ЧМ</span><span class="value">${escapeHtml(o.winner)}</span></div>
    <div class="outrights-item"><span class="label">Лучший игрок</span><span class="value">${escapeHtml(o.bestPlayer)}</span></div>
    <div class="outrights-item"><span class="label">Лучший бомбардир</span><span class="value">${escapeHtml(o.topScorer)}</span></div>
    <div class="outrights-item"><span class="label">Команда-аутсайдер</span><span class="value">${escapeHtml(o.darkHorse)}</span></div>
  `;

  if (canEditOutrights()) {
    hint.textContent = `Можно изменить до ${formatDeadline()} включительно.`;
    editBtn.classList.remove("hidden");
  } else {
    hint.textContent = `Редактирование закрыто с ${formatDeadline()}.`;
    editBtn.classList.add("hidden");
    form.classList.add("hidden");
    display.classList.remove("hidden");
  }
}

export function setupMainOutrightsForm() {
  const editBtn = $("edit-outrights-btn");
  const form = $("main-outrights-form");
  const display = $("outrights-display");

  editBtn.addEventListener("click", () => {
    if (!canEditOutrights()) return;
    const o = currentUser.outrights;
    $("main-winner").value = o.winner;
    $("main-best-player").value = o.bestPlayer;
    $("main-top-scorer").value = o.topScorer;
    $("main-dark-horse").value = o.darkHorse;
    display.classList.add("hidden");
    editBtn.classList.add("hidden");
    form.classList.remove("hidden");
  });

  $("cancel-outrights-btn").addEventListener("click", () => {
    form.classList.add("hidden");
    display.classList.remove("hidden");
    if (canEditOutrights()) editBtn.classList.remove("hidden");
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!canEditOutrights() || !currentUser) return;

    currentUser.outrights = {
      winner: $("main-winner").value.trim(),
      bestPlayer: $("main-best-player").value.trim(),
      topScorer: $("main-top-scorer").value.trim(),
      darkHorse: $("main-dark-horse").value.trim(),
    };
    saveState();
    form.classList.add("hidden");
    display.classList.remove("hidden");
    if (canEditOutrights()) editBtn.classList.remove("hidden");
    renderOutrightsSection();
    renderScoreboard();
  });
}

export function renderActualOutrights() {
  const o = state.actualOutrights || emptyOutrights();
  $("actual-winner").value = o.winner || "";
  $("actual-best-player").value = o.bestPlayer || "";
  $("actual-top-scorer").value = o.topScorer || "";
  $("actual-dark-horse").value = o.darkHorse || "";
}

export function setupAdmin() {
  $("actual-outrights-form").addEventListener("submit", (e) => {
    e.preventDefault();
    state.actualOutrights = {
      winner: $("actual-winner").value.trim(),
      bestPlayer: $("actual-best-player").value.trim(),
      topScorer: $("actual-top-scorer").value.trim(),
      darkHorse: $("actual-dark-horse").value.trim(),
    };
    saveState();
    renderScoreboard();
  });

  $("recalculate-btn").addEventListener("click", renderScoreboard);
}
