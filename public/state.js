const STORAGE_KEY = "wc-tournament-state-v2";
const SESSION_KEY = "wc-current-user-id";

export let state = loadState();

export function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function setState(newState) {
  state = newState;
  saveState();
}

export function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return createEmptyState();
  return JSON.parse(raw);
}

export function createEmptyState() {
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

export function getSessionUserId() {
  return sessionStorage.getItem(SESSION_KEY);
}

export function setSessionUserId(id) {
  if (id) sessionStorage.setItem(SESSION_KEY, id);
  else sessionStorage.removeItem(SESSION_KEY);
}