console.log("✅ tournament.js załadowany");

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
  const newPlayer = { id: nextPlayerId++, name: name, elo: 1000 };
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
  let seriesNumber = getCurrentSeriesNumber() + 1;


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
    while (pairingsCopy.length > 0) {
      const roundMatches = [];
      const roundPlayers = new Set();
      const usedPlayersThisRound = new Set();

      for (let k = 0; k < pairingsCopy.length; k++) {
        const [p1, p2] = pairingsCopy[k];
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
        }
      }

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

const p1 = allPlayers.find(p => p.name === match.player1);
const p2 = allPlayers.find(p => p.name === match.player2);

// 📊 Oblicz zmianę ELO przed aktualizacją
const elo1Before = p1?.elo ?? 1000;
const elo2Before = p2?.elo ?? 1000;

const expected1 = 1 / (1 + 10 ** ((elo2Before - elo1Before) / 400));
const expected2 = 1 - expected1;
const actual1 = score1 > score2 ? 1 : 0;
const actual2 = 1 - actual1;

const margin = Math.abs(score1 - score2);
const closeness = 1 - (margin / Math.max(score1, score2));
const eloDiff = Math.abs(elo1Before - elo2Before);

const fairnessFactor = 1 - Math.min(eloDiff / 400, 0.5);  // max -50%
const marginFactor = 1 + (margin / 5);                    // max około x3

const K = 32 * marginFactor;
const fairnessPenalty = 1 - Math.min(eloDiff / 400, 0.5); // 0.5–1

const delta1 = Math.round(K * (actual1 - expected1) * fairnessPenalty);
const delta2 = Math.round(K * (actual2 - expected2) * fairnessPenalty);



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
    ⚖️ Modyfikator ELO: ×${(fairnessPenalty * marginFactor).toFixed(2)}<br/>
    <small>(punktowy: ×${marginFactor.toFixed(2)} • fair play: ×${fairnessPenalty.toFixed(2)})</small>
    <button class="btn btn-sm btn-outline-secondary ms-2 px-2 py-0" style="font-size: 12px;" data-bs-toggle="modal" data-bs-target="#eloInfoModal">
      ❔
    </button>
  </p>

