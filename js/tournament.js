console.log("✅ tournament.js załadowany");
import { Tournament } from './modules/tournament.core.js';
// Tworzymy obiekt, w którym będzie cała logika turnieju
const tournament = new Tournament();

// Import bazy danych Firestore z modułu firebase.js
import { db, doc, setDoc, deleteDoc, getDoc, auth } from "./firebase.js";






// ======= GLOBALNE ZMIENNE TURNIEJU =======
export let allPlayers = [];
let nextPlayerId = 1;
let players = [];
export let matches = [];
let results = [];
export let stats = {};
export let generalStats = {};
window.tournamentEnded = false;


export let allMatches = [];


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
async function saveDraftToFirebase() {
  const user = auth.currentUser;
  if (!user) return;

  const draftData = {
    gracze: allPlayers.filter(p => p.selected).map(p => p.name),
    matches,
    allMatches,
    stats,
    series: getCurrentSeriesNumber(),
    timestamp: new Date().toISOString(),
    turniejTrwa: matches.length > 0,
    tournamentEnded: tournamentEnded
  };
  
  
  

  try {
    // odświeżenie tokenu przed zapisem
    await user.getIdToken(true);
    await setDoc(doc(window.db, "robocze_turnieje", user.uid), draftData);
    console.log("📝 Zapisano roboczy stan turnieju do Firebase");
  } catch (err) {
    console.error("❌ Błąd zapisu roboczego turnieju:", err);
  }
}


// ======= FUNKCJA ŁADUJĄCA CZCIONKĘ (DO GENEROWANIA PDF) =======
function loadCustomFont(doc) {
  doc.addFileToVFS("DejaVuSans.ttf", "YOUR_BASE64_FONT_STRING");
  doc.addFont("DejaVuSans.ttf", "DejaVuSans", "normal");
  doc.setFont("DejaVuSans");
}

// ======= DODAWANIE NOWEGO GRACZA (wrapper) =======
export function addPlayer() {
  // 1) pobieramy nazwę z inputa
  const nameInput = document.getElementById("newPlayerName");
  const name = nameInput.value.trim();

  if (!name) {
    alert("Podaj nazwę gracza!");
    return;
  }

  // 2) delegujemy całą logikę dodania gracza do modułu core
  const player = tournament.addPlayer(name);
  if (player) {
    // 3) synchronizujemy globalne allPlayers z modułu core
    allPlayers.push(player);
    window.allPlayers = allPlayers;

    // 4) zapisujemy zaktualizowane dane do Firestore
    // funkcja saveDataToFirebase jest już w tym pliku, więc możesz ją wywołać bez importu
    saveDataToFirebase();  // zapisuje { allPlayers, generalStats } :contentReference[oaicite:0]{index=0}

    // 5) czyścimy pole i odświeżamy interfejs
    nameInput.value = "";
    window.renderPlayersList();  // rysuje listę wg allPlayers :contentReference[oaicite:1]{index=1}
  }
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
    alert("Wybierz co najmniej dwóch graczy, aby wygenerować mecze.");
    return;
  }

  const courtCount = parseInt(document.getElementById("numCourts").value, 10) || 1;

  // ⚠️ Sprawdzenie minimalnej liczby graczy względem kortów
  if (players.length < courtCount * 2) {
    alert(`Za mało graczy na ${courtCount} kort${courtCount > 1 ? 'y' : ''}!\nPotrzebujesz co najmniej ${courtCount * 2} graczy.`);
    return;
  }


  players.forEach(player => {
    stats[player.name] = stats[player.name] || { wins: 0, losses: 0, pointsScored: 0, pointsConceded: 0 };
    generalStats[player.name] = generalStats[player.name] || { wins: 0, losses: 0, pointsScored: 0, pointsConceded: 0, obecnosc: 0 };
  });


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

// ======= GENEROWANIE MECZÓW (wrapper) =======
export function generateMatches() {
  // 1) ile kortów wybrał użytkownik?
  const courtCount = parseInt(document.getElementById("numCourts").value, 10) || 1;
  // 2) delegujemy logikę do modułu core
  const newMatches = tournament.generateMatches(courtCount);
  if (newMatches.length === 0) {
    alert("Nie można wygenerować meczy – sprawdź liczbę graczy.");
    return;
  }
  // 3) synchronizujemy globalne zmienne używane przez UI
  matches = newMatches;
  window.matches = matches;
  // 4) pokazujemy mecze i zapisujemy roboczo
  window.renderMatches();
  saveDraftToFirebase();  // jak dotąd zapisz stan serii
  // 5) odblokuj przycisk zakończenia turnieju, jeśli był ukryty
  const endWrapper = document.getElementById("endTournamentWrapper");
if (endWrapper) {
  endWrapper.style.display = "block";
}

}



