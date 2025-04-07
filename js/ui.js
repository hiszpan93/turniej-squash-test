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
    let player1Style = "";
    let player2Style = "";

    if (match.confirmed && match.result) {
      const [score1, score2] = match.result.split(":").map(Number);
      if (score1 > score2) {
        player1Style = ' style="color:green;font-weight:bold;"';
        player2Style = ' style="color:red;"';
      } else {
        player2Style = ' style="color:green;font-weight:bold;"';
        player1Style = ' style="color:red;"';
      }
      resultInput = `<span>${match.result}</span>`;
    } else {
      resultInput = `
<div class="card p-2 mb-2">
  <div class="row">
    <div class="col-6 text-center">
      <label style="font-size: 12px; color: #666;">${match.player1}</label>
      <input type="number" min="0" class="form-control form-control-sm text-center" id="score1-${index}" />
    </div>
    <div class="col-6 text-center">
      <label style="font-size: 12px; color: #666;">${match.player2}</label>
      <input type="number" min="0" class="form-control form-control-sm text-center" id="score2-${index}" />
    </div>
  </div>
</div>`;
    }

    tableHTML += `
      <tr class="${match.confirmed ? 'confirmed' : ''}">
        <td>${index + 1} (seria ${match.series || 1}, runda ${match.round || 1})</td>
        <td${player1Style}>${match.player1}</td>
        <td${player2Style}>${match.player2}</td>
        <td>${match.court}</td>
        <td class="p-2">${resultInput}</td>
        <td>
          <button id="confirmButton-${index}" class="btn btn-sm ${match.confirmed ? "btn-success" : "btn-outline-success"}" ${tournamentEnded || match.confirmed ? "disabled" : ""}>Potwierdź</button>
        </td>
      </tr>
    `;
  });
  fadeInElement(matchesTable);

  tableHTML += "</tbody>";
  matchesTable.innerHTML = tableHTML;

  matches.forEach((_, index) => {
    const btn = document.getElementById(`confirmButton-${index}`);
    if (btn) {
      btn.addEventListener("click", () => confirmMatch(index));
    }
  });
}




// Autofocus po pierwszym polu
function autoFocusNext(currentInput, nextId) {
  if (currentInput.value.length > 1) {
    document.getElementById(nextId)?.focus();
  }
}

function highlightWinner(index) {
  const input1 = document.getElementById(`score1-${index}`);
  const input2 = document.getElementById(`score2-${index}`);

  if (!input1 || !input2) return;

  const val1 = parseInt(input1.value);
  const val2 = parseInt(input2.value);

  input1.style.backgroundColor = "";
  input2.style.backgroundColor = "";

  if (isNaN(val1) || isNaN(val2)) return;
  if (val1 === val2) return;

  if (val1 > val2) {
    input1.style.backgroundColor = "#d4edda"; // zielony
    input2.style.backgroundColor = "#f8d7da"; // czerwony
  } else {
    input1.style.backgroundColor = "#f8d7da";
    input2.style.backgroundColor = "#d4edda";
  }
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
  fadeInElement(resultsTable.parentElement);

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
  fadeInElement(statsTable.parentElement);

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
  fadeInElement(generalStatsTable.parentElement);

}
function renderArchiveView() {
  const container = document.getElementById("tournamentArchive");
  if (!container) return;

  container.innerHTML = "<p><em>⏳ Wczytywanie archiwum...</em></p>";

  setTimeout(() => {
    const archive = JSON.parse(localStorage.getItem("turniej_archiwum")) || [];
    if (archive.length === 0) {
      container.innerHTML = "<p>Brak zapisanych turniejów.</p>";
      return;
    }

    let html = "";
    archive.forEach((turniej, i) => {
      html += `
      <div class="mb-3 border rounded p-2 bg-light">
        <strong>Turniej #${i + 1} – ${new Date(turniej.data).toLocaleString()}</strong><br/>
        <em>Gracze:</em> ${turniej.gracze.join(", ")}
        ${turniej.serie.map(seria => `
          <details class="mt-2">
            <summary><strong>${seria.numer}</strong></summary>
            <div class="table-responsive mt-2">
              <table class="table table-sm table-bordered">
                <thead>
                  <tr>
                    <th>Gracz 1</th>
                    <th>Gracz 2</th>
                    <th>Kort</th>
                    <th>Runda</th>
                    <th>Wynik</th>
                  </tr>
                </thead>
                <tbody>
                  ${seria.mecze.map(m => `
                    <tr>
                      <td>${m.gracz1}</td>
                      <td>${m.gracz2}</td>
                      <td>${m.kort}</td>
                      <td>${m.runda}</td>
                      <td>${m.wynik}</td>
                    </tr>`).join("")}
                </tbody>
              </table>
            </div>
          </details>
        `).join("")}
      </div>`;
    });

    container.innerHTML = html;
    fadeInElement(container);

  }, 200);
}



window.renderArchiveView = renderArchiveView;

// Ustawienie funkcji renderujących w globalnym obiekcie `window` (dla dostępu z tournament.js)
window.renderPlayersList = renderPlayersList;
window.renderMatches = renderMatches;
window.addResultToResultsTable = addResultToResultsTable;
window.renderStats = renderStats;
window.renderGeneralStats = renderGeneralStats;
window.renderArchiveView = renderArchiveView;
// Podpięcie zdarzeń interfejsu do przycisków
document.getElementById("addPlayerBtn").addEventListener('click', addPlayer);
document.getElementById("confirmPlayersBtn").addEventListener('click', confirmPlayers);
document.getElementById("generateMatchesBtn").addEventListener('click', generateMatches);
document.getElementById("endTournamentBtn").addEventListener('click', endTournament);




document.getElementById("resetTournamentBtn").addEventListener("click", () => {
  if (typeof resetTournamentData === "function") {
    resetTournamentData();
  }
});

// ======= FADE-IN ELEMENTÓW INTERFEJSU =======
function fadeInElement(el) {
  if (!el) return;
  el.classList.remove("fade-in");
  void el.offsetWidth;
  el.classList.add("fade-in");
}

window.fadeInElement = fadeInElement;

// Wczytanie początkowych danych i sprawdzenie automatycznych resetów
loadDataFromFirebase();
