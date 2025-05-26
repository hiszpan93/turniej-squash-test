// src/utils/pairing.js

/**
 * Generuje harmonogram rund systemem kołowym (round-robin).
 * Jeśli liczba graczy jest nieparzysta, dodaje BYE (wolny los).
 *
 * @param {string[]} players – lista nazw/id graczy
 * @returns {Array<Array<[string, string]>>} – tablica rund, każda runda to lista par [graczA, graczB]
 */
export function generateRoundRobinRounds(players) {
  const list = [...players];
  if (list.length % 2 === 1) {
    list.push('BYE');
  }
  const rounds = [];
  const n = list.length;

  for (let round = 0; round < n - 1; round++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const p1 = list[i];
      const p2 = list[n - 1 - i];
      if (p1 !== 'BYE' && p2 !== 'BYE') {
        pairs.push([p1, p2]);
      }
    }
    rounds.push(pairs);
    // obrót: pierwszy gracz na stałe, reszta w prawo o 1
    list.splice(1, 0, list.pop());
  }

  return rounds;
}
/**
 * Generuje mecze dla danej serii, ograniczone liczbą dostępnych kortów.
 *
 * @param {string[]} players – lista nazw/id graczy
 * @param {number} courtCount – liczba dostępnych kortów
 * @param {number} seriesNumber – numer serii/rundy (1-based)
 * @returns {Array<{player1: string, player2: string, series: number}>}
 */
export function generateMatchesForSeries(players, courtCount, seriesNumber) {
  const rounds = generateRoundRobinRounds(players);
  const round = rounds[seriesNumber - 1] || [];
  const matches = [];

  for (let i = 0; i < courtCount && i < round.length; i++) {
    const [p1, p2] = round[i];
    matches.push({ player1: p1, player2: p2, series: seriesNumber });
  }

  return matches;
}
