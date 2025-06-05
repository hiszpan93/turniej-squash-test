// src/ui/matches.js

import { matches, allMatches } from '../tournament.js';
import { confirmMatch } from '../tournament.js';

/**
 * Renderuje tabelę meczów:
 * - tworzy wiersze dla każdej pary w `matches`
 * - dodaje listener do przycisków „Potwierdź” wywołujący `confirmMatch(index)`
 */
export function renderMatches() {
  const matchesTable = document.getElementById("matchesTable");
  let tableHTML = `
    <thead>
      <tr>
        <th>Mecz</th>
        <th>Gracze</th>
        <th>Kort</th>
        <th>Status</th>
        <th>Akcja</th>
      </tr>
    </thead>
    <tbody>
  `;

  matches.forEach((match, index) => {
    const status = match.confirmed ? "✅" : "⏳";
    const actionBtn = match.confirmed
      ? `<span class="badge bg-success">Zatwierdzony</span>`
      : `<button class="btn btn-sm btn-outline-primary score-row-toggle" onclick="toggleScoreRow(${index})">➕ Pokaż</button>`;

    tableHTML += `
      <tr class="${match.confirmed ? 'confirmed' : ''}">
        <td>${index + 1} (seria ${match.series || 1}, runda ${match.round || 1})</td>
        <td>${match.player1} vs ${match.player2}</td>
        <td>${match.court}</td>
        <td>${status}</td>
        <td>${actionBtn}</td>
      </tr>
      <tr id="scoreRow-${index}" class="score-row" style="display: none;">
        <td colspan="5">
          <div class="card p-3">
            <div class="text-center mb-2 fade-in">
              <strong>${match.player1}</strong> vs <strong>${match.player2}</strong>
            </div>
            <div class="d-flex justify-content-between align-items-center gap-2">
              <div class="w-50 text-center">
                <div class="player-label mb-1">${match.player1}</div>
                <input type="number" id="score1-${index}" class="score-input-tile" min="0" />
              </div>
              <div class="px-2">:</div>
              <div class="w-50 text-center">
                <div class="player-label mb-1">${match.player2}</div>
                <input type="number" id="score2-${index}" class="score-input-tile" min="0" />
              </div>
            </div>
            <button id="confirmButton-${index}" class="btn btn-success mt-3 w-100">Potwierdź</button>
          </div>
        </td>
      </tr>
    `;
  });

  tableHTML += "</tbody>";
  matchesTable.innerHTML = tableHTML;
  fadeInElement(matchesTable);

  matches.forEach((_, index) => {
    const btn = document.getElementById(`confirmButton-${index}`);
    if (btn) {
      btn.addEventListener("click", () => confirmMatch(index));
    }
  });
}

