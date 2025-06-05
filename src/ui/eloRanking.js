// src/ui/eloRanking.js

import { allPlayers } from '../tournament.js';

/**
 * Renderuje tabelę rankingu ELO:
 * - sortuje rosnąco po ELO
 */
export function renderEloRanking() {
  const tableBody = document.querySelector("#eloRankingTable tbody");
  tableBody.innerHTML = "";

  const ranked = [...allPlayers]
    .filter(p => typeof p.elo === "number")
    .sort((a, b) => b.elo - a.elo);

  ranked.forEach((player, index) => {
    const row = tableBody.insertRow();
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${player.name}</td>
      <td>${player.elo}</td>
    `;
  });

  fadeInElement(document.getElementById("rankingView"));
}
