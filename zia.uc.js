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

  const STRIP_HEIGHT = 8;
  const STRIP_SCALE = 0.5;
  const FULL_VIEW_SCALE = 0.125;
  const SCROLL_SAMPLE_INTERVAL = 50;
  const scrollPositions = new WeakMap();
  const LIGHT_THRESHOLD = 150;
  const INK_MAX = 90;
  const ERROR_PAGE_COLOR = [0, 0, 0];
  const ERROR_PAGES = /^about:(neterror|certerror|httpsonlyerror|blocked|tabcrashed)/;
  const errorBrowsers = new WeakSet();
  const colorCache = new WeakMap();
  let colorRequestId = 0;

  const MIN_COLOR_SHARE = 0.6;
  const SAME_COLOR_DISTANCE = 10;
  let pendingColor = null;

  let appliedColorKey = null;

  // Off leaves the toolbar in the theme's own colour instead of the site's.
  const siteColorOn = () => Services.prefs.getBoolPref("zia.toolbar.site-color", true);

  function applyColor(rgb) {
    if (!siteColorOn()) {
      rgb = null;
    }
    const key = rgb ? rgb.join(",") : "fallback";
    if (key === appliedColorKey) {
      return;
    }
    appliedColorKey = key;
    if (!rgb) {
      root.style.removeProperty("--zia-site-bg");
      setFlag("zia-site-light", false);
      setFlag("zia-site-dark", true);
      setFlag("zia-site-mid", false);

      const fallback = fallbackColor();
      updateDarkSiteInk(fallback, brightnessOf(fallback),  true);
      return;
    }
    root.style.setProperty("--zia-site-bg", cssColor(rgb));
    const brightness = brightnessOf(rgb);
    const light = wantsDarkInk(rgb);
    setFlag("zia-site-light", light);
    setFlag("zia-site-dark", brightness < INK_MAX);
    // Between the two (a strong red, say), white text stays but nothing on
    // the toolbar is left faint.
    setFlag("zia-site-mid", !light && brightness >= INK_MAX);
    updateDarkSiteInk(rgb, brightness);
  }

  function updateDarkSiteInk(rgb, brightness, inkOnly = false) {
    if (!rgb || brightness >= INK_MAX) {
      root.style.removeProperty("--zia-dark-ink");
      root.style.removeProperty("--zia-urlbar-hover-bg");
      return;
    }
    const base = rgb.slice(0, 3);
    const t = brightness <= 1 ? 0 : Math.min(1, (brightness - 1) / 46);
    const level = brightness <= 1 ? 251 : Math.round(150 + t * 26);
    root.style.setProperty("--zia-dark-ink", `rgb(${level}, ${level}, ${level})`);
    if (inkOnly) {
      root.style.removeProperty("--zia-urlbar-hover-bg");
      return;
    }
    const hover =

      brightness >= 10 ? base.map((c) => Math.round(c * 0.45)) : base.map((c) => Math.round(c + (255 - c) * 0.1));
    root.style.setProperty("--zia-urlbar-hover-bg", `rgb(${hover.join(", ")})`);
  }

  function fallbackColor() {
    const text = getComputedStyle(root).getPropertyValue("--zia-fallback-bg").trim();
    const hex = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
    if (hex) {
      const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
      return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
    }
    const parsed = parseColor(text);
    return parsed[3] ? parsed.slice(0, 3) : [18, 18, 18];
  }

  function showFallbackColor() {
    colorRequestId++;
    applyColor(null);
  }

  function showErrorColor() {
    colorRequestId++;
    applyColor(ERROR_PAGE_COLOR);
  }

  function isErrorPage(browser) {
    if (!browser) {
      return false;
    }
    if (errorBrowsers.has(browser)) {
      return true;
    }
    const uris = [
      browser.browsingContext?.currentWindowGlobal?.documentURI?.spec,
      browser.documentURI?.spec,
    ];
    return uris.some((uri) => ERROR_PAGES.test(uri || ""));
  }

  function isLoading(browser) {
    if (!browser) {
      return false;
    }
    if (gBrowser.getTabForBrowser(browser)?.hasAttribute("busy")) {
      return true;
    }
    try {
      return !!browser.webProgress?.isLoadingDocument;
    } catch (err) {
      return false;
    }
  }

  // `rows` is how deep a band to read when the scroll position isn't known
  // (the whole view is drawn small, so one row is 8px of page)
  async function sampleTopColor(browser, rows = 1) {
    const windowGlobal = browser?.browsingContext?.currentWindowGlobal;
    const width = browser?.clientWidth;
    if (!windowGlobal || !width) {
      return null;
    }
    const backing = browser.getAttribute("transparent") === "true" ? "transparent" : "rgb(255, 255, 255)";

    const pos = scrollPositions.get(browser);
    const bitmap = pos
      ? await windowGlobal.drawSnapshot(new DOMRect(pos.x, pos.y, width, STRIP_HEIGHT), STRIP_SCALE, backing)
      : await windowGlobal.drawSnapshot(null, FULL_VIEW_SCALE, backing);

    sampleTopColor.canvas ||= document.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
    const canvas = sampleTopColor.canvas;
    canvas.width = bitmap.width;
    canvas.height = pos ? bitmap.height : Math.min(rows, bitmap.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const buckets = new Map();
    for (let i = 0; i < data.length; i += 4) {
      const key = ((data[i] >> 3) << 13) | ((data[i + 1] >> 3) << 8) | ((data[i + 2] >> 3) << 3) | (data[i + 3] >> 5);
      const bucket = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0, a: 0 };
      bucket.count++;
      bucket.r += data[i];
      bucket.g += data[i + 1];
      bucket.b += data[i + 2];
      bucket.a += data[i + 3];
      buckets.set(key, bucket);
    }
    let best = null;
    for (const bucket of buckets.values()) {
      if (!best || bucket.count > best.count) {
        best = bucket;
      }
    }
    if (!best) {
      return null;
    }
    let rgb = [best.r, best.g, best.b, best.a].map((v) => Math.round(v / best.count));
    if (rgb[3] < 255) {
      rgb = colorOver(rgb, chromeBackdrop(browser));
    }
    return {
      rgb: rgb[3] === 255 ? rgb.slice(0, 3) : rgb,
      share: best.count / (data.length / 4),
    };
  }
  function parseColor(text) {
    const parts = text.match(/[\d.]+/g)?.map(Number) || [];
    return parts.length >= 3 ? [parts[0], parts[1], parts[2], Math.round((parts[3] ?? 1) * 255)] : [0, 0, 0, 0];
  }

  function colorOver(top, bottom) {
    const ta = top[3] / 255;
    const ba = (bottom[3] / 255) * (1 - ta);
    const a = ta + ba;
    if (!a) {
      return [0, 0, 0, 0];
    }
    return [0, 1, 2].map((i) => Math.round((top[i] * ta + bottom[i] * ba) / a)).concat(Math.round(a * 255));
  }

  function chromeBackdrop(browser) {
    const shared = document.getElementById("zen-appcontent-navbar-wrapper")?.parentElement;
    const layers = [];
    for (let el = browser; el && el !== shared; el = el.parentElement) {
      layers.push(el);
    }
    let color = [0, 0, 0, 0];
    for (const el of layers.reverse()) {
      color = colorOver(parseColor(getComputedStyle(el).backgroundColor), color);
    }
    return color;
  }

  function cssColor([r, g, b, a = 255]) {
    return a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a / 255})`;
  }

  function brightnessOf([r, g, b, a = 255]) {
    const behind = matchMedia("(prefers-color-scheme: dark)").matches ? 0 : 255;
    return ((r * 299 + g * 587 + b * 114) / 1000) * (a / 255) + behind * (1 - a / 255);
  }

  // How far white text stands out on a colour (WCAG contrast, 1 to 21).
  function whiteContrastOn([r, g, b, a = 255]) {
    const behind = matchMedia("(prefers-color-scheme: dark)").matches ? 0 : 255;
    const channel = (c) => {
      const v = (c * (a / 255) + behind * (1 - a / 255)) / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    return 1.05 / (luminance + 0.05);
  }

  // Dark text on light colours, and on bright mid colours (a vivid green,
  // say) that white text can't be read on, though they're not light.
  const MIN_WHITE_CONTRAST = 3;
  function wantsDarkInk(rgb) {
    return brightnessOf(rgb) > LIGHT_THRESHOLD || whiteContrastOn(rgb) < MIN_WHITE_CONTRAST;
  }

  function colorDistance(a, b) {
    if (!a || !b) {
      return Infinity;
    }
    return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) + Math.abs((a[3] ?? 255) - (b[3] ?? 255));
  }

  async function updateColor(fromScroll = false, duringLoad = false) {
    const browser = gBrowser.selectedBrowser;
    if (!siteColorOn()) {
      applyColor(null);
      return;
    }

    if (isErrorPage(browser)) {
      showErrorColor();
      return;
    }
    if (isLoading(browser) && !duringLoad) {
      return;
    }

    const id = ++colorRequestId;
    let reading = null;
    try {
      reading = await sampleTopColor(browser);
    } catch (err) {
      noteError("site colour: updateColor", err);
    }
    if (id !== colorRequestId || browser !== gBrowser.selectedBrowser || (isLoading(browser) && !duringLoad)) {
      return;
    }

    const known = colorCache.has(browser);
    const current = colorCache.get(browser) ?? null;
    let rgb = reading?.rgb ?? null;

    if (known && fromScroll) {
      if (reading && reading.share < MIN_COLOR_SHARE) {
        pendingColor = null;
        return;
      }

      if (colorDistance(rgb, current) <= SAME_COLOR_DISTANCE) {
        pendingColor = null;
        return;
      }

      if (rgb) {
        if (colorDistance(rgb, pendingColor) > SAME_COLOR_DISTANCE) {
          pendingColor = rgb;
          requestScrollSample();
          return;
        }
      }
    }
    pendingColor = null;
    applyColor(rgb);
    colorCache.set(browser, rgb);

    if (!fromScroll && rgb) {
      rememberSiteColor(browser, rgb);
    }
  }

  // The colour checker. The toolbar's colour is read when a page loads, for
  // a few seconds after, and on scrolling, so a page that changes later (a
  // banner closing, a header recolouring itself, a slideshow) or whose very
  // top edge is a thin line of another colour could leave it wrong. Every
  // few seconds, while the tab is showing and settled, Zia reads a slightly
  // deeper band at the top of the page. If two readings in a row agree with
  // each other and not with the toolbar, the toolbar changes to match and
  // the site's remembered colour is corrected. It also checks when the
  // window comes back into view or is resized.
  const CHECK_EVERY = 3000;
  const CHECK_ROWS = 3;
  const CHECK_DISTANCE = 24;
  let checkSuspect = null;
  let checking = false;

  async function checkColor() {
    const browser = gBrowser.selectedBrowser;
    if (checking || document.hidden || !siteColorOn() || !browser || isErrorPage(browser) || isLoading(browser) ||
        scrollTimer || scrollSampling || !colorCache.has(browser)) {
      return;
    }
    checking = true;
    const id = colorRequestId;
    let reading = null;
    try {
      reading = await sampleTopColor(browser, CHECK_ROWS);
    } catch (err) {
      noteError("site colour: checkColor", err);
    } finally {
      checking = false;
    }
    // Something else read or changed the colour meanwhile, or the tab changed
    if (id !== colorRequestId || browser !== gBrowser.selectedBrowser || isLoading(browser) || !reading?.rgb) {
      checkSuspect = null;
      return;
    }
    const shown = colorCache.get(browser);
    if (reading.share < MIN_COLOR_SHARE || colorDistance(reading.rgb, shown) <= CHECK_DISTANCE) {
      checkSuspect = null;
      return;
    }
    if (!checkSuspect || checkSuspect.browser !== browser || colorDistance(reading.rgb, checkSuspect.rgb) > SAME_COLOR_DISTANCE) {
      checkSuspect = { browser, rgb: reading.rgb };
      return;
    }
    checkSuspect = null;
    applyColor(reading.rgb);
    colorCache.set(browser, reading.rgb);
    rememberSiteColor(browser, reading.rgb);
  }

  function watchColorDrift() {
    setInterval(checkColor, CHECK_EVERY);
    const soon = () => setTimeout(checkColor, 400);
    document.addEventListener("visibilitychange", soon);
    window.addEventListener("focus", soon);
    window.addEventListener("resize", () => {
      clearTimeout(watchColorDrift.resizeTimer);
      watchColorDrift.resizeTimer = setTimeout(checkColor, 500);
    });
    gBrowser.tabContainer.addEventListener("TabSelect", () => {
      checkSuspect = null;
    });
  }

  // Optionally the address bar's pop-up takes the toolbar's colour as it
  // opens, so it reads as the same bar growing. The colour is copied once,
  // when the pop-up opens, and kept until it closes: scrolling the page
  // underneath (which can recolour the toolbar) doesn't change it. With the
  // toolbar in the theme's colour, or Zen's own pop-up, nothing changes.
  const POP_UP_SITE_COLOR_PREF = "zia.urlbar.site-color";

  function freezePopUpColor(urlbar) {
    const text = root.style.getPropertyValue("--zia-site-bg").trim();
    if (
      !text ||
      !siteColorOn() ||
      !Services.prefs.getBoolPref(POP_UP_SITE_COLOR_PREF, false) ||
      urlbar.hasAttribute("zia-classic") ||
      urlbar.getAttribute("zen-floating-urlbar") === "true"
    ) {
      return;
    }
    // A see-through colour is laid over what the page would show behind it,
    // so the pop-up is solid.
    const behind = matchMedia("(prefers-color-scheme: dark)").matches ? [0, 0, 0, 255] : [255, 255, 255, 255];
    const rgb = colorOver(parseColor(text), behind);
    urlbar.style.setProperty("--zia-pop-site-bg", cssColor(rgb.slice(0, 3)));
    urlbar.setAttribute("zia-pop-site", wantsDarkInk(rgb) ? "light" : "dark");
  }

  function watchPopUpColor() {
    const urlbar = gURLBar?.textbox || document.getElementById("urlbar");
    if (!urlbar) {
      return;
    }
    let open = urlbar.hasAttribute("breakout-extend");
    new MutationObserver(() => {
      const nowOpen = urlbar.hasAttribute("breakout-extend");
      if (nowOpen === open) {
        return;
      }
      open = nowOpen;
      if (nowOpen) {
        freezePopUpColor(urlbar);
      } else {
        urlbar.removeAttribute("zia-pop-site");
        urlbar.style.removeProperty("--zia-pop-site-bg");
      }
    }).observe(urlbar, { attributes: true, attributeFilter: ["breakout-extend"] });
  }

  const SITE_COLORS_PREF = "zia.siteColors";
  const SITE_COLORS_MAX = 200;
  let siteColors = null;
  let siteColorsSaveTimer = null;

  function siteKey(browser) {
    try {
      const uri = browser.currentURI;
      return /^https?$/.test(uri.scheme) ? uri.host : "";
    } catch (err) {
      return "";
    }
  }

  function loadSiteColors() {
    if (siteColors) {
      return siteColors;
    }
    siteColors = new Map();
    try {
      const saved = JSON.parse(Services.prefs.getStringPref(SITE_COLORS_PREF, "{}"));
      for (const [host, value] of Object.entries(saved)) {
        siteColors.set(host, value);
      }
    } catch (err) {
      noteError("site colour: loadSiteColors", err);
    }
    return siteColors;
  }

  function rememberSiteColor(browser, rgb) {
    const host = siteKey(browser);
    if (!host) {
      return;
    }
    const colors = loadSiteColors();
    const value = rgb.join(",");
    if (colors.get(host) === value) {
      return;
    }
    colors.delete(host);
    colors.set(host, value);
    while (colors.size > SITE_COLORS_MAX) {
      colors.delete(colors.keys().next().value);
    }

    if (!siteColorsSaveTimer) {
      siteColorsSaveTimer = setTimeout(() => {
        siteColorsSaveTimer = null;
        Services.prefs.setStringPref(SITE_COLORS_PREF, JSON.stringify(Object.fromEntries(siteColors)));
      }, 20000);
    }
  }

  function rememberedSiteColor(browser) {
    const host = siteKey(browser);
    const value = host && loadSiteColors().get(host);
    return value ? value.split(",").map(Number) : null;
  }

  function snapColorForTab(browser) {
    pendingColor = null;
    setFlag("zia-color-snap", true);
    if (isErrorPage(browser)) {
      showErrorColor();
    } else if (isLoading(browser) || !colorCache.has(browser)) {
      showFallbackColor();
    } else {
      colorRequestId++;
      applyColor(colorCache.get(browser));
    }
    requestAnimationFrame(() => requestAnimationFrame(() => setFlag("zia-color-snap", false)));
  }

  function scheduleColor(delay) {
    setTimeout(() => updateColor(), delay);
  }

  let pageHelperWorks = false;
  let scrollTimer = null;
  let scrollSampling = false;
  let lastScrollSample = 0;

  function requestScrollSample() {
    if (scrollTimer) {
      return;
    }
    const wait = Math.max(0, SCROLL_SAMPLE_INTERVAL - (Date.now() - lastScrollSample));
    scrollTimer = setTimeout(async () => {
      scrollTimer = null;
      if (scrollSampling) {
        requestScrollSample();
        return;
      }
      scrollSampling = true;
      lastScrollSample = Date.now();
      try {
        await updateColor(true);
      } finally {
        scrollSampling = false;
      }
    }, wait);
  }

  window.ziaOnPagePainted = (browser) => {
    if (browser !== gBrowser.selectedBrowser || isErrorPage(browser)) {
      return;
    }
    updateColor(false, true);

    setTimeout(() => updateColor(false, isLoading(browser)), 150);
    setTimeout(() => updateColor(false, isLoading(browser)), 450);

    setTimeout(() => updateColor(false, isLoading(browser)), 1200);
    setTimeout(() => updateColor(false, isLoading(browser)), 2800);
    // pages that recolour their header once their scripts run (GitHub)
    setTimeout(() => updateColor(false, isLoading(browser)), 5000);
  };

  window.ziaOnPageScroll = (browser, position) => {
    if (position) {
      pageHelperWorks = true;
      scrollPositions.set(browser, { x: position.x || 0, y: position.y || 0 });
    }
    if (browser !== gBrowser.selectedBrowser || isLoading(browser) || isErrorPage(browser)) {
      return;
    }
    requestScrollSample();
  };

  function watchScrollInput() {
    const panels = document.getElementById("tabbrowser-tabpanels");
    if (!panels) {
      return;
    }
    const SCROLL_KEYS = new Set([
      "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " ",
    ]);
    let followUps = [];
    const onInput = () => {
      if (pageHelperWorks) {
        return;
      }
      window.ziaOnPageScroll(gBrowser.selectedBrowser);
      followUps.forEach(clearTimeout);
      followUps = [250, 600, 1200].map((ms) =>
        setTimeout(() => window.ziaOnPageScroll(gBrowser.selectedBrowser), ms)
      );
    };
    panels.addEventListener("wheel", onInput, { passive: true, capture: true });
    panels.addEventListener("mouseup", onInput, { capture: true });
    window.addEventListener("keyup", (event) => {
      if (SCROLL_KEYS.has(event.key)) {
        onInput();
      }
    });
  }

  // PDFs in Dia's look (actors/ZiaPdfChild.sys.mjs). The query string
  // changes every session: Firefox caches these modules by address, and
  // would otherwise keep running an older copy after Zia updates.
  function registerPdfActor() {
    const version = `?v=${Date.now()}`;
    try {
      ChromeUtils.registerWindowActor("ZiaPdf", {
        parent: { esModuleURI: `chrome://sine/content/zia/actors/ZiaPdfParent.sys.mjs${version}` },
        child: {
          esModuleURI: `chrome://sine/content/zia/actors/ZiaPdfChild.sys.mjs${version}`,
          events: { DOMContentLoaded: {} },
        },
        allFrames: false,
        messageManagerGroups: ["browsers"],
        // Firefox only starts a helper inside a website's process when told
        // it's safe there; this one's browser side does nothing.
        safeForUntrustedWebProcess: true,
      });
    } catch (err) {
      if (err?.name !== "NotSupportedError") {
        console.error("[Zia] Could not register the PDF view:", err);
      }
    }
  }

  function registerScrollActor() {
    try {
      ChromeUtils.registerWindowActor("Zia", {
        parent: { esModuleURI: "chrome://sine/content/zia/actors/ZiaParent.sys.mjs" },
        child: {
          esModuleURI: "chrome://sine/content/zia/actors/ZiaChild.sys.mjs",
          events: {
            scroll: { capture: true, mozSystemGroup: true },
            DOMContentLoaded: {},
            pageshow: {},
          },
        },
        allFrames: false,
        messageManagerGroups: ["browsers"],
        // Firefox only starts a helper inside a website's process when told
        // it's safe there; this one only reports how far a page scrolled.
        safeForUntrustedWebProcess: true,
      });
    } catch (err) {
      if (err?.name !== "NotSupportedError") {
        console.error("[Zia] Could not register scroll helper:", err);
      }
    }
  }

  const loader = {
    shown: 0,
    target: 0,
    active: false,
    finishing: false,
    estimateTimer: null,
    hideTimer: null,
    frame: null,
  };

  function urlbarElement() {
    return gURLBar.textbox || document.getElementById("urlbar");
  }

  function drawProgress() {
    urlbarElement()?.style.setProperty("--zia-load-progress", loader.shown.toFixed(4));
  }

  function animateLoader() {
    loader.frame = null;
    const diff = loader.target - loader.shown;
    const next = loader.shown + (Math.abs(diff) < 0.001 ? diff : diff * (loader.finishing ? 0.3 : 0.12));
    loader.shown = Math.max(loader.shown, next);
    drawProgress();

    if (loader.finishing && loader.shown >= 0.999) {
      loader.finishing = false;
      loader.hideTimer = setTimeout(() => setFlag("zia-loading", false), 150);
      return;
    }
    if (loader.active || loader.finishing) {
      loader.frame = requestAnimationFrame(animateLoader);
    }
  }

  function runLoader() {
    if (!loader.frame) {
      loader.frame = requestAnimationFrame(animateLoader);
    }
  }

  function stopLoaderTimers() {
    clearInterval(loader.estimateTimer);
    clearTimeout(loader.hideTimer);
    loader.estimateTimer = null;
    loader.hideTimer = null;
  }

  function startLoader(from = 0.02, fresh = false) {
    const stillShowing = loader.active || loader.finishing || root.hasAttribute("zia-loading");
    stopLoaderTimers();
    loader.active = true;
    loader.finishing = false;

    if (fresh || !stillShowing) {
      loader.shown = from;
      loader.target = Math.max(from, 0.25);
      drawProgress();
    } else {
      loader.target = Math.max(loader.target, loader.shown, from);
    }

    setFlag("zia-loading", true);

    loader.estimateTimer = setInterval(() => {
      if (loader.target < 0.9) {
        loader.target += (0.9 - loader.target) * 0.06;
      }
    }, 250);
    runLoader();
  }

  function reportRealProgress(fraction) {
    if (loader.active && fraction > loader.target) {
      loader.target = Math.min(0.95, fraction);
    }
  }

  function finishLoader() {
    if (!loader.active) {
      return;
    }
    stopLoaderTimers();
    loader.active = false;
    loader.finishing = true;
    loader.target = 1;
    runLoader();
  }

  function cancelLoader() {
    stopLoaderTimers();
    loader.active = false;
    loader.finishing = false;
    setFlag("zia-loading", false);
  }

  let titleEl = null;
  let plainEl = null;

  function createTitleElement() {
    const inputBox = gURLBar.inputField?.parentNode;
    if (!inputBox) {
      return;
    }
    titleEl = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
    titleEl.id = "zia-url-title";
    const host = document.createElementNS("http://www.w3.org/1999/xhtml", "span");
    host.className = "zia-url-title-host";
    const rest = document.createElementNS("http://www.w3.org/1999/xhtml", "span");
    rest.className = "zia-url-title-rest";
    titleEl.append(host, rest);
    inputBox.append(titleEl);

    plainEl = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
    plainEl.id = "zia-url-plain";
    const plainHost = document.createElementNS("http://www.w3.org/1999/xhtml", "span");
    plainHost.className = "zia-url-title-host";
    const plainRest = document.createElementNS("http://www.w3.org/1999/xhtml", "span");
    plainRest.className = "zia-url-title-rest";
    plainEl.append(plainHost, plainRest);
    inputBox.append(plainEl);
  }

  function updateTitle() {
    if (!titleEl) {
      return;
    }
    const urlbar = gURLBar.textbox || document.getElementById("urlbar");
    const browser = gBrowser.selectedBrowser;
    const uri = browser?.currentURI;

    let host = "";
    try {
      if (uri && /^https?$/.test(uri.scheme)) {
        host = uri.displayHost.replace(/^www\./, "");
      }
    } catch (err) {
      host = "";
    }

    const title = (browser?.contentTitle || "").trim();
    const valid = urlbar.getAttribute("pageproxystate") === "valid";

    // Multiview reads as a browser feature ("Multiview · 3"), not a website.
    if (valid && isMultiviewURI(uri)) {
      titleEl.firstChild.textContent = title || "Multiview";
      titleEl.lastChild.textContent = "";
      if (plainEl) {
        plainEl.firstChild.textContent = title || "Multiview";
        plainEl.lastChild.textContent = "";
      }
      urlbar.setAttribute("zia-has-title", "true");
      return;
    }

    if (!host || !valid || isErrorPage(browser)) {
      urlbar.removeAttribute("zia-has-title");
      return;
    }

    let isHomePage = false;
    try {
      const path = uri.filePath || "/";
      isHomePage = (path === "/" || path === "") && !uri.query && !uri.ref;
    } catch (err) {
      isHomePage = false;
    }
    titleEl.firstChild.textContent = host;

    const hasTitle = /[\p{L}\p{N}]/u.test(title);
    titleEl.lastChild.textContent = !isHomePage && hasTitle && title !== host ? ` / ${title}` : "";

    if (plainEl) {
      let path = "";
      try {
        path = uri.pathQueryRef || "";
      } catch (err) {
        path = "";
      }
      plainEl.firstChild.textContent = host;
      plainEl.lastChild.textContent = path === "/" ? "" : path;
    }

    urlbar.setAttribute("zia-has-title", "true");
  }

  let urlbarTyping = false;

  // A site's address with nothing after it ends in a bare "/", which Zia
  // leaves off: youtube.com, not youtube.com/.
  const BARE_SLASH = /^([^/?#\s]+)\/$/;

  function plainAddress(value) {
    return typeof value === "string"
      ? value.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(BARE_SLASH, "$1")
      : value;
  }

  function neverShowScheme() {
    const ui = window.gZenUIManager;
    if (ui && typeof ui.urlbarTrim === "function" && !ui.urlbarTrim.ziaWrapped) {
      const original = ui.urlbarTrim.bind(ui);
      const trimmed = (url) => (urlbarTyping && gURLBar.focused ? original(url) : plainAddress(original(url)));
      trimmed.ziaWrapped = true;
      ui.urlbarTrim = trimmed;
    }

    const input = gURLBar?.inputField || document.querySelector("#urlbar .urlbar-input");
    if (!input || input.ziaSchemeStripped) {
      return;
    }
    const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value");
    if (!desc?.get || !desc?.set) {
      return;
    }
    input.ziaSchemeStripped = true;
    Object.defineProperty(input, "value", {
      configurable: true,
      enumerable: desc.enumerable,
      get() {
        return desc.get.call(this);
      },
      set(next) {
        const typing = urlbarTyping && gURLBar.focused;
        // While typing, the only writes are Firefox's own, like autofill
        // completing "yo" to "youtube.com/": that loses its bare "/" too.
        // Typed characters don't come through here.
        desc.set.call(this, typing ? (typeof next === "string" ? next.replace(BARE_SLASH, "$1") : next) : plainAddress(next));

        if (holdWholeSelection && gURLBar.focused) {
          this.select();
        }
      },
    });
    input.addEventListener("input", (event) => {
      if (event.isTrusted) {
        urlbarTyping = true;
      }
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        urlbarTyping = false;
      }
    });
    input.addEventListener("blur", () => {
      urlbarTyping = false;
    });
  }

  let holdWholeSelection = false;

  function holdSelectionOnRewrite(input) {
    if (input.ziaSelectionHeld) {
      return;
    }
    input.ziaSelectionHeld = true;
    const setRange = input.setSelectionRange;
    input.setSelectionRange = function (start, end, direction) {
      if (holdWholeSelection && gURLBar.focused) {
        return setRange.call(this, 0, this.value.length, direction);
      }
      return setRange.call(this, start, end, direction);
    };
  }

  function keepWholeUrlSelected(urlbar) {
    const input = urlbar.querySelector(".urlbar-input") || gURLBar.inputField;
    if (!input) {
      return;
    }
    holdSelectionOnRewrite(input);
    let closedLength = -1;
    urlbar.addEventListener(
      "mousedown",
      (event) => {
        const opening = !urlbar.hasAttribute("breakout-extend") && !gURLBar.focused;
        closedLength = opening ? input.value.length : -1;

        holdWholeSelection = opening && event.button === 0;
      },
      true
    );
    const release = () => {
      holdWholeSelection = false;
    };
    urlbar.addEventListener("keydown", release, true);
    input.addEventListener("input", release);
    input.addEventListener("blur", release);
    const fix = () => {
      if (closedLength < 0) {
        return;
      }
      const { selectionStart, selectionEnd, value } = input;
      if (selectionStart === 0 && selectionEnd === closedLength && closedLength < value.length) {
        input.select();
        closedLength = -1;
      }
    };
    new MutationObserver(() => {
      if (!urlbar.hasAttribute("breakout-extend")) {
        closedLength = -1;
        return;
      }
      requestAnimationFrame(fix);
      for (const ms of [30, 100, 200]) {
        setTimeout(fix, ms);
      }
      setTimeout(() => {
        closedLength = -1;
      }, 400);
    }).observe(urlbar, { attributes: true, attributeFilter: ["breakout-extend"] });
  }

  function revertTypedTextOnLeave(urlbar) {
    const input = urlbar.querySelector(".urlbar-input") || gURLBar.inputField;
    if (!input || typeof gURLBar.handleRevert !== "function") {
      return;
    }
    let navigatingAt = 0;
    urlbar.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Enter") {
          navigatingAt = Date.now();
        }
      },
      true
    );
    urlbar.addEventListener(
      "mousedown",
      (event) => {
        if (event.target.closest?.(".urlbarView, #urlbar-go-button")) {
          navigatingAt = Date.now();
        }
      },
      true
    );
    input.addEventListener("blur", () => {
      const browser = gBrowser.selectedBrowser;
      setTimeout(() => {
        if (gURLBar.focused || !document.hasFocus() || Date.now() - navigatingAt < 1500) {
          return;
        }
        if (urlbar.hasAttribute("zen-newtab")) {
          return;
        }
        try {
          if (browser && browser !== gBrowser.selectedBrowser) {
            if (browser.userTypedValue) {
              browser.userTypedValue = null;
            }
            return;
          }
          if (gBrowser.userTypedValue == null && !gURLBar.valueIsTyped) {
            return;
          }
          gURLBar.handleRevert();
          updateTitle();
        } catch (err) {
          console.error("[Zia] Could not restore the address:", err);
        }
      }, 0);
    });
  }

  let openOffset = 0;

  function desiredOpenTop() {
    return parseFloat(getComputedStyle(root).getPropertyValue("--zia-urlbar-open-top")) || 0;
  }

  let closedTextRect = null;
  let openOffsetX = 0;

  let clickedUrlbarAt = 0;

  function rememberClosedText() {
    const urlbar = gURLBar.textbox || document.getElementById("urlbar");
    if (!urlbar || urlbar.hasAttribute("breakout-extend") || root.getAttribute("zia-split") === "true") {
      return;
    }
    // At the bottom, the opened pop-up is pinned by its bottom edge to where
    // the closed bar sits, so it grows upwards instead of off the screen.
    const bar = urlbar.getBoundingClientRect();
    if (bar.width) {
      root.style.setProperty("--zia-url-left", `${Math.round(bar.left)}px`);
      root.style.setProperty("--zia-url-width", `${Math.round(bar.width)}px`);
      root.style.setProperty("--zia-url-bottom", `${Math.round(window.innerHeight - bar.bottom)}px`);
    }
    const title = document.getElementById("zia-url-title");
    const input = urlbar.querySelector(".urlbar-input");
    const titleRect = title?.getBoundingClientRect();
    const rect = titleRect?.width ? titleRect : input?.getBoundingClientRect();
    if (rect?.width) {
      closedTextRect = { left: rect.left, centerY: rect.top + rect.height / 2 };
    }
  }

  function alignOpenedUrlbar() {
    const urlbar = gURLBar.textbox || document.getElementById("urlbar");

    if (urlbar?.getAttribute("zen-floating-urlbar") === "true" && !urlbarAtBottom()) {
      root.style.setProperty("--zia-urlbar-open-offset", "0px");
      root.style.setProperty("--zia-urlbar-open-offset-x", "0px");
      return;
    }
    if (!urlbar?.hasAttribute("breakout-extend")) {
      return;
    }
    if (root.getAttribute("zia-split") === "true") {
      return;
    }
    const input = urlbar.querySelector(".urlbar-input");
    const inputRect = input?.getBoundingClientRect();

    // At the bottom the pop-up grows upwards from the bar, so the text always
    // stays where it was, however the bar was opened.
    const openedByClick = urlbarAtBottom() || Date.now() - clickedUrlbarAt < 1500;
    if (!openedByClick && openOffsetX) {
      openOffsetX = 0;
      root.style.setProperty("--zia-urlbar-open-offset-x", "0px");
    }
    if (openedByClick && closedTextRect && inputRect?.width) {
      const dx = closedTextRect.left - inputRect.left;
      const dy = closedTextRect.centerY - (inputRect.top + inputRect.height / 2);
      if (Math.abs(dx) > 0.5) {
        openOffsetX += dx;
        root.style.setProperty("--zia-urlbar-open-offset-x", `${openOffsetX}px`);
      }
      if (Math.abs(dy) > 0.5) {
        openOffset += dy;
        root.style.setProperty("--zia-urlbar-open-offset", `${openOffset}px`);
      }
      return;
    }

    const top = urlbar.getBoundingClientRect().top;
    const diff = desiredOpenTop() - top;
    if (Math.abs(diff) > 0.5) {
      openOffset += diff;
      root.style.setProperty("--zia-urlbar-open-offset", `${openOffset}px`);
    }
  }

  function alignOpenedUrlbarSoon() {
    // Straight away, before the opened bar is first drawn, so the text doesn't
    // visibly jump; the later passes only catch late layout changes.
    alignOpenedUrlbar();
    requestAnimationFrame(alignOpenedUrlbar);
    setTimeout(alignOpenedUrlbar, 60);
    setTimeout(alignOpenedUrlbar, 200);
  }


  // Restarts a CSS animation keyed on an attribute, then clears it.
  function replayAttribute(el, name, ms, value = "true") {
    el.removeAttribute(name);
    el.getBoundingClientRect();
    el.setAttribute(name, value);
    clearTimeout(el.ziaReplayTimers?.[name]);
    el.ziaReplayTimers = { ...el.ziaReplayTimers, [name]: setTimeout(() => el.removeAttribute(name), ms) };
  }

  // Back and forward slide through when clicked; reload and stop turn into
  // each other as a page starts and finishes loading (the motion itself is
  // in the CSS, keyed on these attributes).
  function animateNavButtons() {
    for (const id of ["back-button", "forward-button"]) {
      const button = document.getElementById(id);
      button?.addEventListener(
        "click",
        (event) => {
          if (event.button === 0 && !button.hasAttribute("disabled")) {
            replayAttribute(button, "zia-slide", 420);
          }
        },
        true
      );
    }
    const reload = document.getElementById("reload-button");
    const container = document.getElementById("stop-reload-button");
    if (!reload || !container) {
      return;
    }
    let showingStop = reload.hasAttribute("displaystop");
    new MutationObserver(() => {
      const now = reload.hasAttribute("displaystop");
      if (now === showingStop) {
        return;
      }
      showingStop = now;
      replayAttribute(container, "zia-morph", 450, now ? "to-stop" : "to-reload");
    }).observe(reload, { attributes: true, attributeFilter: ["displaystop"] });
  }

  // Reload on hover: the arrowhead draws back 20 degrees round the circle
  // and the arc shortens with it, on Zia's spring. The CSS reads the angle
  // from --zia-reload-cut, eased here frame by frame.
  const RELOAD_HOVER_CUT = 20;
  const RELOAD_HOVER_MS = 380;

  function springReloadHover() {
    const button = document.getElementById("reload-button");
    if (!button) {
      return;
    }
    const ease = cubicBezier(0.3, 1.35, 0.5, 1);
    let cut = 0;
    let frame = 0;
    const go = (target) => {
      cancelAnimationFrame(frame);
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        cut = target;
        button.style.setProperty("--zia-reload-cut", `${cut}deg`);
        return;
      }
      const from = cut;
      const start = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - start) / RELOAD_HOVER_MS);
        cut = from + (target - from) * ease(t);
        button.style.setProperty("--zia-reload-cut", `${cut}deg`);
        if (t < 1) {
          frame = requestAnimationFrame(step);
        }
      };
      frame = requestAnimationFrame(step);
    };
    button.addEventListener("mouseenter", () => go(RELOAD_HOVER_CUT));
    button.addEventListener("mouseleave", () => go(0));
  }
  let workspaceSlot = null;
  let movedIndicator = null;
  let movedFromSpace = null;
  let spaceAttrObserver = null;
  const MIRRORED_SPACE_ATTRS = ["haspinnedtabs", "collapsedpinnedtabs"];

  function createWorkspaceSlot() {
    const topButtons = document.getElementById("zen-sidebar-top-buttons");
    if (!topButtons || !window.gZenWorkspaces) {
      return;
    }
    workspaceSlot = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
    workspaceSlot.id = "zia-workspace-slot";
    const buttonBox = topButtons.querySelector(".titlebar-buttonbox-container");
    if (buttonBox) {
      buttonBox.after(workspaceSlot);
    } else {
      topButtons.prepend(workspaceSlot);
    }

    for (const type of ["ZenWorkspacesUIUpdate", "ZenWorkspaceDataChanged", "AfterWorkspacesSessionRestore"]) {
      window.addEventListener(type, () => setTimeout(placeWorkspaceIndicator, 0));
    }

    const onSpaceSwitch = () => setTimeout(placeWorkspaceIndicator, 0);
    Services.prefs.addObserver("zen.workspaces.active", onSpaceSwitch);
    window.addEventListener("unload", () => Services.prefs.removeObserver("zen.workspaces.active", onSpaceSwitch));
    gBrowser.tabContainer.addEventListener("TabSelect", onSpaceSwitch);
    placeWorkspaceIndicator();

    setTimeout(placeWorkspaceIndicator, 500);
    setTimeout(placeWorkspaceIndicator, 2000);
  }

  const XHTML_NS = "http://www.w3.org/1999/xhtml";

  function syncSpaceLabel(indicator) {
    if (!indicator) {
      return;
    }
    let workspace = null;
    try {
      workspace = gZenWorkspaces.getActiveWorkspace();
    } catch (err) {
      return;
    }
    if (!workspace) {
      return;
    }

    let label = indicator.querySelector("#zia-space-label");
    if (!label) {
      label = document.createElementNS(XHTML_NS, "div");
      label.id = "zia-space-label";
      indicator.prepend(label);
    }

    const rawIcon = typeof workspace.icon === "string" ? workspace.icon : "";

    const visibleIcon = rawIcon.replace(/[\s\u200b-\u200f\u2060\ufe00-\ufe0f\p{Cf}]/gu, "");
    const hasIcon = visibleIcon !== "";
    const icon = hasIcon ? rawIcon.trim() : "";

    const blank = /^[\s\u200b-\u200f\u2060\ufe00-\ufe0f]+|[\s\u200b-\u200f\u2060\ufe00-\ufe0f]+$/gu;
    let text = label.querySelector(".zia-space-name");
    if (!text) {
      label.textContent = "";
      text = document.createElementNS(XHTML_NS, "span");
      text.className = "zia-space-name";
      label.appendChild(text);
    }
    text.textContent = (workspace.name || "").replace(blank, "");

    const mark = label.querySelector(".zia-space-svg");
    label.removeAttribute("zia-icon");
    label.removeAttribute("zia-has-icon");
    label.removeAttribute("zia-has-svg");

    if (!hasIcon) {
      mark?.remove();
      return;
    }
    if (!icon.endsWith(".svg")) {
      mark?.remove();
      label.setAttribute("zia-icon", icon);
      label.setAttribute("zia-has-icon", "true");
      return;
    }
    // Only the browser's and mods' own icon files: never a web address or a
    // file elsewhere on the computer.
    if (!isOwnIconUrl(icon)) {
      mark?.remove();
      return;
    }
    label.setAttribute("zia-has-svg", "true");
    let svgSlot = mark;
    if (!svgSlot) {
      svgSlot = document.createElementNS(XHTML_NS, "span");
      svgSlot.className = "zia-space-svg";
      label.prepend(svgSlot);
    }
    if (svgSlot.dataset.src === icon && svgSlot.firstChild) {
      return;
    }
    svgSlot.dataset.src = icon;
    svgSlot.replaceChildren();
    fetch(icon)
      .then((response) => response.text())
      .then((source) => {
        if (svgSlot.dataset.src !== icon) {
          return;
        }
        const colored = source
          .replace(/context-fill-opacity/g, "1")
          .replace(/context-stroke-opacity/g, "1")
          .replace(/context-fill/g, "currentColor")
          .replace(/context-stroke/g, "currentColor")
          .replace(/\bfill="(?:#000(?:000)?|black)"/gi, 'fill="currentColor"')
          .replace(/\bstroke="(?:#000(?:000)?|black)"/gi, 'stroke="currentColor"')
          .replace(/fill\s*:\s*(?:#000(?:000)?|black)/gi, "fill:currentColor")
          .replace(/stroke\s*:\s*(?:#000(?:000)?|black)/gi, "stroke:currentColor");
        const parsed = new DOMParser().parseFromString(colored, "image/svg+xml");
        const node = parsed.documentElement;
        if (!node || node.localName !== "svg") {
          return;
        }
        cleanSvg(node);
        svgSlot.replaceChildren(document.importNode(node, true));
      })
      .catch(() => {});
  }

  const OWN_ICON_SCHEMES = ["chrome:", "resource:"];

  function isOwnIconUrl(icon) {
    try {
      return OWN_ICON_SCHEMES.includes(new URL(icon, "chrome://browser/content/browser.xhtml").protocol);
    } catch (err) {
      return false;
    }
  }

  // An icon is only shapes: drop anything that could run or load something
  // before it goes into the browser's own window.
  function cleanSvg(svg) {
    for (const node of svg.querySelectorAll("script, foreignObject, iframe, embed, object, audio, video")) {
      node.remove();
    }
    for (const node of [svg, ...svg.querySelectorAll("*")]) {
      for (const attr of [...node.attributes]) {
        const name = attr.name.toLowerCase();
        const value = attr.value.trim().toLowerCase();
        const isLink = name === "href" || name.endsWith(":href") || name === "src";
        if (name.startsWith("on") || (isLink && !value.startsWith("#")) || value.startsWith("javascript:")) {
          node.removeAttributeNode(attr);
        }
      }
    }
  }

  function removeSpaceLabel(indicator) {
    indicator?.querySelector("#zia-space-label")?.remove();
  }

  function mirrorSpaceAttributes(space) {
    for (const name of MIRRORED_SPACE_ATTRS) {
      if (space?.hasAttribute(name)) {
        workspaceSlot.setAttribute(name, space.getAttribute(name));
      } else {
        workspaceSlot.removeAttribute(name);
      }
    }
  }

  function placeWorkspaceIndicator() {
    if (!workspaceSlot) {
      return;
    }
    let space = null;
    let indicator = null;
    try {
      space = gZenWorkspaces.activeWorkspaceElement;
      indicator = space?.indicator;
    } catch (err) {
      return;
    }

    if (movedIndicator && movedIndicator !== indicator && movedFromSpace?.isConnected) {
      removeSpaceLabel(movedIndicator);
      movedFromSpace.prepend(movedIndicator);
      movedIndicator = null;
      movedFromSpace = null;
    }

    if (indicator && indicator.parentNode !== workspaceSlot) {
      workspaceSlot.append(indicator);
      movedIndicator = indicator;
      movedFromSpace = space;
    }

    syncSpaceLabel(indicator);

    spaceAttrObserver?.disconnect();
    mirrorSpaceAttributes(space);
    if (space) {
      spaceAttrObserver = new MutationObserver(() => mirrorSpaceAttributes(space));
      spaceAttrObserver.observe(space, { attributes: true, attributeFilter: MIRRORED_SPACE_ATTRS });
    }
    setFlag("zia-workspace-slot", !!indicator);
  }

  function searchEngineHomePage(engine) {
    try {
      if (engine.searchForm) {
        return engine.searchForm;
      }
    } catch (err) {
      noteError("new tabs: searchEngineHomePage", err);
    }
    try {
      const prePath = engine.getSubmission("zia").uri.prePath;
      return prePath ? `${prePath}/` : null;
    } catch (err) {
      return null;
    }
  }

  let searchHomeUrl = null;

  function newTabSearchEnabled() {
    return Services.prefs.getBoolPref("zia.newtab.search-engine", true);
  }

  async function applyNewTabPage() {
    try {
      const AboutNewTabModule =
        window.AboutNewTab ||
        ChromeUtils.importESModule("resource:///modules/AboutNewTab.sys.mjs").AboutNewTab;

      if (!newTabSearchEnabled()) {
        searchHomeUrl = null;
        AboutNewTabModule.resetNewTabURL();
        return;
      }

      const search =
        Services.search ||
        ChromeUtils.importESModule("moz-src:///toolkit/components/search/SearchService.sys.mjs").SearchService;
      await search.init();
      const engine = await search.getDefault();
      searchHomeUrl = (engine && searchEngineHomePage(engine)) || null;
      if (!searchHomeUrl) {
        console.warn("[Zia] Couldn't find the search engine's home page; keeping Zen's new tab page.");
        return;
      }
      try {
        AboutNewTabModule.newTabURL = searchHomeUrl;
      } catch (err) {
        noteError("new tabs: applyNewTabPage", err);
      }
    } catch (err) {
      console.error("[Zia] Could not set the new tab page:", err);
    }
  }

  function redirectBlankNewTab(browser, location, flags) {
    if (!searchHomeUrl || !newTabSearchEnabled()) {
      return;
    }
    if (flags & Ci.nsIWebProgressListener.LOCATION_CHANGE_SAME_DOCUMENT) {
      return;
    }
    if (location?.spec !== "about:newtab") {
      return;
    }
    try {
      browser.loadURI(Services.io.newURI(searchHomeUrl), {
        triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
        loadFlags: Ci.nsIWebNavigation.LOAD_FLAGS_REPLACE_HISTORY,
      });
    } catch (err) {
      console.error("[Zia] Could not open the search page in the new tab:", err);
    }
  }

  function closeNewTabUrlbar(tab) {
    if (!searchHomeUrl || !newTabSearchEnabled()) {
      return;
    }
    requestAnimationFrame(() => {
      try {
        const urlbar = gURLBar;
        if (!urlbar?.focused) {
          return;
        }
        if (gBrowser.selectedTab !== tab) {
          return;
        }
        urlbar.view?.close();
        urlbar.blur();
        gBrowser.selectedBrowser?.focus();
      } catch (err) {
        noteError("new tabs: closeNewTabUrlbar", err);
      }
    });
  }

  function watchNewTabPage() {
    applyNewTabPage();
    gBrowser.tabContainer.addEventListener("TabOpen", (event) => closeNewTabUrlbar(event.target));
    Services.obs.addObserver(applyNewTabPage, "browser-search-engine-modified");
    Services.prefs.addObserver("zia.newtab.search-engine", applyNewTabPage);
    window.addEventListener("unload", () => {
      Services.obs.removeObserver(applyNewTabPage, "browser-search-engine-modified");
      Services.prefs.removeObserver("zia.newtab.search-engine", applyNewTabPage);
    });
  }

  function watchTabAnimations() {
    gBrowser.tabContainer.addEventListener("TabOpen", (event) => {
      const tab = event.target;
      if (tab.hasAttribute("zen-essential")) {
        return;
      }
      tab.setAttribute("zia-opening", "true");
      setTimeout(() => tab.removeAttribute("zia-opening"), 350);
    });

    const essentials = document.getElementById("zen-essentials");
    if (!essentials) {
      return;
    }
    const known = new WeakSet(essentials.querySelectorAll(".tabbrowser-tab"));
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!node.classList?.contains("tabbrowser-tab") || known.has(node)) {
            continue;
          }
          known.add(node);
          if (node.hasAttribute("zia-to-essential")) {
            continue;
          }
          node.setAttribute("zia-essential-enter", "true");
          setTimeout(() => node.removeAttribute("zia-essential-enter"), 450);
        }
      }
    }).observe(essentials, { childList: true, subtree: true });
  }

  // Zen slides a folder open and shut in 0.18s at an even pace. Zia turns
  // that slide into a spring: it eases in quickly, runs a few pixels past
  // where it's going, and settles back. Opening, the folder's box stretches a
  // little further than it needs to; closing, whatever is below the folder
  // bounces up a little. The overshoot is the same pixel or two whatever the
  // folder's size, like the music player's, rather than growing with it.
  // Zen moves the element that starts a folder's contents by its top margin;
  // Zia only changes that one animation.
  const FOLDER_SPRING_MS = 420;
  const FOLDER_OVERSHOOT_PX = 2;
  const FOLDER_CLOSE_BOUNCE_PX = 1.5;
  const FOLDER_SELECTOR = "zen-folder, tab-group:not([split-view-group])";

  // The spring moves the folder by fractions of a pixel, and the folder's
  // box has a one-pixel outline that fades out for a frame when it sits
  // between two pixels, so the bottom edge flickered as the spring settled.
  // The motion is sampled into small held steps instead, each landing on a
  // whole screen pixel counted from where the folder comes to rest.
  const cubicBezier = (x1, y1, x2, y2) => (t) => {
    let u = t;
    for (let i = 0; i < 8; i++) {
      const x = 3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u - t;
      const dx = 3 * (1 - u) * (1 - u) * x1 + 6 * (1 - u) * u * (x2 - x1) + 3 * u * u * (1 - x2);
      if (Math.abs(x) < 1e-5 || !dx) {
        break;
      }
      u = Math.min(1, Math.max(0, u - x / dx));
    }
    return 3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u;
  };
  const EASE_OUT = cubicBezier(0.25, 1, 0.5, 1);
  const EASE_IN_OUT = cubicBezier(0.42, 0, 0.58, 1);
  const STEPS_PER_SECOND = 120;

  // points: [offset, value, easing to the next point]
  function pixelSteps(prop, points, duration, restValue) {
    const scale = window.devicePixelRatio || 1;
    const count = Math.max(2, Math.ceil((duration / 1000) * STEPS_PER_SECOND));
    const valueAt = (t) => {
      for (let i = 0; i < points.length - 1; i++) {
        const [a, from, ease] = points[i];
        const [b, to] = points[i + 1];
        if (t <= b) {
          const local = b > a ? (t - a) / (b - a) : 1;
          return from + (to - from) * (ease ? ease(local) : local);
        }
      }
      return points.at(-1)[1];
    };
    const frames = [];
    let last = null;
    for (let i = 0; i <= count; i++) {
      const offset = i / count;
      const exact = i === count ? restValue : valueAt(offset);
      const value = i === count ? restValue : restValue + Math.round((exact - restValue) * scale) / scale;
      if (value === last && i !== count) {
        continue;
      }
      last = value;
      frames.push({ [prop]: `${value}px`, offset, easing: "steps(1, end)" });
    }
    if (frames[0].offset !== 0) {
      frames.unshift({ [prop]: `${points[0][1]}px`, offset: 0, easing: "steps(1, end)" });
    }
    delete frames.at(-1).easing;
    return frames;
  }

  const isFolder = (el) =>
    el?.localName === "zen-folder" || (el?.localName === "tab-group" && !el.hasAttribute("split-view-group"));

  function springFolderAnimation(element, keyframes, options) {
    if (
      !element.classList?.contains("zen-tab-group-start") ||
      !isFolder(element.parentElement?.parentElement) ||
      !Array.isArray(keyframes) ||
      keyframes.length !== 2 ||
      !(typeof options === "object" && options?.duration > 0)
    ) {
      return null;
    }
    const from = parseFloat(keyframes[0]?.marginTop);
    const to = parseFloat(keyframes[1]?.marginTop);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) {
      return null;
    }
    try {
      if (!Services.prefs.getBoolPref("zia.folders.bounce", true)) {
        return null;
      }
    } catch (err) {
      return null;
    }
    // Opening, the margin rises to 0 and goes a little past; closing, it
    // falls and goes a little further, so the rows below rise past their
    // place and drop back.
    const past = to + Math.sign(to - from) * Math.min(FOLDER_OVERSHOOT_PX, Math.abs(to - from) / 4);
    return {
      closing: to < from,
      keyframes: pixelSteps("marginTop", [[0, from, EASE_OUT], [0.62, past, EASE_IN_OUT], [1, to]], FOLDER_SPRING_MS, to),
      options: { ...options, duration: FOLDER_SPRING_MS, easing: "linear" },
    };
  }

  // Closing, the folder's contents shrink to nothing before the slide
  // overshoots, and a height can't go below nothing, so the overshoot alone
  // moves nothing. The folder's contents also pull up by the same few pixels
  // (a little less than opening) with a negative bottom margin as they
  // arrive, so the folder's box and everything below it rise past their
  // place and drop back.
  function bounceUpAfterClosing(container, animate) {
    if (!container?.classList?.contains("tab-group-container")) {
      return;
    }
    animate.call(
      container,
      pixelSteps("marginBottom", [[0, 0, null], [0.45, 0, EASE_OUT], [0.66, -FOLDER_CLOSE_BOUNCE_PX, EASE_IN_OUT], [1, 0]], FOLDER_SPRING_MS, 0),
      { duration: FOLDER_SPRING_MS }
    );
  }

  // With a tab selected inside it, Zen leaves the folder's start where it
  // is and shrinks the other tabs away instead (or grows them back), so the
  // spring above never ran. Those tabs' own animations get the spring's
  // first leg, arriving at 62% of the way through, and the folder's contents
  // stretch a couple of pixels past (or pull up past) where they land, then
  // settle, the same shape as a folder with nothing selected.
  const FOLDER_ARRIVE = 0.62;
  let folderMotion = null;

  function noteFolderMotion(event) {
    const group = event.target;
    if (!isFolder(group)) {
      return;
    }
    const motion = {
      group,
      closing: event.type === "TabGroupCollapse",
      hadActive: group.hasAttribute("has-active"),
      bounced: false,
    };
    folderMotion = motion;
    setTimeout(() => {
      if (folderMotion === motion) {
        folderMotion = null;
      }
    }, 0);
  }

  function springFolderItem(element, keyframes, options) {
    const motion = folderMotion;
    if (
      !motion ||
      !Array.isArray(keyframes) ||
      keyframes.length !== 2 ||
      !(typeof options === "object" && options?.duration > 0) ||
      !(motion.closing ? motion.group.hasAttribute("has-active") : motion.hadActive)
    ) {
      return null;
    }
    const container = motion.group.groupContainer;
    if (!container?.contains(element) || container === element) {
      return null;
    }
    const [a, b] = keyframes;
    const props = Object.keys(b).filter((prop) => prop !== "offset" && prop !== "easing" && prop !== "composite");
    if (!props.includes("height")) {
      return null;
    }
    const scale = window.devicePixelRatio || 1;
    const tracks = [];
    for (const prop of props) {
      const from = parseFloat(a?.[prop]);
      const to = parseFloat(b[prop]);
      const numeric = Number.isFinite(from) && Number.isFinite(to);
      if (prop === "height" && (!numeric || from === to)) {
        return null;
      }
      if (numeric) {
        tracks.push({ prop, from, to, unit: prop === "opacity" ? "" : "px" });
      } else if (Number.isFinite(from)) {
        // Growing back to a natural size ("auto"): hold the size it starts
        // at until the very end, when the tab is its full height anyway.
        tracks.push({ prop, hold: a[prop], end: b[prop] });
      } else {
        tracks.push({ prop, hold: b[prop], end: b[prop] });
      }
    }
    try {
      if (!Services.prefs.getBoolPref("zia.folders.bounce", true)) {
        return null;
      }
    } catch (err) {
      return null;
    }
    const count = Math.max(2, Math.ceil((FOLDER_SPRING_MS / 1000) * STEPS_PER_SECOND));
    const frames = [];
    for (let i = 0; i <= count; i++) {
      const offset = i / count;
      const k = offset >= FOLDER_ARRIVE ? 1 : EASE_OUT(offset / FOLDER_ARRIVE);
      const frame = { offset, easing: "steps(1, end)" };
      for (const track of tracks) {
        if (track.hold !== undefined) {
          frame[track.prop] = i === count ? track.end : track.hold;
          continue;
        }
        let value = track.from + (track.to - track.from) * k;
        if (track.unit) {
          value = track.to + Math.round((value - track.to) * scale) / scale;
        }
        frame[track.prop] = `${value}${track.unit}`;
      }
      frames.push(frame);
    }
    delete frames.at(-1).easing;
    const bounce = motion.bounced
      ? null
      : {
          container,
          keyframes: pixelSteps(
            "marginBottom",
            [
              [0, 0, EASE_OUT],
              [FOLDER_ARRIVE, motion.closing ? -FOLDER_CLOSE_BOUNCE_PX : FOLDER_OVERSHOOT_PX, EASE_IN_OUT],
              [1, 0],
            ],
            FOLDER_SPRING_MS,
            0
          ),
        };
    motion.bounced = true;
    return {
      bounce,
      keyframes: frames,
      options: { ...options, duration: FOLDER_SPRING_MS, easing: "linear" },
    };
  }

  function allowEmojiFolderIcons() {
    const picker = window.gZenEmojiPicker;
    if (!picker || typeof picker.open !== "function" || picker.open.__zia) {
      return;
    }
    const original = picker.open;
    const patched = function (anchor, options = {}) {
      if (options?.onlySvgIcons && anchor?.closest?.("zen-folder")) {
        options = { ...options, onlySvgIcons: false, emojiAsSVG: true };
      }
      return original.call(this, anchor, options);
    };
    patched.__zia = true;
    picker.open = patched;
  }

  function addFolderBounce() {
    const animate = Element.prototype.animate;
    if (animate.__zia) {
      return;
    }
    const patched = function (keyframes, options) {
      const spring = springFolderAnimation(this, keyframes, options);
      if (!spring) {
        const item = springFolderItem(this, keyframes, options);
        if (!item) {
          return animate.call(this, keyframes, options);
        }
        if (item.bounce) {
          animate.call(item.bounce.container, item.bounce.keyframes, { duration: FOLDER_SPRING_MS });
        }
        return animate.call(this, item.keyframes, item.options);
      }
      if (spring.closing) {
        bounceUpAfterClosing(this.parentElement, animate);
      }
      return animate.call(this, spring.keyframes, spring.options);
    };
    patched.__zia = true;
    Element.prototype.animate = patched;
    window.addEventListener("TabGroupCollapse", noteFolderMotion, true);
    window.addEventListener("TabGroupExpand", noteFolderMotion, true);
  }

  function hideWwwInUrlbar() {
    const original = gURLBar?._zenTrimURL;
    if (typeof original !== "function" || original.__zia) {
      return;
    }
    const wrapped = function (url) {
      let trimmed = original.call(this, url);
      if (typeof trimmed !== "string") {
        return trimmed;
      }
      trimmed = plainAddress(trimmed);
      if (gURLBar.hasAttribute("breakout-extend")) {
        return trimmed;
      }
      return trimmed;
    };
    wrapped.__zia = true;
    gURLBar._zenTrimURL = wrapped;
    try {
      gURLBar.setURI();
    } catch (err) {
      noteError("tab animations and folder bounce: hideWwwInUrlbar", err);
    }
  }

  let edgeFrame = null;
  let edgeRetryTimer = null;
  let edgeRetries = 0;
  const EDGE_MAX_FIX = 24;
  const EDGE_RETRY_MS = 100;
  const EDGE_MAX_RETRIES = 30;

  function visibleRect(el) {
    const rect = el?.getBoundingClientRect();
    return rect && rect.width > 0 && rect.height > 0 ? rect : null;
  }

  function isSliding(el) {
    for (let node = el; node && node.id !== "navigator-toolbox"; node = node.parentElement) {
      const style = getComputedStyle(node);

      const transform = style.transform || "none";
      const moved =
        transform !== "none" &&
        !/^matrix\(1, 0, 0, 1, 0, 0\)$/.test(transform) &&
        !/^matrix3d\(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1\)$/.test(transform);
      const translate = style.translate || "none";
      if (moved || !/^(none|0px( 0px)?( 0px)?)$/.test(translate)) {
        return true;
      }
    }
    return false;
  }

  function retryEdgeAlignSoon() {
    if (edgeRetryTimer || edgeRetries >= EDGE_MAX_RETRIES) {
      return;
    }
    edgeRetries++;
    edgeRetryTimer = setTimeout(() => {
      edgeRetryTimer = null;
      scheduleEdgeAlign(true);
    }, EDGE_RETRY_MS);
  }

  const halfPx = (value) => `${Math.round(value * 2) / 2}px`;

  function alignRightEdges() {
    edgeFrame = null;
    const sidebar = document.getElementById("navigator-toolbox");
    if (!sidebar || document.documentElement.getAttribute("zen-sidebar-expanded") !== "true") {
      return;
    }

    let essentialsRight = null;
    let essentialsLeft = null;
    let essentialTile = null;
    // only the essentials on screen: other spaces' are kept too, some shifted
    // aside, and measuring those pushed the tabs out past the sidebar's edge
    const grid = window.gZenWorkspaces?.getCurrentEssentialsContainer?.() || document.getElementById("zen-essentials");
    for (const bg of grid?.querySelectorAll(".tabbrowser-tab[zen-essential] > .tab-stack > .tab-background") || []) {
      const rect = bg.checkVisibility?.({ visibilityProperty: true, opacityProperty: true }) === false ? null : visibleRect(bg);
      if (rect) {
        essentialTile ||= bg;
        essentialsRight = Math.max(essentialsRight ?? -Infinity, rect.right);
        essentialsLeft = Math.min(essentialsLeft ?? Infinity, rect.left);
      }
    }
    if (essentialsRight === null) {
      root.style.removeProperty("--zia-tab-right-fix");
      root.style.removeProperty("--zia-folder-right-fix");
      root.style.removeProperty("--zia-folder-left-fix");
      alignFolderBottoms(gZenWorkspaces?.activeWorkspaceElement || sidebar);
      return;
    }

    const space = gZenWorkspaces?.activeWorkspaceElement || sidebar;

    if ((isSliding(space) || isSliding(essentialTile)) && edgeRetries < EDGE_MAX_RETRIES) {
      retryEdgeAlignSoon();
      return;
    }
    const currentFix = (name) => parseFloat(root.style.getPropertyValue(name)) || 0;
    let suspicious = false;

    const tab = [...space.querySelectorAll(".tabbrowser-tab:not([zen-essential])")].find(
      (t) => !t.closest(FOLDER_SELECTOR) && visibleRect(t.querySelector(".tab-background"))
    );
    if (tab) {
      const rect = visibleRect(tab.querySelector(".tab-background"));

      const fix = rect.right + currentFix("--zia-tab-right-fix") - essentialsRight;
      if (Math.abs(fix) <= EDGE_MAX_FIX) {
        root.style.setProperty("--zia-tab-right-fix", halfPx(fix));
      } else {
        suspicious = true;
      }
    }

    const folder = [...space.querySelectorAll(FOLDER_SELECTOR)].find((f) => !f.parentElement?.closest(FOLDER_SELECTOR) && visibleRect(f));
    if (folder) {
      const rect = visibleRect(folder);
      const rightFix = rect.right - essentialsRight;
      const leftFix = essentialsLeft - rect.left;
      if (Math.abs(rightFix) <= EDGE_MAX_FIX && Math.abs(leftFix) <= EDGE_MAX_FIX) {
        root.style.setProperty("--zia-folder-right-fix", halfPx(rightFix));
        root.style.setProperty("--zia-folder-left-fix", halfPx(leftFix));
      } else {
        suspicious = true;
      }
    }

    if (!alignFolderBottoms(space)) {
      suspicious = true;
    }

    if (suspicious) {
      retryEdgeAlignSoon();
    } else {
      edgeRetries = 0;
    }
  }

  function alignFolderBottoms(space) {
    let ok = true;
    for (const folder of space.querySelectorAll(FOLDER_SELECTOR)) {
      const rect = visibleRect(folder);
      const open = folder.hasAttribute("collapsed") === false;
      const container = folder.querySelector(":scope > .tab-group-container");
      let last = null;
      if (rect && open && container) {
        const items = [...container.children].filter(
          (el) => (isFolder(el) || el.classList.contains("tabbrowser-tab")) && visibleRect(el)
        );
        last = items[items.length - 1];
      }
      const current = parseFloat(folder.style.getPropertyValue("--zia-folder-bottom-extra")) || 0;
      if (!isFolder(last)) {
        if (current) {
          folder.style.removeProperty("--zia-folder-bottom-extra");
        }
        continue;
      }
      const gap = parseFloat(getComputedStyle(folder).getPropertyValue("--zia-folder-inner-gap")) || 5;
      const innerInset = parseFloat(getComputedStyle(last, "::before").bottom) || 0;
      const innerBoxBottom = last.getBoundingClientRect().bottom - innerInset;
      const outerInset = parseFloat(getComputedStyle(folder, "::before").bottom) || 0;
      const baseInset = outerInset + current;
      const wantedInset = rect.bottom - (innerBoxBottom + gap);
      const extra = Math.round((baseInset - wantedInset) * 2) / 2;
      if (Math.abs(extra) > EDGE_MAX_FIX) {
        ok = false;
        continue;
      }
      if (extra !== current) {
        folder.style.setProperty("--zia-folder-bottom-extra", `${extra}px`);
      }
    }
    return ok;
  }

  function scheduleEdgeAlign(isRetry = false) {
    if (isRetry !== true) {
      edgeRetries = 0;
    }
    if (!edgeFrame) {
      edgeFrame = requestAnimationFrame(alignRightEdges);
    }
  }

  function scheduleEdgeAlignAfterSwitch() {
    scheduleEdgeAlign();
    setTimeout(scheduleEdgeAlign, 350);
    setTimeout(scheduleEdgeAlign, 800);
  }

  function watchRightEdges() {
    const sidebar = document.getElementById("navigator-toolbox");
    if (!sidebar) {
      return;
    }
    new ResizeObserver(scheduleEdgeAlign).observe(sidebar);
    const essentials = document.getElementById("zen-essentials");
    if (essentials) {
      new ResizeObserver(scheduleEdgeAlign).observe(essentials);
      new MutationObserver(scheduleEdgeAlign).observe(essentials, { childList: true, subtree: true });
    }
    new MutationObserver(scheduleEdgeAlign).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["zen-sidebar-expanded"],
    });
    const tabs = document.getElementById("tabbrowser-tabs");
    if (tabs) {
      new MutationObserver(scheduleEdgeAlign).observe(tabs, {
        subtree: true,
        attributes: true,
        attributeFilter: ["collapsed"],
      });
    }
    gBrowser.tabContainer.addEventListener("TabSelect", () => scheduleEdgeAlign());
    const onSpaceSwitch = () => scheduleEdgeAlignAfterSwitch();
    for (const type of ["TabGroupExpand", "TabGroupCollapse", "TabGrouped", "TabUngrouped"]) {
      window.addEventListener(type, onSpaceSwitch);
    }
    Services.prefs.addObserver("zen.workspaces.active", onSpaceSwitch);
    window.addEventListener("ZenWorkspacesUIUpdate", onSpaceSwitch);
    window.addEventListener("unload", () => Services.prefs.removeObserver("zen.workspaces.active", onSpaceSwitch));
    scheduleEdgeAlign();
    setTimeout(scheduleEdgeAlign, 600);
    setTimeout(scheduleEdgeAlign, 2000);
  }

  const mediaColorCache = new Map();

  function artUrlOf(card) {
    const artwork = card.querySelector(".zen-media-focus-button[zia-art]")?.getAttribute("zia-art");
    if (artwork) {
      return artwork;
    }
    const favicon = card.querySelector(".zen-media-focus-button[zia-favicon]")?.getAttribute("zia-favicon");
    if (favicon) {
      return favicon;
    }
    const img = card.querySelector(".zen-media-focus-button image, .zen-media-focus-button .toolbarbutton-icon");
    if (!img) {
      return "";
    }
    const src = img.getAttribute("src") || img.src || "";
    if (src) {
      return src;
    }
    const listStyle = getComputedStyle(img).listStyleImage || "";
    const match = listStyle.match(/url\(["']?(.*?)["']?\)/);
    return match ? match[1] : "";
  }

  function boost([r, g, b]) {
    const avg = (r + g + b) / 3;
    const k = 1.6;
    return [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(avg + (v - avg) * k))));
  }

  function readArtColors(url) {
    return new Promise((resolve) => {
      if (!url) {
        resolve(null);
        return;
      }
      const img = new Image();
      img.onload = () => {
        try {
          const size = 24;
          const canvas = document.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(img, 0, 0, size, size);
          const { data } = ctx.getImageData(0, 0, size, size);
          const halves = [[0, 0, 0, 0], [0, 0, 0, 0]];
          for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
              const i = (y * size + x) * 4;
              if (data[i + 3] < 128) {
                continue;
              }
              const h = halves[x < size / 2 ? 0 : 1];
              h[0] += data[i];
              h[1] += data[i + 1];
              h[2] += data[i + 2];
              h[3]++;
            }
          }
          const colors = halves.map((h) =>
            h[3] ? boost([h[0] / h[3], h[1] / h[3], h[2] / h[3]]) : null
          );
          if (!colors[0] && !colors[1]) {
            resolve(null);
            return;
          }
          const a = colors[0] || colors[1];
          const b = colors[1] || colors[0];
          resolve([`rgb(${a.join(", ")})`, `rgb(${b.join(", ")})`]);
        } catch (err) {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  // The favicon's own colours, strongest first: up to three hues it has a
  // fair amount of, so the selected tab's glow can blend them. Grey, white and
  // black icons give null and the glow stays white.
  function readFaviconPalette(url) {
    return new Promise((resolve) => {
      if (!url) {
        resolve(null);
        return;
      }
      const img = new Image();
      img.onload = () => {
        try {
          const size = 32;
          const canvas = document.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(img, 0, 0, size, size);
          const { data } = ctx.getImageData(0, 0, size, size);
          const bins = Array.from({ length: 12 }, () => [0, 0, 0, 0]);
          for (let i = 0; i < data.length; i += 4) {
            const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
            if (a < 128) {
              continue;
            }
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const sat = max ? (max - min) / max : 0;
            if (sat < 0.3 || max < 60) {
              continue;
            }
            let hue;
            if (max === r) {
              hue = ((g - b) / (max - min) + 6) % 6;
            } else if (max === g) {
              hue = (b - r) / (max - min) + 2;
            } else {
              hue = (r - g) / (max - min) + 4;
            }
            const bin = bins[Math.floor(hue * 2) % 12];
            bin[0] += r * sat;
            bin[1] += g * sat;
            bin[2] += b * sat;
            bin[3] += sat;
          }
          const ranked = bins.filter((bin) => bin[3] >= 6).sort((x, y) => y[3] - x[3]);
          if (!ranked.length) {
            resolve(null);
            return;
          }
          const top = ranked[0][3];
          const colors = ranked
            .filter((bin) => bin[3] >= top * 0.12)
            .slice(0, 3)
            .map((bin) => bin.slice(0, 3).map((v) => Math.round(v / bin[3])));
          // One colour: blend a lighter and a deeper shade of it instead.
          if (colors.length === 1) {
            const [r, g, b] = colors[0];
            colors.push([r, g, b].map((v) => Math.round(v + (255 - v) * 0.35)));
            colors.push([r, g, b].map((v) => Math.round(v * 0.7)));
          } else if (colors.length === 2) {
            colors.push(colors[0].map((v, k) => Math.round((v + colors[1][k]) / 2)));
          }
          resolve(colors.map((c) => `rgb(${c.join(", ")})`));
        } catch (err) {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  const faviconPaletteCache = new Map();

  async function faviconPalette(tab) {
    const url = tab.getAttribute("image") || "";
    let palette = faviconPaletteCache.get(url);
    if (palette === undefined) {
      palette = await readFaviconPalette(url);
      faviconPaletteCache.set(url, palette);
    }
    return (tab.getAttribute("image") || "") === url ? palette : undefined;
  }

  async function glowSelectedTab() {
    const tab = gBrowser.selectedTab;
    if (!tab || tab.hasAttribute("zen-essential") || !Services.prefs.getBoolPref("zia.tabs.favicon-glow", false)) {
      return;
    }
    // A split is one pill: its left side glows in the left tab's colours and
    // its right side in the right tab's.
    const split = tab.closest("tab-group[split-view-group]");
    if (split) {
      const tabs = [...split.querySelectorAll(".tabbrowser-tab")];
      const palettes = await Promise.all(tabs.map(faviconPalette));
      if (!tabs.length || palettes.every((palette) => !palette)) {
        split.removeAttribute("zia-glow");
        return;
      }
      const white = "rgba(255, 255, 255, 0.23)";
      const left = palettes[0]?.[0] || white;
      const right = palettes[palettes.length - 1]?.[0] || white;
      split.style.setProperty("--zia-glow-1", left);
      split.style.setProperty("--zia-glow-2", right);
      split.style.setProperty("--zia-glow-3", palettes[0]?.[1] || palettes[palettes.length - 1]?.[1] || white);
      split.setAttribute("zia-glow", "true");
      return;
    }
    const palette = await faviconPalette(tab);
    if (palette === undefined) {
      return;
    }
    if (palette) {
      palette.forEach((color, i) => tab.style.setProperty(`--zia-glow-${i + 1}`, color));
      tab.setAttribute("zia-glow", "true");
    } else {
      tab.removeAttribute("zia-glow");
    }
  }

  function watchSelectedTabGlow() {
    gBrowser.tabContainer.addEventListener("TabSelect", glowSelectedTab);
    gBrowser.tabContainer.addEventListener("TabAttrModified", (event) => {
      if (!event.detail?.changed?.includes("image")) {
        return;
      }
      const split = gBrowser.selectedTab?.closest("tab-group[split-view-group]");
      if (event.target === gBrowser.selectedTab || (split && split.contains(event.target))) {
        glowSelectedTab();
      }
    });
    for (const type of ["TabGrouped", "TabUngrouped"]) {
      window.addEventListener(type, () => setTimeout(glowSelectedTab, 50));
    }
    const onPref = () => {
      glowSelectedTab();
      repaintSoundTabs();
    };
    Services.prefs.addObserver("zia.tabs.favicon-glow", onPref);
    window.addEventListener("unload", () => Services.prefs.removeObserver("zia.tabs.favicon-glow", onPref));
    glowSelectedTab();
  }

  const ARTWORK_WAIT_MS = 1500;

  async function updateCardGlow(card) {
    const url = artUrlOf(card);
    if (card.__ziaArtUrl === url) {
      return;
    }
    card.__ziaArtUrl = url;

    const isArtwork = !!card.querySelector(".zen-media-focus-button[zia-art]");
    if (!isArtwork) {
      if (!card.hasAttribute("zia-glow-ready")) {
        card.setAttribute("zia-glow-pending", "true");
      }
      await new Promise((resolve) => setTimeout(resolve, ARTWORK_WAIT_MS));
      if (card.__ziaArtUrl !== url) {
        return;
      }
    }

    let colors = mediaColorCache.get(url);
    if (colors === undefined) {
      colors = await readArtColors(url);
      mediaColorCache.set(url, colors);
    }
    if (card.__ziaArtUrl !== url) {
      return;
    }
    if (colors) {
      card.style.setProperty("--zia-media-glow-a", colors[0]);
      card.style.setProperty("--zia-media-glow-b", colors[1]);
    } else {
      card.style.removeProperty("--zia-media-glow-a");
      card.style.removeProperty("--zia-media-glow-b");
    }
    card.removeAttribute("zia-glow-pending");
    card.setAttribute("zia-glow-ready", "true");
    card.__ziaColors = colors;
    paintSoundBars(card, colors);
  }

  const soundBarCache = new Map();

  function lighten(color, amount = 0.35) {
    const m = String(color).match(/\d+(\.\d+)?/g);
    if (!m) {
      return "rgb(255, 255, 255)";
    }
    const [r, g, b] = m.map(Number).map((v) => Math.round(v + (255 - v) * amount));
    return `rgb(${r}, ${g}, ${b})`;
  }

  let soundBarToken = 0;
  // Four bars; they shrink into four dots when muted.
  const BAR_X = [1.6, 5.2, 8.8, 12.4];
  const BAR_W = 2;
  const BAR_REST = [
    [4.5, 7],
    [2.5, 11],
    [3.5, 9],
    [5.25, 5.5],
  ];

  function soundBarImages(colors) {
    const key = colors ? colors.join("|") : "white";
    let images = soundBarCache.get(key);
    if (images) {
      return images;
    }
    const a = colors ? lighten(colors[0]) : "rgb(255, 255, 255)";
    const b = colors ? lighten(colors[1]) : "rgb(255, 255, 255)";
    const gradient = `<defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="1.6" y1="0" x2="14.4" y2="0"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>`;
    const moving = [[0.55], [0.68], [0.5], [0.74]];
    const wave =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">${gradient}` +
      `<style>rect{transform-box:fill-box;transform-origin:center;animation:grow .26s cubic-bezier(.2,.9,.3,1) both,z .6s .26s ease-in-out infinite alternate}` +
      moving.map(([d], i) => `.b${i}{animation-duration:.26s,${d}s;animation-delay:0s,${(0.26 + i * 0.05).toFixed(2)}s}`).join("") +
      `@keyframes grow{from{height:2px;y:7px}to{height:11px;y:2.5px}}` +
      `@keyframes z{from{transform:scaleY(.22)}to{transform:scaleY(1)}}` +
      `@media (prefers-reduced-motion:reduce){rect{animation:none;transform:scaleY(.6)}}</style>` +
      `<g fill="url(#g)">` +
      BAR_X.map((x, i) => `<rect class="b${i}" x="${x}" y="2.5" width="${BAR_W}" height="11" rx="1"/>`).join("") +
      `</g></svg>`;
    const dots =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">${gradient}` +
      `<style>rect{animation:shrink .28s cubic-bezier(.4,0,.2,1) forwards}@keyframes shrink{to{height:${BAR_W}px;y:${8 - BAR_W / 2}px}}` +
      `@media (prefers-reduced-motion:reduce){rect{animation-duration:1ms}}</style>` +
      `<g fill="url(#g)">` +
      BAR_X.map((x, i) => `<rect x="${x}" y="${BAR_REST[i][0]}" width="${BAR_W}" height="${BAR_REST[i][1]}" rx="1"/>`).join("") +
      `</g></svg>`;
    const still =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">${gradient}` +
      `<g fill="url(#g)">` +
      BAR_X.map((x, i) => `<rect x="${x}" y="${BAR_REST[i][0]}" width="${BAR_W}" height="${BAR_REST[i][1]}" rx="1"/>`).join("") +
      `</g></svg>`;
    const encoded = (svg) => `data:image/svg+xml,${encodeURIComponent(svg)}`;
    images = { waveData: encoded(wave), dotsData: encoded(dots), stillData: encoded(still) };
    soundBarCache.set(key, images);
    return images;
  }

  function freshSoundBars(colors) {
    const images = soundBarImages(colors);
    const n = ++soundBarToken;
    return {
      wave: `url("${images.waveData}#${n}")`,
      dots: `url("${images.dotsData}#${n}")`,
      still: `url("${images.stillData}")`,
    };
  }

  function applyCardSoundBars(element) {
    const fresh = freshSoundBars(element.__ziaColors ?? null);
    element.style.setProperty("--zia-sound-wave", fresh.wave);
    element.style.setProperty("--zia-sound-still", fresh.still);
    element.style.setProperty("--zia-sound-muted", fresh.dots);
  }

  function watchCardSoundState(element) {
    if (element.__ziaSoundWatch) {
      return;
    }
    element.__ziaSoundWatch = true;
    let last = "";
    new MutationObserver(() => {
      const state = `${element.classList.contains("playing")}|${element.hasAttribute("muted")}`;
      if (state !== last) {
        last = state;
        applyCardSoundBars(element);
      }
    }).observe(element, { attributes: true, attributeFilter: ["class", "muted"] });
  }

  function paintSoundBars(card, colors) {
    card.__ziaColors = colors;
    applyCardSoundBars(card);
    watchCardSoundState(card);
    repaintSoundTabs();
  }

  // A tab's bars are drawn before its player has read the artwork's colours
  // (or before Zia knows which player is the tab's), so recolour them as soon
  // as either arrives. Tabs whose colours haven't changed are left alone.
  function repaintSoundTabs() {
    for (const tab of gBrowser.tabs) {
      paintTabSoundBars(tab);
    }
  }

  // The colours of the artwork playing in this tab, from its player card.
  function tabMediaColors(tab) {
    const toolbar = document.getElementById("zen-media-controls-toolbar");
    for (const element of toolbar?.querySelectorAll(".zen-media-card") || []) {
      if (element.__ziaCard?.browser === tab.linkedBrowser) {
        return element.__ziaColors ?? null;
      }
    }
    return null;
  }

  // Until the player has the artwork's colours, the site's own colours stand in.
  function tabFallbackColors(tab) {
    const url = tab.getAttribute("image") || "";
    const palette = faviconPaletteCache.get(url);
    if (palette === undefined) {
      readFaviconPalette(url).then((result) => {
        faviconPaletteCache.set(url, result);
        if (result) {
          paintTabSoundBars(tab);
        }
      });
      return null;
    }
    return palette ? [palette[0], palette[1] || palette[0]] : null;
  }

  // Tab bars are white. With the tint option on, tabs (not essentials) take
  // the artwork's colours instead.
  function applyTabSoundBars(tab) {
    const essential = tab.hasAttribute("zen-essential");
    const tinted = !essential && Services.prefs.getBoolPref("zia.tabs.favicon-glow", false);
    const colors = tinted ? tabMediaColors(tab) || tabFallbackColors(tab) : null;
    const key = `${colors ? colors.join("|") : "white"}|${essential}|${tab.hasAttribute("soundplaying")}|${tab.hasAttribute("muted")}`;
    if (tab.__ziaSoundKey === key) {
      return;
    }
    tab.__ziaSoundKey = key;
    const fresh = freshSoundBars(colors);
    tab.style.setProperty("--zia-sound-wave", fresh.wave);
    tab.style.setProperty("--zia-sound-muted", fresh.dots);
  }

  // Zen's speaker button makes way for the bars, in the same spot.
  function ensureTabSound(tab) {
    if (tab.querySelector(".zia-tab-sound")) {
      return;
    }
    const content = tab.querySelector(".tab-content");
    if (!content) {
      return;
    }
    const bars = document.createElementNS(XHTML_NS, "span");
    bars.className = "zia-tab-sound";
    bars.setAttribute("role", "button");
    bars.addEventListener("mousedown", (event) => event.stopPropagation());
    bars.addEventListener("click", (event) => {
      event.stopPropagation();
      tab.toggleMuteAudio();
    });
    const before =
      content.querySelector(":scope > .tab-audio-button") || content.querySelector(":scope > .tab-label-container");
    content.insertBefore(bars, before);
  }

  function paintTabSoundBars(tab) {
    if (tab?.hasAttribute("soundplaying") || tab?.hasAttribute("muted")) {
      ensureTabSound(tab);
      applyTabSoundBars(tab);
      const bars = tab.querySelector(".zia-tab-sound");
      bars?.setAttribute("title", tab.hasAttribute("muted") ? "Unmute tab" : "Mute tab");
    }
  }

  function watchTabSoundBars() {
    gBrowser.tabContainer.addEventListener("TabAttrModified", (event) => {
      const changed = event.detail?.changed || [];
      if (changed.includes("soundplaying") || changed.includes("muted")) {
        paintTabSoundBars(event.target);
      }
      if (changed.includes("image")) {
        for (const element of document.querySelectorAll(".zen-media-card")) {
          const card = element.__ziaCard;
          if (card?.browser === event.target.linkedBrowser) {
            try {
              card.updateIcon();
            } catch (err) {
              noteError("music and sound bars: watchTabSoundBars", err);
            }
          }
        }
      }
    });
    for (const tab of gBrowser.tabs) {
      paintTabSoundBars(tab);
    }
  }

  const SVG_NS = "http://www.w3.org/2000/svg";
  let ringCount = 0;

  function ensureRing(button) {
    if (!button || button.querySelector(":scope > .zia-ring")) {
      return;
    }
    const id = `zia-ring-gradient-${++ringCount}`;
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "zia-ring");
    svg.setAttribute("viewBox", "0 0 46 46");
    svg.setAttribute("aria-hidden", "true");

    const make = (tag, attrs, parent) => {
      const el = document.createElementNS(SVG_NS, tag);
      for (const [name, value] of Object.entries(attrs)) {
        el.setAttribute(name, value);
      }
      parent.appendChild(el);
      return el;
    };
    const gradient = make("linearGradient", { id, x1: "0", y1: "0", x2: "1", y2: "1" }, make("defs", {}, svg));
    make("stop", { offset: "0", style: "stop-color: var(--zia-media-glow-a)" }, gradient);
    make("stop", { offset: "1", style: "stop-color: var(--zia-media-glow-b)" }, gradient);
    const shape = { x: "1", y: "1", width: "44", height: "44", rx: "10", fill: "none", "stroke-width": "2", pathLength: "100" };
    make("rect", { ...shape, class: "zia-ring-track" }, svg);
    make("rect", {
      ...shape,
      class: "zia-ring-fill",
      stroke: `url(#${id})`,
      "stroke-linecap": "round",
      "stroke-dasharray": "0 100",
      "stroke-opacity": "0",
    }, svg);
    button.appendChild(svg);
  }

  const faviconTints = new Map();

  function tintFromColors(colors) {
    const m = String(colors?.[0] || "").match(/\d+(\.\d+)?/g);
    if (!m) {
      return "rgb(44, 44, 46)";
    }

    const [r, g, b] = m.map(Number).map((v) => Math.round(v * 0.32 + 26));
    return `rgb(${r}, ${g}, ${b})`;
  }

  async function showFaviconTile(card, button, art) {
    if (art) {
      button.removeAttribute("zia-favicon");
      button.removeAttribute("zia-initial");
      return;
    }
    const tab = card.browser && gBrowser.getTabForBrowser(card.browser);

    let icon =
      tab?.getAttribute("image") ||
      (tab && gBrowser.getIcon?.(tab)) ||
      card.browser?.mIconURL ||
      (card.browser?.currentURI?.spec ? `page-icon:${card.browser.currentURI.spec}` : "");
    if (/defaultFavicon|globe/i.test(icon)) {
      icon = "";
    }
    if (!icon) {
      let host = "";
      try {
        host = card.browser?.currentURI?.displayHost?.replace(/^www\./, "") || "";
      } catch (err) {
        host = "";
      }
      button.setAttribute("zia-favicon", "");
      button.setAttribute("zia-initial", (host[0] || "♪").toUpperCase());
      button.style.removeProperty("--zia-media-favicon");
      button.style.setProperty("--zia-favicon-tint", "rgb(52, 52, 56)");
      return;
    }
    button.removeAttribute("zia-initial");
    button.setAttribute("zia-favicon", icon);
    button.style.setProperty("--zia-media-favicon", `url("${icon.replace(/"/g, "%22")}")`);
    let tint = faviconTints.get(icon);
    if (!tint) {
      let colors = mediaColorCache.get(icon);
      if (colors === undefined) {
        colors = await readArtColors(icon);
        mediaColorCache.set(icon, colors);
      }
      tint = tintFromColors(colors);
      faviconTints.set(icon, tint);
    }
    if (button.getAttribute("zia-favicon") === icon) {
      button.style.setProperty("--zia-favicon-tint", tint);
    }
  }

  const FLIP_OUT_MS = 200;
  const FLIP_IN_MS = 380;

  function flipArtwork(button, swap) {
    const icon = button.querySelector(":scope > .toolbarbutton-icon") || button.querySelector("image");
    if (!icon || typeof icon.animate !== "function" || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      swap();
      return;
    }
    button.__ziaFlip?.cancel();
    const turnAway = icon.animate(
      [{ transform: "perspective(240px) rotateY(0deg)" }, { transform: "perspective(240px) rotateY(90deg)" }],
      { duration: FLIP_OUT_MS, easing: "cubic-bezier(0.55, 0, 1, 0.45)", fill: "forwards" }
    );
    button.__ziaFlip = turnAway;
    turnAway.finished
      .then(() => {
        swap();
        const turnBack = icon.animate(
          [
            { transform: "perspective(240px) rotateY(-90deg)" },
            { transform: "perspective(240px) rotateY(8deg)", offset: 0.75 },
            { transform: "perspective(240px) rotateY(0deg)" },
          ],
          { duration: FLIP_IN_MS, easing: "cubic-bezier(0.2, 0.8, 0.3, 1)" }
        );
        button.__ziaFlip = turnBack;
        turnAway.cancel();
      })
      .catch(() => {
      });
  }

  function setRing(card, fraction) {
    const fill = card.focusButton?.querySelector(".zia-ring-fill");
    if (!fill) {
      return;
    }
    const pct = Math.max(0, Math.min(1, fraction || 0)) * 100;

    fill.style.strokeDasharray = pct > 0.2 ? `${pct.toFixed(2)} 100` : "0 100";
    fill.style.strokeOpacity = pct > 0.2 ? "1" : "0";
  }

  function showTimeLeft(card) {
    const durationEl = card.durationEl;
    const bar = card.progressBar;
    if (!bar || !card.duration || card.duration >= 900_000) {
      setRing(card, 0);
      return;
    }
    const fraction = Number(bar.value) / 100;
    setRing(card, fraction);
    if (durationEl) {
      const played = fraction * card.duration;
      durationEl.textContent = `-${card.formatSecondsToTime(Math.max(0, card.duration - played))}`;
    }
  }

  function watchTimeLeft(card) {
    const el = card.currentTimeEl;
    if (!el || el.__ziaTimeLeft) {
      return;
    }
    el.__ziaTimeLeft = true;

    new MutationObserver(() => showTimeLeft(card)).observe(el, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  const isStandInArtwork = (src) =>
    !src || /^(jar|chrome|resource|moz-src):/i.test(src) || /defaultFavicon|globe/i.test(src);

  function bestArtwork(artwork) {
    if (!Array.isArray(artwork)) {
      return "";
    }
    artwork = artwork.filter((a) => !isStandInArtwork(a?.src));
    if (!artwork.length) {
      return "";
    }
    const area = (a) =>
      Math.max(
        0,
        ...String(a.sizes || "")
          .split(/\s+/)
          .map((size) => size.split("x").reduce((w, h) => (parseInt(w) || 0) * (parseInt(h) || 0)))
      );
    return [...artwork].sort((x, y) => area(y) - area(x))[0]?.src || "";
  }

  function useMediaArtwork() {
    const front = window.gZenMediaController?.frontCard;
    const proto = front && Object.getPrototypeOf(front);
    if (!proto || typeof proto.updateIcon !== "function" || proto.updateIcon.__zia) {
      return !!proto?.updateIcon?.__zia;
    }
    const originalPosition = proto.updatePosition;
    if (typeof originalPosition === "function") {
      proto.updatePosition = function (...args) {
        const result = originalPosition.apply(this, args);
        try {
          const known = this.element.__ziaCard === this;
          this.element.__ziaCard = this;
          watchTimeLeft(this);
          showTimeLeft(this);
          if (!known) {
            repaintSoundTabs();
          }
        } catch (err) {
          noteError("music and sound bars: useMediaArtwork", err);
        }
        return result;
      };
    }

    const original = proto.updateIcon;
    const patched = function () {
      original.call(this);
      if (this.element && this.element.__ziaCard !== this) {
        this.element.__ziaCard = this;
        repaintSoundTabs();
      }
      const button = this.focusButton;
      let art = "";
      try {
        art = bestArtwork(this.controller?.getMetadata?.()?.artwork);
      } catch (err) {
        noteError("music and sound bars: useMediaArtwork (2)", err);
      }
      if (!button) {
        return;
      }
      ensureRing(button);
      if (art) {
        const previous = button.getAttribute("zia-art");
        button.setAttribute("zia-art", art);
        const showArt = () => button.style.setProperty("--zia-media-art", `url("${art.replace(/"/g, "%22")}")`);
        if (previous && previous !== art) {
          flipArtwork(button, showArt);
        } else {
          showArt();
        }
      } else {
        button.removeAttribute("zia-art");
        button.style.removeProperty("--zia-media-art");
      }
      showFaviconTile(this, button, art);
    };
    patched.__zia = true;
    proto.updateIcon = patched;
    try {
      front.updateIcon();
      front.updatePosition?.();
    } catch (err) {
      noteError("music and sound bars: showArt", err);
    }
    return true;
  }

  function watchMediaGlow() {
    const toolbar = document.getElementById("zen-media-controls-toolbar");
    if (!toolbar) {
      return;
    }
    let frame = null;
    let artworkReady = false;
    const refresh = () => {
      frame = null;
      if (!artworkReady) {
        artworkReady = useMediaArtwork();
      }
      for (const card of toolbar.querySelectorAll(".zen-media-card")) {
        updateCardGlow(card);
      }
    };
    new MutationObserver(() => {
      if (!frame) {
        frame = requestAnimationFrame(refresh);
      }
    }).observe(toolbar, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["src", "style", "image", "hidden", "zia-art", "zia-favicon"],
    });
    refresh();
  }


  // A music player card could be dragged out of the sidebar like a toolbar
  // button, which took it away from Zen's media player and left the player
  // broken until Zen restarted. Nothing on the card is meant to be dragged
  // (the scrubber and buttons don't use drags), so no drag starts there.
  function keepMediaCardsInPlace() {
    window.addEventListener(
      "dragstart",
      (event) => {
        if (event.target?.closest?.("#zen-media-controls-toolbar")) {
          event.preventDefault();
          event.stopPropagation();
        }
      },
      true
    );
  }
  const TAB_DROP_TYPE = "application/x-moz-tabbrowser-tab";
  const HTML = "http://www.w3.org/1999/xhtml";
  const MAGNET_SHARE = 0.32;
  const MAGNET_PULL_X = 0.55;
  const MAGNET_PULL_Y = 0.35;

  const ZONE_EDGE = 44;
  const ZONE_ACTIVE_W = 350;
  const ZONE_ACTIVE_H = 580;

  const splitDrop = {
    overlay: null,
    zones: {},
    tab: null,
    target: null,
    lastSelect: null,
    dragStartedAt: 0,
    side: null,
    thumb: null,
    dragImageSet: false,
  };

  function draggedTabOf(event) {
    const dt = event.dataTransfer;
    if (!dt || !dt.types.includes(TAB_DROP_TYPE)) {
      return null;
    }
    try {
      return dt.mozGetDataAt(TAB_DROP_TYPE, 0) || null;
    } catch (err) {
      return null;
    }
  }

  const PRESS_SELECT_MS = 1500;

  function splitTargetFor(tab) {
    const last = splitDrop.lastSelect;
    const selectedByThisDrag =
      last &&
      last.tab === tab &&
      gBrowser.selectedTab === tab &&
      splitDrop.dragStartedAt - last.time < PRESS_SELECT_MS &&
      splitDrop.dragStartedAt >= last.time;
    const previous = last?.previous;
    if (selectedByThisDrag && previous && !previous.closing && previous.isConnected && !previous.hidden) {
      return previous;
    }
    return gBrowser.selectedTab;
  }

  function canSplitWith(tab, current = gBrowser.selectedTab) {
    const splitter = window.gZenViewSplitter;
    if (!splitter || !tab || !current || tab.closing || tab.hasAttribute("zen-empty-tab")) {
      return false;
    }
    if (tab.hasAttribute("zen-live-folder-item-id")) {
      return false;
    }

    if (tab === current && current.splitView) {
      return false;
    }

    if (tab !== current && tab.splitView && current.splitView && tab.group && tab.group === current.group) {
      return false;
    }
    const group = splitter._data?.find?.((g) => g.tabs.includes(current));
    return !(group && group.tabs.length >= (splitter.MAX_TABS || 4));
  }

  function makeZone(side) {
    const zone = document.createElementNS(HTML, "div");
    zone.className = "zia-split-zone";
    zone.setAttribute("side", side);
    const inner = document.createElementNS(HTML, "div");
    inner.className = "zia-split-zone-inner";
    const icon = document.createElementNS(HTML, "div");
    icon.className = "zia-split-zone-icon";
    const label = document.createElementNS(HTML, "div");
    label.className = "zia-split-zone-label";
    label.textContent = side === "left" ? "Add left split" : "Add right split";
    inner.append(icon, label);
    zone.appendChild(inner);
    return zone;
  }

  function ensureSplitOverlay() {
    if (splitDrop.overlay) {
      return splitDrop.overlay;
    }
    const overlay = document.createElementNS(HTML, "div");
    overlay.id = "zia-split-drop";
    splitDrop.zones.left = makeZone("left");
    splitDrop.zones.right = makeZone("right");
    overlay.append(splitDrop.zones.left, splitDrop.zones.right);

    overlay.addEventListener("dragover", onSplitDragOver);
    overlay.addEventListener("drop", onSplitDrop);
    overlay.addEventListener("dragleave", (event) => {
      if (!event.relatedTarget) {
        hideSplitDrop();
      }
    });
    document.documentElement.appendChild(overlay);
    splitDrop.overlay = overlay;
    return overlay;
  }

  const DRAG_PICTURE_W = 200;
  const DRAG_PICTURE_H = 125;
  let blankDragImage = null;
  const lastCursor = { x: 0, y: 0 };

  let lastBlankAt = 0;

  function hideSystemDragImage(dt, force = true) {
    if (!dt || (!force && Date.now() - lastBlankAt < 250)) {
      return;
    }
    lastBlankAt = Date.now();
    try {
      if (!blankDragImage) {
        blankDragImage = document.createElementNS(HTML, "canvas");
        blankDragImage.id = "zia-split-blank-drag-image";
        blankDragImage.width = 32;
        blankDragImage.height = 32;
        blankDragImage.getContext("2d").clearRect(0, 0, 32, 32);
        document.documentElement.appendChild(blankDragImage);
      }
      dt.updateDragImage(blankDragImage, 16, 16);
      splitDrop.dragImageSet = true;
    } catch (err) {
      noteError("split drop cards: hideSystemDragImage", err);
    }
  }

  function movePicture(x, y) {
    lastCursor.x = x;
    lastCursor.y = y;
    const canvas = splitDrop.thumb;
    if (canvas?.hasAttribute("following")) {
      canvas.style.translate = `${Math.round(x - DRAG_PICTURE_W / 2)}px ${Math.round(y - DRAG_PICTURE_H / 2)}px`;
    }
  }

  async function makeDragPicture(tab) {
    const width = DRAG_PICTURE_W;
    const height = DRAG_PICTURE_H;
    const canvas = splitDrop.thumb || document.createElementNS(HTML, "canvas");
    canvas.id = "zia-split-drag-picture";
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    if (!canvas.isConnected) {
      document.documentElement.appendChild(canvas);
    }
    splitDrop.thumb = canvas;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(0.5, 0.5, width - 1, height - 1, 7);
    ctx.clip();
    ctx.fillStyle = "#1f1f1f";
    ctx.fillRect(0, 0, width, height);
    try {
      const browser = tab.linkedBrowser;
      const pageW = browser?.clientWidth;
      const pageH = browser?.clientHeight;
      if (!browser?.drawSnapshot || !pageW || !pageH) {
        throw new Error("page not drawable");
      }
      const cover = Math.max(width / pageW, height / pageH);
      const cropW = width / cover;
      const cropH = height / cover;

      const scroll = scrollPositions.get(browser) || { x: 0, y: 0 };
      const bitmap = await browser.drawSnapshot(
        scroll.x + (pageW - cropW) / 2,
        scroll.y,
        cropW,
        cropH,
        cover * ratio,
        "rgb(31, 31, 31)"
      );
      if (!bitmap) {
        throw new Error("no snapshot");
      }
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close?.();
    } catch (err) {
      console.warn("[Zia] Drag picture: couldn't draw the page, showing its icon instead.", err);
      const icon = new Image();
      icon.src = tab.getAttribute("image") || "";
      await icon.decode().catch(() => {});
      if (icon.naturalWidth) {
        ctx.drawImage(icon, width / 2 - 12, height / 2 - 12, 24, 24);
      }
    }
    ctx.restore();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(0.5, 0.5, width - 1, height - 1, 7);
    ctx.stroke();
    return canvas;
  }

  function showSplitDrop(tab, event) {
    const overlay = ensureSplitOverlay();
    const box = gBrowser.tabbox.getBoundingClientRect();
    overlay.style.setProperty("--zia-drop-left", `${box.left}px`);
    overlay.style.setProperty("--zia-drop-top", `${box.top}px`);
    overlay.style.setProperty("--zia-drop-width", `${box.width}px`);
    overlay.style.setProperty("--zia-drop-height", `${box.height}px`);
    splitDrop.tab = tab;
    splitDrop.side = null;
    splitDrop.dragImageSet = false;

    const picture = makeDragPicture(tab);
    const target = splitDrop.target;
    let switched = false;
    const showTarget = () => {
      if (switched) {
        return;
      }
      switched = true;
      if (target && splitDrop.tab === tab && overlay.hasAttribute("open") && gBrowser.selectedTab !== target) {
        gBrowser.selectedTab = target;
      }
    };
    picture.finally(showTarget);
    setTimeout(showTarget, 450);
    overlay.setAttribute("open", "true");

    requestAnimationFrame(() => {
      if (overlay.hasAttribute("open")) {
        overlay.setAttribute("shown", "true");
      }
    });

    const dt = event.dataTransfer;
    picture.then((canvas) => {
      if (splitDrop.tab !== tab || !overlay.hasAttribute("open")) {
        return;
      }
      splitDrop.dataTransfer = dt;
      hideSystemDragImage(dt);
      canvas.setAttribute("following", "true");
      movePicture(lastCursor.x, lastCursor.y);
    });
  }

  function hideSplitDrop(event) {
    const overlay = splitDrop.overlay;
    if (!overlay?.hasAttribute("open")) {
      return;
    }
    overlay.removeAttribute("shown");
    overlay.removeAttribute("open");
    splitDrop.thumb?.removeAttribute("following");
    setDropSide(null);
    if (splitDrop.dragImageSet && event?.dataTransfer) {
      try {
        const original = gBrowser.tabContainer.tabDragAndDrop?.originalDragImageArgs;
        if (original) {
          event.dataTransfer.updateDragImage(...original);
        }
      } catch (err) {
        noteError("split drop cards: hideSplitDrop", err);
      }
    }
    splitDrop.tab = null;
    splitDrop.target = null;
    splitDrop.dataTransfer = null;
    splitDrop.dragImageSet = false;
  }

  function setDropSide(side, cursorX = 0, cursorY = 0) {
    splitDrop.side = side;
    const overlay = splitDrop.overlay;
    if (!overlay) {
      return;
    }
    overlay.toggleAttribute("has-side", !!side);
    for (const [name, zone] of Object.entries(splitDrop.zones)) {
      const active = name === side;
      zone.toggleAttribute("active", active);
      if (!active) {
        zone.style.setProperty("--zia-zone-tx", "0px");
        zone.style.setProperty("--zia-zone-ty", "0px");
        continue;
      }

      const box = overlay.getBoundingClientRect();
      const w = Math.min(ZONE_ACTIVE_W, box.width * 0.45);
      const h = Math.min(ZONE_ACTIVE_H, box.height * 0.86);
      const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
      let tx;
      if (name === "left") {
        const baseCentre = box.left + ZONE_EDGE + w / 2;
        tx = clamp((cursorX - baseCentre) * MAGNET_PULL_X, 8 - (box.left + ZONE_EDGE), box.width / 2 - ZONE_EDGE - w);
      } else {
        const baseCentre = box.right - ZONE_EDGE - w / 2;
        tx = clamp((cursorX - baseCentre) * MAGNET_PULL_X, -(box.width / 2 - ZONE_EDGE - w), window.innerWidth - 8 - (box.right - ZONE_EDGE));
      }
      const room = Math.max(0, box.height / 2 - h / 2 - 8);
      const ty = clamp((cursorY - (box.top + box.height / 2)) * MAGNET_PULL_Y, -room, room);
      zone.style.setProperty("--zia-zone-tx", `${tx.toFixed(1)}px`);
      zone.style.setProperty("--zia-zone-ty", `${ty.toFixed(1)}px`);
    }
  }

  function sideAt(event) {
    const box = gBrowser.tabbox.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) {
      return null;
    }
    const x = event.clientX - box.left;
    if (x < box.width * MAGNET_SHARE) {
      return "left";
    }
    if (x > box.width * (1 - MAGNET_SHARE)) {
      return "right";
    }
    return null;
  }

  function followDrag(event) {
    movePicture(event.clientX, event.clientY);
    if (splitDrop.thumb?.hasAttribute("following")) {
      hideSystemDragImage(event.dataTransfer, false);
    }
    const side = sideAt(event);
    if (side !== splitDrop.side && side) {
      Services.zen?.playHapticFeedback?.();
    }
    setDropSide(side, event.clientX, event.clientY);
  }

  function onSplitDragOver(event) {
    if (!splitDrop.tab) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
  }

  function onSplitDrop(event) {
    const tab = splitDrop.tab;
    const target = splitDrop.target;
    const side = splitDrop.side;
    event.preventDefault();
    event.stopPropagation();
    hideSplitDrop(event);
    if (!tab || !side) {
      return;
    }

    setTimeout(() => {
      try {
        splitTabToSide(tab, side, target);
      } catch (err) {
        console.error("[Zia] Split on drop failed:", err);
      }
    }, 0);
  }

  function splitTabToSide(tab, side, onTab = gBrowser.selectedTab) {
    const splitter = window.gZenViewSplitter;
    const glance = window.gZenGlanceManager;
    const base = onTab && !onTab.closing ? onTab : gBrowser.selectedTab;
    let target = glance?.getTabOrGlanceParent?.(base) ?? base;
    let dragged = glance?.getTabOrGlanceParent?.(tab) ?? tab;

    if (dragged === target) {
      const url = searchHomeUrl && newTabSearchEnabled() ? searchHomeUrl : "about:newtab";
      const newTab = gBrowser.addTrustedTab(url, { inBackground: true });
      const left = side === "left";
      splitter.splitTabs(left ? [target, newTab] : [newTab, target], "vsep", left ? 1 : 0);
      gBrowser.selectedTab = newTab;
      return;
    }

    const pair = [dragged, target];
    const anyEssential = pair.some((t) => t.hasAttribute("zen-essential"));
    const somePinned = pair.some((t) => t.pinned) && !pair.every((t) => t.pinned);
    if (anyEssential || somePinned) {
      [dragged, target] = pair.map((t) => (t.pinned ? gBrowser.duplicateTab(t, true) : t));
    }

    const left = side === "left";
    splitter.splitTabs(left ? [dragged, target] : [target, dragged], "vsep", left ? 0 : 1);
    gBrowser.selectedTab = dragged;
  }

  function watchSplitDrop() {
    if (!window.gZenViewSplitter || !gBrowser.tabbox) {
      return;
    }
    window.addEventListener(
      "dragover",
      (event) => {
        const open = splitDrop.overlay?.hasAttribute("open");
        if (!open && !Services.prefs.getBoolPref("zia.split.drop-cards", true)) {
          return;
        }
        const overPage = isOverPage(event);
        if (open) {
          if (overPage) {
            gBrowser.tabContainer.tabDragAndDrop?.clearSpaceSwitchTimer?.();
          }
          followDrag(event);
          return;
        }
        if (!overPage) {
          return;
        }
        const tab = draggedTabOf(event);
        const target = tab && splitTargetFor(tab);
        if (tab && canSplitWith(tab, target)) {
          splitDrop.target = target;
          gBrowser.tabContainer.tabDragAndDrop?.clearSpaceSwitchTimer?.();
          showSplitDrop(tab, event);
          followDrag(event);
          event.preventDefault();
          event.stopPropagation();
        }
      },
      true
    );
    window.addEventListener("dragend", hideSplitDrop, true);

    gBrowser.tabContainer.addEventListener("TabSelect", (event) => {
      splitDrop.lastSelect = { tab: event.target, previous: event.detail?.previousTab || null, time: Date.now() };
    });
    window.addEventListener("dragstart", () => (splitDrop.dragStartedAt = Date.now()), true);
    window.addEventListener(
      "drop",
      (event) => {
        if (!event.target?.closest?.("#zia-split-drop")) {
          hideSplitDrop(event);
        }
      },
      true
    );
  }

  function isOverPage(event) {
    const box = gBrowser.tabbox.getBoundingClientRect();
    const inPage =
      event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
    return inPage && !isOverCollapsedSidebar(event);
  }

  function isOverCollapsedSidebar(event) {
    if (root.getAttribute("zen-compact-mode") !== "true") {
      return false;
    }
    const toolbox = document.getElementById("navigator-toolbox");
    if (!toolbox) {
      return false;
    }
    const box = toolbox.getBoundingClientRect();

    if (box.right <= 0) {
      return false;
    }
    return event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
  }

  function shortenFindCount(findbar) {
    const label = findbar?.querySelector?.(".found-matches");
    if (!label || label.__ziaCount) {
      return;
    }
    label.__ziaCount = true;
    const update = () => {
      const numbers = (label.getAttribute("value") || label.textContent || "").match(/\d[\d,.]*/g);
      label.setAttribute("zia-count", numbers?.length >= 2 ? `${numbers[0]}/${numbers[1]}` : numbers?.[0] || "");
    };
    new MutationObserver(update).observe(label, { attributes: true, attributeFilter: ["value"], childList: true, characterData: true, subtree: true });
    update();
  }

  function watchFindBars() {
    gBrowser.tabContainer.addEventListener("TabFindInitialized", (event) => {
      shortenFindCount(gBrowser.getCachedFindBar?.(event.target));
    });
    for (const tab of gBrowser.tabs) {
      if (gBrowser.isFindBarInitialized?.(tab)) {
        shortenFindCount(gBrowser.getCachedFindBar(tab));
      }
    }
  }

  const HTML_NS = "http://www.w3.org/1999/xhtml";
  const ICONS = "chrome://sine/content/zia/icons/";
  const paneColorTimers = new WeakMap();

  function splitContainers() {
    const panels = gBrowser.tabpanels;
    if (panels?.getAttribute("zen-split-view") !== "true") {
      return [];
    }
    return [...panels.querySelectorAll(":scope > .browserSidebarContainer[zen-split='true']")].filter(
      (container) => !container.classList.contains("zen-glance-overlay")
    );
  }

  function paneBrowser(container) {
    return container.querySelector("browser");
  }

  function paneOfBrowser(browser) {
    const container = browser?.closest?.(".browserSidebarContainer");
    return container?.querySelector(":scope .zia-pane-bar") ? container : null;
  }

  function paneButton(name, label, onClick, icon = `${ICONS}${name}.svg`) {
    const button = document.createElementNS(HTML_NS, "button");
    button.className = `zia-pane-button zia-pane-${name}`;
    button.setAttribute("title", label);
    button.setAttribute("aria-label", label);
    const img = document.createElementNS(HTML_NS, "img");
    img.setAttribute("src", icon);
    img.setAttribute("alt", "");
    button.appendChild(img);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      onClick(event, button);
    });
    return button;
  }

  function createPaneBar(container) {
    const bar = document.createElementNS(HTML_NS, "div");
    bar.className = "zia-pane-bar";
    const tabOf = () => gBrowser.getTabForBrowser(paneBrowser(container));

    bar.addEventListener("mousedown", () => {
      const tab = tabOf();
      if (tab && gBrowser.selectedTab !== tab) {
        gBrowser.selectedTab = tab;
      }
    });

    bar.appendChild(
      paneButton("sidebar", "Toggle sidebar", () => {
        document.getElementById("zen-toggle-compact-mode")?.doCommand?.();
      })
    );
    bar.appendChild(paneButton("back", "Back", () => paneBrowser(container)?.goBack()));
    bar.appendChild(paneButton("forward", "Forward", () => paneBrowser(container)?.goForward()));
    bar.appendChild(
      paneButton("reload", "Reload", () => {
        const browser = paneBrowser(container);
        const tab = tabOf();
        if (tab?.hasAttribute("busy")) {
          browser?.stop();
        } else {
          browser?.reload();
        }
      })
    );

    const address = document.createElementNS(HTML_NS, "div");
    address.className = "zia-pane-address";
    const host = document.createElementNS(HTML_NS, "span");
    host.className = "zia-pane-host";
    const rest = document.createElementNS(HTML_NS, "span");
    rest.className = "zia-pane-rest";
    address.append(host, rest);
    address.addEventListener("click", () => {
      const tab = tabOf();
      if (tab && gBrowser.selectedTab !== tab) {
        gBrowser.selectedTab = tab;
      }

      requestAnimationFrame(() => {
        placeOpenedAddressBar();
        const command = document.getElementById("Browser:OpenLocation");
        if (command) {
          command.doCommand();
        } else {
          gURLBar.select();
        }
      });
    });
    bar.appendChild(address);

    const extensions = document.createElementNS(HTML_NS, "div");
    extensions.className = "zia-pane-extensions";
    bar.appendChild(extensions);

    bar.appendChild(
      paneButton(
        "copy-link",
        "Copy link",
        (event, button) => {
          try {
            copyLink(tabOf());
            showCopied(button);
          } catch (err) {
            console.error("[Zia] Copy link failed:", err);
          }
        },
        COPY_ICON
      )
    );
    bar.appendChild(
      paneButton("site-settings", "Site settings and extensions", () => {
        const tab = tabOf();
        if (tab && gBrowser.selectedTab !== tab) {
          gBrowser.selectedTab = tab;
        }
        placeOpenedAddressBar();

        requestAnimationFrame(() => document.getElementById("zen-site-data-icon-button")?.click());
      })
    );

    bar.appendChild(
      // Closes the pane's tab, as Dia's does (Zen's own only takes it out of
      // the split, into a tab of its own)
      paneButton("close", "Close", () => {
        const tab = tabOf();
        if (tab && !tab.closing) {
          gBrowser.removeTab(tab);
        }
      })
    );

    const stack = container.querySelector(".browserStack");
    const holder = stack?.parentNode || container.querySelector(".browserContainer") || container;
    holder.insertBefore(bar, holder.firstChild);
    return bar;
  }

  const paneLoads = new WeakMap();

  function setPaneProgress(container, value) {
    const address = container.querySelector(".zia-pane-address");
    if (!address) {
      return;
    }
    const state = paneLoads.get(container) || { progress: 0, timer: null };
    state.progress = Math.max(state.progress, Math.min(1, value));
    paneLoads.set(container, state);
    address.style.setProperty("--zia-load-progress", state.progress.toFixed(3));
  }

  function startPaneLoad(container) {
    const address = container.querySelector(".zia-pane-address");
    if (!address) {
      return;
    }
    const old = paneLoads.get(container);
    clearInterval(old?.timer);
    const state = { progress: 0, timer: null };
    paneLoads.set(container, state);
    address.style.setProperty("--zia-load-progress", "0");
    address.setAttribute("zia-loading", "true");
    state.startedAt = Date.now();
    setPaneProgress(container, 0.12);

    state.timer = setInterval(() => {
      if (state.progress < 0.85) {
        setPaneProgress(container, state.progress + (0.85 - state.progress) * 0.08);
      }
    }, 120);
  }

  function finishPaneLoad(container) {
    const address = container.querySelector(".zia-pane-address");
    const state = paneLoads.get(container);
    clearInterval(state?.timer);
    if (!address || !address.hasAttribute("zia-loading")) {
      return;
    }

    const shownFor = Date.now() - (state?.startedAt || 0);
    const stillThisLoad = () => paneLoads.get(container) === state;
    setTimeout(() => stillThisLoad() && setPaneProgress(container, 1), Math.max(0, 450 - shownFor));
    setTimeout(() => {
      if (!stillThisLoad()) {
        return;
      }
      address.removeAttribute("zia-loading");
      setTimeout(() => {
        if (!address.hasAttribute("zia-loading")) {
          address.style.setProperty("--zia-load-progress", "0");
          paneLoads.delete(container);
        }
      }, 320);
    }, 250 + Math.max(0, 450 - shownFor));
  }

  function updatePaneBar(container) {
    const bar = container.querySelector(".zia-pane-bar");
    const browser = paneBrowser(container);
    if (!bar || !browser) {
      return;
    }
    const tab = gBrowser.getTabForBrowser(browser);

    let host = "";
    try {
      const uri = browser.currentURI;
      if (isMultiviewURI(uri)) {
        host = "";
      } else if (uri && /^https?$/.test(uri.scheme)) {
        host = uri.displayHost.replace(/^www\./, "");
      } else if (uri && uri.spec !== "about:blank") {
        host = uri.spec;
      }
    } catch (err) {
      host = "";
    }
    const title = (browser.contentTitle || tab?.label || "").trim();

    let isHomePage = false;
    try {
      const uri = browser.currentURI;
      isHomePage = (uri.filePath === "/" || uri.filePath === "") && !uri.query && !uri.ref;
    } catch (err) {
      isHomePage = false;
    }
    bar.querySelector(".zia-pane-host").textContent = host || title || "New Tab";
    bar.querySelector(".zia-pane-rest").textContent =
      host && title && title !== host && !isHomePage ? ` / ${title}` : "";

    bar.querySelector(".zia-pane-back").disabled = !browser.canGoBack;
    bar.querySelector(".zia-pane-forward").disabled = !browser.canGoForward;
    const busy = !!tab?.hasAttribute("busy");
    const reload = bar.querySelector(".zia-pane-reload");
    reload.querySelector("img").setAttribute("src", `${ICONS}${busy ? "stop" : "reload"}.svg`);
    reload.setAttribute("title", busy ? "Stop" : "Reload");
  }

  async function colorPaneBar(container) {
    const bar = container.querySelector(".zia-pane-bar");
    const browser = paneBrowser(container);
    if (!bar || !browser) {
      return;
    }
    let reading = null;
    try {
      reading = await sampleTopColor(browser);
    } catch (err) {
      noteError("split panes: colorPaneBar", err);
    }
    if (!reading?.rgb) {
      return;
    }
    bar.style.setProperty("--zia-pane-bg", cssColor(reading.rgb));
    bar.toggleAttribute("light", wantsDarkInk(reading.rgb));
  }

  function colorPaneSoon(container, delay = 60) {
    if (!container || paneColorTimers.get(container)) {
      return;
    }
    paneColorTimers.set(
      container,
      setTimeout(() => {
        paneColorTimers.delete(container);
        colorPaneBar(container);
      }, delay)
    );
  }

  let paneFrame = null;

  function refreshPanes() {
    paneFrame = null;
    const containers = splitContainers();
    setFlag("zia-split", containers.length > 1);

    for (const bar of gBrowser.tabpanels.querySelectorAll(".zia-pane-bar")) {
      const container = bar.closest(".browserSidebarContainer");
      if (!containers.includes(container)) {
        bar.remove();
      }
    }
    if (containers.length < 2) {
      restorePaneExtensions();
      return;
    }

    let leftmost = null;
    for (const container of containers) {
      if (!container.querySelector(".zia-pane-bar")) {
        createPaneBar(container);
        colorPaneSoon(container, 0);
      }
      const rect = container.getBoundingClientRect();
      if (!leftmost || rect.left < leftmost.rect.left - 1 || (Math.abs(rect.left - leftmost.rect.left) <= 1 && rect.top < leftmost.rect.top)) {
        leftmost = { container, rect };
      }
      updatePaneBar(container);
    }
    for (const container of containers) {
      container.querySelector(".zia-pane-bar")?.toggleAttribute("first", container === leftmost?.container);
    }
    placeOpenedAddressBar(containers);
    placePaneExtensions(containers);
  }

  const PANE_EXTENSION_ITEMS = "#nav-bar-customization-target > .unified-extensions-item";
  let movedExtensions = [];
  const extensionHomes = new Map();

  function placePaneExtensions(containers) {
    const focused = containers.find((c) => c.classList.contains("deck-selected")) || containers[0];
    const slot = focused?.querySelector(".zia-pane-extensions");
    if (!slot) {
      return;
    }

    for (const node of document.querySelectorAll(PANE_EXTENSION_ITEMS)) {
      if (!extensionHomes.has(node)) {
        extensionHomes.set(node, { parent: node.parentNode, next: node.nextSibling });
        movedExtensions.push(node);
      }
    }
    for (const node of movedExtensions) {
      if (node.parentNode !== slot) {
        slot.appendChild(node);
      }
    }
  }

  function restorePaneExtensions() {
    for (const node of [...movedExtensions].reverse()) {
      const home = extensionHomes.get(node);
      if (!home?.parent?.isConnected) {
        continue;
      }
      const next = home.next?.parentNode === home.parent ? home.next : null;
      home.parent.insertBefore(node, next);
    }
    movedExtensions = [];
    extensionHomes.clear();
  }

  function placeOpenedAddressBar(containers = splitContainers()) {
    const focused = containers.find((c) => c.classList.contains("deck-selected")) || containers[0];
    const bar = focused?.querySelector(".zia-pane-bar");
    if (!bar) {
      return;
    }
    const rect = bar.getBoundingClientRect();
    root.style.setProperty("--zia-pane-url-left", `${Math.round(rect.left + 6)}px`);
    root.style.setProperty("--zia-pane-url-top", `${Math.round(rect.top + 4)}px`);
    root.style.setProperty("--zia-pane-url-width", `${Math.round(rect.width - 12)}px`);
    root.style.setProperty("--zia-pane-url-bottom", `${Math.round(window.innerHeight - rect.bottom + 4)}px`);
  }

  function schedulePanes() {
    if (!paneFrame) {
      paneFrame = requestAnimationFrame(refreshPanes);
    }
  }

  function watchSplitPanes() {
    const panels = gBrowser.tabpanels;
    if (!panels) {
      return;
    }
    new MutationObserver(schedulePanes).observe(panels, {
      attributes: true,
      subtree: true,
      attributeFilter: ["zen-split-view", "zen-split"],
    });
    gBrowser.tabContainer.addEventListener("TabSelect", schedulePanes);
    window.addEventListener("beforecustomization", restorePaneExtensions);
    window.addEventListener("aftercustomization", schedulePanes);
    gBrowser.tabContainer.addEventListener("TabAttrModified", (event) => {
      const container = paneOfBrowser(event.target.linkedBrowser);
      if (container) {
        updatePaneBar(container);
      }
    });
    window.addEventListener("resize", schedulePanes);

    const { STATE_STOP, STATE_IS_WINDOW } = Ci.nsIWebProgressListener;
    gBrowser.addTabsProgressListener({
      onProgressChange(browser, webProgress, request, curSelf, maxSelf, curTotal, maxTotal) {
        const container = paneOfBrowser(browser);
        if (container && maxTotal > 0) {
          setPaneProgress(container, 0.12 + (curTotal / maxTotal) * 0.8);
        }
      },
      onLocationChange(browser, webProgress) {
        const container = webProgress.isTopLevel && paneOfBrowser(browser);
        if (container) {
          updatePaneBar(container);
          colorPaneSoon(container, 150);
        }
      },
      onStateChange(browser, webProgress, request, stateFlags) {
        const container = webProgress.isTopLevel && paneOfBrowser(browser);
        if (!container) {
          return;
        }
        updatePaneBar(container);
        if (stateFlags & Ci.nsIWebProgressListener.STATE_START && stateFlags & STATE_IS_WINDOW) {
          startPaneLoad(container);
        }
        if (stateFlags & STATE_STOP && stateFlags & STATE_IS_WINDOW) {
          finishPaneLoad(container);
          colorPaneSoon(container, 50);
          colorPaneSoon(container, 800);
        }
      },
    });

    const onScroll = window.ziaOnPageScroll;
    window.ziaOnPageScroll = (browser, position) => {
      onScroll?.(browser, position);
      const container = paneOfBrowser(browser);
      if (container) {
        colorPaneSoon(container);
      }
    };
    const onPainted = window.ziaOnPagePainted;
    window.ziaOnPagePainted = (browser) => {
      onPainted?.(browser);
      const container = paneOfBrowser(browser);
      if (container) {
        colorPaneSoon(container, 0);
      }
    };

    schedulePanes();
  }

  function updateSpaceColored() {
    let colored = false;
    if (root.getAttribute("zen-default-theme") !== "true") {
      const value = getComputedStyle(root).getPropertyValue("--zen-primary-color").trim();
      const m = value.match(/\d+(\.\d+)?/g);
      if (m && m.length >= 3) {
        const [r, g, b] = m.slice(0, 3).map(Number);
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const saturation = max === 0 ? 0 : (max - min) / max;
        colored = saturation > 0.18 && max > 40;
      }
    }
    setFlag("zia-space-colored", colored);
    tintPipWindows();
  }

  // Tucked picture-in-picture strips take on the space's colour, when it has
  // one of its own, and follow it as you switch spaces.
  function tintPipWindows() {
    const tint = root.getAttribute("zia-space-colored") === "true"
      ? getComputedStyle(root).getPropertyValue("--zen-primary-color").trim()
      : "";
    for (const win of Services.wm.getEnumerator("Toolkit:PictureInPicture")) {
      const style = win.document?.documentElement?.style;
      if (tint) {
        style?.setProperty("--zia-space-tint", tint);
      } else {
        style?.removeProperty("--zia-space-tint");
      }
    }
  }

  function watchSpaceColor() {
    let frame = null;
    let lastKey = null;
    const schedule = () => {
      const key = `${root.getAttribute("zen-default-theme")}|${root.style.getPropertyValue("--zen-primary-color")}|${Services.prefs.getStringPref("zen.workspaces.active", "")}`;
      if (key === lastKey) {
        return;
      }
      lastKey = key;
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = null;
          updateSpaceColored();
        });
      }
    };
    new MutationObserver(schedule).observe(root, { attributes: true, attributeFilter: ["zen-default-theme", "style"] });
    window.addEventListener("ZenWorkspacesUIUpdate", schedule);
    Services.prefs.addObserver("zen.workspaces.active", schedule);
    window.addEventListener("unload", () => Services.prefs.removeObserver("zen.workspaces.active", schedule));
    schedule();
  }

  function animateEssentialsAdds() {
    const manager = window.gZenPinnedTabManager;
    if (!manager || typeof manager.addToEssentials !== "function" || manager.addToEssentials.__zia) {
      return;
    }
    let fromMenu = false;
    const original = manager.addToEssentials;
    const patched = function (tab, ...rest) {
      fromMenu = !tab;
      try {
        return original.call(this, tab, ...rest);
      } finally {
        setTimeout(() => (fromMenu = false), 0);
      }
    };
    patched.__zia = true;
    manager.addToEssentials = patched;

    window.addEventListener("TabAddedToEssentials", (event) => {
      if (!fromMenu || matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }
      const tab = event.detail?.tab || event.target;

      const hideNow = tab?.querySelector?.(".tab-stack") || tab;
      if (hideNow?.style) {
        hideNow.style.opacity = "0";
      }

      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const tile = tab?.querySelector?.(".tab-stack") || tab;
          if (!tile?.animate) {
            tile?.style?.removeProperty?.("opacity");
            return;
          }

          tile.style.willChange = "transform, opacity, filter";
          const animation = tile.animate(
            [
              { transform: "scale(0.75)", filter: "blur(5px)", opacity: 0 },
              { transform: "scale(1)", filter: "blur(0px)", opacity: 1 },
            ],
            { duration: 820, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
          );
          tile.style.removeProperty("opacity");
          const cleanUp = () => tile.style.removeProperty("will-change");
          animation.finished.then(cleanUp, cleanUp);
        })
      );
    });
  }

  const UNDO_WINDOW_MS = 10000;
  const undoState = { closedAt: 0, actions: 0, sameMoment: false, closed: [] };

  // The page a tab shows, read from its saved state so it works for tabs that
  // haven't loaded yet.
  function savedUrlOf(tab) {
    try {
      const state = JSON.parse(window.SessionStore.getTabState(tab));
      const entry = state.entries?.[(state.index || state.entries.length) - 1];
      if (entry?.url) {
        return entry.url;
      }
    } catch (err) {
      noteError("essentials and undo: savedUrlOf", err);
    }
    return tab.linkedBrowser?.currentURI?.spec || "";
  }

  // Where a closing tab lived, so undo can put it back in its folder or split.
  function closedTabRecord(tab) {
    const record = { url: savedUrlOf(tab), folder: null, split: null };
    const group = tab.group;
    if (group?.hasAttribute("split-view-group")) {
      const data = window.gZenViewSplitter?._data?.find((entry) => entry.tabs?.includes(tab));
      record.split = { key: group.id || "split", gridType: data?.gridType };
      const folder = group.group;
      if (folder?.isZenFolder) {
        record.folder = folderRecord(folder);
      }
    } else if (group?.isZenFolder) {
      record.folder = folderRecord(group);
    }
    return record;
  }

  function folderRecord(folder) {
    return {
      id: folder.id,
      label: folder.label,
      workspaceId: folder.getAttribute("zen-workspace-id") || undefined,
    };
  }

  // Firefox's own "reopen closed tab" brings back everything one close action
  // took away (a whole folder, a split, several tabs at once), not just one tab.
  function reopenLastClose() {
    try {
      if (typeof window.undoCloseTab === "function") {
        window.undoCloseTab();
        return true;
      }
    } catch (err) {
      noteError("essentials and undo: reopenLastClose", err);
    }
    try {
      if (window.SessionStore?.undoCloseTab) {
        window.SessionStore.undoCloseTab(window, 0);
        return true;
      }
    } catch (err) {
      noteError("essentials and undo: reopenLastClose (2)", err);
    }
    try {
      const command = document.getElementById("History:UndoCloseTab");
      if (command) {
        command.doCommand();
        return true;
      }
    } catch (err) {
      noteError("essentials and undo: reopenLastClose (3)", err);
    }
    return false;
  }

  // Tabs that came back loose from a split or a deleted folder go back into one.
  function regroupReopened(opened, closed) {
    const pending = [...closed];
    const matched = [];
    for (const tab of opened) {
      if (!tab.isConnected || tab.hasAttribute("zen-empty-tab")) {
        continue;
      }
      const url = savedUrlOf(tab);
      const index = pending.findIndex((record) => record.url === url);
      if (index >= 0) {
        matched.push({ tab, record: pending.splice(index, 1)[0] });
      }
    }

    const splits = new Map();
    for (const { tab, record } of matched) {
      if (record.split && !tab.group?.hasAttribute("split-view-group")) {
        const entry = splits.get(record.split.key) || { tabs: [], gridType: record.split.gridType };
        entry.tabs.push(tab);
        splits.set(record.split.key, entry);
      }
    }
    for (const { tabs, gridType } of splits.values()) {
      if (tabs.length >= 2) {
        try {
          window.gZenViewSplitter?.splitTabs(tabs, gridType, 0);
        } catch (err) {
          console.warn("[Zia] Undo close: couldn't put the split back together.", err);
        }
      }
    }

    const folders = new Map();
    for (const { tab, record } of matched) {
      const inFolder = tab.group?.isZenFolder || tab.group?.group?.isZenFolder;
      if (record.folder && !inFolder) {
        const entry = folders.get(record.folder.id) || { tabs: [], seen: new Set(), folder: record.folder };
        // A split goes into the folder as one item, so add just one of its tabs.
        const key = tab.group?.hasAttribute("split-view-group") ? tab.group : tab;
        if (!entry.seen.has(key)) {
          entry.seen.add(key);
          entry.tabs.push(tab);
        }
        folders.set(record.folder.id, entry);
      }
    }
    for (const { tabs, folder } of folders.values()) {
      try {
        const existing = document.getElementById(folder.id);
        if (existing?.isZenFolder) {
          existing.addTabs(tabs);
        } else {
          window.gZenFolders?.createFolder(tabs, { label: folder.label, workspaceId: folder.workspaceId });
        }
      } catch (err) {
        console.warn("[Zia] Undo close: couldn't put the folder back.", err);
      }
    }
  }

  function undoClosedTabs() {
    const actions = Math.max(1, undoState.actions);
    const closed = undoState.closed;
    undoState.actions = 0;
    undoState.closed = [];
    undoState.closedAt = 0;

    const opened = [];
    const onOpen = (event) => opened.push(event.target);
    gBrowser.tabContainer.addEventListener("TabOpen", onOpen);
    try {
      for (let i = 0; i < actions; i++) {
        if (!reopenLastClose()) {
          console.warn("[Zia] Undo close: this build didn't reopen the tab.");
          break;
        }
      }
    } finally {
      gBrowser.tabContainer.removeEventListener("TabOpen", onOpen);
    }
    // Give Zen a moment to finish restoring before regrouping.
    setTimeout(() => safely("regroupReopened", () => regroupReopened(opened, closed)), 250);
  }

  function watchUndoClose() {
    gBrowser.tabContainer.addEventListener("TabClose", (event) => {
      const tab = event.target;
      const url = tab.linkedBrowser?.currentURI?.spec || "";
      if (tab.hasAttribute("zen-empty-tab") || url === "about:blank" || url === "about:newtab") {
        return;
      }
      const now = Date.now();
      if (now - undoState.closedAt > 1000) {
        undoState.actions = 0;
        undoState.closed = [];
      }
      undoState.closedAt = now;
      // Tabs closed in the same moment are one action, which Firefox reopens
      // together.
      if (!undoState.sameMoment) {
        undoState.sameMoment = true;
        undoState.actions++;
        setTimeout(() => (undoState.sameMoment = false), 0);
      }
      try {
        undoState.closed.push(closedTabRecord(tab));
      } catch (err) {
        noteError("essentials and undo: watchUndoClose", err);
      }
    });

    window.addEventListener(
      "keydown",
      (event) => {
        if (Date.now() - undoState.closedAt > UNDO_WINDOW_MS || event.defaultPrevented) {
          return;
        }
        const accel = AppConstants.platform === "macosx" ? event.metaKey : event.ctrlKey;
        if (!accel || event.shiftKey || event.altKey || event.key.toLowerCase() !== "z") {
          return;
        }
        const target = event.composedTarget || event.target;
        if (target?.localName === "input" || target?.localName === "textarea" || target?.isContentEditable) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        undoClosedTabs();
      },
      true
    );
  }

  function defaultEngineName() {
    try {
      const search =
        Services.search ||
        ChromeUtils.importESModule("moz-src:///toolkit/components/search/SearchService.sys.mjs").SearchService;
      return search.defaultEngine?.name || "";
    } catch (err) {
      return "";
    }
  }

  let typedIconAsk = 0;

  async function knownIconPage(candidates) {
    const favicons = PlacesUtils?.favicons;
    if (typeof favicons?.getFaviconForPage !== "function") {
      return null;
    }
    for (const spec of candidates) {
      try {
        const icon = await favicons.getFaviconForPage(Services.io.newURI(spec));
        if (icon) {
          return spec;
        }
      } catch (err) {
        noteError("address pop up: knownIconPage", err);
      }
    }
    return null;
  }

  // The page whose saved icon stands for a typed or listed address. The icon
  // is often saved under the www. form (or the bare form) only, and not for
  // every path, so try those too. Found ones are remembered, since typing asks
  // repeatedly.
  const iconPageCache = new Map();

  async function iconPageFor(spec) {
    if (iconPageCache.has(spec)) {
      return iconPageCache.get(spec);
    }
    let url;
    try {
      url = new URL(spec);
    } catch (err) {
      return null;
    }
    const bare = url.host.replace(/^www\./i, "");
    const hosts = [url.host, url.host === bare ? `www.${bare}` : bare];
    const candidates = [spec];
    for (const h of hosts) {
      candidates.push(`${url.protocol}//${h}${url.pathname}${url.search}`, `${url.protocol}//${h}/`);
    }
    const found = await knownIconPage([...new Set(candidates)]);
    // Only found ones are kept: a site visited later gets its icon.
    if (found) {
      iconPageCache.set(spec, found);
    }
    return found;
  }

  function showTypedIcon(urlbar, spec) {
    const value = spec ? `url("page-icon:${spec}")` : "";
    if (urlbar.style.getPropertyValue("--zia-typed-icon") === value) {
      return;
    }
    if (value) {
      urlbar.style.setProperty("--zia-typed-icon", value);
    } else {
      urlbar.style.removeProperty("--zia-typed-icon");
    }
  }

  // The site's icon in the address bar while typing its address, or the
  // magnifying glass. It only changes once the icon is known, so typing
  // doesn't flash between the two.
  function updateTypedIcon() {
    const urlbar = gURLBar.textbox || document.getElementById("urlbar");
    const value = (gURLBar.value || "").trim();
    const match = value.match(/^(?:https?:\/\/)?([\w-]+(?:\.[\w-]+)+)(\/[^\s]*)?/i);
    const host = match?.[1];
    const ask = ++typedIconAsk;
    if (!host) {
      showTypedIcon(urlbar, null);
      return;
    }
    const spec = `https://${host}${match[2] || "/"}`;
    if (iconPageCache.has(spec)) {
      showTypedIcon(urlbar, iconPageCache.get(spec));
      return;
    }
    iconPageFor(spec).then((found) => {
      if (ask === typedIconAsk) {
        showTypedIcon(urlbar, found);
      }
    });
  }

  // Result rows get the default globe when the icon is saved under the other
  // form of the address (youtube.com vs www.youtube.com); point them at it.
  function fillRowIcons(results) {
    for (const img of results.querySelectorAll(".urlbarView-row .urlbarView-favicon")) {
      const src = img.getAttribute("src") || "";
      let spec = null;
      if (src.startsWith("page-icon:")) {
        spec = src.slice("page-icon:".length);
      } else if (!src || src.includes("defaultFavicon")) {
        const row = img.closest(".urlbarView-row");
        const type = row?.getAttribute("type");
        if (/^(search|tip|dynamic|tabtosearch)/.test(type || "")) {
          continue;
        }
        const text = (row?.querySelector(".urlbarView-url")?.textContent || "").trim();
        if (!/^(?:https?:\/\/)?[\w-]+(?:\.[\w-]+)+/i.test(text)) {
          continue;
        }
        spec = /^https?:/i.test(text) ? text : `https://${text}`;
      }
      if (!spec) {
        continue;
      }
      iconPageFor(spec).then((found) => {
        const icon = found && `page-icon:${found}`;
        if (icon && icon !== src && img.getAttribute("src") === src) {
          img.setAttribute("src", icon);
        }
      });
    }
  }

  function shortenEngineActions(results) {
    const name = defaultEngineName();
    if (!name) {
      return;
    }
    for (const action of results.querySelectorAll(".urlbarView-action")) {
      if (action.classList.contains("urlbarView-switchToTab") ||
          action.closest(".urlbarView-row")?.getAttribute("type") === "switchtab") {
        continue;
      }
      const text = action.textContent || "";
      if (!text || text === name) {
        continue;
      }

      if (!text.includes(name) && !action.hasAttribute("data-l10n-id")) {
        continue;
      }
      action.removeAttribute("data-l10n-id");
      action.removeAttribute("data-l10n-args");
      action.textContent = name;
    }
  }

  const POP_STEP = 0.5;
  const ALIGN_STEP = 1;
  let popIconStart = null;
  let popTextGap = null;
  let popLayout = null;

  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

  function alignTypedTextWithRows(results, passesLeft = 8) {
    const urlbar = gURLBar.textbox || document.getElementById("urlbar");

    // Keep the measured spacing between opens (it only resets when the bar's
    // size or position changes), so reopening doesn't nudge the text again.
    if (!urlbar?.hasAttribute("breakout-extend")) {
      return;
    }
    const row = results.querySelector(".urlbarView-row");
    const icon = row?.querySelector(".urlbarView-favicon, .urlbarView-type-icon");
    const title = row?.querySelector(".urlbarView-title");
    const barRect = urlbar?.getBoundingClientRect();
    const iconRect = icon?.getBoundingClientRect();
    const titleRect = title?.getBoundingClientRect();
    if (!barRect?.width || !iconRect?.width || !titleRect?.width) {
      return;
    }

    const layout = `${Math.round(barRect.left)}:${Math.round(barRect.width)}`;
    if (layout !== popLayout) {
      popLayout = layout;
      popIconStart = null;
      popTextGap = null;
    }

    if (popIconStart === null) {
      popIconStart = clamp(iconRect.left - barRect.left, 0, 60);
      popTextGap = clamp(titleRect.left - iconRect.right, 0, 40);
      urlbar.style.setProperty("--zia-pop-icon-start", `${popIconStart}px`);
      urlbar.style.setProperty("--zia-pop-text-gap", `${popTextGap}px`);
    }

    const barIcon = document.getElementById("identity-icon");
    const input = urlbar.querySelector(".urlbar-input");
    const barIconRect = barIcon?.getBoundingClientRect();
    const inputRect = input?.getBoundingClientRect();
    if (!barIconRect?.width || !inputRect?.width) {
      return;
    }
    const textLeft = inputRect.left + (parseFloat(getComputedStyle(input).paddingInlineStart) || 0);
    const iconError = iconRect.left - barIconRect.left;
    const textError = titleRect.left - textLeft;

    const gapError = textError - iconError;

    let moved = false;
    if (Math.abs(iconError) > 0.3) {
      popIconStart = clamp(popIconStart + iconError * ALIGN_STEP, 0, 60);
      urlbar.style.setProperty("--zia-pop-icon-start", `${popIconStart}px`);
      moved = true;
    }
    if (Math.abs(gapError) > 0.3) {
      popTextGap = clamp(popTextGap + gapError * ALIGN_STEP, 0, 40);
      urlbar.style.setProperty("--zia-pop-text-gap", `${popTextGap}px`);
      moved = true;
    }
    if (moved && passesLeft > 0) {
      requestAnimationFrame(() => alignTypedTextWithRows(results, passesLeft - 1));
    }
  }

  const POP_BOTTOM_WANT = 8;
  const POP_SCROLL_TRIM = 10;
  let popBottomTrim = null;

  function fitPopoverBottom(passesLeft = 8) {
    const urlbar = gURLBar.textbox || document.getElementById("urlbar");
    if (!urlbar?.hasAttribute("breakout-extend") || urlbarAtBottom()) {
      popBottomTrim = null;
      root.removeAttribute("zia-pop-scrolls");
      urlbar?.style.removeProperty("--zia-pop-bottom-trim");
      return;
    }
    const view = urlbar.querySelector(".urlbarView");
    const background = urlbar.querySelector(".urlbar-background");
    const rows = urlbar.querySelectorAll(".urlbarView-row");
    const last = rows[rows.length - 1];
    if (!view || !background || !last) {
      return;
    }

    const scrolls = [view, ...view.querySelectorAll("*")].some((el) => el.scrollHeight > el.clientHeight + 1);
    if (scrolls) {
      root.setAttribute("zia-pop-scrolls", "true");
      popBottomTrim = POP_SCROLL_TRIM;
      urlbar.style.setProperty("--zia-pop-bottom-trim", `${POP_SCROLL_TRIM}px`);
      return;
    }
    root.removeAttribute("zia-pop-scrolls");

    if (popBottomTrim === null) {
      popBottomTrim = parseFloat(getComputedStyle(urlbar).getPropertyValue("--zia-pop-bottom-trim")) || 0;
    }
    const error = background.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom - POP_BOTTOM_WANT;
    if (Math.abs(error) > 0.3 && passesLeft > 0) {
      popBottomTrim += error * POP_STEP;
      urlbar.style.setProperty("--zia-pop-bottom-trim", `${popBottomTrim}px`);
      requestAnimationFrame(() => fitPopoverBottom(passesLeft - 1));
    }
  }

  function watchTypedAddress() {
    const urlbar = gURLBar.textbox || document.getElementById("urlbar");
    const input = urlbar?.querySelector(".urlbar-input");
    if (!input) {
      return;
    }
    input.addEventListener("input", updateTypedIcon);
    urlbar.addEventListener("focus", updateTypedIcon, true);
    urlbar.addEventListener("blur", () => urlbar.style.removeProperty("--zia-typed-icon"), true);

    const results = document.getElementById("urlbar-results");
    if (results) {
      new MutationObserver(() => {
        if (urlbar.hasAttribute("zia-classic")) {
          return;
        }
        shortenEngineActions(results);
        fillRowIcons(results);
        alignTypedTextWithRows(results);
        fitPopoverBottom();

        requestAnimationFrame(() => {
          alignTypedTextWithRows(results);
          fitPopoverBottom();
        });
      }).observe(results, { childList: true, subtree: true, characterData: true });

      new MutationObserver(() => fitPopoverBottom()).observe(urlbar, {
        attributes: true,
        attributeFilter: ["breakout-extend"],
      });
    }
  }

  function applyZenDefaults() {
    const defaults = Services.prefs.getDefaultBranch("");
    const set = (name, value) => {
      try {
        defaults.setBoolPref(name, value);
      } catch (err) {
        console.error(`[Zia] Could not set default for ${name}:`, err);
      }
    };
    // The icon names cached for the Phosphor icons (before 2.42.0) aren't
    // used any more; the Tabler ones have their own file.
    IOUtils.remove(PathUtils.join(PathUtils.profileDir, "zia-icon-vectors.json"), { ignoreAbsent: true }).catch(() => {});
    set("zen.widget.mac.mono-window-controls", false);
    set("zen.urlbar.replace-newtab", !Services.prefs.getBoolPref("zia.newtab.real-tab", true));
    set("zen.splitView.enable-tab-drop", !Services.prefs.getBoolPref("zia.split.drop-cards", true));
    set("browser.urlbar.trimHttps", true);
    set("browser.urlbar.untrimOnUserInteraction.featureGate", false);
    try {
      Services.prefs.setBoolPref("browser.urlbar.untrimOnUserInteraction", false);
      Services.prefs.setBoolPref("browser.urlbar.trimHttps", true);
    } catch (err) {
      noteError("zen defaults: set", err);
    }

    for (const feature of FEATURES) {
      set(`zia.features.${feature}`, true);
    }
    // Downloads a model the first time, so it's something to opt into
    set("zia.features.folder-icon-suggest", false);

    for (const name of ZIA_OPTIONS) {
      set(name, true);
    }
    set("zia.tabs.favicon-glow", false);
    // Dimming asleep tabs was on by default for a few releases and is now
    // off: switched off once for anyone who had it from then.
    set("zia.tabs.dim-asleep", false);
    try {
      if (!Services.prefs.getBoolPref("zia.tabs.dim-asleep-reset", false)) {
        Services.prefs.clearUserPref("zia.tabs.dim-asleep");
        Services.prefs.setBoolPref("zia.tabs.dim-asleep-reset", true);
      }
    } catch (err) {
      noteError("zen defaults: dim asleep", err);
    }
    set("zia.essentials.fill-row", false);
    set("zia.essentials.split", true);
    set("zia.pip.dia-style", true);
    set("zia.pip.tuck", true);
    set("zia.multiview", true);
    // Dia's picture-in-picture has skip buttons and a progress line, which
    // Firefox only shows with its improved controls.
    set("media.videocontrols.picture-in-picture.improved-video-controls.enabled", true);
    try {
      defaults.setStringPref("zia.urlbar.position", "top");
    } catch (err) {
      noteError("zen defaults: set (2)", err);
    }
  }

  // Options in Sine's settings. All on, except the favicon glow.
  const ZIA_OPTIONS = [
    "zia.urlbar.dia-style",
    "zia.newtab.real-tab",
    "zia.tabs.sound-bars",
    "zia.toolbar.site-color",
    "zia.split.drop-cards",
    "zia.page.rounding",
  ];
  const WATCHED_OPTIONS = ["zia.urlbar.dia-style", "zia.newtab.real-tab", "zia.toolbar.site-color", "zia.split.drop-cards"];


  // ---------- Picture-in-picture: Dia's look, and tucking into the screen edge
  const PIP_PLAYER_URL = "chrome://global/content/pictureinpicture/player.xhtml";
  const PIP_SCRIPT_URL = "chrome://sine/content/zia/zia-pip.js";

  function decoratePipWindow(win) {
    try {
      if (win.__ziaPipLoaded || win.location?.href !== PIP_PLAYER_URL) {
        return;
      }
      Services.scriptloader.loadSubScript(PIP_SCRIPT_URL, win);
      tintPipWindows();
    } catch (err) {
      console.error("[Zia] Couldn't set up picture-in-picture:", err);
    }
  }
  function watchPipWindows() {
    const observer = (subject, topic) => {
      if (topic !== "domwindowopened") {
        return;
      }
      subject.addEventListener(
        "load",
        () => {
          // The player fills in its controls on load; give it a moment first.
          setTimeout(() => decoratePipWindow(subject), 0);
        },
        { once: true }
      );
    };
    Services.ww.registerNotification(observer);
    window.addEventListener("unload", () => Services.ww.unregisterNotification(observer));
    for (const win of Services.wm.getEnumerator("Toolkit:PictureInPicture")) {
      decoratePipWindow(win);
    }
  }

  // ---------- Multiview: a tab that grids up videos and live streams
  // "Add to Multiview" (on a video, the page or a tab) turns the site's video
  // into an embeddable player and adds it to the Multiview tab, a small page
  // on the repo's GitHub Pages (YouTube and Twitch only play embeds on a real
  // web address). The videos live in the page's address, so it survives
  // restarts.
  const MULTIVIEW_URL = "https://z1n-k.github.io/zia/multiview/";
  const MULTIVIEW_PREF = "zia.multiview";
  const MULTIVIEW_COLOR_PREF = "zia.multiview.icon-color";
  const MULTIVIEW_MAX = 4;
  const ZIA_BLUE = "5ab9f5";
  const TWITCH_RESERVED = new Set([
    "directory", "videos", "settings", "search", "p", "downloads", "jobs", "turbo",
    "subscriptions", "inventory", "wallet", "drops", "friends", "messages", "login", "signup",
  ]);
  const KICK_RESERVED = new Set(["categories", "browse", "following", "search", "dashboard", "settings", "category"]);

  // A video (the page it's on, its own file, where it's up to) as a Multiview
  // entry: [kind, id, seconds or 0].
  function multiviewEntry(pageSpec, mediaSpec, seconds) {
    let url;
    try {
      url = new URL(pageSpec);
    } catch (err) {
      return null;
    }
    const host = url.hostname.replace(/^(www|m|music)\./, "");
    const parts = url.pathname.split("/").filter(Boolean);
    const at = Math.max(0, Math.floor(seconds || 0));
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      const id =
        url.searchParams.get("v") ||
        (["shorts", "live", "embed"].includes(parts[0]) ? parts[1] : null);
      return id && /^[\w-]{6,}$/.test(id) ? ["yt", id, at] : null;
    }
    if (host === "youtu.be") {
      return parts[0] ? ["yt", parts[0], at] : null;
    }
    if (host === "clips.twitch.tv" && parts[0]) {
      return ["twc", parts[0] === "embed" ? url.searchParams.get("clip") : parts[0], 0];
    }
    if (host === "player.twitch.tv") {
      const channel = url.searchParams.get("channel");
      const video = url.searchParams.get("video");
      return channel ? ["tw", channel, 0] : video ? ["twv", video.replace(/^v/, ""), at] : null;
    }
    if (host === "twitch.tv") {
      if (parts[0] === "videos" && /^\d+$/.test(parts[1] || "")) {
        return ["twv", parts[1], at];
      }
      if (parts[1] === "clip" && parts[2]) {
        return ["twc", parts[2], 0];
      }
      if (parts[0] && !TWITCH_RESERVED.has(parts[0].toLowerCase())) {
        return ["tw", parts[0].toLowerCase(), 0];
      }
      return null;
    }
    if (host === "kick.com" || host === "player.kick.com") {
      return parts[0] && !KICK_RESERVED.has(parts[0].toLowerCase()) ? ["kick", parts[0].toLowerCase(), 0] : null;
    }
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const id = parts.find((part) => /^\d+$/.test(part));
      return id ? ["vm", id, at] : null;
    }
    if (host === "dailymotion.com" || host === "dai.ly") {
      const id = host === "dai.ly" ? parts[0] : parts.includes("video") ? parts[parts.indexOf("video") + 1] : null;
      return id ? ["dm", id.split("_")[0], at] : null;
    }
    // Anything else: the video's own file, if it's a whole video file (not
    // one chunk of a stream, which is all many sites' players load at once).
    if (/^https?:\/\/[^?#]+\.(mp4|m4v|webm|ogv|ogg|mov)([?#]|$)/i.test(mediaSpec || "")) {
      return ["file", mediaSpec, at];
    }
    return null;
  }

  // Where the tab's playing video is up to (0 for live streams).
  function multiviewPosition(browser) {
    try {
      const state = browser?.browsingContext?.mediaController?.getPositionState();
      if (state && Number.isFinite(state.duration) && state.duration > 0 && state.duration < 1e7) {
        return state.position;
      }
    } catch (err) {
      // (no media playing: Firefox says so by throwing, nothing's wrong)
      if (err?.result !== Cr.NS_ERROR_NOT_AVAILABLE) {
        noteError("multiview: multiviewPosition", err);
      }
    }
    return 0;
  }

  // The Multiview page is Zia's own, so the address bar, split panes and hover
  // cards show it by name rather than as a github.io address.
  function isMultiviewURI(uri) {
    try {
      return !!uri?.spec?.startsWith(MULTIVIEW_URL);
    } catch (err) {
      return false;
    }
  }

  const multiviewKey = (entry) => `${entry[0]}:${entry[1]}`;

  // Entries are [kind, id, seconds, title]. In the address:
  // #~colour,kind:id@seconds;title,...
  function multiviewEntries(spec) {
    const hash = (spec.split("#")[1] || "").trim();
    return hash
      .split(",")
      .filter((item) => item && !item.startsWith("~"))
      .map((item) => {
        const [body, title] = item.split(";");
        const [head, at] = body.split("@");
        const [kind, id] = head.split(":");
        return kind && id ? [kind, decodeURIComponent(id), Number(at) || 0, title ? decodeURIComponent(title) : ""] : null;
      })
      .filter(Boolean);
  }

  // The colour the Multiview tab fills its grid icon with, one square per
  // video: Zia's blue, or the space's own colour.
  function multiviewColor() {
    let choice = "zia";
    try {
      choice = Services.prefs.getStringPref(MULTIVIEW_COLOR_PREF, "zia");
    } catch (err) {
      noteError("multiview: multiviewColor", err);
    }
    if (choice === "space" && root.getAttribute("zen-default-theme") !== "true") {
      const m = getComputedStyle(root).getPropertyValue("--zen-primary-color").match(/\d+(\.\d+)?/g);
      if (m && m.length >= 3) {
        return m
          .slice(0, 3)
          .map((n) => Math.round(Math.min(255, Number(n))).toString(16).padStart(2, "0"))
          .join("");
      }
    }
    return ZIA_BLUE;
  }

  function multiviewSpec(entries) {
    const items = entries.map(
      ([kind, id, at, title]) =>
        `${kind}:${encodeURIComponent(id)}${at ? `@${Math.floor(at)}` : ""}${title ? `;${encodeURIComponent(title)}` : ""}`
    );
    return `${MULTIVIEW_URL}#${[`~${multiviewColor()}`, ...items].join(",")}`;
  }

  // Only the address's # part changes, so the page updates without
  // reloading its players.
  function setMultiviewSpec(tab, spec) {
    if (tab.linkedBrowser.currentURI.spec !== spec) {
      tab.linkedBrowser.fixupAndLoadURIString(spec, {
        triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      });
    }
  }

  const findMultiviewTab = () => gBrowser.visibleTabs.find(isMultiviewTab);

  function currentMultiview() {
    const tab = findMultiviewTab();
    return tab ? multiviewEntries(tab.linkedBrowser.currentURI.spec) : [];
  }

  function recolorMultiview(tab) {
    // Not unloaded tabs: changing their address would load them.
    if (isMultiviewTab(tab) && !tab.hasAttribute("pending")) {
      setMultiviewSpec(tab, multiviewSpec(multiviewEntries(tab.linkedBrowser.currentURI.spec)));
    }
  }

  function isMultiviewTab(tab) {
    return tab?.linkedBrowser?.currentURI?.spec?.startsWith(MULTIVIEW_URL);
  }

  // Adds a video, or with `replace` puts it in that video's place; the other
  // tiles keep playing.
  function addToMultiview(entry, replace = -1) {
    const tab = findMultiviewTab();
    if (!tab) {
      gBrowser.selectedTab = gBrowser.addTrustedTab(multiviewSpec([entry]), {
        triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      });
      return;
    }
    const entries = multiviewEntries(tab.linkedBrowser.currentURI.spec);
    if (!entries.some((item) => multiviewKey(item) === multiviewKey(entry))) {
      if (replace >= 0 && replace < entries.length) {
        entries[replace] = entry;
      } else if (entries.length < MULTIVIEW_MAX) {
        entries.push(entry);
      }
    }
    setMultiviewSpec(tab, multiviewSpec(entries));
    gBrowser.selectedTab = tab;
  }

  // A tab's title without its site's name or unread count, for labels.
  function multiviewTitle(tab) {
    return (tab?.label || "")
      .replace(/^\(\d+\+?\)\s*/, "")
      .replace(/\s*[-–|•]\s*(YouTube|Twitch|Kick|Vimeo|Dailymotion)\s*$/i, "")
      .trim()
      .slice(0, 120);
  }

  function multiviewSite([kind, id]) {
    switch (kind) {
      case "yt":
        return "YouTube";
      case "tw":
        return `twitch.tv/${id}`;
      case "twv":
        return "Twitch video";
      case "twc":
        return "Twitch clip";
      case "kick":
        return `kick.com/${id}`;
      case "vm":
        return "Vimeo";
      case "dm":
        return "Dailymotion";
      default:
        try {
          return new URL(id).hostname.replace(/^www\./, "");
        } catch (err) {
          return "Video";
        }
    }
  }

  function multiviewLabel(entry) {
    const site = multiviewSite(entry);
    const title = entry[3];
    if (!title || title.toLowerCase() === site.toLowerCase()) {
      return site;
    }
    return `${title.length > 60 ? `${title.slice(0, 59)}…` : title} — ${site}`;
  }

  function tabMultiviewEntry(tab) {
    const browser = tab?.linkedBrowser;
    if (!browser || isMultiviewTab(tab)) {
      return null;
    }
    const entry = multiviewEntry(browser.currentURI?.spec, null, multiviewPosition(browser));
    return entry && [...entry, multiviewTitle(tab)];
  }

  // "Add to Multiview", or once it holds four, "Replace in Multiview" with
  // the four videos to choose from.
  function attachMultiviewMenu(menu, anchor, idPrefix, readEntry) {
    let pending = null;
    const item = document.createXULElement("menuitem");
    item.id = `${idPrefix}-multiview`;
    item.setAttribute("label", "Add to Multiview");
    item.setAttribute("accesskey", "M");
    item.addEventListener("command", () => pending && addToMultiview(pending));

    const replaceMenu = document.createXULElement("menu");
    replaceMenu.id = `${idPrefix}-multiview-replace`;
    replaceMenu.setAttribute("label", "Replace in Multiview");
    replaceMenu.setAttribute("accesskey", "M");
    const replacePopup = document.createXULElement("menupopup");
    replaceMenu.appendChild(replacePopup);

    if (anchor) {
      anchor.after(item, replaceMenu);
    } else {
      menu.append(item, replaceMenu);
    }

    menu.addEventListener("popupshowing", (event) => {
      if (event.target !== menu) {
        return;
      }
      pending = readEntry();
      const current = currentMultiview();
      const already = !!pending && current.some((entry) => multiviewKey(entry) === multiviewKey(pending));
      const full = !!pending && !already && current.length >= MULTIVIEW_MAX;
      item.hidden = !pending || full;
      replaceMenu.hidden = !full;
      if (!full) {
        return;
      }
      replacePopup.replaceChildren(
        ...current.map((entry, index) => {
          const choice = document.createXULElement("menuitem");
          choice.setAttribute("label", multiviewLabel(entry));
          choice.addEventListener("command", () => addToMultiview(pending, index));
          return choice;
        })
      );
    });
  }

  function watchMultiview() {
    const enabled = () => Services.prefs.getBoolPref(MULTIVIEW_PREF, true);

    // Right-clicking a video, or the page of a video site. (YouTube shows its
    // own menu first; right-click again for this one.)
    const pageMenu = document.getElementById("contentAreaContextMenu");
    if (pageMenu) {
      attachMultiviewMenu(pageMenu, document.getElementById("context-video-pictureinpicture"), "zia-context", () => {
        const context = window.gContextMenu;
        if (!enabled() || !context || context.isTextSelected || context.onLink || context.onImage) {
          return null;
        }
        const browser = context.browser;
        const framePage = context.contentData?.docLocation;
        const topPage = browser?.currentURI?.spec;
        if (!topPage || topPage.startsWith(MULTIVIEW_URL)) {
          return null;
        }
        const at = multiviewPosition(browser);
        let entry;
        if (context.onVideo) {
          // The site first (the frame the video is in, then the page), and
          // only then the video's own file.
          entry =
            (framePage && multiviewEntry(framePage, null, at)) ||
            multiviewEntry(topPage, null, at) ||
            multiviewEntry(topPage, context.mediaURL, at);
        } else {
          entry = multiviewEntry(topPage, null, at);
          entry = entry && entry[0] !== "file" ? entry : null;
        }
        return entry && [...entry, multiviewTitle(gBrowser.getTabForBrowser(browser))];
      });
    }

    // Right-clicking a tab
    const tabMenu = document.getElementById("tabContextMenu");
    if (tabMenu) {
      const anchor = document.getElementById("context_duplicateTab") || document.getElementById("context_reloadTab");
      attachMultiviewMenu(tabMenu, anchor, "zia-tab", () => {
        const entry = enabled() && tabMultiviewEntry(window.TabContextMenu?.contextTab);
        return entry && entry[0] !== "file" ? entry : null;
      });
    }

    // Keep the grid icon's colour current: when the Multiview tab is shown
    // (the space may have changed colour) and when the setting changes.
    gBrowser.tabContainer.addEventListener("TabSelect", (event) => recolorMultiview(event.target));
    const onColorPref = () => {
      for (const tab of gBrowser.tabs) {
        recolorMultiview(tab);
      }
    };
    Services.prefs.addObserver(MULTIVIEW_COLOR_PREF, onColorPref);
    window.addEventListener("unload", () => Services.prefs.removeObserver(MULTIVIEW_COLOR_PREF, onColorPref));
  }

  const URLBAR_POSITION_PREF = "zia.urlbar.position";

  function watchUrlbarPosition() {
    const apply = () => {
      let position = "top";
      try {
        position = Services.prefs.getStringPref(URLBAR_POSITION_PREF, "top");
      } catch (err) {
        noteError("options: apply", err);
      }
      root.setAttribute("zia-urlbar-position", position === "bottom" ? "bottom" : "top");
      requestAnimationFrame(() => {
        rememberClosedText();
        schedulePanes();
      });
    };
    apply();
    Services.prefs.addObserver(URLBAR_POSITION_PREF, apply);
    window.addEventListener("unload", () => Services.prefs.removeObserver(URLBAR_POSITION_PREF, apply));
  }

  function watchOptions() {
    const urlbar = gURLBar?.textbox || document.getElementById("urlbar");
    const apply = () => {
      urlbar?.toggleAttribute("zia-classic", !Services.prefs.getBoolPref("zia.urlbar.dia-style", true));
      // Off gives Cmd/Ctrl+T back to Zen's floating address bar, and tab
      // drops on the page back to Zen's own split.
      try {
        const defaults = Services.prefs.getDefaultBranch("");
        defaults.setBoolPref("zen.urlbar.replace-newtab", !Services.prefs.getBoolPref("zia.newtab.real-tab", true));
        defaults.setBoolPref("zen.splitView.enable-tab-drop", !Services.prefs.getBoolPref("zia.split.drop-cards", true));
      } catch (err) {
        noteError("options: apply (2)", err);
      }
    };
    const onChange = () => {
      apply();
      appliedColorKey = null;
      updateColor();
    };
    apply();
    for (const name of WATCHED_OPTIONS) {
      Services.prefs.addObserver(name, onChange);
    }
    window.addEventListener("unload", () => {
      for (const name of WATCHED_OPTIONS) {
        Services.prefs.removeObserver(name, onChange);
      }
    });
  }

  const FEATURES = ["media-player", "find-bar", "icon-picker", "undo-close", "folder-icon-suggest", "tab-hover-cards"];

  function featureOn(name) {
    try {
      return Services.prefs.getBoolPref(`zia.features.${name}`, true);
    } catch (err) {
      return true;
    }
  }

  function ifOn(feature, name, fn) {
    if (featureOn(feature)) {
      safely(name, fn);
    }
  }

  function addDownloadProgress() {
    const button = document.getElementById("downloads-button");
    const commons = window.DownloadsCommon;
    if (!button || !commons?.getData) {
      return;
    }

    const NS = "http://www.w3.org/2000/svg";
    const ring = document.createElementNS(NS, "svg");
    ring.id = "zia-download-ring";
    ring.setAttribute("viewBox", "0 0 100 100");
    const track = document.createElementNS(NS, "circle");
    const arc = document.createElementNS(NS, "circle");

    const RADIUS = 46;
    const STROKE = 7;
    for (const circle of [track, arc]) {
      circle.setAttribute("cx", "50");
      circle.setAttribute("cy", "50");
      circle.setAttribute("r", `${RADIUS}`);
      circle.setAttribute("fill", "none");
      circle.setAttribute("stroke-width", `${STROKE}`);
      ring.appendChild(circle);
    }
    track.setAttribute("class", "zia-download-ring-track");
    arc.setAttribute("class", "zia-download-ring-arc");
    arc.setAttribute("stroke-linecap", "round");

    arc.setAttribute("transform", "rotate(-90 50 50)");
    const circumference = 2 * Math.PI * RADIUS;
    arc.setAttribute("stroke-dasharray", `${circumference}`);
    arc.setAttribute("stroke-dashoffset", `${circumference}`);
    button.appendChild(ring);

    function draw(fraction) {
      arc.setAttribute("stroke-dashoffset", `${circumference * (1 - fraction)}`);
    }

    function update(downloads) {
      let done = 0;
      let total = 0;
      let running = false;
      for (const download of downloads) {
        if (download.succeeded || download.canceled || download.error) {
          continue;
        }

        if (download.hasProgress && download.totalBytes > 0) {
          done += download.currentBytes || 0;
          total += download.totalBytes;
        }
        running = true;
      }
      if (!running || total <= 0) {
        button.removeAttribute("zia-downloading");
        draw(0);
        return;
      }
      button.setAttribute("zia-downloading", "true");
      draw(Math.min(1, done / total));
    }

    const data = commons.getData(window);
    const seen = new Set();
    const view = {
      onDownloadAdded(download) {
        seen.add(download);
        update(seen);
      },
      onDownloadChanged(download) {
        seen.add(download);
        update(seen);
      },
      onDownloadRemoved(download) {
        seen.delete(download);
        update(seen);
      },
    };
    data.addView(view);
  }

  // Zia's icons are Tabler Icons (made by scripts/tabler-icons.py), each in
  // an outline and, for about a thousand of them, a solid style. The search
  // index holds every icon's name, tags and category, so "money" finds cash,
  // coins and wallet.
  //
  // They come as one file, icons/tabler-bundle.js: Sine unpacks a mod file
  // by file, and several thousand icons froze Zen for half a minute on some
  // computers (and as one file they compress to a fraction of the size).
  // Zia makes a zip of them in the profile (once per icon pack, so Zia's own
  // updates don't redo it) and reads icons straight out of it, the way
  // Firefox reads its own, at resource://zia-tabler/.
  const ICON_ROOT = "chrome://sine/content/zia/icons";
  const ICON_HOST = "zia-tabler";
  const ICON_DIR = `resource://${ICON_HOST}`;
  const ICON_STYLE_PREF = "zia.icons.style";
  let iconIndex = null;
  let iconPackReady = null;

  function iconPackPath() {
    const holder = {};
    Services.scriptloader.loadSubScript(`${ICON_ROOT}/tabler-pack.js`, holder);
    return PathUtils.join(PathUtils.profileDir, "zia-icons", `tabler-${holder.ZiaTablerPack}.zip`);
  }

  function pointAtIconPack(pack) {
    const handler = Services.io.getProtocolHandler("resource").QueryInterface(Ci.nsIResProtocolHandler);
    const jar = Services.io.newURI(`jar:${PathUtils.toFileURI(pack)}!/`);
    if (!handler.hasSubstitution(ICON_HOST) || handler.getSubstitution(ICON_HOST).spec !== jar.spec) {
      handler.setSubstitution(ICON_HOST, jar);
    }
  }

  // Folder and space icons are drawn as Zen restores them, before the rest
  // of Zia starts, so once the pack is there it's pointed at the moment this
  // script loads.
  try {
    const pack = iconPackPath();
    const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    file.initWithPath(pack);
    if (file.exists()) {
      pointAtIconPack(pack);
    }
  } catch (err) {
    noteError("icon pack: early", err);
  }

  // Anything that still asked for an icon before the pack was ready (the
  // first start with it) is drawn again.
  function redrawPackIcons() {
    const prefix = `${ICON_DIR}/`;
    for (const image of document.querySelectorAll("image, img")) {
      for (const name of ["src", "href"]) {
        const url = image.getAttribute(name);
        if (url?.startsWith(prefix)) {
          image.setAttribute(name, "");
          image.setAttribute(name, url);
          if (image.style.opacity === "0") {
            image.style.opacity = "1";
          }
        }
      }
    }
  }

  // The bundle's icons as a zip ({outline,filled}/name.svg and the LICENSE),
  // stored rather than compressed: it's only ever read from the profile.
  let crcTable = null;
  const crc32 = (bytes) => {
    if (!crcTable) {
      crcTable = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
          c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        crcTable[n] = c >>> 0;
      }
    }
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  };

  function zipOf(entries) {
    const encoder = new TextEncoder();
    const items = entries.map(([name, text]) => {
      const nameBytes = encoder.encode(name);
      const data = encoder.encode(text);
      return { nameBytes, data, crc: crc32(data) };
    });
    let size = 22;
    for (const item of items) {
      size += 30 + 46 + 2 * item.nameBytes.length + item.data.length;
    }
    const out = new Uint8Array(size);
    const view = new DataView(out.buffer);
    let at = 0;
    const u16 = (v) => {
      view.setUint16(at, v, true);
      at += 2;
    };
    const u32 = (v) => {
      view.setUint32(at, v, true);
      at += 4;
    };
    const DATE = 0x21; // 1 January 1980
    for (const item of items) {
      item.offset = at;
      u32(0x04034b50);
      u16(10);
      u16(0);
      u16(0);
      u16(0);
      u16(DATE);
      u32(item.crc);
      u32(item.data.length);
      u32(item.data.length);
      u16(item.nameBytes.length);
      u16(0);
      out.set(item.nameBytes, at);
      at += item.nameBytes.length;
      out.set(item.data, at);
      at += item.data.length;
    }
    const directory = at;
    for (const item of items) {
      u32(0x02014b50);
      u16(20);
      u16(10);
      u16(0);
      u16(0);
      u16(0);
      u16(DATE);
      u32(item.crc);
      u32(item.data.length);
      u32(item.data.length);
      u16(item.nameBytes.length);
      u16(0);
      u16(0);
      u16(0);
      u16(0);
      u32(0o644 << 16);
      u32(item.offset);
      out.set(item.nameBytes, at);
      at += item.nameBytes.length;
    }
    const directorySize = at - directory;
    u32(0x06054b50);
    u16(0);
    u16(0);
    u16(items.length);
    u16(items.length);
    u32(directorySize);
    u32(directory);
    u16(0);
    return out;
  }

  async function packFromBundle() {
    const holder = {};
    Services.scriptloader.loadSubScript(`${ICON_ROOT}/tabler-bundle.js`, holder);
    const { head, icons } = holder.ZiaTablerBundle;
    const entries = [];
    for (const style of Object.keys(icons).sort()) {
      for (const name of Object.keys(icons[style]).sort()) {
        entries.push([`${style}/${name}.svg`, `${head[style]}${icons[style][name]}</svg>`]);
      }
    }
    try {
      entries.push(["LICENSE", await (await fetch(`${ICON_ROOT}/tabler-LICENSE`)).text()]);
    } catch (err) {
      noteError("icon pack: licence", err);
    }
    return zipOf(entries);
  }

  function setupIconPack() {
    iconPackReady ??= (async () => {
      const pack = iconPackPath();
      const dir = PathUtils.parent(pack);
      if (!(await IOUtils.exists(pack))) {
        const bytes = await packFromBundle();
        await IOUtils.makeDirectory(dir, { ignoreExisting: true });
        // written aside first, so another window never reads half a zip
        const part = `${pack}.${Math.random().toString(36).slice(2)}.part`;
        await IOUtils.write(part, bytes);
        await IOUtils.move(part, pack);
      }
      pointAtIconPack(pack);
      // Older packs go (one still open can't be removed on Windows until
      // Zen restarts; it goes next time).
      for (const child of await IOUtils.getChildren(dir)) {
        if (child !== pack && /tabler-[^/\\]*\.zip(\.[a-z0-9]+\.part)?$/.test(child)) {
          IOUtils.remove(child).catch(() => {});
        }
      }
    })();
    iconPackReady.catch((err) => noteError("icon pack", err));
    return iconPackReady;
  }

  function tablerIcons() {
    if (iconIndex) {
      return iconIndex;
    }
    const holder = {};
    try {
      Services.scriptloader.loadSubScript(`${ICON_ROOT}/tabler-names.js`, holder);
    } catch (err) {
      noteError("icon picker: load names", err);
    }
    iconIndex = (holder.ZiaTablerIcons || []).map((row) => {
      const [name, styles, words] = row.split("|");
      return { name, outline: styles.includes("o"), filled: styles.includes("f"), words: words || "" };
    });
    return iconIndex;
  }

  function iconStyle() {
    try {
      return Services.prefs.getStringPref(ICON_STYLE_PREF, "outline") === "filled" ? "filled" : "outline";
    } catch (err) {
      return "outline";
    }
  }

  // Best matches first: the name itself, then words in the name, then tags.
  function searchIcons(icons, text) {
    const terms = text.toLowerCase().split(/[\s,]+/).filter(Boolean);
    if (!terms.length) {
      return icons;
    }
    const scored = [];
    for (const icon of icons) {
      const parts = icon.name.split("-");
      let score = 0;
      for (const term of terms) {
        if (parts.includes(term)) {
          score += 3;
        } else if (parts.some((part) => part.startsWith(term))) {
          score += 2;
        } else if (icon.name.includes(term) || icon.words.includes(term)) {
          score += 1;
        } else {
          score = 0;
          break;
        }
      }
      if (score) {
        if (icon.name === terms.join("-")) {
          score += 10;
        } else if (parts[0] === terms[0]) {
          score += 1;
        }
        scored.push({ icon, score });
      }
    }
    return scored.sort((a, b) => b.score - a.score || a.icon.name.length - b.icon.name.length).map((entry) => entry.icon);
  }

  // Folders and spaces that still point at a Phosphor icon (Zia's icons
  // before 2.42.0) switch to the closest Tabler one, and ones pointing at a
  // loose Tabler file (before 2.58.0) to the same icon in the pack.
  const OLD_ICON_DIR = `${ICON_ROOT}/phosphor/`;
  const LOOSE_ICON_DIR = `${ICON_ROOT}/tabler/`;
  let oldIconMap = null;

  function tablerFor(url) {
    if (typeof url === "string" && url.startsWith(LOOSE_ICON_DIR)) {
      return `${ICON_DIR}/${url.slice(LOOSE_ICON_DIR.length)}`;
    }
    if (typeof url !== "string" || !url.startsWith(OLD_ICON_DIR)) {
      return null;
    }
    if (!oldIconMap) {
      const holder = {};
      try {
        Services.scriptloader.loadSubScript(`${ICON_ROOT}/phosphor-to-tabler.js`, holder);
      } catch (err) {
        noteError("icon picker: load old icon map", err);
      }
      oldIconMap = holder.ZiaPhosphorToTabler || {};
    }
    const name = url.slice(OLD_ICON_DIR.length).replace(/\.svg$/, "");
    return `${ICON_DIR}/outline/${oldIconMap[name] || name}.svg`;
  }

  function moveOffOldIcons() {
    for (const folder of document.querySelectorAll("zen-folder")) {
      const icon = tablerFor(folder.iconURL);
      if (icon) {
        try {
          window.gZenFolders?.setFolderUserIcon(folder, icon);
          folder.dispatchEvent(new CustomEvent("TabGroupUpdate", { bubbles: true }));
        } catch (err) {
          noteError("icon picker: move folder icon", err);
        }
      }
    }
    try {
      for (const space of window.gZenWorkspaces?.getWorkspaces?.() || []) {
        const icon = tablerFor(space.icon);
        if (icon) {
          space.icon = icon;
          window.gZenWorkspaces.saveWorkspace(space);
        }
      }
    } catch (err) {
      noteError("icon picker: move space icons", err);
    }
  }

  function watchOldIcons() {
    let queued = false;
    const queue = () => {
      if (!queued) {
        queued = true;
        setTimeout(() => {
          queued = false;
          setupIconPack().finally(moveOffOldIcons);
        }, 500);
      }
    };
    gBrowser.tabContainer.addEventListener("TabGroupCreate", queue);
    window.addEventListener("ZenWorkspacesUIUpdate", queue);
    window.SessionStore?.promiseAllWindowsRestored?.then(queue, queue);
    queue();
    // Icons asked for before the pack was ready are drawn again once it is,
    // including after the session's folders and spaces have come back.
    const redraw = () => {
      redrawPackIcons();
      placeWorkspaceIndicator();
    };
    setupIconPack().then(() => {
      redraw();
      window.SessionStore?.promiseAllWindowsRestored?.then(() => setTimeout(redraw, 300), () => {});
    }, () => {});
  }

  function addIconPicker() {
    const picker = window.gZenEmojiPicker;
    const panel = document.getElementById("PanelUI-zen-emojis-picker");
    const pages = document.getElementById("PanelUI-zen-emojis-picker-pages");
    const tabs = document.getElementById("PanelUI-zen-emojis-buttons-wrapper");
    const search = document.getElementById("PanelUI-zen-emojis-picker-search");
    if (!picker || !panel || !pages || !tabs) {
      return;
    }

    const tab = document.createXULElement("toolbarbutton");
    tab.id = "zia-icons-tab";
    tab.setAttribute("label", "Zia");
    tabs.appendChild(tab);

    function nameZenTab() {
      const zenTab = document.getElementById("PanelUI-zen-emojis-picker-change-svg");
      if (zenTab && zenTab.getAttribute("label") !== "Zen") {
        zenTab.removeAttribute("data-l10n-id");
        zenTab.removeAttribute("data-l10n-args");
        zenTab.setAttribute("label", "Zen");
      }
    }

    const HTML = "http://www.w3.org/1999/xhtml";
    const page = document.createXULElement("vbox");
    page.id = "zia-icons-page";
    const bar = document.createElementNS(HTML, "div");
    bar.id = "zia-icons-searchbar";
    const box = document.createElementNS(HTML, "input");
    box.id = "zia-icons-search";
    box.setAttribute("type", "text");
    box.setAttribute("placeholder", "Search icons");
    // Outline or solid, remembered
    const styles = document.createElementNS(HTML, "div");
    styles.id = "zia-icons-style";
    const styleButtons = {};
    for (const [value, label] of [["outline", "Outline"], ["filled", "Solid"]]) {
      const button = document.createElementNS(HTML, "button");
      button.className = "zia-icons-style-option";
      button.textContent = label;
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        try {
          Services.prefs.setStringPref(ICON_STYLE_PREF, value);
        } catch (err) {
          noteError("icon picker: save style", err);
        }
        showStyle();
        render();
      });
      styleButtons[value] = button;
      styles.appendChild(button);
    }
    bar.append(box, styles);
    const grid = document.createElementNS(HTML, "div");
    grid.id = "zia-icons-grid";
    const empty = document.createElementNS(HTML, "div");
    empty.id = "zia-icons-empty";
    empty.textContent = "No icons found";
    empty.hidden = true;
    page.append(bar, grid, empty);
    pages.appendChild(page);

    function showStyle() {
      const current = iconStyle();
      for (const [value, button] of Object.entries(styleButtons)) {
        button.toggleAttribute("selected", value === current);
      }
    }

    let showing = false;
    let picked = false;
    let resolvePick = null;
    let options = null;

    function choose(url) {
      picked = true;
      options?.onSelect?.(url);
      resolvePick?.(url);
      if (options?.closeOnSelect !== false) {
        panel.hidePopup();
      }
    }

    // Results are added a screenful at a time as the grid scrolls, so the
    // thousands of icons never load at once.
    const BATCH = 180;
    let results = [];
    let shown = 0;
    let lastQuery = null;
    const more = document.createElementNS(HTML, "div");
    more.id = "zia-icons-more";
    const moreWatcher = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          addMore();
        }
      },
      { root: grid, rootMargin: "200px" }
    );
    moreWatcher.observe(more);

    function addMore() {
      if (shown >= results.length) {
        return;
      }
      const style = iconStyle();
      const fragment = document.createDocumentFragment();
      for (const icon of results.slice(shown, shown + BATCH)) {
        const url = `${ICON_DIR}/${style}/${icon.name}.svg`;
        const item = document.createXULElement("toolbarbutton");
        item.className = "toolbarbutton-1 zen-emojis-picker-svg zia-icon-item";
        item.setAttribute("tooltiptext", icon.name.replace(/-/g, " "));
        item.style.listStyleImage = `url(${url})`;
        item.addEventListener("command", () => choose(url));
        fragment.appendChild(item);
      }
      shown = Math.min(results.length, shown + BATCH);
      grid.insertBefore(fragment, more);
    }

    function render() {
      const style = iconStyle();
      const query = `${style}:${(box.value || "").trim()}`;
      if (query === lastQuery) {
        return;
      }
      lastQuery = query;
      results = searchIcons(tablerIcons().filter((icon) => icon[style]), box.value || "");
      shown = 0;
      grid.replaceChildren(more);
      grid.scrollTop = 0;
      empty.hidden = results.length > 0;
      addMore();
    }

    function show() {
      showing = true;
      showStyle();
      render();
      box.focus({ preventScroll: true });
      page.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
      tab.classList.add("selected");
      for (const other of tabs.children) {
        if (other !== tab) {
          other.classList.remove("selected");
        }
      }
    }

    tab.addEventListener("command", show);

    panel.addEventListener("command", (event) => {
      if (event.target === tab) {
        return;
      }
      if (event.target.id?.startsWith("PanelUI-zen-emojis-picker-change")) {
        showing = false;
        tab.classList.remove("selected");
      }
    });

    function matchZenSearch() {
      const zenBox = document.getElementById("PanelUI-zen-emojis-picker-search");
      if (!zenBox) {
        return;
      }
      const from = getComputedStyle(zenBox);
      for (const prop of [
        "appearance", "padding", "border", "borderRadius", "backgroundColor",
        "backgroundImage", "color", "font", "fontSize", "fontFamily",
        "boxShadow", "outline", "minHeight", "height", "lineHeight",
      ]) {
        const value = from[prop];
        if (value && value !== "auto") {
          box.style[prop] = value;
        }
      }

      const rect = zenBox.getBoundingClientRect();
      if (rect.height > 0) {
        box.style.boxSizing = "border-box";
        box.style.height = `${rect.height}px`;
        box.style.minHeight = `${rect.height}px`;
      }

      const header = document.getElementById("PanelUI-zen-emojis-picker-header");
      if (header) {
        const row = getComputedStyle(header);
        for (const prop of ["padding", "gap", "alignItems"]) {
          if (row[prop]) {
            bar.style[prop] = row[prop];
          }
        }
      }
      const zenList = document.getElementById("PanelUI-zen-emojis-picker-svgs");
      if (zenList) {
        const list = getComputedStyle(zenList);
        for (const prop of ["padding", "gap", "gridTemplateColumns"]) {
          if (list[prop]) {
            grid.style[prop] = list[prop];
          }
        }
      }
    }

    box.addEventListener("input", render);

    search?.addEventListener("input", () => {
      if (showing) {
        box.value = search.value;
        render();
      }
    });

    panel.addEventListener("popupshowing", () => {
      nameZenTab();
      matchZenSearch();
    });

    panel.addEventListener("popupshown", () => {
      nameZenTab();
      matchZenSearch();
      showing = false;
      tab.classList.remove("selected");
      if (search && lastQuery !== null) {
        render();
      }
    });

    const openPicker = picker.open.bind(picker);
    picker.open = function (anchor, settings = {}) {
      const zenPick = openPicker(anchor, settings);
      if (!zenPick) {
        return zenPick;
      }
      options = settings;
      picked = false;
      const ziaPick = new Promise((resolve) => {
        resolvePick = resolve;
      });

      return Promise.race([
        zenPick.catch((err) => {
          if (picked) {
            return ziaPick;
          }
          throw err;
        }),
        ziaPick,
      ]);
    };
  }

  function watchCompactTopRow() {
    const navBar = document.getElementById("nav-bar");
    if (!navBar) {
      return;
    }

    function inCompactMode() {
      return root.getAttribute("zen-compact-mode") === "true";
    }

    function windowButtons() {
      return window.gZenVerticalTabsManager?.actualWindowButtons || null;
    }

    function moveTopRow() {
      if (!inCompactMode()) {
        return;
      }
      const titlebar = document.getElementById("titlebar");
      const topButtons = document.getElementById("zen-sidebar-top-buttons");
      if (!titlebar || !topButtons) {
        return;
      }
      if (topButtons.parentElement !== titlebar) {
        titlebar.prepend(topButtons);
      }
      // Windows' minimise, maximise and close stay top right, where Zen puts
      // them; only macOS's traffic lights join the sidebar's top row.
      if (window.gZenVerticalTabsManager?.isWindowsStyledButtons) {
        return;
      }
      const buttons = windowButtons();
      if (buttons && buttons.parentElement !== topButtons) {
        topButtons.prepend(buttons);
      }
    }

    const watcher = new MutationObserver(() => moveTopRow());
    watcher.observe(navBar, { childList: true });

    const toolbox = document.getElementById("navigator-toolbox");
    const SIDEBAR_SHOWN_ATTRS = ["zen-has-hover", "zen-user-show", "zen-has-empty-tab", "flash-popup", "has-popup-menu", "movingtab", "zen-compact-mode-active"];

    function syncPanelOpen() {
      const shown = inCompactMode() && !!toolbox && SIDEBAR_SHOWN_ATTRS.some((name) => toolbox.hasAttribute(name));
      setFlag("zia-panel-open", shown);
      followCover();
    }

    // The top toolbar stays up while the sidebar is out, cut away only where
    // the sidebar covers it (see-through, the address showed through it).
    // It follows the sidebar as it slides, frame by frame, until it settles.
    const covered = () => [
      document.getElementById("zen-appcontent-navbar-container"),
      document.getElementById("urlbar"),
    ].filter((el) => el && !toolbox?.contains(el));
    function cutUnder(el, over) {
      let start = 0;
      let end = 0;
      if (over && el.getAttribute("breakout-extend") !== "true") {
        const box = el.getBoundingClientRect();
        const across = over.bottom > box.top && over.top < box.bottom && over.right > box.left && over.left < box.right;
        if (across) {
          const onLeft = over.left + over.width / 2 < window.innerWidth / 2;
          start = onLeft ? Math.min(box.width, Math.max(0, over.right - box.left)) : 0;
          end = onLeft ? 0 : Math.min(box.width, Math.max(0, box.right - over.left));
        }
      }
      const clip = start || end ? `inset(0 ${Math.ceil(end)}px 0 ${Math.ceil(start)}px)` : "";
      if (el.style.clipPath !== clip) {
        el.style.clipPath = clip;
      }
      return clip;
    }
    let coverFrame = 0;
    let coverStill = 0;
    let coverLast = "";
    function cover() {
      coverFrame = 0;
      // (shown, or sliding in or out: hidden, it's off screen and unseen)
      const out = inCompactMode() && toolbox && getComputedStyle(toolbox).visibility !== "hidden";
      let over = null;
      if (out) {
        // (the sidebar's own card: the toolbox's padding round it is clear)
        const box = toolbox.getBoundingClientRect();
        const style = getComputedStyle(toolbox);
        const left = box.left + (parseFloat(style.paddingLeft) || 0);
        const right = box.right - (parseFloat(style.paddingRight) || 0);
        over = { left, right, top: box.top, bottom: box.bottom, width: Math.max(0, right - left) };
      }
      const now = covered().map((el) => cutUnder(el, over && over.width ? over : null)).join("|");
      coverStill = now === coverLast ? coverStill + 1 : 0;
      coverLast = now;
      if (coverStill < 8) {
        coverFrame = requestAnimationFrame(cover);
      }
    }
    function followCover() {
      coverStill = 0;
      if (!coverFrame) {
        coverFrame = requestAnimationFrame(cover);
      }
    }

    if (toolbox) {
      const panelWatcher = new MutationObserver(syncPanelOpen);
      panelWatcher.observe(toolbox, { attributes: true, attributeFilter: SIDEBAR_SHOWN_ATTRS });
    }

    window.addEventListener("resize", followCover);
    document.getElementById("urlbar")?.addEventListener("focus", followCover, true);
    document.getElementById("urlbar")?.addEventListener("blur", followCover, true);
    if (document.getElementById("urlbar")) {
      new MutationObserver(followCover).observe(document.getElementById("urlbar"), { attributes: true, attributeFilter: ["breakout-extend"] });
    }

    const modeWatcher = new MutationObserver(() => {
      moveTopRow();
      syncPanelOpen();
    });
    modeWatcher.observe(root, { attributes: true, attributeFilter: ["zen-compact-mode"] });

    moveTopRow();
    syncPanelOpen();
  }

  const ICON_SYNONYMS = {
    flight: "plane", flights: "plane", fly: "plane", airline: "plane",
    travel: "plane", trip: "luggage", holiday: "luggage", vacation: "luggage",
    hike: "mountain", hikes: "mountain", hiking: "mountain", trail: "mountain",
    walk: "mountain", climb: "mountain", outdoors: "tree", camping: "tent",
    shop: "shopping-cart", shopping: "shopping-cart", buy: "shopping-cart",
    order: "package", orders: "package", delivery: "truck",
    money: "wallet", bank: "building-bank", budget: "wallet", invoice: "file-invoice",
    pay: "credit-card", payment: "credit-card", finance: "chart-line",
    code: "code", coding: "code", github: "brand-github", git: "git-branch",
    dev: "terminal", api: "braces", server: "server",
    docs: "file-text", doc: "file-text", notes: "note", note: "note",
    read: "book", reading: "book", book: "book", books: "books",
    music: "music", song: "music", playlist: "playlist",
    video: "video", videos: "video", film: "movie", movie: "movie",
    movies: "movie", watch: "device-tv", stream: "broadcast",
    game: "device-gamepad-2", games: "device-gamepad-2", gaming: "device-gamepad-2",
    health: "heartbeat", medical: "first-aid-kit", doctor: "stethoscope",
    fitness: "barbell", gym: "barbell", run: "run",
    food: "tools-kitchen-2", recipe: "chef-hat", recipes: "chef-hat",
    cook: "chef-hat", coffee: "coffee", drink: "beer",
    work: "briefcase", job: "briefcase", jobs: "briefcase", career: "briefcase",
    meeting: "users-group", team: "users-group", email: "mail",
    mail: "mail", inbox: "inbox", calendar: "calendar", schedule: "calendar",
    home: "home", house: "home", rent: "home", property: "building",
    car: "car", cars: "car", drive: "car", train: "train", transport: "bus",
    photo: "photo", photos: "brand-cohost", picture: "photo", design: "palette",
    art: "palette", draw: "pencil", ai: "sparkles", chat: "message-circle",
    news: "news", weather: "cloud", forecast: "cloud",
    learn: "school", course: "school", study: "school",
    school: "school", plan: "list-check", todo: "list-check",
    tasks: "list-check", project: "layout-kanban", idea: "bulb",
    settings: "settings", tools: "tool", security: "shield-check",
    password: "key", login: "login", account: "user-circle",
    pet: "paw", dog: "dog", cat: "cat", garden: "plant",
    gift: "gift", wedding: "heart", baby: "baby-bottle", kids: "baby-bottle",
  };

  const ICON_STOPWORDS = new Set([
    "the", "and", "for", "with", "from", "your", "you", "that", "this", "new",
    "how", "what", "when", "why", "are", "was", "will", "can", "all", "our",
    "www", "com", "net", "org", "html", "php", "index", "home", "page", "site",
    "search", "google", "best", "top", "free", "online", "official", "site",
    "folder", "group", "tab", "tabs", "untitled",
  ]);

  function iconWords(text) {
    return String(text || "")
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((word) => word.length > 2 && !ICON_STOPWORDS.has(word));
  }

  function folderWordWeights(folder) {
    const weights = new Map();
    const add = (text, weight) => {
      for (const word of iconWords(text)) {
        weights.set(word, (weights.get(word) || 0) + weight);
      }
    };
    add(folder.label || folder.getAttribute("label"), 3);
    for (const tab of folder.tabs || []) {
      add(tab.label, 1);
      try {
        add(tab.linkedBrowser?.currentURI?.host?.replace(/^www\./, ""), 0.5);
      } catch (err) {
        noteError("folder names local model: add", err);
      }
    }
    return weights;
  }

  // The icon names the suggestions choose from: Tabler's outline icons
  // (icon picker)
  const suggestableIcons = () => tablerIcons().filter((icon) => icon.outline);
  const iconURL = (name) => `${ICON_DIR}/outline/${name}.svg`;

  function suggestFolderIcon(folder) {
    const weights = folderWordWeights(folder);
    if (!weights.size) {
      return null;
    }
    const names = suggestableIcons().map((icon) => icon.name);
    if (!names.length) {
      return null;
    }

    let best = null;
    let bestScore = 0;
    for (const name of names) {
      const parts = name.split("-");
      let score = 0;
      for (const [word, weight] of weights) {
        if (name === word) {
          score += weight * 4;
          continue;
        }

        if (parts.includes(word)) {
          score += weight * 2;
          continue;
        }

        if (ICON_SYNONYMS[word] === name) {
          score += weight * 3;
        }
      }
      if (!score) {
        continue;
      }

      score -= (parts.length - 1) * 0.1;
      if (score > bestScore) {
        bestScore = score;
        best = name;
      }
    }

    return bestScore >= 2 ? iconURL(best) : null;
  }

  const DEFAULT_FOLDER_NAMES = /^(new folder|folder|untitled|new group)$/i;

  function titleCase(text) {
    return text
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => (word.length > 3 ? word[0].toUpperCase() + word.slice(1) : word.toUpperCase()))
      .join(" ");
  }

  function folderTabHosts(folder) {
    const hosts = [];
    for (const tab of folder.tabs || []) {
      try {
        const host = tab.linkedBrowser?.currentURI?.host?.replace(/^www\./, "");
        if (host) {
          hosts.push(host);
        }
      } catch (err) {
        noteError("folder names local model: folderTabHosts", err);
      }
    }
    return hosts;
  }

  function suggestFolderName(folder) {
    const tabs = folder.tabs || [];
    if (tabs.length < 2) {
      return null;
    }

    const hosts = folderTabHosts(folder);
    if (hosts.length === tabs.length && new Set(hosts).size === 1) {
      const parts = hosts[0].split(".");
      const brand = parts.length > 2 ? parts[parts.length - 2] : parts[0];
      if (brand && brand.length > 2) {
        return titleCase(brand);
      }
    }

    const pieces = new Map();
    for (const tab of tabs) {
      const seen = new Set();
      for (const piece of String(tab.label || "").split(/\s[-|—·]\s/)) {
        const trimmed = piece.trim();
        if (trimmed.length > 2 && trimmed.length < 30 && !seen.has(trimmed)) {
          seen.add(trimmed);
          pieces.set(trimmed, (pieces.get(trimmed) || 0) + 1);
        }
      }
    }
    for (const [piece, count] of pieces) {
      if (count === tabs.length) {
        return piece;
      }
    }

    const inside = new Map();
    for (const tab of tabs) {
      for (const word of iconWords(tab.label)) {
        inside.set(word, (inside.get(word) || 0) + 1);
      }
    }
    const outside = new Map();
    for (const tab of gBrowser.tabs) {
      if (tabs.includes(tab)) {
        continue;
      }
      for (const word of new Set(iconWords(tab.label))) {
        outside.set(word, (outside.get(word) || 0) + 1);
      }
    }
    const top = [...inside.entries()]
      .filter(([, count]) => count > 1)
      .map(([word, count]) => [word, count / (1 + (outside.get(word) || 0))])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([word]) => word);
    return top.length ? titleCase(top.join(" ")) : null;
  }

  const EMBED_CACHE = "zia-icon-vectors-tabler.json";
  const EMBED_MODEL = "Xenova/all-MiniLM-L6-v2";
  let embedEngine = null;
  let iconVectors = null;

  async function textEmbedder() {
    if (embedEngine) {
      return embedEngine;
    }
    const { createEngine } = ChromeUtils.importESModule(
      "chrome://global/content/ml/EngineProcess.sys.mjs"
    );
    embedEngine = await createEngine({
      taskName: "feature-extraction",
      featureId: "simple-text-embedder",
      modelId: EMBED_MODEL,
      dtype: "q8",
    });
    return embedEngine;
  }

  function readVectors(result, count) {
    if (!result) {
      return null;
    }
    if (Array.isArray(result) && Array.isArray(result[0])) {
      return result;
    }
    const flat = result.data || result.output || result;
    if (!flat || typeof flat.length !== "number") {
      return null;
    }
    const dims = Math.floor(flat.length / count);
    const out = [];
    for (let i = 0; i < count; i++) {
      out.push(Array.from(flat.slice(i * dims, (i + 1) * dims)));
    }
    return out;
  }

  function normalise(vector) {
    let sum = 0;
    for (const value of vector) {
      sum += value * value;
    }
    const length = Math.sqrt(sum) || 1;
    return vector.map((value) => value / length);
  }

  async function embedTexts(texts) {
    const engine = await textEmbedder();
    const result = await engine.run({
      args: [texts],
      options: { pooling: "mean", normalize: true },
    });
    const vectors = readVectors(result, texts.length);
    return vectors ? vectors.map(normalise) : null;
  }

  function cachePath() {
    return PathUtils.join(PathUtils.profileDir, EMBED_CACHE);
  }

  async function loadIconVectors() {
    if (iconVectors) {
      return iconVectors;
    }
    try {
      const raw = JSON.parse(await IOUtils.readUTF8(cachePath()));
      if (raw.model === EMBED_MODEL && raw.names?.length === suggestableIcons().length && raw.data) {
        const bytes = Uint8Array.from(atob(raw.data), (c) => c.charCodeAt(0));
        iconVectors = { names: raw.names, dims: raw.dims, data: new Int8Array(bytes.buffer) };
        return iconVectors;
      }
    } catch (err) {
      noteError("folder names local model: loadIconVectors", err);
    }
    return null;
  }

  // An icon's name and its first few search tags, which say more about what
  // it means than the name alone
  function iconPhrase(icon) {
    const tags = icon.words.split(" ").filter(Boolean).slice(0, 4);
    return `${icon.name.split("-").join(" ")} icon${tags.length ? `: ${tags.join(", ")}` : ""}`;
  }

  async function buildIconVectors() {
    const icons = suggestableIcons();
    const names = icons.map((icon) => icon.name);
    if (!names.length) {
      return null;
    }
    const all = [];
    let dims = 0;
    for (let i = 0; i < icons.length; i += 64) {
      const batch = icons.slice(i, i + 64);
      const vectors = await embedTexts(batch.map(iconPhrase));
      if (!vectors) {
        return null;
      }
      dims = vectors[0].length;
      for (const vector of vectors) {
        all.push(vector);
      }
    }

    const data = new Int8Array(all.length * dims);
    all.forEach((vector, row) => {
      vector.forEach((value, col) => {
        data[row * dims + col] = Math.max(-127, Math.min(127, Math.round(value * 127)));
      });
    });
    iconVectors = { names, dims, data };
    try {
      await IOUtils.writeUTF8(
        cachePath(),
        JSON.stringify({
          model: EMBED_MODEL,
          dims,
          names,
          data: base64(new Uint8Array(data.buffer)),
        })
      );
    } catch (err) {
      console.warn("[Zia] Couldn't save the icon vectors; they'll be built again next time.", err);
    }
    return iconVectors;
  }

  // In chunks: all the bytes at once are too many arguments for one call
  function base64(bytes) {
    let text = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(text);
  }

  function nearestIcon(vector, vectors) {
    const { names, dims, data } = vectors;
    let best = null;
    let bestScore = -1;
    for (let row = 0; row < names.length; row++) {
      let score = 0;
      for (let col = 0; col < dims; col++) {
        score += vector[col] * (data[row * dims + col] / 127);
      }
      if (score > bestScore) {
        bestScore = score;
        best = names[row];
      }
    }
    return { name: best, score: bestScore };
  }

  function folderText(folder) {
    const parts = [];
    const label = (folder.name || folder.label || "").trim();
    if (label && !DEFAULT_FOLDER_NAMES.test(label)) {
      parts.push(label);
    }
    for (const tab of (folder.tabs || []).slice(0, 8)) {
      const title = String(tab.label || "").trim();
      if (title) {
        parts.push(title);
      }
    }
    return parts.join(". ");
  }

  async function suggestIconByMeaning(folder) {
    const text = folderText(folder);
    if (!text) {
      return null;
    }
    const vectors = (await loadIconVectors()) || (await buildIconVectors());
    if (!vectors) {
      return null;
    }
    const embedded = await embedTexts([text]);
    if (!embedded) {
      return null;
    }
    const { name, score } = nearestIcon(embedded[0], vectors);

    return score >= 0.28 ? iconURL(name) : null;
  }

  let nameEngine = null;
  let nameEngineTried = false;

  async function namingEngine() {
    if (nameEngineTried) {
      return nameEngine;
    }
    nameEngineTried = true;
    const { createEngine } = ChromeUtils.importESModule(
      "chrome://global/content/ml/EngineProcess.sys.mjs"
    );
    for (const options of [
      { taskName: "text2text-generation", featureId: "smart-tab-topic" },
      { taskName: "text2text-generation" },
    ]) {
      try {
        nameEngine = await createEngine(options);
        return nameEngine;
      } catch (err) {
        console.warn("[Zia] Naming engine not available:", options, err.message);
      }
    }
    return null;
  }

  function readGeneratedText(result) {
    if (!result) {
      return "";
    }
    if (typeof result === "string") {
      return result;
    }
    if (Array.isArray(result)) {
      return readGeneratedText(result[0]);
    }
    return result.generated_text || result.text || result.output || "";
  }

  function tidyName(raw, tabs) {
    let name = String(raw || "")
      .replace(/["'`]/g, "")
      .replace(/^(a|an|the)\s+/i, "")
      .split(/[\n.:;]/)[0]
      .trim();
    if (!name) {
      return null;
    }
    const words = name.split(/\s+/).slice(0, 3);
    name = words.join(" ");

    const echoed = tabs.some((tab) => String(tab.label || "").toLowerCase().startsWith(name.toLowerCase()));
    if (name.length < 3 || name.length > 28 || echoed) {
      return null;
    }
    return titleCase(name);
  }

  async function suggestNameByModel(folder) {
    const tabs = (folder.tabs || []).slice(0, 8);
    if (tabs.length < 2) {
      return null;
    }
    const engine = await namingEngine();
    if (!engine) {
      return null;
    }
    const titles = tabs.map((tab) => `- ${String(tab.label || "").slice(0, 80)}`).join("\n");
    const prompt = `Give a short two word label for this group of browser tabs:\n${titles}\nLabel:`;
    const result = await engine.run({ args: [prompt], options: { max_new_tokens: 8 } });
    const name = tidyName(readGeneratedText(result), tabs);
    return name;
  }

  function findNameEditor(folder) {
    const roots = [folder.labelElement, folder.labelElement?.shadowRoot, folder, folder.shadowRoot];
    for (const root of roots) {
      const editor = root?.querySelector?.("input, textarea, [contenteditable='true']");
      if (editor) {
        return editor;
      }
    }
    const active = folder.ownerDocument.activeElement;
    return folder.contains(active) || folder.labelElement?.contains?.(active) ? active : null;
  }

  function renameFolder(folder, name) {
    const label = folder.labelElement;

    const editor = findNameEditor(folder);
    if (editor) {
      if ("value" in editor) {
        editor.value = name;
      } else {
        editor.textContent = name;
      }
      editor.dispatchEvent(new Event("input", { bubbles: true }));
      editor.dispatchEvent(new Event("change", { bubbles: true }));
      for (const type of ["keydown", "keypress", "keyup"]) {
        editor.dispatchEvent(
          new KeyboardEvent(type, { key: "Enter", keyCode: 13, bubbles: true })
        );
      }
      editor.blur?.();
    }

    if (typeof label?.onRenameFinished === "function") {
      label.onRenameFinished(name);
    } else {
      folder.name = name;
      folder.dispatchEvent(new CustomEvent("ZenFolderRenamed", { bubbles: true }));
    }

    for (const method of ["finishRename", "stopRename", "stopEditing", "blur"]) {
      try {
        label?.[method]?.();
      } catch (err) {
        noteError("folder names local model: renameFolder", err);
      }
    }
    label?.removeAttribute?.("editing");
    folder.removeAttribute("editing");
    folder.ownerDocument.activeElement?.blur?.();
  }

  function showFolderSkeleton(folder) {
    try {
      const container = folder.querySelector(".tab-group-label-container") || folder;
      if (container.querySelector(".zia-skeleton-overlay")) {
        return;
      }
      const doc = folder.ownerDocument;
      const containerRect = container.getBoundingClientRect();
      const iconEl = folder.querySelector(".tab-group-folder-icon");
      const iconRect = iconEl?.getBoundingClientRect();

      const label = folder.labelElement;
      const fontSize = parseFloat(getComputedStyle(label || container).fontSize) || 13;
      const size = Math.max(9, Math.round(fontSize * 0.85));

      const iconCentre = iconRect?.width
        ? iconRect.left - containerRect.left + iconRect.width / 2
        : 16;
      const iconLeft = Math.round(iconCentre - size / 2);

      const labelRect = label?.getBoundingClientRect();
      const textLeft = Math.round(
        labelRect?.width
          ? labelRect.left - containerRect.left
          : (iconRect?.right || 0) - containerRect.left + 8
      );

      const overlay = doc.createElement("div");
      overlay.className = "zia-skeleton-overlay";
      overlay.style.cssText = `position:absolute;inset:0;pointer-events:none;z-index:5;`;

      const block = (left, width, height, radius) => {
        const el = doc.createElement("div");
        el.className = "zia-skeleton-block";
        el.style.cssText =
          `position:absolute;left:${left}px;top:50%;transform:translateY(-50%);` +
          `width:${width}px;height:${height}px;border-radius:${radius}px;`;
        return el;
      };

      overlay.appendChild(block(iconLeft, size, size, Math.round(size / 3.5)));
      overlay.appendChild(block(textLeft, 88, size, Math.round(size / 3.5)));

      if (getComputedStyle(container).position === "static") {
        container.style.position = "relative";
      }
      container.setAttribute("zia-skeleton-on", "true");
      container.appendChild(overlay);
    } catch (err) {
      console.warn("[Zia] Couldn't show the folder placeholder:", err);
    }
  }

  function hideFolderSkeleton(folder) {
    const container = folder.querySelector(".tab-group-label-container") || folder;
    container.querySelector(".zia-skeleton-overlay")?.remove();
    container.removeAttribute("zia-skeleton-on");
    container.style.removeProperty("position");
  }
  const isDefaultName = (name) => !name || DEFAULT_FOLDER_NAMES.test(name);

  function currentFolderName(folder) {
    const editor = findNameEditor(folder);
    const name = editor ? ("value" in editor ? editor.value : editor.textContent) : folder.name;
    return (name || "").trim();
  }

  function folderIconURL(folder) {
    if (folder.localName === "zen-folder") {
      return folder.iconURL;
    }
    const icon = folder.querySelector(":scope > .tab-group-label-container .tab-group-icon > :is(.group-icon, label)");
    if (icon) {
      return icon.localName === "label" ? icon.textContent : icon.getAttribute("src");
    }
    return window.advancedTabGroups?.savedIcons?.[folder.id] || "";
  }

  function setFolderIcon(folder, icon) {
    if (folder.localName === "zen-folder") {
      window.gZenFolders?.setFolderUserIcon(folder, icon);
    } else {
      window.advancedTabGroups?.applyGroupIcon(folder, icon);
    }
  }

  // A folder mostly of one site gets that site's own icon when Tabler has
  // it (a folder of YouTube videos gets YouTube's, not one guessed from the
  // videos' titles). The site is its name without subdomains or the ending
  // (music.youtube.com and youtu.be are both YouTube).
  const BRAND_ALIASES = { youtu: "youtube", twitter: "x", fb: "facebook", ycombinator: "ycombinator", googleusercontent: "google" };
  const BRAND_MAJORITY = 0.5;

  function siteBrand(host) {
    const parts = String(host || "").toLowerCase().replace(/^www\./, "").split(".").filter(Boolean);
    if (parts.length < 2) {
      return null;
    }
    // co.uk, com.au and the like: the name is one further in
    const secondLevel = parts.length > 2 && parts[parts.length - 2].length <= 3 && parts[parts.length - 1].length === 2;
    const name = parts[parts.length - (secondLevel ? 3 : 2)];
    return BRAND_ALIASES[name] || name;
  }

  function brandIconForFolder(folder) {
    const tabs = folder.tabs || [];
    if (!tabs.length) {
      return null;
    }
    const counts = new Map();
    for (const tab of tabs) {
      let brand = null;
      try {
        brand = siteBrand(tab.linkedBrowser?.currentURI?.host);
      } catch (err) {
        brand = null;
      }
      if (brand) {
        counts.set(brand, (counts.get(brand) || 0) + 1);
      }
    }
    const [brand, count] = [...counts].sort((a, b) => b[1] - a[1])[0] || [];
    if (!brand || count / tabs.length < BRAND_MAJORITY) {
      return null;
    }
    const name = `brand-${brand}`;
    return suggestableIcons().some((icon) => icon.name === name) ? iconURL(name) : null;
  }

  function applySuggestedFolderIcon(folder) {
    if (!featureOn("folder-icon-suggest")) {
      return;
    }
    if (!isFolder(folder) || folderIconURL(folder)) {
      return;
    }

    folder.setAttribute("zia-suggesting", "true");
    showFolderSkeleton(folder);
    setTimeout(async () => {
      try {
        if (!folder.isConnected) {
          return;
        }
        if (!folderIconURL(folder)) {
          let icon = brandIconForFolder(folder);
          if (!icon) {
            try {
              icon = await suggestIconByMeaning(folder);
            } catch (err) {
              console.warn("[Zia] The embedding model wasn't available:", err);
            }
          }
          icon = icon || suggestFolderIcon(folder);
          if (icon && !folderIconURL(folder)) {
            setFolderIcon(folder, icon);
            folder.dispatchEvent(new CustomEvent("TabGroupUpdate", { bubbles: true }));
          }
        }
        if (isDefaultName(currentFolderName(folder))) {
          let name = null;
          try {
            name = await suggestNameByModel(folder);
          } catch (err) {
            console.warn("[Zia] Couldn't name the folder with the model:", err);
          }
          name = name || suggestFolderName(folder);
          if (name && isDefaultName(currentFolderName(folder))) {
            renameFolder(folder, name);
          }
        }
      } catch (err) {
        console.error("[Zia] Could not suggest a folder icon or name:", err);
      } finally {
        folder.removeAttribute("zia-suggesting");
        hideFolderSkeleton(folder);
      }
    }, 600);
  }

  function watchNewFolders() {
    gBrowser.tabContainer.addEventListener("TabGroupCreate", (event) => {
      requestAnimationFrame(() => requestAnimationFrame(() => applySuggestedFolderIcon(event.target)));
    });
  }

  const FOLDER_DEFAULT_COLOR = "white";

  const FOLDER_COLORS = [
    ["white", "#fbfbfb"],
    ["green", "#008b5d"],
    ["blue", "#007fbd"],
    ["purple", "#625da5"],
    ["amber", "#c98400"],
    ["pink", "#bd556b"],
    ["red", "#cc4a55"],
    ["orange", "#c95125"],
  ];

  const FOLDER_COLOR_PREF = "zia.folder-colors";

  function readFolderColors() {
    try {
      return JSON.parse(Services.prefs.getStringPref(FOLDER_COLOR_PREF, "{}")) || {};
    } catch (err) {
      return {};
    }
  }

  function writeFolderColors(map) {
    try {
      Services.prefs.setStringPref(FOLDER_COLOR_PREF, JSON.stringify(map));
    } catch (err) {
      console.error("[Zia] Could not save the folder colours:", err);
    }
  }

  function folderColorOf(value) {
    if (!value) {
      return null;
    }
    if (typeof value === "string") {
      return value;
    }
    return value.color || null;
  }

  function paintFolder(folder, value) {
    if (!folder) {
      return;
    }
    const color = folderColorOf(value);
    if (color) {
      folder.setAttribute("zia-folder-color", color);
    } else {
      folder.removeAttribute("zia-folder-color");
    }
  }

  function setFolderColor(folder, color) {
    if (!folder?.id) {
      return;
    }
    const map = readFolderColors();
    if (color) {
      map[folder.id] = color;
    } else {
      delete map[folder.id];
    }
    writeFolderColors(map);
    paintFolder(folder, color);
  }

  function restoreFolderColors() {
    const map = readFolderColors();
    for (const folder of document.querySelectorAll("zen-folder")) {
      if (map[folder.id]) {
        paintFolder(folder, map[folder.id]);
      }
    }
  }

  function folderFromNode(node) {
    if (!node) {
      return null;
    }
    if (gBrowser.isTabGroupLabel?.(node)) {
      return node.group;
    }
    if (gBrowser.isTabGroupLabel?.(node.parentElement)) {
      return node.parentElement.group;
    }
    if (node.parentElement?.isZenFolder && node.classList?.contains("tab-group-label-container")) {
      return node.parentElement;
    }
    return node.closest?.("zen-folder") || null;
  }

  function colorDotIcon(hex) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="7" fill="${hex}"/></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  function buildFolderColorMenu() {
    const submenu = document.createXULElement("menu");
    submenu.id = "zia-folder-color-menu";
    submenu.setAttribute("label", "Folder Color");
    const popup = document.createXULElement("menupopup");
    for (const [name, hex] of FOLDER_COLORS) {
      const item = document.createXULElement("menuitem");
      item.className = "menuitem-iconic";
      item.setAttribute("type", "radio");
      item.setAttribute("name", "zia-folder-color");
      item.setAttribute("label", name[0].toUpperCase() + name.slice(1));
      item.setAttribute("image", colorDotIcon(hex));
      item.setAttribute("zia-color", name);
      item.addEventListener("command", () => {
        const folder = submenu.ziaFolder;

        const same = folder?.getAttribute("zia-folder-color") === name;
        const clear = name === FOLDER_DEFAULT_COLOR || same;
        setFolderColor(folder, clear ? null : name);
      });
      popup.appendChild(item);
    }
    submenu.appendChild(popup);
    return submenu;
  }

  function addFolderColorPicker() {
    let submenu = null;

    document.addEventListener(
      "popupshowing",
      (event) => {
        const menu = event.target;
        if (menu?.id !== "zenFolderActions") {
          return;
        }

        const trigger = menu.triggerNode || event.explicitOriginalTarget;
        const folder = folderFromNode(trigger);
        if (!folder?.isZenFolder) {
          if (submenu) {
            submenu.hidden = true;
          }
          return;
        }

        if (!submenu) {
          submenu = buildFolderColorMenu();

          const rename = document.getElementById("context_zenFolderRename");
          if (rename?.parentElement === menu) {
            menu.insertBefore(submenu, rename);
          } else {
            menu.appendChild(submenu);
          }
        }

        submenu.hidden = false;
        submenu.ziaFolder = folder;

        const current = folder.getAttribute("zia-folder-color") || FOLDER_DEFAULT_COLOR;
        for (const item of submenu.querySelector("menupopup").children) {
          item.toggleAttribute("checked", item.getAttribute("zia-color") === current);
        }
      },
      true
    );
  }

  function watchFolderColors() {
    restoreFolderColors();

    setTimeout(restoreFolderColors, 1500);
    gBrowser.tabContainer.addEventListener("TabGroupCreate", (event) => {
      const saved = readFolderColors()[event.target?.id];
      if (saved) {
        paintFolder(event.target, saved);
      }
    });
  }

  const GROUP_COLOR_TOKEN = /(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*\)|#[0-9a-f]{3,8}\b/i;

  // Advanced Tab Groups' picker colours are gradients, which color-mix can't take: the group gets the first stop
  function paintGroupSwatch(group) {
    if (group?.localName !== "tab-group" || group.hasAttribute("split-view-group")) {
      return;
    }
    const color = getComputedStyle(group).getPropertyValue("--tab-group-color").trim();
    const stop = color.includes("gradient") ? color.match(GROUP_COLOR_TOKEN)?.[0] : null;
    const swatch = stop ? `rgb(from ${stop} r g b)` : "";
    if (group.style.getPropertyValue("--zia-group-swatch") === swatch) {
      return;
    }
    if (swatch) {
      group.style.setProperty("--zia-group-swatch", swatch);
    } else {
      group.style.removeProperty("--zia-group-swatch");
    }
  }

  function watchGroupColors() {
    const paintAll = () => document.querySelectorAll("tab-group:not([split-view-group])").forEach(paintGroupSwatch);
    for (const type of ["TabGroupCreate", "TabGroupUpdate"]) {
      gBrowser.tabContainer.addEventListener(type, (event) => paintGroupSwatch(event.target));
    }
    // Advanced Tab Groups recolours by writing --tab-group-color inline, without an event
    new MutationObserver((records) => {
      for (const record of records) {
        paintGroupSwatch(record.target);
      }
    }).observe(gBrowser.tabContainer, { subtree: true, attributes: true, attributeFilter: ["style"] });
    paintAll();
    setTimeout(paintAll, 1500);
  }

  function addFolderCloseButton(folder) {
    if (!folder?.isZenFolder) {
      return;
    }
    const header = folder.querySelector(":scope > .tab-group-label-container");
    if (!header || header.querySelector(":scope > .zia-folder-close")) {
      return;
    }
    const button = document.createXULElement("image");
    button.className = "zia-folder-close";
    button.setAttribute("role", "button");
    button.setAttribute("keyNav", "false");
    button.setAttribute("tooltiptext", "Delete Folder");

    button.addEventListener("mousedown", (event) => event.stopPropagation());
    button.addEventListener("click", (event) => {
      if (event.button !== 0) {
        return;
      }
      event.stopPropagation();
      event.preventDefault();

      const removal =
        typeof folder.delete === "function"
          ? folder.delete()
          : gBrowser.removeTabGroup(folder, { isUserTriggered: true });
      Promise.resolve(removal).catch((err) => console.error("[Zia] Couldn't delete the folder:", err));
    });

    header.appendChild(button);
  }

  // Zia lets you make a folder before it has any tabs (Dia doesn't), so an
  // empty one says so: open, it shows a dashed "Drag tabs here" slot, which
  // steps aside for a tab dragged into it (chrome.css).
  // Zen keeps a hidden placeholder tab in every empty folder, so a folder
  // counts as empty when that's all it holds.
  function isEmptyFolder(folder) {
    const container = folder.querySelector(":scope > .tab-group-container");
    if (!container) {
      return false;
    }
    return ![...container.children].some(
      (child) => child.localName === "zen-folder" || (child.classList.contains("tabbrowser-tab") && !child.hasAttribute("zen-empty-tab"))
    );
  }

  // The slot is sized from a real tab in the sidebar (its background, the gaps
  // around it and how far it's inset in a folder), so it's exactly where the
  // first tab will sit, and a tab dragged in replaces it without anything
  // moving. Measured from a tab inside an open folder when there is one.
  const FOLDER_SLOT_INSET = { start: 14, end: 5 };
  let slotSize = "";
  function measureFolderSlot() {
    const visible = (tab) => tab.getBoundingClientRect().height > 8 && !tab.hasAttribute("zen-empty-tab");
    const inFolder = [...document.querySelectorAll("zen-folder:not([collapsed]) > .tab-group-container > .tabbrowser-tab")].find(visible);
    const tab =
      inFolder || [...document.querySelectorAll("#tabbrowser-tabs .tabbrowser-tab:not([zen-essential])")].find(visible);
    const bg = tab?.querySelector(":scope > .tab-stack > .tab-background");
    if (!tab || !bg) {
      return;
    }
    const t = tab.getBoundingClientRect();
    const b = bg.getBoundingClientRect();
    const style = getComputedStyle(tab);
    const top = (parseFloat(style.marginTop) || 0) + (b.top - t.top);
    const bottom = (parseFloat(style.marginBottom) || 0) + (t.bottom - b.bottom);
    let start;
    let end;
    if (inFolder) {
      const box = tab.parentElement.getBoundingClientRect();
      start = b.left - box.left;
      end = box.right - b.right;
    } else {
      start = FOLDER_SLOT_INSET.start + (b.left - t.left);
      end = FOLDER_SLOT_INSET.end + (t.right - b.right);
    }
    // Same gap on the right as at the bottom, inside an open empty folder's box
    const probe = document.querySelector("zen-folder[zia-empty]:not([collapsed])");
    const container = probe?.querySelector(":scope > .tab-group-container");
    if (probe && container) {
      const box = getComputedStyle(probe, "::before");
      const folderBox = probe.getBoundingClientRect();
      const inner = container.getBoundingClientRect();
      const boxRight = folderBox.right - (parseFloat(box.right) || 0);
      const boxBottom = folderBox.bottom - (parseFloat(box.bottom) || 0);
      const gap = boxBottom - (inner.bottom - bottom);
      if (gap > 0 && gap < 20) {
        end = inner.right - (boxRight - gap);
      }
    }
    const next = [top, bottom, start, end, b.height].map((n) => `${Math.round(n * 2) / 2}px`).join(" ");
    if (next === slotSize) {
      return;
    }
    slotSize = next;
    const [mt, mb, ms, me, h] = next.split(" ");
    for (const [name, value] of [["--zia-slot-mt", mt], ["--zia-slot-mb", mb], ["--zia-slot-ms", ms], ["--zia-slot-me", me], ["--zia-slot-h", h]]) {
      root.style.setProperty(name, value);
    }
  }

  // A folder emptied by moving its last tab out collapses; an open empty
  // folder (new, or opened by hand) shows the slot.
  const wasEmpty = new WeakMap();

  function markEmptyFolders() {
    let open = false;
    for (const folder of document.querySelectorAll("zen-folder")) {
      const empty = isEmptyFolder(folder);
      folder.toggleAttribute("zia-empty", empty);
      if (empty && wasEmpty.get(folder) === false && !folder.hasAttribute("collapsed")) {
        try {
          folder.collapsed = true;
        } catch (err) {
          noteError("folder empty: collapse", err);
        }
      }
      wasEmpty.set(folder, empty);
      open ||= empty && !folder.hasAttribute("collapsed");
    }
    if (open) {
      measureFolderSlot();
    }
  }

  function watchEmptyFolders() {
    const tabs = document.getElementById("tabbrowser-tabs");
    if (!tabs) {
      return;
    }
    let frame = 0;
    const schedule = () => {
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          markEmptyFolders();
        });
      }
    };
    new MutationObserver(schedule).observe(tabs, { childList: true, subtree: true });
    for (const type of ["TabGroupCreate", "TabGrouped", "TabUngrouped", "TabClose", "TabMove", "TabGroupExpand"]) {
      gBrowser.tabContainer.addEventListener(type, schedule);
    }
    window.addEventListener("ZenWorkspacesUIUpdate", schedule);
    // The sidebar's width changes a tab's size
    new ResizeObserver(schedule).observe(tabs);
    schedule();
  }

  // Optional: the last essential stretches across whatever's left of its row.
  // The grid can't span "to the end of the row" by itself, so Zia counts the
  // columns and sets the span.
  const FILL_ROW_PREF = "zia.essentials.fill-row";

  // The grid's own columns, worked out as the grid does (as many as fit at
  // the tiles' least width). Its computed column list also holds the extra
  // columns a span wider than the grid creates; counting those grew the
  // span, which made more of them, until tiles were squeezed into slivers.
  function gridColumns(grid) {
    const style = getComputedStyle(grid);
    const width = grid.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
    const gap = parseFloat(style.columnGap) || 0;
    const least = parseFloat(getComputedStyle(root).getPropertyValue("--zia-essential-min-width")) || 54;
    return Math.max(1, Math.floor((width + gap) / (least + gap)));
  }

  function fillEssentialRows() {
    const on = Services.prefs.getBoolPref(FILL_ROW_PREF, false) && root.getAttribute("zen-sidebar-expanded") === "true";
    const wanted = new Map();
    if (on) {
      for (const grid of document.querySelectorAll(".zen-essentials-container")) {
        const tabs = [...grid.children].filter((tab) =>
          tab.matches?.(".tabbrowser-tab[zen-essential]:not([hidden], [zia-essential-proxy])")
        );
        const columns = gridColumns(grid);
        const empty = columns - (tabs.length % columns || columns);
        if (tabs.length && columns > 1 && empty > 0) {
          wanted.set(tabs[tabs.length - 1], empty + 1);
        }
      }
    }
    for (const tab of document.querySelectorAll(".tabbrowser-tab[zia-fill-row]")) {
      if (!wanted.has(tab)) {
        tab.removeAttribute("zia-fill-row");
        tab.style.removeProperty("grid-column");
      }
    }
    for (const [tab, span] of wanted) {
      if (tab.style.getPropertyValue("grid-column") !== `span ${span}`) {
        tab.style.setProperty("grid-column", `span ${span}`);
      }
      tab.setAttribute("zia-fill-row", "true");
    }
  }

  function watchEssentialRows() {
    const essentials = document.getElementById("zen-essentials");
    if (!essentials) {
      return;
    }
    let frame = 0;
    const schedule = () => {
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          fillEssentialRows();
        });
      }
    };
    new MutationObserver(schedule).observe(essentials, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden", "zen-essential"],
    });
    new ResizeObserver(schedule).observe(essentials);
    new MutationObserver(schedule).observe(root, { attributes: true, attributeFilter: ["zen-sidebar-expanded"] });
    window.addEventListener("ZenWorkspacesUIUpdate", schedule);
    Services.prefs.addObserver(FILL_ROW_PREF, schedule);
    window.addEventListener("unload", () => Services.prefs.removeObserver(FILL_ROW_PREF, schedule));
    schedule();
  }

  function watchFolderCloseButtons() {
    const addAll = () => {
      for (const folder of document.querySelectorAll("zen-folder")) {
        addFolderCloseButton(folder);
      }
    };
    addAll();

    setTimeout(addAll, 1500);
    gBrowser.tabContainer.addEventListener("TabGroupCreate", (event) => addFolderCloseButton(event.target));
  }

  // Split essentials: a split of two sites kept as one essential, as Dia
  // can. Zen can't hold a split among its essentials yet (splitting with an
  // essential copies it into an ordinary tab), so Zia keeps it like this:
  //
  //  - The essential is an ordinary Zen essential for the left site, which
  //    Zia draws as a split tile (both sites' icons side by side, the glow a
  //    blend of the two) and never shows by itself.
  //  - The split it opens is an ordinary Zen split of two ordinary tabs,
  //    tagged zia-split-of and hidden from the tab list. Clicking the tile
  //    selects it (making it first if there's none), in the space you're in;
  //    clicking a half of the tile goes to that half of the split.
  //  - While it's showing, the tile looks selected, its colour leaning
  //    towards whichever half you're in.
  //
  // Everything is kept in the session (the essential's "zia-split" value,
  // each split tab's "zia-split-of" and "zia-split-side"), so it survives a
  // restart. Take the essential out of the essentials, or close it, and its
  // split becomes an ordinary one in the tab list again; close either tab
  // of the split and both go, until the tile is clicked again. It's all
  // behind zia.essentials.split, and turned off, every split essential goes
  // back to being a plain essential and its split an ordinary one.
  const SPLIT_PREF = "zia.essentials.split";
  const SPLIT_DATA = "zia-split";
  const SPLIT_OF = "zia-split-of";
  const SPLIT_SIDE = "zia-split-side";

  const splitEssentialsOn = () => Services.prefs.getBoolPref(SPLIT_PREF, true);

  function sessionValue(tab, key) {
    try {
      return window.SessionStore?.getCustomTabValue(tab, key) || "";
    } catch (err) {
      return "";
    }
  }

  function setSessionValue(tab, key, value) {
    try {
      if (value) {
        window.SessionStore?.setCustomTabValue(tab, key, value);
      } else {
        window.SessionStore?.deleteCustomTabValue(tab, key);
      }
    } catch (err) {
      noteError("split essentials: session", err);
    }
  }

  function splitDataOf(tab) {
    if (!tab?.hasAttribute?.("zen-essential")) {
      return null;
    }
    if (tab.ziaSplit === undefined) {
      try {
        tab.ziaSplit = JSON.parse(sessionValue(tab, SPLIT_DATA) || "null");
      } catch (err) {
        tab.ziaSplit = null;
      }
    }
    return tab.ziaSplit?.id ? tab.ziaSplit : null;
  }

  function saveSplitData(tab, data) {
    tab.ziaSplit = data;
    setSessionValue(tab, SPLIT_DATA, data ? JSON.stringify(data) : "");
  }

  const splitEssentials = () => gBrowser.tabs.filter((tab) => splitDataOf(tab));

  function pairOf(id) {
    const pair = {};
    for (const tab of gBrowser.tabs) {
      if (!tab.closing && tab.getAttribute(SPLIT_OF) === id) {
        pair[tab.getAttribute(SPLIT_SIDE) === "b" ? "b" : "a"] = tab;
      }
    }
    return pair;
  }

  function essentialFor(tab) {
    const id = tab?.getAttribute?.(SPLIT_OF);
    return id ? splitEssentials().find((essential) => splitDataOf(essential).id === id) || null : null;
  }

  function tagPairTab(tab, id, side) {
    tab.setAttribute(SPLIT_OF, id);
    tab.setAttribute(SPLIT_SIDE, side);
    setSessionValue(tab, SPLIT_OF, id);
    setSessionValue(tab, SPLIT_SIDE, side);
  }

  function untagPairTab(tab) {
    tab.removeAttribute(SPLIT_OF);
    tab.removeAttribute(SPLIT_SIDE);
    setSessionValue(tab, SPLIT_OF, "");
    setSessionValue(tab, SPLIT_SIDE, "");
  }

  const tabIcon = (tab) => tab?.getAttribute("image") || "";
  const tabUrl = (tab) => tab?.linkedBrowser?.currentURI?.spec || "";

  const DEFAULT_ICON = "chrome://sine/content/zia/icons/tab-default.svg";
  const cssUrl = (url) => `url("${url.replace(/"/g, "%22")}")`;

  // The tile: both sites' icons, each in an upright half of its own (the
  // essential's own icon is hidden; it never loads, so it would only be
  // Zen's placeholder).
  function drawSplitTile(essential) {
    const data = splitDataOf(essential);
    const content = essential.querySelector(".tab-content");
    const halves = content ? [...content.querySelectorAll(":scope > .zia-split-half")] : [];
    if (!data || !splitEssentialsOn()) {
      halves.forEach((half) => half.remove());
      essential.removeAttribute("zia-split-tile");
      essential.style.removeProperty("--zia-split-glow");
      return;
    }
    if (!content) {
      return;
    }
    fillSplitHalves(content, [data.a, data.b]);
    essential.setAttribute("zia-split-tile", "true");
    paintSplitGlow(essential);
  }

  // The two halves (icon and title each) inside a tab's content: the tile
  // shows just the icons; as a row, while dragged off, the titles too
  function fillSplitHalves(content, sites) {
    ["a", "b"].forEach((side, i) => {
      let half = content.querySelector(`:scope > .zia-split-half[side="${side}"]`);
      if (!half) {
        half = document.createXULElement("hbox");
        half.className = "zia-split-half";
        half.setAttribute("side", side);
        const title = document.createXULElement("label");
        title.className = "zia-split-title";
        title.setAttribute("crop", "end");
        half.append(document.createXULElement("image"), title);
        content.append(half);
      }
      const icon = sites[i]?.icon || DEFAULT_ICON;
      const image = half.querySelector("image");
      if (image.getAttribute("src") !== icon) {
        image.setAttribute("src", icon);
      }
      half.querySelector(".zia-split-title").setAttribute("value", sites[i]?.title || "");
    });
  }

  // Tab dragging's stand-ins are copies of a tab, which Firefox fills
  // afresh once they're in the page, so the halves go in after that.
  // The tile a split turns into while it's dragged over the essentials:
  function dressSplitProxy(proxy, tab) {
    const tabs = [...(tab?.group?.tabs || [])].filter((t) => !t.closing);
    const content = proxy.querySelector(".tab-content");
    if (tabs.length !== 2 || !content) {
      return;
    }
    // looks as it will once it lands: in colour (of the half being dragged)
    // if the split's the one showing, plain if not
    proxy.removeAttribute("zia-split-focus");
    if (tabs.some((t) => t.selected)) {
      proxy.setAttribute("visuallyselected", "true");
      proxy.setAttribute("selected", "true");
      // the half you're in outlined, as it will be (the split's first tab
      // is its left half)
      const shown = tabs.find((t) => t.selected);
      proxy.setAttribute("zia-split-focus", shown === tabs[0] ? "a" : "b");
      const icon = tabIcon(shown) || tabIcon(tab);
      if (icon) {
        proxy.style.setProperty("--zia-split-glow", cssUrl(icon));
      }
    } else {
      proxy.removeAttribute("visuallyselected");
      proxy.removeAttribute("selected");
      proxy.style.removeProperty("--zia-split-glow");
    }
    fillSplitHalves(content, tabs.map((t) => ({ icon: tabIcon(t), title: t.label })));
    proxy.setAttribute("zia-split-tile", "true");
  }

  // ...and a split essential dragged off it, tile then row:
  function dressSplitCopy(copy, essential) {
    const data = splitDataOf(essential);
    const content = copy.querySelector(".tab-content");
    if (!data || !content) {
      return;
    }
    fillSplitHalves(content, [data.a, data.b]);
    copy.setAttribute("zia-split-tile", "true");
    // the copy's styles were cleared: keep the tile's colour
    const glow = essential.style.getPropertyValue("--zia-split-glow");
    if (glow) {
      copy.style.setProperty("--zia-split-glow", glow);
    }
  }

  // The selected look takes the colour of the half you're in, over the
  // whole tile
  function paintSplitGlow(essential) {
    const data = splitDataOf(essential);
    const side = essential.getAttribute("zia-split-focus") || essential.ziaLastSide || "a";
    const icon = data?.[side]?.icon;
    if (icon) {
      essential.style.setProperty("--zia-split-glow", cssUrl(icon));
    } else {
      essential.style.removeProperty("--zia-split-glow");
    }
  }

  // Selected look while its split is showing
  function syncSplitSelection() {
    const selected = gBrowser.selectedTab;
    const showing = essentialFor(selected);
    for (const essential of splitEssentials()) {
      const on = essential === showing;
      if (on) {
        const side = selected.getAttribute(SPLIT_SIDE) === "b" ? "b" : "a";
        essential.setAttribute("zia-split-focus", side);
        essential.ziaLastSide = side;
      } else {
        essential.removeAttribute("zia-split-focus");
      }
      paintSplitGlow(essential);
      if (on !== essential.hasAttribute("visuallyselected")) {
        essential._visuallySelected = on;
      }
    }
  }

  // The hover card shows the half you're in (or were last in)
  function splitCardSource(tab) {
    const data = splitDataOf(tab);
    if (!data) {
      return null;
    }
    const side = tab.getAttribute("zia-split-focus") || tab.ziaLastSide || "a";
    return pairOf(data.id)[side] || null;
  }

  function addTabFor(url) {
    return gBrowser.addTab(url || "about:blank", {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      inBackground: true,
      skipAnimation: true,
    });
  }

  // Shows an essential's split, making it first if it's gone
  function openSplitEssential(essential, side = "a") {
    const data = splitDataOf(essential);
    if (!data) {
      return;
    }
    let { a, b } = pairOf(data.id);
    const space = window.gZenWorkspaces?.activeWorkspace;
    if (a && b && a.group && a.group === b.group) {
      if (space && a.getAttribute("zen-workspace-id") !== space) {
        try {
          window.gZenWorkspaces.moveTabsToWorkspace([a, b], space);
        } catch (err) {
          noteError("split essentials: move split", err);
        }
      }
    } else {
      for (const leftover of [a, b]) {
        if (leftover) {
          untagPairTab(leftover);
          gBrowser.removeTab(leftover, { animate: false });
        }
      }
      a = addTabFor(data.a?.url);
      b = addTabFor(data.b?.url);
      tagPairTab(a, data.id, "a");
      tagPairTab(b, data.id, "b");
      window.gZenViewSplitter?.splitTabs([a, b], "vsep", side === "b" ? 1 : 0);
    }
    gBrowser.selectedTab = side === "b" ? b : a;
    syncSplitSelection();
  }

  // Why a tab's split can't become a split essential ("" when it can): a
  // two-site split, not already a split essential's, with the setting on
  function splitEssentialRefusal(tab) {
    if (!splitEssentialsOn()) {
      return "the Split essentials setting is off";
    }
    const group = tab?.group;
    if (!group?.hasAttribute("split-view-group")) {
      return "the tab isn't in a split";
    }
    const tabs = [...(group.tabs || group.querySelectorAll(".tabbrowser-tab"))].filter((t) => !t.closing);
    if (tabs.length !== 2) {
      return `the split has ${tabs.length} tabs, not two`;
    }
    if (tabs.some((t) => t.hasAttribute(SPLIT_OF) || t.hasAttribute("zen-essential"))) {
      return "it's already a split essential's";
    }
    return "";
  }

  const canBecomeSplitEssential = (tab) => !splitEssentialRefusal(tab);

  // Turns a two-site split into a split essential: the split itself stays
  // (hidden from the tab list) and becomes the essential's. From its tab's
  // right-click menu, or dragging it onto the essentials.
  function addSplitToEssentials(tab) {
    const refusal = splitEssentialRefusal(tab);
    if (refusal) {
      console.warn(`[Zia] Split essentials: can't add that split: ${refusal}`);
      return;
    }
    const tabs = [...(tab.group.tabs || tab.group.querySelectorAll(".tabbrowser-tab"))].filter((t) => !t.closing);
    const [a, b] = tabs;
    const id = `zia-split-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const essential = gBrowser.addTab(tabUrl(a) || "about:blank", {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      inBackground: true,
      skipAnimation: true,
      createLazyBrowser: true,
      title: a.label,
    });
    if (tabIcon(a)) {
      try {
        gBrowser.setIcon(essential, tabIcon(a), null, Services.scriptSecurityManager.getSystemPrincipal());
      } catch (err) {
        noteError("split essentials: icon", err);
      }
    }
    try {
      window.gZenPinnedTabManager?.addToEssentials(essential);
    } catch (err) {
      noteError("split essentials: add", err);
    }
    if (!essential.hasAttribute("zen-essential")) {
      console.warn("[Zia] Split essentials: Zen didn't take the new essential (the essentials may be full)");
      gBrowser.removeTab(essential, { animate: false });
      return;
    }
    saveSplitData(essential, {
      id,
      a: { url: tabUrl(a), title: a.label, icon: tabIcon(a) },
      b: { url: tabUrl(b), title: b.label, icon: tabIcon(b) },
    });
    tagPairTab(a, id, "a");
    tagPairTab(b, id, "b");
    drawSplitTile(essential);
    syncSplitSelection();
    return essential;
  }

  // The split essential is gone (closed, or taken out of the essentials):
  // its split is an ordinary one again.
  function releaseSplit(essential) {
    const data = essential.ziaSplit;
    if (!data?.id) {
      return;
    }
    for (const tab of Object.values(pairOf(data.id))) {
      untagPairTab(tab);
    }
    if (essential.isConnected && !essential.closing) {
      saveSplitData(essential, null);
      drawSplitTile(essential);
      essential.removeAttribute("zia-split-focus");
    }
  }

  // place(group), if given, puts the split where it was dropped
  function splitBackToList(essential, place = null) {
    const data = essential.ziaSplit;
    if (!data?.id || essential.closing || !essential.isConnected) {
      return;
    }
    let { a, b } = pairOf(data.id);
    releaseSplit(essential);
    try {
      if (!(a && b && a.group && a.group === b.group)) {
        for (const leftover of [a, b]) {
          if (leftover) {
            gBrowser.removeTab(leftover, { animate: false });
          }
        }
        a = addTabFor(data.a?.url);
        b = addTabFor(data.b?.url);
        window.gZenViewSplitter?.splitTabs([a, b], "vsep", -1, { activate: false });
      }
      const space = essential.getAttribute("zen-workspace-id") || window.gZenWorkspaces?.activeWorkspace;
      if (space && a.getAttribute("zen-workspace-id") !== space) {
        window.gZenWorkspaces?.moveTabsToWorkspace([a, b], space);
      }
      // dropped among the pinned tabs: the split's pinned too
      if (essential.pinned) {
        for (const tab of [a, b]) {
          if (!tab.pinned) {
            gBrowser.pinTab(tab);
          }
        }
      }
      if (a.group) {
        if (place) {
          place(a.group, [a, b]);
        } else {
          gBrowser.moveTabBefore(a.group, essential);
        }
      }
    } catch (err) {
      noteError("split essentials: back to the list", err);
    }
    const wasSelected = essential.selected;
    if (wasSelected && a && !a.closing) {
      gBrowser.selectedTab = a;
    }
    // Not removed mid-drop: Firefox's own drop still moves the dragged tab
    // afterwards, which would put a removed one back as a dead, unclosable
    // row. Hidden now, gone once the drop's done.
    essential.setAttribute("zia-split-gone", "true");
    goneEssentials.add(essential);
    setTimeout(() => {
      if (essential.isConnected && !essential.closing) {
        gBrowser.removeTab(essential, { animate: false });
      }
      setTimeout(clearDeadRows, 0);
    }, 0);
  }

  // A removed essential put back as a row (see above) can't be closed: it goes
  const goneEssentials = new Set();
  function clearDeadRows() {
    for (const row of goneEssentials) {
      // removed without animation, so one still showing after that is dead
      if (row.closing || !row.isConnected || !gBrowser.tabs.includes(row)) {
        goneEssentials.delete(row);
        if (row.isConnected) {
          row.remove();
        }
      }
    }
  }

  function watchSplitEssentials() {
    const container = gBrowser.tabContainer;

    // Clicking the tile shows its split, at the half that was clicked. The
    // press itself only keeps Zen from selecting the essential (so it can
    // still be dragged); the split opens on the click.
    const tileUnder = (event) => {
      if (event.button !== 0 || !splitEssentialsOn()) {
        return null;
      }
      const essential = event.target.closest?.(".tabbrowser-tab[zen-essential][zia-split-tile]");
      if (!essential || event.target.closest(".tab-close-button, .tab-reset-button, .tab-icon-overlay, .tab-audio-button")) {
        return null;
      }
      return essential;
    };
    container.addEventListener("mousedown", (event) => {
      if (tileUnder(event)) {
        event.stopPropagation();
      }
    }, true);
    container.addEventListener("click", (event) => {
      const essential = tileUnder(event);
      if (!essential) {
        return;
      }
      event.stopPropagation();
      const box = essential.getBoundingClientRect();
      openSplitEssential(essential, event.clientX > box.left + box.width / 2 ? "b" : "a");
    }, true);

    // Reached some other way (a shortcut, a restored selection): the split
    // shows instead of the essential by itself.
    container.addEventListener("TabSelect", (event) => {
      const tab = event.target;
      setTimeout(sweepReleased, 0);
      if (splitEssentialsOn() && splitDataOf(tab)) {
        setTimeout(() => {
          if (gBrowser.selectedTab === tab) {
            openSplitEssential(tab, "a");
          }
        }, 0);
        return;
      }
      syncSplitSelection();
    });

    container.addEventListener("TabClose", (event) => {
      const tab = event.target;
      if (tab.ziaSplit?.id) {
        releaseSplit(tab);
        return;
      }
      // One half closed: the whole split goes, until the tile's clicked again
      const id = tab.getAttribute(SPLIT_OF);
      if (id) {
        const { a, b } = pairOf(id);
        for (const other of [a, b]) {
          if (other && other !== tab) {
            untagPairTab(other);
            gBrowser.removeTab(other, { animate: false });
          }
        }
        setTimeout(syncSplitSelection, 0);
      }
    });

    // Taken out of the essentials (dragged back to the list, or Remove from
    // Essentials): its split takes its place there, and the essential goes.
    // A drag places the essential first, so this waits a moment for that;
    // and after any drag, or on switching tabs, anything missed is tidied.
    const sweepReleased = () => {
      clearDeadRows();
      for (const tab of gBrowser.tabs) {
        if (tab.ziaSplit?.id && !tab.closing && !tab.hasAttribute("zen-essential")) {
          splitBackToList(tab);
        }
      }
    };
    new MutationObserver((records) => {
      for (const { target } of records) {
        if (target.ziaSplit?.id && !target.hasAttribute("zen-essential")) {
          setTimeout(() => splitBackToList(target), 120);
        }
      }
    }).observe(container, { subtree: true, attributes: true, attributeFilter: ["zen-essential", "pinned"] });
    window.addEventListener("dragend", () => setTimeout(sweepReleased, 400), true);
    window.addEventListener("drop", () => setTimeout(sweepReleased, 400), true);

    // Each half's icon follows its site
    container.addEventListener("TabAttrModified", (event) => {
      const tab = event.target;
      const side = tab.getAttribute(SPLIT_SIDE);
      if (!side || !event.detail?.changed?.includes("image")) {
        return;
      }
      const essential = essentialFor(tab);
      const data = essential && splitDataOf(essential);
      if (data && tabIcon(tab) && data[side]?.icon !== tabIcon(tab)) {
        saveSplitData(essential, { ...data, [side]: { ...data[side], icon: tabIcon(tab) } });
        drawSplitTile(essential);
      }
    });

    // Right-click a tab in a two-site split: Add Split to Essentials
    const menu = document.getElementById("tabContextMenu");
    if (menu) {
      const item = document.createXULElement("menuitem");
      item.id = "zia-context-split-essential";
      item.setAttribute("label", "Add Split to Essentials");
      item.addEventListener("command", () => addSplitToEssentials(window.TabContextMenu?.contextTab));
      (document.getElementById("context_zen-add-essential") || menu.lastElementChild)?.after(item);
      menu.addEventListener("popupshowing", (event) => {
        if (event.target !== menu) {
          return;
        }
        const tab = window.TabContextMenu?.contextTab;
        item.hidden = !canBecomeSplitEssential(tab);
        // Zen's own Add to Essentials can't take a tab in a split: it made
        // the one tab half an essential and stranded the other
        if (tab?.group?.hasAttribute?.("split-view-group")) {
          const zens = document.getElementById("context_zen-add-essential");
          if (zens) {
            zens.hidden = true;
          }
        }
      });
    }

    // After a restart: tags back on from the session; orphans let go
    const restore = () => {
      const on = splitEssentialsOn();
      const ids = new Set();
      for (const tab of gBrowser.tabs) {
        const data = splitDataOf(tab);
        if (data && on) {
          ids.add(data.id);
        } else if (data) {
          releaseSplit(tab);
        }
        drawSplitTile(tab);
      }
      for (const tab of gBrowser.tabs) {
        const id = tab.getAttribute(SPLIT_OF) || sessionValue(tab, SPLIT_OF);
        if (!id) {
          continue;
        }
        if (ids.has(id)) {
          tab.setAttribute(SPLIT_OF, id);
          tab.setAttribute(SPLIT_SIDE, sessionValue(tab, SPLIT_SIDE) || tab.getAttribute(SPLIT_SIDE) || "a");
        } else {
          untagPairTab(tab);
        }
      }
      syncSplitSelection();
    };
    window.SessionStore?.promiseAllWindowsRestored?.then(restore, restore);
    container.addEventListener("TabAddedToEssentials", (event) => drawSplitTile(event.target));
    Services.prefs.addObserver(SPLIT_PREF, restore);
    window.addEventListener("unload", () => Services.prefs.removeObserver(SPLIT_PREF, restore));
  }

  function resolveColor(text) {
    if (!text) {
      return null;
    }
    let probe = document.getElementById("zia-color-probe");
    if (!probe) {
      probe = document.createElementNS(XHTML_NS, "div");
      probe.id = "zia-color-probe";
      probe.hidden = true;
      root.appendChild(probe);
    }
    probe.style.color = "";
    probe.style.color = text.trim();
    if (!probe.style.color) {
      return null;
    }
    return parseColor(getComputedStyle(probe).color);
  }

  const COLOR_TOKEN = /(?:rgba?|hsla?|color-mix|light-dark|oklch|oklab|lab|lch|color)\((?:[^()]|\([^()]*\))*\)|#[0-9a-fA-F]{3,8}\b|\btransparent\b/g;

  function paintColor(value) {
    if (!/gradient\(/.test(value)) {
      return resolveColor(value);
    }
    const stops = (value.match(COLOR_TOKEN) || []).map(resolveColor).filter(Boolean);
    if (!stops.length) {
      return null;
    }
    return [0, 1, 2, 3].map((i) => Math.round(stops.reduce((sum, c) => sum + c[i], 0) / stops.length));
  }

  function syncSidebarPaint() {
    const compact = root.getAttribute("zen-compact-mode") === "true";
    const layer = document.getElementById(compact ? "zen-toolbar-background" : "zen-browser-background");
    if (!layer) {
      return;
    }
    const name = compact ? "--zen-main-browser-background-toolbar" : "--zen-main-browser-background";
    const paint = paintColor(getComputedStyle(layer).getPropertyValue(name));
    const rootStyle = getComputedStyle(root);
    const tint = resolveColor(rootStyle.getPropertyValue("--zia-media-bg"));
    const base = resolveColor(rootStyle.getPropertyValue("--zia-media-card-base"));
    if (!paint || !tint || !base) {
      root.style.removeProperty("--zia-media-rest");
      root.style.removeProperty("--zia-media-solid");
      return;
    }

    root.style.setProperty("--zia-media-rest", cssColor(colorOver(tint, paint)));

    root.style.setProperty("--zia-media-solid", cssColor(colorOver(tint, colorOver(paint, base))));
  }

  function watchSidebarPaint() {
    syncSidebarPaint();
    const watcher = new MutationObserver(syncSidebarPaint);
    for (const id of ["zen-browser-background", "zen-toolbar-background"]) {
      const layer = document.getElementById(id);
      if (layer) {
        watcher.observe(layer, { attributes: true, attributeFilter: ["style"] });
      }
    }
    watcher.observe(root, { attributes: true, attributeFilter: ["zen-compact-mode"] });
  }

  function keepWindowButtonsInSidebar() {
    const manager = window.gZenVerticalTabsManager;
    if (!manager || manager.isWindowsStyledButtons) {
      return;
    }
    const wanted =
      root.getAttribute("zen-right-side") === "true" &&
      root.getAttribute("zen-compact-mode") !== "true" &&
      root.hasAttribute("zen-sidebar-expanded");
    if (!wanted) {
      return;
    }
    const buttons = manager.actualWindowButtons;
    const topButtons = document.getElementById("zen-sidebar-top-buttons");
    if (buttons && topButtons && buttons.parentNode !== topButtons) {
      topButtons.prepend(buttons);
    }
  }

  function watchWindowButtonsSide() {
    const soon = () => setTimeout(keepWindowButtonsInSidebar, 0);
    soon();
    setTimeout(keepWindowButtonsInSidebar, 1000);
    const watcher = new MutationObserver(soon);
    watcher.observe(root, {
      attributes: true,
      attributeFilter: ["zen-right-side", "zen-compact-mode", "zen-sidebar-expanded", "zen-single-toolbar"],
    });
    const navBar = document.getElementById("nav-bar");
    if (navBar) {
      watcher.observe(navBar, { childList: true });
    }
  }

  const TAB_CARD_DELAY = 600;
  const TAB_CARD_GRACE = 120;
  const TAB_CARD_GAP = 8;

  const ESSENTIAL_CARD_OVERLAP_X = 11;
  const ESSENTIAL_CARD_OVERLAP_Y = 2;
  const FOLDER_CARD_LIFT = 2;
  const DEFAULT_TAB_ICON = "chrome://sine/content/zia/icons/tab-default.svg";

  const TAB_CARD_ACTIONS = [
    {
      name: "essential",
      icon: "pin",
      label: "Add to Essentials",

      // a split goes in whole, as a split essential: Zen can't make one of
      // its tabs an essential (it left the other stranded, without a title)
      run: (tab) => (inSplit(tab) ? addSplitToEssentials(tab) : gZenPinnedTabManager?.addToEssentials(tab)),
      hidden: (tab) => tab.hasAttribute("zen-essential") || tab.pinned || (inSplit(tab) && !canBecomeSplitEssential(tab)),
    },
    {
      name: "unpin",
      icon: "pinned-off",
      label: "Unpin",
      run: (tab) => {
        if (tab.hasAttribute("zen-essential")) {
          gZenPinnedTabManager?.removeEssentials(tab);
        } else {
          gBrowser.unpinTab(tab);
        }
      },
      hidden: (tab) => !tab.hasAttribute("zen-essential") && !tab.pinned,
    },
    {
      name: "split",
      icon: "layout-columns",
      label: "Add to Split",

      run: (tab) => {
        const other = tab === gBrowser.selectedTab ? lastUsedOtherTab(tab) : gBrowser.selectedTab;
        if (other) {
          gZenViewSplitter?.splitTabs(tab === gBrowser.selectedTab ? [tab, other] : [other, tab]);
        }
      },
      hidden: (tab) => !lastUsedOtherTab(tab),
    },
    {
      name: "copy",
      icon: "paperclip",
      label: "Copy link",
      run: (tab) => copyLink(tab),
      hidden: (tab) => tabCardKind(tab) !== "web",
      keepsCard: true,
    },
  ];

  const inSplit = (tab) => !!tab?.group?.hasAttribute?.("split-view-group");

  function copyLink(tab) {
    const uri = tab?.linkedBrowser?.currentURI;
    if (!uri || !/^https?$/.test(uri.scheme)) {
      return;
    }
    if (tab === gBrowser.selectedTab && typeof window.gZenCommonActions?.copyCurrentURLToClipboard === "function") {
      window.gZenCommonActions.copyCurrentURLToClipboard();
      return;
    }
    Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper).copyString(uri.displaySpec);
    try {
      window.gZenUIManager?.showToast?.("zen-copy-current-url-confirmation");
    } catch (err) {
      noteError("copy link: copyLink", err);
    }
  }

  // Copying pops the paperclip into a tick: the paperclip shrinks, tilts
  // and fades, then the tick springs in, running a touch past full size.
  // After a moment the tick pops back into the paperclip the same way.
  const POP_SPRING = "cubic-bezier(0.3, 1.4, 0.5, 1)";
  const COPIED_ICON = "chrome://sine/content/zia/icons/ui/check.svg";
  const COPY_ICON = "chrome://sine/content/zia/icons/ui/paperclip.svg";

  function popIcon(icon, toTick, swap) {
    icon?.ziaPop?.cancel();
    if (typeof icon?.animate !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      swap();
      return;
    }
    const out = icon.animate(
      toTick
        ? [{ opacity: 1, scale: 1, rotate: "0deg" }, { opacity: 0, scale: 0.35, rotate: "-40deg" }]
        : [{ opacity: 1, scale: 1 }, { opacity: 0, scale: 0.5 }],
      { duration: 130, easing: "ease-in", fill: "forwards" }
    );
    icon.ziaPop = out;
    out.finished.then(
      () => {
        swap();
        icon.ziaPop = icon.animate(
          toTick
            ? [
                { opacity: 0, scale: 0.35, rotate: "25deg" },
                { opacity: 1, scale: 1.18, rotate: "0deg", offset: 0.6 },
                { opacity: 1, scale: 1, rotate: "0deg" },
              ]
            : [{ opacity: 0, scale: 0.5, rotate: "-20deg" }, { opacity: 1, scale: 1, rotate: "0deg" }],
          { duration: toTick ? 380 : 320, easing: POP_SPRING }
        );
        out.cancel();
      },
      () => {}
    );
  }

  // The icon is an <img> (hover card, split pane bar) or the address bar
  // button's <image>, whose picture comes from CSS on [zia-copied].
  function showCopiedIcon(button, icon) {
    const set = (copied) => () => {
      if (copied) {
        button.setAttribute("zia-copied", "true");
      } else {
        button.removeAttribute("zia-copied");
      }
      if (icon?.localName === "img") {
        icon.setAttribute("src", copied ? COPIED_ICON : COPY_ICON);
      }
    };
    popIcon(icon, true, set(true));
    clearTimeout(button.ziaCopiedTimer);
    button.ziaCopiedTimer = setTimeout(() => popIcon(icon, false, set(false)), 1200);
  }

  function showCopied(button) {
    showCopiedIcon(button, button.querySelector(button.localName === "button" ? "img" : "image"));
  }

  function addCopyLinkButton() {
    const siteData = document.getElementById("zen-site-data-icon-button");
    if (!siteData || document.getElementById("zia-copy-link-button")) {
      return;
    }
    const button = document.createXULElement("hbox");
    button.id = "zia-copy-link-button";
    button.className = "urlbar-page-action";
    button.setAttribute("role", "button");
    button.setAttribute("tooltiptext", "Copy link");
    const icon = document.createXULElement("image");
    icon.className = "urlbar-icon";
    button.appendChild(icon);
    button.addEventListener("click", (event) => {
      if (event.button !== 0) {
        return;
      }
      event.stopPropagation();
      try {
        copyLink(gBrowser.selectedTab);
        showCopied(button);
      } catch (err) {
        console.error("[Zia] Copy link failed:", err);
      }
    });
    siteData.before(button);
    const update = () => {
      const uri = gBrowser.selectedBrowser?.currentURI;
      button.hidden = !uri || !/^https?$/.test(uri.scheme);
    };

    // As faint as the site settings icon beside it (a fixed see-through
    // level); its colour follows the toolbar in CSS.
    const siteIcon = siteData.querySelector("image");
    if (siteIcon) {
      const style = getComputedStyle(siteIcon);
      icon.style.fillOpacity = style.fillOpacity;
      icon.style.opacity = style.opacity;
    }
    gBrowser.tabContainer.addEventListener("TabSelect", update);
    gBrowser.addProgressListener({
      onLocationChange: (progress) => {
        if (progress.isTopLevel) {
          update();
        }
      },
      QueryInterface: ChromeUtils.generateQI(["nsIWebProgressListener", "nsISupportsWeakReference"]),
    });
    update();
  }

  function lastUsedOtherTab(tab) {
    let best = null;
    for (const other of gBrowser.visibleTabs) {
      if (other === tab || other.hasAttribute("zen-empty-tab") || other.hasAttribute("zen-essential") || other.closing) {
        continue;
      }
      if (!best || (other.lastAccessed || 0) > (best.lastAccessed || 0)) {
        best = other;
      }
    }
    return best;
  }

  const NEW_TAB_PAGES = new Set(["about:newtab", "about:home", "about:blank", "about:privatebrowsing"]);

  function tabCardKind(tab) {
    const uri = tab.linkedBrowser?.currentURI;
    const spec = uri?.spec || "";
    if (/^https?:/.test(spec)) {
      return "web";
    }
    if (!spec || NEW_TAB_PAGES.has(spec) || tab.hasAttribute("zen-empty-tab")) {
      return "new";
    }
    return "internal";
  }

  const INTERNAL_PAGE_NAMES = { preferences: "settings", addons: "extensions" };

  function tabCardDomain(tab) {
    try {
      const uri = tab.linkedBrowser?.currentURI;
      if (!uri || isMultiviewURI(uri)) {
        return "";
      }
      if (/^https?$/.test(uri.scheme)) {
        return uri.host.replace(/^www\./, "");
      }
      if (uri.scheme === "about") {
        const name = uri.filePath.split(/[?#]/)[0].toLowerCase();
        return INTERNAL_PAGE_NAMES[name] || name;
      }
      return "";
    } catch (err) {
      return "";
    }
  }

  function buildTabCard(onAction) {
    const card = document.createElementNS(XHTML_NS, "div");
    card.id = "zia-tab-card";
    card.hidden = true;
    const title = document.createElementNS(XHTML_NS, "div");
    title.className = "zia-tab-card-title";
    const sub = document.createElementNS(XHTML_NS, "div");
    sub.className = "zia-tab-card-sub";
    const row = document.createElementNS(XHTML_NS, "div");
    row.id = "zia-tab-card-actions";
    for (const action of TAB_CARD_ACTIONS) {
      const button = document.createElementNS(XHTML_NS, "button");
      button.className = "zia-tab-card-action";
      button.setAttribute("zia-action", action.name);
      button.title = action.label;

      const icon = document.createElementNS(XHTML_NS, "img");
      icon.setAttribute("src", `chrome://sine/content/zia/icons/ui/${action.icon}.svg`);
      icon.setAttribute("alt", "");
      button.appendChild(icon);
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        onAction(action);
      });
      row.appendChild(button);
    }
    card.append(title, sub, row);
    root.appendChild(card);
    return card;
  }

  function fillTabCard(card, tab) {
    // a split essential's card is about the half you're in
    const shown = splitCardSource(tab) || tab;
    const isNew = tabCardKind(shown) === "new";
    card.querySelector(".zia-tab-card-title").textContent = shown.label || "New Tab";
    const sub = card.querySelector(".zia-tab-card-sub");
    sub.textContent = isNew ? "" : tabCardDomain(shown);
    sub.hidden = !sub.textContent;

    const row = card.querySelector("#zia-tab-card-actions");
    row.hidden = isNew;
    for (const button of row.children) {
      const action = TAB_CARD_ACTIONS.find((a) => a.name === button.getAttribute("zia-action"));
      button.hidden = !!action?.hidden?.(tab);
    }
  }

  function placeTabCard(card, tab) {
    const tile = tab.querySelector(":scope > .tab-stack > .tab-background");
    const tileBox = tile?.getBoundingClientRect();
    const tabBox = tileBox && tileBox.width > 0 && tileBox.height > 0 ? tileBox : tab.getBoundingClientRect();
    const sidebar = document.getElementById("navigator-toolbox")?.getBoundingClientRect() || tabBox;
    const onRight = root.getAttribute("zen-right-side") === "true";
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    let x;
    let y;
    let origin;
    if (tab.hasAttribute("zen-essential")) {
      card.setAttribute("zia-anchor", "essential");
      if (onRight) {
        card.setAttribute("zia-side", "right");
        x = tabBox.left - width + ESSENTIAL_CARD_OVERLAP_X;
        y = tabBox.bottom - ESSENTIAL_CARD_OVERLAP_Y;
        origin = "top right";
      } else {
        card.removeAttribute("zia-side");
        x = tabBox.right - ESSENTIAL_CARD_OVERLAP_X;
        y = tabBox.bottom - ESSENTIAL_CARD_OVERLAP_Y;
        origin = "top left";
      }
    } else {
      card.setAttribute("zia-anchor", "tab");
      card.removeAttribute("zia-side");
      x = onRight ? sidebar.left - width - TAB_CARD_GAP : sidebar.right + TAB_CARD_GAP;
      y = tabBox.top + tabBox.height / 2 - height / 2;
      origin = onRight ? "right center" : "left center";
    }
    x = Math.max(TAB_CARD_GAP, Math.min(x, window.innerWidth - width - TAB_CARD_GAP));
    y = Math.max(TAB_CARD_GAP, Math.min(y, window.innerHeight - height - TAB_CARD_GAP));
    card.style.left = `${Math.round(x)}px`;
    card.style.top = `${Math.round(y)}px`;
    card.style.transformOrigin = origin;
  }

  function tabsInFolder(folder) {
    return (folder.tabs || []).filter((tab) => !tab.hidden && !tab.hasAttribute("zen-empty-tab") && !tab.closing);
  }

  function newTabInFolder(folder) {
    const pinned = folder.tabs?.some((tab) => tab.pinned) ?? true;
    const tab = gBrowser.addTrustedTab("about:newtab", { pinned });
    if (pinned && !tab.pinned) {
      gBrowser.pinTab(tab);
    }

    const collapsed = folder.collapsed || folder.hasAttribute("collapsed");
    if (collapsed && !folder.hasAttribute("has-active")) {
      folder.setAttribute("has-active", "true");
      folder.activeTabs = [];
    }
    folder.addTabs([tab]);
    gBrowser.selectedTab = tab;
    if (collapsed && !folder.collapsed) {
      folder.collapsed = true;
    }
  }

  function buildFolderCard(onPick) {
    const card = document.createElementNS(XHTML_NS, "div");
    card.id = "zia-folder-card";
    card.hidden = true;
    card.addEventListener("click", (event) => {
      const row = event.target.closest?.(".zia-folder-card-row");
      if (!row) {
        return;
      }
      event.stopPropagation();
      const act = event.target.closest?.(".zia-folder-card-act")?.getAttribute("zia-act");
      const tab = row.ziaTab;
      if (act && tab?.isConnected) {
        card.dispatchEvent(new CustomEvent("zia-card-acting"));
        try {
          if (act === "mute") {
            tab.toggleMuteAudio();
          } else if (act === "close") {
            gBrowser.removeTab(tab, { animate: true });
          } else if (act === "unload") {
            tab.querySelector(".tab-reset-button")?.click();
          }
        } catch (err) {
          console.error("[Zia] Folder card button failed:", err);
        }

        for (const delay of [60, 400, 900]) {
          setTimeout(() => {
            if (!card.hidden && card.ziaFolder?.isConnected) {
              fillFolderCard(card, card.ziaFolder);
            }
          }, delay);
        }
        return;
      }
      onPick(row);
    });
    root.appendChild(card);
    return card;
  }

  function folderCardIcon(src, className) {
    const icon = document.createElementNS(XHTML_NS, "img");
    icon.className = className;
    icon.setAttribute("src", src);
    icon.setAttribute("alt", "");

    icon.addEventListener("error", () => icon.setAttribute("src", DEFAULT_TAB_ICON), { once: true });
    return icon;
  }

  function tabButtonIcon(tab, selector, fallback) {
    const button = tab.querySelector(selector);
    const url = button ? getComputedStyle(button).listStyleImage?.match(/^url\("?(.*?)"?\)$/)?.[1] : null;
    return url || `chrome://sine/content/zia/icons/ui/${fallback}.svg`;
  }

  function fillFolderCard(card, folder) {
    card.ziaFolder = folder;
    const rows = [];
    for (const tab of tabsInFolder(folder)) {
      const row = document.createElementNS(XHTML_NS, "div");
      row.className = "zia-folder-card-row";
      row.ziaTab = tab;
      row.toggleAttribute("zia-selected", tab.selected);
      row.append(folderCardIcon(gBrowser.getIcon(tab) || DEFAULT_TAB_ICON, "zia-folder-card-icon"));
      if (tab.hasAttribute("soundplaying") || tab.hasAttribute("muted")) {
        const muted = tab.hasAttribute("muted");
        const speaker = folderCardIcon(
          `chrome://sine/content/zia/icons/ui/${muted ? "volume-off" : "volume"}.svg`,
          "zia-folder-card-sound"
        );
        speaker.classList.add("zia-folder-card-act");
        speaker.setAttribute("zia-act", "mute");
        speaker.setAttribute("title", muted ? "Unmute tab" : "Mute tab");
        row.append(speaker);
      }
      const label = document.createElementNS(XHTML_NS, "span");
      label.className = "zia-folder-card-label";
      label.textContent = tab.label || "New Tab";
      row.append(label);

      const unloaded = tab.getAttribute("pending") === "true" && tab.getAttribute("folder-active") !== "true";
      const unload = tab.pinned && !unloaded && canUnload(tab);
      const button = folderCardIcon(
        unload ? tabButtonIcon(tab, ".tab-reset-button", "minus") : tabButtonIcon(tab, ".tab-close-button", "x"),
        "zia-folder-card-act"
      );
      button.setAttribute("zia-act", unload ? "unload" : "close");
      button.setAttribute("title", unload ? "Unload tab" : "Close tab");
      row.append(button);
      rows.push(row);
    }
    const add = document.createElementNS(XHTML_NS, "div");
    add.className = "zia-folder-card-row";
    add.setAttribute("zia-new-tab", "true");
    add.append(newTabButtonIcon());
    const addLabel = document.createElementNS(XHTML_NS, "span");
    addLabel.className = "zia-folder-card-label";
    addLabel.textContent = "New Tab";

    const newTabButton = document.querySelector("#vertical-tabs-newtab-button, #tabs-newtab-button");
    const newTabText = newTabButton?.querySelector(".toolbarbutton-text");
    if (newTabText) {
      const textStyle = getComputedStyle(newTabText);
      addLabel.style.color = textStyle.color;
      addLabel.style.opacity = String(
        (parseFloat(textStyle.opacity) || 1) * (parseFloat(getComputedStyle(newTabButton).opacity) || 1)
      );
    }
    add.append(addLabel);
    rows.push(add);

    const list = document.createElementNS(XHTML_NS, "div");
    list.className = "zia-folder-card-list";
    const scrolled = card.querySelector(".zia-folder-card-list")?.scrollTop || 0;
    list.append(...rows);
    card.replaceChildren(list);
    list.scrollTop = scrolled;
  }

  function newTabButtonIcon() {
    const button = document.querySelector("#vertical-tabs-newtab-button, #tabs-newtab-button");
    const shown = button?.querySelector(".toolbarbutton-icon");
    const style = shown ? getComputedStyle(shown) : null;
    const url = style?.listStyleImage?.match(/^url\("?(.*?)"?\)$/)?.[1];
    const icon = folderCardIcon(url || "chrome://sine/content/zia/icons/ui/plus.svg", "zia-folder-card-icon");
    icon.setAttribute("zia-plus", "true");
    if (style) {
      const size = (value) => (parseFloat(value) > 0 ? value : "");
      icon.style.width = size(style.width) || "16px";
      icon.style.height = size(style.height) || "16px";

      const buttonOpacity = parseFloat(getComputedStyle(button).opacity) || 1;
      icon.style.opacity = String((parseFloat(style.opacity) || 1) * buttonOpacity);
      icon.style.fill = style.fill && style.fill !== "none" ? style.fill : getComputedStyle(button).color;
      icon.style.fillOpacity = style.fillOpacity;
    }
    return icon;
  }

  function placeFolderCard(card, label) {
    const box = label.getBoundingClientRect();
    const sidebar = document.getElementById("navigator-toolbox")?.getBoundingClientRect() || box;
    const onRight = root.getAttribute("zen-right-side") === "true";
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    let x = onRight ? sidebar.left - width - TAB_CARD_GAP : sidebar.right + TAB_CARD_GAP;
    let y = box.top - FOLDER_CARD_LIFT;
    x = Math.max(TAB_CARD_GAP, Math.min(x, window.innerWidth - width - TAB_CARD_GAP));
    y = Math.max(TAB_CARD_GAP, Math.min(y, window.innerHeight - height - TAB_CARD_GAP));
    card.style.left = `${Math.round(x)}px`;
    card.style.top = `${Math.round(y)}px`;
    card.style.transformOrigin = onRight ? "top right" : "top left";
  }

  function hoveredFolderLabel(target) {
    const label = target?.closest?.(".tab-group-label-container");
    const folder = label?.parentElement;
    if (!folder?.isZenFolder || !folder.collapsed || folder.hasAttribute("split-view-group")) {
      return null;
    }
    return label;
  }

  function quietZenFolderPopup() {
    const folders = window.gZenFolders;
    if (!folders || typeof folders.openTabsPopup !== "function" || folders.openTabsPopup.ziaWrapped) {
      return;
    }
    const original = folders.openTabsPopup;
    const wrapped = function (...args) {
      if (featureOn("tab-hover-cards")) {
        return undefined;
      }
      return original.apply(this, args);
    };
    wrapped.ziaWrapped = true;
    folders.openTabsPopup = wrapped;
  }

  function addTabHoverCards() {
    const toolbox = document.getElementById("navigator-toolbox");
    if (!toolbox) {
      return;
    }
    quietZenFolderPopup();
    let card = null;
    let folderCard = null;
    let current = null;
    let showTimer = 0;
    let hideTimer = 0;

    const CARD_OUT_MS = 120;
    let closeTimer = 0;
    const cardUp = () => [card, folderCard].some((each) => each && !each.hidden && !each.hasAttribute("zia-closing"));
    const cardHovered = () => [card, folderCard].some((each) => each && !each.hidden && each.matches(":hover"));

    // In compact mode the sidebar hides once the pointer leaves it, and the
    // cards sit outside it, so while the pointer is on a card Zia holds the
    // sidebar open the way Zen does while one of its own menus is open.
    // Leaving the card, the sidebar gets Zen's usual moment before it hides.
    let holding = false;
    const holdSidebar = (on) => {
      if (on === holding) {
        return;
      }
      if (on) {
        holding = !toolbox.hasAttribute("has-popup-menu");
        if (holding) {
          toolbox.setAttribute("has-popup-menu", "true");
        }
        return;
      }
      holding = false;
      toolbox.removeAttribute("has-popup-menu");
      try {
        const manager = window.gZenCompactModeManager;
        if (manager?.preference && !toolbox.matches(":hover")) {
          const keep = Services.prefs.getIntPref("zen.view.compact.sidebar-keep-hover.duration", 0);
          if (keep > 0) {
            manager.flashElement(toolbox, keep, `has-hover${toolbox.id}`, "zen-has-hover");
          }
        }
      } catch (err) {
        noteError("hover cards: release sidebar", err);
      }
    };

    const hide = (force = false) => {
      if (force !== true && cardHovered()) {
        return;
      }
      holdSidebar(false);
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      current = null;
      for (const each of [card, folderCard]) {
        if (each && !each.hidden && !each.hasAttribute("zia-closing")) {
          each.removeAttribute("zia-snap");
          each.setAttribute("zia-closing", "true");
        }
      }
      clearTimeout(closeTimer);
      closeTimer = setTimeout(() => {
        for (const each of [card, folderCard]) {
          if (each?.hasAttribute("zia-closing")) {
            each.hidden = true;
            each.removeAttribute("zia-closing");
            each.removeAttribute("zia-open");
          }
        }
      }, CARD_OUT_MS);
    };

    const openCard = (shown, other, wasUp) => {
      clearTimeout(closeTimer);
      if (other) {
        other.hidden = true;
        other.removeAttribute("zia-open");
        other.removeAttribute("zia-closing");
      }
      shown.removeAttribute("zia-closing");
      shown.hidden = false;
      if (wasUp) {
        shown.setAttribute("zia-snap", "true");
        shown.setAttribute("zia-open", "true");
        return;
      }
      shown.removeAttribute("zia-snap");
      shown.removeAttribute("zia-open");
      void shown.offsetWidth;
      shown.setAttribute("zia-open", "true");
    };

    let keepCardUntil = 0;
    const hideSoon = () => {
      clearTimeout(hideTimer);
      const attempt = () => {
        const wait = keepCardUntil - Date.now();
        if (wait > 0) {
          hideTimer = setTimeout(attempt, wait);
          return;
        }
        hide();
      };
      hideTimer = setTimeout(attempt, TAB_CARD_GRACE);
    };
    const onCard = (node) => !!node && (card?.contains(node) || folderCard?.contains(node));

    const showFolder = (label) => {
      if (!folderCard) {
        folderCard = buildFolderCard((row) => {
          const folder = current?.parentElement;
          hide(true);
          try {
            if (row.hasAttribute("zia-new-tab")) {
              if (folder?.isConnected) {
                newTabInFolder(folder);
              }
            } else if (row.ziaTab?.isConnected) {
              gBrowser.selectedTab = row.ziaTab;
            }
          } catch (err) {
            console.error("[Zia] Folder card action failed:", err);
          }
        });
        folderCard.addEventListener("mouseenter", () => {
          clearTimeout(hideTimer);
          holdSidebar(true);
        });
        folderCard.addEventListener("mouseleave", () => {
          holdSidebar(false);
          hideSoon();
        });
        folderCard.addEventListener("zia-card-acting", () => {
          keepCardUntil = Date.now() + 1200;
          clearTimeout(hideTimer);
        });
      }
      const wasUp = cardUp();
      current = label;
      fillFolderCard(folderCard, label.parentElement);
      folderCard.hidden = false;
      placeFolderCard(folderCard, label);
      openCard(folderCard, card, wasUp);
    };

    const show = (tab) => {
      if (!tab.classList.contains("tabbrowser-tab")) {
        showFolder(tab);
        return;
      }
      const wasUp = cardUp();
      if (!card) {
        card = buildTabCard((action) => {
          const tab = current;

          if (!action.keepsCard) {
            hide(true);
          } else {
            keepCardUntil = Date.now() + 1200;
            if (action.name === "copy") {
              const button = card.querySelector('[zia-action="copy"]');
              if (button) {
                showCopiedIcon(button, button.querySelector("img"));
              }
            }
          }
          if (!tab?.isConnected) {
            return;
          }
          try {
            Promise.resolve(action.run(tab)).catch((err) =>
              console.error(`[Zia] ${action.label} failed:`, err)
            );
          } catch (err) {
            console.error(`[Zia] ${action.label} failed:`, err);
          }
        });
        card.addEventListener("mouseenter", () => {
          clearTimeout(hideTimer);
          holdSidebar(true);
        });
        card.addEventListener("mouseleave", () => {
          holdSidebar(false);
          hideSoon();
        });
      }
      current = tab;
      fillTabCard(card, tab);
      card.hidden = false;
      placeTabCard(card, tab);
      openCard(card, folderCard, wasUp);
    };

    toolbox.addEventListener("mouseover", (event) => {
      if (!featureOn("tab-hover-cards")) {
        return;
      }
      const tab = event.target?.closest?.(".tabbrowser-tab") || hoveredFolderLabel(event.target);
      if (!tab || tab.hasAttribute("pending-drag") || gBrowser.tabContainer.hasAttribute("movingtab")) {
        return;
      }
      clearTimeout(hideTimer);
      if (tab === current) {
        return;
      }
      clearTimeout(showTimer);
      if (current) {
        show(tab);
        return;
      }
      showTimer = setTimeout(() => {
        if (tab.isConnected && tab.matches(":hover")) {
          show(tab);
        }
      }, TAB_CARD_DELAY);
    });

    toolbox.addEventListener("mouseout", (event) => {
      const tab = event.target?.closest?.(".tabbrowser-tab") || event.target?.closest?.(".tab-group-label-container");
      if (!tab) {
        return;
      }
      const to = event.relatedTarget;
      if (to && (tab.contains(to) || onCard(to))) {
        return;
      }
      clearTimeout(showTimer);
      hideSoon();
    });

    toolbox.addEventListener("mousedown", () => hide(), true);
    toolbox.addEventListener("dragstart", () => hide(true), true);
    toolbox.addEventListener("wheel", () => hide(), { passive: true, capture: true });
    for (const type of ["TabSelect", "TabClose"]) {
      gBrowser.tabContainer.addEventListener(type, () => {
        if ((Date.now() < keepCardUntil && folderCard && !folderCard.hidden) || [card, folderCard].some((each) => each && !each.hidden && each.matches(":hover"))) {
          return;
        }
        hide();
      });
    }
    window.addEventListener("blur", () => {
      if (Date.now() >= keepCardUntil) {
        hide();
      }
    });
  }

  function nodeToMove(element) {
    if (!element) {
      return null;
    }
    if (element.hasAttribute?.("split-view-group") || element.group?.hasAttribute?.("split-view-group")) {
      return element.group || element;
    }
    if (gBrowser.isTab(element)) {
      return element;
    }
    if (gBrowser.isTabGroupLabel?.(element)) {
      return element.closest(".tab-group-label-container") || element;
    }
    if (gBrowser.isTabGroup?.(element)) {
      return element.labelContainerElement || element;
    }
    return element;
  }

  function moveTabsLikeDia() {
    const moved = new Set();
    let blank = null;
    let drag = null;
    let pending = null;
    let raf = 0;
    let lastDy = 0;

    const blankImage = () => {
      if (!blank) {
        blank = document.createElement("div");
        blank.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;";
        document.documentElement.appendChild(blank);
      }
      return blank;
    };

    const setDragImage = DataTransfer.prototype.setDragImage;
    const updateDragImage = DataTransfer.prototype.updateDragImage;
    // What's dragged in the sidebar has Zia's own stand-in, so the system's
    // snapshot picture is blanked: a tab's, and while an essential is
    // dragged, anything (it showed as a blurred band the width of the
    // window, the whole essentials row in it).
    const isTabGhost = (node) =>
      !!(node?.querySelector?.("[drag-image]") || node?.hasAttribute?.("drag-image")) ||
      !!essentialDragging ||
      !!node?.closest?.("#zen-essentials, .zen-essentials-container") ||
      !!node?.querySelector?.(".tabbrowser-tab[zen-essential]");
    let essentialDragging = false;
    DataTransfer.prototype.setDragImage = function (node, x, y) {
      if (isTabGhost(node)) {
        return setDragImage.call(this, blankImage(), 0, 0);
      }
      return setDragImage.call(this, node, x, y);
    };
    DataTransfer.prototype.updateDragImage = function (node, x, y) {
      if (isTabGhost(node)) {
        return updateDragImage.call(this, blankImage(), 0, 0);
      }
      return updateDragImage.call(this, node, x, y);
    };

    const tabFromEvent = (event) => {
      const seen = [event.explicitOriginalTarget, event.originalTarget, event.target];
      for (const start of seen) {
        let node = start;
        while (node) {
          if (node.classList?.contains("tabbrowser-tab")) {
            return node.hasAttribute("zen-essential") ? null : node;
          }
          if (node.localName === "zen-folder" || node.isZenFolder) {
            return node;
          }
          node = node.parentElement || node.getRootNode?.()?.host;
        }
      }
      return null;
    };

    const layoutTop = (node) => {
      const box = window.windowUtils.getBoundsWithoutFlushing(node);
      return { top: box.top, height: box.height };
    };

    const measureRows = (keepOpen = null) => {
      const rows = [];
      const seen = new Set();
      for (const item of gBrowser.tabContainer.ariaFocusableItems) {
        if (item.hasAttribute?.("zen-essential")) {
          continue;
        }
        // a split essential's own tabs are kept hidden in the list: not rows
        // (as rows of no height they came between a folder and the next row,
        // and no tab could be dropped into the folder)
        if (item.hasAttribute?.("zia-split-of") || item.group?.querySelector?.(":scope .tabbrowser-tab[zia-split-of]")) {
          continue;
        }
        let node = nodeToMove(item);
        const host = node?.closest?.("zen-folder, tab-group:not([split-view-group])");
        if (
          host &&
          host !== node &&
          (host.hasAttribute("collapsed") || host.collapsed) &&
          node.classList?.contains("tab-group-label-container") &&
          !host.contains(keepOpen)
        ) {
          node = host;
        }
        if (!node || seen.has(node)) {
          continue;
        }
        seen.add(node);
        const box = layoutTop(node);
        rows.push({
          item,
          node,
          index: item.elementIndex ?? rows.length,
          top: box.top,
          mid: box.top + box.height / 2,
          height: box.height,
          delta: 0,
        });
      }
      return rows;
    };

    // An empty folder's "Drag tabs here" slot is drawn on its tab container,
    // so it follows the folder's header when that moves aside.
    const slotFolderOf = (node) =>
      node?.classList?.contains("tab-group-label-container") && node.parentElement?.hasAttribute("zia-empty")
        ? node.parentElement
        : null;

    const clearNode = (node) => {
      const slotFolder = slotFolderOf(node);
      if (slotFolder) {
        slotFolder.style.removeProperty("--zia-slot-y");
      }
      node.style.removeProperty("top");
      node.style.removeProperty("position");
      node.style.removeProperty("z-index");
      node.style.removeProperty("transform");
      node.style.removeProperty("--zia-drag-y");
      node.removeAttribute("zia-dragging");
      node.removeAttribute("zia-shift");
    };

    const clearMoved = () => {
      for (const node of moved) {
        clearNode(node);
      }
      moved.clear();
    };

    const place = (node, y, above) => {
      if (!node) {
        return;
      }
      node.style.setProperty("--zia-drag-y", `${Math.round(y)}px`);
      slotFolderOf(node)?.style.setProperty("--zia-slot-y", `${Math.round(y)}px`);
      node.style.removeProperty("top");
      node.style.setProperty("transform", `translateY(${Math.round(y)}px)`, "important");
      node.style.setProperty("position", "relative", "important");
      node.style.setProperty("z-index", above ? "40" : "1", "important");
      if (above) {
        node.setAttribute("zia-dragging", "true");
        node.removeAttribute("zia-shift");
      } else {
        node.setAttribute("zia-shift", "true");
        node.removeAttribute("zia-dragging");
      }
      moved.add(node);
    };

    const isFolderEl = (el) =>
      !!el && (el.localName === "zen-folder" || el.isZenFolder || (el.localName === "tab-group" && !el.hasAttribute("split-view-group")));
    const headerOf = (folder) => folder?.querySelector?.(":scope > .tab-group-label-container") || null;
    const isCollapsed = (folder) => !!folder && (folder.collapsed === true || folder.hasAttribute("collapsed"));

    // An open empty folder's "Drag tabs here" slot takes a tab's room under its
    // header without being a row. Its height, measured once per drag (the
    // layout never changes mid-drag), counts toward the folder's size, and a
    // tab dragged into the folder takes its place instead of more room.
    const slotPitchOf = (folder) => {
      if (!drag || !folder?.hasAttribute?.("zia-empty") || isCollapsed(folder)) {
        return 0;
      }
      drag.slotPitch ||= new Map();
      if (!drag.slotPitch.has(folder)) {
        const container = folder.querySelector(":scope > .tab-group-container");
        drag.slotPitch.set(folder, container ? window.windowUtils.getBoundsWithoutFlushing(container).height : 0);
      }
      return drag.slotPitch.get(folder);
    };
    const slotAfterHeader = (row) =>
      row?.node?.classList?.contains("tab-group-label-container") ? slotPitchOf(row.node.parentElement) : 0;

    const rowFolder = (row) => {
      const node = row?.node;
      if (!node) {
        return null;
      }
      if (isFolderEl(node)) {
        return node;
      }
      if (node.classList?.contains("tab-group-label-container")) {
        return isFolderEl(node.parentElement) ? node.parentElement : null;
      }
      return node.parentElement?.closest?.("zen-folder, tab-group:not([split-view-group])") || null;
    };
    const isFolderStart = (row, folder) => !!row && !!folder && (row.node === folder || row.node === headerOf(folder));
    const notARow = (row) => row.node === drag.moving || (drag.folder && drag.folder.contains(row.node));
    const rowBelowSep = (row) => drag.sepTop != null && row.top > drag.sepTop;
    const tabBelowSep = () => {
      if (drag.sepTop == null) {
        return false;
      }
      const startedBelow = drag.origin > drag.sepTop;
      return startedBelow ? !drag.sepDelta : !!drag.sepDelta;
    };

    const topLevel = (row) => (row.node.classList?.contains("tab-group-label-container") ? row.node.parentElement : row.node);

    const setDropSlot = (folder) => {
      if (!drag || drag.slot === folder) {
        return;
      }

      drag.slot?.removeAttribute("zia-drop-slot");
      drag.slot = folder || null;
      folder?.setAttribute("zia-drop-slot", "true");
      // Over an empty folder the tab covers its slot, so the tab carries the
      // slot's dashes instead (chrome.css), in the folder's colour.
      const tab = drag.moving === drag.tab ? drag.tab : null;
      const into = !!tab && !!folder?.hasAttribute("zia-empty");
      if (into) {
        tab.style.setProperty("--zia-slot-border", getComputedStyle(folder).getPropertyValue("--zia-slot-border"));
      }
      tab?.toggleAttribute("zia-into-empty", into);
    };

    const updateTarget = (visualMid) => {
      let prev = null;
      let next = null;
      for (const row of drag.rows) {
        if (notARow(row)) {
          continue;
        }
        const above = row.index < drag.index ? !drag.shifted.has(row.node) : drag.shifted.has(row.node);
        if (above) {
          prev = row;
        } else if (!next) {
          next = row;
        }
      }
      const below = tabBelowSep();
      const same = (row) => !!row && rowBelowSep(row) === below;
      const slotTop = same(prev) ? prev.top + prev.delta + prev.height + Math.max(0, drag.pitch - drag.height) : null;
      const pf = same(prev) ? rowFolder(prev) : null;
      const nf = same(next) ? rowFolder(next) : null;

      const leaveUp = (row) =>
        row.index < drag.index ? row.top + row.height - 8 : row.top - 10;
      const leaveDown = (row) => {
        if (!row || !same(row)) {
          return drag.sepTop != null ? drag.sepTop + 2 : null;
        }
        return row.index > drag.index ? row.top + 8 : row.top + row.height + 10;
      };
      let cut = slotTop != null ? slotTop + drag.height / 2 - 2 : null;
      if (prev && same(prev)) {
        // the last folder before the separator has no row after it: its
        // slot is a whole tab tall, not the sliver down to the separator
        const down = !same(next) && slotTop != null ? slotTop + drag.height + 10 : leaveDown(next);
        if (down != null) {
          cut = (leaveUp(prev) + down) / 2;
        }
      }
      let folder = null;
      let atEnd = false;
      if (pf && nf === pf && !isFolderStart(next, pf)) {
        folder = pf;
      } else if (pf && cut != null && visualMid < cut) {
        folder = pf;
        atEnd = true;
      } else if (nf && !isFolderStart(next, nf)) {
        folder = nf;
      }
      if (folder && drag.moving.contains?.(folder)) {
        folder = null;
      }
      // a folder is only ever moved among the rows, never into a folder
      if (drag.folder) {
        folder = null;
        atEnd = false;
      }

      const crosses = below === !!drag.tab.pinned;

      // Zen won't take a split across the separator itself, so Zia does
      const hand = drag.folder
        ? true
        : drag.split ? crosses && !folder : !!folder || !!pf || (!!nf && isFolderStart(next, nf)) || crosses;
      drag.target = { folder, atEnd, prev, next, below, sameNext: same(next), slotTop, hand };
      setDropSlot(folder);
    };

    const paintedFolders = new Set();
    const paintFolders = () => {
      const target = drag.target;
      const folders = new Set();
      for (const row of drag.rows) {
        for (let f = rowFolder(row); f; f = f.parentElement?.closest?.("zen-folder, tab-group:not([split-view-group])")) {
          folders.add(f);
        }
      }
      for (const f of folders) {
        if (drag.folder && (f === drag.folder || drag.folder.contains(f))) {
          continue;
        }
        const into = !!target?.folder && (target.folder === f || f.contains(target.folder));
        let top = 0;
        let grow = 0;
        if (isCollapsed(f) && !f.contains(drag.moving)) {
          grow = into ? drag.pitch : 0;
        } else {
          let origBottom = -Infinity;
          let shownBottom = -Infinity;
          for (const row of drag.rows) {
            if (row.node === f || !f.contains(row.node)) {
              continue;
            }
            const slot = slotAfterHeader(row);
            origBottom = Math.max(origBottom, row.top + row.height + slot);
            if (row.node === headerOf(f)) {
              top = row.delta || 0;
            }
            if (!notARow(row)) {
              const intoThisSlot = slot && into && target.folder === row.node.parentElement;
              shownBottom = Math.max(shownBottom, row.top + (row.delta || 0) + row.height + (intoThisSlot ? 0 : slot));
            }
          }
          if (into && target.slotTop != null) {
            shownBottom = Math.max(shownBottom, target.slotTop + drag.height);
          }
          if (Number.isFinite(origBottom) && Number.isFinite(shownBottom)) {
            grow = shownBottom - origBottom;
          }
        }
        f.style.setProperty("--zia-drag-bg-top", `${Math.round(top)}px`);
        f.style.setProperty("--zia-drag-bg-grow", `${Math.round(grow)}px`);
        if (!f.hasAttribute("zia-bg-shift")) {
          f.setAttribute("zia-bg-shift", "true");
        }
        paintedFolders.add(f);
      }
    };

    const clearFolderPaint = () => {
      for (const f of paintedFolders) {
        f.removeAttribute("zia-bg-shift");
        f.style.removeProperty("--zia-drag-bg-top");
        f.style.removeProperty("--zia-drag-bg-grow");
      }
      paintedFolders.clear();
    };

    const FOLDER_TAB_INSET = { start: 14.5, end: 5 };
    const bgOf = (tab) => tab?.querySelector?.(":scope > .tab-stack > .tab-background");
    const contentOf = (tab) => tab?.querySelector?.(":scope > .tab-stack > .tab-content");
    const showing = (tab) => {
      if (tab?.visible === false || tab?.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) === false) {
        return null;
      }
      const bg = bgOf(tab);
      const box = bg?.getBoundingClientRect();
      return box && box.width > 20 && box.height > 8 ? box : null;
    };
    const folderBox = (folder) => {
      const box = folder.getBoundingClientRect();
      const before = getComputedStyle(folder, "::before");
      return { left: box.left + (parseFloat(before.left) || 0), right: box.right - (parseFloat(before.right) || 0) };
    };
    const sampleTab = (inside) =>
      [...(inside?.tabs || gBrowser.visibleTabs)].find(
        (tab) => tab !== drag.tab && !tab.hasAttribute("zen-essential") && !tab.hasAttribute("zen-empty-tab") && showing(tab) &&
          (inside ? true : !tab.group || tab.group.hasAttribute("split-view-group") ? !inside : true)
      );
    const widthFor = (folder) => {
      if (folder) {
        const own = sampleTab(folder);
        if (own && own.group === folder) {
          const box = showing(own);
          return { left: box.left, right: box.right };
        }
        let inset = FOLDER_TAB_INSET;
        const other = [...gBrowser.visibleTabs].find(
          (tab) => tab !== drag.tab && tab.group && isFolderEl(tab.group) && !tab.group.group && showing(tab)
        );
        if (other) {
          const box = showing(other);
          const fb = folderBox(other.group);
          inset = { start: box.left - fb.left, end: fb.right - box.right };
        }
        const fb = folderBox(folder);
        return { left: fb.left + inset.start, right: fb.right - inset.end };
      }
      const plain = [...gBrowser.visibleTabs].find(
        (tab) => tab !== drag.tab && !tab.group && !tab.hasAttribute("zen-essential") && !tab.hasAttribute("zen-empty-tab") && showing(tab)
      );
      if (plain) {
        const box = showing(plain);
        return { left: box.left, right: box.right };
      }
      const anyFolder = document.querySelector("#tabbrowser-tabs zen-folder");
      return anyFolder ? folderBox(anyFolder) : null;
    };

    const morphWidth = (folder) => {
      const key = folder || "plain";
      if (drag.widthKey === key || !drag.bg) {
        return;
      }
      drag.widthKey = key;
      const want = widthFor(folder);
      let start = want ? want.left - drag.bgBox.left : 0;
      let end = want ? drag.bgBox.right - want.right : 0;

      if (Math.abs(start) > 40 || Math.abs(end) > 40) {
        start = 0;
        end = 0;
      }

      const tab = drag.split || drag.tab;
      tab.style.setProperty("--zia-morph-bg-start", `${drag.bgBase.start + start}px`);
      tab.style.setProperty("--zia-morph-bg-end", `${drag.bgBase.end + end}px`);
      tab.style.setProperty("--zia-morph-content-start", `${drag.contentBase.start + start}px`);
      tab.style.setProperty("--zia-morph-content-end", `${drag.contentBase.end + end}px`);
      tab.setAttribute("zia-morph", "true");
    };

    const unmorphWidth = (tab) => {
      for (const node of [tab, tab?.group?.hasAttribute("split-view-group") ? tab.group : null]) {
        if (!node?.hasAttribute("zia-morph")) {
          continue;
        }
        node.setAttribute("zia-morph-done", "true");
        node.removeAttribute("zia-morph");
        for (const name of ["--zia-morph-bg-start", "--zia-morph-bg-end", "--zia-morph-content-start", "--zia-morph-content-end"]) {
          node.style.removeProperty(name);
        }
        node.getBoundingClientRect();
        node.removeAttribute("zia-morph-done");
      }
    };

    const newTabButton = () =>
      window.gZenWorkspaces?.activeWorkspaceElement?.newTabButton ||
      document.querySelector("#tabs-newtab-button, #vertical-tabs-newtab-button");

    let lastTap = 0;
    // Zia's own tap. Only if haptics are on in Zen; while a drag has them
    // muted, they're let through for just this one.
    const tap = () => {
      const muted = hapticsWereOn !== null;
      if (muted ? !hapticsWereOn : !Services.prefs.getBoolPref(HAPTIC_PREF, true)) {
        return;
      }
      const now = Date.now();

      if (now - lastTap < 140) {
        return;
      }
      lastTap = now;
      try {
        if (muted) {
          Services.prefs.setBoolPref(HAPTIC_PREF, true);
        }
        zenHaptic?.();
      } catch (err) {
        noteError("tab dragging: tap", err);
      } finally {
        if (muted) {
          Services.prefs.setBoolPref(HAPTIC_PREF, false);
        }
      }
    };

    const placeSep = (sepDelta) => {
      const sep = currentSeparator();
      if (sep && drag.sepDelta !== sepDelta) {
        drag.sepDelta = sepDelta;
        drag.sepShownY = sepDelta;
        place(sep, sepDelta, false);

        const onTop = Services.prefs.getBoolPref("zen.view.show-newtab-button-top", false);
        const button = onTop ? newTabButton() : null;
        if (button) {
          place(button, sepDelta, false);
        }
      }
    };

    // A dragged folder whose height has changed since the list was measured
    // (it shut after the drag began): the list is measured again, or every
    // row would be moved by the old height and the drop land in the wrong
    // place.
    const remeasureFolderDrag = (folder) => {
      const strip = document.getElementById("tabbrowser-tabs");
      // measured where they sit, not partway through sliding back
      strip?.setAttribute("zia-measuring", "true");
      for (const row of drag.rows) {
        if (row.node !== folder && !folder.contains(row.node)) {
          place(row.node, 0, false);
          row.delta = 0;
          row.shownY = 0;
        }
      }
      placeSep(0);
      const kept = folder.style.getPropertyValue("transform");
      const keptPriority = folder.style.getPropertyPriority("transform");
      folder.style.removeProperty("transform");
      // (a real layout read first: the measuring below reads it unflushed)
      folder.getBoundingClientRect();
      const rows = measureRows(null);
      const box = layoutTop(folder);
      folder.style.setProperty("transform", kept, keptPriority);
      strip?.removeAttribute("zia-measuring");
      const mine = rows.find((row) => row.node === folder || folder.contains(row.node));
      const sep = currentSeparator();
      drag.rows = rows;
      drag.origin = box.top;
      drag.height = box.height;
      drag.pitch = box.height;
      drag.index = mine?.index ?? drag.index;
      drag.shifted = new Set();
      drag.sepTop = sep ? sep.getBoundingClientRect().top : null;
    };

    const apply = (dy) => {
      const moving = drag?.moving;
      if (!moving?.isConnected || !drag.rows) {
        return;
      }
      if (drag.folder && !drag.essentials && Math.abs(drag.folder.getBoundingClientRect().height - drag.height) > 3) {
        remeasureFolderDrag(drag.folder);
      }
      const visualMid = drag.origin + dy + drag.height / 2;
      place(moving, dy, true);

      // over the essentials (a tab or a split): the list closes up behind it
      if (drag.essentials || drag.splitEssential) {
        for (const row of drag.rows) {
          if (notARow(row)) {
            continue;
          }
          const gone = row.index > drag.index;
          if (gone) {
            drag.shifted.add(row.node);
          } else {
            drag.shifted.delete(row.node);
          }
          const delta = gone ? -drag.pitch : 0;
          if ((row.shownY ?? row.delta) !== delta) {
            row.delta = delta;
            row.shownY = delta;
            place(row.node, delta, false);
          }
        }
        if (drag.sepTop != null) {
          placeSep(drag.origin > drag.sepTop ? 0 : -drag.pitch);
        }
        drag.target = null;
        setDropSlot(null);
        takeEmptySlot();
        paintFolders();
        return;
      }

      let rowsMoved = false;
      for (const row of drag.rows) {
        if (notARow(row)) {
          continue;
        }
        const was = drag.shifted.has(row.node);
        let shift = false;
        if (row.index > drag.index) {
          shift = visualMid > row.top + (was ? -10 : 8);
        } else if (row.index < drag.index) {
          shift = visualMid < row.top + row.height - (was ? -10 : 8);
        }
        if (shift) {
          drag.shifted.add(row.node);
        } else {
          drag.shifted.delete(row.node);
        }
        const delta = shift ? (row.index > drag.index ? -drag.pitch : drag.pitch) : 0;
        if (row.delta === delta) {
          continue;
        }
        row.delta = delta;
        row.shownY = delta;
        place(row.node, delta, false);
        rowsMoved = true;
      }
      if (drag.sepTop != null) {
        const startedBelow = drag.origin > drag.sepTop;
        let sepDelta = 0;
        // Coming up from below, it's over once it's half a tab past the
        // separator, and stays over until it's back past where the
        // separator has moved to: the tab-sized space that opens is the
        // last folder's end (top half) and the gap after it (bottom half)
        const upTo = drag.sepDelta ? drag.sepTop + drag.pitch + 2 : drag.sepTop + drag.pitch / 2;
        if (startedBelow && visualMid < upTo) {
          sepDelta = drag.pitch;
        } else if (!startedBelow && visualMid > drag.sepTop + 2) {
          sepDelta = -drag.pitch;
        }
        placeSep(sepDelta);
      }
      if (rowsMoved) {
        tap();
      }
      updateTarget(visualMid);
      takeEmptySlot();
      paintFolders();
      morphWidth(drag.target?.folder || null);
    };

    // Dropping into an open empty folder uses its slot as the tab's room, so
    // everything after the folder moves up by the slot's height on top of the
    // usual shift, and the slot itself fades (chrome.css).
    const takeEmptySlot = () => {
      const folder = drag.target?.folder;
      const pitch = slotPitchOf(folder);
      const headerRow = pitch ? drag.rows.find((row) => row.node === headerOf(folder)) : null;
      const after = (row) => !!headerRow && row.index > headerRow.index && !folder.contains(row.node);
      for (const row of drag.rows) {
        if (notARow(row)) {
          continue;
        }
        const want = (row.delta || 0) + (after(row) ? -pitch : 0);
        if ((row.shownY ?? row.delta ?? 0) !== want) {
          place(row.node, want, false);
        }
        row.shownY = want;
      }
      const sep = currentSeparator();
      if (sep && drag.sepTop != null) {
        const sepAfter = !!headerRow && drag.sepTop > headerRow.top;
        const want = (drag.sepDelta || 0) + (sepAfter ? -pitch : 0);
        if ((drag.sepShownY ?? drag.sepDelta ?? 0) !== want) {
          place(sep, want, false);
          const button = Services.prefs.getBoolPref("zen.view.show-newtab-button-top", false) ? newTabButton() : null;
          if (button) {
            place(button, want, false);
          }
        }
        drag.sepShownY = want;
      }
    };

    const pinFor = (tab, pinned) => {
      try {
        if (pinned && !tab.pinned) {
          gBrowser.pinTab(tab);
        } else if (!pinned && tab.pinned) {
          gBrowser.unpinTab(tab);
        }
      } catch (err) {
        noteError("tab dragging: pinFor", err);
      }
    };

    const placeBefore = (tab, before) => {
      if (!tab || !before?.parentNode || tab === before) {
        return;
      }
      try {
        if (typeof gBrowser.moveTabBefore === "function" && (gBrowser.isTab(before) || isFolderEl(before) || before.localName === "tab-group")) {
          gBrowser.moveTabBefore(tab, before);
        }
      } catch (err) {
        noteError("tab dragging: placeBefore", err);
      }
      if (tab.nextElementSibling !== before) {
        try {
          if (tab.group && !before.closest?.("tab-group")) {
            gBrowser.ungroupTab?.(tab);
          }
        } catch (err) {
          noteError("tab dragging: placeBefore (2)", err);
        }
        before.parentNode.insertBefore(tab, before);
      }
    };

    const placeAfter = (tab, after) => {
      try {
        gBrowser.moveTabAfter(tab, after);
      } catch (err) {
        noteError("tab dragging: placeAfter", err);
      }
      if (after.nextElementSibling !== tab) {
        after.after(tab);
      }
    };

    const finishDrop = (tab, target) => {
      if (!tab?.isConnected) {
        return;
      }
      // A split crossing the separator: both its tabs pinned (or not), then
      // the split as a whole goes to the spot
      const split = tab.group?.hasAttribute("split-view-group") ? tab.group : null;
      if (split) {
        for (const t of [...split.tabs]) {
          pinFor(t, !target.below);
        }
        const group = tab.group || split;
        if (target.next && target.sameNext) {
          placeBefore(group, topLevel(target.next));
        } else if (!target.below && currentSeparator()) {
          placeBefore(group, currentSeparator());
        } else {
          try {
            gBrowser.moveTabToEnd?.(group);
          } catch (err) {
            noteError("tab dragging: finishDrop (split)", err);
          }
        }
        return;
      }
      if (target.below && tab.group && !tab.group.hasAttribute("split-view-group")) {
        try {
          gBrowser.ungroupTab?.(tab);
        } catch (err) {
          noteError("tab dragging: finishDrop", err);
        }
      }
      pinFor(tab, !target.below);
      const folder = target.folder;
      if (folder && isCollapsed(folder)) {
        parkInFolder(tab, folder);
        return;
      }
      if (folder && target.atEnd) {
        const last = target.prev?.item;
        if (last && gBrowser.isTab(last) && folder.contains(last)) {
          placeAfter(tab, last);
        } else {
          folder.addTabs?.([tab]);
        }
        return;
      }
      if (target.next && target.sameNext) {
        placeBefore(tab, topLevel(target.next));
        return;
      }
      if (target.below) {
        try {
          gBrowser.moveTabToEnd?.(tab);
        } catch (err) {
          noteError("tab dragging: finishDrop (2)", err);
        }
        return;
      }
      if (!target.below) {
        const sep = currentSeparator();
        if (sep) {
          placeBefore(tab, sep);
        }
      }
    };

    // Zen drops a folder by what's under the pointer, which with the rows
    // slid about is often a closed folder it then nests it in. Straight
    // after, the folder is put where Zia showed it: among the rows, before
    // the one it was shown above, and never inside another folder.
    const outermostRow = (node) => {
      let row = topLevel({ node });
      for (let up = row.parentElement?.closest?.("zen-folder"); up; up = up.parentElement?.closest?.("zen-folder")) {
        row = up;
      }
      return row;
    };
    const finishFolderDrop = (folder, target) => {
      if (!folder?.isConnected || !target) {
        return;
      }
      const nestedIn = folder.parentElement?.closest?.("zen-folder") || null;
      const next = target.next && target.sameNext && !target.below ? outermostRow(target.next.node) : null;
      if (next && next !== folder && !folder.contains(next)) {
        placeBefore(folder, next);
      } else if (currentSeparator()) {
        placeBefore(folder, currentSeparator());
      }
      if (folder.parentElement?.closest?.("zen-folder")) {
        console.warn("[Zia] The dropped folder is still inside another folder");
      }
      // a closed folder it was taken back out of fits its new contents
      if (nestedIn && nestedIn !== folder.parentElement?.closest?.("zen-folder") && isCollapsed(nestedIn)) {
        try {
          window.gZenFolders?.on_TabGroupCollapse?.({ target: nestedIn });
        } catch (err) {
          noteError("tab dragging: refold folder", err);
        }
      }
    };

    // A folder's animations straight to their last moment (not past it:
    // Zen only leaves its end styles once they've finished)
    const jumpToEnd = (folder) => {
      for (const anim of folder.getAnimations?.({ subtree: true }) || []) {
        try {
          const end = anim.effect?.getComputedTiming?.().endTime;
          if (anim.id !== "zia-land" && end > 1) {
            anim.currentTime = end - 1;
          }
        } catch (err) {
          noteError("tab dragging: folder animations", err);
        }
      }
    };

    const parkInFolder = (tab, folder) => {
      folder?.removeAttribute("zia-drop-slot");
      if (!tab || !folder) {
        return;
      }
      if (!folder.contains(tab)) {
        const hadActive = folder.hasAttribute("has-active");
        if (!hadActive) {
          folder.setAttribute("has-active", "true");
          folder.activeTabs = [];
        }
        try {
          folder.addTabs?.([tab]);
        } catch (err) {
          console.error("[Zia] Could not add the tab to the folder:", err);
        }
        if (!hadActive && !tab.selected) {
          folder.removeAttribute("has-active");
          folder.activeTabs = [];
        }
      }
      try {
        if (!isCollapsed(folder)) {
          folder.collapsed = true;
        } else if (tab.selected) {
          window.gZenFolders?.animateSelect?.(folder);
        } else {
          window.gZenFolders?.on_TabGroupCollapse?.({ target: folder });
        }
      } catch (err) {
        console.error("[Zia] Could not settle the folder:", err);
      }
      // Zen slides the folder's list down into place (it starts pushed up
      // out of sight), so the tab just dropped there blinked out and slid
      // in from above: it's where it landed already
      jumpToEnd(folder);
    };

    let proxy = null;
    let proxyLeaveTimer = 0;
    let landingTab = null;
    const PROXY_MS = 140;

    let roomFor = null;
    const makeRoom = (container) => {
      if (roomFor === container) {
        return;
      }
      roomFor?.removeAttribute("zia-make-room");
      roomFor = container || null;
      if (roomFor) {
        roomFor.style.setProperty("--zia-room", `${Math.round(tileSize().height + 8)}px`);
        roomFor.setAttribute("zia-make-room", "true");
      }
    };

    const canBeEssential = (tab) => {
      try {
        return window.gZenPinnedTabManager?.canEssentialBeAdded?.(tab) ?? true;
      } catch (err) {
        return false;
      }
    };

    const tileSize = () => {
      const usable = (el) => {
        const box = el?.isConnected ? window.windowUtils.getBoundsWithoutFlushing(el) : null;
        return box && box.width > 8 && box.height > 8 ? box : null;
      };

      const ownGrid = window.gZenWorkspaces?.getCurrentEssentialsContainer?.();
      const real = [...(ownGrid || document).querySelectorAll(".tabbrowser-tab[zen-essential]:not([zia-essential-proxy])")].find(
        (tile) => usable(tile)
      );
      const realBox = usable(real);
      if (realBox) {
        const bg = usable(real.querySelector(".tab-background")) || realBox;
        const stack = usable(real.querySelector(".tab-stack")) || realBox;
        // a split essential's half, if there's one, measured as it is
        const half = usable(
          (ownGrid || document).querySelector(".tabbrowser-tab[zen-essential][zia-split-tile]:not([zia-essential-proxy]) .zia-split-half")
        );
        return { width: realBox.width, height: bg.height, stackHeight: stack.height, half };
      }
      const box = usable(gBrowser.tabContainer.tabDragAndDrop?._fakeEssentialTab);
      if (box) {
        return { width: box.width, height: box.height };
      }

      const grid = window.gZenWorkspaces?.getCurrentEssentialsContainer?.() || document.getElementById("zen-essentials");
      const width = grid?.clientWidth ? (grid.clientWidth - 3 * 8) / 4 : 56;
      return { width, height: Math.round(width * 0.75) };
    };

    // A split tile's halves fill an essential's inner box but 8px all round,
    // and a stand-in isn't that box's size: its halves are given the real
    // ones' height (their width follows), centred, to match them exactly
    const fitSplitHalves = (node, stackHeight, half = null) => {
      if (half) {
        node.style.setProperty("--zia-split-half-height", `${half.height}px`);
        node.style.setProperty("--zia-split-half-width", `${half.width}px`);
      } else if (stackHeight > 16) {
        node.style.setProperty("--zia-split-half-height", `${stackHeight - 16}px`);
      }
    };

    // sized like the essential copy, and kept that way when Zen clears widths
    const sizeProxy = (node, width, height) => sizeCopy(node, width, height);

    const moveProxy = (x, y) => {
      const off = proxy.ziaOffset || { x: 0, y: 0 };
      proxy.style.setProperty("left", `${Math.round(x - off.x)}px`, "important");
      proxy.style.setProperty("top", `${Math.round(y - off.y)}px`, "important");
    };

    const showProxy = (x, y) => {
      clearTimeout(proxyLeaveTimer);
      if (!proxy) {
        const host = root;
        if (!host || !drag?.tab) {
          return;
        }
        proxy = drag.tab.cloneNode(true);
        proxy.removeAttribute("id");
        for (const name of [
          "zia-dragging", "zia-shift", "zia-drop-lock", "zia-to-essential", "multiselected", "dragtarget", "pending-drag",

          "zen-pinned-changed", "folder-active", "zen-folder-active",
        ]) {
          proxy.removeAttribute(name);
        }
        proxy.setAttribute("zen-essential", "true");
        proxy.setAttribute("pinned", "true");
        proxy.setAttribute("zia-essential-proxy", "true");
        proxy.id = "zia-essential-proxy";
        proxy.style.cssText = "";
        for (const [name, value] of [
          ["position", "fixed"],
          ["margin", "0"],
          ["z-index", "2147483646"],
          ["pointer-events", "none"],
          ["transform", "none"],
          ["translate", "-50% -50%"],
        ]) {
          proxy.style.setProperty(name, value, "important");
        }
        const row = drag.moving.getBoundingClientRect();
        sizeProxy(proxy, row.width, row.height);
        host.appendChild(proxy);
        if (drag.split) {
          // a split starts as the tile itself, not squeezed from its row
          dressSplitProxy(proxy, drag.tab);
          const tile = tileSize();
          sizeProxy(proxy, tile.bgWidth || tile.width, tile.bgHeight || tile.height);
          fitSplitHalves(proxy, tile.stackHeight, tile.half);
        }
        try {
          window.gZenPinnedTabManager?.setEssentialTabIcon?.(proxy);
        } catch (err) {
          noteError("tab dragging: showProxy", err);
        }
        moveProxy(x, y);

        const box = proxy.getBoundingClientRect();
        proxy.ziaOffset = { x: box.left + box.width / 2 - x, y: box.top + box.height / 2 - y };
      }
      proxy.ziaLeaving = false;
      const props = ["width", "height", "min-width", "max-width", "min-height", "max-height"];
      proxy.style.setProperty("transition", props.map((name) => `${name} ${PROXY_MS}ms ease-out`).join(", "), "important");
      if (!drag.moving.hasAttribute("zia-to-essential")) {
        tap();
      }
      drag.moving.setAttribute("zia-to-essential", "true");
      const tile = tileSize();

      sizeProxy(proxy, tile.bgWidth || tile.width, tile.bgHeight || tile.height);
      moveProxy(x, y);
    };

    const hideProxy = () => {
      if (!proxy || proxy.ziaLeaving || !drag?.moving) {
        return;
      }
      proxy.ziaLeaving = true;
      const row = drag.moving.getBoundingClientRect();
      proxy.style.setProperty("transition", `all ${PROXY_MS}ms ease-out`, "important");
      sizeProxy(proxy, row.width, row.height);
      moveProxy(row.left + row.width / 2, row.top + row.height / 2);
      const leaving = proxy;
      const moving = drag.moving;
      proxyLeaveTimer = setTimeout(() => {
        if (proxy === leaving && leaving.ziaLeaving) {
          leaving.remove();
          proxy = null;
          moving.removeAttribute("zia-to-essential");
        }
      }, PROXY_MS);
    };

    const landProxy = (tab) => {
      const tile = proxy;
      proxy = null;
      clearTimeout(proxyLeaveTimer);
      if (!tile) {
        return;
      }
      landingTab = tab;
      const done = () => {
        tile.remove();
        tab.removeAttribute("zia-to-essential");
        if (landingTab === tab) {
          landingTab = null;
        }
      };

      const whenEssential = (then, tries = 0) => {
        if (tab.isConnected && tab.hasAttribute("zen-essential")) {
          then();
        } else if (tries < 30) {
          requestAnimationFrame(() => whenEssential(then, tries + 1));
        } else {
          done();
        }
      };
      setTimeout(
        () =>
          whenEssential(() => {
            tab.removeAttribute("zia-essential-enter");
            for (const animation of tab.querySelector(".tab-stack")?.getAnimations?.() || []) {
              if (animation.effect?.getComputedTiming().endTime !== Infinity) {
                animation.finish();
              }
            }
            const own = tab.getBoundingClientRect();
            const drawn = tab.querySelector(".tab-background")?.getBoundingClientRect() || own;
            const box = { left: own.left, width: own.width, top: drawn.top, height: drawn.height };
            const off = tile.ziaOffset || { x: 0, y: 0 };
            tile.style.setProperty("transition", `all ${PROXY_MS}ms ease-out`, "important");
            tile.style.setProperty("left", `${Math.round(box.left + box.width / 2 - off.x)}px`, "important");
            tile.style.setProperty("top", `${Math.round(box.top + box.height / 2 - off.y)}px`, "important");
            sizeProxy(tile, box.width, box.height);
            setTimeout(done, PROXY_MS + 20);
          }),
        0
      );
    };

    const fitZenSlot = () => fitSlot(gBrowser.tabContainer.tabDragAndDrop?._fakeEssentialTab);
    const fitSlot = (slot) => {
      if (!slot?.isConnected || slot.ziaFitted) {
        return;
      }
      const grid = window.gZenWorkspaces?.getCurrentEssentialsContainer?.();
      const tiles = [...(grid || document).querySelectorAll(".tabbrowser-tab[zen-essential]:not([zia-essential-proxy])")]
        .map((tile) => tile.getBoundingClientRect())
        .filter((box) => box.width > 8);
      if (!tiles.length) {
        return;
      }
      const first = tiles[0];
      const across = tiles.find((box) => Math.abs(box.top - first.top) < 2 && box.left > first.left + 2);
      const down = tiles.find((box) => box.top > first.top + 2);
      const stepX = across ? across.left - first.left : first.width + 7;
      const stepY = down ? down.top - first.top : first.height + (stepX - first.width);
      const own = slot.getBoundingClientRect();
      const width = stepX - 4;
      const height = stepY - 4;
      slot.style.setProperty("width", `${width}px`, "important");
      slot.style.setProperty("min-width", `${width}px`, "important");
      slot.style.setProperty("max-width", `${width}px`, "important");
      slot.style.setProperty("height", `${height}px`, "important");
      slot.style.setProperty("min-height", `${height}px`, "important");
      slot.style.setProperty("margin-inline-end", `${Math.min(0, (own.width || first.width) - width)}px`, "important");
      slot.style.setProperty("margin-block-end", `${Math.min(0, first.height - height)}px`, "important");
      slot.ziaFitted = true;
    };

    // Zen opens a cell for a tab dragged over the essentials (a new row when
    // the last is full), but turns a split down there, so a split essential
    // on its way in had no room made for it: Zia opens the same cell
    let splitSlot = null;
    const holdSplitSlot = (on) => {
      const grid = on ? window.gZenWorkspaces?.getCurrentEssentialsContainer?.() : null;
      if (splitSlot && splitSlot.parentElement === grid) {
        return;
      }
      splitSlot?.remove();
      splitSlot = null;
      if (!grid) {
        return;
      }
      splitSlot = document.createXULElement("vbox");
      splitSlot.setAttribute("zia-split-slot", "true");
      grid.appendChild(splitSlot);
      fitSlot(splitSlot);
    };

    const dropProxy = () => {
      clearTimeout(proxyLeaveTimer);
      proxy?.remove();
      proxy = null;
      document.querySelectorAll("[zia-to-essential]").forEach((node) => {
        if (node !== landingTab) {
          node.removeAttribute("zia-to-essential");
        }
      });
    };

    const THUMB_MS = 150;
    let thumb = null;
    let thumbTimer = 0;

    const pictureSource = () => {
      const source = document.getElementById("zia-split-drag-picture");
      return source?.width ? source : null;
    };
    const pictureSize = () => {
      const source = pictureSource();
      const width = parseFloat(source?.style.width) || DRAG_PICTURE_W;
      const height = parseFloat(source?.style.height) || DRAG_PICTURE_H;
      return { width, height };
    };

    const fillThumb = () => {
      if (!thumb) {
        return;
      }
      const source = pictureSource();
      if (source) {
        let canvas = thumb.querySelector("canvas");
        if (!canvas) {
          canvas = document.createElementNS(XHTML_NS, "canvas");
          thumb.replaceChildren(canvas);
        }
        if (canvas.width !== source.width || canvas.height !== source.height) {
          canvas.width = source.width;
          canvas.height = source.height;
        }
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(source, 0, 0);
        thumb.removeAttribute("zia-card");
      } else if (!thumb.firstChild && drag?.tab) {
        const icon = document.createElementNS(XHTML_NS, "img");
        icon.setAttribute("src", gBrowser.getIcon(drag.tab) || DEFAULT_TAB_ICON);
        thumb.replaceChildren(icon);
        thumb.setAttribute("zia-card", "true");
      }
    };

    const sizeThumb = (node, width, height) => {
      node.style.width = `${Math.round(width)}px`;
      node.style.height = `${Math.round(height)}px`;
    };

    const showThumb = (x, y) => {
      clearTimeout(thumbTimer);
      if (!thumb) {
        thumb = document.createElementNS(XHTML_NS, "div");
        thumb.id = "zia-drag-thumb";
        const row = (bgOf(drag.tab) || drag.moving).getBoundingClientRect();
        sizeThumb(thumb, row.width, row.height);
        thumb.style.left = `${Math.round(row.left + row.width / 2)}px`;
        thumb.style.top = `${Math.round(row.top + row.height / 2)}px`;
        root.appendChild(thumb);
        thumb.getBoundingClientRect();
      }
      fillThumb();
      thumb.removeAttribute("zia-leaving");
      const size = pictureSize();
      sizeThumb(thumb, size.width, size.height);
      thumb.style.left = `${Math.round(x)}px`;
      thumb.style.top = `${Math.round(y)}px`;
      if (!drag.moving.hasAttribute("zia-drag-away")) {
        tap();
      }
      drag.moving.setAttribute("zia-drag-away", "true");
    };

    const hideThumb = (instant = false) => {
      if (!thumb || thumb.hasAttribute("zia-leaving")) {
        return;
      }
      const leaving = thumb;
      const moving = drag?.moving;
      const done = () => {
        leaving.remove();
        if (thumb === leaving) {
          thumb = null;
        }
        moving?.removeAttribute("zia-drag-away");
      };
      if (instant || !moving?.isConnected) {
        done();
        return;
      }
      leaving.setAttribute("zia-leaving", "true");
      const row = (bgOf(drag.tab) || moving).getBoundingClientRect();
      sizeThumb(leaving, row.width, row.height);
      leaving.style.left = `${Math.round(row.left + row.width / 2)}px`;
      leaving.style.top = `${Math.round(row.top + row.height / 2)}px`;
      thumbTimer = setTimeout(done, THUMB_MS);
    };

    const noLanding = () => {
      const dnd = gBrowser.tabContainer.tabDragAndDrop;
      if (!dnd || dnd._landDragImageOnElements?.ziaQuiet) {
        return;
      }
      const original = dnd._landDragImageOnElements;
      const quiet = function (elements, ...rest) {
        try {
          for (const element of elements || []) {
            const { width, height } = element.getBoundingClientRect();
            this.ZenDragAndDropService.addDropLandingRect(
              Math.round(element.screenX),
              Math.round(element.screenY),
              Math.round(width),
              Math.round(height)
            );
          }
          this._landingElements = [];
        } catch (err) {
          return original?.call(this, elements, ...rest);
        }
        return undefined;
      };
      quiet.ziaQuiet = true;
      dnd._landDragImageOnElements = quiet;
    };

    const begin = (target, event) => {
      if (!target || target.hasAttribute?.("zen-essential")) {
        return;
      }
      const folder = target.localName === "zen-folder" || target.isZenFolder ? target : null;

      // an open folder that the drag caught before it shut: shut now
      if (folder && !isCollapsed(folder)) {
        snapShut(folder);
      }
      const split = !folder && target.group?.hasAttribute?.("split-view-group") ? target.group : null;
      const moving = folder || split || target;
      const rows = measureRows(folder ? null : target);
      const mine = rows.find((row) => row.item === target || row.node === moving || (folder && folder.contains(row.node)));
      const box = layoutTop(moving);
      const sep = currentSeparator();

      if (sep && !folder && (sep.hidden || sep.closest?.("[hide-separator]") || !sep.getBoundingClientRect().height)) {
        sep.setAttribute("zia-sep-open", "true");
      }
      const sepTop = sep ? sep.getBoundingClientRect().top : null;
      const side = (top) => (sepTop == null ? 0 : top > sepTop ? 1 : -1);
      let pitch = box.height;

      if (!folder && mine) {
        const fits = (gap) => gap > 8 && gap < box.height * 1.6;
        let best = Infinity;
        for (const row of rows) {
          if (Math.abs(row.index - mine.index) !== 1 || side(row.top) !== side(mine.top)) {
            continue;
          }
          const gap = Math.abs(row.top - mine.top);
          if (fits(gap) && gap < best) {
            best = gap;
          }
        }
        if (best === Infinity) {
          const sorted = [...rows].sort((a, b) => a.top - b.top);
          for (let i = 1; i < sorted.length; i++) {
            const gap = sorted[i].top - sorted[i - 1].top;
            if (side(sorted[i].top) === side(sorted[i - 1].top) && fits(gap) && gap < best) {
              best = gap;
            }
          }
        }
        if (best < Infinity) {
          pitch = best;
        }
      }
      document.documentElement.setAttribute("zia-dragging-tab", "true");
      muteZenHaptics(true);

      // a split's row narrows into a folder as a tab does, by its box
      const bg = folder ? null : split ? split.querySelector(":scope > .tab-group-container") : bgOf(target);
      const content = folder || split ? null : contentOf(target);
      const margins = (node) => {
        const style = node ? getComputedStyle(node) : null;
        return { start: parseFloat(style?.marginInlineStart) || 0, end: parseFloat(style?.marginInlineEnd) || 0 };
      };
      unclipAround(moving);
      noLanding();
      drag = {
        split,
        bg,
        content,
        bgBox: bg ? bg.getBoundingClientRect() : null,
        bgBase: margins(bg),
        contentBase: margins(content),
        widthKey: target.group && isFolderEl(target.group) ? target.group : "plain",
        tab: target,
        folder,
        moving,
        rows,
        origin: box.top,
        height: box.height,
        index: mine?.index ?? 0,
        pitch,
        shifted: new Set(),
        sepTop,
        sepDelta: 0,
        clientY: event.clientY || pending?.clientY || 0,
        screenY: event.screenY || pending?.screenY || 0,
      };
      lastDy = 0;
      for (const row of rows) {
        if (row.node === moving || (folder && folder.contains(row.node))) {
          continue;
        }
        place(row.node, 0, false);
      }
    };

    window.addEventListener(
      "mousedown",
      (event) => {
        if (event.button !== 0) {
          return;
        }
        const tab = tabFromEvent(event);
        pending = tab ? { tab, clientY: event.clientY, screenY: event.screenY } : null;
      },
      true
    );

    // An open folder is shut the moment it starts to be dragged (before the
    // drag itself begins, and without Zen's folding animation), and is
    // dragged and dropped as a closed folder. A plain click on it still just
    // closes it.
    let snapping = null;
    // Shut at once: Zen's folding animations jump to their last frame, so
    // the list has its closed layout straight away
    const snapShut = (folder) => {
      try {
        folder.collapsed = true;
      } catch (err) {
        noteError("tab dragging: shut folder", err);
        return;
      }
      jumpToEnd(folder);
      folder.getBoundingClientRect();
    };
    window.addEventListener("mousedown", (event) => {
      snapping = null;
      if (event.button !== 0 || !featureOn("dia-tab-drag")) {
        return;
      }
      const label = event.target?.closest?.(".tab-group-label-container");
      const folder = label?.closest?.("zen-folder");
      if (!folder || label.parentElement !== folder || isCollapsed(folder)) {
        return;
      }
      snapping = { folder, x: event.screenX, y: event.screenY, shut: false };
    }, true);
    window.addEventListener("mousemove", (event) => {
      if (!snapping || snapping.shut) {
        return;
      }
      if (!(event.buttons & 1)) {
        snapping = null;
        return;
      }
      if (Math.hypot(event.screenX - snapping.x, event.screenY - snapping.y) < 2) {
        return;
      }
      snapping.shut = true;
      snapShut(snapping.folder);
    }, true);
    // shut already: the click that would have shut it isn't let reopen it
    window.addEventListener("click", (event) => {
      const shut = snapping?.shut && snapping.folder.contains(event.target);
      snapping = null;
      if (shut) {
        event.stopPropagation();
        event.preventDefault();
      }
    }, true);

    const onStart = (event) => {
      const tab = tabFromEvent(event);
      if (tab) {
        begin(tab, event);
        return;
      }
      const inSidebar = event.target?.closest?.("#navigator-toolbox, #tabbrowser-tabs");
      if (inSidebar && pending?.tab) {
        begin(pending.tab, event);
      }
    };
    window.addEventListener("dragstart", onStart, true);
    document.getElementById("tabbrowser-tabs")?.addEventListener("dragstart", onStart, true);

    const acceptSplitDrop = (event) => {
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
    };

    const pointerOf = (event) => ({
      x: event.clientX || (event.screenX ? event.screenX - window.mozInnerScreenX : 0),
      y: event.clientY || (event.screenY ? event.screenY - window.mozInnerScreenY : 0),
    });
    const inBox = (element, point) => {
      if (!element) {
        return false;
      }
      const box = element.getBoundingClientRect();
      return box.width > 0 && point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom;
    };

    const essentialsBottom = () => {
      let bottom = document.getElementById("zen-essentials")?.getBoundingClientRect().bottom ?? -Infinity;
      const grid = window.gZenWorkspaces?.getCurrentEssentialsContainer?.() || document.querySelector(".zen-essentials-container");
      for (const tile of grid?.querySelectorAll(".tabbrowser-tab[zen-essential]:not([zia-essential-proxy])") || []) {
        bottom = Math.max(bottom, tile.getBoundingClientRect().bottom);
      }
      return bottom;
    };

    // Over the essentials' tiles themselves (or just below the last row):
    // the essentials' own box stops a little short of the last row's
    // bottom, so a drag along it kept flipping into a list row.
    const overAnyTile = (point) => {
      const grid = window.gZenWorkspaces?.getCurrentEssentialsContainer?.() || document.querySelector(".zen-essentials-container");
      if (!grid) {
        return false;
      }
      const box = grid.getBoundingClientRect();
      let bottom = box.bottom;
      for (const tile of grid.querySelectorAll(".tabbrowser-tab[zen-essential]:not([zia-essential-proxy])")) {
        bottom = Math.max(bottom, tile.getBoundingClientRect().bottom);
      }
      return box.width > 0 && point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= bottom + 6;
    };

    let debugLast = "";
    const debugDrag = (event, point, sidebar, essentials) => {
      if (!Services.prefs.getBoolPref("zia.debug.drag", false)) {
        return;
      }
      const target = event.target;
      const name = (el) => (el ? `${el.localName}${el.id ? "#" + el.id : ""}` : "none");
      const box = (el) => {
        const b = el?.getBoundingClientRect?.();
        return b ? `${Math.round(b.left)},${Math.round(b.top)} ${Math.round(b.width)}x${Math.round(b.height)}` : "none";
      };
      const sep = currentSeparator();
      const line = `over ${name(target)} | away ${!!drag.away} | essentials ${!!drag.essentials} | can ${canBeEssential(drag.tab)} | tiles ${drag.hasTiles} | sep ${sep ? name(sep.parentElement) : "none"} ${drag.sepTop == null ? "-" : Math.round(drag.sepTop)} moved ${drag.sepDelta || 0}`;
      if (line !== debugLast) {
        debugLast = line;
        console.log(
          `[Zia drag] ${line} | firstTop ${drag.firstTop == null ? "-" : Math.round(drag.firstTop)} pitch ${Math.round(drag.pitch || 0)} | client ${event.clientX},${event.clientY} screen ${event.screenX},${event.screenY} point ${Math.round(point.x)},${Math.round(point.y)} | sidebar ${box(sidebar)} | essentials ${name(essentials)} ${box(essentials)} | proxy ${!!proxy}`
        );
      }
    };

    const onOver = (event) => {
      if (!drag?.moving?.isConnected) {
        return;
      }
      let dy = null;
      if (event.clientY) {
        dy = event.clientY - drag.clientY;
      } else if (event.screenY && drag.screenY) {
        dy = event.screenY - drag.screenY;
      }
      if (dy === null) {
        return;
      }
      lastDy = dy;
      try {
        const over = event.target;
        const point = pointerOf(event);
        const sidebar = document.getElementById("navigator-toolbox");

        const sideBox = sidebar?.getBoundingClientRect();
        drag.away =
          !drag.folder && !!point.x && !over?.closest?.("#navigator-toolbox") && !!sideBox?.width &&
          (point.x < sideBox.left || point.x > sideBox.right);

        if (drag.away) {
          debugDrag(event, point, sidebar, null);
          drag.essentials = false;
          hideProxy();
          if (!drag.folder && !drag.split) {
            showThumb(point.x, point.y);
          }
          return;
        }
        hideThumb();
        const essentials =
          document.getElementById("zen-essentials") ||
          window.gZenWorkspaces?.getCurrentEssentialsContainer?.() ||
          document.querySelector(".zen-essentials-container");
        const grid = window.gZenWorkspaces?.getCurrentEssentialsContainer?.() || document.querySelector(".zen-essentials-container");
        const hasTiles = !!grid?.querySelector(".tabbrowser-tab[zen-essential]:not([zia-essential-proxy])");
        const promo = over?.closest?.("zen-essentials-promo") || null;

        let overEssentials = !!promo || !!over?.closest?.("#zen-essentials") || inBox(essentials, point);

        drag.firstTop = drag.rows?.length ? Math.min(...drag.rows.map((row) => row.top)) : null;
        if (!overEssentials && !hasTiles && drag.firstTop != null) {
          overEssentials = point.y < drag.firstTop + 4;
        }
        drag.hasTiles = hasTiles;
        debugDrag(event, point, sidebar, essentials);
        drag.essentials = !drag.folder && !drag.split && overEssentials && canBeEssential(drag.tab);
        // A two-site split over the essentials becomes a split essential
        // (24b-split-essentials.js)
        drag.splitEssential = !!drag.split && overEssentials && canBecomeSplitEssential(drag.tab);
        if (drag.split && overEssentials && !drag.splitEssential && !drag.splitRefusalNoted) {
          drag.splitRefusalNoted = true;
          console.warn(`[Zia] Split essentials: this split can't go in the essentials: ${splitEssentialRefusal(drag.tab)}`);
        }
        // Zen turns a split down over the essentials, and without a yes
        // there'd be no drop at all
        holdSplitSlot(drag.splitEssential);
        if (drag.splitEssential) {
          acceptSplitDrop(event);
          if (point.x) {
            tapOnNewTile(point, null);
            showProxy(point.x, point.y);
          }
        } else if (drag.split) {
          hideProxy();
        }
        drag.noTiles = drag.essentials && !hasTiles && !promo;
        makeRoom(drag.noTiles ? document.getElementById("zen-essentials") || grid : null);
        if (drag.essentials) {
          fitZenSlot();
        }
        if (drag.essentials && point.x) {
          tapOnNewTile(point, null);
          showProxy(point.x, point.y);
        } else if (!drag.essentials && !drag.splitEssential) {
          hideProxy();
        }
        apply(dy);
      } catch (err) {
        console.error("[Zia] Tab drag failed:", err);
      }
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          if (drag) {
            apply(lastDy);
          }
        });
      }
    };
    const fixDrop = (event) => {
      const tab = drag?.tab;
      const data = tab?._dragData;
      if (drag?.splitEssential) {
        acceptSplitDrop(event);
        return;
      }

      if (data && drag.essentials && drag.noTiles) {
        data.dropElement = tab;
        data.dropBefore = true;
        return;
      }
      if (!data || !event.clientY || drag.folder || drag.essentials || drag.away) {
        return;
      }

      if (drag.target?.hand) {
        data.dropElement = tab;
        data.dropBefore = true;
        if (typeof tab.elementIndex === "number") {
          data.animDropElementIndex = tab.elementIndex;
        }
        return;
      }
      const y = event.clientY;
      let target = null;
      for (const item of gBrowser.tabContainer.ariaFocusableItems) {
        if (item === tab || item.hasAttribute?.("zen-essential")) {
          continue;
        }
        const node = nodeToMove(item);
        if (!node) {
          continue;
        }
        const box = window.windowUtils.getBoundsWithoutFlushing(node);
        if (y < box.top || y > box.bottom) {
          continue;
        }
        target = { item, node, box };
        break;
      }
      if (!target) {
        return;
      }
      const folder = target.node.closest?.("zen-folder, tab-group:not([split-view-group])");
      const header = folder?.querySelector(":scope > .tab-group-label-container");
      const headerBox = header ? window.windowUtils.getBoundsWithoutFlushing(header) : null;
      if (folder && headerBox && y > headerBox.top + headerBox.height * 0.2 && y < headerBox.bottom - headerBox.height * 0.2) {
        const first = folder.tabs?.[0];
        if (first) {
          data.dropElement = first;
          data.dropBefore = true;
          data.animDropElementIndex = first.elementIndex;
          return;
        }
      }
      data.dropElement = target.item;
      data.dropBefore = y < target.box.top + target.box.height / 2;
      if (typeof target.item.elementIndex === "number") {
        data.animDropElementIndex = target.item.elementIndex;
      }
    };

    // Everything let go glides into place the same way: tabs, splits,
    // folders and essentials
    const LAND_MS = 180;
    const LAND_EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
    // that curve, for a glide stepped frame by frame
    const landEase = (t) => {
      const bez = (a, b, u) => 3 * a * u * (1 - u) ** 2 + 3 * b * u * u * (1 - u) + u ** 3;
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 20; i++) {
        const mid = (lo + hi) / 2;
        if (bez(0.2, 0.2, mid) < t) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      return bez(0.8, 1, (lo + hi) / 2);
    };

    let essentialDrag = null;
    let essentialDropped = null;
    const ESSENTIAL_MS = 140;

    // Zen clears the size and place of every essential when a drop lands:
    // a floating copy with none stretches across the window and falls to
    // its bottom. Whatever of those it loses, it gets straight back.
    const PLACEMENT = [
      "position", "left", "top", "translate", "transform", "margin", "z-index",
      "width", "height", "min-width", "max-width", "min-height", "max-height",
    ];
    const keepPlacement = (node) => {
      if (node.ziaPlacementGuard) {
        return;
      }
      const seen = {};
      const note = () => {
        for (const name of PLACEMENT) {
          const value = node.style.getPropertyValue(name);
          if (value) {
            seen[name] = value;
          }
        }
      };
      note();
      node.ziaPlacementGuard = new MutationObserver(() => {
        for (const name of PLACEMENT) {
          if (seen[name] && !node.style.getPropertyValue(name)) {
            node.style.setProperty(name, seen[name], "important");
          }
        }
        if (node.style.getPropertyValue("width") !== `${Math.round(node.ziaSize.width)}px`) {
          sizeCopy(node, node.ziaSize.width, node.ziaSize.height);
        }
        note();
      });
      node.ziaPlacementGuard.observe(node, { attributes: true, attributeFilter: ["style"] });
    };

    const sizeCopy = (node, width, height) => {
      node.ziaSize = { width, height };
      for (const [name, value] of [
        ["width", width],
        ["height", height],
        ["min-width", width],
        ["max-width", width],
        ["min-height", height],
        ["max-height", height],
      ]) {
        node.style.setProperty(name, `${Math.round(value)}px`, "important");
      }
      keepPlacement(node);
    };

    const moveCopyTo = (copy, host) => {
      if (!host || copy.parentNode === host) {
        return;
      }
      const box = copy.getBoundingClientRect();
      const want = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
      host.appendChild(copy);
      copy.ziaHostShift = { x: 0, y: 0 };
      copy.style.setProperty("left", `${Math.round(want.x)}px`, "important");
      copy.style.setProperty("top", `${Math.round(want.y)}px`, "important");
      const now = copy.getBoundingClientRect();
      copy.ziaHostShift = { x: now.left + now.width / 2 - want.x, y: now.top + now.height / 2 - want.y };
      copy.style.setProperty("left", `${Math.round(want.x - copy.ziaHostShift.x)}px`, "important");
      copy.style.setProperty("top", `${Math.round(want.y - copy.ziaHostShift.y)}px`, "important");
    };

    const plainTabSize = () => {
      const sample = [...gBrowser.visibleTabs].find(
        (tab) => !tab.hasAttribute("zen-essential") && !tab.hasAttribute("zen-empty-tab") && tab.getBoundingClientRect().height > 8
      );
      const bg = sample?.querySelector(".tab-background")?.getBoundingClientRect();
      if (bg?.width) {
        return { width: bg.width, height: bg.height };
      }
      const sidebar = document.getElementById("navigator-toolbox")?.getBoundingClientRect();
      return { width: (sidebar?.width || 240) - 16, height: 35 };
    };

    const sweepLeftovers = () => {
      const keep = new Set([essentialDrag?.copy, proxy].filter(Boolean));
      for (const node of document.querySelectorAll(".tabbrowser-tab[zia-essential-proxy]")) {
        if (!keep.has(node)) {
          node.remove();
        }
      }
      if (!essentialDrag) {
        for (const tab of document.querySelectorAll(".tabbrowser-tab[zia-essential-dragged]")) {
          tab.removeAttribute("zia-essential-dragged");
          tab.style.visibility = "";
        }
      }
      if (!drag) {
        for (const tab of document.querySelectorAll(".tabbrowser-tab[zia-to-essential]")) {
          if (tab !== landingTab) {
            tab.removeAttribute("zia-to-essential");
          }
        }
      }
    };
    window.addEventListener("mousedown", () => {
      if (!drag && !essentialDrag) {
        sweepLeftovers();
      }
    }, true);

    window.addEventListener("mousemove", (event) => {
      if (essentialDrag && event.buttons === 0 && Date.now() - (essentialDrag.startedAt || 0) > 300) {
        endEssentialDrag();
      }
    }, true);

    const onEssentialStart = (event) => {
      const tab = event.target?.closest?.(".tabbrowser-tab[zen-essential]");
      if (!tab || tab.hasAttribute("zia-essential-proxy") || !featureOn("dia-tab-drag")) {
        return;
      }
      essentialDragging = true;
      try {
        event.dataTransfer?.setDragImage(blankImage(), 0, 0);
      } catch (err) {
        noteError("tab dragging: essential drag picture", err);
      }

      if (essentialDrag) {
        essentialDrag.copy?.remove();
        essentialDrag.tab?.removeAttribute("zia-essential-dragged");
        essentialDrag = null;
      }
      sweepLeftovers();
      const tile = tab.getBoundingClientRect();
      const drawn = tab.querySelector(".tab-background")?.getBoundingClientRect() || tile;
      const copy = tab.cloneNode(true);
      copy.removeAttribute("id");
      // (and what a drop just before left on the tile: a lock that pins
      // position, so the copy stuck where it started and the drag was
      // trapped)
      for (const name of [
        "dragtarget", "pending-drag", "multiselected", "zen-pinned-changed",
        "zia-drop-lock", "zia-landing", "zia-hover-held", "zia-held-pinned", "zia-shift", "zia-dragging",
      ]) {
        copy.removeAttribute(name);
      }
      copy.setAttribute("zia-essential-proxy", "true");
      copy.style.cssText = "";
      for (const [name, value] of [
        ["position", "fixed"],
        ["margin", "0"],
        ["z-index", "2147483646"],
        ["pointer-events", "none"],
        ["transform", "none"],
        ["translate", "-50% -50%"],
      ]) {
        copy.style.setProperty(name, value, "important");
      }
      sizeCopy(copy, tile.width, drawn.height);
      fitSplitHalves(copy, 0, tab.querySelector(".zia-split-half")?.getBoundingClientRect() || null);
      const point = pointerOf(event);
      copy.style.setProperty("left", `${Math.round(tile.left + tile.width / 2)}px`, "important");
      copy.style.setProperty("top", `${Math.round(drawn.top + drawn.height / 2)}px`, "important");
      root.appendChild(copy);
      try {
        window.gZenPinnedTabManager?.setEssentialTabIcon?.(copy);
      } catch (err) {
        noteError("tab dragging: onEssentialStart", err);
      }
      dressSplitCopy(copy, tab);
      tab.setAttribute("zia-essential-dragged", "true");
      noLanding();

      muteZenHaptics(true);
      // The drag starts on its own tile (which tileUnder skips), so the very
      // first neighbour it moves onto taps too.
      lastTileUnder = tab;
      lastTapPoint = null;
      essentialDrag = {
        tab,
        copy,
        tile: { width: tile.width, height: drawn.height },
        offset: { x: point.x - (tile.left + tile.width / 2), y: point.y - (drawn.top + drawn.height / 2) },
        asTab: false,
        startedAt: Date.now(),
      };
    };

    const tileUnder = (point, skip) => {
      const grid = window.gZenWorkspaces?.getCurrentEssentialsContainer?.();
      for (const tile of (grid || document).querySelectorAll(".tabbrowser-tab[zen-essential]:not([zia-essential-proxy])")) {
        if (tile !== skip && inBox(tile, point)) {
          return tile;
        }
      }
      return null;
    };

    const OVER_GAP = {};
    let lastTileUnder = null;
    let lastTapPoint = null;
    let lastTapAt = 0;
    const tapOnNewTile = (point, skip) => {
      const tile = tileUnder(point, skip);
      if (tile && tile !== lastTileUnder && lastTileUnder !== null) {
        const box = tile.getBoundingClientRect();
        // Half a tile on from the last tap, or long enough after it: so
        // jitter on a tile's edge doesn't tap twice, but changing your mind
        // and heading back over the same edge does.
        const far =
          !lastTapPoint ||
          Math.abs(point.x - lastTapPoint.x) >= box.width / 2 ||
          Math.abs(point.y - lastTapPoint.y) >= box.height / 2 ||
          Date.now() - lastTapAt > 300;
        if (far) {
          tap();
          lastTapPoint = { x: point.x, y: point.y };
          lastTapAt = Date.now();
        }
      }
      if (tile) {
        lastTileUnder = tile;
        lastTapPoint ||= { x: point.x, y: point.y };
      } else if (skip && inBox(window.gZenWorkspaces?.getCurrentEssentialsContainer?.(), point)) {
        // Over the essentials but on no tile: the gap opened for the drop, or
        // the dragged essential's own spot. Whatever tile comes next is a new
        // one, so changing your mind and moving back onto the tile that just
        // slid aside taps again.
        lastTileUnder = OVER_GAP;
      }
    };

    const listRoom = { rows: null, pitch: 0, sep: null, sepTop: null, sepDelta: 0, first: undefined };
    const openListRoom = () => {
      listRoom.rows = measureRows(null);
      listRoom.sep = currentSeparator();
      listRoom.sepTop = listRoom.sep ? listRoom.sep.getBoundingClientRect().top : null;
      const side = (top) => (listRoom.sepTop == null ? 0 : top > listRoom.sepTop ? 1 : -1);
      const sorted = [...listRoom.rows].sort((a, b) => a.top - b.top);
      let best = Infinity;
      for (let i = 1; i < sorted.length; i++) {
        const gap = sorted[i].top - sorted[i - 1].top;
        if (side(sorted[i].top) === side(sorted[i - 1].top) && gap > 8 && gap < sorted[i - 1].height * 1.6 && gap < best) {
          best = gap;
        }
      }
      listRoom.pitch = best < Infinity ? best : (sorted[0]?.height || 35) + 4;
      listRoom.sepDelta = 0;
      listRoom.first = undefined;

      listRoom.button = newTabButton();
      // (its bottom: over the last row or the button itself the drop still
      // goes above it, so it makes way; its top left half a gap there)
      listRoom.buttonBottom = listRoom.button?.getBoundingClientRect().bottom ?? null;
      listRoom.buttonDelta = 0;

      unclipAround(listRoom.button || listRoom.rows[listRoom.rows.length - 1]?.node);
    };
    const shapeListRoom = (y) => {
      if (!listRoom.rows) {
        openListRoom();
      }
      let first = null;
      for (const row of listRoom.rows) {
        const down = row.mid > y;
        if (down && !first) {
          first = row;
        }
        const delta = down ? listRoom.pitch : 0;
        if (row.delta !== delta) {
          row.delta = delta;
          place(row.node, delta, false);
        }
      }
      if (listRoom.sep) {
        const delta = listRoom.sepTop != null && listRoom.sepTop > y ? listRoom.pitch : 0;
        if (listRoom.sepDelta !== delta) {
          listRoom.sepDelta = delta;
          place(listRoom.sep, delta, false);
        }
      }
      if (listRoom.button && listRoom.buttonBottom != null) {
        const delta = listRoom.buttonBottom > y ? listRoom.pitch : 0;
        if (listRoom.buttonDelta !== delta) {
          listRoom.buttonDelta = delta;
          place(listRoom.button, delta, false);
        }
      }
      if (first !== listRoom.first) {
        if (listRoom.first !== undefined) {
          tap();
        }
        listRoom.first = first;
      }
    };
    const closeListRoom = () => {
      if (!listRoom.rows) {
        return;
      }
      for (const row of listRoom.rows) {
        if (row.delta) {
          row.delta = 0;
          place(row.node, 0, false);
        }
      }
      if (listRoom.sep && listRoom.sepDelta) {
        listRoom.sepDelta = 0;
        place(listRoom.sep, 0, false);
      }
      if (listRoom.button && listRoom.buttonDelta) {
        listRoom.buttonDelta = 0;
        place(listRoom.button, 0, false);
      }
      reclip();
      listRoom.rows = null;
      listRoom.first = undefined;
    };

    const dropIntoListRoom = (tab, y) => {
      const first = listRoom.first || null;
      const sep = listRoom.sep;
      const sepTop = listRoom.sepTop;
      const below = sepTop != null && y > sepTop;
      listRoom.rows = null;
      listRoom.first = undefined;
      // Zen takes the tab out of the essentials in its own time after the
      // drop: it's placed once that's happened (or Zia does it, if Zen
      // hasn't within a second), else Zen's own placing (the end of the
      // list, below the separator) was what stuck
      return new Promise((resolve) => {
        let frames = 0;
        const whenOut = () => {
          if (tab.isConnected && tab.hasAttribute("zen-essential")) {
            if (++frames < 60) {
              requestAnimationFrame(whenOut);
              return;
            }
            try {
              window.gZenPinnedTabManager?.removeEssentials?.(tab, false);
            } catch (err) {
              noteError("tab dragging: out of the essentials", err);
            }
          }
          place();
          holdDropped();
          resolve();
        };
        requestAnimationFrame(whenOut);
      });

      // It lands under the pointer, which the browser doesn't see until it
      // next moves: so its x (or -) is kept on, as for a dropped tab, not
      // missing until then (nothing under the pointer at the drop counts:
      // the tab wasn't there yet)
      function holdDropped() {
        if (!tab.isConnected || tab.hasAttribute("zen-essential") || tab.group?.hasAttribute("split-view-group")) {
          return;
        }
        try {
          shownAtDrop = { row: null, buttons: [] };
          heldFolder = null;
          heldPinned = null;
          holdFolderHover(tab);
        } catch (err) {
          noteError("tab dragging: hold the dropped essential", err);
        }
      }

      function place() {
        try {
          if (!tab.isConnected || tab.hasAttribute("zen-essential")) {
            return;
          }
          // A split essential: its split goes straight to the spot
          if (tab.ziaSplit?.id) {
            splitBackToList(tab, (group, tabs) => {
              for (const t of tabs) {
                pinFor(t, !below);
              }
              if (first && (below || sepTop == null || first.top < sepTop)) {
                placeBefore(group, topLevel(first));
              } else if (!below && sep) {
                placeBefore(group, sep);
              } else {
                gBrowser.moveTabToEnd?.(group);
              }
            });
            return;
          }
          pinFor(tab, !below);
          if (first && (below || sepTop == null || first.top < sepTop)) {
            placeBefore(tab, topLevel(first));
          } else if (!below && sep) {
            placeBefore(tab, sep);
          } else {
            gBrowser.moveTabToEnd?.(tab);
          }
        } catch (err) {
          console.error("[Zia] Placing the essential in the list failed:", err);
        }
      }
    };

    const onEssentialOver = (event) => {
      const state = essentialDrag;
      if (!state?.copy?.isConnected) {
        return;
      }
      const point = pointerOf(event);
      if (!point.x && !point.y) {
        return;
      }
      tapOnNewTile(point, state.tab);
      const essentials = document.getElementById("zen-essentials");
      const overTiles = !!event.target?.closest?.("#zen-essentials") || inBox(essentials, point) || overAnyTile(point);
      // a row only once the pointer is below the essentials altogether, so
      // a drag along their last row stays a tile
      const asTab = !overTiles && inBox(document.getElementById("navigator-toolbox"), point) && point.y > essentialsBottom() + 8;
      const copy = state.copy;
      if (asTab !== state.asTab) {
        state.asTab = asTab;
        copy.style.setProperty(
          "transition",
          ["width", "height", "min-width", "max-width", "min-height", "max-height"]
            .map((name) => `${name} ${ESSENTIAL_MS}ms ease-out`)
            .join(", "),
          "important"
        );
        if (asTab) {
          const current = copy.getBoundingClientRect();
          moveCopyTo(copy, document.getElementById("tabbrowser-tabs") || root);
          sizeCopy(copy, current.width, current.height);
          copy.getBoundingClientRect();
          copy.removeAttribute("zen-essential");
          copy.removeAttribute("pinned");
          const size = plainTabSize();
          sizeCopy(copy, size.width, size.height);
        } else {
          const current = copy.getBoundingClientRect();
          moveCopyTo(copy, root);
          sizeCopy(copy, current.width, current.height);
          copy.getBoundingClientRect();
          copy.setAttribute("zen-essential", "true");
          copy.setAttribute("pinned", "true");
          sizeCopy(copy, state.tile.width, state.tile.height);
        }

        state.offset = asTab ? { x: 0, y: 0 } : state.offset;
      }
      if (asTab) {
        shapeListRoom(point.y);
      } else {
        closeListRoom();
      }
      const x = asTab
        ? (document.getElementById("navigator-toolbox")?.getBoundingClientRect().left || 0) + 8 + plainTabSize().width / 2
        : point.x - state.offset.x;
      const shift = copy.ziaHostShift || { x: 0, y: 0 };
      copy.style.setProperty("left", `${Math.round(x - shift.x)}px`, "important");
      copy.style.setProperty("top", `${Math.round(point.y - (asTab ? 0 : state.offset.y) - shift.y)}px`, "important");
    };

    const dropPastLast = (tab, point) => {
      const grid = window.gZenWorkspaces?.getCurrentEssentialsContainer?.();
      const tiles = [...(grid || document).querySelectorAll(".tabbrowser-tab[zen-essential]:not([zia-essential-proxy])")].filter(
        (tile) => tile !== tab && tile.getBoundingClientRect().width > 8
      );
      const last = tiles[tiles.length - 1];
      if (!last || !point) {
        return;
      }
      const box = last.getBoundingClientRect();
      const past = point.y > box.bottom || (point.y >= box.top && point.x > box.left + box.width / 2);
      if (!past) {
        return;
      }
      setTimeout(() => {
        if (tab.isConnected && tab.hasAttribute("zen-essential") && last.isConnected && tab.previousElementSibling !== last) {
          try {
            gBrowser.moveTabAfter(tab, last);
          } catch (err) {
            console.error("[Zia] Could not move the essential to the end:", err);
          }
        }
      }, 0);
    };

    const endEssentialDrag = (event) => {
      const state = essentialDrag;
      essentialDrag = null;
      essentialDragging = false;
      if (!state) {
        return;
      }
      if (event?.type === "drop") {
        const point = pointerOf(event);
        const essentials = document.getElementById("zen-essentials");
        if (inBox(essentials, point) || event.target?.closest?.("#zen-essentials") || overAnyTile(point)) {
          state.asTab = false;
          dropPastLast(state.tab, point);
        } else if (state.asTab && listRoom.rows) {
          state.placing = dropIntoListRoom(state.tab, point.y);
        }
      }
      if (listRoom.rows) {
        closeListRoom();
      }
      muteZenHaptics(false);
      essentialDropped = event?.type === "drop" ? state.tab : null;
      setTimeout(sweepLeftovers, 400);

      const copy = state.copy;
      const reveal = () => {
        state.tab.style.visibility = "";
        state.tab.removeAttribute("zia-essential-dragged");
        requestAnimationFrame(() => copy.remove());
      };
      // Dropped among the essentials: the tile glides from where it was let
      // go into its place (once that's settled) before the real one shows
      const glideHome = () => {
        // dropped into the list: it shows once it's in its place, not first
        // wherever Zen put it
        if (state.placing) {
          state.placing.finally(reveal);
          return;
        }
        if (!event || state.asTab || !copy.isConnected || !state.tab.isConnected ||
            !state.tab.hasAttribute("zen-essential") || matchMedia("(prefers-reduced-motion: reduce)").matches) {
          reveal();
          return;
        }
        // Heads for wherever the tile is on each frame, so it still lands
        // right while Zen is sliding the tiles into their new order
        const shift = copy.ziaHostShift || { x: 0, y: 0 };
        // from where it was last drawn under the pointer (its left and top
        // are its centre), not wherever Zen's drop may have knocked it
        const from = copy.getBoundingClientRect();
        const left = parseFloat(copy.style.getPropertyValue("left"));
        const top = parseFloat(copy.style.getPropertyValue("top"));
        const start = Number.isFinite(left) && Number.isFinite(top)
          ? { x: left + shift.x, y: top + shift.y }
          : { x: from.left + from.width / 2, y: from.top + from.height / 2 };
        // the same glide as a dropped tab or folder (LAND_MS, LAND_EASE)
        const ms = LAND_MS;
        const began = performance.now();
        copy.style.setProperty("transition", "none", "important");
        const follow = () => {
          if (!copy.isConnected || !state.tab.isConnected) {
            reveal();
            return;
          }
          const box = state.tab.getBoundingClientRect();
          const drawn = state.tab.querySelector(".tab-background")?.getBoundingClientRect() || box;
          const to = { x: box.left + box.width / 2, y: drawn.top + drawn.height / 2 };
          const t = Math.min(1, (performance.now() - began) / ms);
          const ease = landEase(t);
          copy.style.setProperty("left", `${Math.round(start.x + (to.x - start.x) * ease - shift.x)}px`, "important");
          copy.style.setProperty("top", `${Math.round(start.y + (to.y - start.y) * ease - shift.y)}px`, "important");
          if (t < 1) {
            requestAnimationFrame(follow);
          } else {
            reveal();
          }
        };
        requestAnimationFrame(follow);
      };
      setTimeout(glideHome, 0);
    };

    window.addEventListener("dragstart", onEssentialStart, true);
    window.addEventListener("dragover", onEssentialOver, true);
    window.addEventListener("drop", endEssentialDrag, true);
    window.addEventListener("dragend", endEssentialDrag, true);

    window.addEventListener("dragover", onOver, true);
    document.getElementById("tabbrowser-tabs")?.addEventListener("dragover", onOver, true);
    window.addEventListener("dragover", fixDrop);
    // Firefox moves the dragged tab too, after Zia, and stops it at the last
    // tab: under the list (past New Tab) its move won, so the tab stopped
    // there while Zen's drag picture of it went on with the pointer, two of
    // it showing. Zia's move is put back once Firefox has had its go.
    window.addEventListener("dragover", () => {
      const moving = drag?.moving;
      if (!moving?.isConnected || drag.away || drag.essentials || drag.splitEssential) {
        return;
      }
      if (moving.style.getPropertyPriority("transform") !== "important") {
        place(moving, lastDy, true);
      }
    });

    window.addEventListener(
      "drop",
      (event) => {
        const tab = drag?.tab;
        heldFolder = null;
        heldPinned = null;

        if (tab && drag.splitEssential) {
          event.preventDefault();
          event.stopPropagation();
          let essential = null;
          try {
            essential = addSplitToEssentials(tab);
          } catch (err) {
            console.error("[Zia] Could not make a split essential:", err);
          }
          if (essential) {
            // hidden where it lands until the tile flying to it gets there
            essential.setAttribute("zia-to-essential", "true");
            landProxy(essential);
          } else {
            hideProxy();
          }
          return;
        }
        if (tab && !drag.essentials && !drag.folder && !drag.split) {
          const point = pointerOf(event);
          const over = event.target;
          if (
            over?.closest?.("#zen-essentials, .zen-essentials-container") ||
            inBox(document.getElementById("zen-essentials"), point) ||
            inBox(window.gZenWorkspaces?.getCurrentEssentialsContainer?.(), point)
          ) {
            drag.essentials = true;
            drag.target = null;
          }
        }
        if (tab && drag.essentials) {
          if (drag.noTiles) {
            setTimeout(() => {
              try {
                window.gZenPinnedTabManager?.addToEssentials?.(tab);
              } catch (err) {
                console.error("[Zia] Could not add the first essential:", err);
              }
            }, 0);
          }
          landProxy(tab);
        } else if (drag?.folder && !drag.away && drag.target) {
          const folder = drag.folder;
          const target = drag.target;
          pendingFinish = true;
          setTimeout(() => {
            try {
              finishFolderDrop(folder, target);
            } catch (err) {
              console.error("[Zia] Folder drop failed:", err);
            }
            pendingFinish = false;
          }, 0);
        } else if (tab && !drag.folder && !drag.away && drag.target?.hand) {
          const target = drag.target;
          heldFolder = target.folder || null;
          heldPinned = !target.below;
          pendingFinish = true;
          setTimeout(() => {
            try {
              finishDrop(tab, target);
              repinLanding?.();
              refitHeld?.();
            } catch (err) {
              console.error("[Zia] Tab drop failed:", err);
            }
            pendingFinish = false;
          }, 0);
        }
        const dnd = gBrowser.tabContainer.tabDragAndDrop;
        if (dnd) {
          dnd._dontAnimateTabMove = true;
        }
      },
      true
    );
    let lockTimer = 0;
    let blockAnimUntil = 0;
    const ui = window.gZenUIManager;
    if (ui?.elementAnimate && !ui.elementAnimate.ziaTabLock) {
      const originalAnimate = ui.elementAnimate.bind(ui);
      const wrappedAnimate = function (ele, ...args) {
        if (Date.now() < blockAnimUntil && ele?.closest?.("#tabbrowser-tabs")) {
          ele.style.removeProperty("transform");
          return Promise.resolve();
        }
        return originalAnimate(ele, ...args);
      };
      wrappedAnimate.ziaTabLock = true;
      ui.elementAnimate = wrappedAnimate;
    }
    const MOVEMENT = new Set(["transform", "translate"]);
    const movesOnly = (anim) => {
      try {
        const frames = anim.effect?.getKeyframes?.() || [];
        const props = new Set();
        for (const frame of frames) {
          for (const key of Object.keys(frame)) {
            if (!["offset", "computedOffset", "easing", "composite"].includes(key)) {
              props.add(key);
            }
          }
        }
        return props.size > 0 && [...props].every((prop) => MOVEMENT.has(prop));
      } catch (err) {
        return false;
      }
    };

    const unclipped = [];
    const unclipAround = (node) => {
      const stop = document.getElementById("navigator-toolbox");
      const remember = (el, props) => {
        unclipped.push([el, props.map((prop) => [prop, el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)])]);
      };
      const lift = (el) => {
        const style = getComputedStyle(el);
        const clips =
          ["hidden", "auto", "scroll", "clip"].includes(style.overflowY) || /paint|strict|content/.test(style.contain);
        const scrolls = el.scrollTop > 0 || el.scrollHeight > el.clientHeight + 1;
        if (!clips || scrolls) {
          return;
        }
        remember(el, ["overflow", "overflow-x", "overflow-y", "contain"]);
        el.style.setProperty("overflow", "visible", "important");
        el.style.setProperty("overflow-x", "visible", "important");
        el.style.setProperty("overflow-y", "visible", "important");
        el.style.setProperty("contain", "none", "important");
      };
      let el = node?.parentNode;
      while (el && el !== stop && el !== document.documentElement) {
        if (el.nodeType === 1) {
          lift(el);
          const inner = el.shadowRoot?.querySelector?.('[part~="scrollbox"]');
          if (inner) {
            lift(inner);
          }
        }
        el = el.parentNode || el.host;
      }
    };
    const reclip = () => {
      while (unclipped.length) {
        const [el, props] = unclipped.pop();
        for (const [prop, value, priority] of props) {
          if (value) {
            el.style.setProperty(prop, value, priority);
          } else {
            el.style.removeProperty(prop);
          }
        }
      }
    };

    // What's just dropped (a folder or a tab) keeps its hover look (box, ×)
    // until the pointer really leaves it: the drag's own look ends a frame
    // before the browser sees the pointer is still over it, and the box and
    // × blinked off and on in between.
    // Firefox forgets what's under the pointer after a drop until it next
    // moves, and Zen shows a row's x and - only while it's hovered: so the
    // ones showing as it's let go are noted, and kept on while settling
    let shownAtDrop = { row: null, buttons: [] };
    window.addEventListener("drop", (event) => {
      shownAtDrop = { row: null, buttons: [] };
      const point = pointerOf(event);
      const row = document.elementsFromPoint(point.x, point.y)
        .map((el) => el.closest?.(".tabbrowser-tab:not([zia-essential-proxy]), zen-folder, tab-group"))
        .find(Boolean);
      if (!row) {
        return;
      }
      // a split shows the x of both its tabs while it's hovered
      const split = row.closest?.("tab-group[split-view-group]");
      const rows = split ? [...split.querySelectorAll(".tabbrowser-tab")] : [row];
      const buttons = rows.flatMap((one) => [...one.querySelectorAll(".tab-close-button, .tab-reset-button")]).filter((button) => {
        if (!rows.includes(button.closest(".tabbrowser-tab, zen-folder, tab-group"))) {
          return false;
        }
        const box = button.getBoundingClientRect();
        return box.width > 0 && getComputedStyle(button).display !== "none";
      });
      shownAtDrop = { row: row.closest(".tabbrowser-tab") || null, buttons };
    }, true);

    const holdFolderHover = (folder) => {
      const held = [folder];
      // a tab dropped into a folder: the folder keeps its hover box too
      if (heldFolder?.isConnected && !held.includes(heldFolder)) {
        held.push(heldFolder);
      }
      heldFolder = null;
      if (shownAtDrop.row && shownAtDrop.row !== folder && shownAtDrop.row.isConnected) {
        held.push(shownAtDrop.row);
      }
      let buttons = shownAtDrop.buttons.filter((button) => button.isConnected);
      shownAtDrop = { row: null, buttons: [] };
      // The dragged tab itself isn't found under the pointer (it lets the
      // pointer through while it's dragged), so its button wasn't noted:
      // a tab dropped into a folder showed nothing between losing its x
      // and the browser finding the pointer on it again for the -
      if (gBrowser.isTab(folder) && !buttons.some((button) => folder.contains(button))) {
        const own = folder.querySelector(folder.pinned ? ".tab-reset-button" : ".tab-close-button");
        if (own) {
          buttons.push(own);
        }
      }
      for (const node of held) {
        node.setAttribute("zia-hover-held", "true");
      }
      for (const button of buttons) {
        button.setAttribute("zia-held-shown", "true");
      }
      // A tab dropped into a folder is pinned there, and shows a - where it
      // had an x (and the other way round, pulled out): the x it had was
      // kept on until the pointer moved, then swapped for the -
      // (as soon as it's let go: the drop says where it's going, so its x
      // wasn't left showing until the tab was actually pinned)
      refitHeld = (pinned) => {
        buttons = buttons.map((button) => {
          const tab = button.closest(".tabbrowser-tab");
          const want = pinned ?? tab?.pinned;
          tab?.toggleAttribute("zia-held-pinned", !!want && !tab.pinned);
          const kind = want ? ".tab-reset-button" : ".tab-close-button";
          const right = tab?.isConnected && !button.matches(kind) ? tab.querySelector(kind) : null;
          if (!right) {
            return button;
          }
          button.removeAttribute("zia-held-shown");
          right.setAttribute("zia-held-shown", "true");
          return right;
        });
      };
      if (heldPinned != null) {
        refitHeld(heldPinned);
      }
      heldPinned = null;
      let timer = 0;
      const check = () => {
        if (!held.some((node) => node.matches(":hover"))) {
          release();
        }
      };
      const release = () => {
        if (releaseHeld === release) {
          releaseHeld = null;
        }
        refitHeld = null;
        for (const node of held) {
          node.removeAttribute("zia-hover-held");
        }
        for (const button of buttons) {
          button.removeAttribute("zia-held-shown");
          button.closest(".tabbrowser-tab")?.removeAttribute("zia-held-pinned");
        }
        window.removeEventListener("mousemove", check, true);
        clearTimeout(timer);
      };
      window.addEventListener("mousemove", check, true);
      timer = setTimeout(release, 4000);
      releaseHeld?.();
      releaseHeld = release;
    };

    let droppedFrom = null;
    let isRealDrop = false;
    let pendingFinish = false;
    let heldFolder = null;
    let repinLanding = null;
    let refitHeld = null;
    let heldPinned = null;
    let dragGen = 0;
    let releaseHeld = null;
    window.addEventListener("drop", () => (isRealDrop = true), true);
    window.addEventListener("dragstart", () => (isRealDrop = false), true);

    const settle = () => {
      const droppedTab = drag?.tab || essentialDropped || null;
      if (drag?.moving && !drag.essentials && !drag.away && droppedFrom === null && isRealDrop) {
        const from = drag.moving.getBoundingClientRect();
        // (and where its background showed: a tab over a folder is drawn
        // narrower, indented like the folder's tabs)
        const bg = drag.bg?.isConnected ? drag.bg : null;
        droppedFrom = { node: drag.moving, top: from.top, left: from.left, tab: drag.tab, bg, bgLeft: bg?.getBoundingClientRect().left };
      }
      essentialDropped = null;
      if (drag?.bg) {
        const { bg, content } = drag;
        setTimeout(() => requestAnimationFrame(() => unmorphWidth(droppedTab, bg, content)), 0);
      }
      drag = null;
      pending = null;
      document.documentElement.removeAttribute("zia-dragging-tab");
      muteZenHaptics(false);
      reclip();
      document.querySelectorAll("[zia-drop-slot]").forEach((folder) => folder.removeAttribute("zia-drop-slot"));
      document.querySelectorAll("[zia-into-empty]").forEach((tab) => {
        tab.removeAttribute("zia-into-empty");
        tab.style.removeProperty("--zia-slot-border");
      });
      clearFolderPaint();
      dropProxy();
      hideThumb(true);
      document.querySelectorAll("[zia-drag-away]").forEach((node) => node.removeAttribute("zia-drag-away"));
      makeRoom(null);
      holdSplitSlot(false);
      document.querySelectorAll("[zia-sep-open]").forEach((node) => node.removeAttribute("zia-sep-open"));

      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      blockAnimUntil = Date.now() + 400;
      const dnd = gBrowser.tabContainer.tabDragAndDrop;
      if (dnd) {
        dnd._dontAnimateTabMove = true;
        if (!dnd.handle_drop_transition?.ziaNeutered) {
          const skip = function () {
            this._dontAnimateTabMove = true;
          };
          skip.ziaNeutered = true;
          dnd.handle_drop_transition = skip;
        }
      }
      const strip = document.getElementById("tabbrowser-tabs");

      const landing = droppedFrom;
      droppedFrom = null;
      strip?.setAttribute("zia-settling", "true");
      const locked = new Set(moved);
      clearMoved();
      for (const node of locked) {
        node.style.removeProperty("transform");
        node.setAttribute("zia-drop-lock", "true");
      }
      if (landing?.node?.isConnected) {
        const node = landing.node;
        holdFolderHover(node);

        node.setAttribute("zia-landing", "true");
        const held = node.getBoundingClientRect();
        node.style.setProperty("transform", `translate(${landing.left - held.left}px, ${landing.top - held.top}px)`, "important");
        // Firefox clears every tab's transform as its drag ends, so the tab
        // painted a frame at its new spot before the glide pulled it back
        // to where it was let go: it's pinned there again each frame, and
        // straight after the drop moves it (into a folder, say)
        const pin = () => {
          if (!node.isConnected) {
            return;
          }
          node.style.removeProperty("transform");
          const at = node.getBoundingClientRect();
          node.style.setProperty("transform", `translate(${landing.left - at.left}px, ${landing.top - at.top}px)`, "important");
        };
        repinLanding = pin;
        const glideIn = () => {
          if (pendingFinish) {
            pin();
            requestAnimationFrame(glideIn);
            return;
          }
          repinLanding = null;
          refitHeld?.();
          node.style.removeProperty("transform");
          // The narrower look goes before the glide, which then starts the
          // background where it showed: dropped in a folder, it went a
          // step left as the glide began and slid back
          if (landing.bg) {
            unmorphWidth(landing.tab);
          }
          const to = node.getBoundingClientRect();
          const dy = landing.top - to.top;
          const dx = landing.bg?.isConnected ? landing.bgLeft - landing.bg.getBoundingClientRect().left : landing.left - to.left;
          if (!node.isConnected || node.hasAttribute("zen-essential") || (Math.abs(dy) < 2 && Math.abs(dx) < 2) || !to.height) {
            // kept a moment, past Firefox's own drop animation (see chrome.css)
            setTimeout(() => node.removeAttribute("zia-landing"), gBrowser.isTab(node) ? 0 : 400);
            return;
          }
          const glide = node.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }], {
            duration: LAND_MS,
            easing: LAND_EASE,
          });
          glide.id = "zia-land";
          const end = () => setTimeout(() => node.removeAttribute("zia-landing"), gBrowser.isTab(node) ? 0 : 250);
          glide.finished.then(end, end);
        };
        requestAnimationFrame(glideIn);
      }
      // A new drag started straight after (within the settling time) is
      // left alone: the wipe undid the offsets Zen gives the other
      // essentials to open a gap, so none opened
      const gen = dragGen;
      const unlock = () => {
        strip?.removeAttribute("zia-settling");
        for (const node of locked) {
          node.style.removeProperty("top");
          node.removeAttribute("zia-drop-lock");
        }
      };
      const wipe = () => {
        if (gen !== dragGen) {
          unlock();
          return;
        }
        strip?.querySelectorAll(".tabbrowser-tab, .tab-group-label-container, tab-group, zen-folder").forEach((node) => {
          const appearing = node === droppedTab && !node.group;
          for (const anim of node.getAnimations()) {
            if (anim.id === "zia-land") {
              continue;
            }
            if (movesOnly(anim) || appearing) {
              anim.cancel();
            }
          }
          if (node.style.transform && !node.hasAttribute("zia-landing")) {
            node.style.transform = "";
          }

          // Firefox hides what's dragged until its own drop animation ends;
          // for a folder that's a part inside it, so the whole folder
          // vanished for a moment after landing
          if (node.style.visibility === "hidden" && (locked.has(node) || node === droppedTab || droppedTab?.contains?.(node))) {
            node.style.visibility = "";
          }
        });
        if (Date.now() < blockAnimUntil) {
          requestAnimationFrame(wipe);
        } else {
          unlock();
        }
      };
      clearTimeout(lockTimer);
      wipe();
    };
    window.addEventListener("drop", settle, true);
    window.addEventListener("dragstart", () => {
      // (and what the last drop kept showing: dragged straight back into
      // the essentials, a tab kept its x on the tile)
      releaseHeld?.();
      dragGen++;
      blockAnimUntil = 0;
    }, true);
    window.addEventListener("dragend", () => {
      settle();
      setTimeout(settle, 0);
    });

    // A drag that ends somewhere this window can't see (dropped in another
    // window or on the desktop, or its tab moved or closed mid-drag) never
    // sends dragend here, which left the drag state on, and with it every
    // tab's close button hidden until Zen restarted. No mouse moves arrive
    // during a drag, so an ordinary move with no button held means none is
    // going on any more: tidy up whatever was left.
    let lastTidy = 0;
    window.addEventListener(
      "mousemove",
      (event) => {
        if (event.buttons || event.timeStamp - lastTidy < 500) {
          return;
        }
        lastTidy = event.timeStamp;
        if (drag || document.documentElement.hasAttribute("zia-dragging-tab")) {
          settle();
        }
        const strip = document.getElementById("tabbrowser-tabs");
        if (strip?.hasAttribute("zia-settling") && Date.now() > blockAnimUntil + 1000) {
          strip.removeAttribute("zia-settling");
        }
        for (const tab of document.querySelectorAll(".tabbrowser-tab[zia-essential-dragged]")) {
          if (!essentialDrag) {
            tab.removeAttribute("zia-essential-dragged");
            tab.style.visibility = "";
          }
        }
      },
      true
    );
  }


  // Zen's toasts (the little notes up in the corner, like "Copied") go away
  // on a timer that stops while the mouse is over them. Zia gives each one
  // a small ✕ to close it straight away, with the same fade Zen uses.
  function addToastCloseButtons() {
    const container = document.getElementById("zen-toast-container");
    if (!container) {
      return;
    }
    const close = (toast) => {
      toast.animate(
        [
          { opacity: 1, scale: 1 },
          { opacity: 0, scale: 0.5 },
        ],
        { duration: 200, easing: "ease-in", fill: "forwards" }
      ).finished.then(() => {
        toast.remove();
        if (!container.children.length) {
          container.setAttribute("hidden", "true");
        }
      });
    };
    const addTo = (toast) => {
      if (!toast.classList?.contains("zen-toast") || toast.querySelector(".zia-toast-close")) {
        return;
      }
      const button = document.createElementNS("http://www.w3.org/1999/xhtml", "button");
      button.className = "zia-toast-close";
      button.title = "Close";
      button.setAttribute("aria-label", "Close");
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        close(toast);
      });
      toast.append(button);
    };
    for (const toast of container.children) {
      addTo(toast);
    }
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          addTo(node);
        }
      }
    }).observe(container, { childList: true });
  }
  // A page glanced at from an essential shows as a small card fanned out from
  // behind the essential's icon (zia-essential-glance in chrome.css). It
  // springs out from the icon in CSS; closing, Zen takes the glance's tab away
  // at once, so a stand-in card is drawn in its place and sucked back into the
  // icon.
  function suckInEssentialGlances() {
    const SUCK_MS = 220;
    const OUT_MS = 400;
    const sprung = new WeakSet();

    // Out: once per glance. Zen restyles the tab more than once as it opens
    // it, which would replay a CSS animation, so it's played from here.
    const springOut = (tab) => {
      if (sprung.has(tab) || !tab.hasAttribute("zen-glance-tab") ||
          !tab.parentElement?.closest(".tabbrowser-tab[zen-essential]")) {
        return;
      }
      sprung.add(tab);
      tab.setAttribute("zia-glance-shown", "true");
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }
      tab.animate(
        [
          { translate: "-26px 0", scale: 0.12, rotate: "0deg", opacity: 0 },
          { opacity: 1, offset: 0.2 },
          { translate: "0 0", scale: 1, rotate: "6deg", opacity: 1 },
        ],
        { duration: OUT_MS, easing: "cubic-bezier(0.3, 1.4, 0.5, 1)" }
      );
    };
    new MutationObserver((records) => {
      for (const record of records) {
        springOut(record.target);
      }
    }).observe(gBrowser.tabContainer, { subtree: true, attributes: true, attributeFilter: ["zen-glance-tab"] });
    // any glance already open when Zia starts just shows
    for (const tab of gBrowser.tabContainer.querySelectorAll(".tabbrowser-tab[zen-glance-tab]")) {
      sprung.add(tab);
      tab.setAttribute("zia-glance-shown", "true");
    }

    gBrowser.tabContainer.addEventListener("GlanceClose", (event) => {
      const glanceTab = event.target;
      const content = glanceTab?.parentElement;
      const essential = content?.closest(".tabbrowser-tab[zen-essential]");
      if (!essential || !content.classList.contains("tab-content")) {
        return;
      }
      glanceTab.style.visibility = "hidden";
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }
      const ghost = document.createXULElement("hbox");
      ghost.className = "zia-glance-ghost";
      const icon = document.createXULElement("image");
      icon.className = "zia-glance-ghost-icon";
      const src = glanceTab.querySelector(".tab-icon-image")?.getAttribute("src");
      if (src) {
        icon.setAttribute("src", src);
      }
      ghost.append(icon);
      content.append(ghost);
      const easing = "cubic-bezier(0.55, 0, 0.8, 0.2)";
      ghost.animate(
        [
          { translate: "0 0", scale: 1, rotate: "6deg" },
          { translate: "-26px 0", scale: 0.12, rotate: "0deg" },
        ],
        { duration: SUCK_MS, easing, fill: "forwards" }
      );
      ghost
        .animate([{ opacity: 1 }, { opacity: 0 }], { duration: 100, delay: SUCK_MS - 100, fill: "forwards" })
        .finished.catch(() => {})
        .then(() => ghost.remove());
    });
  }

  function safely(name, fn) {
    try {
      fn();
    } catch (err) {
      console.error(`[Zia] ${name} failed:`, err);
    }
  }

  function matchTabCorners() {
    const button = document.querySelector("#vertical-tabs-newtab-button, #tabs-newtab-button");
    if (!button) {
      return;
    }
    const shape = getComputedStyle(button).getPropertyValue("corner-top-left-shape").trim();
    if (shape) {
      root.style.setProperty("--zia-tab-corner", shape);
    }
  }

  let zenHaptic = null;

  // Zen buzzes on its own drag events, which would double up with Zia's taps,
  // so its haptics are switched off for the length of a drag. That's a saved
  // pref, so Zia marks when it's done so (MUTE_MARK) and undoes its own change
  // rather than writing one: a drag that never finishes cleanly (Zen quit
  // mid-drag, a cancelled drop) is put right shortly after the pointer is
  // released, or on the next launch at the latest.
  const HAPTIC_PREF = "zen.haptic-feedback.enabled";
  const MUTE_MARK = "zia.haptics.muted";
  const REPAIRED_MARK = "zia.haptics.repaired";
  let hapticsWereOn = null;
  let hapticsHadUserValue = false;
  function restoreHaptics(hadUserValue) {
    if (hadUserValue) {
      Services.prefs.setBoolPref(HAPTIC_PREF, true);
    } else {
      Services.prefs.clearUserPref(HAPTIC_PREF);
      if (!Services.prefs.getBoolPref(HAPTIC_PREF, true)) {
        Services.prefs.setBoolPref(HAPTIC_PREF, true);
      }
    }
    Services.prefs.clearUserPref(MUTE_MARK);
  }
  function muteZenHaptics(muted) {
    try {
      if (muted && hapticsWereOn === null) {
        hapticsWereOn = Services.prefs.getBoolPref(HAPTIC_PREF, true);
        hapticsHadUserValue = Services.prefs.prefHasUserValue(HAPTIC_PREF);
        if (hapticsWereOn) {
          Services.prefs.setBoolPref(MUTE_MARK, true);
          Services.prefs.setBoolPref(HAPTIC_PREF, false);
        }
      } else if (!muted && hapticsWereOn !== null) {
        const was = hapticsWereOn;
        hapticsWereOn = null;
        if (was) {
          restoreHaptics(hapticsHadUserValue);
        }
      }
    } catch (err) {
      noteError("start: muteZenHaptics", err);
    }
  }

  function watchHapticsMute() {
    // Left muted by a drag that didn't finish (or a quit mid-drag)
    try {
      if (Services.prefs.getBoolPref(MUTE_MARK, false) && hapticsWereOn === null) {
        restoreHaptics(false);
      }
      // Before 2.40.1 the mute wasn't marked, so a drag that didn't finish left
      // haptics off with no trace. Put them back once. Anyone who turns them
      // off again afterwards is left alone.
      if (!Services.prefs.getBoolPref(REPAIRED_MARK, false)) {
        Services.prefs.setBoolPref(REPAIRED_MARK, true);
        if (hapticsWereOn === null && !Services.prefs.getBoolPref(HAPTIC_PREF, true)) {
          restoreHaptics(false);
        }
      }
    } catch (err) {
      noteError("start: watchHapticsMute", err);
    }
    let timer = 0;
    const settle = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const dragging =
          root.hasAttribute("zia-dragging-tab") || !!document.querySelector(".tabbrowser-tab[zia-essential-dragged]");
        if (hapticsWereOn !== null && !dragging) {
          muteZenHaptics(false);
        }
      }, 800);
    };
    for (const type of ["dragend", "drop", "mouseup"]) {
      window.addEventListener(type, settle, true);
    }
  }

  function quietZenHaptics() {
    const service = Services.zen;
    if (typeof service?.playHapticFeedback === "function") {
      zenHaptic = () => service.playHapticFeedback();
    }
  }

  function canUnload(tab) {
    return tab?.linkedBrowser?.isRemoteBrowser !== false;
  }

  function watchUnloadable() {
    const mark = (tab) => {
      if (!tab?.isConnected) {
        return;
      }
      tab.toggleAttribute("zia-no-unload", tab.pinned && !tab.hasAttribute("zen-essential") && !canUnload(tab));
    };
    const markAll = () => gBrowser.tabs.forEach(mark);
    for (const type of ["TabOpen", "TabPinned", "TabUnpinned", "TabSelect", "TabAttrModified"]) {
      gBrowser.tabContainer.addEventListener(type, (event) => mark(event.target));
    }
    gBrowser.addTabsProgressListener({
      onLocationChange(browser) {
        mark(gBrowser.getTabForBrowser(browser));
      },
    });
    markAll();
  }

  function currentSeparator() {
    const own = window.gZenWorkspaces?.pinnedTabsContainer?.querySelector?.(".pinned-tabs-container-separator");
    if (own) {
      return own;
    }
    const all = document.querySelectorAll(".pinned-tabs-container-separator");
    for (const sep of all) {
      const box = sep.getBoundingClientRect();
      if (box.width > 0 && sep.checkVisibility?.({ visibilityProperty: true }) !== false) {
        return sep;
      }
    }
    return all[0] || null;
  }

  // The sidebar only ever scrolls up and down. Where its tab list is a few
  // pixels wider than the sidebar (on Linux), selecting a tab scrolled it
  // sideways into view too, so the tabs shifted over against the page and
  // the essentials were cut off on both sides. Any sideways scroll goes
  // straight back.
  function keepSidebarUnscrolledSideways() {
    const toolbox = document.getElementById("navigator-toolbox");
    const LISTS = "#zen-tabs-wrapper, .workspace-arrowscrollbox, #tabbrowser-arrowscrollbox, .zen-essentials-container";
    toolbox?.addEventListener("scroll", (event) => {
      const target = event.target;
      if (!target?.matches?.(LISTS)) {
        return;
      }
      for (const el of [target, target.scrollbox]) {
        if (el?.scrollLeft) {
          el.scrollLeft = 0;
        }
      }
    }, { capture: true, passive: true });
  }

  function watchEdgeGlow() {
    let pending = 0;
    const update = () => {
      pending = 0;
      if (!gBrowser?.selectedTab) {
        return;
      }
      for (const tab of document.querySelectorAll(".tabbrowser-tab[zia-no-glow]")) {
        tab.removeAttribute("zia-no-glow");
      }
      const tab = gBrowser.selectedTab;
      if (!tab || tab.hasAttribute("zen-essential")) {
        return;
      }

      const sections = [
        window.gZenWorkspaces?.pinnedTabsContainer,
        window.gZenWorkspaces?.activeWorkspaceStrip,
      ].filter(Boolean);
      if (sections.length) {
        const rows = [];
        for (const section of sections) {
          for (const row of section.querySelectorAll(
            ".tabbrowser-tab:not([zen-essential], [zen-empty-tab], [hidden]), .tab-group-label-container"
          )) {
            const box = row.getBoundingClientRect();
            if (box.height > 4 && row.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) !== false) {
              rows.push(row);
            }
          }
        }
        if (rows[0] === tab) {
          tab.setAttribute("zia-no-glow", "true");
        }
        return;
      }
      const mine = tab.getBoundingClientRect();
      if (!mine.height) {
        return;
      }
      let above = false;
      let below = false;
      for (const row of document.querySelectorAll(
        "#tabbrowser-tabs .tabbrowser-tab:not([zen-essential], [zen-empty-tab], [hidden]), #tabbrowser-tabs .tab-group-label-container"
      )) {
        if (row === tab) {
          continue;
        }
        const box = row.getBoundingClientRect();

        if (!box.height || !box.width || box.right <= mine.left || box.left >= mine.right) {
          continue;
        }
        if (row.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) === false) {
          continue;
        }
        above ||= box.bottom <= mine.top + 1;
        below ||= box.top >= mine.bottom - 1;
      }
      if (!above) {
        tab.setAttribute("zia-no-glow", "true");
      }
    };
    const soon = () => {
      update();
      if (!pending) {
        pending = requestAnimationFrame(update);
      }

      setTimeout(update, 250);
    };
    for (const type of [
      "TabSelect", "TabOpen", "TabClose", "TabMove", "TabPinned", "TabUnpinned", "TabGrouped",
      "TabUngrouped", "TabGroupCollapse", "TabGroupExpand", "TabShow", "TabHide",
    ]) {
      gBrowser.tabContainer.addEventListener(type, soon);
    }
    window.addEventListener("dragend", () => setTimeout(soon, 450), true);

    setInterval(update, 1000);
    soon();
  }

  function start() {
    const urlbar = gURLBar.textbox || document.getElementById("urlbar");

    safely("applyZenDefaults", applyZenDefaults);
    safely("setupIconPack", setupIconPack);
    safely("watchOptions", watchOptions);
    safely("watchUrlbarPosition", watchUrlbarPosition);
    safely("watchPipWindows", watchPipWindows);
    safely("watchMultiview", watchMultiview);
    safely("watchNewTabPage", watchNewTabPage);
    safely("createWorkspaceSlot", createWorkspaceSlot);
    safely("watchTabAnimations", watchTabAnimations);
    safely("moveTabsLikeDia", moveTabsLikeDia);
    safely("addFolderBounce", addFolderBounce);
    safely("allowEmojiFolderIcons", allowEmojiFolderIcons);
    safely("hideWwwInUrlbar", hideWwwInUrlbar);
    safely("watchRightEdges", watchRightEdges);
    ifOn("media-player", "watchMediaGlow", watchMediaGlow);
    safely("keepMediaCardsInPlace", keepMediaCardsInPlace);
    safely("watchTabSoundBars", watchTabSoundBars);
    safely("watchSelectedTabGlow", watchSelectedTabGlow);
    safely("watchSplitDrop", watchSplitDrop);
    safely("watchSplitPanes", watchSplitPanes);
    ifOn("find-bar", "watchFindBars", watchFindBars);
    safely("watchSpaceColor", watchSpaceColor);
    safely("animateEssentialsAdds", animateEssentialsAdds);
    ifOn("undo-close", "watchUndoClose", watchUndoClose);
    safely("watchTypedAddress", watchTypedAddress);
    safely("registerScrollActor", registerScrollActor);
    safely("registerPdfActor", registerPdfActor);
    safely("watchScrollInput", watchScrollInput);
    safely("createTitleElement", createTitleElement);
    safely("addDownloadProgress", addDownloadProgress);
    ifOn("icon-picker", "addIconPicker", addIconPicker);
    safely("watchCompactTopRow", watchCompactTopRow);
    safely("watchOldIcons", watchOldIcons);
    safely("watchNewFolders", watchNewFolders);
    safely("watchFolderColors", watchFolderColors);
    safely("addFolderColorPicker", addFolderColorPicker);
    safely("watchGroupColors", watchGroupColors);
    safely("watchFolderCloseButtons", watchFolderCloseButtons);
    safely("watchEmptyFolders", watchEmptyFolders);
    safely("watchEssentialRows", watchEssentialRows);
    safely("watchSplitEssentials", watchSplitEssentials);
    safely("watchSidebarPaint", watchSidebarPaint);
    safely("watchWindowButtonsSide", watchWindowButtonsSide);
    safely("addTabHoverCards", addTabHoverCards);

    gBrowser.tabContainer.addEventListener("TabSelect", () => {
      const browser = gBrowser.selectedBrowser;
      if (isLoading(browser) && !isErrorPage(browser)) {
        startLoader(0.25,  true);
      } else {
        cancelLoader();
      }
      snapColorForTab(browser);
      scheduleColor(60);
      scheduleColor(400);
      updateTitle();
    });

    gBrowser.tabContainer.addEventListener("TabAttrModified", (event) => {
      if (event.target === gBrowser.selectedTab) {
        updateTitle();
      }
    });

    const { STATE_START, STATE_STOP, STATE_IS_WINDOW } = Ci.nsIWebProgressListener;
    const { LOCATION_CHANGE_SAME_DOCUMENT, LOCATION_CHANGE_ERROR_PAGE } = Ci.nsIWebProgressListener;

    gBrowser.addTabsProgressListener({
      onStateChange(browser, webProgress, request, stateFlags) {
        if (!webProgress.isTopLevel || !(stateFlags & STATE_IS_WINDOW)) {
          return;
        }
        if (browser !== gBrowser.selectedBrowser) {
          return;
        }
        if (stateFlags & STATE_START) {
          scrollPositions.delete(browser);
          startLoader();

          colorRequestId++;
        } else if (stateFlags & STATE_STOP) {
          if (isErrorPage(browser)) {
            cancelLoader();
            showErrorColor();
          } else {
            finishLoader();
            scheduleColor(50);
            scheduleColor(800);
            scheduleColor(2000);
            scheduleColor(4500);
          }
          updateTitle();
        }
      },

      onProgressChange(browser, webProgress, request, curSelf, maxSelf, curTotal, maxTotal) {
        if (browser === gBrowser.selectedBrowser && maxTotal > 0) {
          reportRealProgress(curTotal / maxTotal);
        }
      },

      onLocationChange(browser, webProgress, request, location, flags) {
        if (!webProgress.isTopLevel) {
          return;
        }
        redirectBlankNewTab(browser, location, flags);

        if (flags & LOCATION_CHANGE_ERROR_PAGE) {
          errorBrowsers.add(browser);
        } else if (!(flags & LOCATION_CHANGE_SAME_DOCUMENT)) {
          errorBrowsers.delete(browser);
          scrollPositions.delete(browser);
        }
        if (browser !== gBrowser.selectedBrowser) {
          return;
        }
        if (flags & LOCATION_CHANGE_ERROR_PAGE) {
          cancelLoader();
          showErrorColor();
        } else if (flags & LOCATION_CHANGE_SAME_DOCUMENT) {
          scheduleColor(150);
        } else {
          const known = rememberedSiteColor(browser);
          if (known) {
            applyColor(known);
          }
        }
        updateTitle();
      },
    });

    new MutationObserver(updateTitle).observe(urlbar, {
      attributes: true,
      attributeFilter: ["pageproxystate"],
    });

    urlbar.addEventListener("mouseenter", rememberClosedText);
    urlbar.addEventListener(
      "mousedown",
      () => {
        rememberClosedText();
        clickedUrlbarAt = Date.now();
      },
      true
    );
    gBrowser.tabContainer.addEventListener("TabSelect", () => requestAnimationFrame(rememberClosedText));
    window.addEventListener("resize", () => requestAnimationFrame(rememberClosedText));
    setTimeout(rememberClosedText, 800);
    new MutationObserver(alignOpenedUrlbarSoon).observe(urlbar, {
      attributes: true,
      attributeFilter: ["breakout-extend"],
    });
    window.addEventListener("resize", alignOpenedUrlbarSoon);

    safely("keepWholeUrlSelected", () => keepWholeUrlSelected(urlbar));
    safely("matchTabCorners", matchTabCorners);
    safely("addCopyLinkButton", addCopyLinkButton);
    safely("addToastCloseButtons", addToastCloseButtons);
    safely("suckInEssentialGlances", suckInEssentialGlances);
    safely("animateNavButtons", animateNavButtons);
    safely("springReloadHover", springReloadHover);
    safely("watchEdgeGlow", watchEdgeGlow);
    safely("keepSidebarUnscrolledSideways", keepSidebarUnscrolledSideways);
    safely("watchColorDrift", watchColorDrift);
    safely("watchPopUpColor", watchPopUpColor);
    safely("quietZenHaptics", quietZenHaptics);
    safely("watchHapticsMute", watchHapticsMute);
    safely("watchUnloadable", watchUnloadable);
    safely("revertTypedTextOnLeave", () => revertTypedTextOnLeave(urlbar));
    safely("neverShowScheme", neverShowScheme);

    updateColor();
    updateTitle();
  }

  if (window.gBrowserInit?.delayedStartupFinished) {
    start();
  } else {
    const observer = (subject) => {
      if (subject === window) {
        Services.obs.removeObserver(observer, "browser-delayed-startup-finished");
        start();
      }
    };
    Services.obs.addObserver(observer, "browser-delayed-startup-finished");
  }
})();
