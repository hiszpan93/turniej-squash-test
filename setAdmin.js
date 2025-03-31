// setAdmin.js
const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json"); // <-- plik z kluczem

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const uid = "2Zfl4ytHdMQd5ZnP6gtTtAaP7vT2"; // <-- wklej swój UID

admin.auth().setCustomUserClaims(uid, { admin: true })
  .then(() => {
    console.log(`Użytkownik ${uid} ma teraz rolę admina ✅`);
    process.exit();
  })
  .catch(error => {
    console.error("Błąd:", error);
    process.exit(1);
  });
