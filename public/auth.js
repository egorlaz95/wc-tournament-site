import { state, SESSION_KEY, saveState, emptyOutrights } from "./store.js";
import { $, showError } from "./utils.js";

export function getSessionUserId() {
  return sessionStorage.getItem(SESSION_KEY);
}

export function setSessionUserId(id) {
  if (id) sessionStorage.setItem(SESSION_KEY, id);
  else sessionStorage.removeItem(SESSION_KEY);
}

export function findUserByNickname(nickname) {
  const n = nickname.trim().toLowerCase();
  return state.users.find((u) => u.nickname.toLowerCase() === n);
}

export function getUserById(id) {
  return state.users.find((u) => u.id === id);
}

export function setupAuth(onRoute) {
  const tabs = document.querySelectorAll(".auth-tab");
  const registerForm = $("register-form");
  const loginForm = $("login-form");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const isRegister = tab.dataset.tab === "register";
      tabs.forEach((t) => t.classList.toggle("auth-tab--active", t === tab));
      registerForm.classList.toggle("hidden", !isRegister);
      loginForm.classList.toggle("hidden", isRegister);
      showError($("register-error"), "");
      showError($("login-error"), "");
    });
  });

  registerForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const errEl = $("register-error");

    const nickname = $("reg-nickname").value.trim();
    const password = $("reg-password").value;
    const passwordConfirm = $("reg-password-confirm").value;

    if (password !== passwordConfirm) {
      showError(errEl, "Пароли не совпадают.");
      return;
    }

    if (findUserByNickname(nickname)) {
      showError(errEl, "Такой никнейм уже занят.");
      return;
    }

    const user = {
      id: crypto.randomUUID(),
      nickname,
      password,
      passport: {
        fullName: $("reg-fullname").value.trim(),
        number: $("reg-passport-number").value.trim(),
        issuedBy: $("reg-passport-issued").value.trim(),
        issueDate: $("reg-passport-date").value,
      },
      outrights: emptyOutrights(),
      matches: {},
      onboardingComplete: false,
      createdAt: Date.now(),
    };

    state.users.push(user);
    saveState();
    setSessionUserId(user.id);
    registerForm.reset();
    showError(errEl, "");
    onRoute();
  });

  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const errEl = $("login-error");
    const nickname = $("login-nickname").value.trim();
    const password = $("login-password").value;

    const user = findUserByNickname(nickname);
    if (!user || user.password !== password) {
      showError(errEl, "Неверный никнейм или пароль.");
      return;
    }

    setSessionUserId(user.id);
    loginForm.reset();
    showError(errEl, "");
    onRoute();
  });

  $("logout-btn").addEventListener("click", () => {
    setSessionUserId(null);
    onRoute();
  });
}
