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
  /**
   * Potwierdza wynik meczu i aktualizuje stan turnieju.
   * @param {number} index – indeks meczu w this.matches
   * @param {number} score1 – liczba punktów gracza 1
   * @param {number} score2 – liczba punktów gracza 2
   */
  confirmMatch(index, score1, score2) {
    if (this.tournamentEnded) {
      throw new Error("Turniej został zakończony");
    }
    const match = this.matches[index];
    if (!match) {
      throw new Error(`Brak meczu o indeksie ${index}`);
    }

    // 1) ustaw wynik i potwierdzenie
    match.result = `${score1}:${score2}`;
    match.confirmed = true;

    // 2) aktualizacja serii zwycięstw/porażek
    this.updateStreak(match.player1, score1 > score2);
    this.updateStreak(match.player2, score2 > score1);

    // 3) aktualizacja ELO
    const p1 = this.players.find(p => p.name === match.player1);
    const p2 = this.players.find(p => p.name === match.player2);
    if (p1 && p2) {
      this.updateElo(p1, p2, score1, score2);
    }

    // 4) opcjonalnie: dodaj do historii wszystkich meczów
    if (!this.allMatches) this.allMatches = [];
    this.allMatches.push({ ...match, timestamp: new Date().toISOString() });
  }
  /**
   * Aktualizuje serię zwycięstw/porażek w generalStats.
   * @param {string} playerName 
   * @param {boolean} won 
   */
  updateStreak(playerName, won) {
    // pobierz lub utwórz statystyki gracza
    const gs = this.generalStats[playerName] ||= { wins: 0, losses: 0, pointsScored: 0, pointsConceded: 0, obecnosc: 0 };
    // nowa seria?
    if (!gs.streakType) {
      gs.streakType = won ? "W" : "L";
      gs.streakCount = 1;
    }
    // kontynuacja tej samej serii?
    else if ((won && gs.streakType === "W") || (!won && gs.streakType === "L")) {
      gs.streakCount++;
    }
    // zmiana serii
    else {
      gs.streakType = won ? "W" : "L";
      gs.streakCount = 1;
    }
  }
  /**
   * Oblicza i aplikuje zmianę ELO obu graczy.
   * @param {{elo:number}} player1 
   * @param {{elo:number}} player2 
   * @param {number} score1 
   * @param {number} score2 
   * @param {number} [K=24] 
   * @param {number} [D=0.75] 
   */
  updateElo(player1, player2, score1, score2, K = 24, D = 0.75) {
    // 1. Oczekiwane wyniki:
    const R1 = player1.elo, R2 = player2.elo;
    const E1 = 1 / (1 + 10 ** ((R2 - R1) / 400));
    // 2. Rzeczywisty wynik:
    const a1 = score1 > score2 ? 1 : 0;
    const a2 = 1 - a1;
    // 3. Mnożnik za przewagę:
    const margin = Math.abs(score1 - score2);
    const mf = margin <= 2
      ? 1
      : 1 + Math.min((margin - 2) * 0.1, 0.5);
    // 4. Surowe delty:
    const raw1 = K * (a1 - E1) * (a1 === 1 ? mf : 1);
    const raw2 = K * (a2 - (1 - E1)) * (a2 === 1 ? mf : 1);
    // 5. Zaokrąglenie i tłumienie:
    const delta1 = Math.round(raw1 * D);
    const delta2 = Math.round(raw2 * D);
    // 6. Zapis:
    player1.elo += delta1;
    player2.elo += delta2;
  }

  // … w kolejnych krokach dodasz tu generateMatches(), updateElo() itd.
}
