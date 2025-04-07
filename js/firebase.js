// js/firebase.js
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
  getDoc
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

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
window.db = getFirestore(app);
const auth = getAuth(app);

window.firebaseAuthReady = (callback) => {
  const loginBtn = document.getElementById("loginBtn");
  const registerBtn = document.getElementById("registerBtn");

  loginBtn.onclick = () => {
    const email = document.getElementById("emailInput").value;
    const pass = document.getElementById("passwordInput").value;
    signInWithEmailAndPassword(auth, email, pass)
      .then(() => location.reload())
      .catch(e => alert("Błąd logowania: " + e.message));
  };

  registerBtn.onclick = async () => {
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
      document.getElementById("authContainer").style.display = "none";
      document.getElementById("viewTabs").style.display = "flex";
      
      document.getElementById("mainContainer").style.display = "block";
      

      // Obsługa zakładek
      document.getElementById("showTournamentBtn").onclick = () => {
        const main = document.getElementById("mainContainer");
        main.style.display = "block";
        fadeInElement(main);
      
        const archive = document.getElementById("archiveView");
        archive.style.display = "none";
      
        document.getElementById("showTournamentBtn").classList.add("btn-primary");
        document.getElementById("showTournamentBtn").classList.remove("btn-outline-primary");
        document.getElementById("showArchiveBtn").classList.remove("btn-primary");
        document.getElementById("showArchiveBtn").classList.add("btn-outline-secondary");
      };
      
      document.getElementById("showArchiveBtn").onclick = () => {
        document.getElementById("mainContainer").style.display = "none";
        const archive = document.getElementById("archiveView");
        archive.style.display = "block";
        fadeInElement(archive);
      
        document.getElementById("showArchiveBtn").classList.add("btn-primary");
        document.getElementById("showArchiveBtn").classList.remove("btn-outline-secondary");
        document.getElementById("showTournamentBtn").classList.remove("btn-primary");
        document.getElementById("showTournamentBtn").classList.add("btn-outline-primary");
      
        if (window.renderArchiveView) window.renderArchiveView();
      };
      
      const docRef = doc(window.db, "users", user.uid);
      const docSnap = await getDoc(docRef);
      const nick = docSnap.exists() ? docSnap.data().nick : "(nieznany)";

      const infoBox = document.createElement("div");
      infoBox.id = "userInfoBox";
      infoBox.className = "alert alert-info mt-3";
      infoBox.innerHTML = `
        Zalogowano jako: <strong>${nick}</strong> (${user.email})
        <button id="logoutBtn" class="btn btn-sm btn-danger float-end">Wyloguj</button>
      `;
      document.body.prepend(infoBox);

      document.getElementById("logoutBtn").onclick = () => {
        signOut(auth).then(() => {
          const infoBox = document.getElementById("userInfoBox");
          if (infoBox) infoBox.remove();
          document.getElementById("authContainer").style.display = "block";
          hideAllMainElements();
          localStorage.clear();
          
        });
      };

      if (callback) callback();
    } else {
      document.getElementById("authContainer").style.display = "block";
hideAllMainElements();

    }
  });
};function hideAllMainElements() {
  [
    "mainContainer", "viewTabs", "archiveView", "playersList",
    "setupPanel", "generateMatchesBtn", "endTournamentBtn",
    "resetTournamentBtn"
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });

  ["matchesTable", "resultsTable", "statsTable", "generalStatsTable"].forEach(id => {
    const wrapper = document.getElementById(id)?.closest(".table-responsive");
    if (wrapper) wrapper.style.display = "none";
  });

  const nc = document.getElementById("numCourts")?.parentElement;
  if (nc) nc.style.display = "none";
}
