// Import bazy danych Firestore z modułu firebase.js
import { doc, getDoc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
const db = window.db;

// ======= GLOBALNE ZMIENNE TURNIEJU =======
export let allPlayers = [];
let nextPlayerId = 1;
let players = [];
export let matches = [];
let results = [];
export let stats = {};
export let generalStats = {};
export let tournamentEnded = false;

// Zmienne do rund (round-robin)
let allRounds = [];
let currentRoundIndex = 0;

function saveLocalBackup() {
  const backupMatches = matches.map(m => ({
    ...m,
    result: m.confirmed ? m.result : "",     // wyczyść wynik jeśli niepotwierdzony
    confirmed: !!m.confirmed                 // jawnie ustaw false
  }));
  localStorage.setItem("turniej_matches", JSON.stringify(backupMatches));
  localStorage.setItem("turniej_stats", JSON.stringify(stats));
  localStorage.setItem("turniej_series", getCurrentSeriesNumber());

}



function loadLocalBackup() {
  const savedSeries = parseInt(localStorage.getItem("turniej_series"), 10) || 0;

  const savedMatches = localStorage.getItem("turniej_matches");
  const savedStats = localStorage.getItem("turniej_stats");

  if (savedMatches && savedStats) {
    matches = JSON.parse(savedMatches);
    stats = JSON.parse(savedStats);

    window.renderMatches();
    window.renderStats();

    matches.forEach(match => {
      if (match.confirmed) {
        window.addResultToResultsTable(match);
      }
    });

    console.log("✅ Przywrócono dane turnieju z localStorage");

    const allConfirmed = matches.length > 0 && matches.every(m => m.confirmed);
    if (allConfirmed && !tournamentEnded) {
      console.log("▶️ Wszystkie mecze potwierdzone – generuję nową rundę...");

      // 💥 USUWAMY stare mecze (potwierdzone) przed kolejną rundą
      matches = [];
      generateMatches();
    }
  }
}



function clearLocalBackup() {
  localStorage.removeItem("turniej_matches");
  localStorage.removeItem("turniej_stats");
  localStorage.removeItem("turniej_series");

}

// ======= FUNKCJA ZAPISUJĄCA DANE DO FIREBASE =======
function saveDataToFirebase() {
  setDoc(doc(db, "turniej", "stats"), {
    
    generalStats: generalStats,
    allPlayers: allPlayers
  })
  .then(() => console.log("Dane zapisane do Firebase"))
  .catch(error => console.error("Błąd zapisu do Firebase: ", error));
}

// ======= FUNKCJA ŁADUJĄCA CZCIONKĘ (DO GENEROWANIA PDF) =======
function loadCustomFont(doc) {
  doc.addFileToVFS("DejaVuSans.ttf", "YOUR_BASE64_FONT_STRING");
  doc.addFont("DejaVuSans.ttf", "DejaVuSans", "normal");
  doc.setFont("DejaVuSans");
}

// ======= DODAWANIE NOWEGO GRACZA =======
export function addPlayer() {
  if (tournamentEnded) return;
  const nameInput = document.getElementById("newPlayerName");
  const name = nameInput.value.trim();
  if (!name) {
    alert("Podaj nazwę gracza!");
    return;
  }
  if (allPlayers.some(p => p.name.toLowerCase() === name.toLowerCase())) {
    alert("Gracz o takiej nazwie już istnieje!");
    return;
  }
  const newPlayer = { id: nextPlayerId++, name: name };
  allPlayers.push(newPlayer);
  nameInput.value = "";
  window.renderPlayersList();
}

// ======= POTWIERDZENIE WYBORU GRACZY =======
export function confirmPlayers() {
  if (tournamentEnded) return;

  const checkboxes = document.querySelectorAll(".playerCheckbox");
  allPlayers.forEach(p => p.selected = false);

  const selected = [];

  checkboxes.forEach(chk => {
    if (chk.checked) {
      const playerId = parseInt(chk.value);
      const player = allPlayers.find(p => p.id === playerId);
      if (player) {
        player.selected = true;
        selected.push(player.name);
      }
    }
  });

  const players = allPlayers.filter(p => p.selected);
  if (players.length < 2) {
    alert("Wybierz co najmniej dwóch graczy!");
    return;
  }

  players.forEach(player => {
    stats[player.name] = stats[player.name] || { wins: 0, losses: 0, pointsScored: 0, pointsConceded: 0 };
    generalStats[player.name] = generalStats[player.name] || { wins: 0, losses: 0, pointsScored: 0, pointsConceded: 0, obecnosc: 0 };
  });

  localStorage.setItem("turniej_players", JSON.stringify(selected));

  alert("Gracze zostali wybrani. Możesz teraz wygenerować mecze.");
  saveDataToFirebase();
}




// ======= GENEROWANIE RUND METODĄ ROUND-ROBIN =======
function generateRoundRobinRounds(playersList) {
  let playerList = playersList.slice();
  const isOdd = (playerList.length % 2 !== 0);
  if (isOdd) {
    playerList.push({ id: null, name: "BYE" });
  }
  const n = playerList.length;
  const rounds = [];
  for (let round = 0; round < n - 1; round++) {
    const roundMatches = [];
    for (let i = 0; i < n / 2; i++) {
      const player1 = playerList[i];
      const player2 = playerList[n - 1 - i];
      if (player1.id === null || player2.id === null) continue;
      roundMatches.push({
        player1: player1.name,
        player2: player2.name,
        confirmed: false,
        result: null
      });
    }
    rounds.push(roundMatches);
    const last = playerList.pop();
    playerList.splice(1, 0, last);
  }
  return rounds;
}

// ======= GENEROWANIE MECZÓW (AKTUALNA RUNDA) =======
export function generateMatches() {
  const players = allPlayers.filter(p => p.selected);
  if (players.length < 2) {
    alert("Wybierz co najmniej dwóch graczy, aby wygenerować mecze.");
    return;
  }

  const courtCount = parseInt(document.getElementById("numCourts").value, 10) || 1;
  const lastSeries = parseInt(localStorage.getItem("turniej_series"), 10) || 0;
  const seriesNumber = lastSeries + 1;

  const pairings = [];
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      pairings.push([players[i], players[j]]);
    }
  }

  const newMatches = [];
  let round = 1;
  let recentPlayers = [];

  while (pairings.length > 0) {
    const roundMatches = [];
    const roundPlayers = new Set();

    for (let k = 0; k < pairings.length; k++) {
      const [p1, p2] = pairings[k];
      if (
        !roundPlayers.has(p1.name) &&
        !roundPlayers.has(p2.name) &&
        !recentPlayers.includes(p1.name) &&
        !recentPlayers.includes(p2.name)
      ) {
        roundMatches.push({ p1, p2 });
        roundPlayers.add(p1.name);
        roundPlayers.add(p2.name);
        pairings.splice(k, 1);
        k--; // fix index after removal
        if (roundMatches.length >= courtCount) break;
      }
    }

    // jeśli nic nie udało się dobrać wg reguł fair – weź cokolwiek
    if (roundMatches.length === 0) {
      for (let k = 0; k < courtCount && k < pairings.length; k++) {
        const [p1, p2] = pairings.shift();
        roundMatches.push({ p1, p2 });
      }
    }

    roundMatches.forEach((match, index) => {
      newMatches.push({
        player1: match.p1.name,
        player2: match.p2.name,
        court: index + 1,
        result: "",
        confirmed: false,
        series: seriesNumber,
        round: round
      });
    });

    recentPlayers = Array.from(roundPlayers);
    round++;
  }

  matches = newMatches;
  window.renderMatches();
  localStorage.setItem("turniej_in_progress", "true");

  hideSetupControls();
  const endBtn = document.getElementById("endTournamentBtn");
  if (endBtn && !tournamentEnded) endBtn.style.display = "block";
  
}