// ======= POTWIERDZANIE MECZU (wrapper) =======
export async function confirmMatch(index) {
  // 1) pobierz punkty z inputów
  const input1 = document.getElementById(`score1-${index}`);
  const input2 = document.getElementById(`score2-${index}`);
  const score1 = parseInt(input1.value, 10);
  const score2 = parseInt(input2.value, 10);

  // 2) walidacja
  if (isNaN(score1) || isNaN(score2) || score1 < 0 || score2 < 0) {
    alert("Wprowadź nieujemne liczby dla obu graczy.");
    return;
  }
  if (!validateResult(score1, score2)) {
    alert("Wynik meczu jest niepoprawny."); 
    return;
  }

  // 3) delegujemy logikę do modułu core
  try {
    tournament.confirmMatch(index, score1, score2);
  } catch (err) {
    alert(err.message);
    return;
  }

  // 4) synchronizacja globalnych zmiennych z modułu core
  matches = tournament.matches;
  allMatches = tournament.allMatches;
  generalStats = tournament.generalStats;

  // 5) odśwież widok i zapisz zmiany
  window.renderMatches();
  window.renderGeneralStats();
  saveDataToFirebase();
  saveDraftToFirebase();  // zapis roboczy serii :contentReference[oaicite:1]{index=1}

  // 6) jeśli wszystkie mecze potwierdzone → generuj następną serię
  if (matches.every(m => m.confirmed)) {
    matches = [];
    generateMatches();
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
  saveDraftToFirebase(); // 📝 zapis roboczy nowej serii
  console.log("✅ updateStats działa, match:", match);

}



/**
 * Zwraca, ile ELO zmieni się dla obu graczy (do popupu),
 * z tymi samymi parametrami K, D i mf jak wyżej.
 */
export function getEloDelta(p1, p2, s1, s2, K = 24, D = 0.75) {
  const R1 = p1.elo, R2 = p2.elo;
  const E1 = 1 / (1 + 10 ** ((R2 - R1) / 400));
  const E2 = 1 - E1;
  const a1 = s1 > s2 ? 1 : 0;
  const a2 = 1 - a1;
  const margin = Math.abs(s1 - s2);
  const mf = margin <= 2
    ? 1
    : 1 + Math.min((margin - 2) * 0.1, 0.5);

  const raw1 = K * (a1 - E1) * (a1 === 1 ? mf : 1);
  const raw2 = K * (a2 - E2) * (a2 === 1 ? mf : 1);

  const d1 = Math.round(raw1 * D);
  const d2 = Math.round(raw2 * D);

  return [d1, d2, mf];
}




// ======= ZAKOŃCZENIE TURNIEJU =======
export async function endTournament() {
  const allConfirmedMatches = allMatches.filter(m => m.confirmed);

  if (allConfirmedMatches.length === 0) {
    alert("Nie można zakończyć turnieju – żaden mecz nie został rozegrany.");
    return;
  }

  if (tournamentEnded) return;
  tournamentEnded = true;
  window.tournamentEnded = true;

  // ✅ Dodaj obecność
  allPlayers.filter(p => p.selected).forEach(player => {
    const name = player.name;
    if (!generalStats[name]) {
      generalStats[name] = {
        wins: 0,
        losses: 0,
        pointsScored: 0,
        pointsConceded: 0,
        obecnosc: 0
      };
    }
    generalStats[name].obecnosc = (generalStats[name].obecnosc || 0) + 1;
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
// po zapisaniu archiwum i ustawieniu tournamentEnded = true
document.getElementById("showPayoutBtn").style.display = "";  // odblokuj zakładkę

  // ✅ ARCHIWUM
  const archive = {
    data: new Date().toISOString(),
    gracze: allPlayers.filter(p => p.selected).map(p => p.name),
    serie: []
  };

  const serieMap = new Map();

  allMatches.forEach(match => {
    const key = `seria_${match.series ?? 1}`;
    if (!serieMap.has(key)) serieMap.set(key, []);
    serieMap.get(key).push({
      ...match,
      timestamp: match.timestamp || new Date().toISOString()
    });
  });

  for (const [seriaKey, serieMatches] of serieMap.entries()) {
    archive.serie.push({
      numer: seriaKey,
      mecze: serieMatches.map(m => ({
        gracz1: m.player1,
        gracz2: m.player2,
        runda: m.round,
        wynik: typeof m.result === "string" && m.result.trim() !== "" ? m.result : "-",
        timestamp: m.timestamp || new Date().toISOString()
      }))
    });
    matches = [];
stats = {};
window.matches = [];
window.stats = {};
await saveDraftToFirebase();

  }


  // ✅ Zapisz do Firebase (archiwum + usunięcie roboczego)
  const user = auth.currentUser;
  if (user) {
    const archiveId = `turniej_${archive.data.replace(/[:.]/g, "-")}`;
    const archiveRef = doc(db, "archiwa", archiveId);

    setDoc(archiveRef, archive)
      .then(() => console.log("✅ Archiwum zapisane do Firebase"))
      .catch(err => console.error("❌ Błąd zapisu archiwum do Firebase", err));

    deleteDoc(doc(window.db, "robocze_turnieje", user.uid))
      .then(() => console.log("🧹 Usunięto wersję roboczą turnieju"))
      .catch(err => console.error("❌ Błąd usuwania wersji roboczej:", err));
  }

  

  // ✅ Zapisz reset graczy
  const playersRef = doc(window.db, "turniej", "stats");
await setDoc(playersRef, {
  allPlayers,
  generalStats
}, { merge: true });


  if (window.renderArchiveView) window.renderArchiveView();
  // Przygotuj aplikację do nowego turnieju
tournamentEnded = false;
window.tournamentEnded = false;

// 🔄 Pokaż setup panel
["setupPanel", "playersList", "generateMatchesBtn"].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.style.display = "block";
});
const nc = document.getElementById("numCourts")?.parentElement;
if (nc) nc.style.display = "block";

}




// ======= WCZYTANIE DANYCH Z FIREBASE =======
export async function loadDataFromFirebase() {
  const docRef = doc(db, "turniej", "stats");
  try {
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      allPlayers = (data.allPlayers || []).map(p => ({
        ...p,
        elo: p.elo ?? 1000
      }));
      generalStats = data.generalStats || {};
      tournamentEnded = data.tournamentEnded || false;
      window.tournamentEnded = tournamentEnded;
      
            // ===== synchronizacja modułu core =====
    // 1) przekazujemy do core listę wczytanych graczy
    tournament.players = allPlayers.slice();
    // 2) obliczamy, jakie ID powinno mieć następne
    if (allPlayers.length > 0) {
      tournament.nextPlayerId = Math.max(...allPlayers.map(p => p.id)) + 1;
    } else {
      tournament.nextPlayerId = 1;
    }
    console.log("🔢 tournament.nextPlayerId ustawione na", tournament.nextPlayerId);
    // ===== koniec synchronizacji =====



      // ✅ ZAPISZ DO window.* – żeby initUI() miał do nich dostęp
      // Najważniejsze linie
      window.allPlayers = allPlayers;
      window.generalStats = generalStats;
      window.matches = matches;
      window.stats = stats;


      window.renderPlayersList?.();
      window.renderGeneralStats?.();
    } else {
      console.log("Brak dokumentu 'stats' w kolekcji 'turniej'");
    }
  } catch (error) {
    console.error("Błąd odczytu danych z Firebase: ", error);
  }
  console.log("✅ Dane z Firebase:", { allPlayers, generalStats });
  console.log("🎯 tournamentEnded z bazy:", tournamentEnded);

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

 export async function resetTournamentData() {
  if (!confirm("Na pewno usunąć wszystkie dane trwającego turnieju?")) return;

 
  
  matches = [];
  stats = {};
  tournamentEnded = false;

  document.getElementById("matchesTable").innerHTML = "";
  document.getElementById("resultsTable").getElementsByTagName("tbody")[0].innerHTML = "";
  document.getElementById("statsTable").getElementsByTagName("tbody")[0].innerHTML = "";

  alert("Dane turnieju zostały zresetowane.");
  window.location.href = window.location.href.split("?")[0];
  prepareForNewTournament();
  const playersRef = doc(window.db, "turniej", "stats");



}
export async function prepareForNewTournament() {
  console.log("🔁 Przygotowanie nowego turnieju");

  tournamentEnded = false;
  window.tournamentEnded = false;

  matches = [];
  allMatches = [];
  stats = {};

  window.matches = [];
  window.allMatches = [];
  window.stats = {};
// Teraz czyścimy zaznaczenie graczy,
  // bo faktycznie zaczynamy od nowa
  allPlayers.forEach(player => player.selected = false);
  window.renderPlayersList();
  // Oczyść interfejs
  document.getElementById("matchesTable").innerHTML = "";
  document.getElementById("resultsTable").getElementsByTagName("tbody")[0].innerHTML = "";
  document.getElementById("statsTable").getElementsByTagName("tbody")[0].innerHTML = "";

  // Pokaż ponownie panel wyboru graczy
  ["setupPanel", "playersList", "generateMatchesBtn"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "block";
  });

  const nc = document.getElementById("numCourts")?.parentElement;
  if (nc) nc.style.display = "block";

  const endWrapper = document.getElementById("endTournamentWrapper");
  if (endWrapper) endWrapper.style.display = "none";

  window.renderPlayersList?.();
  window.renderGeneralStats?.();
  const user = auth.currentUser;
if (user) {
  const playersRef = doc(window.db, "turniej", "stats");
  
}

}

// ======= AUTO-ZAPIS CO 10 SEKUND (jeśli turniej trwa) =======
setInterval(() => {
  const user = auth.currentUser;
  if (!user || window.tournamentEnded) return;


  const activeMatches = matches.filter(m => !m.confirmed);
  if (activeMatches.length === 0) return; // nic do zapisu

  saveDraftToFirebase();
  console.log("🕒 Auto-zapis wykonany");
}, 10000); // co 10 sekund
