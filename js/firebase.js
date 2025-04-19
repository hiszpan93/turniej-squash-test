
// @ts-nocheck
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
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

import {
  matches,
  stats,
  allPlayers
} from "./tournament.js";

const firebaseConfig = {
  apiKey: "AIzaSyAmWZmK1SJxyBZRrf61sLtyrGy4kctS3T8",
  authDomain: "turniej-squash.firebaseapp.com",
  projectId: "turniej-squash",
  storageBucket: "turniej-squash.appspot.com",
  messagingSenderId: "240839704393",
  appId: "1:240839704393:web:0c681a6826a9b6759ca498",
  measurementId: "G-MF0N1DNET0"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
window.db = db;
const auth = getAuth(app);

window.firebaseAuthReady = (callback) => {
  document.getElementById("loginBtn").onclick = () => {
    const email = document.getElementById("emailInput").value;
    const pass = document.getElementById("passwordInput").value;
    signInWithEmailAndPassword(auth, email, pass)
      .then(() => location.reload())
      .catch(e => alert("Błąd logowania: " + e.message));
  };

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
      await setDoc(doc(window.db, "users", uid), { nick: nick.trim() });
      alert("Rejestracja zakończona. Możesz się zalogować.");
    } catch (e) {
      alert("Błąd rejestracji: " + e.message);
    }
  };

  onAuthStateChanged(auth, async user => {
    if (user) {
      document.getElementById("logoutBtn").addEventListener("click", async () => {
        await signOut(auth);
        location.reload();
      });
  
      const draftRef = doc(window.db, "robocze_turnieje", user.uid);
      const draftSnap = await getDoc(draftRef);
  
      if (draftSnap.exists()) {
        const confirmRestore = confirm(`Znaleziono zapisany turniej w chmurze.\nCzy chcesz go przywrócić?`);
  
        if (confirmRestore) {
          const data = draftSnap.data();
          document.getElementById("restoreSpinner").style.display = "block";
  
          matches.length = 0;
          matches.push(...(data.matches || []));
          Object.keys(stats).forEach(k => delete stats[k]);
          Object.assign(stats, data.stats || {});
          const selected = data.gracze || [];
          allPlayers.forEach(p => {
            p.selected = selected.includes(p.name);
          });
  
          await deleteDoc(draftRef);
  
          const uiMod = await import("./ui.js");
          uiMod.initUI();
  
          matches.forEach(match => {
            if (match.confirmed) {
              window.addResultToResultsTable(match);
            }
          });
  
          document.getElementById("restoreSpinner").style.display = "none";
  
          const toastText = data.matches?.length
            ? `✅ Przywrócono turniej z ${data.matches.length} meczami.`
            : `✅ Przywrócono turniej.`;
          document.getElementById("restoreToastContent").textContent = toastText;
          const toastEl = document.getElementById("restoreToast");
          new bootstrap.Toast(toastEl).show();
  
          setTimeout(() => {
            document.getElementById("matchesTable")?.scrollIntoView({ behavior: "smooth" });
          }, 600);
  
          // ✅ Pokaż UI po przywróceniu
          document.getElementById("authContainer").style.display = "none";
          document.getElementById("viewTabs").style.display = "flex";
          document.getElementById("mainContainer").style.display = "block";
          document.getElementById("userInfoBar").style.display = "flex";
          document.getElementById("loggedInUserEmail").textContent = user.email || "(brak e-maila)";
          document.body.classList.add("logged-in");
  
          if (callback) callback();
          return;
        }
      }
  
      // 🔄 Brak zapisu roboczego – standardowe ładowanie
      const tournamentMod = await import("./tournament.js");
      await tournamentMod.loadDataFromFirebase();
  
      const uiMod = await import("./ui.js");
      uiMod.initUI();
  
      // ✅ Pokaż UI
      document.getElementById("authContainer").style.display = "none";
      document.getElementById("viewTabs").style.display = "flex";
      document.getElementById("mainContainer").style.display = "block";
      document.getElementById("userInfoBar").style.display = "flex";
      document.getElementById("loggedInUserEmail").textContent = user.email || "(brak e-maila)";
      document.body.classList.add("logged-in");
  
      if (callback) callback();
  
    } else {
      // ❌ Użytkownik niezalogowany – pokaż tylko auth
      document.getElementById("authContainer").style.display = "block";
      document.getElementById("userInfoBar").style.display = "none";
      document.getElementById("viewTabs").style.display = "none";
      document.getElementById("mainContainer").style.display = "none";
      document.body.classList.remove("logged-in");
      hideAllMainElements();
    }
  });
  
  
};

function hideAllMainElements() {
  [
    "mainContainer", "viewTabs", "archiveView", "playersList",
    "setupPanel", "generateMatchesBtn", "resetTournamentBtn",
    "rankingView", "tournamentArchive", "userInfoBar", "endTournamentWrapper"
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });

  ["matchesTable", "resultsTable", "statsTable", "generalStatsTable", "eloRankingTable"].forEach(id => {
    const wrapper = document.getElementById(id)?.closest(".table-responsive");
    if (wrapper) wrapper.style.display = "none";
  });

  const nc = document.getElementById("numCourts")?.parentElement;
  if (nc) nc.style.display = "none";
}

function getAuthFn() {
  return auth;
}

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
  getAuthFn // ✅ brakujący eksport
};


