

// @ts-nocheckjezumamdosc

// 1) Importy z CDN Firebase (wersja 9.22.1)
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  onIdTokenChanged
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

// 2) Importy z Twojego kodu turnieju (ścieżka względem katalogu głównego)
import { matches as matchesGlobal, allMatches as allMatchesGlobal } from "./src/tournament.js";
import * as tournament from "./src/tournament.js";


// 3) Twoja konfiguracja Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBsZrIabUINi6KeOAbUmjBWNWjsV8ViHU4",
  authDomain: "turniej-squash.firebaseapp.com",
  projectId: "turniej-squash",
  storageBucket: "turniej-squash.appspot.com",
  messagingSenderId: "240839704393",
  appId: "1:240839704393:web:0c681a6826a9b6759ca498",
  measurementId: "G-MF0N1DNET0"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);
window.db = db;

const auth = getAuth(app);


// 4) Definicja lokalnej funkcji firebaseAuthReady, którą później eksportujemy i przypisujemy do window
function firebaseAuthReady(callback) {
  // Obsługa kliknięcia przycisku „Zaloguj”
  document.getElementById("loginBtn").onclick = () => {
    const email = document.getElementById("emailInput").value;
    const pass  = document.getElementById("passwordInput").value;
    signInWithEmailAndPassword(auth, email, pass)
      .then(() => location.reload())
      .catch(e => alert("Błąd logowania: " + e.message));
  };

  // Obsługa kliknięcia przycisku „Zarejestruj”
  document.getElementById("registerBtn").onclick = async () => {
    const email = document.getElementById("emailInput").value;
    const pass  = document.getElementById("passwordInput").value;
    const nick  = prompt("Wprowadź swój nick (nazwa gracza):");

    if (!nick || nick.trim().length < 2) {
      alert("Nick musi mieć co najmniej 2 znaki.");
      return;
    }

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      const uid = cred.user.uid;
      await setDoc(doc(window.db, "users", uid), { nick: nick.trim() });
      alert("Rejestracja zakończona. Możesz się zalogować.");
    } catch (e) {
      alert("Błąd rejestracji: " + e.message);
    }
  };

  // Wewnętrzna funkcja inicjalizująca turniej i UI po zalogowaniu
  async function initTournamentUI() {
    // 1) Załaduj dane turnieju (tournament.js w src/)
    const tournamentMod = await import("./src/tournament.js");
    await tournamentMod.loadDataFromFirebase();

    // 2) Załaduj moduł UI i uruchom initUI()
    const uiMod = await import("./src/ui.js");
    uiMod.initUI();

    // 3) Dopilnuj, by interfejs pokazał wszystkie tabele / wyniki
    window.renderPlayersList?.();
    window.renderGeneralStats?.();
    window.renderMatches?.();
    window.renderStats?.();

    window.matches?.forEach(match => {
      if (match.confirmed) {
        window.addResultToResultsTable(match);
      }
    });
  }

  // Słuchacz na zmianę stanu autoryzacji (logowanie/wylogowanie)
  onAuthStateChanged(auth, async user => {
    if (user) {
      // Jeśli zalogowany, planujemy odświeżanie tokenu co 5 minut przed wygaśnięciem
      let refreshTimeoutId;
      const scheduleTokenRefresh = async () => {
        try {
          const idTokenResult = await user.getIdTokenResult();
          const expTime = new Date(idTokenResult.expirationTime).getTime();
          const now = Date.now();
          const delay = expTime - now - 5 * 60 * 1000;
          if (delay > 0) {
            refreshTimeoutId = setTimeout(async () => {
              await user.getIdToken(true);
              console.log("✅ Token Firebase odświeżony");
              scheduleTokenRefresh();
            }, delay);
          }
        } catch (err) {
          console.error("⚠️ Błąd planowania odświeżenia tokenu:", err);
        }
      };

      onIdTokenChanged(auth, u => {
        if (u) {
          if (refreshTimeoutId) clearTimeout(refreshTimeoutId);
          scheduleTokenRefresh();
        } else {
          if (refreshTimeoutId) clearTimeout(refreshTimeoutId);
        }
      });

      scheduleTokenRefresh();

      // Obsługa wylogowania
      document.getElementById("logoutBtn").addEventListener("click", async () => {
        await signOut(auth);
        location.reload();
      });

      // Sprawdź, czy jest zapisany draft w Firestore
      const draftRef  = doc(window.db, "robocze_turnieje", user.uid);
      const draftSnap = await getDoc(draftRef);

      let restoreData = null;
      if (draftSnap.exists()) {
        restoreData = draftSnap.data();
        await deleteDoc(draftRef);
      }

      // Uruchom inicjalizację turnieju/UI
      await initTournamentUI();
      console.log("✅ UI zainicjowane i dane załadowane");

      // Ukryj formularz logowania, pokaż pozostałe widoki
      document.getElementById("authContainer").style.display     = "none";
      document.getElementById("viewTabs").style.display          = "flex";
      document.getElementById("mainContainer").style.display      = "block";
      document.getElementById("userInfoBar").style.display        = "flex";
      document.getElementById("loggedInUserEmail").textContent    = user.email || "(brak e-maila)";
      document.body.classList.add("logged-in");

      // Jeśli był zapisany draft – przywróć stan
      if (restoreData) {
        const confirmRestore = confirm(
          `Znaleziono zapisany turniej w chmurze.\nCzy chcesz go przywrócić?`
        );
        if (confirmRestore) {
          // 1) Przywróć mecze i allMatches
          window.matches.length = 0;
          window.matches.push(...(restoreData.matches || []));
          window.allMatches = [...(restoreData.allMatches || [])];
          matchesGlobal.length   = 0;
          matchesGlobal.push(...(restoreData.matches || []));
          allMatchesGlobal.length = 0;
          allMatchesGlobal.push(...(restoreData.allMatches || []));
          window.allMatches = [...allMatchesGlobal];

          console.log("📦 allMatches po przywróceniu:", allMatchesGlobal);

          // 2) Przywróć statystyki
          Object.keys(window.stats).forEach(k => delete window.stats[k]);
          Object.assign(window.stats, restoreData.stats || {});

          // 3) Przywróć zaznaczenie graczy
          const selected = restoreData.gracze || [];
          window.allPlayers.forEach(p => {
            p.selected = selected.includes(p.name);
          });

          // 4) Jeśli turniej trwał i nie był zakończony – ukryj panel startowy
          if (restoreData.turniejTrwa && !restoreData.tournamentEnded) {
            ["setupPanel", "playersList", "generateMatchesBtn"].forEach(id => {
              const el = document.getElementById(id);
              if (el) el.style.display = "none";
            });
            const endWrapper = document.getElementById("endTournamentWrapper");
            if (endWrapper) endWrapper.style.display = "block";
          }

          // 5) Ustaw stan zakończenia turnieju
          window.tournamentEnded = restoreData.tournamentEnded || false;

          // 6) Ponowne wyrenderowanie
          window.renderPlayersList?.();
          window.renderGeneralStats?.();
          window.renderMatches?.();
          window.renderStats?.();

          window.matches?.forEach(match => {
            if (match.confirmed) {
              window.addResultToResultsTable(match);
            }
          });

          // 7) Pokaż powiadomienie (toast)
          const toastText = restoreData.matches?.length
            ? `✅ Przywrócono turniej z ${restoreData.matches.length} meczami.`
            : `✅ Przywrócono turniej.`;
          document.getElementById("restoreToastContent").textContent = toastText;
          const toastEl = document.getElementById("restoreToast");
          new bootstrap.Toast(toastEl).show();

          setTimeout(() => {
            document.getElementById("matchesTable")?.scrollIntoView({ behavior: "smooth" });
          }, 600);
        }
      }

      // Na koniec wywołujemy callback (np. w index.html)
      if (callback) callback();

    } else {
      // Jeśli użytkownik niezalogowany – pokaż formularz logowania i ukryj resztę
      document.getElementById("authContainer").style.display = "block";
      document.getElementById("userInfoBar").style.display   = "none";
      document.getElementById("viewTabs").style.display      = "none";
      document.getElementById("mainContainer").style.display  = "none";
      document.body.classList.remove("logged-in");
      hideAllMainElements();
    }
  });
}

// 5) Przypisanie funkcji firebaseAuthReady do window
window.firebaseAuthReady = firebaseAuthReady;


// ✖️ Ukrywanie wszystkich elementów turniejowych, gdy użytkownik nie jest zalogowany
function hideAllMainElements() {
  [
    "mainContainer", "viewTabs", "archiveView", "playersList",
    "setupPanel", "generateMatchesBtn", "resetTournamentBtn",
    "rankingView", "tournamentArchive", "userInfoBar", "endTournamentWrapper"
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });

  [
    "matchesTable",
    "resultsTable",
    "statsTable",
    "generalStatsTable",
    "eloRankingTable"
  ].forEach(id => {
    const wrapper = document.getElementById(id)?.closest(".table-responsive");
    if (wrapper) wrapper.style.display = "none";
  });

  const nc = document.getElementById("numCourts")?.parentElement;
  if (nc) nc.style.display = "none";
  console.log("[HIDE] Ukryto wszystkie elementy turniejowe");
}

// ✖️ Helper do pobrania instancji auth
function getAuthFn() {
  return auth;
}


// 6) Eksport – w tym także firebaseAuthReady
export {
  auth,
  db,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  signOut,
  collection,
  getDocs,
  getAuthFn,
  firebaseAuthReady
};
