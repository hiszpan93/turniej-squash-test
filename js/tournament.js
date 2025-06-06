console.log("✅ tournament.js załadowany");

/* =================== IMPORTY =================== */
import { db, doc, setDoc, deleteDoc, getDoc, auth } from "./firebase.js";

/* ======================= GLOBALNE ZMIENNE ======================= */
export let allPlayers = [];
let nextPlayerId = 1;

export let matches = [];
export let allMatches = [];

export let stats = {};
export let generalStats = {};
window.tournamentEnded = false;

/* Zmienne pomocnicze do łączenia rund, serii itp. */
let allRounds = [];
let currentRoundIndex = 0;

/* ======================= POMOCNICZE FUNKCJE ELO / STREAK ======================= */

/**
 * Aktualizuje serię (wygranych/porażek) gracza
 */
function updateStreak(playerName, won) {
  const gs = (generalStats[playerName] ||= {
    wins: 0,
    losses: 0,
    pointsScored: 0,
    pointsConceded: 0,
    obecnosc: 0,
  });

  if (!gs.streakType) {
    gs.streakType = won ? "W" : "L";
    gs.streakCount = 1;
  } else if ((won && gs.streakType === "W") || (!won && gs.streakType === "L")) {
    gs.streakCount++;
  } else {
    gs.streakType = won ? "W" : "L";
    gs.streakCount = 1;
  }
}

/**
 * Oblicza przyrost ELO bez aktualizacji (do okienka confirm)
 */
export function getEloDelta(p1, p2, s1, s2, K = 24, D = 0.75) {
  const R1 = p1.elo,
    R2 = p2.elo;
  const E1 = 1 / (1 + 10 ** ((R2 - R1) / 400));
  const E2 = 1 - E1;
  const a1 = s1 > s2 ? 1 : 0;
  const a2 = 1 - a1;
  const margin = Math.abs(s1 - s2);
  const mf = margin <= 2 ? 1 : 1 + Math.min((margin - 2) * 0.1, 0.5);

  const raw1 = K * (a1 - E1) * (a1 === 1 ? mf : 1);
  const raw2 = K * (a2 - E2) * (a2 === 1 ? mf : 1);

  const d1 = Math.round(raw1 * D);
  const d2 = Math.round(raw2 * D);

  return [d1, d2, mf];
}

/**
 * Aktualizuje ELO obu graczy po meczu.
 */
function updateElo(player1, player2, score1, score2, K = 24, D = 0.75) {
  const R1 = player1.elo,
    R2 = player2.elo;
  const E1 = 1 / (1 + 10 ** ((R2 - R1) / 400));
  const a1 = score1 > score2 ? 1 : 0;
  const a2 = 1 - a1;
  const margin = Math.abs(score1 - score2);
  const mf = margin <= 2 ? 1 : 1 + Math.min((margin - 2) * 0.1, 0.5);

  const raw1 = K * (a1 - E1) * (a1 === 1 ? mf : 1);
  const raw2 = K * (a2 - (1 - E1)) * (a2 === 1 ? mf : 1);

  const delta1 = Math.round(raw1 * D);
  const delta2 = Math.round(raw2 * D);

  player1.elo += delta1;
  player2.elo += delta2;

  return { delta1, delta2, marginFactor: mf };
}

/* ======================= ZAPIS DO FIRESTORE ======================= */

/**
 * Zapisuje do kolekcji “turniej/stats”:
 * - generalStats
 * - allPlayers
 */
function saveDataToFirebase() {
  setDoc(doc(db, "turniej", "stats"), {
    generalStats: generalStats,
    allPlayers: allPlayers,
  })
    .then(() => console.log("Dane zapisane do Firebase"))
    .catch((error) => console.error("Błąd zapisu do Firebase: ", error));
}

/**
 * Zapisuje roboczy stan turnieju (draft):
 * - gracze (lista wybranych)
 * - matches
 * - allMatches
 * - stats
 * - numer bieżącej serii
 * - timestamp
 * - czy turniej jest w trakcie
 * - czy turniej zakończony
 */
