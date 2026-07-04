const API = "http://localhost:5004";

/* ── PASSWORD VALIDATION ────────────────────────────────────── */
function validatePassword(password) {
  const errors = [];
  if (password.length < 8)
    errors.push("Password must be at least 8 characters");
  if (!/^[A-Z]/.test(password))
    errors.push("Password must start with a capital letter");
  if (!/[0-9]/.test(password))
    errors.push("Password must contain at least one number");
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password))
    errors.push("Password must contain at least one special symbol (!@#$%^&* etc.)");
  return errors;
}

/* ── REGISTER ───────────────────────────────────────────────── */
async function register(e) {
  e && e.preventDefault();
  const name     = document.getElementById("name")?.value.trim();
  const email    = document.getElementById("email")?.value.trim();
  const password = document.getElementById("password")?.value;
  const confirm  = document.getElementById("confirmPassword")?.value;

  if (!name || !email || !password) return showMsg("All fields required", "error");
  if (confirm !== undefined && password !== confirm) return showMsg("Passwords don't match", "error");

  const pwErrors = validatePassword(password);
  if (pwErrors.length > 0) return showMsg(pwErrors[0], "error");

  try {
    const res  = await fetch(API + "/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password })
    });
    const data = await res.json();
    if (data.error) return showMsg(data.error, "error");
    showMsg(data.message, "success");
    setTimeout(() => window.location.href = "login.html", 1200);
  } catch (err) { showMsg("Cannot connect to server. Is it running?", "error"); }
}

/* ── LOGIN ──────────────────────────────────────────────────── */
async function login(e) {
  e && e.preventDefault();
  const email    = document.getElementById("email")?.value.trim();
  const password = document.getElementById("password")?.value;

  if (!email || !password) return showMsg("Email and password required", "error");

  const pwErrors = validatePassword(password);
  if (pwErrors.length > 0) return showMsg(pwErrors[0], "error");

  try {
    const res  = await fetch(API + "/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (data.error) return showMsg(data.error, "error");

    localStorage.setItem("userId",    data.userId);
    localStorage.setItem("userName",  data.name);
    localStorage.setItem("userEmail", data.email);
    localStorage.setItem("name",      data.name);

    showMsg("Login successful!", "success");
    setTimeout(() => window.location.href = "dashboard.html", 800);
  } catch (err) { showMsg("Cannot connect to server. Is it running?", "error"); }
}

/* ── TOGGLE PASSWORD VISIBILITY ─────────────────────────────── */
function togglePassword(inputId, iconEl) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === "password") {
    input.type = "text";
    iconEl.classList.remove("bx-hide");
    iconEl.classList.add("bx-show");
  } else {
    input.type = "password";
    iconEl.classList.remove("bx-show");
    iconEl.classList.add("bx-hide");
  }
}

/* ── LOGOUT ─────────────────────────────────────────────────── */
function logout() {
  localStorage.clear();
  window.location.href = "login.html";
}

/* ── AUTH GUARD ─────────────────────────────────────────────── */
function requireAuth() {
  if (!localStorage.getItem("userId")) {
    window.location.href = "login.html";
  }
}

/* ── TOAST MESSAGE ──────────────────────────────────────────── */
function showMsg(msg, type = "info") {
  let toast = document.getElementById("__toast__");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "__toast__";
    toast.style.cssText = `
      position:fixed;top:20px;right:20px;z-index:9999;
      padding:14px 24px;border-radius:12px;font-family:Poppins,sans-serif;
      font-size:14px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.15);
      transition:opacity .4s;max-width:320px;
    `;
    document.body.appendChild(toast);
  }
  const colours = {
    success: { bg: "#ecfdf5", color: "#065f46", border: "#6ee7b7" },
    error:   { bg: "#fef2f2", color: "#991b1b", border: "#fca5a5" },
    info:    { bg: "#eff6ff", color: "#1e40af", border: "#93c5fd" }
  };
  const c = colours[type] || colours.info;
  toast.style.background   = c.bg;
  toast.style.color        = c.color;
  toast.style.border       = `2px solid ${c.border}`;
  toast.style.opacity      = "1";
  toast.textContent        = msg;

  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toast.style.opacity = "0"; }, 3500);
}
