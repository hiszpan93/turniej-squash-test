// src/ui/players.js

import { allPlayers } from '../tournament.js';

/**
 * Renderuje listę graczy z checkboxami:
 * - `tournamentEnded` blokuje zaznaczanie, jeśli turniej jest zakończony.
 */
export function renderPlayersList() {
  console.log("renderPlayersList uruchomione");
  const playersForm = document.getElementById("playersForm");
  playersForm.innerHTML = "";
  allPlayers.forEach(player => {
    playersForm.innerHTML += `
      <div class="form-check">
        <input class="form-check-input playerCheckbox" type="checkbox" value="${player.id}"
               id="player-${player.id}" ${window.tournamentEnded ? "disabled" : ""}>
        <label class="form-check-label" for="player-${player.id}">
          ${player.name} (ID: ${player.id})
        </label>
      </div>
    `;
  });
  console.log("📋 rendered players:", allPlayers.map(p => p.name));
}
