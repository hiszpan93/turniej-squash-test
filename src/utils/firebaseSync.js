// src/utils/firebaseSync.js

import { db, doc, setDoc } from '../firebase.js';
import { auth } from '../firebase.js';

/**
 * Zapisuje dane turnieju (statystyki i listę graczy) do Firestore.
 * @param {Object} generalStats - statystyki ogólne graczy
 * @param {Array} allPlayers - lista wszystkich graczy z polami {id, name, elo, selected}
 * @returns {Promise<void>}
 */
export function saveData(generalStats, allPlayers) {
  return setDoc(doc(db, 'turniej', 'stats'), {
    generalStats,
    allPlayers
  });
}

/**
 * Zapisuje stan roboczy turnieju (draft) do Firestore.
 * @returns {Promise<void>}
 */
export async function saveDraft() {
  const user = auth.currentUser;
  if (!user) return;

  const { matches, allMatches, stats } = window; // globalne zmienne z tournament.js
  const draftData = {
    gracze: allPlayers.filter(p => p.selected).map(p => p.name),
    matches,
    allMatches,
    stats,
    series: getCurrentSeriesNumber(),
    timestamp: new Date().toISOString(),
    turniejTrwa: matches.length > 0,
    tournamentEnded: window.tournamentEnded
  };

  // odświeżenie tokenu przed zapisem
  await user.getIdToken(true);
  return setDoc(doc(db, 'robocze_turnieje', user.uid), draftData);
}
