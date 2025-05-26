// src/utils/stats.js

/**
 * Sprawdza, czy wynik meczu jest poprawny wg zasad:
 * - Zwycięzca do 11 pkt, jeśli przegrany < 10
 * - Przy obu ≥ 10, różnica min. 2 pkt
 *
 * @param {number} score1 – wynik gracza 1
 * @param {number} score2 – wynik gracza 2
 * @returns {boolean} – true, jeśli wynik jest poprawny
 */
export function validateResult(score1, score2) {
  if (isNaN(score1) || isNaN(score2)) return false;
  const winner = Math.max(score1, score2);
  const loser  = Math.min(score1, score2);

  if (winner < 11) return false;
  if (loser < 10) {
    return winner === 11;
  }
  // obaj mają ≥10, musi być różnica 2 pkt
  return winner === loser + 2;
}

/**
 * Aktualizuje statystyki meczu zarówno w stats, jak i w generalStats.
 * @param {Object} match - obiekt meczu { player1, player2, result }
 * @param {Object} stats - obiekty statystyk bieżącego turnieju
 * @param {Object} generalStats - obiekty statystyk ogólnych
 */
export function updateStats(match, stats, generalStats) {
  const { player1, player2, result } = match;
  const [s1, s2] = result.split(':').map(Number);
  const win1 = s1 > s2;

  // Upewniamy się, że istnieją obiekty pod kluczami graczy
  [player1, player2].forEach(p => {
    if (!stats[p]) stats[p] = { wins: 0, losses: 0, pointsScored: 0, pointsConceded: 0 };
    if (!generalStats[p]) generalStats[p] = { wins: 0, losses: 0, pointsScored: 0, pointsConceded: 0 };
  });

  // Aktualizacja statystyk turnieju
  stats[player1].wins      += win1 ? 1 : 0;
  stats[player1].losses   += win1 ? 0 : 1;
  stats[player1].pointsScored   += s1;
  stats[player1].pointsConceded += s2;

  stats[player2].wins      += win1 ? 0 : 1;
  stats[player2].losses   += win1 ? 1 : 0;
  stats[player2].pointsScored   += s2;
  stats[player2].pointsConceded += s1;

  // Aktualizacja statystyk ogólnych
  generalStats[player1].wins      += win1 ? 1 : 0;
  generalStats[player1].losses   += win1 ? 0 : 1;
  generalStats[player1].pointsScored   += s1;
  generalStats[player1].pointsConceded += s2;

  generalStats[player2].wins      += win1 ? 0 : 1;
  generalStats[player2].losses   += win1 ? 1 : 0;
  generalStats[player2].pointsScored   += s2;
  generalStats[player2].pointsConceded += s1;
}
