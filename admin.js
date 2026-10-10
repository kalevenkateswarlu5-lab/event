import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, deleteDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ============================================================
   1. SETTINGS  – change these to match your project
   ============================================================ */

// Paste the same firebaseConfig you use in script.js
const firebaseConfig = {
  apiKey: "PASTE_YOUR_API_KEY",
  authDomain: "event2026-ad10b.firebaseapp.com",
  projectId: "event2026-ad10b",
  storageBucket: "event2026-ad10b.appspot.com",
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID"
};

const REG_COLLECTION   = "registrations"; // where registration form data is saved
const USER_COLLECTION  = "users";         // where student signup profiles are saved (optional)
const ADMIN_COLLECTION = "admins";        // doc id = admin's Firebase Auth UID
const TOTAL_SEATS      = 200;             // same number as shown on the home page

/* ============================================================
   2. FIREBASE
   ============================================================ */
const app  = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

/* ============================================================
   3. HELPERS
   ============================================================ */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
));

// Field names can differ between forms, so we accept a few common ones.
const pick = (o, ...keys) => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== "") return o[k];
  return "";
};

const toDate = (v) => {
  if (!v) return null;
  if (typeof v.toDate === "function") return v.toDate();
  const d = new Date(v);
  return isNaN(d) ? null : d;
};

const fmtDate = (d) => d
  ? d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
  : "-";

const sameDay = (a, b) => a.toDateString() === b.toDateString();

function toast(msg, type = "dark") {
  const el = document.createElement("div");
  el.className = `alert alert-${type} shadow-sm py-2 px-3 mb-2`;
  el.textContent = msg;
  $("#toastBox").appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function normalizeReg(id, d) {
  return {
    id,
    name:    pick(d, "fullName", "name"),
    regNo:   pick(d, "regNo", "registerNumber", "registerNo", "rollNo") || id,
    email:   pick(d, "email"),
    phone:   pick(d, "phone", "mobile"),
    college: pick(d, "college"),
    dept:    pick(d, "department", "dept"),
    year:    pick(d, "year"),
    track:   pick(d, "track", "event", "events"),
    ticket:  pick(d, "ticketId", "ticket"),
    created: toDate(pick(d, "createdAt", "timestamp", "registeredAt"))
  };
}

function normalizeUser(id, d) {
  return {
    id,
    name:    pick(d, "fullName", "name"),
    email:   pick(d, "email"),
    regNo:   pick(d, "regNo", "registerNumber", "registerNo"),
    created: toDate(pick(d, "createdAt", "timestamp"))
  };
}

/* ============================================================
   4. STATE
   ============================================================ */
let regs = [];
let users = [];
let sortKey = "created";
let sortDir = -1;
let selectedId = null;
let unsubscribers = [];

const detailModal = new bootstrap.Modal("#detailModal");

/* ============================================================
   5. LOGIN / LOGOUT
   ============================================================ */
$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#loginError");
  err.classList.add("d-none");
  const email = $("#adminEmail").value.trim();
  const pass  = $("#adminPass").value;
  if (!email || !pass) {
    err.textContent = "Enter your email and password.";
    err.classList.remove("d-none");
    return;
  }
  $("#loginBtn").disabled = true;
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (ex) {
    err.textContent = "Wrong email or password.";
    err.classList.remove("d-none");
  } finally {
    $("#loginBtn").disabled = false;
  }
});

$("#logoutBtn").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  stopListening();
  if (!user) {
    $("#appView").classList.add("d-none");
    $("#loginView").classList.remove("d-none");
    return;
  }
  // Only users that have a document in /admins/<uid> can enter.
  let isAdmin = false;
  try {
    isAdmin = (await getDoc(doc(db, ADMIN_COLLECTION, user.uid))).exists();
  } catch (ex) { isAdmin = false; }

  if (!isAdmin) {
    await signOut(auth);
    const err = $("#loginError");
    err.textContent = "This account is not an admin.";
    err.classList.remove("d-none");
    return;
  }
  $("#adminWho").textContent = user.email;
  $("#loginView").classList.add("d-none");
  $("#appView").classList.remove("d-none");
  startListening();
});