// ======= POTWIERDZANIE MECZU =======
export function confirmMatch(index) {
  if (tournamentEnded) {
    alert("Turniej został zakończony. Nie można wpisywać wyników.");
    return;
  }

  const match = matches[index];
  const input1 = document.getElementById(`score1-${index}`);
  const input2 = document.getElementById(`score2-${index}`);

  const score1 = parseInt(input1.value);
  const score2 = parseInt(input2.value);

  if (isNaN(score1) || isNaN(score2) || score1 < 0 || score2 < 0) {
    alert("Wprowadź nieujemne liczby dla obu graczy.");
    return;
  }

  if (!validateResult(score1, score2)) {
    alert("Wynik meczu jest niepoprawny. Zasady:\n• Zwycięzca: 11 pkt, jeśli przeciwnik ma <10\n• Lub różnica 2 pkt przy 10+");
    return;
  }

  const result = `${score1}:${score2}`;
  const winner = score1 > score2 ? match.player1 : match.player2;

  // ✅ Wstaw dane do modala
  const modalContent = document.getElementById("matchConfirmContent");
  modalContent.innerHTML = `
    <p><strong>${match.player1}:</strong> ${score1} pkt</p>
    <p><strong>${match.player2}:</strong> ${score2} pkt</p>
    <hr/>
    <p>✅ <strong>Zwycięzca:</strong> ${winner}</p>
  `;

  // ✅ Pokaż modal
  const modal = new bootstrap.Modal(document.getElementById("matchConfirmModal"));
  modal.show();

  // ✅ Obsługa kliknięcia „Potwierdź” w modalu
  document.getElementById("confirmMatchBtnFinal").onclick = () => {
    modal.hide();

    match.result = result;
    match.confirmed = true;

    const btn = document.getElementById(`confirmButton-${index}`);
    btn.classList.remove("btn-outline-success");
    btn.classList.add("btn-success");

    const matchesTable = document.getElementById("matchesTable");
    const rows = matchesTable.getElementsByTagName("tr");
    rows[index + 1].classList.add("confirmed");

    window.addResultToResultsTable(match);
    updateStats(match);
    saveDataToFirebase();
    saveLocalBackup();

    if (matches.every(match => match.confirmed)) {
      localStorage.setItem("turniej_series", match.series);
      matches = [];
      generateMatches();
    }

    window.renderMatches();
    window.renderStats();

    input1.style.backgroundColor = "";
    input2.style.backgroundColor = "";
  };
}



