// js/modules/tournament.core.js

// Klasa, w której trzymamy całą czystą logikę turnieju
export class Tournament {
  constructor() {
    // lista wszystkich graczy
    this.players = [];
    // identyfikator następnego gracza
    this.nextPlayerId = 1;
    // (docelowo tu będą też mecze, statystyki itd.)
    this.matches = [];
    this.generalStats = {};
    // flaga zakończenia turnieju
    this.tournamentEnded = false;
  }

  /**
   * Dodaje nowego gracza o podanej nazwie.
   * Jeśli nazwa jest pusta lub już istnieje, wyświetla alert.
   * Zwraca obiekt nowego gracza lub undefined, gdy nie doda.
   */
  addPlayer(name) {
    if (this.tournamentEnded) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      alert("Podaj nazwę gracza!");
      return;
    }
    if (this.players.some(p => p.name.toLowerCase() === trimmedName.toLowerCase())) {
      alert("Gracz o takiej nazwie już istnieje!");
      return;
    }

    const newPlayer = {
      id: this.nextPlayerId++,
      name: trimmedName,
      elo: 1000
    };
    this.players.push(newPlayer);
    return newPlayer;
  }
/**
 * Generuje nową serię meczów według wybranego algorytmu.
 * @param {number} courtCount – ile kortów jest dostępnych jednocześnie
 * @returns {Array} lista obiektów meczów { player1, player2, court, result:"", confirmed:false, series, round }
 */
generateMatches(courtCount) {
  // 1) wyciągnij tylko tych graczy, którzy zostali zatwierdzeni (selected)
  const selected = this.players.filter(p => p.selected);
  if (selected.length < 2) {
    // za mało graczy – nic nie generujemy
    return [];
  }

  // 2) policz, z której serii zaczynamy
  const lastSeries = this.matches.at(-1)?.series || 0;
  const nextSeries = lastSeries + 1;

  // 3) stwórz wszystkie możliwe pary (bez powtórek)
  const pairings = [];
  for (let i = 0; i < selected.length; i++) {
    for (let j = i + 1; j < selected.length; j++) {
      pairings.push([selected[i], selected[j]]);
    }
  }

  // 4) algorytm układający kolejność rund i unikanie >2 meczów z rzędu
  const consecCounts = {};
  selected.forEach(p => consecCounts[p.name] = 0);

  let round = 1;
  const newMatches = [];
  const pool = [...pairings];
  while (pool.length > 0) {
    let courtIdx = 0;
    const roundPlayers = new Set();

    for (let k = 0; k < pool.length && courtIdx < courtCount; k++) {
      const [p1, p2] = pool[k];
      if (
        !roundPlayers.has(p1.name) &&
        !roundPlayers.has(p2.name) &&
        consecCounts[p1.name] < 2 &&
        consecCounts[p2.name] < 2
      ) {
        newMatches.push({
          player1: p1.name,
          player2: p2.name,
          court: courtIdx + 1,
          result: "",
          confirmed: false,
          series: nextSeries,
          round: round
        });
        // oznaczamy, że już grali w tej rundzie
        roundPlayers.add(p1.name);
        roundPlayers.add(p2.name);
        // update konsekwencji
        consecCounts[p1.name]++;
        consecCounts[p2.name]++;
        // usuwamy tę parę z puli
        pool.splice(k, 1);
        k--;
        courtIdx++;
      }
    }

    // reset limitu consecutives dla tych, którzy nie grali w tej rundzie
    selected.forEach(p => {
      if (!roundPlayers.has(p.name)) consecCounts[p.name] = 0;
    });

    round++;
  }

  // 5) zapisz w stanie obiektu i zwróć
  this.matches = newMatches;
  return newMatches;
}

  // … w kolejnych krokach dodasz tu generateMatches(), updateElo() itd.
}
