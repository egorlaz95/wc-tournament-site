import { state, currentUser, activeMatches, saveState } from "./store.js";
import { $, escapeHtml } from "./utils.js";
import { getTeamPlayers } from "./api.js";
import { renderScoreboard } from "./scoreboard.js";
import { calculatePointsForMatch, resolveActualResult } from "./points.js";

// status codes from /Games/list: 1=not scheduled, 2=not started, 3-7=live, 8-10=ended
function getMatchPhase(match) {
  const s = Number(match.status);
  if (!s || s <= 2) return "upcoming";
  if (s <= 7) return "live";
  return "ended";
}

export function renderMatches() {
  const container = $("matches-list");
  const actualContainer = $("actual-matches-list");

  if (container) {
    container.innerHTML = "";
    if (!activeMatches.length) {
      container.innerHTML = `<p class="muted">Матчи пока недоступны</p>`;
    } else {
      activeMatches.forEach((match) => container.appendChild(createMatchRow(match, false)));
    }
  }

  if (actualContainer) {
    actualContainer.innerHTML = "";
    activeMatches.forEach((match) => actualContainer.appendChild(createMatchRow(match, true)));
  }
}

export function createMatchRow(match, isActual) {
  const phase = getMatchPhase(match);
  const row = document.createElement("div");
  row.className = "match-row";

  // ── Header ──────────────────────────────────────────────────────────────────
  const header = document.createElement("div");
  header.className = "match-row-header";

  const odds = match.odds && typeof match.odds === "object" ? match.odds : {};
  const oddsHtml = `
    <div class="match-odds">
      <span>П1: ${odds.home ?? "-"}</span>
      <span>X: ${odds.draw ?? "-"}</span>
      <span>П2: ${odds.away ?? "-"}</span>
    </div>
  `;

  let statusHtml;
  if (phase === "live") {
    statusHtml = `<div class="match-time match-status--live">● LIVE</div>`;
  } else if (phase === "ended") {
    const hs = match.homeScore ?? "?";
    const as = match.awayScore ?? "?";
    statusHtml = `<div class="match-time match-status--ended">Завершён ${hs}:${as}</div>`;
  } else {
    statusHtml = `<div class="match-time">${escapeHtml(match.time)}</div>`;
  }

  const leagueLine = [match.league, match.group].filter(Boolean).join(" · ");

  header.innerHTML = `
    <div class="match-teams">${escapeHtml(match.home)} — ${escapeHtml(match.away)}</div>
    ${statusHtml}
    ${leagueLine ? `<div class="match-group">${escapeHtml(leagueLine)}</div>` : ""}
    ${oddsHtml}
  `;

  // ── Inputs ───────────────────────────────────────────────────────────────────
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
  playerInput.className = "match-player-input";
  playerInput.placeholder = isActual ? "Фактический лучший игрок" : "Лучший игрок матча";

  inputs.appendChild(scoreGroup);
  inputs.appendChild(playerInput);
  row.appendChild(header);
  row.appendChild(inputs);

  const [homeInput, awayInput] = scoreGroup.querySelectorAll("input");

  function readData() {
    return { home: homeInput.value.trim(), away: awayInput.value.trim(), bestPlayer: playerInput.value.trim() };
  }

  // ── Admin row (isActual = true) ───────────────────────────────────────────────
  if (isActual) {
    const apiScoreAvailable = phase === "ended" && match.homeScore != null && match.awayScore != null;
    const adminEntry = state.actualMatches?.[match.id];

    if (apiScoreAvailable) {
      homeInput.value = String(match.homeScore);
      awayInput.value = String(match.awayScore);
      homeInput.disabled = true;
      awayInput.disabled = true;
    } else {
      homeInput.value = adminEntry?.home ?? "";
      awayInput.value = adminEntry?.away ?? "";
    }
    playerInput.value = adminEntry?.bestPlayer ?? "";

    const saveAdmin = () => {
      const current = state.actualMatches[match.id] ?? {};
      state.actualMatches[match.id] = {
        home: apiScoreAvailable ? String(match.homeScore) : homeInput.value.trim(),
        away: apiScoreAvailable ? String(match.awayScore) : awayInput.value.trim(),
        bestPlayer: playerInput.value.trim(),
      };
      if (JSON.stringify(state.actualMatches[match.id]) !== JSON.stringify(current)) {
        saveState();
        renderScoreboard();
      }
    };

    if (!apiScoreAvailable) {
      homeInput.addEventListener("change", saveAdmin);
      awayInput.addEventListener("change", saveAdmin);
    }
    playerInput.addEventListener("change", saveAdmin);
    attachDropdown(playerInput, match);

  // ── User prediction row (isActual = false) ────────────────────────────────────
  } else {
    const prediction = currentUser.matches?.[match.id];
    homeInput.value = prediction?.home ?? "";
    awayInput.value = prediction?.away ?? "";
    playerInput.value = prediction?.bestPlayer ?? "";

    const editable = phase === "upcoming";
    homeInput.disabled = !editable;
    awayInput.disabled = !editable;
    playerInput.disabled = !editable;

    if (editable) {
      const save = () => {
        currentUser.matches[match.id] = readData();
        saveState();
      };
      homeInput.addEventListener("change", save);
      awayInput.addEventListener("change", save);
      playerInput.addEventListener("change", save);
      attachDropdown(playerInput, match);
    } else {
      const lockLabel = document.createElement("p");
      lockLabel.className = "match-locked-label";
      lockLabel.textContent = phase === "live" ? "Матч начался — ставки закрыты" : "Матч завершён — ставки закрыты";
      inputs.insertBefore(lockLabel, inputs.firstChild);
    }

    if (phase === "ended") {
      const pred = currentUser.matches?.[match.id];
      const actual = resolveActualResult(match);
      const { total, outcomeCorrect, exactScore, bestPlayerCorrect } = calculatePointsForMatch(pred, actual);

      const hints = [];
      if (exactScore) hints.push("точный счёт");
      else if (outcomeCorrect) hints.push("исход");
      if (bestPlayerCorrect) hints.push("игрок");

      const badge = document.createElement("div");
      badge.className = `match-points-badge ${total > 0 ? "match-points-badge--positive" : ""}`;
      badge.innerHTML = `<span class="match-points-value">+${total} pts</span>${hints.length ? `<span class="match-points-hints">${hints.join(" + ")}</span>` : ""}`;
      inputs.appendChild(badge);
    }
  }

  return row;
}