// ======= WALIDACJA WYNIKU MECZU =======
// Zasady:
// • Jeśli przeciwnik zdobywa mniej niż 10 punktów, zwycięzca musi mieć dokładnie 11 punktów.
// • Jeśli obaj gracze mają 10 lub więcej punktów, mecz trwa, aż różnica wyniesie dokładnie 2 punkty.
function validateResult(score1, score2) {
  if (isNaN(score1) || isNaN(score2)) return false;
  const winner = Math.max(score1, score2);
  const loser = Math.min(score1, score2);
  if (winner < 11) return false;
  if (loser < 10) {
    return winner === 11;
  } else {
    return winner === loser + 2;
  }
}

// ======= AKTUALIZACJA STATYSTYK =======
function updateStats(match) {
  const [score1, score2] = match.result.split(":").map(Number);
  const date = new Date();
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  if (score1 > score2) {
    stats[match.player1].wins++;
    stats[match.player2].losses++;
  } else {
    stats[match.player2].wins++;
    stats[match.player1].losses++;
  }
  stats[match.player1].pointsScored += score1;
  stats[match.player2].pointsScored += score2;
  stats[match.player1].pointsConceded += score2;
  stats[match.player2].pointsConceded += score1;
  if (!generalStats[match.player1]) {
    generalStats[match.player1] = { wins: 0, losses: 0, pointsScored: 0, pointsConceded: 0, obecnosc: 0 };
  }
  if (!generalStats[match.player2]) {
    generalStats[match.player2] = { wins: 0, losses: 0, pointsScored: 0, pointsConceded: 0, obecnosc: 0 };
  }
  if (score1 > score2) {
    generalStats[match.player1].wins++;
    generalStats[match.player2].losses++;
  } else {
    generalStats[match.player2].wins++;
    generalStats[match.player1].losses++;
  }
  generalStats[match.player1].pointsScored += score1;
  generalStats[match.player2].pointsScored += score2;
  generalStats[match.player1].pointsConceded += score2;
  generalStats[match.player2].pointsConceded += score1;
  
  window.renderStats();
  
  window.renderGeneralStats();
}







