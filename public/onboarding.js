import { currentUser, saveState } from "./store.js";
import { $, showError } from "./utils.js";

export function setupOnboarding(onRoute) {
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

    if (!outrights.winner || !outrights.bestPlayer || !outrights.topScorer || !outrights.darkHorse) {
      showError(errEl, "Заполните все четыре поля.");
      return;
    }

    currentUser.outrights = outrights;
    currentUser.onboardingComplete = true;
    saveState();
    showError(errEl, "");
    onRoute();
  });
}
