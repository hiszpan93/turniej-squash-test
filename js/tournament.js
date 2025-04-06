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
  players = [];
  checkboxes.forEach(chk => {
    if (chk.checked) {
      const playerId = parseInt(chk.value);
      const player = allPlayers.find(p => p.id === playerId);
      if (player) {
        players.push(player);
        stats[player.name] = stats[player.name] || { wins: 0, losses: 0, pointsScored: 0, pointsConceded: 0 };
        generalStats[player.name] = generalStats[player.name] || { wins: 0, losses: 0, pointsScored: 0, pointsConceded: 0, obecnosc: 0 };
      }
    }
  });
  if (players.length < 2) {
    alert("Wybierz co najmniej dwóch graczy!");
    return;
  }
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
  if (tournamentEnded) {
    alert("Turniej został zakończony. Nie można generować nowych meczy.");
    return;
  }
  if (players.length < 2) {
    alert("Wybierz co najmniej dwóch graczy!");
    return;
  }
  allRounds = generateRoundRobinRounds(players);
  currentRoundIndex = 0;
  const roundMatches = allRounds[currentRoundIndex];
  matches = [];
  const numCourts = parseInt(document.getElementById("numCourts").value);
  for (let i = 0; i < roundMatches.length; i += numCourts) {
    const timeslot = roundMatches.slice(i, i + numCourts);
    timeslot.forEach((match, idx) => {
      match.court = idx + 1;
      match.round = currentRoundIndex + 1;
      matches.push(match);
    });
  }
  window.renderMatches();
  saveDataToFirebase();
}

// ======= POTWIERDZANIE MECZU =======
export function confirmMatch(index) {
  if (tournamentEnded) {
    alert("Turniej został zakończony. Nie można wpisywać wyników.");
    return;
  }
  const input = document.getElementById(`result-${index}`);
if (!input || !/^\d+:\d+$/.test(input.value.trim())) {
  alert("Wprowadź wynik w formacie X:Y (np. 11:9)");
  return;
}
const [score1, score2] = input.value.trim().split(":").map(Number);

  if (!validateResult(score1, score2)) {
    alert("Wynik meczu jest niepoprawny. Upewnij się, że wynik spełnia zasady:\n• Jeśli przeciwnik ma mniej niż 10 punktów, zwycięzca musi mieć dokładnie 11 punktów.\n• Jeśli obaj gracze mają 10 lub więcej punktów, mecz trwa aż do momentu, gdy różnica wyniesie dokładnie 2 punkty.");
    return;
  }
  const result = score1 + ":" + score2;
  matches[index].result = result;
  matches[index].confirmed = true;
  const btn = document.getElementById(`confirmButton-${index}`);
  btn.classList.remove("btn-outline-success");
  btn.classList.add("btn-success");
  const matchesTable = document.getElementById("matchesTable");
  const rows = matchesTable.getElementsByTagName("tr");
  rows[index + 1].classList.add("confirmed");
  window.addResultToResultsTable(matches[index]);
  updateStats(matches[index]);
  saveDataToFirebase();
  if (matches.every(match => match.confirmed)) {
    updateNextRound();
  }
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
  players.forEach(player => {
    if (!generalStats[player.name]) {
      generalStats[player.name] = { wins: 0, losses: 0, pointsScored: 0, pointsConceded: 0, obecnosc: 0 };
    }
    generalStats[player.name].obecnosc = (generalStats[player.name].obecnosc || 0) + 1;
  });
  saveDataToFirebase();
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
}

// ======= PRZEJŚCIE DO KOLEJNEJ RUNDY =======
function updateNextRound() {
  if (players.length === 2) {
    allRounds = generateRoundRobinRounds(players);
    currentRoundIndex = 0;
    const roundMatches = allRounds[currentRoundIndex];
    matches = [];
    const numCourts = parseInt(document.getElementById("numCourts").value);
    for (let i = 0; i < roundMatches.length; i += numCourts) {
      const timeslot = roundMatches.slice(i, i + numCourts);
      timeslot.forEach((match, idx) => {
        match.court = idx + 1;
        match.round = currentRoundIndex + 1;
        matches.push(match);
      });
    }
    window.renderMatches();
    saveDataToFirebase();
    console.log("Restart rundy dla dwóch graczy, runda:", currentRoundIndex + 1);
    alert("Restart rundy: " + (currentRoundIndex + 1));
  } else {
    if (currentRoundIndex < allRounds.length - 1) {
      currentRoundIndex++;
    } else {
      currentRoundIndex = 0;
      allRounds = generateRoundRobinRounds(players);
    }
    const roundMatches = allRounds[currentRoundIndex];
    matches = [];
    const numCourts = parseInt(document.getElementById("numCourts").value);
    for (let i = 0; i < roundMatches.length; i += numCourts) {
      const timeslot = roundMatches.slice(i, i + numCourts);
      timeslot.forEach((match, idx) => {
        match.court = idx + 1;
        match.round = currentRoundIndex + 1;
        matches.push(match);
      });
    }
    window.renderMatches();
    saveDataToFirebase();
    console.log("Przejście do kolejnej rundy, runda:", currentRoundIndex + 1);
    alert("Przejście do kolejnej rundy: " + (currentRoundIndex + 1));
  }
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
       // window.renderMatches();
       // window.renderStats();
      
        window.renderGeneralStats();
      } else {
        console.log("Brak dokumentu 'stats' w kolekcji 'turniej'");
      }
    })
    .catch(error => {
      console.error("Błąd odczytu danych z Firebase: ", error);
    });
}
export function resetEntireDatabase() {
  if (!confirm("Na pewno chcesz USUNĄĆ wszystkie dane z bazy? Tej operacji nie można cofnąć.")) return;

  deleteDoc(doc(db, "turniej", "stats"))
    .then(() => {
      alert("Wszystkie dane zostały usunięte z bazy Firebase.");
      location.reload();
    })
    .catch((error) => {
      console.error("Błąd przy usuwaniu danych:", error);
      alert("Wystąpił błąd podczas usuwania danych.");
    });
}