// ======= ZAKOŃCZENIE TURNIEJU =======
export function endTournament() {
  if (tournamentEnded) return;
  tournamentEnded = true;
  const savedPlayers = JSON.parse(localStorage.getItem("turniej_players")) || [];

savedPlayers.forEach(name => {
  if (!generalStats[name]) {
    generalStats[name] = { wins: 0, losses: 0, pointsScored: 0, pointsConceded: 0, obecnosc: 0 };
  }
  generalStats[name].obecnosc += 1;
});

localStorage.removeItem("turniej_players"); // 🧹 sprzątamy
localStorage.removeItem("turniej_in_progress");


  players.forEach(player => {
    if (!generalStats[player.name]) {
      generalStats[player.name] = { wins: 0, losses: 0, pointsScored: 0, pointsConceded: 0, obecnosc: 0 };
    }
    generalStats[player.name].obecnosc = (generalStats[player.name].obecnosc || 0) + 1;
  });
  saveDataToFirebase();
  clearLocalBackup(); // 🧹 usuń backup

  window.renderGeneralStats();
  document.getElementById("addPlayerBtn").disabled = true;
  document.getElementById("confirmPlayersBtn").disabled = true;
  document.getElementById("generateMatchesBtn").disabled = true;
  document.getElementById("numCourts").disabled = true;
  const endTournamentBtn = document.getElementById("endTournamentBtn");
  endTournamentBtn.disabled = true;
  endTournamentBtn.classList.remove("btn-danger");
  endTournamentBtn.classList.add("btn-secondary");
  alert("Turniej został zakończony. Nie można już generować meczy ani wpisywać wyników.");
  
    // 🔽 1. Zbuduj strukturę archiwum turnieju
    const archive = {
      data: new Date().toISOString(),
      gracze: players.map(p => p.name),
      serie: [],
    };
  
    const serieMap = new Map();
    matches.forEach(match => {
      const key = `seria_${match.series}`;
      if (!serieMap.has(key)) serieMap.set(key, []);
      serieMap.get(key).push(match);
    });
  
    for (const [seriaKey, serieMatches] of serieMap.entries()) {
      archive.serie = archive.serie || [];
      archive.serie.push({
        numer: seriaKey,
        mecze: serieMatches.map(m => ({
          gracz1: m.player1,
          gracz2: m.player2,
          kort: m.court,
          runda: m.round,
          wynik: m.result,
          timestamp: m.timestamp || new Date().toISOString()  // ⏱️ dodane zabezpieczenie
        }))
      });
    }
  
    // 🔽 2. Dodaj do localStorage do archiwum
    const fullArchive = JSON.parse(localStorage.getItem("turniej_archiwum")) || [];
    fullArchive.push(archive);
    localStorage.setItem("turniej_archiwum", JSON.stringify(fullArchive));
  
    // 🔽 3. (tylko do wersji .apk - na razie zakomentowane)
    /*
    const fileName = `turniej_${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    const fileContent = JSON.stringify(archive, null, 2);
    const filePath = `/storage/emulated/0/Android/data/turniej_squasha/files/${fileName}`;
    // Użyj biblioteki do zapisu pliku w Cordova/Capacitor np. Filesystem.writeFile()
    */
  
    // 🔽 4. Renderuj widok archiwum (z `index.html`)
    if (window.renderArchiveView) window.renderArchiveView();
  
}



// ======= WCZYTANIE DANYCH Z FIREBASE =======
export function loadDataFromFirebase() {
  const docRef = doc(db, "turniej", "stats");
  getDoc(docRef)
    .then(docSnap => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        allPlayers = data.allPlayers || [];
        generalStats = data.generalStats || {};
        if (allPlayers.length > 0) {
          nextPlayerId = Math.max(...allPlayers.map(p => p.id)) + 1;
        }
        window.renderPlayersList();
        window.renderGeneralStats();

        if (!tournamentEnded) {
          loadLocalBackup(); // 🔁 przywróć dane jeśli turniej trwa
        }

        // ✅ Ukryj setupPanel jeśli turniej trwa
        if (localStorage.getItem("turniej_in_progress") === "true") {
          const panel = document.getElementById("setupPanel");
          if (panel) panel.style.display = "none";
        }

      } else {
        console.log("Brak dokumentu 'stats' w kolekcji 'turniej'");
      }
    })
    .catch(error => {
      console.error("Błąd odczytu danych z Firebase: ", error);
    });
}

function getCurrentSeriesNumber() {
  if (matches.length === 0) return 0;
  const allConfirmed = matches.every(m => m.confirmed);
  return allConfirmed ? matches[matches.length - 1].series || 0 : matches[0].series || 1;
}



function hideSetupControls() {
  ["setupPanel", "playersList", "generateMatchesBtn"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });

  const nc = document.getElementById("numCourts")?.parentElement;
  if (nc) nc.style.display = "none";
}

function resetTournamentData() {
  if (!confirm("Na pewno usunąć wszystkie dane trwającego turnieju?")) return;

  localStorage.removeItem("turniej_matches");
  localStorage.removeItem("turniej_stats");
  localStorage.removeItem("turniej_series");
  localStorage.removeItem("turniej_players");
  localStorage.removeItem("turniej_in_progress");

  matches = [];
  stats = {};
  tournamentEnded = false;

  document.getElementById("matchesTable").innerHTML = "";
  document.getElementById("resultsTable").getElementsByTagName("tbody")[0].innerHTML = "";
  document.getElementById("statsTable").getElementsByTagName("tbody")[0].innerHTML = "";

  alert("Dane turnieju zostały zresetowane.");
  location.reload();
}

