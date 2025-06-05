import { allPlayers } from '../tournament.js';
import { collection, getDocs, getDoc, doc, setDoc, deleteDoc } from '../../firebase.js';


async function calculatePayout(players) {
  // ── 1. Stałe i pobranie danych z formularza ────────────────────────────
  const COST_PER_HOUR      = 44;
  const MIN_PRICE_PER_HOUR = 14;
  const MAX_DISCOUNT_HOUR  = COST_PER_HOUR - MIN_PRICE_PER_HOUR; // = 30

  const numCourts = +document.getElementById("num-courts").value;
  const hours     = +document.getElementById("court-hours").value;
  const normalCnt = +document.getElementById("ms-normal").value;
  const lightCnt  = +document.getElementById("ms-light").value;
  const payerId   = parseInt(document.getElementById("payer-select").value, 10);
if (window.payoutsCalculated) {
  alert("Podział kosztów już został obliczony dla tego turnieju.");
  return;
}
  // ── 2. Lista uczestników i walidacja kart ──────────────────────────────
  const participants = players.filter(p => p.selected);
  const maxCards     = participants.length;
  if (normalCnt + lightCnt > maxCards) {
    alert(`Maksymalnie ${maxCards} kart MS (tylu jest graczy).`);
    return;
  }

  // ── 3. Obliczenie kosztu kortów + rabatów ──────────────────────────────
  const baseCost       = numCourts * hours * COST_PER_HOUR;
  const discountNormal = normalCnt * hours * 15;
  let remainingLight   = lightCnt;
  let discountLight    = 0;
  for (let h = 1; h <= hours; h++) {
    const use = Math.min(remainingLight, numCourts);
    discountLight += use * 15;
    remainingLight -= use;
    if (!remainingLight) break;
  }
  const rawDiscount   = discountNormal + discountLight;
  const capDiscount   = numCourts * hours * MAX_DISCOUNT_HOUR;
  const totalDiscount = Math.min(rawDiscount, capDiscount);
  const courtCost     = baseCost - totalDiscount;

  // ── 4. Podział kosztów na uczestników (bez płatnika) ──────────────────
  const debt   = new Map(participants.map(p => [p.id, 0]));
  const shareCourt = courtCost / participants.length;
  const sharers = participants.filter(p => p.id !== payerId);
  sharers.forEach(p => debt.set(p.id, shareCourt));

  // ── 5. Zapis do Firestore ───────────────────────────────────────────────
  const payoutsPath = doc(db, "turniej", "stats");
  const payoutsCol  = collection(payoutsPath, "rozliczenia");
  // 5. Zapis i akumulacja długu
 for (const p of sharers) {
  const payoutDoc = doc(payoutsCol, p.id.toString());
   // 1) pobierz dotychczasowy dług (jeśli istnieje)
   const snap    = await getDoc(payoutDoc);
   const oldDebt = snap.exists() ? snap.data().debt : 0;
   // 2) dodaj nową część długi z bieżącego turnieju
   const newDebt = oldDebt + (debt.get(p.id) || 0);
   // 3) zapisz z merge, żeby nie nadpisywać ewentualnych innych pól
   await setDoc(payoutDoc, { debt: newDebt }, { merge: true });
 }

  // ── 6. Ustawienie labelki „Wierzyciel” ─────────────────────────────────
  const payerName      = players.find(p => p.id === payerId)?.name || "";
  document.getElementById("creditor-label")
          .textContent = `Wierzyciel: ${payerName}`;
const caption = document.getElementById("payout-caption");
caption.textContent = `Wierzyciel: ${payerName}`;

  // ── 7. Renderowanie tabeli ──────────────────────────────────────────────
  const tbody = document.querySelector("#payout-table tbody");
  tbody.innerHTML = ""; // usuń stare wiersze

  sharers.forEach(p => {
    const amount = (debt.get(p.id) || 0).toFixed(2);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.name}</td>
      <td>${amount} zł</td>
      <td>
        <button class="btn btn-sm btn-outline-success settle-btn">
          Rozliczono
        </button>
      </td>`;

    // listener usuwający dług po kliknięciu
    tr.querySelector(".settle-btn").addEventListener("click", async () => {
      await deleteDoc(doc(payoutsCol, p.id.toString()));
      tr.remove();
    });
    tbody.appendChild(tr);
  });
  window.payoutsCalculated = true;
document.getElementById("calc-btn").disabled = true;

}
async function loadPayouts(players) {
  const tbody = document.querySelector("#payout-table tbody");
  tbody.innerHTML = "";

  // referencja do subkolekcji
  const payoutsPath = doc(db, "turniej", "stats");
  const payoutsCol  = collection(payoutsPath, "rozliczenia");
  
  try {
    const snapshot = await getDocs(payoutsCol);
    snapshot.forEach(docSnap => {
  const pId   = docSnap.id;
  const data  = docSnap.data();
  const player = players.find(p => p.id.toString() === pId);
  if (!player) return;

  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>${player.name}</td>
    <td>${(data.debt || 0).toFixed(2)} zł</td>
    <td>
      <button class="btn btn-sm btn-outline-success settle-btn">
        Rozliczono
      </button>
    </td>`;

  tr.querySelector(".settle-btn").addEventListener("click", async () => {
    await deleteDoc(doc(payoutsCol, pId));
    tr.remove();
  });

  tbody.appendChild(tr);
});

  } catch (err) {
    console.error("Błąd odczytu rozliczeń:", err);
  }
}
export { calculatePayout, loadPayouts };
