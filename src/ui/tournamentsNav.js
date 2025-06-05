// src/ui/tournamentsNav.js

/**
 * Pokazuje widok główny turnieju i chowa pozostałe zakładki.
 */
export function showTournamentView() {
  document.getElementById("mainContainer").style.display = "block";
  document.getElementById("archiveView").style.display = "none";
  document.getElementById("rankingView").style.display = "none";
  document.getElementById("payoutView").style.display = "none";
}

/**
 * Pokazuje widok archiwum, chowa inne, wywołuje renderArchiveView().
 */
export function showArchiveView() {
  document.getElementById("mainContainer").style.display = "none";
  document.getElementById("archiveView").style.display = "block";
  document.getElementById("rankingView").style.display = "none";
  document.getElementById("payoutView").style.display = "none";
  window.renderArchiveView?.();
}

/**
 * Pokazuje widok rankingu ELO, chowa inne, wywołuje renderEloRanking().
 */
export function showRankingView() {
  document.getElementById("mainContainer").style.display = "none";
  document.getElementById("archiveView").style.display = "none";
  document.getElementById("rankingView").style.display = "block";
  document.getElementById("payoutView").style.display = "none";
  window.renderEloRanking?.();
}

/**
 * Animacja fade-in: usuwa i dodaje klasę „fade-in”, wymuszając ponowne odświeżenie animacji.
 */
export function fadeInElement(el) {
  if (!el) return;
  el.classList.remove("fade-in");
  void el.offsetWidth;
  el.classList.add("fade-in");
}
