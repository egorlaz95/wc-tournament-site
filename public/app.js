import { currentUser, setCurrentUser, activeMatches, fixturesLoaded, setFixturesLoaded, setActiveMatches } from "./store.js";
import { $ } from "./utils.js";
import { getSessionUserId, setSessionUserId, getUserById, setupAuth } from "./auth.js";
import { setupOnboarding } from "./onboarding.js";
import { renderOutrightsSection, setupMainOutrightsForm, renderActualOutrights, setupAdmin } from "./outrights.js";
import { renderMatches } from "./matches.js";
import { renderScoreboard } from "./scoreboard.js";
import { fetchMatchesFromSportDb } from "./api.js";

// ── Mock data: три матча со всеми статусами для тестирования ─────────────────
const MOCK_MATCHES = [
  {
    id: "mock-1",
    home: "France", away: "Brazil",
    homeTeamId: "", awayTeamId: "",
    status: 2, homeScore: null, awayScore: null,
    time: "18:00", date: "mock", dateTimeRaw: "2026-06-11T18:00:00Z",
    group: "Group A", odds: { home: 2.10, draw: 3.40, away: 3.20 },
  },
  {
    id: "mock-2",
    home: "Germany", away: "Argentina",
    homeTeamId: "", awayTeamId: "",
    status: 5, homeScore: 1, awayScore: 0,
    time: "21:00", date: "mock", dateTimeRaw: "2026-06-11T21:00:00Z",
    group: "Group B", odds: { home: 2.50, draw: 3.10, away: 2.90 },
  },
  {
    id: "mock-3",
    home: "Spain", away: "England",
    homeTeamId: "", awayTeamId: "",
    status: 9, homeScore: 2, awayScore: 1,
    time: "15:00", date: "mock", dateTimeRaw: "2026-06-11T15:00:00Z",
    group: "Group C", odds: { home: 2.30, draw: 3.20, away: 3.10 },
  },
];

// ── Views ────────────────────────────────────────────────────────────────────
function showView(name) {
  ["view-auth", "view-onboarding", "view-main"].forEach((id) => {
    const el = $(id);
    if (el) el.classList.toggle("hidden", id !== name);
  });
}

// ── Match loading ────────────────────────────────────────────────────────────
async function loadMatches(dateOverride) {
  setFixturesLoaded(true);
  try {
    const result = await fetchMatchesFromSportDb(dateOverride);
    setActiveMatches(result.matches || []);
    console.info("[API] Loaded fixtures:", result.matches);
  } catch (error) {
    console.error("[API] Failed to load matches:", error);
    setActiveMatches([]);
  }
  renderMatches();
  renderScoreboard();
  scheduleRefreshIfLive();
}

async function ensureMatchesLoaded() {
  if (fixturesLoaded) return;
  await loadMatches();
}

function scheduleRefreshIfLive() {
  const hasLive = activeMatches.some((m) => {
    const s = Number(m.status);
    return s >= 3 && s <= 7;
  });
  if (hasLive) {
    setTimeout(() => loadMatches(), 60_000);
  }
}

function loadMockData() {
  setFixturesLoaded(true);
  setActiveMatches([...MOCK_MATCHES]);
  renderMatches();
  renderScoreboard();
}

// ── Test / Debug controls (admin panel) ──────────────────────────────────────
function setupTestControls() {
  const mockBtn = $("load-mock-btn");
  const dateInput = $("test-date-input");
  const reloadBtn = $("reload-date-btn");

  if (mockBtn) {
    mockBtn.addEventListener("click", () => {
      loadMockData();
      if (dateInput) dateInput.value = "";
    });
  }

  if (reloadBtn && dateInput) {
    reloadBtn.addEventListener("click", () => {
      const date = dateInput.value; // YYYY-MM-DD or empty
      setFixturesLoaded(false);
      loadMatches(date || undefined);
    });
  }
}

// ── Routing ──────────────────────────────────────────────────────────────────
function renderMainPage() {
  $("main-nickname").textContent = currentUser.nickname;
  renderOutrightsSection();
  renderActualOutrights();
  ensureMatchesLoaded();
  renderScoreboard();
}

function route() {
  const sessionId = getSessionUserId();
  if (!sessionId) {
    setCurrentUser(null);
    showView("view-auth");
    return;
  }

  const user = getUserById(sessionId);
  if (!user) {
    setSessionUserId(null);
    setCurrentUser(null);
    showView("view-auth");
    return;
  }

  setCurrentUser(user);

  if (!currentUser.onboardingComplete) {
    $("onboarding-nickname").textContent = currentUser.nickname;
    showView("view-onboarding");
    return;
  }

  showView("view-main");
  renderMainPage();
}

document.addEventListener("DOMContentLoaded", () => {
  setupAuth(route);
  setupOnboarding(route);
  setupMainOutrightsForm();
  setupAdmin();
  setupTestControls();
  route();
});
