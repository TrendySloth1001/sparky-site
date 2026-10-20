(function () {
  "use strict";
  var root = document.documentElement;

  // Theme toggle: remembered in localStorage (also applied early by an inline script in <head>).
  var btn = document.getElementById("theme-toggle");
  function effective() {
    var t = root.getAttribute("data-theme");
    return t || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }
  function syncMeta() {
    var dark = effective() === "dark";
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) metas[i].setAttribute("content", dark ? "#000000" : "#f4f4f2");
    if (btn) btn.setAttribute("aria-pressed", dark ? "true" : "false");
  }
  if (btn) {
    btn.addEventListener("click", function () {
      var next = effective() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("sparky-theme", next); } catch (e) {}
      syncMeta();
    });
  }
  syncMeta();

  // Header border once scrolled.
  var header = document.querySelector(".site-header");
  function onScroll() { if (header) header.classList.toggle("scrolled", window.scrollY > 8); }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
