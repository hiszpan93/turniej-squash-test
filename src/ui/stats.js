// src/ui/stats.js

import { stats, allPlayers, generalStats } from '../tournament.js';

/**
 * Renderuje tabelę statystyk dla bieżącego turnieju:
 * - pokazywane są wins, losses, points, ELO, streak
 */
export function renderStats() {
  console.log("renderStats uruchomione");

  const statsTable = document.getElementById("statsTable").getElementsByTagName("tbody")[0];
  statsTable.innerHTML = "";
  const playersArr = Object.keys(stats).map(player => {
    const full = allPlayers.find(p => p.name === player);
    return {
      name: player,
      wins: stats[player].wins,
      losses: stats[player].losses,
      pointsScored: stats[player].pointsScored,
      pointsConceded: stats[player].pointsConceded,
      elo: full?.elo ?? 1000
    };
  });

  playersArr.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    const ratioA = a.pointsConceded > 0 ? a.pointsScored / a.pointsConceded : (a.pointsScored > 0 ? Infinity : 0);
    const ratioB = b.pointsConceded > 0 ? b.pointsScored / b.pointsConceded : (b.pointsScored > 0 ? Infinity : 0);
    return ratioB - ratioA;
  });

  playersArr.forEach(player => {
    const played = player.wins + player.losses;
    const avgScored = played > 0 ? (player.pointsScored / played).toFixed(2) : "0.00";
    const avgConceded = played > 0 ? (player.pointsConceded / played).toFixed(2) : "0.00";
    const row = statsTable.insertRow();
    row.innerHTML = `
      <td>${player.name}</td>
      <td>${player.wins}</td>
      <td>${player.losses}</td>
      <td>${played}</td>
      <td>${player.pointsScored}</td>
      <td>${avgScored}</td>
      <td>${player.pointsConceded}</td>
      <td>${avgConceded}</td>
      <td>${player.elo}</td>
      <td>${
        generalStats[player.name] && generalStats[player.name].streakCount
          ? generalStats[player.name].streakCount + generalStats[player.name].streakType
          : "-"
      }</td>
    `;
  });
  fadeInElement(statsTable.parentElement);
}