async function saveDraftToFirebase() {
  const user = auth.currentUser;
  if (!user) return;

  const draftData = {
    gracze: allPlayers.filter((p) => p.selected).map((p) => p.name),
    matches,
    allMatches,
    stats,
    series: getCurrentSeriesNumber(),
    timestamp: new Date().toISOString(),
    turniejTrwa: matches.length > 0,
    tournamentEnded: tournamentEnded,
  };

  try {
    await user.getIdToken(true); // odświeżenie tokenu
    await setDoc(doc(db, "robocze_turnieje", user.uid), draftData);
    console.log("📝 Zapisano roboczy stan turnieju do Firebase");
  } catch (err) {
    console.error("❌ Błąd zapisu roboczego turnieju:", err);
  }
}

/* ======================= DODAWANIE GRACZA ======================= */

export function addPlayer() {
  if (tournamentEnded) return;

  const nameInput = document.getElementById("newPlayerName");
  const name = nameInput.value.trim();
  if (!name) {
    alert("Podaj nazwę gracza!");
    return;
  }
  if (allPlayers.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    alert("Gracz o takiej nazwie już istnieje!");
    return;
  }

  const newPlayer = { id: nextPlayerId++, name: name, elo: 1000 };
  allPlayers.push(newPlayer);
  nameInput.value = "";
  window.renderPlayersList();
}

/* ======================= POTWIERDZENIE GRACZY ======================= */

export function confirmPlayers() {
  if (tournamentEnded) return;

  const checkboxes = document.querySelectorAll(".playerCheckbox");
  allPlayers.forEach((p) => (p.selected = false));

  const selected = [];
  checkboxes.forEach((chk) => {
    if (chk.checked) {
      const playerId = parseInt(chk.value, 10);
      const player = allPlayers.find((p) => p.id === playerId);
      if (player) {
        player.selected = true;
        selected.push(player.name);
      }
    }
  });

  const players = allPlayers.filter((p) => p.selected);
  if (players.length < 2) {
    alert("Wybierz co najmniej dwóch graczy, aby wygenerować mecze.");
    return;
  }

  const courtCount = parseInt(
    document.getElementById("numCourts").value,
    10
  ) || 1;

  if (players.length < courtCount * 2) {
    alert(
      `Za mało graczy na ${courtCount} kort${
        courtCount > 1 ? "y" : ""
      }!\nPotrzebujesz co najmniej ${courtCount * 2} graczy.`
    );
    return;
  }

  // Inicjalizujemy statystyki dla wybranych graczy, jeśli brak:
  players.forEach((player) => {
    stats[player.name] ||= {
      wins: 0,
      losses: 0,
      pointsScored: 0,
      pointsConceded: 0,
    };
    generalStats[player.name] ||= {
      wins: 0,
      losses: 0,
      pointsScored: 0,
      pointsConceded: 0,
      obecnosc: 0,
    };
  });

  alert("Gracze zostali wybrani. Możesz teraz wygenerować mecze.");
  saveDataToFirebase();
}

/* ======================= ROUND-ROBIN: GENEROWANIE RUND ======================= */

/**
 * Tworzy rundy metodą Round-Robin.
 * Jeśli liczba graczy jest nieparzysta, dodajemy “BYE” jako wolny los.
 */
function generateRoundRobinRounds(playersList) {
  let playerList = [...playersList];
  const isOdd = playerList.length % 2 !== 0;
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
        result: null,
      });
    }
    rounds.push(roundMatches);

    const last = playerList.pop();
    playerList.splice(1, 0, last);
  }
  return rounds;
}

/* ======================= GENEROWANIE MECZÓW ======================= */

