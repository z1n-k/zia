// Zia: built from src/js by scripts/build.sh. Edit the parts in src/js, not this file.
(() => {
  if (window.__ziaLoaded) {
    return;
  }
  window.__ziaLoaded = true;

  const root = document.documentElement;
  const XHTML_NS = "http://www.w3.org/1999/xhtml";

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

  // a setting (or several) watched for as long as the window is open
  function watchPrefs(names, fn) {
    for (const name of [names].flat()) {
      Services.prefs.addObserver(name, fn);
    }
    window.addEventListener("unload", () => {
      for (const name of [names].flat()) {
        Services.prefs.removeObserver(name, fn);
      }
    });
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

  // An SVG file's text, ready to parse, or null if it isn't one. Firefox's
  // own icon sources can open with build lines (#filter, #include) that
  // aren't XML, and anything that isn't an SVG at all made the parser log
  // an XML parsing error to the console.
  function svgSourceOf(text) {
    if (typeof text !== "string") {
      return null;
    }
    const body = text.replace(/^\uFEFF/, "").replace(/^(?:[ \t]*#[^\n]*\n)+/, "").trimStart();
    return /^<(?:\?xml|!--|!DOCTYPE|svg)[\s>]/i.test(body) && /<svg[\s>]/i.test(body) ? body : null;
  }

