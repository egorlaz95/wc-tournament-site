const STORAGE_KEY = "wc-tournament-state-v2";
const SESSION_KEY = "wc-current-user-id";

/** Редактирование долгосрочных ставок до конца 11 июня 2026 (локальное время) */
const OUTRIGHTS_EDIT_DEADLINE = new Date(2026, 5, 11, 23, 59, 59);

const teamCache = {};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createEmptyState();
    const parsed = JSON.parse(raw);
    return migrateState(parsed);
  } catch (e) {
    console.error("Ошибка загрузки состояния", e);
    return createEmptyState();
  }
}

function createEmptyState() {
  return {
    users: [],
    actualMatches: {},
    actualOutrights: {
      winner: "",
      bestPlayer: "",
      topScorer: "",
      darkHorse: "",
    },
  };
}

function migrateState(data) {
  if (data.users && Array.isArray(data.users)) {
    return {
      users: data.users,
      actualMatches: data.actualMatches || {},
      actualOutrights: data.actualOutrights || createEmptyState().actualOutrights,
    };
  }

  if (data.players) {
    const users = Object.entries(data.players).map(([nickname, p]) => ({
      id: crypto.randomUUID(),
      nickname,
      password: "",
      passport: { fullName: "", number: "", issuedBy: "", issueDate: "" },
      outrights: p.outrights || emptyOutrights(),
      matches: p.matches || {},
      onboardingComplete: Boolean(
        p.outrights?.winner &&
          p.outrights?.bestPlayer &&
          p.outrights?.topScorer &&
          p.outrights?.darkHorse
      ),
      createdAt: Date.now(),
    }));
    return {
      users,
      actualMatches: data.actualMatches || {},
      actualOutrights: data.actualOutrights || createEmptyState().actualOutrights,
    };
  }

  return createEmptyState();
}

