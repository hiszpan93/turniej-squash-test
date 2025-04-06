import { allPlayers, matches, stats, generalStats, tournamentEnded,
         addPlayer, confirmPlayers, generateMatches, confirmMatch,
        endTournament,
         loadDataFromFirebase,  
          } from './tournament.js';


// ======= RENDEROWANIE LISTY GRACZY Z CHECKBOXAMI =======
function renderPlayersList() {
  const playersForm = document.getElementById("playersForm");
  playersForm.innerHTML = "";
  allPlayers.forEach(player => {
    playersForm.innerHTML += `
      <div class="form-check">
        <input class="form-check-input playerCheckbox" type="checkbox" value="${player.id}" ${tournamentEnded ? "disabled" : ""} id="player-${player.id}">
        <label class="form-check-label" for="player-${player.id}">
          ${player.name} (ID: ${player.id})
        </label>
      </div>
    `;
  });
}

// ======= RENDEROWANIE TABELI MECZÓW =======
function renderMatches() {
  const matchesTable = document.getElementById("matchesTable");
  let tableHTML = `
    <thead>
      <tr>
        <th>Mecz</th>
        <th>Gracz 1</th>
        <th>Gracz 2</th>
        <th>Kort</th>
        <th>Wynik</th>
        <th>Potwierdzenie</th>
      </tr>
    </thead>
    <tbody>
  `;

  matches.forEach((match, index) => {
    let resultInput = "";

    if (match.result) {
      resultInput = `<span>${match.result}</span>`;
    } else {
      resultInput = `
        <input type="text" class="form-control" id="result-${index}" placeholder="np. 11:9" style="max-width: 120px;" />
      `;
    }

    tableHTML += `
      <tr class="${match.confirmed ? 'confirmed' : ''}">
        <td>${index + 1} (runda ${match.round})</td>
        <td>${match.player1}</td>
        <td>${match.player2}</td>
        <td>${match.court}</td>
        <td>${resultInput}</td>
        <td>
  <button id="confirmButton-${index}" class="btn btn-sm btn-outline-success" ${tournamentEnded || match.confirmed ? "disabled" : ""}>Potwierdź</button>
</td>

      </tr>
    `;
  });

  tableHTML += "</tbody>";
  matchesTable.innerHTML = tableHTML;

  // Dodanie nasłuchiwania zdarzeń na przyciski potwierdzenia wyniku
  matches.forEach((_, index) => {
    const btn = document.getElementById(`confirmButton-${index}`);
    if (btn) {
      btn.addEventListener('click', () => confirmMatch(index));
    }
  });
}


// ======= DODANIE WYNIKU DO TABELI WYNIKÓW =======
function addResultToResultsTable(match) {
  const resultsTable = document.getElementById("resultsTable").getElementsByTagName("tbody")[0];
  const row = resultsTable.insertRow();
  row.innerHTML = `
    <td>${resultsTable.rows.length + 1}</td>
    <td>${match.player1}</td>
    <td>${match.player2}</td>
    <td>${match.result}</td>
  `;
}

// ======= RENDEROWANIE TABEL STATYSTYK GRACZY =======
function renderStats() {
  const statsTable = document.getElementById("statsTable").getElementsByTagName("tbody")[0];
  statsTable.innerHTML = "";
  const playersArr = Object.keys(stats).map(player => ({
    name: player,
    wins: stats[player].wins,
    losses: stats[player].losses,
    pointsScored: stats[player].pointsScored,
    pointsConceded: stats[player].pointsConceded
  }));
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
    `;
  });
}




// ======= RENDEROWANIE TABEL STATYSTYK OGÓLNYCH =======
function renderGeneralStats() {
  const generalStatsTable = document.getElementById("generalStatsTable").getElementsByTagName("tbody")[0];
  generalStatsTable.innerHTML = "";
  const playersArr = Object.keys(generalStats).map(player => ({
    name: player,
    wins: generalStats[player].wins,
    losses: generalStats[player].losses,
    pointsScored: generalStats[player].pointsScored,
    pointsConceded: generalStats[player].pointsConceded,
    obecnosc: generalStats[player].obecnosc || 0
  }));
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
      <td>${player.wins}</td>
      <td>${player.losses}</td>
      <td>${played}</td>
      <td>${player.pointsScored}</td>
      <td>${avgScored}</td>
      <td>${player.pointsConceded}</td>
      <td>${avgConceded}</td>
      <td>${player.obecnosc}</td>
    `;
  });
}

// Ustawienie funkcji renderujących w globalnym obiekcie `window` (dla dostępu z tournament.js)
window.renderPlayersList = renderPlayersList;
window.renderMatches = renderMatches;
window.addResultToResultsTable = addResultToResultsTable;
window.renderStats = renderStats;
window.renderGeneralStats = renderGeneralStats;

// Podpięcie zdarzeń interfejsu do przycisków
document.getElementById("addPlayerBtn").addEventListener('click', addPlayer);
document.getElementById("confirmPlayersBtn").addEventListener('click', confirmPlayers);
document.getElementById("generateMatchesBtn").addEventListener('click', generateMatches);
document.getElementById("endTournamentBtn").addEventListener('click', endTournament);



// Wczytanie początkowych danych i sprawdzenie automatycznych resetów
loadDataFromFirebase();
