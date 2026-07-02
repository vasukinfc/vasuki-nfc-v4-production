import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, get, update, remove, push, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAxb4ysHVCb1U9J5W8BsbVd6uTphc7gxpk",
  authDomain: "vasuki-nfc-291d3.firebaseapp.com",
  databaseURL: "https://vasuki-nfc-291d3-default-rtdb.firebaseio.com",
  projectId: "vasuki-nfc-291d3",
  storageBucket: "vasuki-nfc-291d3.firebasestorage.app",
  messagingSenderId: "992194724286",
  appId: "1:992194724286:web:c5300049764fdb553c79ef"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
export { db, ref, set, get, update, remove, push, runTransaction };
