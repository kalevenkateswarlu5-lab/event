import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ============================================================
   1. CONFIG  (change the event details here)
   ============================================================ */
const firebaseConfig = {
  apiKey: "AIzaSyCTH9UWy3IHwOLHKRk73TmAomyErGBLyDA",
  authDomain: "event2026-ad10b.firebaseapp.com",
  projectId: "event2026-ad10b",
  storageBucket: "event2026-ad10b.firebasestorage.app",
  messagingSenderId: "123665439217",
  appId: "1:123665439217:web:073ec7e82f06feaf5a8c50",
  measurementId: "G-S1RC3FDGBD"
};

// Event start time (IST, +05:30). Format: YYYY-MM-DDTHH:mm:ss+05:30
const EVENT_DATE = new Date("2026-11-28T09:30:00+05:30");
const REG_COLLECTION = "registrations";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* ============================================================
   2. COUNTDOWN
   ============================================================ */
const cd = {
  days: document.getElementById("cdDays"),
  hours: document.getElementById("cdHours"),
  mins: document.getElementById("cdMins"),
  secs: document.getElementById("cdSecs")
};
const cdMessage = document.getElementById("cdMessage");
const pad = (n) => String(n).padStart(2, "0");

function setNum(el, value) {
  if (el.textContent !== value) {
    el.textContent = value;
    el.classList.remove("tick");
    void el.offsetWidth; // restart animation
    el.classList.add("tick");
  }
}

function updateCountdown() {
  const diff = EVENT_DATE - new Date();

  if (diff <= 0) {
    Object.values(cd).forEach((el) => (el.textContent = "00"));
    cdMessage.textContent = "The event has started. See you there!";
    return false;
  }

  const s = Math.floor(diff / 1000);
  setNum(cd.days, pad(Math.floor(s / 86400)));
  setNum(cd.hours, pad(Math.floor((s % 86400) / 3600)));
  setNum(cd.mins, pad(Math.floor((s % 3600) / 60)));
  setNum(cd.secs, pad(s % 60));

  cdMessage.textContent = diff < 7 * 86400 * 1000 ? "Less than a week left. Register now." : "";
  return true;
}

updateCountdown();
const cdTimer = setInterval(() => {
  if (!updateCountdown()) clearInterval(cdTimer);
}, 1000);

/* ============================================================
   3. NAVBAR + SCROLL REVEAL
   ============================================================ */
const nav = document.getElementById("nav");
const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 40);
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add("visible");
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });
document.querySelectorAll(".reveal").forEach((el) => revealObserver.observe(el));

// Close mobile menu after clicking a link
document.querySelectorAll("#navMenu a").forEach((a) =>
  a.addEventListener("click", () => {
    const menu = document.getElementById("navMenu");
    if (menu.classList.contains("show")) bootstrap.Collapse.getOrCreateInstance(menu).hide();
  })
);

/* ============================================================
   4. REGISTRATION FORM
   ============================================================ */
const form = document.getElementById("regForm");
const confirmation = document.getElementById("confirmation");
const submitBtn = document.getElementById("submitBtn");
const btnText = submitBtn.querySelector(".btn-text");
const spinner = submitBtn.querySelector(".spinner-border");
const formError = document.getElementById("formError");
const regNoInput = document.getElementById("regNo");
const regNoFeedback = document.getElementById("regNoFeedback");
const REGNO_DEFAULT_MSG = regNoFeedback.textContent;

const $ = (id) => document.getElementById(id);

// Clean the register number: uppercase, no spaces
function normalizeRegNo(value) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}
// Firestore document IDs cannot contain "/", so swap it for "-"
const regNoToDocId = (regNo) => regNo.replace(/\//g, "-");

regNoInput.addEventListener("input", () => {
  regNoInput.value = regNoInput.value.toUpperCase().replace(/\s+/g, "");
  regNoInput.setCustomValidity("");
  regNoFeedback.textContent = REGNO_DEFAULT_MSG;
});

function setLoading(loading) {
  submitBtn.disabled = loading;
  spinner.classList.toggle("d-none", !loading);
  btnText.textContent = loading ? "Registering..." : "Complete registration";
}

function showError(message) {
  formError.textContent = message;
  formError.classList.remove("d-none");
}

function markDuplicate() {
  regNoInput.setCustomValidity("duplicate");
  regNoFeedback.textContent = "This register number is already registered. Each register number can register only once.";
  form.classList.add("was-validated");
  regNoInput.focus();
  form.classList.remove("shake");
  void form.offsetWidth;
  form.classList.add("shake");
}

class DuplicateError extends Error {}

async function saveRegistration(data) {
  const ref = doc(db, REG_COLLECTION, regNoToDocId(data.regNo));

  // The transaction makes sure two people cannot grab the same register number at the same time.
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists()) throw new DuplicateError();
    tx.set(ref, { ...data, createdAt: serverTimestamp() });
  });
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  formError.classList.add("d-none");
  regNoInput.setCustomValidity("");

  if (!form.checkValidity()) {
    form.classList.add("was-validated");
    form.classList.remove("shake");
    void form.offsetWidth;
    form.classList.add("shake");
    return;
  }

  if (new Date() >= EVENT_DATE) {
    showError("Registration is closed because the event has already started.");
    return;
  }

  const data = {
    name: $("fullName").value.trim(),
    regNo: normalizeRegNo(regNoInput.value),
    email: $("email").value.trim().toLowerCase(),
    phone: $("phone").value.trim(),
    college: $("college").value.trim(),
    department: $("department").value,
    year: $("year").value,
    track: $("track").value,
    ticketId: "CF26-" + Math.random().toString(36).slice(2, 8).toUpperCase()
  };

  setLoading(true);
  try {
    await saveRegistration(data);
    showConfirmation(data);
  } catch (err) {
    console.error(err);
    if (err instanceof DuplicateError) {
      markDuplicate();
    } else if (err.code === "permission-denied") {
      // With the recommended Firestore rules, a write to an existing register number is also rejected.
      markDuplicate();
    } else if (err.code === "unavailable") {
      showError("No internet connection. Check your network and try again.");
    } else {
      showError("Registration failed. Please try again in a moment.");
    }
  } finally {
    setLoading(false);
  }
});

function showConfirmation(d) {
  $("cTicket").textContent = d.ticketId;
  $("cName").textContent = d.name;
  $("cRegNo").textContent = d.regNo;
  $("cEmail").textContent = d.email;
  $("cPhone").textContent = d.phone;
  $("cCollege").textContent = d.college;
  $("cDeptYear").textContent = `${d.department}, ${d.year}`;
  $("cTrack").textContent = d.track;

  form.classList.add("d-none");
  confirmation.classList.remove("d-none");
  confirmation.scrollIntoView({ behavior: "smooth", block: "center" });
}

$("newBtn").addEventListener("click", () => {
  form.reset();
  form.classList.remove("was-validated");
  confirmation.classList.add("d-none");
  form.classList.remove("d-none");
  form.scrollIntoView({ behavior: "smooth", block: "start" });
});

$("printBtn").addEventListener("click", () => window.print());
