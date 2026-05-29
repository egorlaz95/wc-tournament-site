import { state, activeMatches } from "./store.js";

export function calculatePointsForMatch(pred, actual) {
  if (!pred || !actual) return { total: 0, outcomeCorrect: false, exactScore: false, bestPlayerCorrect: false };

  const homePred = Number(pred.home);
  const awayPred = Number(pred.away);
  const homeAct = Number(actual.home);
  const awayAct = Number(actual.away);

  if ([homePred, awayPred, homeAct, awayAct].some(Number.isNaN)) {
    return { total: 0, outcomeCorrect: false, exactScore: false, bestPlayerCorrect: false };
  }

  const predOutcome = homePred === awayPred ? "draw" : homePred > awayPred ? "home" : "away";
  const actOutcome = homeAct === awayAct ? "draw" : homeAct > awayAct ? "home" : "away";

  const outcomeCorrect = predOutcome === actOutcome;
  const exactScore = homePred === homeAct && awayPred === awayAct;
  const bestPlayerCorrect = Boolean(
    pred.bestPlayer &&
    actual.bestPlayer &&
    pred.bestPlayer.trim().toLowerCase() === actual.bestPlayer.trim().toLowerCase()
  );

  let total = 0;
  if (outcomeCorrect) total += 1;
  if (exactScore) total += 3;
  if (bestPlayerCorrect) total += 2;

  return { total, outcomeCorrect, exactScore, bestPlayerCorrect };
}

export function calculateOutrightsPoints(playerOutrights, actualOutrights) {
  if (!playerOutrights || !actualOutrights) return 0;
  const eq = (a, b) => a && b && a.trim().toLowerCase() === b.trim().toLowerCase();
  let total = 0;
  if (eq(playerOutrights.winner, actualOutrights.winner)) total += 8;
  if (eq(playerOutrights.bestPlayer, actualOutrights.bestPlayer)) total += 8;
  if (eq(playerOutrights.topScorer, actualOutrights.topScorer)) total += 5;
  if (eq(playerOutrights.darkHorse, actualOutrights.darkHorse)) total += 6;
  return total;
}

// Returns the actual result for a match, preferring API-provided scores for ended matches.
// bestPlayer still comes from admin-entered data (no API source for it).
export function resolveActualResult(match) {
  const adminEntry = state.actualMatches?.[match.id];
  const s = Number(match.status);
  if (s >= 8 && match.homeScore != null && match.awayScore != null) {
    return {
      home: String(match.homeScore),
      away: String(match.awayScore),
      bestPlayer: adminEntry?.bestPlayer ?? "",
    };
  }
  return adminEntry ?? null;
}

export function getUserTotalPoints(user) {
  let total = 0;
  for (const match of activeMatches) {
    const pred = user.matches?.[match.id];
    const actual = resolveActualResult(match);
    total += calculatePointsForMatch(pred, actual).total;
  }
  total += calculateOutrightsPoints(user.outrights, state.actualOutrights);
  return total;
}