function emptyOutrights() {
  return { winner: "", bestPlayer: "", topScorer: "", darkHorse: "" };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadState();
let currentUser = null;
let activeMatches = [];
let fixturesLoaded = false;

function $(id) {
  return document.getElementById(id);
}

function showError(el, message) {
  if (!message) {
    el.textContent = "";
    el.classList.add("hidden");
    return;
  }
  el.textContent = message;
  el.classList.remove("hidden");
}

function getSessionUserId() {
  return sessionStorage.getItem(SESSION_KEY);
}

function setSessionUserId(id) {
  if (id) sessionStorage.setItem(SESSION_KEY, id);
  else sessionStorage.removeItem(SESSION_KEY);
}

function findUserByNickname(nickname) {
  const n = nickname.trim().toLowerCase();
  return state.users.find((u) => u.nickname.toLowerCase() === n);
}

function getUserById(id) {
  return state.users.find((u) => u.id === id);
}

function canEditOutrights() {
  return Date.now() <= OUTRIGHTS_EDIT_DEADLINE.getTime();
}

function formatDeadline() {
  return OUTRIGHTS_EDIT_DEADLINE.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

async function fetchMatchesFromSportDb() {
  const res = await fetch("/api/matches");

  if (!res.ok) {
    throw new Error("HTTP " + res.status);
  }

  const data = await res.json();

  // ожидаем массив матчей из server.js
  return {
    matches: Array.isArray(data) ? data : [],
    total: Array.isArray(data) ? data.length : 0,
  };
}

async function ensureMatchesLoaded() {
  if (fixturesLoaded) return;
  fixturesLoaded = true;

  try {
    const result = await fetchMatchesFromSportDb();

    activeMatches = result.matches || [];

    console.info("[API] Loaded fixtures:", activeMatches);

  } catch (error) {
    console.error("[API] Failed to load matches:", error);
    activeMatches = [];
  }

  renderMatches();        // 🔥 ВАЖНО
  renderScoreboard();     // если нужно
}

// --- Routing ---

function showView(name) {
  ["view-auth", "view-onboarding", "view-main"].forEach((id) => {
    const el = $(id);
    if (el) el.classList.toggle("hidden", id !== name);
  });
}

function route() {
  const sessionId = getSessionUserId();
  if (!sessionId) {
    currentUser = null;
    showView("view-auth");
    return;
  }

  currentUser = getUserById(sessionId);
  if (!currentUser) {
    setSessionUserId(null);
    showView("view-auth");
    return;
  }

  if (!currentUser.onboardingComplete) {
    $("onboarding-nickname").textContent = currentUser.nickname;
    showView("view-onboarding");
    return;
  }

  showView("view-main");
  renderMainPage();
}

// --- Auth ---

function setupAuth() {
  const tabs = document.querySelectorAll(".auth-tab");
  const registerForm = $("register-form");
  const loginForm = $("login-form");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const isRegister = tab.dataset.tab === "register";
      tabs.forEach((t) => t.classList.toggle("auth-tab--active", t === tab));
      registerForm.classList.toggle("hidden", !isRegister);
      loginForm.classList.toggle("hidden", isRegister);
      showError($("register-error"), "");
      showError($("login-error"), "");
    });
  });

  registerForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const errEl = $("register-error");

    const nickname = $("reg-nickname").value.trim();
    const password = $("reg-password").value;
    const passwordConfirm = $("reg-password-confirm").value;

    if (password !== passwordConfirm) {
      showError(errEl, "Пароли не совпадают.");
      return;
    }

    if (findUserByNickname(nickname)) {
      showError(errEl, "Такой никнейм уже занят.");
      return;
    }

    const user = {
      id: crypto.randomUUID(),
      nickname,
      password,
      passport: {
        fullName: $("reg-fullname").value.trim(),
        number: $("reg-passport-number").value.trim(),
        issuedBy: $("reg-passport-issued").value.trim(),
        issueDate: $("reg-passport-date").value,
      },
      outrights: emptyOutrights(),
      matches: {},
      onboardingComplete: false,
      createdAt: Date.now(),
    };

    state.users.push(user);
    saveState();
    setSessionUserId(user.id);
    registerForm.reset();
    showError(errEl, "");
    route();
  });

  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const errEl = $("login-error");
    const nickname = $("login-nickname").value.trim();
    const password = $("login-password").value;

    const user = findUserByNickname(nickname);
    if (!user || user.password !== password) {
      showError(errEl, "Неверный никнейм или пароль.");
      return;
    }

    setSessionUserId(user.id);
    loginForm.reset();
    showError(errEl, "");
    route();
  });

  $("logout-btn").addEventListener("click", () => {
    setSessionUserId(null);
    route();
  });
}

// --- Onboarding ---

function setupOnboarding() {
  $("onboarding-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const errEl = $("onboarding-error");
    if (!currentUser) return;

    const outrights = {
      winner: $("onb-winner").value.trim(),
      bestPlayer: $("onb-best-player").value.trim(),
      topScorer: $("onb-top-scorer").value.trim(),
      darkHorse: $("onb-dark-horse").value.trim(),
    };

    if (
      !outrights.winner ||
      !outrights.bestPlayer ||
      !outrights.topScorer ||
      !outrights.darkHorse
    ) {
      showError(errEl, "Заполните все четыре поля.");
      return;
    }

    currentUser.outrights = outrights;
    currentUser.onboardingComplete = true;
    saveState();
    showError(errEl, "");
    route();
  });
}

// --- Main page ---

