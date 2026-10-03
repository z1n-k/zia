// Zia: built from src/js by scripts/build.sh. Edit the parts in src/js, not this file.
(() => {
  if (window.__ziaLoaded) {
    return;
  }
  window.__ziaLoaded = true;

  const root = document.documentElement;

  // Errors Zia can carry on past (a pref that isn't set, a tab that's gone)
  // are logged once per place at debug level instead of vanishing: visible in
  // the Browser Console, but not noisy.
  const notedErrors = new Set();
  function noteError(where, err) {
    if (notedErrors.has(where)) {
      return;
    }
    notedErrors.add(where);
    console.debug(`[Zia] ${where}:`, err);
  }

  // Spaces switching: Zen marks it on the toolbar (1.23) or, before, the
  // window. watchSpacesSwitching(callback) calls back as it starts and ends.
  function spacesSwitching() {
    return !!(window.gNavToolbox?.hasAttribute("animating-background") || root.hasAttribute("animating-background"));
  }

  function watchSpacesSwitching(callback) {
    const watcher = new MutationObserver(callback);
    for (const el of [window.gNavToolbox, root]) {
      if (el) {
        watcher.observe(el, { attributes: true, attributeFilter: ["animating-background"] });
      }
    }
  }

  function setFlag(name, on) {
    if (on === root.hasAttribute(name)) {
      return;
    }
    if (on) {
      root.setAttribute(name, "true");
    } else {
      root.removeAttribute(name);
    }
  }

  // Address bar position (an option): at the bottom of the page instead of the
  // top. Zen's single toolbar keeps its own layout.
  function urlbarAtBottom() {
    return root.getAttribute("zia-urlbar-position") === "bottom" && root.getAttribute("zen-single-toolbar") !== "true";
  }

