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

// ======= GENEROWANIE MECZÓW (wrapper) =======
export function generateMatches() {
  const courtCount = parseInt(document.getElementById("numCourts").value, 10) || 1;
  const newMatches = tournament.generateMatches(courtCount);
  if (!newMatches.length) { alert("Nie można wygenerować meczy – sprawdź liczbę graczy."); return; }

  matches = newMatches;
  window.matches = matches;

  window.renderMatches();

  // ── ukryj panel startowy i przycisk generowania ──
  document.getElementById("setupPanel").style.display = "none";
  document.getElementById("playersList").style.display = "none";
  document.getElementById("generateMatchesBtn").style.display = "none";
  // ─────────────────────────────────────────────────

  saveDraftToFirebase();
  const endWrapper = document.getElementById("endTournamentWrapper");
  if (endWrapper) endWrapper.style.display = "block";
}




// ======= POTWIERDZANIE MECZU (wrapper) =======

export function confirmMatch(index) {
  // 1) pobierz punkty
  const score1 = parseInt(document.getElementById(`score1-${index}`).value, 10);
  const score2 = parseInt(document.getElementById(`score2-${index}`).value, 10);

  // 2) podstawowa walidacja
  if (isNaN(score1) || isNaN(score2) || score1 < 0 || score2 < 0) {
    return alert("Wprowadź nieujemne liczby dla obu graczy.");
  }
  if (!tournament.validateResult(score1, score2)) {
    return alert("Wynik meczu jest niepoprawny.");
  }

  // 3) otwórz modal
  const modalEl = document.getElementById("matchConfirmModal");
  const bsModal = new bootstrap.Modal(modalEl);
  document.getElementById("matchConfirmContent").innerHTML = `
    <p>Czy na pewno zatwierdzić <strong>${score1}:${score2}</strong>?</p>
  `;
  // podpinamy “Potwierdź”
  const btn = document.getElementById("confirmMatchBtnFinal");
  btn.replaceWith(btn.cloneNode(true));
  document.getElementById("confirmMatchBtnFinal")
    .addEventListener("click", () => {
      bsModal.hide();

      // 4) wykonaj core i zsynchronizuj
      tournament.confirmMatch(index, score1, score2);

      matches      = tournament.matches;
      stats        = tournament.stats;
      generalStats = tournament.generalStats;
      window.matches      = matches;
      window.stats        = stats;
      window.generalStats = generalStats;

      // 5) odśwież UI
      addResultToResultsTable(matches[index]);
      renderStats();
      renderGeneralStats();
      renderMatches();

      // 6) zapis i autosave
      saveDataToFirebase();
      saveDraftToFirebase();

      // 7) jeżeli to ostatni – generuj kolejny
      if (matches.every(m => m.confirmed)) {
        generateMatches();
      }
    });

  bsModal.show();
}


// ======= AKTUALIZACJA STATYSTYK =======




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




// ======= ZAKOŃCZ TURNIEJ (wrapper) =======
export async function endTournament() {
  // 0) Potwierdzenie od użytkownika
  if (!confirm("Czy na pewno chcesz zakończyć ten turniej?")) return;

  // 1) Delegujemy do modułu core – pobieramy finalMatches (bez finalStats)
  const { finalMatches } = tournament.endTournament();

  // 2) Synchronizujemy stan meczów w UI
  matches = finalMatches;
  window.matches = matches;

  // 3) ▷ **Doliczamy obecność** WYŁĄCZNIE w generalStats
  allPlayers
    .filter(p => p.selected)
    .forEach(p => {
      // upewniamy się, że istnieje wpis w generalStats
      if (!generalStats[p.name]) {
        generalStats[p.name] = {
          wins: 0,
          losses: 0,
          pointsScored: 0,
          pointsConceded: 0,
          obecnosc: 0
        };
      }
      // **tutaj** następuje inkrementacja obecności
      generalStats[p.name].obecnosc = (generalStats[p.name].obecnosc || 0) + 1;
    });

  // 4) Aktualizujemy globalne window.generalStats i natychmiast renderujemy
  window.generalStats = generalStats;
  window.renderGeneralStats();   // ← dzięki temu tabela „Statystyki ogólne” od razu pokazuje nową wartość

  // 5) Zapisujemy stan turnieju (wraz z odświeżonym generalStats)
  await saveDataToFirebase();

  // 6) Budujemy i zapisujemy archiwum, usuwamy draft
  const archive = {
    data: new Date().toISOString(),
    gracze: allPlayers.filter(p => p.selected).map(p => p.name),
    serie: []
  };
  const serieMap = new Map();
  allMatches.forEach(m => {
    const key = `seria_${m.series || 1}`;
    if (!serieMap.has(key)) serieMap.set(key, []);
    serieMap.get(key).push({ ...m, timestamp: m.timestamp || new Date().toISOString() });
  });
  for (const [seriaKey, serieMatches] of serieMap.entries()) {
    archive.serie.push({
      numer: seriaKey,
      mecze: serieMatches.map(m => ({
        gracz1: m.player1,
        gracz2: m.player2,
        runda:  m.round,
        wynik:  (m.result || "").trim() || "-",
        timestamp: m.timestamp
      }))
    });
  }

  const user = auth.currentUser;
  if (user) {
    await setDoc(doc(db, "archiwa", `turniej_${archive.data.replace(/[:.]/g, "-")}`), archive);
    await deleteDoc(doc(db, "robocze_turnieje", user.uid));
    console.log("✅ Archiwum zapisane i usunięto draft");
  }

  // 7) Na koniec pokazujemy ekran końcowy z tabelą statystyk turnieju
  window.renderFinalScreen(stats);
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
