"use strict";
// UWAGA: to tylko dummy-gate do demo. Na stronie statycznej NIE jest realnym
// zabezpieczeniem (haslo widoczne w zrodle). Sluzy jedynie prezentacji ekranu logowania.
(function () {
  const KEY = "demo-auth";
  const overlay = document.getElementById("loginOverlay");
  const form = document.getElementById("loginForm");
  const err = document.getElementById("loginError");

  function unlock() {
    overlay.style.display = "none";
  }
  if (sessionStorage.getItem(KEY) === "1") unlock();

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    const u = document.getElementById("loginUser").value.trim().toLowerCase();
    const p = document.getElementById("loginPass").value;
    if (u === "artur" && p === "4321") {
      sessionStorage.setItem(KEY, "1");
      err.hidden = true;
      unlock();
    } else {
      err.hidden = false;
    }
  });
})();
