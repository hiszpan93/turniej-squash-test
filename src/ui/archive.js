// src/ui/archive.js

import { getAuthFn } from '../../firebase.js';
import { collection, getDocs } from '../../firebase.js';
import { fadeInElement } from './tournamentsNav.js'; // (lub innego modułu, jeśli fade-in jest globalny)

/**
 * Renderuje zakładkę „Archiwum”:
 * - odczytuje z localStorage
 * - jeśli jest user (Firebase), łączy z danymi z kolekcji "archiwa"
 * - buduje widok dla wybranego miesiąca
 */
export function renderArchiveView() {
  document.getElementById("archiveLoading").style.display = "block";
  document.getElementById("tournamentArchive").innerHTML = "";

  const container = document.getElementById("tournamentArchive");
  let archiveData = JSON.parse(localStorage.getItem("turniej_archiwum")) || [];

  const auth = getAuthFn();
  const user = auth.currentUser;

  if (user) {
    getDocs(collection(window.db, "archiwa"))
      .then(snapshot => {
        const firebaseArchives = [];
        snapshot.forEach(doc => {
          firebaseArchives.push(doc.data());
        });
        archiveData = archiveData.concat(firebaseArchives);
        renderAllArchives();
      })
      .catch(err => {
        console.error("Błąd pobierania archiwum z Firebase:", err);
        renderAllArchives();
      });
  } else {
    renderAllArchives();
  }

  function renderAllArchives() {
    if (archiveData.length === 0) {
      container.innerHTML = "<p>Brak zapisanych turniejów.</p>";
      return;
    }

    const grouped = {};
    archiveData.forEach(turniej => {
      const date = new Date(turniej.data);
      const key = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}`;
      grouped[key] = grouped[key] || [];
      grouped[key].push(turniej);
    });

    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, "0")}`;
    const monthList = Object.keys(grouped).sort().reverse();

    const monthSelect = `
      <label for="monthSelect" class="form-label">Wybierz miesiąc:</label>
      <select id="monthSelect" class="form-select form-select-sm mb-3">
        ${monthList.map(m => `<option value="${m}" ${m === currentMonth ? "selected" : ""}>${m}</option>`).join("")}
      </select>
    `;

    container.innerHTML = monthSelect + `<div id="archiveContent"></div>`;

    const renderForMonth = (monthKey) => {
      const data = grouped[monthKey] || [];
      let html = "";

      data.reverse().forEach(turniej => {
        let lp = 1;
        html += `
          <div class="card mb-4">
            <div class="card-header d-flex justify-content-between align-items-center">
              <strong>📅 Turniej ${new Date(turniej.data).toLocaleString()}</strong>
              <span class="badge bg-secondary">${turniej.gracze?.length || 0} graczy</span>
            </div>
            <div class="card-body">
              <p><strong>Gracze:</strong> ${turniej.gracze?.join(", ")}</p>
              <div class="table-responsive" style="max-height: 300px; overflow-y: auto;">
                <table class="table table-sm table-bordered">
                  <thead>
                    <tr>
                      <th>L.p.</th>
                      <th>Seria</th>
                      <th>Runda</th>
                      <th>Gracz 1</th>
                      <th>Gracz 2</th>
                      <th>Wynik</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${(turniej.serie || []).flatMap(seria =>
                      seria.mecze.map(m => `
                        <tr>
                          <td>${lp++}</td>
                          <td>${seria.numer.replace("seria_", "")}</td>
                          <td>${m.runda}</td>
                          <td>${m.gracz1}</td>
                          <td>${m.gracz2}</td>
                          <td>${m.wynik || "-"}</td>
                        </tr>
                      `)
                    ).join("")}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        `;
      });

      document.getElementById("archiveContent").innerHTML = html || "<p>Brak danych.</p>";
      fadeInElement(container);
      document.getElementById("archiveLoading").style.display = "none";
    };

    document.getElementById("monthSelect").addEventListener("change", (e) => {
      renderForMonth(e.target.value);
    });

    renderForMonth(currentMonth);
  }
}

window.renderArchiveView = renderArchiveView;
