console.log("✅ tournament.js załadowany");
import { Tournament } from './modules/tournament.core.js';
// Tworzymy obiekt, w którym będzie cała logika turnieju
const tournament = new Tournament();

// Import bazy danych Firestore z modułu firebase.js
import { db, doc, setDoc, deleteDoc, getDoc, auth } from "./firebase.js";

// ─── Funkcja do aktualizacji serii zwycięstw/porażek ───
function updateStreak(playerName, won) {
  // Pobierz istniejące statystyki lub utwórz nowe
  const gs = generalStats[playerName] ||= { wins:0, losses:0, pointsScored:0, pointsConceded:0, obecnosc:0 };
  // Jeśli jeszcze nie było serii, ustaw ją na 1W lub 1L
  if (!gs.streakType) {
    gs.streakType = won ? "W" : "L";
    gs.streakCount = 1;
  }
  // Jeśli ten sam typ serii co poprzednio, zwiększ licznik
  else if ((won && gs.streakType === "W") || (!won && gs.streakType === "L")) {
    gs.streakCount++;
  }
  // Inaczej zacznij serię od nowa
  else {
    gs.streakType = won ? "W" : "L";
    gs.streakCount = 1;
  }
}





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

// ======= GENEROWANIE MECZÓW (AKTUALNA RUNDA) =======
export function generateMatches() {
  const players = allPlayers.filter(p => p.selected);
  if (players.length < 2) {
    alert("Wybierz co najmniej dwóch graczy, aby wygenerować mecze.");
    return;
  }

  const courtCount = parseInt(document.getElementById("numCourts").value, 10) || 1;
  let seriesNumber = (allMatches.at(-1)?.series || 0) + 1;



  const pairings = [];
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      pairings.push([players[i], players[j]]);
    }
  }

  const generateMatchSet = (seriesNum) => {
    const newMatches = [];
    let round = 1;
    const pairingsCopy = [...pairings];
     // 1) Inicjalizujemy licznik pod rząd
    const consecCounts = {};
    players.forEach(p => consecCounts[p.name] = 0);

    while (pairingsCopy.length > 0) {
      const roundMatches = [];
      const roundPlayers = new Set();
      const usedPlayersThisRound = new Set();

      for (let k = 0; k < pairingsCopy.length; k++) {

        const [p1, p2] = pairingsCopy[k];
        if (consecCounts[p1.name] >= 2 || consecCounts[p2.name] >= 2) {
         continue; // skip — już dwa mecze z rzędu
                 }
        if (
          !roundPlayers.has(p1.name) &&
          !roundPlayers.has(p2.name) &&
          !usedPlayersThisRound.has(p1.name) &&
          !usedPlayersThisRound.has(p2.name)
        ) {
          roundMatches.push({ p1, p2 });
          roundPlayers.add(p1.name);
          roundPlayers.add(p2.name);
          usedPlayersThisRound.add(p1.name);
          usedPlayersThisRound.add(p2.name);
          pairingsCopy.splice(k, 1);
          k--;
          if (roundMatches.length >= courtCount) break;
        }
      }

      if (roundMatches.length === 0) {
        for (let k = 0; k < courtCount && k < pairingsCopy.length; k++) {
          const [p1, p2] = pairingsCopy.shift();
          roundMatches.push({ p1, p2 });
          roundPlayers.add(p1.name);
roundPlayers.add(p2.name);
usedPlayersThisRound.add(p1.name);
usedPlayersThisRound.add(p2.name);

        }
      }
 // 4) Aktualizujemy liczniki consecCounts:
       players.forEach(p => {
          if (roundPlayers.has(p.name)) {
           consecCounts[p.name] += 1;
          } else {
           consecCounts[p.name] = 0;
          }
       });
  
      if (roundMatches.length > 0) {
        roundMatches.forEach((match, index) => {
          newMatches.push({
            player1: match.p1.name,
            player2: match.p2.name,
            court: index + 1,
            result: "",
            confirmed: false,
            series: seriesNum,
            round: round
          });
        });
        round++;
      }
    }
    return newMatches;
  };

  let allNewMatches = generateMatchSet(seriesNumber);

  // 🟡 Jeśli tylko 2 graczy – generuj od razu 2 serie (ta sama para)
  if (players.length === 2) {
    const secondSeriesMatches = generateMatchSet(seriesNumber + 1);
    allNewMatches = allNewMatches.concat(secondSeriesMatches);
    seriesNumber += 1; // zaktualizuj numer serii
  }

  matches = allNewMatches;

  window.renderMatches();

  hideSetupControls();
  const endWrapper = document.getElementById("endTournamentWrapper");
  if (endWrapper && !tournamentEnded) {
    endWrapper.style.display = "block";
    fadeInElement(endWrapper);
  }
  saveDraftToFirebase(); // 📝 zapis roboczy nowej serii

}