`;




  // ✅ Pokaż modal
  const modal = new bootstrap.Modal(document.getElementById("matchConfirmModal"));
  modal.show();

  // ✅ Obsługa kliknięcia „Potwierdź” w modalu
  document.getElementById("confirmMatchBtnFinal").onclick = () => {
    modal.hide();

    match.result = result;
    match.confirmed = true;
// 🧮 Aktualizacja ELO
const p1 = allPlayers.find(p => p.name === match.player1);
const p2 = allPlayers.find(p => p.name === match.player2);
if (p1 && p2) updateElo(p1, p2, score1, score2);

    // Dodaj potwierdzony mecz do pełnej historii
allMatches.push({ ...match, timestamp: new Date().toISOString() });

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
      generateMatches();
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
  
  // 📊 AKTUALIZACJA SERII ZWYCIĘSTW / PORAŻEK
function updateStreak(playerName, won) {
  const obj = generalStats[playerName];
  if (!obj) return;
  if (!obj.streakType || !obj.streakCount) {
    obj.streakType = won ? "W" : "L";
    obj.streakCount = 1;
  } else if ((won && obj.streakType === "W") || (!won && obj.streakType === "L")) {
    obj.streakCount += 1;
  } else {
    obj.streakType = won ? "W" : "L";
    obj.streakCount = 1;
  }
}

updateStreak(match.player1, score1 > score2);
updateStreak(match.player2, score2 > score1);
  window.renderStats();
  
  window.renderGeneralStats();
  saveDraftToFirebase(); // 📝 zapis roboczy nowej serii
  console.log("✅ updateStats działa, match:", match);

}




function updateElo(player1, player2, score1, score2) {
  const elo1 = player1.elo ?? 1000;
  const elo2 = player2.elo ?? 1000;

  const expected1 = 1 / (1 + 10 ** ((elo2 - elo1) / 400));
  const expected2 = 1 - expected1;
  const actual1 = score1 > score2 ? 1 : 0;
  const actual2 = 1 - actual1;

  const margin = Math.abs(score1 - score2);
  const eloDiff = Math.abs(elo1 - elo2);
  const marginFactor = 1 + (margin / 5); // premiuje wysoką wygraną
  const fairnessPenalty = 1 - Math.min(eloDiff / 400, 0.5); // chroni słabszego
  const baseK = 32 * marginFactor;

  // ✅ Pobierz streaki z generalStats
  const gs1 = generalStats[player1.name] || {};
  const gs2 = generalStats[player2.name] || {};

  const streak1type = gs1.streakType || null;
  const streak1count = gs1.streakCount || 0;
  const streak2type = gs2.streakType || null;
  const streak2count = gs2.streakCount || 0;

  const getMultiplier = (type, count) => {
    if (type === "W") {
      if (count >= 9) return 1.4;
      if (count >= 6) return 1.25;
      if (count >= 3) return 1.1;
    } else if (type === "L") {
      if (count >= 9) return "onlyOne";
      if (count >= 6) return 0.5;
      if (count >= 3) return 0.9;
    }
    return 1;
  };

  const mult1 = getMultiplier(streak1type, streak1count);
  const mult2 = getMultiplier(streak2type, streak2count);

  let delta1 = baseK * (actual1 - expected1) * fairnessPenalty;
  let delta2 = baseK * (actual2 - expected2) * fairnessPenalty;

  if (mult1 === "onlyOne" && actual1 === 0) delta1 = -1;
  else delta1 = Math.round(delta1 * (typeof mult1 === "number" ? mult1 : 1));

  if (mult2 === "onlyOne" && actual2 === 0) delta2 = -1;
  else delta2 = Math.round(delta2 * (typeof mult2 === "number" ? mult2 : 1));

  // 💥 Przegrana z kimś z 9L = większa kara
  if (mult1 === "onlyOne" && actual2 === 1) {
    const ratio = Math.min(eloDiff / 400, 1);
    delta2 = Math.round(delta2 * (1 + ratio));
  }
  if (mult2 === "onlyOne" && actual1 === 1) {
    const ratio = Math.min(eloDiff / 400, 1);
    delta1 = Math.round(delta1 * (1 + ratio));
  }

  player1.elo = Math.round(elo1 + delta1);
  player2.elo = Math.round(elo2 + delta2);
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

  // ✅ Resetuj selected
  allPlayers.forEach(player => {
    player.selected = false;
  });
  renderPlayersList();

  // ✅ Zapisz reset graczy
  const playersRef = doc(window.db, "turniej", "stats");
  await setDoc(playersRef, {
    allPlayers,
    generalStats,
    tournamentEnded
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

 export function resetTournamentData() {
  if (!confirm("Na pewno usunąć wszystkie dane trwającego turnieju?")) return;

 
  
  matches = [];
  stats = {};
  tournamentEnded = false;

  document.getElementById("matchesTable").innerHTML = "";
  document.getElementById("resultsTable").getElementsByTagName("tbody")[0].innerHTML = "";
  document.getElementById("statsTable").getElementsByTagName("tbody")[0].innerHTML = "";

  alert("Dane turnieju zostały zresetowane.");
  window.location.href = window.location.href.split("?")[0];
}
// ======= AUTO-ZAPIS CO 10 SEKUND (jeśli turniej trwa) =======
setInterval(() => {
  const user = auth.currentUser;
  if (!user || tournamentEnded) return;

  const activeMatches = matches.filter(m => !m.confirmed);
  if (activeMatches.length === 0) return; // nic do zapisu

  saveDraftToFirebase();
  console.log("🕒 Auto-zapis wykonany");
}, 10000); // co 10 sekund
