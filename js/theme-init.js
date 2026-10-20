/* Apply the remembered theme before first paint (no flash). */
try { var t = localStorage.getItem("sparky-theme"); if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t); } catch (e) {}
