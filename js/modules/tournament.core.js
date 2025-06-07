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

  // … w kolejnych krokach dodasz tu generateMatches(), updateElo() itd.
}
