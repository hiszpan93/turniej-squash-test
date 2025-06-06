// @ts-nocheck
/**
 * =================== IMPORTY FIREBASE ===================
 * Ściągamy tylko to, co jest potrzebne:
 * - initializeApp, getAuth, signIn, signOut, onAuthStateChanged, createUserWithEmailAndPassword, onIdTokenChanged
 * - getFirestore, doc, setDoc, getDoc, deleteDoc, collection, getDocs
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  onIdTokenChanged,
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  collection,
  getDocs,
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

import {
  matches as matchesGlobal,
  allMatches as allMatchesGlobal,
} from "./tournament.js";
import * as tournament from "./tournament.js";

/* ======================= KONFIGURACJA Firebase ======================= */
const firebaseConfig = {
  apiKey: "AIzaSyBsZrIabUINi6KeOAbUmjBWNWjsV8ViHU4",
  authDomain: "turniej-squash.firebaseapp.com",
  projectId: "turniej-squash",
  storageBucket: "turniej-squash.appspot.com",
  messagingSenderId: "240839704393",
  appId: "1:240839704393:web:0c681a6826a9b6759ca498",
  measurementId: "G-MF0N1DNET0",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Udostępniamy bazę w window, żeby inne moduły mogły korzystać:
window.db = db;

// Eksportujemy auth jako funkcję, żeby można było dynamicznie pobierać aktualnego usera:
function getAuthFn() {
  return auth;
}

export { auth, db, doc, setDoc, getDoc, deleteDoc, collection, getDocs, getAuthFn };

/* ======================= LOGIKA LOGOWANIA / REJESTRACJI ======================= */
window.firebaseAuthReady = (callback) => {
  // ===== OBŁUGA KLIKA: ZALOGUJ SIĘ =====
  document.getElementById("loginBtn").onclick = () => {
    const email = document.getElementById("emailInput").value;
    const pass = document.getElementById("passwordInput").value;

    signInWithEmailAndPassword(auth, email, pass)
      .then(() => location.reload())
      .catch((e) => alert("Błąd logowania: " + e.message));
  };

  // ===== OBŁUGA KLIKA: ZAREJESTRUJ SIĘ =====
  document.getElementById("registerBtn").onclick = async () => {
    const email = document.getElementById("emailInput").value;
    const pass = document.getElementById("passwordInput").value;
    const nick = prompt("Wprowadź swój nick (nazwa gracza):");

    if (!nick || nick.trim().length < 2) {
      alert("Nick musi mieć co najmniej 2 znaki.");
      return;
    }

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      const uid = cred.user.uid;
      await setDoc(doc(db, "users", uid), { nick: nick.trim() });
      alert("Rejestracja zakończona. Możesz się zalogować.");
    } catch (e) {
      alert("Błąd rejestracji: " + e.message);
    }
  };

  /* =================== PO ZMIANIE STANU AUTORYZACJI =================== */
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      // ===== Automatyczne odświeżanie tokenu co 5 minut przed wygaśnięciem =====
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

      onIdTokenChanged(auth, (u) => {
        if (u) {
          if (refreshTimeoutId) clearTimeout(refreshTimeoutId);
          scheduleTokenRefresh();
        } else {
          if (refreshTimeoutId) clearTimeout(refreshTimeoutId);
        }
      });

      scheduleTokenRefresh();

      // ===== OBSŁUGA WYLOGOWANIA =====
      document.getElementById("logoutBtn").addEventListener(
        "click",
        async () => {
          await signOut(auth);
          location.reload();
        }
      );

      // ===== SPRAWDZENIE, CZY SĄ DANE ROBOCZE (draft) W FIRESTORE =====
      const draftRef = doc(db, "robocze_turnieje", user.uid);
      const draftSnap = await getDoc(draftRef);

      let restoreData = null;
      if (draftSnap.exists()) {
        restoreData = draftSnap.data();
        await deleteDoc(draftRef);
      }

      // ===== INICJALIZACJA UI TURNIEJU =====
      async function initTournamentUI() {
        const tournamentMod = await import("./tournament.js");
        await tournamentMod.loadDataFromFirebase();

        const uiMod = await import("./ui.js");
        uiMod.initUI();

        // Po załadowaniu danych wyrenderuj widoki:
        window.renderPlayersList?.();
        window.renderGeneralStats?.();
        window.renderMatches?.();
        window.renderStats?.();

        // Jeśli jakieś mecze były potwierdzone, dodaj je do tabeli:
        window.matches?.forEach((match) => {
          if (match.confirmed) {
            window.addResultToResultsTable(match);
          }
        });
      }

      await initTournamentUI();
      console.log("✅ UI zainicjowane i dane załadowane");

      // ===== PO ZALOGOWANIU: wyświetlamy UI, chowamy logowanie =====
      document.getElementById("authContainer").style.display = "none";
      document.getElementById("viewTabs").style.display = "flex";
      document.getElementById("mainContainer").style.display = "block";
      document.getElementById("userInfoBar").style.display = "flex";
      document.getElementById("loggedInUserEmail").textContent =
        user.email || "(brak e-maila)";
      document.body.classList.add("logged-in");

      // ===== JEŚLI BYŁ DRAFT, PYTAMY O PRZYWRÓCENIE =====
      if (restoreData) {
        const confirmRestore = confirm(
          `Znaleziono zapisany turniej w chmurze.\nCzy chcesz go przywrócić?`
        );
        if (confirmRestore) {
          // przywracamy matches/allMatches/statystyki:
          window.matches.length = 0;
          window.matches.push(...(restoreData.matches || []));
          window.allMatches = [...restoreData.allMatches || []];

          matchesGlobal.length = 0;
          matchesGlobal.push(...(restoreData.matches || []));
          allMatchesGlobal.length = 0;
          allMatchesGlobal.push(...(restoreData.allMatches || []));
          window.allMatches = [...allMatchesGlobal];

          Object.keys(window.stats).forEach((k) => delete window.stats[k]);
          Object.assign(window.stats, restoreData.stats || {});
          const selected = restoreData.gracze || [];
          window.allPlayers.forEach((p) => {
            p.selected = selected.includes(p.name);
          });

          // Przywróć stan, gdy turniej był w trakcie:
          if (restoreData.turniejTrwa && !restoreData.tournamentEnded) {
            ["setupPanel", "playersList", "generateMatchesBtn"].forEach((id) => {
              const el = document.getElementById(id);
              if (el) el.style.display = "none";
            });
            const endWrapper = document.getElementById("endTournamentWrapper");
            if (endWrapper) endWrapper.style.display = "block";
          }

          window.tournamentEnded = restoreData.tournamentEnded || false;
          window.renderPlayersList?.();
          window.renderGeneralStats?.();
          window.renderMatches?.();
          window.renderStats?.();

          window.matches?.forEach((match) => {
            if (match.confirmed) {
              window.addResultToResultsTable(match);
            }
          });

          // Pokaż toast z liczbą przywróconych meczów:
          const toastText = restoreData.matches?.length
            ? `✅ Przywrócono turniej z ${restoreData.matches.length} meczami.`
            : `✅ Przywrócono turniej.`;

          document.getElementById("restoreToastContent").textContent = toastText;
          const toastEl = document.getElementById("restoreToast");
          new bootstrap.Toast(toastEl).show();

          setTimeout(() => {
            document
              .getElementById("matchesTable")
              ?.scrollIntoView({ behavior: "smooth" });
          }, 600);
        }
      }
    } else {
      // Użytkownik niezalogowany – pokaż tylko logowanie
      document.getElementById("authContainer").style.display = "block";
      document.getElementById("userInfoBar").style.display = "none";
      document.getElementById("viewTabs").style.display = "none";
      document.getElementById("mainContainer").style.display = "none";
      document.body.classList.remove("logged-in");
      hideAllMainElements();
    }
  });
};

/* ======================= POMOCNICZA: chowamy wszystkie widoki ======================= */
function hideAllMainElements() {
  const idsToHide = [
    "mainContainer",
    "viewTabs",
    "archiveView",
    "playersList",
    "setupPanel",
    "generateMatchesBtn",
    "rankingView",
    "tournamentArchive",
    "userInfoBar",
    "endTournamentWrapper",
  ];
  idsToHide.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });

  /* Ukrywamy też tabele */
  ["matchesTable", "resultsTable", "statsTable", "generalStatsTable", "eloRankingTable"].forEach(
    (id) => {
      const wrapper = document.getElementById(id)?.closest(".table-responsive");
      if (wrapper) wrapper.style.display = "none";
    }
  );

  const nc = document.getElementById("numCourts")?.parentElement;
  if (nc) nc.style.display = "none";

  console.log("[HIDE] Ukryto wszystkie elementy turniejowe");
}
