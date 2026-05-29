import { OUTRIGHTS_EDIT_DEADLINE } from "./store.js";

export function $(id) {
  return document.getElementById(id);
}

export function showError(el, message) {
  if (!message) {
    el.textContent = "";
    el.classList.add("hidden");
    return;
  }
  el.textContent = message;
  el.classList.remove("hidden");
}

export function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function canEditOutrights() {
  return Date.now() <= OUTRIGHTS_EDIT_DEADLINE.getTime();
}

export function formatDeadline() {
  return OUTRIGHTS_EDIT_DEADLINE.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
