// src/ui/generalStats.js

import { generalStats, allPlayers } from '../tournament.js';

/**
 * Renderuje tabelę statystyk ogólnych:
 * - ELO, wins, losses, obecnosc, streak
 */
export function renderGeneralStats() {
  const generalStatsTable = document.getElementById("generalStatsTable").getElementsByTagName("tbody")[0];
  generalStatsTable.innerHTML = "";
  const playersArr = Object.keys(generalStats).map(player => {
    const full = allPlayers.find(p => p.name === player);
    return {
      name: player,
      wins: generalStats[player].wins,
      losses: generalStats[player].losses,
      pointsScored: generalStats[player].pointsScored,
      pointsConceded: generalStats[player].pointsConceded,
      obecnosc: generalStats[player].obecnosc || 0,
      elo: full?.elo ?? 1000,
      streakCount: generalStats[player].streakCount || 0,
      streakType: generalStats[player].streakType || "-"
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
    const row = generalStatsTable.insertRow();
    row.innerHTML = `
      <td>${player.name}</td>
      <td>${player.elo}</td>
      <td>${player.wins}</td>
      <td>${player.losses}</td>
      <td>${played}</td>
      <td>${player.pointsScored}</td>
      <td>${avgScored}</td>
      <td>${player.pointsConceded}</td>
      <td>${avgConceded}</td>
      <td>${player.obecnosc}</td>
      <td>${player.streakCount ? `${player.streakCount}${player.streakType}` : "-"}</td>
    `;
  });
  fadeInElement(generalStatsTable.parentElement);
}
