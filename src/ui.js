// src/ui.js

// ===== Importy z logiki turnieju =====
import {
  allPlayers,
  matches,
  stats,
  generalStats,
  addPlayer,
  confirmPlayers,
  generateMatches,
  confirmMatch,
  endTournament,
  loadDataFromFirebase,
  resetTournamentData
} from './tournament.js';

// ===== Importy modułów UI =====
import { renderPlayersList }     from './ui/players.js';
import { renderMatches }         from './ui/matches.js';
import { renderStats }           from './ui/stats.js';
import { renderGeneralStats }    from './ui/generalStats.js';
import { renderEloRanking }      from './ui/eloRanking.js';
import { renderArchiveView }     from './ui/archive.js';
import { calculatePayout,
         loadPayouts }           from './ui/payout.js';
import {
  showTournamentView,
  showArchiveView,
  showRankingView,
  fadeInElement
} from './ui/tournamentsNav.js';

// ===== Główna funkcja inicjalizująca UI =====
function initUI() {
  console.log("✅ initUI() odpalone");

  // 1) Po zalogowaniu – pokazujemy główny kontener i zakładki
  document.getElementById("mainContainer").style.display = "block";
  document.getElementById("viewTabs").style.display      = "flex";
  document.getElementById("userInfoBar").style.display    = "flex";

  // 2) Na starcie ukrywamy przycisk Payout (będzie pokazywany dopiero po zakończeniu turnieju)
  document.getElementById("showPayoutBtn").style.display = "none";

  // 3) „Oblicz rozliczenie” (payout)
  document.getElementById("calc-btn")
          .addEventListener("click", () => calculatePayout(allPlayers));

  // 4) Przycisk „Dodaj gracza”, „Potwierdź graczy”, „Generuj mecze”, „Zakończ turniej”, „Reset”
  document.getElementById("addPlayerBtn")
          .addEventListener("click", addPlayer);
  document.getElementById("confirmPlayersBtn")
          .addEventListener("click", confirmPlayers);
  document.getElementById("generateMatchesBtn")
          .addEventListener("click", generateMatches);
  const endBtn = document.getElementById("endTournamentBtn");
  if (endBtn) {
    endBtn.addEventListener("click", endTournament);
  }
  document.getElementById("resetTournamentBtn")
          .addEventListener("click", () => {
            if (typeof resetTournamentData === "function") {
              resetTournamentData();
            }
          });

  // 5) Dropdown do rozliczeń (po wybraniu płatnika)
  //    (zakładamy, że elementy HTML: #payout-table itp. są już w DOM-ie)
  //    – usunięcie pozycji z Firestore:
  document.querySelectorAll("#payout-table .settle-btn")
    .forEach((btn, i) => {
      btn.addEventListener("click", async () => {
        const p = sharers[i];
        await deleteDoc(doc(payoutsCol, p.id.toString()));
        btn.closest("tr").remove();
      });
    });

  // 6) Globalna funkcja przełączania wiersza wyniku
  window.toggleScoreRow = function(index) {
    const clickedRow = document.getElementById(`scoreRow-${index}`);
    const clickedBtn = document.querySelector(`button[onclick="toggleScoreRow(${index})"]`);
    if (!clickedRow || !clickedBtn) return;

    const isOpen = clickedRow.style.display !== "none";

    // a) Zamknij wszystkie inne:
    document.querySelectorAll(".score-row").forEach((row, i) => {
      if (i !== index) {
        row.style.display = "none";
        row.classList.remove("slide-down", "slide-up");
      }
    });
    document.querySelectorAll(".score-row-toggle").forEach((btn, i) => {
      if (i !== index) btn.innerText = "➕ Pokaż";
    });

    // b) Przełącz bieżący:
    if (isOpen) {
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

      // 🔽 Autofocus na pierwsze pole po rozwinięciu
      setTimeout(() => {
        document.getElementById(`score1-${index}`)?.focus();
      }, 100);
    }
  };

  // 7) Autofocus: jeśli użytkownik wpisze dwu-cyfrową liczbę w pierwszym polu,
  //    przeskakujemy automatycznie do drugiego:
  window.autoFocusNext = function(currentInput, nextId) {
    if (currentInput.value.length > 1) {
      document.getElementById(nextId)?.focus();
    }
  };

  // 8) Highlight zwycięzcy w wierszu (kolory + animacja + podsumowanie)
  window.highlightWinner = function(index) {
    const input1 = document.getElementById(`score1-${index}`);
    const input2 = document.getElementById(`score2-${index}`);
    const label1 = input1?.parentElement?.querySelector(".player-label");
    const label2 = input2?.parentElement?.querySelector(".player-label");
    if (!input1 || !input2 || !label1 || !label2) return;

    const val1 = parseInt(input1.value);
    const val2 = parseInt(input2.value);

    // a) Reset stylów
    input1.style.backgroundColor = "";
    input2.style.backgroundColor = "";
    label1.innerHTML = matches[index].player1;
    label2.innerHTML = matches[index].player2;
    label1.classList.remove("winner-glow");
    label2.classList.remove("winner-glow");
    removeWinnerSummary(index);

    // b) Jeśli wartości niepoprawne – nic więcej
    if (isNaN(val1) || isNaN(val2) || val1 === val2) return;

    // c) Kolorowanie i animacja zwycięzcy
    const winnerLabel = val1 > val2 ? label1 : label2;
    const loserLabel  = val1 > val2 ? label2 : label1;
    const winnerInput = val1 > val2 ? input1 : input2;
    const loserInput  = val1 > val2 ? input2 : input1;

    winnerLabel.innerHTML = `🏆 ${val1 > val2 ? matches[index].player1 : matches[index].player2}`;
    winnerLabel.classList.add("winner-glow");
    loserLabel.classList.remove("winner-glow");

    winnerInput.style.backgroundColor = "#d4edda";
    loserInput.style.backgroundColor  = "#f8d7da";

    showWinnerSummary(
      index,
      matches[index].player1,
      matches[index].player2,
      val1,
      val2
    );
  };

  window.showWinnerSummary = function(index, p1, p2, val1, val2) {
    const summaryId = `winnerSummary-${index}`;
    let summaryEl = document.getElementById(summaryId);
    const container = document.getElementById(`confirmButton-${index}`)?.parentElement;
    const winner   = val1 > val2 ? p1 : p2;
    const result   = `${val1}:${val2}`;

    if (!summaryEl) {
      summaryEl = document.createElement("div");
      summaryEl.id = summaryId;
      summaryEl.className = "text-center mt-2 fade-in winner-summary";
      container.appendChild(summaryEl);
    }
    summaryEl.innerHTML = `🏆 <strong>Zwycięzca:</strong> ${winner} (${result})`;
  };

  window.removeWinnerSummary = function(index) {
    const el = document.getElementById(`winnerSummary-${index}`);
    if (el) el.remove();
  };

  // 9) Dodawanie wyniku do tabeli wyników (Results Table)
  window.addResultToResultsTable = function(match) {
    const resultsTable = document.getElementById("resultsTable")
                              .getElementsByTagName("tbody")[0];
    const row = resultsTable.insertRow();
    row.innerHTML = `
      <td>${resultsTable.rows.length + 1}</td>
      <td>Mecz ${match.series || 1}-${match.round || 1}</td>
      <td>${match.player1}</td>
      <td>${match.player2}</td>
      <td>${match.result}</td>
    `;
    fadeInElement(resultsTable.parentElement);
  };

  // 10) Przypięcie funkcji renderujących do globala (dostęp z tournament.js):
  window.renderPlayersList     = renderPlayersList;
  window.renderMatches         = renderMatches;
  window.renderStats           = renderStats;
  window.renderGeneralStats    = renderGeneralStats;
  window.renderArchiveView     = renderArchiveView;
  window.renderEloRanking      = renderEloRanking;
  window.fadeInElement         = fadeInElement;

  // 11) Podpięcie obsługi zakładek (teraz korzystamy z importowanych funkcji):
  document.getElementById("showTournamentBtn")
          .addEventListener("click", showTournamentView);
  document.getElementById("showArchiveBtn")
          .addEventListener("click", showArchiveView);
  document.getElementById("showRankingBtn")
          .addEventListener("click", showRankingView);

  // 12) Podpięcie zakładki Payout (pokazujemy i ładujemy dane)
  document.getElementById("showPayoutBtn")
          .addEventListener("click", () => {
            // a) Ukryj wszystkie widoki
            ["mainContainer", "archiveView", "rankingView", "payoutView"].forEach(id => {
              document.getElementById(id).style.display = "none";
            });
            // b) Pokaż tylko payoutView
            document.getElementById("payoutView").style.display = "block";

            // c) Wypełnij select płatnika aktualnymi uczestnikami
            const participants = allPlayers.filter(p => p.selected);
            const payerSelect   = document.getElementById("payer-select");
            payerSelect.innerHTML = "";
            participants.forEach(p => {
              const opt = `<option value="${p.id}">${p.name}</option>`;
              payerSelect.insertAdjacentHTML("beforeend", opt);
            });

            // d) Załaduj i wyświetl dotychczasowe rozliczenia
            loadPayouts(allPlayers);
          });

  // 13) Na koniec: wywołaj pierwsze rendery
  renderPlayersList();
  renderGeneralStats();
  renderMatches();
  renderStats();
}

// ===== Ustawienie initUI jako eksport i – jeśli potrzebujesz – dostęp z window =====
window.initUI = initUI;
export { initUI };