function renderOutrightsSection() {
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

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setupMainOutrightsForm() {
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

function renderMainPage() {
  $("main-nickname").textContent = currentUser.nickname;
  renderOutrightsSection();
  renderActualOutrights();
  ensureMatchesLoaded();
  renderScoreboard();
  ensureMatchesLoaded();
}

// --- Points ---

function calculatePointsForMatch(pred, actual) {
  if (!pred || !actual) return { total: 0 };

  const homePred = Number(pred.home);
  const awayPred = Number(pred.away);
  const homeAct = Number(actual.home);
  const awayAct = Number(actual.away);

  if ([homePred, awayPred, homeAct, awayAct].some(Number.isNaN)) {
    return { total: 0 };
  }

  let total = 0;
  const predOutcome =
    homePred === awayPred ? "draw" : homePred > awayPred ? "home" : "away";
  const actOutcome =
    homeAct === awayAct ? "draw" : homeAct > awayAct ? "home" : "away";

  if (predOutcome === actOutcome) total += 1;
  if (homePred === homeAct && awayPred === awayAct) total += 3;

  if (
    pred.bestPlayer &&
    actual.bestPlayer &&
    pred.bestPlayer.trim().toLowerCase() === actual.bestPlayer.trim().toLowerCase()
  ) {
    total += 2;
  }

  return { total };
}

function calculateOutrightsPoints(playerOutrights, actualOutrights) {
  if (!playerOutrights || !actualOutrights) return 0;
  const eq = (a, b) =>
    a && b && a.trim().toLowerCase() === b.trim().toLowerCase();
  let total = 0;
  if (eq(playerOutrights.winner, actualOutrights.winner)) total += 8;
  if (eq(playerOutrights.bestPlayer, actualOutrights.bestPlayer)) total += 8;
  if (eq(playerOutrights.topScorer, actualOutrights.topScorer)) total += 5;
  if (eq(playerOutrights.darkHorse, actualOutrights.darkHorse)) total += 6;
  return total;
}

function getUserTotalPoints(user) {
  let total = 0;
  for (const match of activeMatches) {
    const pred = user.matches?.[match.id];
    const actual = state.actualMatches?.[match.id];
    total += calculatePointsForMatch(pred, actual).total;
  }
  total += calculateOutrightsPoints(user.outrights, state.actualOutrights);
  return total;
}

function renderScoreboard() {
  const tbody = $("scoreboard-body");
  tbody.innerHTML = "";

  const rows = state.users
    .filter((u) => u.onboardingComplete)
    .map((u) => ({ nickname: u.nickname, total: getUserTotalPoints(u) }))
    .sort((a, b) => b.total - a.total);

  rows.forEach((row, idx) => {
    const tr = document.createElement("tr");
    if (row.nickname === currentUser?.nickname) tr.classList.add("scoreboard-row--me");
    tr.innerHTML = `<td>${idx + 1}</td><td>${escapeHtml(row.nickname)}</td><td>${row.total}</td>`;
    tbody.appendChild(tr);
  });
}

// --- Matches ---

function renderMatches() {
  const container = $("matches-list");

  if (!container) return;

  container.innerHTML = "";

  if (!activeMatches.length) {
    container.innerHTML = `
      <p class="muted">Матчи пока недоступны</p>
    `;
    return;
  }

  activeMatches.forEach((match) => {
    container.appendChild(createMatchRow(match, false));
  });
}

function createMatchRow(match, isActual) {
  const row = document.createElement("div");
  row.className = "match-row";

const header = document.createElement("div");
header.className = "match-row-header";

const odds =
  match.odds && typeof match.odds === "object"
    ? match.odds
    : {};
  const oddsHtml = `
  <div class="match-odds">
    <span>P1: ${odds.home ?? "-"}</span>
    <span>X: ${odds.draw ?? "-"}</span>
    <span>P2: ${odds.away ?? "-"}</span>
  </div>
`;

header.innerHTML = `
  <div class="match-teams">
    ${escapeHtml(match.home)} — ${escapeHtml(match.away)}
  </div>

  <div class="match-time">
    ${escapeHtml(match.time)}
  </div>

  <div class="match-group">
    ${escapeHtml(match.group)}
  </div>

  ${oddsHtml}
`;

  const inputs = document.createElement("div");
  inputs.className = isActual ? "match-actual" : "match-prediction";

  const scoreGroup = document.createElement("div");
  scoreGroup.className = "score-input-group";
  scoreGroup.innerHTML = `
    <input type="number" min="0" inputmode="numeric" placeholder="0" />
    <span>:</span>
    <input type="number" min="0" inputmode="numeric" placeholder="0" />
  `;

  const playerInput = document.createElement("input");
  playerInput.type = "text";
  playerInput.setAttribute("autocomplete", "off");
  playerInput.addEventListener("focus", async () => {
  const homeTeamId = match.homeTeam?.id;
  const awayTeamId = match.awayTeam?.id;

  if (!homeTeamId) return;

  const homePlayers = await getTeamPlayers(homeTeamId);
  const awayPlayers = await getTeamPlayers(awayTeamId);

  const allPlayers = [
    ...homePlayers,
    ...awayPlayers
  ];

  createPlayerDropdown(allPlayers, playerInput);
});
  playerInput.className = "match-player-input";
  playerInput.placeholder = isActual
    ? "Фактический лучший игрок"
    : "Лучший игрок матча";

  inputs.appendChild(scoreGroup);
  inputs.appendChild(playerInput);
  row.appendChild(header);
  row.appendChild(inputs);

  const [homeInput, awayInput] = scoreGroup.querySelectorAll("input");

  function readData() {
    return {
      home: homeInput.value.trim(),
      away: awayInput.value.trim(),
      bestPlayer: playerInput.value.trim(),
    };
  }


  function fillData(data) {
    homeInput.value = data?.home ?? "";
    awayInput.value = data?.away ?? "";
    playerInput.value = data?.bestPlayer ?? "";
  }

  if (isActual) {
    fillData(state.actualMatches[match.id]);
    const save = () => {
      state.actualMatches[match.id] = readData();
      saveState();
      renderScoreboard();
    };
    homeInput.addEventListener("change", save);
    awayInput.addEventListener("change", save);
    playerInput.addEventListener("change", save);
  } else {
    fillData(currentUser.matches[match.id]);
    const save = () => {
      currentUser.matches[match.id] = readData();
      saveState();
    };
    homeInput.addEventListener("change", save);
    awayInput.addEventListener("change", save);
    playerInput.addEventListener("change", save);
  }

  return row;
}

function renderActualOutrights() {
  const o = state.actualOutrights || emptyOutrights();
  $("actual-winner").value = o.winner || "";
  $("actual-best-player").value = o.bestPlayer || "";
  $("actual-top-scorer").value = o.topScorer || "";
  $("actual-dark-horse").value = o.darkHorse || "";
}

function setupAdmin() {
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

async function getTeamPlayers(teamId) {
  if (teamCache[teamId]) return teamCache[teamId];

  const res = await fetch(`/api/team/${teamId}`);
  const data = await res.json();

  const players = data?.data?.players || [];

  teamCache[teamId] = players;
  return players;
}

function createPlayerDropdown(players, inputEl) {
  const old = document.querySelector(".player-dropdown");
  if (old) old.remove();

  const dropdown = document.createElement("div");
  dropdown.className = "player-dropdown";

  players.forEach(p => {
    const item = document.createElement("div");
    item.className = "player-dropdown-item";
    item.textContent = p.name;

    item.addEventListener("click", () => {
      inputEl.value = p.name;
      dropdown.remove();
      inputEl.dispatchEvent(new Event("change"));
    });

    dropdown.appendChild(item);
  });

  document.body.appendChild(dropdown);

  dropdown.style.position = "fixed";
  dropdown.style.position = "absolute";
  dropdown.style.left = rect.left + "px";
  dropdown.style.top = rect.bottom + "px";
  dropdown.style.width = rect.width + "px";
}

document.addEventListener("click", (e) => {
  const dd = document.querySelector(".player-dropdown");
  if (!dd) return;

  const isInput = e.target.classList.contains("match-player-input");
  if (!dd.contains(e.target) && !isInput) {
    dd.remove();
  }
});

document.addEventListener("DOMContentLoaded", () => {
  setupAuth();
  setupOnboarding();
  setupMainOutrightsForm();
  setupAdmin();
  route();
});
