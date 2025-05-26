// src/utils/elo.js

/**
 * Aktualizuje punkty Elo obu graczy po meczu.
 *
 * @param {Object} player1 – obiekt gracza 1 z polem .elo (liczba)
 * @param {Object} player2 – obiekt gracza 2 z polem .elo (liczba)
 * @param {number} score1 – wynik gracza 1
 * @param {number} score2 – wynik gracza 2
 * @param {number} [K=24] – współczynnik K
 * @param {number} [D=0.75] – współczynnik dysproporcji
 * @returns {{delta1: number, delta2: number, marginFactor: number}}
 */
export function updateElo(player1, player2, score1, score2, K = 24, D = 0.75) {
  const R1 = player1.elo;
  const R2 = player2.elo;
  const E1 = 1 / (1 + 10 ** ((R2 - R1) / 400));
  const a1 = score1 > score2 ? 1 : 0;

  // faktor różnicy punktów
  const margin = Math.abs(score1 - score2);
  const mf = margin <= 2 ? 1 : 1 + Math.min((margin - 2) * 0.1, 0.5);

  const raw1 = K * (a1 - E1) * (a1 === 1 ? mf : 1);
  const raw2 = K * ((1 - a1) - (1 - E1)) * ((1 - a1) === 1 ? mf : 1);

  const delta1 = Math.round(raw1 * D);
  const delta2 = Math.round(raw2 * D);

  player1.elo += delta1;
  player2.elo += delta2;

  return { delta1, delta2, marginFactor: mf };
}
/**
 * Zwraca hipotetyczne zmiany Elo (nie modyfikuje obiektów graczy).
 *
 * @param {Object} p1 – obiekt gracza 1 z polem .elo (liczba)
 * @param {Object} p2 – obiekt gracza 2 z polem .elo (liczba)
 * @param {number} s1 – wynik gracza 1
 * @param {number} s2 – wynik gracza 2
 * @param {number} [K=24] – współczynnik K
 * @param {number} [D=0.75] – współczynnik dysproporcji
 * @returns {[number, number, number]} – [delta1, delta2, marginFactor]
 */
export function getEloDelta(p1, p2, s1, s2, K = 24, D = 0.75) {
  // tworzymy kopie tylko z polem elo, by nie zmieniać oryginałów
  const copy1 = { elo: p1.elo };
  const copy2 = { elo: p2.elo };
  const { delta1, delta2, marginFactor } = updateElo(copy1, copy2, s1, s2, K, D);
  return [delta1, delta2, marginFactor];
}