function attachDropdown(playerInput, match) {
  playerInput.addEventListener("focus", async () => {
    const homeTeamId = match.homeTeamId;
    const awayTeamId = match.awayTeamId;
    if (!homeTeamId || !awayTeamId) return;
    try {
      const [homePlayers, awayPlayers] = await Promise.all([
        getTeamPlayers(homeTeamId),
        getTeamPlayers(awayTeamId),
      ]);
      createPlayerDropdown([...homePlayers, ...awayPlayers], playerInput);
    } catch {
      // silently ignore — player list is a convenience, not critical
    }
  });
}

export function createPlayerDropdown(players, inputEl) {
  const old = document.querySelector(".player-dropdown");
  if (old) old.remove();

  if (!players.length) return;

  const dropdown = document.createElement("div");
  dropdown.className = "player-dropdown";

  players.forEach((p) => {
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

  const rect = inputEl.getBoundingClientRect();
  dropdown.style.position = "absolute";
  dropdown.style.left = rect.left + window.scrollX + "px";
  dropdown.style.top = rect.bottom + window.scrollY + "px";
  dropdown.style.width = rect.width + "px";
}

document.addEventListener("click", (e) => {
  const dd = document.querySelector(".player-dropdown");
  if (!dd) return;
  if (!dd.contains(e.target) && !e.target.classList.contains("match-player-input")) {
    dd.remove();
  }
});