/**
 * Funkcja wywoływana po naciśnięciu “Wygeneruj mecze”.
 * - Tworzy wszystkie możliwe pary
 * - Następnie układa je w rundy, uwzględniając maksymalnie 2 kolejne mecze dla gracza
 *   (żeby nie grał ciągle back-to-back)
 * - Jeśli jest tylko 2 graczy, generujemy od razu 2 serie
 */
export function generateMatches() {
  const players = allPlayers.filter((p) => p.selected);

  if (players.length < 2) {
    alert("Wybierz co najmniej dwóch graczy, aby wygenerować mecze.");
    return;
  }

  const courtCount = parseInt(
    document.getElementById("numCourts").value,
    10
  ) || 1;
  let seriesNumber = (allMatches.at(-1)?.series || 0) + 1;

  // Tworzymy wszystkie możliwe pary [i, j]
  const pairings = [];
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      pairings.push([players[i], players[j]]);
    }
  }

  /**
   * Generuje zestaw meczów dla jednej serii:
   * - Stara się nie dać jednemu graczowi więcej niż 2 mecze pod rząd.
   * - W każdym "roundzie" maksymalnie courtCount meczów.
   */
  const generateMatchSet = (seriesNum) => {
    const newMatches = [];
    let round = 1;

    // klucz: imię gracza → ile meczów ma “pod rząd”
    const consecCounts = {};
    players.forEach((p) => (consecCounts[p.name] = 0));

    const pairingsCopy = [...pairings];

    while (pairingsCopy.length > 0) {
      const roundMatches = [];
      const roundPlayers = new Set();
      const usedPlayersThisRound = new Set();

      for (let k = 0; k < pairingsCopy.length; k++) {
        const [p1, p2] = pairingsCopy[k];
        if (
          consecCounts[p1.name] >= 2 ||
          consecCounts[p2.name] >= 2
        ) {
          continue; // pomijamy, jeśli któryś z nich już grał 2 razy z rzędu
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

      // Jeśli nic się nie dało powiązać (za ciasno), po prostu bierzemy pierwsze courtCount par
      if (roundMatches.length === 0) {
        for (let k = 0; k < courtCount && k < pairingsCopy.length; k++) {
          const [p1, p2] = pairingsCopy.shift();
          roundMatches.push({ p1, p2 });
          roundPlayers.add(p1.name);
          roundPlayers.add(p2.name);
        }
      }

      // Aktualizujemy liczniki consecCounts:
      players.forEach((p) => {
        if (roundPlayers.has(p.name)) {
          consecCounts[p.name] += 1;
        } else {
          consecCounts[p.name] = 0;
        }
      });

      // Dodajemy mecze z podaną serią i rundą
      if (roundMatches.length > 0) {
        roundMatches.forEach((match, index) => {
          newMatches.push({
            player1: match.p1.name,
            player2: match.p2.name,
            court: index + 1,
            result: "",
            confirmed: false,
            series: seriesNum,
            round: round,
          });
        });
        round++;
      }
    }

    return newMatches;
  };

  let allNewMatches = generateMatchSet(seriesNumber);

  // Jeśli tylko 2 graczy – generujemy od razu 2 serie (ta sama para)
  if (players.length === 2) {
    const secondSeriesMatches = generateMatchSet(seriesNumber + 1);
    allNewMatches = allNewMatches.concat(secondSeriesMatches);
    seriesNumber += 1;
  }

  matches = allNewMatches;
  window.renderMatches();

  // Po wygenerowaniu meczów chowamy panel startowy i pokazujemy przycisk “Koniec turnieju”
  hideSetupControls();
  const endWrapper = document.getElementById("endTournamentWrapper");
  if (endWrapper && !tournamentEnded) {
    endWrapper.style.display = "block";
    fadeInElement(endWrapper);
  }

  saveDraftToFirebase(); // Zapis roboczy stanu turnieju
}

/* ======================= POTWIERDZANIE WYNIKU ======================= */

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

  // Dane ELO przed zmianą
  const p1 = allPlayers.find((p) => p.name === match.player1);
  const p2 = allPlayers.find((p) => p.name === match.player2);
  const elo1Before = p1?.elo ?? 1000;
  const elo2Before = p2?.elo ?? 1000;

  // Obliczamy delta ELO do wyświetlenia w OKIENKU
  const [delta1, delta2, marginFactor] = getEloDelta(p1, p2, score1, score2);

  const modalContent = document.getElementById("matchConfirmContent");

  // Generujemy znaczniki do wyświetlenia w modalu:
  function getStreakLabel(player) {
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
  }

  const player1Data = allPlayers.find((p) => p.name === match.player1);
  const player2Data = allPlayers.find((p) => p.name === match.player2);
  const streak1 = getStreakLabel(player1Data);
  const streak2 = getStreakLabel(player2Data);

  // Wstawiamy treść do modala:
  modalContent.innerHTML = `
    <p>
      <strong>${match.player1}:</strong> ${score1} pkt${streak1}<br/>
      ELO: ${elo1Before} → ${elo1Before + delta1} <span class="text-muted">(zmiana: ${delta1 >= 0 ? "+" : ""}${delta1})</span>
    </p>
    <p>
      <strong>${match.player2}:</strong> ${score2} pkt${streak2}<br/>
      ELO: ${elo2Before} → ${elo2Before + delta2} <span class="text-muted">(zmiana: ${delta2 >= 0 ? "+" : ""}${delta2})</span>
    </p>
    <hr/>
    <p>✅ <strong>Zwycięzca:</strong> ${winner}</p>
    <p class="text-muted" style="font-size: 13px;">
      ⚡️ Bonus za przewagę punktową: ×${marginFactor.toFixed(2)}
    </p>
  `;

  // Pokaż modal:
  const modal = new bootstrap.Modal(
    document.getElementById("matchConfirmModal")
  );
  modal.show();

  // Po kliknięciu “Potwierdź” w modalu:
  document.getElementById("confirmMatchBtnFinal").onclick = async () => {
    modal.hide();
    match.result = result;
    match.confirmed = true;

    // 1) Zaktualizuj serię streaków:
    updateStreak(match.player1, score1 > score2);
    updateStreak(match.player2, score2 > score1);

    // 2) Zaktualizuj ELO w allPlayers:
    const p1ref = allPlayers.find((p) => p.name === match.player1);
    const p2ref = allPlayers.find((p) => p.name === match.player2);
    if (p1ref && p2ref) updateElo(p1ref, p2ref, score1, score2);

    // 3) Dodaj potwierdzony mecz do allMatches i zapis draftu:
    allMatches.push({ ...match, timestamp: new Date().toISOString() });
    await saveDraftToFirebase();

    // 4) Zaktualizuj znaczniki przycisku i wiersz:
    const btn = document.getElementById(`confirmButton-${index}`);
    btn.classList.remove("btn-outline-success");
    btn.classList.add("btn-success");

    const matchesTable = document.getElementById("matchesTable");
    const rows = matchesTable.getElementsByTagName("tr");
    rows[index + 1].classList.add("confirmed");

    // 5) Dodaj wiersz do tabeli Wyniki meczów:
    window.addResultToResultsTable(match);

    // 6) Zaktualizuj statystyki:
    updateStats(match);
    saveDataToFirebase();
    saveDraftToFirebase();

    // 7) Odśwież widok meczów i statystyk w UI:
    window.renderMatches();
    window.renderStats();

    // Jeśli wszystkie mecze w serii potwierdzone, generujemy następną serię:
    if (matches.every((m) => m.confirmed)) {
      matches = [];
      generateMatches();
    }

    // Reset tła pól:
    input1.style.backgroundColor = "";
    input2.style.backgroundColor = "";
  };
}

