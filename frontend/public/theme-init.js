try {
  const stored = localStorage.getItem("bnm_theme");
  const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
  const theme =
    stored === "light" || stored === "dark"
      ? stored
      : prefersLight
        ? "light"
        : "dark";
  if (theme === "dark") document.documentElement.classList.add("dark");
  document.documentElement.style.colorScheme = theme;
} catch {
  // Storage can be unavailable in privacy modes; the stylesheet default is safe.
}