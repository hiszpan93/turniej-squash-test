
import {
  allPlayers, matches, stats, generalStats, addPlayer, confirmPlayers, generateMatches, confirmMatch,
  endTournament, loadDataFromFirebase, resetTournamentData
} from './tournament.js';

import { collection, getDocs, getDoc, auth, getAuthFn, db, doc, setDoc, deleteDoc } from "./firebase.js";

  
  
 
    
    
    
 async function calculatePayout(players) {
  // ── 1. Stałe i pobranie danych z formularza ────────────────────────────
  const COST_PER_HOUR      = 44;
  const MIN_PRICE_PER_HOUR = 14;
  const MAX_DISCOUNT_HOUR  = COST_PER_HOUR - MIN_PRICE_PER_HOUR; // = 30

  const numCourts = +document.getElementById("num-courts").value;
  const hours     = +document.getElementById("court-hours").value;
  const normalCnt = +document.getElementById("ms-normal").value;
  const lightCnt  = +document.getElementById("ms-light").value;
  const payerId   = parseInt(document.getElementById("payer-select").value, 10);
if (window.payoutsCalculated) {
  alert("Podział kosztów już został obliczony dla tego turnieju.");
  return;
}
  // ── 2. Lista uczestników i walidacja kart ──────────────────────────────
  const participants = players.filter(p => p.selected);
  const maxCards     = participants.length;
  if (normalCnt + lightCnt > maxCards) {
    alert(`Maksymalnie ${maxCards} kart MS (tylu jest graczy).`);
    return;
  }

  // ── 3. Obliczenie kosztu kortów + rabatów ──────────────────────────────
  const baseCost       = numCourts * hours * COST_PER_HOUR;
  const discountNormal = normalCnt * hours * 15;
  let remainingLight   = lightCnt;
  let discountLight    = 0;
  for (let h = 1; h <= hours; h++) {
    const use = Math.min(remainingLight, numCourts);
    discountLight += use * 15;
    remainingLight -= use;
    if (!remainingLight) break;
  }
  const rawDiscount   = discountNormal + discountLight;
  const capDiscount   = numCourts * hours * MAX_DISCOUNT_HOUR;
  const totalDiscount = Math.min(rawDiscount, capDiscount);
  const courtCost     = baseCost - totalDiscount;

  // ── 4. Podział kosztów na uczestników (bez płatnika) ──────────────────
  const debt   = new Map(participants.map(p => [p.id, 0]));
  const shareCourt = courtCost / participants.length;
  const sharers = participants.filter(p => p.id !== payerId);
  sharers.forEach(p => debt.set(p.id, shareCourt));

  // ── 5. Zapis do Firestore ───────────────────────────────────────────────
  const payoutsPath = doc(db, "turniej", "stats");
  const payoutsCol  = collection(payoutsPath, "rozliczenia");
  // 5. Zapis i akumulacja długu
 for (const p of sharers) {
  const payoutDoc = doc(payoutsCol, p.id.toString());
   // 1) pobierz dotychczasowy dług (jeśli istnieje)
   const snap    = await getDoc(payoutDoc);
   const oldDebt = snap.exists() ? snap.data().debt : 0;
   // 2) dodaj nową część długi z bieżącego turnieju
   const newDebt = oldDebt + (debt.get(p.id) || 0);
   // 3) zapisz z merge, żeby nie nadpisywać ewentualnych innych pól
   await setDoc(payoutDoc, { debt: newDebt }, { merge: true });
 }

  // ── 6. Ustawienie labelki „Wierzyciel” ─────────────────────────────────
  const payerName      = players.find(p => p.id === payerId)?.name || "";
  document.getElementById("creditor-label")
          .textContent = `Wierzyciel: ${payerName}`;
const caption = document.getElementById("payout-caption");
caption.textContent = `Wierzyciel: ${payerName}`;

  // ── 7. Renderowanie tabeli ──────────────────────────────────────────────
  const tbody = document.querySelector("#payout-table tbody");
  tbody.innerHTML = ""; // usuń stare wiersze

  sharers.forEach(p => {
    const amount = (debt.get(p.id) || 0).toFixed(2);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.name}</td>
      <td>${amount} zł</td>
      <td>
        <button class="btn btn-sm btn-outline-success settle-btn">
          Rozliczono
        </button>
      </td>`;

    // listener usuwający dług po kliknięciu
    tr.querySelector(".settle-btn").addEventListener("click", async () => {
      await deleteDoc(doc(payoutsCol, p.id.toString()));
      tr.remove();
    });
    tbody.appendChild(tr);
  });
  window.payoutsCalculated = true;
document.getElementById("calc-btn").disabled = true;

}


async function loadPayouts(players) {
  const tbody = document.querySelector("#payout-table tbody");
  tbody.innerHTML = "";

  // referencja do subkolekcji
  const payoutsPath = doc(db, "turniej", "stats");
  const payoutsCol  = collection(payoutsPath, "rozliczenia");
  
  try {
    const snapshot = await getDocs(payoutsCol);
    snapshot.forEach(docSnap => {
  const pId   = docSnap.id;
  const data  = docSnap.data();
  const player = players.find(p => p.id.toString() === pId);
  if (!player) return;

  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>${player.name}</td>
    <td>${(data.debt || 0).toFixed(2)} zł</td>
    <td>
      <button class="btn btn-sm btn-outline-success settle-btn">
        Rozliczono
      </button>
    </td>`;

  tr.querySelector(".settle-btn").addEventListener("click", async () => {
    await deleteDoc(doc(payoutsCol, pId));
    tr.remove();
  });

  tbody.appendChild(tr);
});

  } catch (err) {
    console.error("Błąd odczytu rozliczeń:", err);
  }
}


  
function initUI() {
  console.log("✅ initUI() odpalone");

  // Po zalogowaniu – pokazujemy całość UI
  document.getElementById("mainContainer").style.display = "block";
  console.log("DOM refs:", {
    main: document.getElementById("mainContainer"),
    tabs: document.getElementById("viewTabs"),
    bar: document.getElementById("userInfoBar"),
  });
  
  document.getElementById("viewTabs").style.display = "flex";
  document.getElementById("userInfoBar").style.display = "flex";
// w initUI (ui.js)
document.getElementById("showPayoutBtn").style.display = "none";



document.getElementById("calc-btn").addEventListener("click", () => calculatePayout(allPlayers));


  // ======= RENDEROWANIE LISTY GRACZY Z CHECKBOXAMI =======
  function renderPlayersList() {
    console.log("renderPlayersList uruchomione");
    const playersForm = document.getElementById("playersForm");
    playersForm.innerHTML = "";
    allPlayers.forEach(player => {
      playersForm.innerHTML += `
        <div class="form-check">
          <input class="form-check-input playerCheckbox" type="checkbox" value="${player.id}" ${window.tournamentEnded ? "disabled" : ""}


 id="player-${player.id}">
          <label class="form-check-label" for="player-${player.id}">
            ${player.name} (ID: ${player.id})
          </label>
        </div>
      `;
    });
    console.log("📋 rendered players:", allPlayers.map(p => p.name));

  }
  
  
  // ======= RENDEROWANIE TABELI MECZÓW =======
  function renderMatches() {
    const matchesTable = document.getElementById("matchesTable");
    let tableHTML = `
      <thead>
        <tr>
          <th>Mecz</th>
          <th>Gracze</th>
          <th>Kort</th>
          <th>Status</th>
          <th>Akcja</th>
        </tr>
      </thead>
      <tbody>
    `;
  
    matches.forEach((match, index) => {
      const status = match.confirmed ? "✅" : "⏳";
      const actionBtn = match.confirmed
        ? `<span class="badge bg-success">Zatwierdzony</span>`
        : `<button class="btn btn-sm btn-outline-primary score-row-toggle" onclick="toggleScoreRow(${index})">➕ Pokaż</button>`;
  
      tableHTML += `
        <tr class="${match.confirmed ? 'confirmed' : ''}">
          <td>${index + 1} (seria ${match.series || 1}, runda ${match.round || 1})</td>
          <td>${match.player1} vs ${match.player2}</td>
          <td>${match.court}</td>
          <td>${status}</td>
          <td>${actionBtn}</td>
        </tr>
        <tr id="scoreRow-${index}" class="score-row" style="display: none;">
          <td colspan="5">
            <div class="card p-3">
              <div class="text-center mb-2 fade-in">
                <strong>${match.player1}</strong> vs <strong>${match.player2}</strong>
              </div>
              <div class="d-flex justify-content-between align-items-center gap-2">
                <div class="w-50 text-center">
                  <div class="player-label mb-1">${match.player1}</div>
                  <input type="number" id="score1-${index}" class="score-input-tile" min="0" />
                </div>
                <div class="px-2">:</div>
                <div class="w-50 text-center">
                  <div class="player-label mb-1">${match.player2}</div>
                  <input type="number" id="score2-${index}" class="score-input-tile" min="0" />
                </div>
              </div>
              <button id="confirmButton-${index}" class="btn btn-success mt-3 w-100">Potwierdź</button>
            </div>
          </td>
        </tr>
      `;
    });
  
    tableHTML += "</tbody>";
    matchesTable.innerHTML = tableHTML;
    fadeInElement(matchesTable);
  
    matches.forEach((_, index) => {
      const btn = document.getElementById(`confirmButton-${index}`);
      if (btn) {
        btn.addEventListener("click", () => confirmMatch(index));
    
      }
    });
  }
  
  
  // Przełączanie widoczności kafelka
  window.toggleScoreRow = function(index) {
    const clickedRow = document.getElementById(`scoreRow-${index}`);
    const clickedBtn = document.querySelector(`button[onclick="toggleScoreRow(${index})"]`);
  
    if (!clickedRow || !clickedBtn) return;
  
    const isCurrentlyOpen = clickedRow.style.display !== "none";
  
    // Zamknij wszystkie inne
    document.querySelectorAll(".score-row").forEach((row, i) => {
      if (i !== index) {
        row.style.display = "none";
        row.classList.remove("slide-down", "slide-up");
      }
    });
    document.querySelectorAll(".score-row-toggle").forEach((btn, i) => {
      if (i !== index) btn.innerText = "➕ Pokaż";
    });
  
    // Przełącz aktualny
    if (isCurrentlyOpen) {
      clickedRow.classList.remove("slide-down");
      clickedRow.classList.add("slide-up");
      setTimeout(() => {
        clickedRow.style.display = "none";
        clickedRow.classList.remove("slide-up");
      }, 250);
      clickedBtn.innerText = "➕ Pokaż";
    } else {
      clickedRow.style.display = "table-row";
      clickedRow.classList.remove("slide-up");
      clickedRow.classList.add("slide-down");
      clickedBtn.innerText = "➖ Ukryj";
    
      // 🔽 Autofocus po otwarciu
      setTimeout(() => {
        document.getElementById(`score1-${index}`)?.focus();
      }, 100);
    }
    
  };
  
  
  
  
  
  
  
  // Autofocus po pierwszym polu
  function autoFocusNext(currentInput, nextId) {
    if (currentInput.value.length > 1) {
      document.getElementById(nextId)?.focus();
    }
  }
  
  function highlightWinner(index) {
    const input1 = document.getElementById(`score1-${index}`);
    const input2 = document.getElementById(`score2-${index}`);
    const label1 = input1?.parentElement?.querySelector(".player-label");
    const label2 = input2?.parentElement?.querySelector(".player-label");
  
    if (!input1 || !input2 || !label1 || !label2) return;
  
    const val1 = parseInt(input1.value);
    const val2 = parseInt(input2.value);
  
    // Reset
    input1.style.backgroundColor = "";
    input2.style.backgroundColor = "";
    label1.innerHTML = matches[index].player1;
    label2.innerHTML = matches[index].player2;
    label1.classList.remove("winner-glow");
    label2.classList.remove("winner-glow");
  
    // Sprawdzenie poprawnych danych
    if (isNaN(val1) || isNaN(val2) || val1 === val2) {
      removeWinnerSummary(index);
      return;
    }
  
    // Kolorowanie + 🏆 + animacja
    const winnerLabel = val1 > val2 ? label1 : label2;
    const loserLabel = val1 > val2 ? label2 : label1;
    const winnerInput = val1 > val2 ? input1 : input2;
    const loserInput = val1 > val2 ? input2 : input1;
  
    winnerLabel.innerHTML = `🏆 ${val1 > val2 ? matches[index].player1 : matches[index].player2}`;
    winnerLabel.classList.add("winner-glow");
    loserLabel.classList.remove("winner-glow");
  
    winnerInput.style.backgroundColor = "#d4edda";
    loserInput.style.backgroundColor = "#f8d7da";
  
    // Podpis zwycięzcy pod spodem
    showWinnerSummary(index, matches[index].player1, matches[index].player2, val1, val2);
  }
  
  function showWinnerSummary(index, p1, p2, val1, val2) {
    const summaryId = `winnerSummary-${index}`;
    let summaryEl = document.getElementById(summaryId);
    const container = document.getElementById(`confirmButton-${index}`)?.parentElement;
    const winner = val1 > val2 ? p1 : p2;
    const result = `${val1}:${val2}`;
  
    if (!summaryEl) {
      summaryEl = document.createElement("div");
      summaryEl.id = summaryId;
      summaryEl.className = "text-center mt-2 fade-in winner-summary";
      container.appendChild(summaryEl);
    }
  
    summaryEl.innerHTML = `🏆 <strong>Zwycięzca:</strong> ${winner} (${result})`;
  }
  
  function removeWinnerSummary(index) {
    const el = document.getElementById(`winnerSummary-${index}`);
    if (el) el.remove();
  }
  
  
  
  // ======= DODANIE WYNIKU DO TABELI WYNIKÓW =======
  function addResultToResultsTable(match) {
    const resultsTable = document.getElementById("resultsTable").getElementsByTagName("tbody")[0];
    const row = resultsTable.insertRow();
    row.innerHTML = `
      <td>${resultsTable.rows.length + 1}</td>
      <td>Mecz ${match.series || 1}-${match.round || 1}</td>
      <td>${match.player1}</td>
      <td>${match.player2}</td>
      <td>${match.result}</td>
    `;
    fadeInElement(resultsTable.parentElement);
  }
  
  
  // ======= RENDEROWANIE TABEL STATYSTYK GRACZY =======
  function renderStats() {
    console.log("renderGeneralStats uruchomione");

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
  
  
  
  
  // ======= RENDEROWANIE TABEL STATYSTYK OGÓLNYCH =======
  function renderGeneralStats() {
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
        <td>${
    player.streakCount ? `${player.streakCount}${player.streakType}` : "-"
  }</td>
  
      `;
    });
    fadeInElement(generalStatsTable.parentElement);
  
  }
  
  function renderEloRanking() {
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
  
  
  // ======= RENDEROWANIE TABELI ARCHIWUM Z GLOBALNĄ NUMERACJĄ =======
  function renderArchiveView() {
    document.getElementById("archiveLoading").style.display = "block";
    document.getElementById("tournamentArchive").innerHTML = "";
  
    const container = document.getElementById("tournamentArchive");
    let archiveData = JSON.parse(localStorage.getItem("turniej_archiwum")) || [];
  
    const auth = getAuthFn(); // 👈 Zamiast getAuth()
  
    const user = auth.currentUser;
  
    if (user) {
      getDocs(collection(window.db, "archiwa"))
        .then(snapshot => {
          const firebaseArchives = [];
          snapshot.forEach(doc => {
            firebaseArchives.push(doc.data());
          });
          archiveData = archiveData.concat(firebaseArchives);
          renderAllArchives();
        })
        .catch(err => {
          console.error("Błąd pobierania archiwum z Firebase:", err);
          renderAllArchives();
        });
    } else {
      renderAllArchives();
    }
  

    function renderAllArchives() {
      if (archiveData.length === 0) {
        container.innerHTML = "<p>Brak zapisanych turniejów.</p>";
        return;
      }
  
      const grouped = {};
      archiveData.forEach(turniej => {
        const date = new Date(turniej.data);
        const key = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}`;
        grouped[key] = grouped[key] || [];
        grouped[key].push(turniej);
      });
  
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, "0")}`;
  
      const monthList = Object.keys(grouped).sort().reverse();
      const monthSelect = `
        <label for="monthSelect" class="form-label">Wybierz miesiąc:</label>
        <select id="monthSelect" class="form-select form-select-sm mb-3">
          ${monthList.map(m => `<option value="${m}" ${m === currentMonth ? "selected" : ""}>${m}</option>`).join("")}
        </select>
      `;
  
      container.innerHTML = monthSelect + `<div id="archiveContent"></div>`;
  
      const renderForMonth = (monthKey) => {
        const data = grouped[monthKey] || [];
        let html = "";
  
        data.reverse().forEach(turniej => {
          let lp = 1;
          html += `
            <div class="card mb-4">
              <div class="card-header d-flex justify-content-between align-items-center">
                <strong>📅 Turniej ${new Date(turniej.data).toLocaleString()}</strong>
                <span class="badge bg-secondary">${turniej.gracze?.length || 0} graczy</span>
              </div>
              <div class="card-body">
                <p><strong>Gracze:</strong> ${turniej.gracze?.join(", ") || "-"}</p>
                <div class="table-responsive" style="max-height: 300px; overflow-y: auto;">
                  <table class="table table-sm table-bordered">
                    <thead>
                      <tr>
                        <th>L.p.</th>
                        <th>Seria</th>
                        <th>Runda</th>
                        <th>Gracz 1</th>
                        <th>Gracz 2</th>
                        <th>Wynik</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${(turniej.serie || []).flatMap(seria =>
                        seria.mecze.map(m => `
                          <tr>
                            <td>${lp++}</td>
                            <td>${seria.numer.replace("seria_", "")}</td>
                            <td>${m.runda}</td>
                            <td>${m.gracz1}</td>
                            <td>${m.gracz2}</td>
                            <td>${m.wynik || "-"}</td>
                          </tr>
                        `)
                      ).join("")}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          `;
        });
  
        document.getElementById("archiveContent").innerHTML = html || "<p>Brak danych.</p>";
      };
  
      document.getElementById("monthSelect").addEventListener("change", (e) => {
        renderForMonth(e.target.value);
      });
  
      renderForMonth(currentMonth);
      document.getElementById("archiveLoading").style.display = "none";
  
      fadeInElement(container);
    }
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
  const endBtn = document.getElementById("endTournamentBtn");
  if (endBtn) endBtn.addEventListener("click", endTournament);
  
  
  document.querySelectorAll("#payout-table .settle-btn")
  .forEach((btn, i) => {
    btn.addEventListener("click", async () => {
      const p = sharers[i];
      await deleteDoc(doc(payoutsCol, p.id.toString()));
      btn.closest("tr").remove();
    });
  });

  
  
  const resetBtn = document.getElementById("resetTournamentBtn");
if (resetBtn) {
  resetBtn.addEventListener("click", () => {
    if (typeof resetTournamentData === "function") {
      resetTournamentData();
    }
  });
}

  
  // ======= FADE-IN ELEMENTÓW INTERFEJSU =======
  function fadeInElement(el) {
    if (!el) return;
    el.classList.remove("fade-in");
    void el.offsetWidth;
    el.classList.add("fade-in");
  }
  
  window.fadeInElement = fadeInElement;
  
  
  
  window.renderEloRanking = renderEloRanking;
  // ======= OBSŁUGA ZAKŁADEK =======
  
  document.getElementById("showTournamentBtn").addEventListener("click", () => {
    document.getElementById("mainContainer").style.display = "block";
    document.getElementById("archiveView").style.display = "none";
    document.getElementById("rankingView").style.display = "none";
    document.getElementById("payoutView").style.display = "none";

  });
  
  document.getElementById("showArchiveBtn").addEventListener("click", () => {
    document.getElementById("mainContainer").style.display = "none";
    document.getElementById("archiveView").style.display = "block";
    document.getElementById("rankingView").style.display = "none";
    document.getElementById("payoutView").style.display = "none";

    window.renderArchiveView?.();
  });
  
  document.getElementById("showRankingBtn").addEventListener("click", () => {
    document.getElementById("mainContainer").style.display = "none";
    document.getElementById("archiveView").style.display = "none";
    document.getElementById("rankingView").style.display = "block";
    document.getElementById("payoutView").style.display = "none";

    window.renderEloRanking?.();
  });
  }
document.getElementById("showPayoutBtn").addEventListener("click", () => {
  ["mainContainer","archiveView","rankingView","payoutView"].forEach(id =>
    document.getElementById(id).style.display = "none"
  );

  document.getElementById("payoutView").style.display = "block";
  // 1) Pobierz aktualnych uczestników
const participants = allPlayers.filter(p => p.selected);

// 2) Opróżnij i wypełnij select płatnika tylko nimi
const payerSelect = document.getElementById("payer-select");
payerSelect.innerHTML = "";
participants.forEach(p => {
  const opt = `<option value="${p.id}">${p.name}</option>`;
  payerSelect.insertAdjacentHTML("beforeend", opt);
});

// Teraz pokaz i ładuj dane
loadPayouts(allPlayers);

});


  export { initUI };