/**
 * Sprawdza poprawność wyniku na podstawie zasad squasha:
 * - Jeśli przegrany ma <10, zwycięzca musi mieć dokładnie 11.
 * - Jeśli obaj mają ≥10, różnica musi wynosić 2 punkty.
 */
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

/* ======================= AKTUALIZACJA STATYSTYK ======================= */

function updateStats(match) {
  const [score1, score2] = match.result.split(":").map(Number);

  // 1) Bieżące statystyki (aktualny turniej)
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

  // 2) Statystyki ogólne (wszystkie turnieje)
  generalStats[match.player1] ||= {
    wins: 0,
    losses: 0,
    pointsScored: 0,
    pointsConceded: 0,
    obecnosc: 0,
  };
  generalStats[match.player2] ||= {
    wins: 0,
    losses: 0,
    pointsScored: 0,
    pointsConceded: 0,
    obecnosc: 0,
  };

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

  // Odśwież widoki:
  window.renderStats();
  window.renderGeneralStats();
  saveDraftToFirebase();
  console.log("✅ updateStats działa, match:", match);
}

/* ======================= ZAKOŃCZENIE TURNIEJU ======================= */

export async function endTournament() {
  const allConfirmedMatches = allMatches.filter((m) => m.confirmed);

  if (allConfirmedMatches.length === 0) {
    alert("Nie można zakończyć turnieju – żaden mecz nie został rozegrany.");
    return;
  }
  if (tournamentEnded) return;

  tournamentEnded = true;
  window.tournamentEnded = true;

  // Dodaj obecność każdemu wybranemu graczowi:
  allPlayers
    .filter((p) => p.selected)
    .forEach((player) => {
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

  saveDataToFirebase();
  window.renderGeneralStats();

  // Wyłącz przyciski, żeby nie generować kolejnych meczów:
  document.getElementById("addPlayerBtn").disabled = true;
  document.getElementById("confirmPlayersBtn").disabled = true;
  document.getElementById("generateMatchesBtn").disabled = true;
  document.getElementById("numCourts").disabled = true;

  const endTournamentBtn = document.getElementById("endTournamentBtn");
  endTournamentBtn.disabled = true;
  endTournamentBtn.classList.remove("btn-danger");
  endTournamentBtn.classList.add("btn-secondary");

  alert("Turniej został zakończony. Nie można już generować meczy ani wpisywać wyników.");

  // Odkryj zakładkę “Rozliczenia”
  document.getElementById("showPayoutBtn").style.display = "";

  /* ========== TWORZENIE ARCHIWUM ========== */
  const archive = {
    data: new Date().toISOString(),
    gracze: allPlayers.filter((p) => p.selected).map((p) => p.name),
    serie: [],
  };

  const serieMap = new Map();
  allMatches.forEach((match) => {
    const key = `seria_${match.series ?? 1}`;
    if (!serieMap.has(key)) serieMap.set(key, []);
    serieMap.get(key).push({
      ...match,
      timestamp: match.timestamp || new Date().toISOString(),
    });
  });

  for (const [seriaKey, serieMatches] of serieMap.entries()) {
    archive.serie.push({
      numer: seriaKey,
      mecze: serieMatches.map((m) => ({
        gracz1: m.player1,
        gracz2: m.player2,
        runda: m.round,
        wynik: typeof m.result === "string" && m.result.trim() !== "" ? m.result : "-",
        timestamp: m.timestamp || new Date().toISOString(),
      })),
    });
    // Czyścimy matches/stats/serię:
    matches = [];
    stats = {};
    window.matches = [];
    window.stats = {};
    await saveDraftToFirebase();
  }

  // Zapisz archiwum do Firestore
  const user = auth.currentUser;
  if (user) {
    const archiveId = `turniej_${archive.data.replace(/[:.]/g, "-")}`;
    const archiveRef = doc(db, "archiwa", archiveId);

    setDoc(archiveRef, archive)
      .then(() => console.log("✅ Archiwum zapisane do Firebase"))
      .catch((err) => console.error("❌ Błąd zapisu archiwum do Firebase", err));

    deleteDoc(doc(db, "robocze_turnieje", user.uid))
      .then(() => console.log("🧹 Usunięto wersję roboczą turnieju"))
      .catch((err) => console.error("❌ Błąd usuwania wersji roboczej:", err));
  }

  // Zapisz reset graczy w “turniej/stats”
  const playersRef = doc(db, "turniej", "stats");
  await setDoc(
    playersRef,
    {
      allPlayers,
      generalStats,
    },
    { merge: true }
  );

  // Odśwież widok archiwum (jeśli jest aktywny)
  if (window.renderArchiveView) window.renderArchiveView();

  // Przygotuj stan aplikacji na nowy turniej
  tournamentEnded = false;
  window.tournamentEnded = false;

  ["setupPanel", "playersList", "generateMatchesBtn"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = "block";
  });
  const nc = document.getElementById("numCourts")?.parentElement;
  if (nc) nc.style.display = "block";
}

/* ======================= WCZYTANIE DANYCH Z FIRESTORE ======================= */

/**
 * Ładuje:
 * - allPlayers
 * - generalStats
 * - tournamentEnded
 * Jeśli są już gracz, ustawia nextPlayerId,
 * i zapisuje referencje do window.
 */
export async function loadDataFromFirebase() {
  const docRef = doc(db, "turniej", "stats");
  try {
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      allPlayers = (data.allPlayers || []).map((p) => ({
        ...p,
        elo: p.elo ?? 1000,
      }));
      generalStats = data.generalStats || {};
      tournamentEnded = data.tournamentEnded || false;
      window.tournamentEnded = tournamentEnded;

      if (allPlayers.length > 0) {
        nextPlayerId = Math.max(...allPlayers.map((p) => p.id)) + 1;
      }

      // Zapisujemy referencje w window:
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

/**
 * Zwraca numer bieżącej serii:
 * - Jeśli matches jest puste, zwraca 0.
 * - Jeśli wszystkie mecze są potwierdzone, zwraca ostatnią serię z matches.
 * - W przeciwnym razie zwraca serię pierwszego meczu.
 */
function getCurrentSeriesNumber() {
  if (matches.length === 0) return 0;
  const allConfirmed = matches.every((m) => m.confirmed);
  return allConfirmed ? matches[matches.length - 1].series || 0 : matches[0].series || 1;
}

/* ======================= UKRYWAMY PANEL STARTOWY ======================= */

function hideSetupControls() {
  ["setupPanel", "playersList", "generateMatchesBtn"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
  const nc = document.getElementById("numCourts")?.parentElement;
  if (nc) nc.style.display = "none";
}



/**
 * Przywraca interfejs do stanu “nowy turniej” bez usuwania allPlayers:
 * - Usuwa zaznaczenia graczy
 * - Czyści tabele meczów/rezultatów/statystyk
 * - Pokazuje ponownie panel wyboru graczy
 */
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

  allPlayers.forEach((player) => (player.selected = false));
  window.renderPlayersList();

  document.getElementById("matchesTable").innerHTML = "";
  document
    .getElementById("resultsTable")
    .getElementsByTagName("tbody")[0].innerHTML = "";
  document
    .getElementById("statsTable")
    .getElementsByTagName("tbody")[0].innerHTML = "";

  ["setupPanel", "playersList", "generateMatchesBtn"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = "block";
  });
  const nc = document.getElementById("numCourts")?.parentElement;
  if (nc) nc.style.display = "block";

  const endWrapper = document.getElementById("endTournamentWrapper");
  if (endWrapper) endWrapper.style.display = "none";

  window.renderPlayersList?.();
  window.renderGeneralStats?.();
}

/* ======================= AUTO-ZAPIS CO 10 SEKUND ======================= */
setInterval(() => {
  const user = auth.currentUser;
  if (!user || window.tournamentEnded) return;

  const activeMatches = matches.filter((m) => !m.confirmed);
  if (activeMatches.length === 0) return;

  saveDraftToFirebase();
  console.log("🕒 Auto-zapis wykonany");
}, 10000); // co 10 sekund