// ======= POTWIERDZANIE MECZU =======
export async function confirmMatch(index) {
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

const p1 = allPlayers.find(p => p.name === match.player1);
const p2 = allPlayers.find(p => p.name === match.player2);

// 📊 Oblicz zmianę ELO przed aktualizacją
const elo1Before = p1?.elo ?? 1000;
const elo2Before = p2?.elo ?? 1000;

// 📊 Oblicz delty „na sucho”
const [delta1, delta2, marginFactor] = getEloDelta(p1, p2, score1, score2);



// ✅ Wstaw dane do modala
const modalContent = document.getElementById("matchConfirmContent");
const player1Data = allPlayers.find(p => p.name === match.player1);
const player2Data = allPlayers.find(p => p.name === match.player2);


const getStreakLabel = (player) => {
  const gs = generalStats[player.name];
  if (!gs || !gs.streakCount) return "";

  const count = gs.streakCount;
  const type = gs.streakType;
  const icon = type === "W" ? "🔥" : "❌";

  let badgeClass = "bg-secondary";
  if (type === "W") {
    if (count >= 9) badgeClass = "bg-warning text-dark";
    else if (count >= 6) badgeClass = "bg-warning";
    else if (count >= 3) badgeClass = "bg-success";
  } else if (type === "L") {
    if (count >= 9) badgeClass = "bg-danger text-white fw-bold";
    else if (count >= 6) badgeClass = "bg-danger";
    else if (count >= 3) badgeClass = "bg-secondary";
  }

  return ` <span class="badge ${badgeClass} ms-2">${icon} ${count}${type}</span>`;
};



const streak1 = getStreakLabel(player1Data);
const streak2 = getStreakLabel(player2Data);


modalContent.innerHTML = `
  <p><strong>${match.player1}:</strong> ${score1} pkt${streak1}<br/>

     ELO: ${elo1Before} → ${elo1Before + delta1} <span class="text-muted">(zmiana: ${delta1 >= 0 ? '+' : ''}${delta1})</span>
  </p>
  <p><strong>${match.player2}:</strong> ${score2} pkt${streak2}<br/>

     ELO: ${elo2Before} → ${elo2Before + delta2} <span class="text-muted">(zmiana: ${delta2 >= 0 ? '+' : ''}${delta2})</span>
  </p>
  <hr/>
  <p>✅ <strong>Zwycięzca:</strong> ${winner}</p>
    <p class="text-muted" style="font-size: 13px;">
  ⚡️ Bonus za przewagę punktową: ×${marginFactor.toFixed(2)}
</p>


`;




  // ✅ Pokaż modal
  const modal = new bootstrap.Modal(document.getElementById("matchConfirmModal"));
  modal.show();

  // ✅ Obsługa kliknięcia „Potwierdź” w modalu
  document.getElementById("confirmMatchBtnFinal").onclick = async () => {

    modal.hide();

    match.result = result;
    match.confirmed = true;
// ─── Najpierw zaktualizuj serię ───
updateStreak(match.player1, score1 > score2);
updateStreak(match.player2, score2 > score1);

    // 🧮 Aktualizacja ELO
const p1 = allPlayers.find(p => p.name === match.player1);
const p2 = allPlayers.find(p => p.name === match.player2);
if (p1 && p2) updateElo(p1, p2, score1, score2);

    // Dodaj potwierdzony mecz do pełnej historii
allMatches.push({ ...match, timestamp: new Date().toISOString() });
await saveDraftToFirebase();

    const btn = document.getElementById(`confirmButton-${index}`);
    btn.classList.remove("btn-outline-success");
    btn.classList.add("btn-success");

    const matchesTable = document.getElementById("matchesTable");
    const rows = matchesTable.getElementsByTagName("tr");
    rows[index + 1].classList.add("confirmed");

    window.addResultToResultsTable(match);
    updateStats(match);
    saveDataToFirebase();
    
    saveDraftToFirebase(); // 📝 zapis roboczy nowej serii

    

    window.renderMatches();

    if (matches.every(match => match.confirmed)) {
      
      matches = [];
      generateMatches(); // generuj kolejną serię
    }
    
    

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
  saveDraftToFirebase(); // 📝 zapis roboczy nowej serii
  console.log("✅ updateStats działa, match:", match);

}




/**
 * Aktualizuje punkty Elo obu graczy po meczu, z łagodniejszymi zmianami
 * i max. mnożnikiem przewagi 1.5.
 * @param {Object} player1 – obiekt gracza 1, .elo
 * @param {Object} player2 – obiekt gracza 2, .elo
 * @param {number} score1  – wynik gracza 1
 * @param {number} score2  – wynik gracza 2
 * @param {number} [K=24]  – bazowy współczynnik K (domyślnie 24)
 * @param {number} [D=0.75]– globalne tłumienie zmian (0.0–1.0)
 */
function updateElo(player1, player2, score1, score2, K = 24, D = 0.75) {
  // 1. Oczekiwane wyniki
  const R1 = player1.elo, R2 = player2.elo;
  const E1 = 1 / (1 + 10 ** ((R2 - R1) / 400));
  const E2 = 1 - E1;

  // 2. Rzeczywisty wynik
  const a1 = score1 > score2 ? 1 : 0;
  const a2 = 1 - a1;

  // 3. Mnożnik za przewagę, rośnie powoli i max 1.5
  const margin = Math.abs(score1 - score2);
  // przykład: (margin - 2) * 0.1 ⇒ by margin=7 dać 0.5 ⇒ mf=1.5
  const mf = margin <= 2
    ? 1
    : 1 + Math.min((margin - 2) * 0.1, 0.5);

  // 4. Liczymy zmiany ELO i tłumimy je D
  const raw1 = K * (a1 - E1) * (a1 === 1 ? mf : 1);
  const raw2 = K * (a2 - E2) * (a2 === 1 ? mf : 1);

  // 5. Zaokrąglamy i nakładamy tłumienie
  const delta1 = Math.round(raw1 * D);
  const delta2 = Math.round(raw2 * D);

  // 6. Aktualizacja
  player1.elo += delta1;
  player2.elo += delta2;

  return { delta1, delta2, marginFactor: mf };
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
      
      if (allPlayers.length > 0) {
        nextPlayerId = Math.max(...allPlayers.map(p => p.id)) + 1;
      }

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
