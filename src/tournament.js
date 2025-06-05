console.log("✅ tournament.js załadowany");

import { updateElo, getEloDelta } from './utils/elo.js';
import { validateResult, updateStats } from './utils/stats.js';
import { generateRoundRobinRounds, generateMatchesForSeries } from './utils/pairing.js';
import { saveData, saveDraft } from './utils/firebaseSync.js';
import { db, doc, getDoc, deleteDoc, auth } from '../firebase.js';

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
export async function confirmPlayers() {
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
  await saveData(generalStats, allPlayers);

}


// ======= POTWIERDZANIE MECZU =======
// ======= POTWIERDZANIE MECZU =======
export async function confirmMatch(index) {
  if (tournamentEnded) {
    alert("Turniej został zakończony. Nie można wpisywać wyników.");
    return;
  }

  const match = matches[index];
  const input1 = document.getElementById(`score1-${index}`);
  const input2 = document.getElementById(`score2-${index}`);

  const score1 = parseInt(input1.value, 10);
  const score2 = parseInt(input2.value, 10);

  if (isNaN(score1) || isNaN(score2) || score1 < 0 || score2 < 0) {
    alert("Wprowadź nieujemne liczby dla obu graczy.");
    return;
  }

  if (!validateResult(score1, score2)) {
    alert(
      "Wynik meczu jest niepoprawny. Zasady:\n" +
      "• Zwycięzca: 11 pkt, jeśli przeciwnik ma <10\n" +
      "• Lub różnica 2 pkt przy 10+"
    );
    return;
  }

  const result = `${score1}:${score2}`;
  const winner = score1 > score2 ? match.player1 : match.player2;

  const p1 = allPlayers.find(p => p.name === match.player1);
  const p2 = allPlayers.find(p => p.name === match.player2);

  // 📊 Oblicz delty „na sucho”
  const elo1Before = p1?.elo ?? 1000;
  const elo2Before = p2?.elo ?? 1000;
  const [delta1, delta2, marginFactor] = getEloDelta(p1, p2, score1, score2);

  // ─── Przygotowanie modala ───
  const modalContent = document.getElementById("matchConfirmContent");
  const streak1 = getStreakLabel(p1);
  const streak2 = getStreakLabel(p2);
  modalContent.innerHTML = `
    <p><strong>${match.player1}:</strong> ${score1} pkt${streak1}<br/>
       ELO: ${elo1Before} → ${elo1Before + delta1}
       <span class="text-muted">(zmiana: ${delta1 >= 0 ? '+' : ''}${delta1})</span>
    </p>
    <p><strong>${match.player2}:</strong> ${score2} pkt${streak2}<br/>
       ELO: ${elo2Before} → ${elo2Before + delta2}
       <span class="text-muted">(zmiana: ${delta2 >= 0 ? '+' : ''}${delta2})</span>
    </p>
    <hr/>
    <p>✅ <strong>Zwycięzca:</strong> ${winner}</p>
    <p class="text-muted" style="font-size:13px;">
      ⚡️ Bonus za przewagę punktową: ×${marginFactor.toFixed(2)}
    </p>
  `;

  const modal = new bootstrap.Modal(
    document.getElementById("matchConfirmModal")
  );
  modal.show();

  // ─── Obsługa kliknięcia „Potwierdź” w modalu ───
  document.getElementById("confirmMatchBtnFinal").onclick = async () => {
    modal.hide();

    // Zapisujemy wynik i potwierdzamy
    match.result = result;
    match.confirmed = true;

    // Aktualizacja streaków
    updateStreak(match.player1, score1 > score2);
    updateStreak(match.player2, score2 > score1);

    // Aktualizacja ELO
    if (p1 && p2) updateElo(p1, p2, score1, score2);

    // Dodajemy do pełnej historii
    allMatches.push({ ...match, timestamp: new Date().toISOString() });

    // UI: zmiana przycisku i statusu
    const btn = document.getElementById(`confirmButton-${index}`);
    btn.classList.remove("btn-outline-success");
    btn.classList.add("btn-success");
    const rows = document
      .getElementById("matchesTable")
      .getElementsByTagName("tr");
    rows[index + 1].classList.add("confirmed");
    window.addResultToResultsTable(match);

    // ─── Aktualizacja statystyk i zapis ───
    updateStats(match, stats, generalStats);
    await saveData(generalStats, allPlayers);
    await saveDraft();

    // ─── Odświeżenie widoków ───
    window.renderMatches();
    if (matches.every(m => m.confirmed)) {
      matches = [];
      generateMatches(); // kolejna seria
    }
    window.renderStats();

    // Reset kolorów inputów
    input1.style.backgroundColor = "";
    input2.style.backgroundColor = "";
  };
}