/* ============================================================
   6. LIVE DATA
   ============================================================ */
function startListening() {
  unsubscribers.push(onSnapshot(collection(db, REG_COLLECTION), (snap) => {
    regs = snap.docs.map((d) => normalizeReg(d.id, d.data()));
    fillFilters();
    render();
  }, (e) => toast("Cannot read registrations: " + e.code, "danger")));

  unsubscribers.push(onSnapshot(collection(db, USER_COLLECTION), (snap) => {
    users = snap.docs.map((d) => normalizeUser(d.id, d.data()));
    renderUsers();
    $("#stStudents").textContent = users.length;
    $("#tabUserCount").textContent = `(${users.length})`;
  }, () => { users = []; renderUsers(); }));
}

function stopListening() {
  unsubscribers.forEach((u) => u());
  unsubscribers = [];
  regs = []; users = [];
}

/* ============================================================
   7. RENDER
   ============================================================ */
function countBy(list, key) {
  const m = new Map();
  list.forEach((r) => {
    const k = r[key] || "Not given";
    m.set(k, (m.get(k) || 0) + 1);
  });
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function drawBars(target, entries) {
  const max = Math.max(1, ...entries.map((e) => e[1]));
  target.innerHTML = entries.length
    ? entries.map(([name, n]) => `
        <div class="bar-row">
          <span class="name" title="${esc(name)}">${esc(name)}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${(n / max) * 100}%"></div></div>
          <span class="cnt">${n}</span>
        </div>`).join("")
    : '<p class="text-muted small mb-0">No data yet.</p>';
}

function fillSelect(sel, values) {
  const cur = sel.value;
  const first = sel.options[0].outerHTML;
  sel.innerHTML = first + values.map((v) => `<option>${esc(v)}</option>`).join("");
  if (values.includes(cur)) sel.value = cur;
}

function fillFilters() {
  const uniq = (k) => [...new Set(regs.map((r) => r[k]).filter(Boolean))].sort();
  fillSelect($("#fTrack"), uniq("track"));
  fillSelect($("#fDept"), uniq("dept"));
  fillSelect($("#fYear"), uniq("year"));
}

function filtered() {
  const q = $("#q").value.trim().toLowerCase();
  const t = $("#fTrack").value, d = $("#fDept").value, y = $("#fYear").value;
  let list = regs.filter((r) =>
    (!t || r.track === t) && (!d || r.dept === d) && (!y || r.year === y) &&
    (!q || [r.name, r.regNo, r.email, r.phone, r.college, r.ticket].join(" ").toLowerCase().includes(q))
  );
  list.sort((a, b) => {
    let x = a[sortKey], z = b[sortKey];
    if (sortKey === "created") { x = x ? x.getTime() : 0; z = z ? z.getTime() : 0; }
    else { x = String(x).toLowerCase(); z = String(z).toLowerCase(); }
    return x < z ? -sortDir : x > z ? sortDir : 0;
  });
  return list;
}

function render() {
  // stats
  const now = new Date();
  $("#stTotal").textContent = regs.length;
  $("#stSeats").textContent = Math.max(0, TOTAL_SEATS - regs.length);
  $("#stToday").textContent = regs.filter((r) => r.created && sameDay(r.created, now)).length;
  $("#tabRegCount").textContent = `(${regs.length})`;

  drawBars($("#chTrack"), countBy(regs, "track"));
  drawBars($("#chDept"), countBy(regs, "dept"));
  drawBars($("#chYear"), countBy(regs, "year"));

  // table
  const list = filtered();
  $("#regBody").innerHTML = list.map((r, i) => `
    <tr>
      <td class="text-muted">${i + 1}</td>
      <td><strong>${esc(r.name)}</strong><div class="text-muted small">${esc(r.email)}</div></td>
      <td>${esc(r.regNo)}</td>
      <td>${esc(r.dept)}${r.year ? " / " + esc(r.year) : ""}</td>
      <td><span class="pill">${esc(r.track || "-")}</span></td>
      <td class="text-nowrap">${fmtDate(r.created)}</td>
      <td class="text-end text-nowrap">
        <button class="icon-btn" data-view="${esc(r.id)}" aria-label="View ${esc(r.name)}"><i class="bi bi-eye"></i></button>
        <button class="icon-btn del" data-del="${esc(r.id)}" aria-label="Delete ${esc(r.name)}"><i class="bi bi-trash"></i></button>
      </td>
    </tr>`).join("");
  $("#regEmpty").classList.toggle("d-none", list.length > 0);
  $("#regCount").textContent = list.length === regs.length
    ? `${regs.length} registrations`
    : `Showing ${list.length} of ${regs.length}`;
}

function renderUsers() {
  const q = $("#qUsers").value.trim().toLowerCase();
  const list = users.filter((u) => !q || [u.name, u.email, u.regNo].join(" ").toLowerCase().includes(q));
  $("#userBody").innerHTML = list.map((u, i) => `
    <tr>
      <td class="text-muted">${i + 1}</td>
      <td>${esc(u.name || "-")}</td>
      <td>${esc(u.email)}</td>
      <td>${esc(u.regNo || "-")}</td>
      <td class="text-nowrap">${fmtDate(u.created)}</td>
    </tr>`).join("");
  $("#userEmpty").classList.toggle("d-none", list.length > 0);
}

/* ============================================================
   8. ACTIONS
   ============================================================ */
function openDetail(id) {
  const r = regs.find((x) => x.id === id);
  if (!r) return;
  selectedId = id;
  const rows = [
    ["Ticket ID", r.ticket], ["Name", r.name], ["Register number", r.regNo],
    ["Email", r.email], ["Phone", r.phone], ["College", r.college],
    ["Department", r.dept], ["Year", r.year], ["Track", r.track],
    ["Registered on", fmtDate(r.created)]
  ];
  $("#detailBody").innerHTML = rows
    .map(([k, v]) => `<div class="detail-row"><span>${k}</span><strong>${esc(v || "-")}</strong></div>`)
    .join("");
  detailModal.show();
}

async function removeReg(id) {
  const r = regs.find((x) => x.id === id);
  if (!r) return;
  if (!confirm(`Delete the registration of ${r.name || r.regNo}? This frees the register number and cannot be undone.`)) return;
  try {
    await deleteDoc(doc(db, REG_COLLECTION, id));
    toast("Registration deleted", "success");
  } catch (ex) {
    toast("Delete failed: " + ex.code, "danger");
  }
}

function exportCsv() {
  const list = filtered();
  if (!list.length) { toast("Nothing to export", "warning"); return; }
  const head = ["Ticket ID", "Name", "Register number", "Email", "Phone", "College", "Department", "Year", "Track", "Registered on"];
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [head.map(cell).join(",")].concat(
    list.map((r) => [r.ticket, r.name, r.regNo, r.email, r.phone, r.college, r.dept, r.year, r.track, fmtDate(r.created)].map(cell).join(","))
  );
  const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `campus-fest-registrations-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ============================================================
   9. EVENTS
   ============================================================ */
["#q", "#fTrack", "#fDept", "#fYear"].forEach((s) => $(s).addEventListener("input", render));
$("#qUsers").addEventListener("input", renderUsers);

$("#regBody").addEventListener("click", (e) => {
  const v = e.target.closest("[data-view]");
  const d = e.target.closest("[data-del]");
  if (v) openDetail(v.dataset.view);
  if (d) removeReg(d.dataset.del);
});

$("#detailDelete").addEventListener("click", async () => {
  detailModal.hide();
  if (selectedId) await removeReg(selectedId);
});

$$("th[data-sort]").forEach((th) => th.addEventListener("click", () => {
  const k = th.dataset.sort;
  sortDir = sortKey === k ? -sortDir : 1;
  sortKey = k;
  render();
}));

$$(".nav-tabs-admin .nav-link").forEach((b) => b.addEventListener("click", () => {
  $$(".nav-tabs-admin .nav-link").forEach((x) => x.classList.toggle("active", x === b));
  $("#tab-regs").classList.toggle("d-none", b.dataset.tab !== "regs");
  $("#tab-users").classList.toggle("d-none", b.dataset.tab !== "users");
}));

$("#csvBtn").addEventListener("click", exportCsv);
$("#printBtn").addEventListener("click", () => window.print());
