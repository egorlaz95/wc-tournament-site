export const STORAGE_KEY = "wc-tournament-state-v2";
export const SESSION_KEY = "wc-current-user-id";
export const OUTRIGHTS_EDIT_DEADLINE = new Date(2026, 5, 11, 23, 59, 59);

export function emptyOutrights() {
  return { winner: "", bestPlayer: "", topScorer: "", darkHorse: "" };
}

export function createEmptyState() {
  return {
    users: [],
    actualMatches: {},
    actualOutrights: { winner: "", bestPlayer: "", topScorer: "", darkHorse: "" },
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

export const state = loadState();

export let currentUser = null;
export function setCurrentUser(u) { currentUser = u; }

export let activeMatches = [];
export function setActiveMatches(m) { activeMatches = m; }

export let fixturesLoaded = false;
export function setFixturesLoaded(v) { fixturesLoaded = v; }

export function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