// ======= ZAKOŃCZENIE TURNIEJU =======
export async function endTournament() {
  // 1) Sprawdzenie, czy rozegrano choć jeden mecz
  const allConfirmedMatches = allMatches.filter(m => m.confirmed);
  if (allConfirmedMatches.length === 0) {
    alert("Nie można zakończyć turnieju – żaden mecz nie został rozegrany.");
    return;
  }
  if (tournamentEnded) return;

  // 2) Oznaczamy zakończenie
  tournamentEnded = true;
  window.tournamentEnded = true;

  // 3) Aktualizacja obecności (obecnosc++)
  allPlayers
    .filter(p => p.selected)
    .forEach(player => {
      const name = player.name;
      if (!generalStats[name]) {
        generalStats[name] = {
          wins: 0,
          losses: 0,
          pointsScored: 0,
          pointsConceded: 0,
          obecnosc: 0,
        };
      }
      generalStats[name].obecnosc = (generalStats[name].obecnosc || 0) + 1;
    });

  // 4) Zapis główny do Firestore
  await saveData(generalStats, allPlayers);

  // 5) Odświeżenie widoku i blokada przycisków
  window.renderGeneralStats();
  document.getElementById("addPlayerBtn").disabled = true;
  document.getElementById("confirmPlayersBtn").disabled = true;
  document.getElementById("generateMatchesBtn").disabled = true;
  document.getElementById("numCourts").disabled = true;

  const endBtn = document.getElementById("endTournamentBtn");
  endBtn.disabled = true;
  endBtn.classList.remove("btn-danger");
  endBtn.classList.add("btn-secondary");

  alert("Turniej został zakończony. Nie można już generować meczy ani wpisywać wyników.");

  // 6) Odblokuj zakładkę rozliczeń
  document.getElementById("showPayoutBtn").style.display = "";

  // 7) Budowa archiwum z podziałem na serie
  const archive = {
    data: new Date().toISOString(),
    gracze: allPlayers.filter(p => p.selected).map(p => p.name),
    serie: [],
  };

  const serieMap = new Map();
  allMatches.forEach(match => {
    const key = `seria_${match.series ?? 1}`;
    if (!serieMap.has(key)) serieMap.set(key, []);
    serieMap.get(key).push({
      ...match,
      timestamp: match.timestamp || new Date().toISOString(),
    });
  });

  // 8) Zapis kolejnych serii jako osobne wpisy robocze
  for (const [seriaKey, serieMatches] of serieMap.entries()) {
    archive.serie.push({
      numer: seriaKey,
      mecze: serieMatches.map(m => ({
        gracz1: m.player1,
        gracz2: m.player2,
        runda: m.round ?? m.series,
        wynik:
          typeof m.result === "string" && m.result.trim() !== ""
            ? m.result
            : "-",
        timestamp: m.timestamp,
      })),
    });

    // Po każdej serii czyścimy bieżące mecze/statystyki i robimy zapis roboczy
    matches = [];
    stats = {};
    window.matches = [];
    window.stats = {};
    await saveDraft();
  }
}


// ======= GENEROWANIE MECZÓW (AKTUALNA SERIA) =======
export function generateMatches() {
  // 1) Pobieramy nazwy zaznaczonych graczy
  const selectedNames = allPlayers
    .filter(p => p.selected)
    .map(p => p.name);

  // 2) Ile jest kortów?
  const courtCount = parseInt(
    document.getElementById("numCourts").value,
    10
  ) || 1;

  // 3) Numer bieżącej serii = ostatnia seria + 1
  const lastSeries = allMatches.at(-1)?.series || 0;
  const seriesNumber = lastSeries + 1;

  // 4) Generujemy mecze za pomocą pairing.js
  const newMatches = generateMatchesForSeries(
    selectedNames,
    courtCount,
    seriesNumber
  );

  // 5) Aktualizujemy tablice i globalne zmienne
  matches    = newMatches;
  allMatches = [...allMatches, ...newMatches];
  window.matches    = matches;
  window.allMatches = allMatches;

  // 6) Rysujemy mecze i chowamy panel startowy
  window.renderMatches();
  hideSetupControls();
  document.getElementById("endTournamentWrapper").style.display = "block";

  // 7) Roboczy zapis na Firebase
  saveDraft();
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



export function getCurrentSeriesNumber() {
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
setInterval(async() => {
  const user = auth.currentUser;
  if (!user || window.tournamentEnded) return;


  const activeMatches = matches.filter(m => !m.confirmed);
  if (activeMatches.length === 0) return; // nic do zapisu

  await saveDraft();

  console.log("🕒 Auto-zapis wykonany");
}, 10000); // co 10 sekund
