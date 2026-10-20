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

  // an attribute or style property set to a value, or (null) removed
  function setAttr(el, name, value) {
    if (value == null) {
      el.removeAttribute(name);
    } else {
      el.setAttribute(name, value);
    }
  }
  function setStyle(el, name, value) {
    if (value == null) {
      el.style.removeProperty(name);
    } else {
      el.style.setProperty(name, value);
    }
  }

  function setFlag(name, on) {
    if (on === root.hasAttribute(name)) {
      return;
    }
    setAttr(root, name, on ? "true" : null);
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

  // One band, 24px deep, for every reading: the checker once read deeper, and on
  // a page with a thin strip of another colour at its top the toolbar flicked.
  const TOP_BAND = 24;
  const STRIP_SCALE = 0.5;
  const FULL_VIEW_SCALE = 0.125;
  const TOP_BAND_ROWS = TOP_BAND * FULL_VIEW_SCALE;
  const SCROLL_SAMPLE_INTERVAL = 50;
  const scrollPositions = new WeakMap();
  const LIGHT_THRESHOLD = 150;
  const INK_MAX = 90;
  const BLACKISH = 12;
  const ERROR_PAGE_COLOR = [0, 0, 0];
  const ERROR_PAGES = /^about:(neterror|certerror|httpsonlyerror|blocked|tabcrashed)/;
  const errorBrowsers = new WeakSet();
  const colorCache = new WeakMap();
  let colorRequestId = 0;

  const MIN_COLOR_SHARE = 0.6;
  const SAME_COLOR_DISTANCE = 10;
  let pendingColor = null;

  let appliedColorKey = null;

  // a reading unlike the site's remembered colour, waiting on a second
  const UNSURE_RECHECK = 200;
  let unsureColor = null;

  const siteColorOn = () => Services.prefs.getBoolPref("zia.toolbar.site-color", true);

  function applyColor(rgb) {
    // off: clear over Zen's own window colour (01-page-card-and-toolbar.css), not Zia's near-black
    setFlag("zia-theme-toolbar", !siteColorOn());
    if (!siteColorOn()) {
      rgb = null;
    }
    // (the fallback is light in light mode, so it takes dark ink then)
    const fallback = rgb ? null : fallbackColor();
    const key = rgb ? rgb.join(",") : `fallback:${fallback.join(",")}`;
    if (key === appliedColorKey) {
      return;
    }
    appliedColorKey = key;
    if (!rgb) {
      root.style.removeProperty("--zia-site-bg");
      updateInkTint(null);
      const lightFallback = wantsDarkInk(fallback);
      setFlag("zia-site-light", lightFallback);
      setFlag("zia-site-dark", !lightFallback);
      setFlag("zia-site-mid", false);
      if (!lightFallback) {
        updateDarkSiteInk(fallback, brightnessOf(fallback), true);
      }
      return;
    }
    root.style.setProperty("--zia-site-bg", cssColor(rgb));
    updateInkTint(rgb);
    const brightness = brightnessOf(rgb);
    const light = wantsDarkInk(rgb);
    // a vivid colour (a strong red) counts as mid even a little darker, white text
    // and nothing faint: the dark sites' grey ink all but vanished on it
    const vivid = !light && brightness >= 40 && Math.max(...rgb.slice(0, 3)) - Math.min(...rgb.slice(0, 3)) >= 110;
    const mid = !light && (brightness >= INK_MAX || vivid);
    setFlag("zia-site-light", light);
    setFlag("zia-site-dark", brightness < INK_MAX && !vivid);
    setFlag("zia-site-mid", mid);
    updateDarkSiteInk(rgb, mid ? INK_MAX : brightness);
  }

  // the toolbar's ink takes the site's hue, as in Dia (a soft brown on cream,
  // measured); grey pages stay neutral
  function updateInkTint(rgb) {
    if (!rgb) {
      root.style.removeProperty("--zia-ink-h");
      root.style.removeProperty("--zia-ink-s");
      return;
    }
    const [r, g, b] = rgb.slice(0, 3).map((c) => c / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    let h = 0;
    let s = 0;
    if (d > 0.0001) {
      s = d / (1 - Math.abs(2 * l - 1));
      if (max === r) {
        h = 60 * (((g - b) / d) % 6);
      } else if (max === g) {
        h = 60 * ((b - r) / d + 2);
      } else {
        h = 60 * ((r - g) / d + 4);
      }
    }
    root.style.setProperty("--zia-ink-h", `${Math.round((h + 360) % 360)}`);
    // a third of the site's saturation, as Dia does
    root.style.setProperty("--zia-ink-s", `${Math.round(Math.min(s, 1) * 34)}%`);
  }

  function updateDarkSiteInk(rgb, brightness, inkOnly = false) {
    if (!rgb || brightness >= INK_MAX) {
      root.style.removeProperty("--zia-dark-ink");
      root.style.removeProperty("--zia-urlbar-hover-bg");
      return;
    }
    const base = rgb.slice(0, 3);
    // white on black and near-black pages, as in Dia (GitHub's #0d1117 read 3 and
    // got the dim grey meant for greyer darks)
    const t = brightness <= BLACKISH ? 0 : Math.min(1, (brightness - BLACKISH) / (INK_MAX - 44 - BLACKISH));
    const level = brightness <= BLACKISH ? 251 : Math.round(150 + t * 26);
    root.style.setProperty("--zia-dark-ink", `hsl(var(--zia-ink-h, 0) var(--zia-ink-s, 0%) ${((level / 255) * 100).toFixed(1)}%)`);
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
    const hex = rgbOfHex(text);
    if (hex) {
      return hex;
    }
    const parsed = parseColor(text);
    return parsed[3] ? parsed.slice(0, 3) : [18, 18, 18];
  }

  // a colour shown outright, any reading under way dropped
  function showColor(rgb) {
    colorRequestId++;
    applyColor(rgb);
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

  // When the scroll position isn't known the whole view is drawn small (one
  // row is 8px of page) and its top rows read
  // Pages drawn by the browser itself (Settings and the other about: pages) and
  // the empty tab can be see-through, showing the space's colour or gradient
  // behind them, which the page's own picture doesn't have: the toolbar took the
  // space's colour over a dark Settings page. These are read off the window,
  // just as they show, along the top of the page.
  function showsThrough(browser) {
    return (
      !browser.isRemoteBrowser ||
      browser.getAttribute("transparent") === "true" ||
      !!gBrowser.getTabForBrowser(browser)?.hasAttribute("zen-empty-tab")
    );
  }

  function sampleShownTop(browser) {
    const box = browser.getBoundingClientRect();
    if (!box.width || !box.height) {
      return null;
    }
    sampleShownTop.canvas ||= document.createElementNS(XHTML_NS, "canvas");
    const canvas = sampleShownTop.canvas;
    canvas.width = Math.max(1, Math.round(box.width * STRIP_SCALE));
    canvas.height = Math.max(1, Math.round(TOP_BAND * STRIP_SCALE));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.setTransform(STRIP_SCALE, 0, 0, STRIP_SCALE, 0, 0);
    ctx.drawWindow(window, box.left, box.top, box.width, TOP_BAND, "rgb(0, 0, 0)", ctx.DRAWWINDOW_DRAW_VIEW);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return commonColor(ctx.getImageData(0, 0, canvas.width, canvas.height).data, browser);
  }

  async function sampleTopColor(browser) {
    const windowGlobal = browser?.browsingContext?.currentWindowGlobal;
    const width = browser?.clientWidth;
    if (!windowGlobal || !width) {
      return null;
    }
    if (showsThrough(browser)) {
      return sampleShownTop(browser);
    }
    const backing = browser.getAttribute("transparent") === "true" ? "transparent" : "rgb(255, 255, 255)";

    const pos = scrollPositions.get(browser);
    const bitmap = pos
      ? await windowGlobal.drawSnapshot(new DOMRect(pos.x, pos.y, width, TOP_BAND), STRIP_SCALE, backing)
      : await windowGlobal.drawSnapshot(null, FULL_VIEW_SCALE, backing);

    sampleTopColor.canvas ||= document.createElementNS(XHTML_NS, "canvas");
    const canvas = sampleTopColor.canvas;
    canvas.width = bitmap.width;
    canvas.height = pos ? bitmap.height : Math.min(TOP_BAND_ROWS, bitmap.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    return commonColor(ctx.getImageData(0, 0, canvas.width, canvas.height).data, browser);
  }

  // the colour most of a reading is, and how much of it
  function commonColor(data, browser) {
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
    // (colour mixes compute to color(srgb r g b / a), each 0 to 1: read as
    // 0 to 255, a space's colour came out black and see-through)
    const srgb = text.match(/^color\(srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)(?:\s*\/\s*([\d.e-]+))?/);
    if (srgb) {
      const [r, g, b] = srgb.slice(1, 4).map((c) => Math.round(Math.min(1, Math.max(0, Number(c))) * 255));
      return [r, g, b, Math.round((srgb[4] === undefined ? 1 : Number(srgb[4])) * 255)];
    }
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

    // (while a colour's being picked by hand, the toolbar shows that)
    if (colorPick) {
      return;
    }
    if (isErrorPage(browser)) {
      showColor(ERROR_PAGE_COLOR);
      return;
    }
    // a site with a toolbar colour of its own (01b) keeps it, unread
    const manual = manualSiteColor(browser);
    if (manual) {
      pendingColor = null;
      showColor(manual);
      colorCache.set(browser, manual);
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

    // A reading unlike the site's remembered colour is often a passing splash
    // (Discord is white a moment before going dark), which made the toolbar flash:
    // it's believed only when a second reading a moment later agrees.
    if (!fromScroll && rgb) {
      const remembered = rememberedSiteColor(browser);
      if (remembered && colorDistance(rgb, remembered) > CHECK_DISTANCE) {
        if (unsureColor?.browser !== browser || colorDistance(rgb, unsureColor.rgb) > CHECK_DISTANCE) {
          unsureColor = { browser, rgb };
          setTimeout(() => updateColor(false, isLoading(browser)), UNSURE_RECHECK);
          return;
        }
      }
    }
    unsureColor = null;

    if (known && fromScroll) {
      if (reading && reading.share < MIN_COLOR_SHARE) {
        pendingColor = null;
        return;
      }
      if (colorDistance(rgb, current) <= SAME_COLOR_DISTANCE) {
        pendingColor = null;
        return;
      }
      if (rgb && colorDistance(rgb, pendingColor) > SAME_COLOR_DISTANCE) {
        pendingColor = rgb;
        requestScrollSample();
        return;
      }
    }
    pendingColor = null;
    applyColor(rgb);
    colorCache.set(browser, rgb);
    if (!fromScroll && rgb) {
      rememberSiteColor(browser, rgb);
    }
  }

  // The checker: the colour is read on load, for a few seconds after, and on
  // scroll, so a page that changes later (or has a thin strip at its top) could
  // leave it wrong. Every few seconds, and on focus or resize, the settled tab is
  // read again; two readings agreeing with each other, not the toolbar, correct it.
  const CHECK_EVERY = 3000;
  const CHECK_DISTANCE = 24;
  let checkSuspect = null;
  let checking = false;

  async function checkColor() {
    const browser = gBrowser.selectedBrowser;
    if (checking || document.hidden || !siteColorOn() || !browser || isErrorPage(browser) || isLoading(browser) ||
        scrollTimer || scrollSampling || !colorCache.has(browser) || colorPick || manualSiteColor(browser)) {
      return;
    }
    checking = true;
    const id = colorRequestId;
    let reading = null;
    try {
      reading = await sampleTopColor(browser);
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

  // optional: the address pop-up takes the toolbar's colour as it opens, frozen
  // until it closes so scrolling the page can't change it
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
    // a see-through colour laid over what's behind the page, so the pop-up is solid
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
      siteColors = new Map(Object.entries(JSON.parse(Services.prefs.getStringPref(SITE_COLORS_PREF, "{}"))));
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
    const manual = siteColorOn() && !isErrorPage(browser) ? manualSiteColor(browser) : null;
    if (isErrorPage(browser)) {
      showColor(ERROR_PAGE_COLOR);
    } else if (manual) {
      showColor(manual);
      colorCache.set(browser, manual);
    } else if (isLoading(browser) || !colorCache.has(browser)) {
      showColor(null);
    } else {
      showColor(colorCache.get(browser));
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
    // (the last for pages that recolour their header once their scripts run: GitHub)
    for (const ms of [150, 450, 1200, 2800, 5000]) {
      setTimeout(() => updateColor(false, isLoading(browser)), ms);
    }
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
    const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);
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
    registerActor("ZiaPdf", { DOMContentLoaded: {} }, "the PDF view", `?v=${Date.now()}`);
  }

  function registerScrollActor() {
    registerActor("Zia", { scroll: { capture: true, mozSystemGroup: true }, DOMContentLoaded: {}, pageshow: {} }, "scroll helper");
  }

  function registerActor(name, events, label, version = "") {
    try {
      ChromeUtils.registerWindowActor(name, {
        parent: { esModuleURI: `chrome://sine/content/zia/actors/${name}Parent.sys.mjs${version}` },
        child: { esModuleURI: `chrome://sine/content/zia/actors/${name}Child.sys.mjs${version}`, events },
        allFrames: false,
        messageManagerGroups: ["browsers"],
        // Firefox only starts a helper inside a website's process when told it's
        // safe there; these only report back (the PDF one's browser side does nothing)
        safeForUntrustedWebProcess: true,
      });
    } catch (err) {
      if (err?.name !== "NotSupportedError") {
        console.error(`[Zia] Could not register ${label}:`, err);
      }
    }
  }


  // A site's toolbar colour set by hand (right-click the address bar or toolbar):
  // click the page or type a hex. A site with its own colour is never read again,
  // so it can't flicker.
  const MANUAL_COLORS_PREF = "zia.toolbar.manual-colors";
  let manualColors = null;
  let colorPick = null;

  function loadManualColors() {
    if (manualColors) {
      return manualColors;
    }
    manualColors = {};
    try {
      const saved = JSON.parse(Services.prefs.getStringPref(MANUAL_COLORS_PREF, "{}"));
      if (saved && typeof saved === "object") {
        manualColors = saved;
      }
    } catch (err) {
      noteError("toolbar colour: load", err);
    }
    return manualColors;
  }

  function manualSiteColor(browser) {
    const host = browser && siteKey(browser);
    // (no site, as on Settings or an empty tab, is no colour: the empty key itself
    // came back as one, black, and the page was never read)
    const value = host ? loadManualColors()[host] : null;
    return typeof value === "string" ? value.split(",").map(Number) : null;
  }

  function setManualSiteColor(host, rgb) {
    if (!host) {
      return;
    }
    const colors = loadManualColors();
    if (rgb) {
      colors[host] = rgb.slice(0, 3).join(",");
    } else {
      delete colors[host];
    }
    try {
      Services.prefs.setStringPref(MANUAL_COLORS_PREF, JSON.stringify(colors));
    } catch (err) {
      noteError("toolbar colour: save", err);
    }
  }

  function hexOf(rgb) {
    return "#" + rgb.slice(0, 3).map((c) => c.toString(16).padStart(2, "0")).join("");
  }

  function rgbOfHex(text) {
    const hex = text.trim().replace(/^#/, "").match(/^([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
    if (!hex) {
      return null;
    }
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  }

  // back to the site's own colour if it has one, or a fresh reading
  function restoreToolbarColor(browser) {
    const manual = manualSiteColor(browser);
    if (manual) {
      showColor(manual);
      colorCache.set(browser, manual);
    } else {
      showColor(colorCache.get(browser) ?? null);
      updateColor();
    }
  }

  async function snapshotPage(browser) {
    const windowGlobal = browser?.browsingContext?.currentWindowGlobal;
    if (!windowGlobal || !browser.clientWidth) {
      return null;
    }
    const backing = browser.getAttribute("transparent") === "true" ? "transparent" : "rgb(255, 255, 255)";
    const bitmap = await windowGlobal.drawSnapshot(null, 1, backing);
    const canvas = document.createElementNS(XHTML_NS, "canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return {
      data: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
      width: canvas.width,
      height: canvas.height,
      scale: canvas.width / browser.clientWidth,
      backdrop: chromeBackdrop(browser),
    };
  }

  // The page's colour at a point (relative to the page's top left)
  function colorAt(shot, x, y) {
    const px = Math.min(shot.width - 1, Math.max(0, Math.floor(x * shot.scale)));
    const py = Math.min(shot.height - 1, Math.max(0, Math.floor(y * shot.scale)));
    const i = (py * shot.width + px) * 4;
    let rgb = [shot.data[i], shot.data[i + 1], shot.data[i + 2], shot.data[i + 3]];
    if (rgb[3] < 255) {
      rgb = colorOver(rgb, shot.backdrop);
    }
    return rgb.slice(0, 3);
  }

  async function startColorPick(browser) {
    endColorPick(false);
    const stack = browser?.closest(".browserStack");
    const host = siteKey(browser);
    if (!stack || !host) {
      return;
    }
    let shot = null;
    try {
      shot = await snapshotPage(browser);
    } catch (err) {
      noteError("toolbar colour: snapshot", err);
    }
    if (!shot || browser !== gBrowser.selectedBrowser) {
      return;
    }

    const el = (tag, className) => {
      const node = document.createElementNS(XHTML_NS, tag);
      if (className) {
        node.className = className;
      }
      return node;
    };
    const overlay = el("div");
    overlay.id = "zia-color-pick";
    const loupe = el("div", "zia-color-pick-loupe");
    const swatch = el("div", "zia-color-pick-swatch");
    const loupeHex = el("div", "zia-color-pick-hex");
    loupe.append(swatch, loupeHex);

    const bar = el("div", "zia-color-pick-bar");
    const hint = el("div", "zia-color-pick-hint");
    hint.textContent = `Click the page to color the toolbar for ${host}`;
    const input = el("input", "zia-color-pick-input");
    input.setAttribute("spellcheck", "false");
    input.setAttribute("placeholder", "#hex");
    input.setAttribute("maxlength", "7");
    const saved = manualSiteColor(browser);
    input.value = saved ? hexOf(saved) : "";
    const reset = el("button", "zia-color-pick-reset");
    reset.textContent = "Reset";
    reset.hidden = !saved;
    const cancel = el("button", "zia-color-pick-cancel");
    cancel.textContent = "Cancel";
    bar.append(hint, input, reset, cancel);
    overlay.append(loupe, bar);
    stack.append(overlay);

    colorPick = { browser, overlay, shot, typed: null };

    // (kept for the site picking began on, should the page have moved on)
    const keep = (rgb) => {
      setManualSiteColor(host, rgb);
      endColorPick(true);
    };

    overlay.addEventListener("mousemove", (event) => {
      if (bar.contains(event.target)) {
        loupe.hidden = true;
        return;
      }
      const rect = overlay.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const rgb = colorAt(shot, x, y);
      loupe.hidden = false;
      loupe.style.translate = `${x + 14}px ${y + 14}px`;
      swatch.style.backgroundColor = cssColor(rgb);
      loupeHex.textContent = hexOf(rgb);
      colorPick.typed = null;
      showColor(rgb);
    });
    overlay.addEventListener("mouseleave", () => {
      loupe.hidden = true;
    });
    overlay.addEventListener("mousedown", (event) => {
      if (bar.contains(event.target) || event.button !== 0) {
        return;
      }
      event.preventDefault();
      const rect = overlay.getBoundingClientRect();
      keep(colorAt(shot, event.clientX - rect.left, event.clientY - rect.top));
    });
    input.addEventListener("input", () => {
      const rgb = rgbOfHex(input.value);
      input.toggleAttribute("invalid", !!input.value.trim() && !rgb);
      if (rgb) {
        colorPick.typed = rgb;
        showColor(rgb);
      }
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        const rgb = rgbOfHex(input.value);
        if (rgb) {
          keep(rgb);
        }
      }
    });
    reset.addEventListener("click", () => {
      setManualSiteColor(host, null);
      endColorPick(false);
    });
    cancel.addEventListener("click", () => endColorPick(false));
  }

  function endColorPick(kept) {
    if (!colorPick) {
      return;
    }
    const { browser, overlay } = colorPick;
    colorPick = null;
    overlay.remove();
    if (kept) {
      const manual = manualSiteColor(browser);
      colorCache.set(browser, manual);
      if (browser === gBrowser.selectedBrowser) {
        showColor(manual);
      }
    } else if (browser === gBrowser.selectedBrowser) {
      restoreToolbarColor(browser);
    }
  }

  function addToolbarColorMenuItems() {
    const added = new WeakMap();
    document.addEventListener(
      "popupshowing",
      (event) => {
        const menu = event.target;
        if (menu?.localName !== "menupopup") {
          return;
        }
        const trigger = menu.triggerNode;
        // (the address's own menu, Cut, Copy, Paste: not a submenu, nor one
        // of the bar's buttons' menus)
        const onUrlbar = menu.parentElement?.localName !== "menu" &&
          !!trigger?.closest?.("#urlbar :is(moz-input-box, .urlbar-input-box, .urlbar-input)");
        const onToolbar = menu.id === "toolbar-context-menu" && !!trigger?.closest?.("#zen-appcontent-navbar-wrapper, #nav-bar");
        let items = added.get(menu);
        if (!onUrlbar && !onToolbar) {
          if (items) {
            items.separator.hidden = items.pick.hidden = items.reset.hidden = true;
          }
          return;
        }
        if (!items) {
          const separator = document.createXULElement("menuseparator");
          const pick = document.createXULElement("menuitem");
          pick.setAttribute("label", "Toolbar Color for This Site…");
          pick.addEventListener("command", () => startColorPick(gBrowser.selectedBrowser));
          const reset = document.createXULElement("menuitem");
          reset.setAttribute("label", "Reset Toolbar Color");
          reset.addEventListener("command", () => {
            const browser = gBrowser.selectedBrowser;
            setManualSiteColor(siteKey(browser), null);
            restoreToolbarColor(browser);
          });
          menu.append(separator, pick, reset);
          items = { separator, pick, reset };
          added.set(menu, items);
        }
        const browser = gBrowser.selectedBrowser;
        const shown = siteColorOn() && !!siteKey(browser) && !isErrorPage(browser);
        items.separator.hidden = items.pick.hidden = !shown;
        items.reset.hidden = !shown || !manualSiteColor(browser);
      },
      true
    );

    window.addEventListener(
      "keydown",
      (event) => {
        if (colorPick && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          endColorPick(false);
        }
      },
      true
    );
    gBrowser.tabContainer.addEventListener("TabSelect", () => endColorPick(false));
    window.addEventListener("resize", () => endColorPick(false));
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
    // each a host part and the rest
    const titleBox = (id) => {
      const box = document.createElementNS(XHTML_NS, "div");
      box.id = id;
      for (const part of ["host", "rest"]) {
        const span = document.createElementNS(XHTML_NS, "span");
        span.className = `zia-url-title-${part}`;
        box.append(span);
      }
      inputBox.append(box);
      return box;
    };
    titleEl = titleBox("zia-url-title");
    plainEl = titleBox("zia-url-plain");
  }

  function showTitle(el, host, rest) {
    el.firstChild.textContent = host;
    el.lastChild.textContent = rest;
  }

  const TITLE_ONLY_PREF = "zia.urlbar.title-only";

  function titleOnly() {
    try {
      return Services.prefs.getBoolPref(TITLE_ONLY_PREF, false);
    } catch (err) {
      return false;
    }
  }

  function watchTitleOnly() {
    watchPrefs([TITLE_ONLY_PREF, FULL_URL_PREF], () => updateTitle());
  }

  // (an option: the page's whole address, as Firefox shows it, rather than the domain and title)
  const FULL_URL_PREF = "zia.urlbar.full-url";

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
      // (an address with no host)
    }
    const title = (browser?.contentTitle || "").trim();
    const valid = urlbar.getAttribute("pageproxystate") === "valid";

    // Multiview reads as a browser feature ("Multiview · 3"), not a website.
    if (valid && isMultiviewURI(uri)) {
      showTitle(titleEl, title || "Multiview", "");
      showTitle(plainEl, title || "Multiview", "");
      urlbar.setAttribute("zia-has-title", "true");
      return;
    }
    if (!host || !valid || isErrorPage(browser) || Services.prefs.getBoolPref(FULL_URL_PREF, false)) {
      urlbar.removeAttribute("zia-has-title");
      return;
    }
    let isHomePage = false;
    let path = "";
    try {
      isHomePage = (uri.filePath || "/") === "/" && !uri.query && !uri.ref;
      path = uri.pathQueryRef || "";
    } catch (err) {
      // (an address without a path)
    }
    const hasTitle = /[\p{L}\p{N}]/u.test(title);
    // Title only (an option): the title alone, in the domain's place and
    // colour, even on a site's home page; a page with none shows its domain
    if (titleOnly() && hasTitle) {
      showTitle(titleEl, title, "");
    } else {
      showTitle(titleEl, host, !isHomePage && hasTitle && title !== host ? ` / ${title}` : "");
    }
    showTitle(plainEl, host, path === "/" ? "" : path);
    urlbar.setAttribute("zia-has-title", "true");
  }

  let urlbarTyping = false;
  // What was last typed
  let typedValue = "";

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
        // Typed characters don't come through here. A "/" typed on the end
        // stays, though: autofill writes "twitch.tv/" back for it, and
        // taking that off undid the key press.
        const keepSlash = typing && typedValue.endsWith("/");
        desc.set.call(
          this,
          typing ? (typeof next === "string" && !keepSlash ? next.replace(BARE_SLASH, "$1") : next) : plainAddress(next)
        );
        if (holdWholeSelection && gURLBar.focused) {
          this.select();
        }
      },
    });
    input.addEventListener("input", (event) => {
      if (event.isTrusted) {
        urlbarTyping = true;
        // (up to the caret: an autofilled ending after it may already be in)
        typedValue = desc.get.call(input).slice(0, input.selectionStart ?? undefined);
      }
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        urlbarTyping = false;
      }
    });
    input.addEventListener("blur", () => {
      urlbarTyping = false;
      typedValue = "";
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
    // The click that opens the bar selects the whole address. The bar moves
    // and grows as it opens, though, so with the button still down the text
    // slid under a pointer that hadn't moved and Firefox took it for a drag,
    // selecting only part of it ("youtub"). Unless the pointer itself moved,
    // that click selects the whole address however the text moved under it.
    let pressedAt = null;
    urlbar.addEventListener(
      "mousedown",
      (event) => {
        pressedAt = holdWholeSelection ? { x: event.screenX, y: event.screenY } : null;
        lastPointer = null;
      },
      true
    );
    // While that click is held, a drag Firefox reads into the moving text is
    // undone as it happens, before it's drawn (only fixed on release, the
    // part-selection showed for a moment first). A real drag moves the
    // pointer, and is left alone.
    let lastPointer = null;
    window.addEventListener(
      "mousemove",
      (event) => {
        lastPointer = pressedAt ? { x: event.screenX, y: event.screenY } : null;
      },
      true
    );
    const holdWhole = () => {
      const press = pressedAt;
      if (!press || !gURLBar.focused || urlbarTyping) {
        return;
      }
      if (lastPointer && Math.hypot(lastPointer.x - press.x, lastPointer.y - press.y) > 4) {
        return;
      }
      if (input.selectionStart !== 0 || input.selectionEnd !== input.value.length) {
        input.select();
      }
    };
    input.addEventListener("selectionchange", holdWhole);
    input.addEventListener("select", holdWhole);
    window.addEventListener(
      "mouseup",
      (event) => {
        const press = pressedAt;
        pressedAt = null;
        if (!press || event.button !== 0 || Math.hypot(event.screenX - press.x, event.screenY - press.y) > 4) {
          return;
        }
        const wholeLater = () => {
          if (gURLBar.focused && !urlbarTyping && (input.selectionStart !== 0 || input.selectionEnd !== input.value.length)) {
            input.select();
          }
        };
        wholeLater();
        requestAnimationFrame(wholeLater);
      },
      true
    );
    const release = () => {
      holdWholeSelection = false;
      pressedAt = null;
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

  // Optional (zia.urlbar.center-text): the address centred on the toolbar, not in the bar,
  // which the buttons either side push off the toolbar's middle; and held there as the
  // bar's own buttons show and hide on hover (re-centred in what was left, it slid aside
  // each time). Measured as either changes size, before it's drawn. Only the toolbar's
  // bar, closed: in the sidebar (Zen's single toolbar) or open, it's as it was.
  function watchCenteredAddress() {
    const urlbar = gURLBar.textbox || document.getElementById("urlbar");
    const box = gURLBar.inputField?.parentNode;
    const toolbar = document.getElementById("zen-appcontent-navbar-wrapper");
    if (!urlbar || !box || !toolbar) {
      return;
    }
    const update = () => {
      let shift = 0;
      if (
        Services.prefs.getBoolPref("zia.urlbar.center-text", false) &&
        root.getAttribute("zen-single-toolbar") !== "true" &&
        !urlbar.hasAttribute("breakout-extend") &&
        urlbar.getAttribute("zen-floating-urlbar") !== "true"
      ) {
        const bar = box.getBoundingClientRect();
        const card = toolbar.getBoundingClientRect();
        if (bar.width && card.width) {
          // (a fifth of the bar at most either way: a long address keeps most of its room)
          const most = bar.width / 5;
          shift = Math.max(-most, Math.min(most, card.left + card.width / 2 - (bar.left + bar.width / 2)));
        }
      }
      setStyle(urlbar, "--zia-center-shift", Math.abs(shift) >= 1 ? `${Math.round(shift)}px` : null);
    };
    const observer = new ResizeObserver(update);
    observer.observe(box, { box: "border-box" });
    observer.observe(toolbar, { box: "border-box" });
    new MutationObserver(update).observe(urlbar, { attributes: true, attributeFilter: ["breakout-extend", "zen-floating-urlbar"] });
    watchPrefs("zia.urlbar.center-text", update);
    window.addEventListener("unload", () => observer.disconnect());
    update();
  }

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
      closedTextRect = { left: rect.left, centerY: rect.top + rect.height / 2, at: Date.now() };
    }
  }

  function alignOpenedUrlbar() {
    const urlbar = gURLBar.textbox || document.getElementById("urlbar");
    // Opened as wide as the closed bar: Zen measures that as the layout changes, but not
    // as compact mode takes the sidebar away, so it opened at its width beside the sidebar
    const container = document.getElementById("urlbar-container");
    const single = root.getAttribute("zen-single-toolbar") === "true";
    if (urlbar?.hasAttribute("breakout-extend") && urlbar.getAttribute("zen-floating-urlbar") !== "true" && !single && container) {
      const width = `${container.getBoundingClientRect().width}px`;
      if (width !== "0px" && urlbar.style.getPropertyValue("--urlbar-width") !== width) {
        urlbar.style.setProperty("--urlbar-width", width);
      }
    }
    // (and in the sidebar, with Zen's single toolbar, it opens where Zen puts it: moved to
    // keep the text where it was, it went past the window's left edge)
    if (urlbar) {
      setStyle(urlbar, "--zia-pop-reach-top", null);
    }
    if ((urlbar?.getAttribute("zen-floating-urlbar") === "true" && !urlbarAtBottom()) || single) {
      openOffset = 0;
      openOffsetX = 0;
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
    // (lined up only with where the text was at that click: taken earlier, say before compact
    // mode moved the bar, or with Zen's new tab bar still open as it was clicked, the old
    // spot sent the pop-up up and to the left)
    const fresh = !!closedTextRect && (urlbarAtBottom() || clickedUrlbarAt - closedTextRect.at < 100);
    const openedByClick = (urlbarAtBottom() || Date.now() - clickedUrlbarAt < 1500) && fresh;
    if (!openedByClick && openOffsetX) {
      openOffsetX = 0;
      root.style.setProperty("--zia-urlbar-open-offset-x", "0px");
    }
    if (openedByClick && inputRect?.width) {
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
      reachWindowTop(urlbar);
      return;
    }

    const top = urlbar.getBoundingClientRect().top;
    const diff = desiredOpenTop() - top;
    if (Math.abs(diff) > 0.5) {
      openOffset += diff;
      root.style.setProperty("--zia-urlbar-open-offset", `${openOffset}px`);
    }
    reachWindowTop(urlbar);
  }

  // The pop-up at the top of the window reaches up to its top edge, as Dia's does: it stopped
  // the card's gap short of it. Its background grows up into that gap, so the address and
  // the results stay where they are. Not at the bottom, in the sidebar or floating.
  function reachWindowTop(urlbar) {
    const top = urlbar.getBoundingClientRect().top;
    const reach = !urlbarAtBottom() && top > 0 && top < 24 ? top : 0;
    setStyle(urlbar, "--zia-pop-reach-top", reach ? `${reach}px` : null);
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
      // Reload's hover look (its arrowhead drawn back) isn't kept while
      // stop's showing: coming back, reload grew in whole and then snapped
      // to that look. It springs into it once it's in, if still hovered.
      if (now) {
        reload.ziaReloadCut?.(0, true);
      } else {
        // (once the grow-in has let go of it: its animation holds the
        // arrowhead's turn until then, and eased in under it, it jumped
        // to wherever the ease had got to as the animation ended)
        setTimeout(() => {
          if (!reload.hasAttribute("displaystop") && !container.hasAttribute("zia-morph") && container.matches(":hover")) {
            reload.ziaReloadCut?.(RELOAD_HOVER_CUT);
          }
        }, 470);
      }
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
    const setCut = (value) => {
      cut = value;
      button.style.setProperty("--zia-reload-cut", `${cut}deg`);
    };
    const go = (target, instant = false) => {
      cancelAnimationFrame(frame);
      if (instant || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setCut(target);
        return;
      }
      const from = cut;
      const start = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - start) / RELOAD_HOVER_MS);
        setCut(from + (target - from) * ease(t));
        if (t < 1) {
          frame = requestAnimationFrame(step);
        }
      };
      frame = requestAnimationFrame(step);
    };
    button.addEventListener("mouseenter", () => {
      // (not while it's coming back in from stop: that springs it after)
      if (!button.parentElement?.hasAttribute("zia-morph")) {
        go(RELOAD_HOVER_CUT);
      }
    });
    button.addEventListener("mouseleave", () => go(0));
    button.ziaReloadCut = go;
  }
  let workspaceSlot = null;
  let movedIndicator = null;
  let movedFromSpace = null;
  let spaceAttrObserver = null;
  const MIRRORED_SPACE_ATTRS = ["haspinnedtabs", "collapsedpinnedtabs"];
  // The space's name left where Zen puts it, above the tabs, rather than
  // moved up beside the window buttons
  const SPACE_NAME_IN_LIST_PREF = "zia.sidebar.space-name-in-list";
  const spaceNameInList = () => Services.prefs.getBoolPref(SPACE_NAME_IN_LIST_PREF, false);

  function createWorkspaceSlot() {
    const topButtons = document.getElementById("zen-sidebar-top-buttons");
    if (!topButtons || !window.gZenWorkspaces) {
      return;
    }
    workspaceSlot = document.createElementNS(XHTML_NS, "div");
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
    watchPrefs(SPACE_NAME_IN_LIST_PREF, onSpaceSwitch);
    watchPrefs("zen.workspaces.active", onSpaceSwitch);
    gBrowser.tabContainer.addEventListener("TabSelect", onSpaceSwitch);
    placeWorkspaceIndicator();
    setTimeout(placeWorkspaceIndicator, 500);
    setTimeout(placeWorkspaceIndicator, 2000);
  }

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
    for (const name of ["zia-icon", "zia-has-icon", "zia-has-svg"]) {
      label.removeAttribute(name);
    }
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
        // (only a real SVG is parsed: anything else, or a file still
        // carrying the build's # lines, logged an XML parsing error for
        // every space)
        const svgText = svgSourceOf(source);
        if (!svgText) {
          return;
        }
        const colored = svgText
          .replace(/context-(?:fill|stroke)-opacity/g, "1")
          .replace(/context-(?:fill|stroke)/g, "currentColor")
          .replace(/\b(fill|stroke)="(?:#000(?:000)?|black)"/gi, '$1="currentColor"')
          .replace(/(fill|stroke)\s*:\s*(?:#000(?:000)?|black)/gi, "$1:currentColor");
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
      setAttr(workspaceSlot, name, space?.hasAttribute(name) ? space.getAttribute(name) : null);
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

    const inList = spaceNameInList();
    setFlag("zia-space-name-in-list", inList);
    if (inList) {
      indicator = null;
      spaceAttrObserver?.disconnect();
      mirrorSpaceAttributes(null);
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

    if (inList) {
      setFlag("zia-workspace-slot", false);
      return;
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
  // the address Zia itself made the new tab page, so it only ever undoes
  // its own: a new tab page an extension set is left as it is
  let ziaNewTabUrl = null;

  // An extension's new tab page (Yet another speed dial and the like), if
  // one is in charge, put back after Zia's own is undone
  async function restoreExtensionNewTab(AboutNewTabModule) {
    try {
      const { ExtensionSettingsStore } = ChromeUtils.importESModule("resource://gre/modules/ExtensionSettingsStore.sys.mjs");
      await ExtensionSettingsStore.initialize();
      const setting = ExtensionSettingsStore.getSetting("url_overrides", "newTabURL");
      if (setting?.value) {
        AboutNewTabModule.newTabURL = setting.value;
      }
    } catch (err) {
      noteError("new tabs: restoreExtensionNewTab", err);
    }
  }

  const aboutNewTab = () => window.AboutNewTab || ChromeUtils.importESModule("resource:///modules/AboutNewTab.sys.mjs").AboutNewTab;

  // the new tab page as it is now: Zia's, an extension's, or Zen's own
  function currentNewTabUrl() {
    try {
      return aboutNewTab().newTabURL || "about:newtab";
    } catch (err) {
      return "about:newtab";
    }
  }

  function newTabSearchEnabled() {
    return Services.prefs.getBoolPref("zia.newtab.search-engine", true);
  }

  async function applyNewTabPage() {
    try {
      const AboutNewTabModule = aboutNewTab();
      if (!newTabSearchEnabled()) {
        searchHomeUrl = null;
        // only Zia's own page is undone (turned off while running); one an
        // extension set stays, and is put back if Zia had replaced it
        if (ziaNewTabUrl && AboutNewTabModule.newTabURL === ziaNewTabUrl) {
          AboutNewTabModule.resetNewTabURL();
          await restoreExtensionNewTab(AboutNewTabModule);
        }
        ziaNewTabUrl = null;
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
        ziaNewTabUrl = searchHomeUrl;
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

  // Optional: Cmd/Ctrl+T leaves the address bar ready to type in, with the
  // search page showing behind it (off: the page's own search box)
  const focusAddressBarOnNewTab = () => Services.prefs.getBoolPref("zia.newtab.focus-address-bar", false);

  function keepNewTabUrlbar(tab) {
    const focus = () => {
      if (gBrowser.selectedTab !== tab || tab.ziaTypedInPage) {
        return;
      }
      if (compactToolbarHidden()) {
        floatUrlbar();
        return;
      }
      if (!gURLBar.focused) {
        gURLBar.focus();
        gURLBar.select();
      }
    };
    // the search page loading after can pull focus to its own box: put it
    // back, until something's been typed or clicked in the page
    tab.ziaBlankAddress = true;
    tab.linkedBrowser?.addEventListener("mousedown", () => (tab.ziaTypedInPage = true), { once: true });
    requestAnimationFrame(focus);
    for (const ms of [250, 700, 1500]) {
      setTimeout(() => {
        if (document.activeElement === tab.linkedBrowser) {
          focus();
        }
      }, ms);
    }
  }

  // The search page arriving in a new tab put its address in the address
  // bar, already open to type in, so it had to be deleted first (Zen 1.23
  // writes a page's address in as it loads, even with the bar in use). It's
  // kept empty instead, until something's typed there or in the page.
  function isSearchHome(uri) {
    try {
      const home = Services.io.newURI(searchHomeUrl);
      return uri.prePath === home.prePath && uri.filePath === home.filePath;
    } catch (err) {
      return false;
    }
  }

  function clearNewTabAddress(browser, tab, uri) {
    const clear = () => {
      if (gBrowser.selectedTab !== tab || tab.ziaTypedInPage || !tab.ziaBlankAddress) {
        return;
      }
      // (what's in the bar is still the page's own address, not typing)
      const shown = gURLBar.value || "";
      if (shown && (gURLBar.valueIsTyped || !uri.spec.includes(shown.replace(/^https?:\/\//, "").replace(/\/$/, "")))) {
        tab.ziaBlankAddress = false;
        return;
      }
      browser.userTypedValue = "";
      gURLBar.value = "";
    };
    clear();
    requestAnimationFrame(clear);
  }

  function keepNewTabAddressEmpty(browser, location) {
    const tab = gBrowser.getTabForBrowser?.(browser);
    if (!tab?.ziaBlankAddress || !searchHomeUrl || !location) {
      return;
    }
    if (tab.ziaTypedInPage || location.spec === "about:newtab" || location.spec === "about:blank") {
      return;
    }
    // (the search page itself: a search from it, or anywhere else, shows
    // its address as usual from then on)
    if (!isSearchHome(location)) {
      tab.ziaBlankAddress = false;
      return;
    }
    clearNewTabAddress(browser, tab, location);
  }

  // Firefox shows the address a new tab is loading as soon as the load
  // starts, so the search page's sat in the bar until it arrived, a second
  // or two on a slow connection: it's cleared from the start of the load
  function blankLoadingNewTabAddress(browser, request) {
    const tab = gBrowser.getTabForBrowser?.(browser);
    if (!tab?.ziaBlankAddress || tab.ziaTypedInPage || !searchHomeUrl) {
      return;
    }
    let uri = null;
    try {
      uri = request?.QueryInterface(Ci.nsIChannel).originalURI;
    } catch (err) {
      return;
    }
    if (uri && isSearchHome(uri)) {
      clearNewTabAddress(browser, tab, uri);
    }
  }

  // Compact mode with Zen's top toolbar hidden: Zen brings the toolbar out while
  // the address bar has the cursor, so a new tab's, ready to type in, held it out
  // till the tab was left
  function compactToolbarHidden() {
    return (
      root.getAttribute("zen-compact-mode") === "true" &&
      root.getAttribute("zen-single-toolbar") !== "true" &&
      root.getAttribute("zia-urlbar-position") !== "bottom" &&
      Services.prefs.getBoolPref("zen.view.compact.hide-toolbar", false)
    );
  }

  // ...so there it opens floating over the new tab, as Zen's own new tab does,
  // and the toolbar stays hidden (16-compact-mode.css). (Zen's way in: an empty
  // search, which opens the bar's list.)
  function floatUrlbar() {
    try {
      if (!gURLBar.focused || !gURLBar.hasAttribute("breakout-extend")) {
        gURLBar.search("");
      }
    } catch (err) {
      noteError("new tabs: floatUrlbar", err);
    }
  }

  function floatNewTabUrlbar(tab) {
    requestAnimationFrame(() => {
      if (gBrowser.selectedTab === tab && gURLBar.focused && !gURLBar.value) {
        floatUrlbar();
      }
    });
  }

  function closeNewTabUrlbar(tab) {
    if (!searchHomeUrl || !newTabSearchEnabled()) {
      if (compactToolbarHidden()) {
        floatNewTabUrlbar(tab);
      }
      return;
    }
    if (focusAddressBarOnNewTab()) {
      keepNewTabUrlbar(tab);
      return;
    }
    requestAnimationFrame(() => {
      try {
        if (!gURLBar?.focused || gBrowser.selectedTab !== tab) {
          return;
        }
        gURLBar.view?.close();
        gURLBar.blur();
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
    watchPrefs("zia.newtab.search-engine", applyNewTabPage);
    window.addEventListener("unload", () => Services.obs.removeObserver(applyNewTabPage, "browser-search-engine-modified"));
  }

  // Closing one of a split's two tabs: Zen unsplits first, so the closing one shrank
  // as a row and the other slid up from under it, a jump. It goes at once instead.
  function closeSplitTabsInPlace() {
    gBrowser.tabContainer.addEventListener(
      "TabClose",
      (event) => {
        const tab = event.target;
        const split = tab?.group?.hasAttribute?.("split-view-group") ? tab.group : null;
        if (split && split.tabs.filter((t) => !t.closing || t === tab).length <= 2) {
          tab.setAttribute("zia-split-closing", "true");
        }
      },
      true
    );
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

  // Zen's even 0.18s folder slide becomes a spring: quick in, a pixel or two past (the
  // same whatever the folder's size), then back. Opening, the box stretches past;
  // closing, what's below bounces up. Only the slide of the folder's start changes.
  const FOLDER_SPRING_MS = 420;
  const FOLDER_OVERSHOOT_PX = 2;
  const FOLDER_CLOSE_BOUNCE_PX = 1.5;
  const FOLDER_SELECTOR = "zen-folder, tab-group:not([split-view-group])";

  // The spring moved by fractions of a pixel, and the box's 1px outline fades for a
  // frame between pixels, so its bottom edge flickered: the motion is held steps,
  // each on a whole screen pixel counted from where it comes to rest.
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

  // Zen's folder slides: two keyframes and a duration
  const isSlide = (keyframes, options) =>
    Array.isArray(keyframes) && keyframes.length === 2 && typeof options === "object" && options?.duration > 0;

  const bounceOn = () => {
    try {
      return Services.prefs.getBoolPref("zia.folders.bounce", true);
    } catch (err) {
      return false;
    }
  };

  // a few pixels past the end, whichever way it's going
  const pastEnd = (from, to) => to + Math.sign(to - from) * Math.min(FOLDER_OVERSHOOT_PX, Math.abs(to - from) / 4);

  // the folder's height animated outright, held for the time (zia-folder-holding)
  function animateFolderHeight(container, from, to, options, animate = Element.prototype.animate) {
    container.setAttribute("zia-folder-holding", "true");
    const done = () => {
      if (!container.ziaHold) {
        container.removeAttribute("zia-folder-holding");
      }
    };
    animate.call(container, [{ height: `${from}px` }, { height: `${to}px` }], options).finished.then(done, done);
  }

  const isFolder = (el) =>
    el?.localName === "zen-folder" || (el?.localName === "tab-group" && !el.hasAttribute("split-view-group"));

  function springFolderAnimation(element, keyframes, options) {
    // (a space's pinned tabs, hidden by clicking its name, are a folder to Zen too:
    // the same start and slide, so the tabs below spring the same way)
    const spaceStart = element.classList?.contains("space-fake-collapsible-start");
    if (
      !element.classList?.contains("zen-tab-group-start") ||
      !(spaceStart || isFolder(element.parentElement?.parentElement)) ||
      !isSlide(keyframes, options)
    ) {
      return null;
    }
    // Clicked open and shut quickly, Zen's ends go stale (opening "from 0 to 0"): the
    // way comes from the folder, and the ends from where open (0) and shut really are
    const folder = spaceStart ? element.closest("zen-workspace") : element.parentElement.parentElement;
    if (!folder) {
      return null;
    }
    // With a tab selected inside, Zen shows just that tab and the other tabs' own
    // animations carry the motion (springFolderItem), so Zen's slide is left as it was
    if (!spaceStart && (folder.hasAttribute("has-active") || folder.contains(gBrowser.selectedTab))) {
      element.parentElement.ziaHold?.();
      return null;
    }
    const closing = spaceStart ? folder.hasAttribute("collapsedpinnedtabs") : folder.hasAttribute("collapsed");
    // (a folder whose one showing tab was just dragged out of it already
    // looks shut: its room closes, without the bounce, 28-tab-dragging)
    const lentOut = (folder.ziaLentUntil || 0) > Date.now();
    const zenFrom = parseFloat(keyframes[0]?.marginTop);
    const zenTo = parseFloat(keyframes[1]?.marginTop);
    // (a space's pinned section keeps its bottom line when hidden: shut by its whole
    // height, the line vanished and came back, and the tabs below snapped down)
    const line = spaceStart ? element.parentElement.querySelector(":scope > .pinned-tabs-container-separator") : null;
    const lineHeight = line ? line.getBoundingClientRect().height : 0;
    const shut = -Math.max(
      1,
      element.parentElement.getBoundingClientRect().height - lineHeight,
      ...(spaceStart ? [] : [closing ? -zenTo : -zenFrom].filter(Number.isFinite))
    );
    const from = closing ? 0 : Number.isFinite(zenFrom) && zenFrom < 0 ? zenFrom : shut;
    // (a space's own end is where Zen leaves it once done: ended anywhere
    // else, the tabs below jumped the difference as Zen's took over)
    const zenShut = Number.isFinite(zenTo) && zenTo < 0;
    const to = closing ? (spaceStart && zenShut ? zenTo : zenShut ? Math.min(zenTo, shut) : shut) : 0;
    // Spring off: Zen's own timing, but still the folder opening over its
    // tabs (holdFolderContents); the setting is for the bounce only
    // (a folder just dropped into it opens it, its room already made by the drag: at
    // once, rather than shut and springing open again, 28-tab-dragging)
    if ((folder.ziaDroppedUntil || 0) > Date.now() && !closing) {
      return { from: to, to, closing, plain: true, keyframes: [{ marginTop: `${to}px` }, { marginTop: `${to}px` }], options: { ...options, duration: 0 } };
    }
    if (!bounceOn() || lentOut) {
      return { from, to, closing, plain: true, keyframes: [{ marginTop: `${from}px` }, { marginTop: `${to}px` }], options };
    }
    // Opening, the margin goes a little past 0; closing, a little past shut, so the
    // rows below rise past their place and drop back.
    const past = pastEnd(from, to);
    return {
      from,
      to,
      closing,
      keyframes: pixelSteps("marginTop", [[0, from, EASE_OUT], [0.62, past, EASE_IN_OUT], [1, to]], FOLDER_SPRING_MS, to),
      options: { ...options, duration: FOLDER_SPRING_MS, easing: "linear" },
    };
  }

  // Closing, the contents shrink to nothing before the overshoot, and a height can't
  // go below nothing, so the overshoot moved nothing: a negative bottom margin pulls
  // the folder's box and everything below up past their place and back.
  function bounceUpAfterClosing(container, animate) {
    if (!container?.classList?.contains("tab-group-container") && !container?.classList?.contains("zen-workspace-pinned-tabs-section")) {
      return;
    }
    // A space's pinned section never shrinks to nothing (its line stays), so the slide's
    // own overshoot already moves line and tabs together; this on top over-bounced the tabs
    const line = container.querySelector(":scope > .pinned-tabs-container-separator");
    if (line && line.getBoundingClientRect().height > 0) {
      return;
    }
    animate.call(
      container,
      pixelSteps("marginBottom", [[0, 0, null], [0.45, 0, EASE_OUT], [0.66, -FOLDER_CLOSE_BOUNCE_PX, EASE_IN_OUT], [1, 0]], FOLDER_SPRING_MS, 0),
      { duration: FOLDER_SPRING_MS }
    );
  }

  // Zen opens a folder by sliding its contents down from under its name (a clipped
  // margin). As in Dia, the tabs stay put and the folder opens over them: the margin
  // jumps to its end (closing, waits for it) and the folder's height takes the motion,
  // so the rows below move as before. Closing, the tabs fade out in place.
  function holdFolderContents(start, spring, animate) {
    const container = start.parentElement;
    if (!container?.classList?.contains("tab-group-container")) {
      return null;
    }
    const { to, closing } = spring;
    // From the height it's at (turned round part way); reopened mid-close, the height
    // kept when that close was stopped a moment ago
    const kept = container.ziaShown;
    container.ziaShown = null;
    const fromHeight = kept && performance.now() - kept.at < 100 ? kept.height : container.getBoundingClientRect().height;
    container.ziaHold?.();
    // to the measured height open or shut, not the margin's: Zen's ends go stale, and an
    // empty folder's margin moves just a few pixels, which stepped the height
    const saved = start.style.marginTop;
    start.style.marginTop = "0px";
    const openHeight = container.getBoundingClientRect().height;
    let toHeight = openHeight;
    if (closing) {
      start.style.marginTop = `${-2 * openHeight - 1}px`;
      toHeight = container.getBoundingClientRect().height;
    }
    start.style.marginTop = saved;
    // Shut, the margin takes everything in the folder out of sight (Zen's
    // own end can fall short when it's turned round part way)
    const shut = Math.min(to, -openHeight);
    // Already there: nothing moves (Zen's own slide would move the tabs)
    if (!(Math.abs(toHeight - fromHeight) > 0.5)) {
      const still = `${closing ? shut : 0}px`;
      return [{ marginTop: still }, { marginTop: still }];
    }
    const heights = spring.plain
      ? [{ height: `${fromHeight}px` }, { height: `${toHeight}px` }]
      : pixelSteps(
          "height",
          [
            [0, fromHeight, EASE_OUT],
            [0.62, Math.max(0, pastEnd(fromHeight, toHeight)), EASE_IN_OUT],
            [1, toHeight],
          ],
          spring.options.duration,
          toHeight
        );
    const margin = closing
      ? [{ marginTop: "0px" }, { marginTop: "0px", offset: 0.999 }, { marginTop: `${shut}px` }]
      : [{ marginTop: "0px" }, { marginTop: "0px" }];

    const items = [...container.children].filter((child) => child !== start);
    const fades = closing
      ? items.map((item) =>
          animate.call(item, [{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: "ease-in", fill: "forwards" })
        )
      : [];
    container.setAttribute("zia-folder-holding", "true");
    const growing = animate.call(container, heights, { duration: spring.options.duration, easing: spring.options.easing || "linear" });
    let done = false;
    const unfade = () => {
      for (const fade of fades) {
        fade.cancel();
      }
      gBrowser.tabContainer.removeEventListener("TabSelect", onSelect);
      window.removeEventListener("TabGroupExpand", onOpen, true);
    };
    // (however it's opened: not every opening comes through here)
    const onOpen = (event) => {
      if (event.target !== container.parentElement) {
        return;
      }
      // Opened again part way through closing: it grows back from where it got to, not
      // snapping open (Zen doesn't animate it, its margin never having got to closed)
      const midway = growing.playState === "running";
      const shown = container.getBoundingClientRect().height;
      // (for Zen's opening animation, which comes just after)
      container.ziaShown = { height: shown, at: performance.now() };
      stop();
      if (!midway) {
        return;
      }
      requestAnimationFrame(() => {
        if (container.ziaHold || !container.isConnected) {
          return;
        }
        const full = container.getBoundingClientRect().height;
        if (Math.abs(full - shown) < 1) {
          return;
        }
        animateFolderHeight(container, shown, full, { duration: FOLDER_SPRING_MS, easing: "cubic-bezier(0.25, 1, 0.5, 1)" }, animate);
      });
    };
    // A tab selected inside the closed folder is shown by Zen: it can't
    // stay faded out
    const onSelect = () => {
      if (container.contains(gBrowser.selectedTab)) {
        unfade();
      }
    };
    const stop = () => {
      if (done) {
        return;
      }
      done = true;
      if (container.ziaHold === stop) {
        container.ziaHold = null;
      }
      container.removeAttribute("zia-folder-holding");
      growing.cancel();
      unfade();
    };
    container.ziaHold = stop;
    // Closing, it's watched for opening again: that opening needn't come back through
    // here, and the tabs were left faded out in an open folder
    if (closing) {
      window.addEventListener("TabGroupExpand", onOpen, true);
    }
    growing.finished.then(() => {
      if (!closing || !container.parentElement?.hasAttribute("collapsed")) {
        stop();
        return;
      }
      // Closed, the tabs stay faded out: Zen leaves them just above the folder, where they
      // flashed over the rows above. They come back as it opens again or one is selected.
      // It's shut all the way whatever end Zen keeps: Zen writes its own (short, turned
      // round part way) just after, so this waits a frame, before anything's drawn.
      requestAnimationFrame(() => {
        if (done || !container.parentElement?.hasAttribute("collapsed")) {
          return;
        }
        if (parseFloat(getComputedStyle(start).marginTop) > shut + 0.5) {
          start.style.marginTop = `${shut}px`;
        }
        container.removeAttribute("zia-folder-holding");
        growing.cancel();
      });
      gBrowser.tabContainer.addEventListener("TabSelect", onSelect);
    }, () => {});
    return margin;
  }

  // With a tab selected inside, Zen shrinks the other tabs away (or grows them back)
  // instead of sliding, so the spring never ran: their own animations get its first leg
  // (arriving at 62%), and the contents stretch or pull past, then settle.
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
      !isSlide(keyframes, options) ||
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
    if (!bounceOn()) {
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

  // Opening a folder that showed just its open tab, Zen restores the other tabs'
  // "own" opacity, which can't be animated to, so they popped in: they fade instead.
  function fadeBackIn(element, keyframes) {
    if (element.localName !== "tab" || !element.closest?.(FOLDER_SELECTOR)) {
      return keyframes;
    }
    if (Array.isArray(keyframes)) {
      const last = keyframes.at(-1);
      if (keyframes.length >= 2 && last && "opacity" in last && (last.opacity === "" || last.opacity == null)) {
        return [...keyframes.slice(0, -1), { ...last, opacity: 1 }];
      }
      return keyframes;
    }
    const opacity = keyframes?.opacity;
    if (Array.isArray(opacity) && opacity.length >= 2 && (opacity.at(-1) === "" || opacity.at(-1) == null)) {
      return { ...keyframes, opacity: [...opacity.slice(0, -1), 1] };
    }
    return keyframes;
  }

  // Pinned tabs tucked away and no longer showing a tab: Zen pushed the list up by the
  // shrinking folder's height too, so the separator shot out of sight and snapped back
  // to -4px. Zen's push is made to end there, the separator travelling to its place.
  function settleTuckedPins(element, keyframes) {
    const pins = window.gZenWorkspaces?.activeWorkspaceElement?.collapsiblePins;
    if (!pins || element !== pins.groupStartElement || !pins.collapsed || pins.hasAttribute("has-active")) {
      return keyframes;
    }
    // (only with folders squashed from showing one tab, held there by Zen's finished
    // animations; Zen's placeholder tab and hidden rows are always 0 high, so don't count)
    const rows = (pins.allItems || []).filter((item) => !item.hasAttribute("zen-empty-tab") && !item.hidden && getComputedStyle(item).display !== "none");
    if (!rows.some((item) => item.getBoundingClientRect().height < 1)) {
      return keyframes;
    }
    const px = (v) => parseFloat(v);
    const target = -4;
    // each margin moved so the last lands on the target, or null where it can't
    const rescaled = (values) => {
      const from = px(values[0]);
      const to = px(values.at(-1));
      if (!Number.isFinite(from) || !Number.isFinite(to) || to >= target || from === to) {
        return null;
      }
      const scale = (target - from) / (to - from);
      return values.map((v) => (Number.isFinite(px(v)) ? `${from + (px(v) - from) * scale}px` : null));
    };
    if (Array.isArray(keyframes) && keyframes.length >= 2) {
      const margins = rescaled(keyframes.map((frame) => frame?.marginTop));
      return margins ? keyframes.map((frame, i) => (margins[i] === null ? frame : { ...frame, marginTop: margins[i] })) : keyframes;
    }
    const list = keyframes?.marginTop;
    if (Array.isArray(list) && list.length >= 2) {
      const margins = rescaled(list);
      return margins ? { ...keyframes, marginTop: margins.map((v, i) => v ?? list[i]) } : keyframes;
    }
    return keyframes;
  }

  function addFolderBounce() {
    const animate = Element.prototype.animate;
    if (animate.__zia) {
      return;
    }
    const patched = function (keyframes, options) {
      try {
        keyframes = fadeBackIn(this, keyframes);
        keyframes = settleTuckedPins(this, keyframes);
      } catch (err) {
        noteError("folder bounce: fade back in", err);
      }
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
      if (spring.closing && !spring.plain) {
        bounceUpAfterClosing(this.parentElement, animate);
      }
      let margin = null;
      try {
        margin = holdFolderContents(this, spring, animate);
      } catch (err) {
        noteError("folder bounce: hold contents", err);
      }
      return animate.call(this, margin || spring.keyframes, spring.options);
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
      const trimmed = original.call(this, url);
      return typeof trimmed === "string" ? plainAddress(trimmed) : trimmed;
    };
    wrapped.__zia = true;
    gURLBar._zenTrimURL = wrapped;
    try {
      gURLBar.setURI();
    } catch (err) {
      noteError("tab animations and folder bounce: hideWwwInUrlbar", err);
    }
  }

  // A collapsed space keeps the names of folders its open tab is in
  // (06-folders-and-sidebar.css), from collapsing until it has finished opening.
  const SPACE_OPEN_MS = 700;

  // A closed folder showing its selected tab keeps the other tabs see-through. When Zen
  // stops showing the tab (unloaded, or a tab chosen elsewhere), they showed piled on one
  // row as it shut: the folder keeps its layout while they fade, then shrinks shut.
  function keepTabsHiddenAfterActiveLeaves() {
    const tabs = gBrowser.tabContainer;
    if (!tabs) {
      return;
    }
    // (which tab it shows, and which folders in it keep their names: Zen
    // may clear its own marks for them as it lets go)
    const unmark = (folder) => {
      for (const el of folder.querySelectorAll("[zia-kept-tab], [zia-keeps-name]")) {
        el.removeAttribute("zia-kept-tab");
        el.removeAttribute("zia-keeps-name");
      }
    };
    const mark = (folder) => {
      unmark(folder);
      for (const tab of folder.querySelectorAll('.tabbrowser-tab:is([selected], [folder-active="true"])')) {
        tab.setAttribute("zia-kept-tab", "true");
        for (let el = tab.parentElement?.closest(FOLDER_SELECTOR); el && el !== folder; el = el.parentElement?.closest(FOLDER_SELECTOR)) {
          el.setAttribute("zia-keeps-name", "true");
        }
      }
    };
    const clear = (folder) => {
      clearTimeout(folder.ziaWasActiveTimer);
      folder.removeAttribute("zia-was-active");
      unmark(folder);
    };
    // Faded out, the folder lets go of them: Zen had already pulled them
    // out of sight, all at once, and the folder's box shrinks to match
    const settle = (folder) => {
      const container = folder.groupContainer;
      const before = container?.getBoundingClientRect().height ?? 0;
      clear(folder);
      if (!container || container.ziaHold || !folder.hasAttribute("collapsed")) {
        return;
      }
      const after = container.getBoundingClientRect().height;
      if (before - after < 0.5) {
        return;
      }
      animateFolderHeight(container, before, after, { duration: 220, easing: "cubic-bezier(0.42, 0, 0.58, 1)" });
    };
    new MutationObserver((records) => {
      for (const { target, oldValue } of records) {
        if (!isFolder(target)) {
          continue;
        }
        if (target.hasAttribute("has-active")) {
          if (target.hasAttribute("collapsed")) {
            clear(target);
            mark(target);
          }
          continue;
        }
        if (oldValue === null || !target.hasAttribute("collapsed")) {
          // (opening, the names stay while it does: gone at once, the tab
          // under one jumped up and back down)
          if (!target.hasAttribute("zia-revealing")) {
            unmark(target);
          }
          continue;
        }
        target.setAttribute("zia-was-active", "true");
        clearTimeout(target.ziaWasActiveTimer);
        target.ziaWasActiveTimer = setTimeout(() => settle(target), 170);
      }
    }).observe(tabs, { subtree: true, attributes: true, attributeFilter: ["has-active"], attributeOldValue: true });
    window.addEventListener(
      "TabGroupExpand",
      (event) => {
        const folder = event.target;
        if (folder?.hasAttribute?.("zia-was-active")) {
          clear(folder);
        }
        // Opening a folder that showed just its open tab, it's marked for a
        // moment, so the inner folder names it kept stay while it opens
        if (isFolder(folder) && folder.hasAttribute("has-active")) {
          folder.setAttribute("zia-revealing", "true");
          clearTimeout(folder.ziaRevealTimer);
          folder.ziaRevealTimer = setTimeout(() => {
            folder.removeAttribute("zia-revealing");
            if (!folder.hasAttribute("has-active")) {
              unmark(folder);
            }
          }, 500);
        }
      },
      true
    );
  }

  // Clicking a kept inner folder name opened it with everything round it still hidden,
  // so nothing showed: the folders it's in open too.
  function openKeptFolderNames() {
    window.addEventListener(
      "click",
      (event) => {
        if (event.button !== 0) {
          return;
        }
        const label = event.target?.closest?.(".tab-group-label-container");
        const folder = label?.parentElement;
        if (!isFolder(folder) || !folder.hasAttribute("collapsed") || !folder.querySelector('.tabbrowser-tab:is([selected], [folder-active="true"])')) {
          return;
        }
        if (event.target.closest(".tab-group-label-container toolbarbutton, .tab-close-button, .tab-reset-button, [anonid], button")) {
          return;
        }
        const outer = [];
        for (let el = folder.parentElement?.closest(FOLDER_SELECTOR); el; el = el.parentElement?.closest(FOLDER_SELECTOR)) {
          if (el.hasAttribute("collapsed")) {
            outer.unshift(el);
          }
        }
        if (!outer.length) {
          return;
        }
        event.stopPropagation();
        event.preventDefault();
        // One at a time, outermost first: asked to open while the folder
        // round it was still opening, Zen let it be
        const openNext = (list) => {
          const el = list.shift();
          if (!el) {
            return;
          }
          el.collapsed = false;
          requestAnimationFrame(() => {
            const moving = [el.groupStartElement, el.groupContainer]
              .filter(Boolean)
              .flatMap((node) => node.getAnimations());
            Promise.all(moving.map((a) => a.finished.catch(() => {}))).then(() => openNext(list));
          });
        };
        openNext([...outer, folder]);
      },
      true
    );
  }

  // Pinned tabs tucked away keep showing the open tab among them, as a closed folder
  // does. Once a tab outside is chosen they all shut at the name's speed, and folders
  // that were showing the tab are closed properly once out of sight.
  function tuckAwayUnopenedPins() {
    gBrowser.tabContainer.addEventListener("TabSelect", async (event) => {
      const tab = event.target;
      if (!tab || (tab.pinned && !tab.hasAttribute("zen-essential"))) {
        return;
      }
      const pins = window.gZenWorkspaces?.activeWorkspaceElement?.collapsiblePins;
      const zen = window.gZenFolders;
      if (!zen || !pins?.collapsed || !pins.hasAttribute("has-active") || pins.contains(tab)) {
        return;
      }
      try {
        // As its "-" does (the tab left open): the tab shown goes, its folder
        // and the pinned tabs shutting round it together
        const shown = [...(pins.groupContainer?.querySelectorAll?.(".tabbrowser-tab[folder-active]") || [])];
        if (shown.length && zen.animateUnload) {
          await Promise.all(
            shown.map((one) => {
              const folder = one.group?.hasAttribute("split-view-group") ? one.group.group : one.group;
              return zen.animateUnload(folder || pins, one);
            })
          );
          return;
        }
        const folders = pins.childActiveGroups || [];
        pins.removeAttribute("has-active");
        pins.activeTabs = [];
        await zen.animateCollapse(pins);
        if (!pins.collapsed || pins.hasAttribute("has-active")) {
          return;
        }
        for (const folder of folders) {
          if (!folder.isConnected || !folder.hasAttribute("has-active")) {
            continue;
          }
          folder.removeAttribute("has-active");
          folder.activeTabs = [];
          for (const shown of folder.querySelectorAll("[folder-active]")) {
            shown.removeAttribute("folder-active");
            (shown.group?.hasAttribute("split-view-group") ? shown.group : shown).style.removeProperty("--zen-folder-indent");
          }
          zen.styleCleanup(folder.allItemsRecursive || folder.allItems || []);
          if (folder.collapsed) {
            folder.groupContainer?.setAttribute("hidden", "true");
            if (folder.groupStartElement) {
              folder.groupStartElement.style.marginTop = "-4px";
            }
          }
        }
      } catch (err) {
        noteError("tuck away pins", err);
      }
    });
  }

  // Pinned tabs tucked away with none shown any more: Zen measured the push while the
  // folders were still squashed, so pushed too little and the separator went with
  // them. Once Zen is done they're pushed their whole height, the separator staying.
  function keepSeparatorWhenPinsTuck() {
    const fix = (pins) => {
      if (!pins?.isConnected || !pins.collapsed || pins.hasAttribute("has-active")) {
        return;
      }
      const start = pins.groupStartElement;
      const box = pins.groupContainer;
      const sep = box?.separatorElement || box?.querySelector?.(".pinned-tabs-container-separator");
      if (!start || !box || box.hasAttribute("hidden")) {
        return;
      }
      if (start.getAnimations().some((a) => a.playState === "running")) {
        requestAnimationFrame(() => fix(pins));
        return;
      }
      const items = pins.allItems || [];
      window.gZenFolders?.styleCleanup?.(items.filter((item) => item.style.height === "0px" || item.style.opacity === "0"));
      start.style.marginTop = "0px";
      const full = box.getBoundingClientRect().height - (sep ? sep.getBoundingClientRect().height : 0);
      start.style.marginTop = `${-(full + 4)}px`;
    };
    // (the moment the list shrinks, before it's drawn: put right later, the separator
    // went and came back)
    const watched = new WeakSet();
    const watch = () => {
      const pins = window.gZenWorkspaces?.activeWorkspaceElement?.collapsiblePins;
      const box = pins?.groupContainer;
      if (!box || watched.has(box)) {
        return;
      }
      watched.add(box);
      new ResizeObserver(() => {
        const sep = box.separatorElement || box.querySelector(".pinned-tabs-container-separator");
        if (sep && sep.getBoundingClientRect().bottom <= box.getBoundingClientRect().top + 1) {
          fix(pins);
        }
      }).observe(box);
    };
    watch();
    window.addEventListener("ZenWorkspacesUIUpdate", watch);
    gBrowser.tabContainer.addEventListener("TabSelect", watch);
    new MutationObserver((records) => {
      for (const record of records) {
        const pins = record.target;
        if (pins === window.gZenWorkspaces?.activeWorkspaceElement?.collapsiblePins && record.oldValue !== null && !pins.hasAttribute("has-active")) {
          requestAnimationFrame(() => fix(pins));
        }
      }
    }).observe(document.documentElement, {
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ["has-active"],
    });
  }

  // A folder opening round an open inner folder: Zen reveals only its own rows, so
  // the inner folder's tabs stayed hidden until tidied, then snapped in.
  function revealOpenSubfolders() {
    window.addEventListener(
      "TabGroupExpand",
      (event) => {
        const folder = event.target;
        if (folder?.localName !== "zen-folder") {
          return;
        }
        for (const inner of folder.querySelectorAll("zen-folder:not([collapsed]):not([has-active])")) {
          const hidden = (inner.allItems || []).filter((item) => item.style.height === "0px" || item.style.opacity === "0");
          if (hidden.length) {
            window.gZenFolders?.styleCleanup?.(hidden);
          }
        }
      },
      true
    );
  }

  function keepFolderNamesInCollapsedSpaces() {
    const timers = new WeakMap();
    const update = (space) => {
      clearTimeout(timers.get(space));
      if (space.hasAttribute("collapsedpinnedtabs")) {
        space.setAttribute("zia-keep-folder-names", "true");
        return;
      }
      if (space.hasAttribute("zia-keep-folder-names")) {
        timers.set(space, setTimeout(() => {
          if (!space.hasAttribute("collapsedpinnedtabs")) {
            space.removeAttribute("zia-keep-folder-names");
          }
        }, SPACE_OPEN_MS));
      }
    };
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.target.localName === "zen-workspace") {
          update(record.target);
        }
      }
    }).observe(document.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: ["collapsedpinnedtabs"],
    });
    for (const space of document.querySelectorAll("zen-workspace[collapsedpinnedtabs]")) {
      update(space);
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
      for (const name of ["--zia-tab-right-fix", "--zia-folder-right-fix", "--zia-folder-left-fix"]) {
        root.style.removeProperty(name);
      }
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
    // (a tab still opening is measured once it's in place: measured as it
    // came in, the tabs kept a wrong right edge until the sidebar was
    // resized)
    if (tab && (isSliding(tab) || tab.getAnimations().length) && edgeRetries < EDGE_MAX_RETRIES) {
      retryEdgeAlignSoon();
      return;
    }
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
    for (const type of ["TabOpen", "TabClose"]) {
      gBrowser.tabContainer.addEventListener(type, () => scheduleEdgeAlignAfterSwitch());
    }
    const onSpaceSwitch = () => scheduleEdgeAlignAfterSwitch();
    for (const type of ["TabGroupExpand", "TabGroupCollapse", "TabGrouped", "TabUngrouped"]) {
      window.addEventListener(type, onSpaceSwitch);
    }
    watchPrefs("zen.workspaces.active", onSpaceSwitch);
    window.addEventListener("ZenWorkspacesUIUpdate", onSpaceSwitch);
    scheduleEdgeAlign();
    setTimeout(scheduleEdgeAlign, 600);
    setTimeout(scheduleEdgeAlign, 2000);
  }

  // No scrollbar down the tab list: Zen gives each space's list its own
  // (shown once it overflows), inside its scroll box, where the stylesheet's
  // "no scrollbars" didn't reach. Set on the scroll box itself, for every
  // space, including ones made later.
  function hideTabListScrollbars() {
    const toolbox = document.getElementById("navigator-toolbox");
    if (!toolbox) {
      return;
    }
    const apply = () => {
      for (const box of document.querySelectorAll("zen-workspace arrowscrollbox, #tabbrowser-arrowscrollbox")) {
        const inner = box.scrollbox || box.shadowRoot?.querySelector('[part~="scrollbox"]');
        if (inner && inner.style.getPropertyValue("scrollbar-width") !== "none") {
          inner.style.setProperty("scrollbar-width", "none", "important");
        }
      }
    };
    let frame = null;
    new MutationObserver(() => {
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = null;
          apply();
        });
      }
    }).observe(toolbox, { childList: true, subtree: true });
    apply();
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

  // the image's pixels at size by size, or null
  function readPixels(url, size) {
    return new Promise((resolve) => {
      if (!url) {
        resolve(null);
        return;
      }
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElementNS(XHTML_NS, "canvas");
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(img, 0, 0, size, size);
          resolve(ctx.getImageData(0, 0, size, size).data);
        } catch (err) {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  async function readArtColors(url) {
    const size = 24;
    const data = await readPixels(url, size);
    if (!data) {
      return null;
    }
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
    const colors = halves.map((h) => (h[3] ? boost([h[0] / h[3], h[1] / h[3], h[2] / h[3]]) : null));
    if (!colors[0] && !colors[1]) {
      return null;
    }
    const a = colors[0] || colors[1];
    const b = colors[1] || colors[0];
    return [`rgb(${a.join(", ")})`, `rgb(${b.join(", ")})`];
  }

  async function cachedArtColors(url) {
    if (!mediaColorCache.has(url)) {
      mediaColorCache.set(url, await readArtColors(url));
    }
    return mediaColorCache.get(url);
  }

  // up to three of the favicon's strongest hues, for the selected tab's glow;
  // null for grey, white and black icons (the glow stays white)
  async function readFaviconPalette(url) {
    const data = await readPixels(url, 32);
    if (!data) {
      return null;
    }
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
      return null;
    }
    const top = ranked[0][3];
    const colors = ranked
      .filter((bin) => bin[3] >= top * 0.12)
      .slice(0, 3)
      .map((bin) => bin.slice(0, 3).map((v) => Math.round(v / bin[3])));
    if (colors.length === 1) {
      const [r, g, b] = colors[0];
      colors.push([r, g, b].map((v) => Math.round(v + (255 - v) * 0.35)));
      colors.push([r, g, b].map((v) => Math.round(v * 0.7)));
    } else if (colors.length === 2) {
      colors.push(colors[0].map((v, k) => Math.round((v + colors[1][k]) / 2)));
    }
    return colors.map((c) => `rgb(${c.join(", ")})`);
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
    // a split glows left in the left tab's colours, right in the right tab's
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
    watchPrefs("zia.tabs.favicon-glow", onPref);
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

    const colors = await cachedArtColors(url);
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
  // four bars, shrinking to dots when muted
  const BAR_X = [1.6, 5.2, 8.8, 12.4];
  const BAR_W = 2;
  const BAR_REST = [
    [4.5, 7],
    [2.5, 11],
    [3.5, 9],
    [5.25, 5.5],
  ];

  // still under reduced motion, unless the "always move" option is on
  const SOUND_BARS_ALWAYS_PREF = "zia.sound-bars.always-move";
  const soundBarsAlwaysMove = () => Services.prefs.getBoolPref(SOUND_BARS_ALWAYS_PREF, false);

  // dark in light mode: white bars went missing on the white selected tab
  const plainBarInk = () => (root.hasAttribute("zia-light") ? "rgb(28, 28, 32)" : "rgb(255, 255, 255)");
  let barInkWatched = false;
  function watchBarInk() {
    if (barInkWatched) {
      return;
    }
    barInkWatched = true;
    new MutationObserver(redrawSoundBars).observe(root, { attributes: true, attributeFilter: ["zia-light"] });
  }

  function soundBarImages(colors) {
    watchBarInk();
    const always = soundBarsAlwaysMove();
    const ink = plainBarInk();
    const key = `${colors ? colors.join("|") : ink}|${always}`;
    let images = soundBarCache.get(key);
    if (images) {
      return images;
    }
    const a = colors ? lighten(colors[0]) : ink;
    const b = colors ? lighten(colors[1]) : ink;
    const gradient = `<defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="1.6" y1="0" x2="14.4" y2="0"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>`;
    const image = (style, bars) =>
      `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">${gradient}${style}<g fill="url(#g)">${bars}</g></svg>`)}`;
    const resting = BAR_X.map((x, i) => `<rect x="${x}" y="${BAR_REST[i][0]}" width="${BAR_W}" height="${BAR_REST[i][1]}" rx="1"/>`).join("");
    const wave = image(
      `<style>rect{transform-box:fill-box;transform-origin:center;animation:grow .26s cubic-bezier(.2,.9,.3,1) both,z .6s .26s ease-in-out infinite alternate}` +
        [0.55, 0.68, 0.5, 0.74].map((d, i) => `.b${i}{animation-duration:.26s,${d}s;animation-delay:0s,${(0.26 + i * 0.05).toFixed(2)}s}`).join("") +
        `@keyframes grow{from{height:2px;y:7px}to{height:11px;y:2.5px}}` +
        `@keyframes z{from{transform:scaleY(.22)}to{transform:scaleY(1)}}` +
        (always ? "" : `@media (prefers-reduced-motion:reduce){rect{animation:none;transform:scaleY(.6)}}`) +
        `</style>`,
      BAR_X.map((x, i) => `<rect class="b${i}" x="${x}" y="2.5" width="${BAR_W}" height="11" rx="1"/>`).join("")
    );
    const dots = image(
      `<style>rect{animation:shrink .28s cubic-bezier(.4,0,.2,1) forwards}@keyframes shrink{to{height:${BAR_W}px;y:${8 - BAR_W / 2}px}}` +
        (always ? "" : `@media (prefers-reduced-motion:reduce){rect{animation-duration:1ms}}`) +
        `</style>`,
      resting
    );
    images = { waveData: wave, dotsData: dots, stillData: image("", resting) };
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

  const soundBarCards = new Set();

  function paintSoundBars(card, colors) {
    soundBarCards.add(card);
    card.__ziaColors = colors;
    applyCardSoundBars(card);
    watchCardSoundState(card);
    repaintSoundTabs();
  }

  // a tab's bars are drawn before its player's colours are known: recolour them as
  // they arrive (tabs whose colours haven't changed are left alone)
  function repaintSoundTabs() {
    for (const tab of gBrowser.tabs) {
      paintTabSoundBars(tab);
    }
  }

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

  function applyTabSoundBars(tab) {
    const essential = tab.hasAttribute("zen-essential");
    const tinted = !essential && Services.prefs.getBoolPref("zia.tabs.favicon-glow", false);
    const colors = tinted ? tabMediaColors(tab) || tabFallbackColors(tab) : null;
    const key = `${colors ? colors.join("|") : plainBarInk()}|${essential}|${tab.hasAttribute("soundplaying")}|${tab.hasAttribute("muted")}|${soundBarsAlwaysMove()}`;
    if (tab.__ziaSoundKey === key) {
      return;
    }
    tab.__ziaSoundKey = key;
    const fresh = freshSoundBars(colors);
    tab.style.setProperty("--zia-sound-wave", fresh.wave);
    tab.style.setProperty("--zia-sound-muted", fresh.dots);
  }

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

  // every playing tab and player redrawn
  function redrawSoundBars() {
    repaintSoundTabs();
    for (const card of soundBarCards) {
      if (!card.isConnected) {
        soundBarCards.delete(card);
        continue;
      }
      try {
        applyCardSoundBars(card);
      } catch (err) {
        noteError("music and sound bars: redraw", err);
      }
    }
  }

  function watchTabSoundBars() {
    watchPrefs(SOUND_BARS_ALWAYS_PREF, redrawSoundBars);
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
    repaintSoundTabs();
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
    // starts top middle and runs clockwise, as progress reads; round where this
    // Firefox can't draw a squircle (as the artwork is then)
    const squircle = typeof CSS === "undefined" || CSS.supports("corner-shape", "round");
    const shape = { d: squircle ? "M23.00 1.00 L30.50 1.00 L35.98 1.09 L38.33 1.38 L40.08 1.85 L41.47 2.53 L42.59 3.41 L43.47 4.53 L44.15 5.92 L44.62 7.67 L44.91 10.02 L45.00 15.50 L45.00 30.50 L44.91 35.98 L44.62 38.33 L44.15 40.08 L43.47 41.47 L42.59 42.59 L41.47 43.47 L40.08 44.15 L38.33 44.62 L35.98 44.91 L30.50 45.00 L15.50 45.00 L10.02 44.91 L7.67 44.62 L5.92 44.15 L4.53 43.47 L3.41 42.59 L2.53 41.47 L1.85 40.08 L1.38 38.33 L1.09 35.98 L1.00 30.50 L1.00 15.50 L1.09 10.02 L1.38 7.67 L1.85 5.92 L2.53 4.53 L3.41 3.41 L4.53 2.53 L5.92 1.85 L7.67 1.38 L10.02 1.09 L15.50 1.00 L23.00 1.00 Z" : "M23 1 L35 1 A10 10 0 0 1 45 11 L45 35 A10 10 0 0 1 35 45 L11 45 A10 10 0 0 1 1 35 L1 11 A10 10 0 0 1 11 1 Z", fill: "none", "stroke-width": "2", pathLength: "100" };
    make("path", { ...shape, class: "zia-ring-track" }, svg);
    make("path", {
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
      tint = tintFromColors(await cachedArtColors(icon));
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
      .catch(() => {});
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
    return artwork.sort((x, y) => area(y) - area(x))[0]?.src || "";
  }

  // Zen hides a card while its video is in picture-in-picture, so the card's own
  // picture-in-picture button took the card away; this option keeps it
  const KEEP_WITH_PIP_PREF = "zia.media.keep-with-pip";

  function keepWithPip() {
    try {
      return Services.prefs.getBoolPref(KEEP_WITH_PIP_PREF, true);
    } catch (err) {
      return true;
    }
  }

  function keepCardsWithPip() {
    const front = window.gZenMediaController?.frontCard;
    const proto = front && Object.getPrototypeOf(front);
    const desc = proto && Object.getOwnPropertyDescriptor(proto, "shouldBeVisible");
    if (!desc?.get) {
      return false;
    }
    if (desc.get.__zia) {
      return true;
    }
    const original = desc.get;
    const patched = function () {
      try {
        // (fullscreen is Zen's to decide, as before)
        if (keepWithPip() && !this.isSharing && this.controller?.isBeingUsedInPIPModeOrFullscreen && !document.fullscreenElement && !window.fullScreen) {
          return gBrowser.selectedBrowser.browserId !== this.browser.browserId;
        }
      } catch (err) {
        noteError("music and sound bars: keepCardsWithPip", err);
      }
      return original.call(this);
    };
    patched.__zia = true;
    Object.defineProperty(proto, "shouldBeVisible", { ...desc, get: patched });

    const refreshCards = () => {
      for (const element of document.querySelectorAll("#zen-media-controls-toolbar .zen-media-card")) {
        try {
          element.__ziaCard?.refreshVisibility?.();
        } catch (err) {
          noteError("music and sound bars: keepCardsWithPip (2)", err);
        }
      }
    };
    watchPrefs(KEEP_WITH_PIP_PREF, refreshCards);
    return true;
  }

  function ziaActor(browser) {
    try {
      return browser?.browsingContext?.currentWindowGlobal?.getActor("Zia") || null;
    } catch (err) {
      return null;
    }
  }

  // Kick streams have no artwork: the channel's picture instead, asked of Kick
  // once per channel (actors/ZiaChild.sys.mjs)
  const kickAvatars = new Map();

  function kickSlug(browser) {
    try {
      const uri = browser?.currentURI;
      if (!/^(www\.)?kick\.com$/.test(uri?.host || "")) {
        return "";
      }
      const slug = uri.filePath.split("/")[1] || "";
      return /^[\w-]+$/.test(slug) ? slug.toLowerCase() : "";
    } catch (err) {
      return "";
    }
  }

  function kickAvatar(card) {
    const slug = kickSlug(card.browser);
    if (!slug) {
      return "";
    }
    if (kickAvatars.has(slug)) {
      return kickAvatars.get(slug) || "";
    }
    kickAvatars.set(slug, null);
    const actor = ziaActor(card.browser);
    if (!actor) {
      kickAvatars.delete(slug);
      return "";
    }
    try {
      actor
        .sendQuery("Zia:KickAvatar", { slug })
        .then((pic) => {
          kickAvatars.set(slug, pic || "");
          if (pic && kickSlug(card.browser) === slug) {
            card.updateIcon();
          }
        })
        .catch(() => kickAvatars.delete(slug));
    } catch (err) {
      kickAvatars.delete(slug);
    }
    return "";
  }

  // optional: a YouTube video shows its channel's picture, asked again a few
  // times while the page is still putting it up
  const YOUTUBE_AVATAR_PREF = "zia.media.youtube-channel-art";
  const youTubeAvatars = new Map();

  function youTubeVideo(browser) {
    try {
      const uri = browser?.currentURI;
      if (!/^(www\.|m\.)?youtube\.com$/.test(uri?.host || "")) {
        return "";
      }
      const url = new URL(uri.spec);
      const id = url.searchParams.get("v") || url.pathname.match(/^\/(?:shorts|live)\/([\w-]+)/)?.[1] || "";
      return /^[\w-]+$/.test(id) ? id : "";
    } catch (err) {
      return "";
    }
  }

  function youTubeAvatar(card) {
    try {
      if (!Services.prefs.getBoolPref(YOUTUBE_AVATAR_PREF, false)) {
        return "";
      }
    } catch (err) {
      return "";
    }
    const video = youTubeVideo(card.browser);
    if (!video) {
      return "";
    }
    const known = youTubeAvatars.get(video);
    if (known?.pic || known?.asking) {
      return known.pic || "";
    }
    const tries = (known?.tries || 0) + 1;
    if (tries > 6) {
      return "";
    }
    const actor = ziaActor(card.browser);
    if (!actor) {
      return "";
    }
    youTubeAvatars.set(video, { asking: true, tries });
    actor
      .sendQuery("Zia:YouTubeAvatar", {})
      .then((pic) => {
        youTubeAvatars.set(video, { pic: pic || "", tries });
        if (youTubeVideo(card.browser) !== video) {
          return;
        }
        if (pic) {
          card.updateIcon();
        } else {
          setTimeout(() => {
            if (youTubeVideo(card.browser) === video) {
              card.updateIcon();
            }
          }, 1500);
        }
      })
      .catch(() => youTubeAvatars.set(video, { tries }));
    return "";
  }

  // A YouTube live stream reports a position and length, so Zen showed a jumping
  // progress line: YouTube's player is asked, and the card shows LIVE instead.
  const youTubeLiveChecked = new WeakMap();

  function markLiveStream(card) {
    const element = card.element;
    const browser = card.browser;
    if (!element || !browser) {
      return;
    }
    let host = "";
    try {
      host = browser.currentURI?.host || "";
    } catch (err) {
      host = "";
    }
    // a Kick channel's page is live; its player reports a few seconds at a time,
    // which looped the progress line every three seconds
    if (/^(www\.)?kick\.com$/.test(host)) {
      let path = "";
      try {
        path = browser.currentURI.filePath;
      } catch (err) {
        path = "";
      }
      element.toggleAttribute("zia-live", /^\/[\w-]+\/?$/.test(path));
      return;
    }
    if (!/(^|\.)youtube\.com$/.test(host)) {
      element.removeAttribute("zia-live");
      return;
    }
    const spec = browser.currentURI.spec;
    const last = youTubeLiveChecked.get(element);
    if (last && last.spec === spec && Date.now() - last.at < 10000) {
      return;
    }
    youTubeLiveChecked.set(element, { spec, at: Date.now() });
    ziaActor(browser)
      ?.sendQuery("Zia:YouTubeLive", {})
      .then((live) => {
        if (card.browser?.currentURI?.spec === spec) {
          element.toggleAttribute("zia-live", !!live);
        }
      })
      .catch(() => {});
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
          markLiveStream(this);
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
    // Zen drops a card if setting it up throws, so nothing here may throw: a slip
    // over a Kick stream's picture had left Kick with no card at all
    const patched = function () {
      original.call(this);
      try {
        dressCardIcon(this);
      } catch (err) {
        noteError("music and sound bars: updateIcon", err);
      }
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

  function dressCardIcon(card) {
    if (card.element && card.element.__ziaCard !== card) {
      card.element.__ziaCard = card;
      repaintSoundTabs();
    }
    const button = card.focusButton;
    let art = "";
    try {
      art = bestArtwork(card.controller?.getMetadata?.()?.artwork);
    } catch (err) {
      noteError("music and sound bars: useMediaArtwork (2)", err);
    }
    art = youTubeAvatar(card) || art;
    if (!art) {
      art = kickAvatar(card);
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
    showFaviconTile(card, button, art);
  }

  function watchMediaGlow() {
    const toolbar = document.getElementById("zen-media-controls-toolbar");
    if (!toolbar) {
      return;
    }
    let frame = null;
    let artworkReady = false;
    let keptWithPip = false;
    const refresh = () => {
      frame = null;
      if (!artworkReady) {
        artworkReady = useMediaArtwork();
      }
      if (!keptWithPip) {
        keptWithPip = keepCardsWithPip();
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

  // Zen drops a card if asking its media's position fails, and Kick's live player
  // never answers, so since Zen 1.23 Kick had no card. An active controller with
  // no position now answers an endless one (no progress line, as for any live
  // stream), and tabs already playing are offered to Zen again.
  function cardForPositionlessMedia() {
    // on the controller's own type: the one this window knows by name isn't it
    const answerPosition = (controller) => {
      const proto = controller && Object.getPrototypeOf(controller);
      const own = proto?.getPositionState;
      if (typeof own !== "function" || own.__zia) {
        return;
      }
      const patched = function () {
        try {
          return own.call(this);
        } catch (err) {
          if (!this.isActive) {
            throw err;
          }
          // an endless length: Zen hides the progress line and the card reads LIVE
          return { duration: Infinity, playbackRate: 1, position: 0 };
        }
      };
      patched.__zia = true;
      Object.defineProperty(proto, "getPositionState", { value: patched, writable: true, configurable: true, enumerable: true });
    };

    const manager = window.gZenMediaController;
    if (!manager || typeof manager.activateMediaControls !== "function" || manager.activateMediaControls.__zia) {
      return;
    }
    const original = manager.activateMediaControls;
    const activate = function (controller, browser) {
      try {
        answerPosition(controller);
      } catch (err) {
        noteError("music and sound bars: answerPosition", err);
      }
      return original.call(this, controller, browser);
    };
    activate.__zia = true;
    manager.activateMediaControls = activate;

    for (const tab of gBrowser.tabs) {
      if (!tab.hasAttribute("soundplaying")) {
        continue;
      }
      try {
        manager.activateMediaControls(tab.linkedBrowser.browsingContext?.mediaController, tab.linkedBrowser);
      } catch (err) {
        noteError("music and sound bars: cardForPositionlessMedia", err);
      }
    }
  }

  // A card dragged out of the sidebar like a toolbar button broke Zen's player
  // until restart, and nothing on it uses drags, so no drag starts there.
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
    // (a folder dragged is its name, not a tab: it can't be split; the tabs
    // in one still can)
    if (!gBrowser.isTab?.(tab)) {
      return false;
    }
    if (tab.hasAttribute("zen-live-folder-item-id")) {
      return false;
    }
    // A tab that's already in a split (or a split essential) can't be split
    // again: the cards came up for one, and dropping it there broke things
    if (tab.splitView || tab.group?.hasAttribute?.("split-view-group") || tab.ziaSplit?.id || tab.hasAttribute("zia-split-tile")) {
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
    const zone = document.createElementNS(XHTML_NS, "div");
    zone.className = "zia-split-zone";
    zone.setAttribute("side", side);
    const inner = document.createElementNS(XHTML_NS, "div");
    inner.className = "zia-split-zone-inner";
    const icon = document.createElementNS(XHTML_NS, "div");
    icon.className = "zia-split-zone-icon";
    const label = document.createElementNS(XHTML_NS, "div");
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
    const overlay = document.createElementNS(XHTML_NS, "div");
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
    root.appendChild(overlay);
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
        blankDragImage = document.createElementNS(XHTML_NS, "canvas");
        blankDragImage.id = "zia-split-blank-drag-image";
        blankDragImage.width = 32;
        blankDragImage.height = 32;
        blankDragImage.getContext("2d").clearRect(0, 0, 32, 32);
        root.appendChild(blankDragImage);
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
    const canvas = splitDrop.thumb || document.createElementNS(XHTML_NS, "canvas");
    canvas.id = "zia-split-drag-picture";
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    if (!canvas.isConnected) {
      root.appendChild(canvas);
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
      // the new tab page as it is (the search page, an extension's, Zen's)
      const url = searchHomeUrl && newTabSearchEnabled() ? searchHomeUrl : currentNewTabUrl();
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

  const pointIn = (box, event) => event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;

  function isOverPage(event) {
    return pointIn(gBrowser.tabbox.getBoundingClientRect(), event) && !isOverCollapsedSidebar(event);
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
    return box.right > 0 && pointIn(box, event);
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

  // Find opens empty, as in Dia, rather than with the last search in it.
  // (Text selected on the page still fills it in: Firefox does that just
  // after this.)
  function clearFindBarOnOpen(event) {
    const findbar = event.target;
    if (findbar?.localName !== "findbar") {
      return;
    }
    // (not findbar.clear(): that collapses the page's selection too, which
    // Firefox is about to read)
    try {
      const field = findbar._findField;
      if (field?.value) {
        field.value = "";
        field.editor?.clearUndoRedo();
        findbar._updateStatusUI?.();
        findbar._enableFindButtons?.(false);
      }
    } catch (err) {
      noteError("find bar: clearFindBarOnOpen", err);
    }
  }

  // On macOS Firefox fills a find bar that opens with nothing selected from
  // the system's shared find clipboard, the last search made anywhere: so it
  // reopened with that search in it. Opened with nothing selected, it starts
  // empty; text selected on the page still fills it in.
  function skipClipboardPrefill(findbar) {
    if (!findbar || findbar.__ziaNoClipboardPrefill || typeof findbar.onCurrentSelection !== "function") {
      return;
    }
    findbar.__ziaNoClipboardPrefill = true;
    const original = findbar.onCurrentSelection;
    findbar.onCurrentSelection = function (selectionString, isInitialSelection) {
      if (!isInitialSelection || selectionString) {
        return original.call(this, selectionString, isInitialSelection);
      }
      // Firefox's own steps for an empty opening, minus the clipboard
      try {
        if (!this._startFindDeferred) {
          return undefined;
        }
        this._findField.value = "";
        this._enableFindButtons(false);
        this._findField.select();
        this._findField.focus();
        this._startFindDeferred.resolve();
        this._startFindDeferred = null;
        return undefined;
      } catch (err) {
        noteError("find bar: skipClipboardPrefill", err);
        return original.call(this, selectionString, isInitialSelection);
      }
    };
  }

  function dressFindBar(findbar) {
    shortenFindCount(findbar);
    skipClipboardPrefill(findbar);
  }

  function watchFindBars() {
    window.addEventListener("findbaropen", clearFindBarOnOpen, true);
    gBrowser.tabContainer.addEventListener("TabFindInitialized", (event) => {
      dressFindBar(gBrowser.getCachedFindBar?.(event.target));
    });
    for (const tab of gBrowser.tabs) {
      if (gBrowser.isFindBarInitialized?.(tab)) {
        dressFindBar(gBrowser.getCachedFindBar(tab));
      }
    }
  }

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
    const button = document.createElementNS(XHTML_NS, "button");
    button.className = `zia-pane-button zia-pane-${name}`;
    button.setAttribute("title", label);
    button.setAttribute("aria-label", label);
    const img = document.createElementNS(XHTML_NS, "img");
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
    const bar = document.createElementNS(XHTML_NS, "div");
    bar.className = "zia-pane-bar";
    const tabOf = () => gBrowser.getTabForBrowser(paneBrowser(container));
    const selectPane = () => {
      const tab = tabOf();
      if (tab && gBrowser.selectedTab !== tab) {
        gBrowser.selectedTab = tab;
      }
    };

    bar.addEventListener("mousedown", selectPane);
    // (Zen's own sidebar button sits in the toolbar a split hides, and a
    // hidden button's doCommand does nothing: this goes to Zen's command)
    bar.appendChild(paneButton("sidebar", "Toggle sidebar", () => document.getElementById("cmd_zenCompactModeToggle")?.doCommand()));
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

    const address = document.createElementNS(XHTML_NS, "div");
    address.className = "zia-pane-address";
    const host = document.createElementNS(XHTML_NS, "span");
    host.className = "zia-pane-host";
    const rest = document.createElementNS(XHTML_NS, "span");
    rest.className = "zia-pane-rest";
    address.append(host, rest);
    address.addEventListener("click", () => {
      selectPane();
      requestAnimationFrame(() => {
        placeOpenedAddressBar();
        document.getElementById("Browser:OpenLocation").doCommand();
      });
    });
    bar.appendChild(address);

    const extensions = document.createElementNS(XHTML_NS, "div");
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
        selectPane();
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
    let isHomePage = false;
    try {
      const uri = browser.currentURI;
      if (!isMultiviewURI(uri)) {
        host = /^https?$/.test(uri.scheme) ? uri.displayHost.replace(/^www\./, "") : uri.spec !== "about:blank" ? uri.spec : "";
      }
      isHomePage = (uri.filePath === "/" || uri.filePath === "") && !uri.query && !uri.ref;
    } catch (err) {
      // (no address yet, or one without a host or path)
    }
    const title = (browser.contentTitle || tab?.label || "").trim();
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

    const { STATE_START, STATE_STOP, STATE_IS_WINDOW } = Ci.nsIWebProgressListener;
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
        if (stateFlags & STATE_START && stateFlags & STATE_IS_WINDOW) {
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
    watchPrefs("zen.workspaces.active", schedule);
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
      const tile = tab?.querySelector?.(".tab-stack") || tab;
      if (tile?.style) {
        tile.style.opacity = "0";
      }

      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
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
  const undoState = { closedAt: 0, closed: [] };

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
    let folder = tab.group;
    if (folder?.hasAttribute("split-view-group")) {
      const data = window.gZenViewSplitter?._data?.find((entry) => entry.tabs?.includes(tab));
      record.split = { key: folder.id || "split", gridType: data?.gridType };
      folder = folder.group;
    }
    if (folder?.isZenFolder) {
      record.folder = { id: folder.id, label: folder.label, workspaceId: folder.getAttribute("zen-workspace-id") || undefined };
    }
    return record;
  }

  // Firefox's own "reopen closed tab" brings back everything one close action
  // took away (a whole folder, a split, several tabs at once), not just one tab.
  function reopenLastClose() {
    // folders coming back keep their names (zia.uc.js, folder names)
    window.ziaReopeningUntil = Date.now() + 3000;
    try {
      window.undoCloseTab();
    } catch (err) {
      noteError("essentials and undo: reopenLastClose", err);
    }
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

  // Every tab that just closed comes back: first as Cmd/Ctrl+Shift+T does
  // (all one close took away), then one at a time until they're all back.
  // (Counting closes by when they happened, several tabs closed together
  // were sometimes taken for one close, sometimes for several, as Zen
  // closes them a moment apart, and only some came back.)
  function undoClosedTabs() {
    const closed = undoState.closed;
    const wanted = Math.max(1, closed.length);
    undoState.closed = [];
    undoState.closedAt = 0;

    const opened = [];
    const onOpen = (event) => opened.push(event.target);
    gBrowser.tabContainer.addEventListener("TabOpen", onOpen);
    try {
      reopenLastClose();
      for (let i = 0; opened.length < wanted && i < wanted; i++) {
        const before = opened.length;
        try {
          window.ziaReopeningUntil = Date.now() + 3000;
          window.SessionStore?.undoCloseTab?.(window, 0);
        } catch (err) {
          noteError("essentials and undo: reopen one", err);
          break;
        }
        if (opened.length === before) {
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
        undoState.closed = [];
      }
      undoState.closedAt = now;
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
    setStyle(urlbar, "--zia-typed-icon", value || null);
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
    // Not in a keyword search: its pill pushes the text along, and lining
    // the text up with the rows then shrank the gap after the icon to
    // nothing, there and everywhere after it (2.96.22)
    if (urlbar.hasAttribute("searchmode")) {
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
    const gapError = titleRect.left - textLeft - iconError;

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

  // The pop-up's bottom edge. Its background is scaled up from 0.8 (from the
  // top) as the pop-up opens, so measured mid-way its bottom read short and
  // the fit came out wrong: its top and unscaled height don't move.
  function popUpBottom(background) {
    return background.getBoundingClientRect().top + background.offsetHeight;
  }

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
    popBottomTrim ??= parseFloat(getComputedStyle(urlbar).getPropertyValue("--zia-pop-bottom-trim")) || 0;
    const scroller = [view, ...view.querySelectorAll("*")].find((el) => el.scrollHeight > el.clientHeight + 1);
    if (scroller) {
      root.setAttribute("zia-pop-scrolls", "true");
      // A list that scrolls is cut off at the pop-up's edge, and how far down
      // that falls is up to Zen (it changed with Zen 1.23). Trimmed by a set
      // amount, the last whole row could end well above the edge, or the next
      // one start just short of it. The pop-up ends instead under the last
      // row that fits whole, at rest, with the same gap as at the sides; the
      // space added at the list's end (the trim again) gives the last row the
      // same gap once it's scrolled to.
      const trim = popBottomTrim;
      const untrimmed = popUpBottom(background) + trim;
      let end = null;
      for (const row of rows) {
        const box = row.getBoundingClientRect();
        // (where it sits with the list scrolled to the top)
        const bottom = box.bottom + scroller.scrollTop + POP_BOTTOM_WANT;
        if (box.height && bottom <= untrimmed + 0.5) {
          end = Math.max(end ?? bottom, bottom);
        }
      }
      const want = end === null ? POP_SCROLL_TRIM : Math.max(0, untrimmed - end);
      if (Math.abs(want - trim) > 0.3) {
        popBottomTrim = want;
        urlbar.style.setProperty("--zia-pop-bottom-trim", `${want}px`);
        if (passesLeft > 0) {
          requestAnimationFrame(() => fitPopoverBottom(passesLeft - 1));
        }
      }
      return;
    }
    root.removeAttribute("zia-pop-scrolls");
    const error = popUpBottom(background) - last.getBoundingClientRect().bottom - POP_BOTTOM_WANT;
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
    // answers in the address bar: maths, and units and time zones (Firefox's own)
    set("browser.urlbar.suggest.calculator", true);
    set("browser.urlbar.unitConversion.enabled", true);
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
    // Ultra's effects, on unless switched off (the stylesheet reads it too)
    set("zia.ultra", true);
    // Downloads a model the first time, so it's something to opt into
    set("zia.features.folder-icon-suggest", false);

    for (const name of ZIA_OPTIONS) {
      set(name, true);
    }
    set("zia.tabs.favicon-glow", false);
    set("zia.swipe.dia-arrow", true);
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
    // Zen 1.23 turned its see-through "acrylic" sidebar on for everyone, under Zia's own:
    // off once for anyone who hadn't chosen it (from the next start; zen.theme.acrylic-elements).
    try {
      if (!Services.prefs.getBoolPref("zia.acrylic-reset", false)) {
        if (!Services.prefs.prefHasUserValue("zen.theme.acrylic-elements")) {
          Services.prefs.setBoolPref("zen.theme.acrylic-elements", false);
        }
        Services.prefs.setBoolPref("zia.acrylic-reset", true);
      }
    } catch (err) {
      noteError("zen defaults: acrylic", err);
    }
    set("zia.urlbar.zia-look", true);
    set("zia.glass", false);
    // 2.95.11's "Zen's own address bar" is now "Zia's address bar", the other
    // way round, as the other options are: anyone who'd turned Zen's on
    // keeps it
    try {
      if (Services.prefs.getBoolPref("zia.urlbar.zen-look", false)) {
        Services.prefs.setBoolPref("zia.urlbar.zia-look", false);
      }
      Services.prefs.clearUserPref("zia.urlbar.zen-look");
    } catch (err) {
      noteError("zen defaults: address bar look", err);
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

  // (a Map: the kind comes from the page's address, and "constructor" isn't a site)
  const MULTIVIEW_SITES = new Map([["yt", "YouTube"], ["twv", "Twitch video"], ["twc", "Twitch clip"], ["vm", "Vimeo"], ["dm", "Dailymotion"]]);

  function multiviewSite([kind, id]) {
    if (kind === "tw" || kind === "kick") {
      return `${kind === "tw" ? "twitch.tv" : "kick.com"}/${id}`;
    }
    if (MULTIVIEW_SITES.has(kind)) {
      return MULTIVIEW_SITES.get(kind);
    }
    try {
      return new URL(id).hostname.replace(/^www\./, "");
    } catch (err) {
      return "Video";
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
    watchPrefs(MULTIVIEW_COLOR_PREF, () => gBrowser.tabs.forEach(recolorMultiview));
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
    watchPrefs(URLBAR_POSITION_PREF, apply);
  }

  // Options in Sine's settings that are on by default (the rest are set
  // one by one in applyZenDefaults), and the ones watched as they change.
  const ZIA_OPTIONS = [
    "zia.urlbar.dia-style",
    "zia.newtab.real-tab",
    "zia.tabs.sound-bars",
    "zia.toolbar.site-color",
    "zia.split.drop-cards",
    "zia.page.rounding",
  ];
  const WATCHED_OPTIONS = ["zia.urlbar.zia-look", "zia.urlbar.dia-style", "zia.newtab.real-tab", "zia.toolbar.site-color", "zia.split.drop-cards"];

  function watchOptions() {
    const urlbar = gURLBar?.textbox || document.getElementById("urlbar");
    const apply = () => {
      // (Zen's own address bar takes Zen's pop-up with it)
      urlbar?.toggleAttribute(
        "zia-classic",
        !Services.prefs.getBoolPref("zia.urlbar.dia-style", true) || !Services.prefs.getBoolPref("zia.urlbar.zia-look", true)
      );
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
    watchPrefs(WATCHED_OPTIONS, onChange);
  }

  const FEATURES = ["media-player", "find-bar", "icon-picker", "undo-close", "folder-icon-suggest", "tab-hover-cards", "tab-numbers"];

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

    const seen = new Set();
    const keep = (download) => {
      seen.add(download);
      update(seen);
    };
    commons.getData(window).addView({
      onDownloadAdded: keep,
      onDownloadChanged: keep,
      onDownloadRemoved(download) {
        seen.delete(download);
        update(seen);
      },
    });
  }

  // With the downloads button hidden until there's a download (Firefox's
  // "auto-hide"), the first download's arc flew to the corner and dropped
  // a square there: Zen looks for the button before Firefox has shown it.
  // The button is shown first, and the arc waits a frame for it to land.
  function flyFirstDownloadToButton() {
    customElements.whenDefined("zen-download-animation").then(() => {
      const proto = customElements.get("zen-download-animation")?.prototype;
      const original = proto?.initializeAnimation;
      if (typeof original !== "function" || original.__zia) {
        return;
      }
      const patched = async function (...args) {
        // (Zia's own flight, a row with the file's icon and name, flyDownloadRows)
        if (downloadFlightOn && flightTarget()) {
          return undefined;
        }
        const button = document.getElementById("downloads-button");
        if (button?.hidden) {
          try {
            window.DownloadsButton?.unhide?.();
          } catch (err) {
            noteError("downloads: unhide", err);
          }
          button.hidden = false;
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        }
        return original.apply(this, args);
      };
      patched.__zia = true;
      proto.initializeAnimation = patched;
    }, () => {});
  }

  // ---------- A download flies to the Library button as a row, as in Dia
  // Zen sends a plain circle from where you clicked to the Library button.
  // In its place, as Dia does it (measured frame by frame): a small row
  // with the file's icon and name pops up just under where you clicked,
  // winds up for a moment (drifting away from the Library button and
  // tilting a few degrees, as a thing about to be thrown), then is flung
  // along a shallow curve to the button, levelling out, shrinking and
  // fading as it gets there; the button gives a nudge as it lands. While
  // it flies the window dims, a faint glow trailing the row and a soft
  // bloom where it lands. Zen's own switch for its
  // animation turns this off too.
  let downloadFlightOn = false;
  const FLIGHT_POP_MS = 120;
  const FLIGHT_WINDUP_MS = 420;
  const FLIGHT_LAUNCH_MS = 560;
  const FLIGHT_SETTLE_MS = 320;

  function flightTarget() {
    for (const id of ["zen-library-button", "downloads-button"]) {
      const button = document.getElementById(id);
      const box = button?.getBoundingClientRect();
      if (box && box.width > 0 && box.height > 0 && box.right > 0 && box.left < window.innerWidth && box.bottom > 0 && box.top < window.innerHeight) {
        return { button, x: box.left + box.width / 2, y: box.top + box.height / 2 };
      }
    }
    return null;
  }

  function flightName(download) {
    const path = download.target?.path;
    if (path) {
      return PathUtils.filename(path);
    }
    try {
      return decodeURIComponent(new URL(download.source?.url || "").pathname.split("/").pop()) || "Download";
    } catch (err) {
      return "Download";
    }
  }

  function flightPart(className, parent) {
    const node = document.createElementNS(XHTML_NS, "div");
    node.className = className;
    parent?.appendChild(node);
    return node;
  }

  function flyDownloadRow(download, start) {
    const target = flightTarget();
    if (!target) {
      return;
    }
    document.getElementById("zia-download-flight")?.remove();
    const stage = flightPart("");
    stage.id = "zia-download-flight";
    const dim = flightPart("zia-df-dim", stage);
    const beam = flightPart("zia-df-beam", stage);
    const bloom = flightPart("zia-df-bloom", stage);
    const row = flightPart("zia-df-row", stage);
    const name = flightName(download);
    const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
    const icon = document.createElementNS(XHTML_NS, "img");
    icon.className = "zia-df-icon";
    icon.src = `moz-icon://${ext || ".bin"}?size=16`;
    const label = document.createElementNS(XHTML_NS, "span");
    label.className = "zia-df-name";
    label.textContent = name;
    row.append(icon, label);
    root.appendChild(stage);

    const { width, height } = row.getBoundingClientRect();
    const keep = (x, y) => ({
      x: Math.min(window.innerWidth - width / 2 - 8, Math.max(width / 2 + 8, x)),
      y: Math.min(window.innerHeight - height / 2 - 8, Math.max(height / 2 + 8, y)),
    });
    // (centred just above where you last clicked)
    const p0 = keep(start.clientX, start.clientY - height * 0.9);
    const dx = target.x - p0.x;
    const dy = target.y - p0.y;
    const distance = Math.hypot(dx, dy) || 1;
    // The path, as Dia's: one swoop. It drops straight away from the
    // button (down when the button's above, up when it's below), rounds
    // the turn, then sweeps off in a long curve to the button: a cubic
    // curve whose first handle points straight away and whose second sits
    // out level with it, a little way towards the button.
    const away = -Math.sign(dy || -1);
    const drop = Math.min(120, Math.max(60, distance * 0.16));
    const c1 = { x: p0.x, y: p0.y + away * drop };
    const c2 = { x: p0.x + dx * 0.42, y: p0.y + away * drop * 1.1 };
    const bez = (u, a, b, c, d) => (1 - u) ** 3 * a + 3 * (1 - u) ** 2 * u * b + 3 * (1 - u) * u ** 2 * c + u ** 3 * d;
    const point = (u) => ({ x: bez(u, p0.x, c1.x, c2.x, target.x), y: bez(u, p0.y, c1.y, c2.y, target.y) });
    const at = (x, y, rotate, scale) => `translate(${x - p0.x}px, ${y - p0.y}px) translate(-50%, -50%) rotate(${rotate}deg) scale(${scale})`;

    row.style.left = `${p0.x}px`;
    row.style.top = `${p0.y}px`;
    const total = FLIGHT_POP_MS + FLIGHT_WINDUP_MS + FLIGHT_LAUNCH_MS;
    const o = (ms) => ms / total;
    const frames = [
      { offset: 0, transform: at(start.clientX, start.clientY, 0, 0.45), opacity: 0 },
      { offset: o(FLIGHT_POP_MS), transform: at(p0.x, p0.y, 0, 1), opacity: 1 },
    ];
    // along the path: slow through the turn, then fast, easing in at the
    // end. It leans one way the whole flight, as Dia's does (anticlockwise
    // flying up and left; mirrored for the button below or to the right):
    // the lean builds smoothly through the turn and eases off across the
    // sweep. (Following the path's own slope, it flipped side to side
    // where the path ran straight up.)
    const lean = -Math.sign(dx * dy || 1) * 7;
    const smooth = (a, b, x) => {
      const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
      return k * k * (3 - 2 * k);
    };
    const STEPS = 48;
    const flightMs = FLIGHT_WINDUP_MS + FLIGHT_LAUNCH_MS;
    for (let i = 1; i <= STEPS; i++) {
      const t = i / STEPS;
      // (a gentle ease, its top speed only about one and a half times its
      // average: a steeper one crossed 100px between frames mid-flight,
      // and read as jumpy)
      const u = 0.5 - 0.5 * Math.cos(Math.PI * t);
      const here = point(u);
      const tilt = lean * smooth(0, 0.35, t) * (1 - smooth(0.45, 0.9, t));
      frames.push({
        offset: o(FLIGHT_POP_MS + flightMs * t),
        transform: at(here.x, here.y, tilt.toFixed(2), (1 - 0.65 * smooth(0.45, 1, u)).toFixed(4)),
        opacity: (1 - smooth(0.7, 1, u)).toFixed(4),
      });
    }
    // (only movement and fading, which Firefox runs on the graphics card:
    // with a blur in it too, it ran frame by frame alongside everything
    // else a download starts, and stuttered)
    const flight = row.animate(frames, { duration: total, easing: "linear", fill: "forwards" });

    // the dim: in as it winds up, out once it's landed
    const settle = total + FLIGHT_SETTLE_MS;
    const so = (ms) => ms / settle;
    dim.animate(
      [
        { opacity: 0, easing: "ease-in-out" },
        { opacity: 1, offset: so(FLIGHT_POP_MS + FLIGHT_WINDUP_MS) },
        { opacity: 1, offset: so(total), easing: "ease-out" },
        { opacity: 0 },
      ],
      { duration: settle, easing: "linear", fill: "forwards" }
    );

    // the light: a faint glow trailing just behind the row along its own
    // path, as in Dia, only a breath brighter than the dim
    beam.style.left = row.style.left;
    beam.style.top = row.style.top;
    beam.animate(
      frames.map((frame, i) => ({
        offset: frame.offset,
        transform: frame.transform.replace(/scale\(([\d.]+)\)/, (_, n) => `scale(${(Number(n) * 1.6).toFixed(3)})`),
        opacity: i < 3 ? 0 : frame.opacity,
      })),
      { duration: total, delay: 40, easing: "linear", fill: "forwards" }
    );

    // the bloom where it lands
    Object.assign(bloom.style, { left: `${target.x}px`, top: `${target.y}px` });
    bloom.animate(
      [
        { opacity: 0, scale: 0.4 },
        { opacity: 0, scale: 0.4, offset: so(FLIGHT_POP_MS + FLIGHT_WINDUP_MS + FLIGHT_LAUNCH_MS * 0.5) },
        { opacity: 1, scale: 1, offset: so(total) },
        { opacity: 0, scale: 1.3 },
      ],
      { duration: settle, easing: "linear", fill: "forwards" }
    );

    setTimeout(() => {
      target.button.animate(
        [{ transform: "scale(1)" }, { transform: "scale(1.18)", offset: 0.4 }, { transform: "scale(1)" }],
        { duration: 360, easing: "cubic-bezier(0.3, 1.4, 0.5, 1)" }
      );
    }, total - 40);
    setTimeout(() => stage.remove(), settle + 40);
    flight.finished.catch(() => stage.remove());
  }

  // Firefox's "What should Zen do with this file?" box opened wherever the
  // system put it, top left of the screen: it's centred on the page of the
  // window it's for, every time, and saving from it sends the download's
  // flight from there.
  let savedFromDialog = null;
  const DOWNLOAD_DIALOG = "chrome://mozapps/content/downloads/unknownContentType.xhtml";

  function pageBoxOnScreen() {
    const page = document.getElementById("tabbrowser-tabpanels")?.getBoundingClientRect();
    if (!page || !page.width) {
      return null;
    }
    return { left: window.mozInnerScreenX + page.left, top: window.mozInnerScreenY + page.top, width: page.width, height: page.height, client: page };
  }

  function centreDownloadDialog(dialog) {
    // (only the window it's for: the front browser window)
    if (Services.wm.getMostRecentWindow("navigator:browser") !== window) {
      return;
    }
    const place = () => {
      const page = pageBoxOnScreen();
      if (!page || dialog.closed) {
        return;
      }
      dialog.moveTo(
        Math.round(page.left + (page.width - dialog.outerWidth) / 2),
        Math.round(page.top + (page.height - dialog.outerHeight) / 2)
      );
    };
    place();
    // (once it's sized itself to what it shows)
    dialog.requestAnimationFrame(() => dialog.requestAnimationFrame(place));
    dialog.document.addEventListener("dialogaccept", () => {
      const page = pageBoxOnScreen();
      if (page) {
        savedFromDialog = { clientX: page.client.left + page.client.width / 2, clientY: page.client.top + page.client.height / 2, at: Date.now() };
      }
    });
  }

  function watchDownloadDialog() {
    const observer = {
      observe(subject, topic) {
        if (topic !== "domwindowopened") {
          return;
        }
        subject.addEventListener(
          "load",
          () => {
            if (subject.location?.href === DOWNLOAD_DIALOG) {
              try {
                centreDownloadDialog(subject);
              } catch (err) {
                noteError("downloads: centre dialog", err);
              }
            }
          },
          { once: true }
        );
      },
    };
    Services.ww.registerNotification(observer);
    window.addEventListener("unload", () => Services.ww.unregisterNotification(observer), { once: true });
  }

  function flyDownloadRows() {
    const Downloads = window.Downloads;
    if (!Downloads?.getList) {
      return;
    }
    Downloads.getList(Downloads.ALL)
      .then((list) => {
        downloadFlightOn = true;
        list.addView({
          onDownloadAdded(download) {
            try {
              // (only one just started, here, and not those listed on startup)
              const fresh = !download.succeeded && Date.now() - (download.startTime?.getTime?.() ?? 0) < 5000;
              // (from where Firefox's "what should Zen do with this file?"
              // box was, if that's where it was saved from, 2s ago at most)
              const fromDialog = savedFromDialog && Date.now() - savedFromDialog.at < 2000 ? savedFromDialog : null;
              savedFromDialog = null;
              const start = fromDialog || window.gZenUIManager?._lastClickPosition;
              if (
                !fresh ||
                !start ||
                !Services.prefs.getBoolPref("zen.downloads.download-animation", true) ||
                // (this window, the front one, or the one that box came from)
                (Services.focus.activeWindow !== window && !fromDialog) ||
                matchMedia("(prefers-reduced-motion: reduce)").matches
              ) {
                return;
              }
              flyDownloadRow(download, start);
            } catch (err) {
              noteError("downloads: flight", err);
            }
          },
        });
      })
      .catch((err) => noteError("downloads: flight list", err));
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

  // a resource:// host pointed at a folder or zip, unless it already is
  function pointResource(host, spec) {
    const handler = Services.io.getProtocolHandler("resource").QueryInterface(Ci.nsIResProtocolHandler);
    const uri = Services.io.newURI(spec);
    if (!handler.hasSubstitution(host) || handler.getSubstitution(host).spec !== uri.spec) {
      handler.setSubstitution(host, uri);
    }
  }

  function pointAtIconPack(pack) {
    pointResource(ICON_HOST, `jar:${PathUtils.toFileURI(pack)}!/`);
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
    const prefixes = [`${ICON_DIR}/`, "resource://zia-own-icons/"];
    for (const image of document.querySelectorAll("image, img")) {
      for (const name of ["src", "href"]) {
        const url = image.getAttribute(name);
        if (prefixes.some((prefix) => url?.startsWith(prefix))) {
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

    const page = document.createXULElement("vbox");
    page.id = "zia-icons-page";
    const bar = document.createElementNS(XHTML_NS, "div");
    bar.id = "zia-icons-searchbar";
    const box = document.createElementNS(XHTML_NS, "input");
    box.id = "zia-icons-search";
    box.setAttribute("type", "text");
    box.setAttribute("placeholder", "Search icons");
    // Outline or solid, remembered
    const styles = document.createElementNS(XHTML_NS, "div");
    styles.id = "zia-icons-style";
    const styleButtons = {};
    for (const [value, label] of [["outline", "Outline"], ["filled", "Solid"]]) {
      const button = document.createElementNS(XHTML_NS, "button");
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
    const grid = document.createElementNS(XHTML_NS, "div");
    grid.id = "zia-icons-grid";
    const empty = document.createElementNS(XHTML_NS, "div");
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
      // as Zen does after its own picks: with an icon chosen, the "none"
      // (bin) button can take it off again
      panel.removeAttribute("hide-none-option");
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
    const more = document.createElementNS(XHTML_NS, "div");
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
        // Zen's picker takes every click on an icon with its class as one
        // of its own, and would pass on a broken address (it reads an
        // "icon" attribute these don't have) after Zia's
        item.addEventListener("command", (event) => {
          event.stopPropagation();
          choose(url);
        });
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
      for (const other of tabs.children) {
        other.classList.toggle("selected", other === tab);
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
    const inCompactMode = () => root.getAttribute("zen-compact-mode") === "true";

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
      const buttons = window.gZenVerticalTabsManager?.actualWindowButtons;
      if (buttons && buttons.parentElement !== topButtons) {
        topButtons.prepend(buttons);
      }
    }

    new MutationObserver(moveTopRow).observe(navBar, { childList: true });

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
      new MutationObserver(syncPanelOpen).observe(toolbox, { attributes: true, attributeFilter: SIDEBAR_SHOWN_ATTRS });
    }
    window.addEventListener("resize", followCover);
    const urlbar = document.getElementById("urlbar");
    if (urlbar) {
      urlbar.addEventListener("focus", followCover, true);
      urlbar.addEventListener("blur", followCover, true);
      new MutationObserver(followCover).observe(urlbar, { attributes: true, attributeFilter: ["breakout-extend"] });
    }
    new MutationObserver(() => {
      moveTopRow();
      syncPanelOpen();
    }).observe(root, { attributes: true, attributeFilter: ["zen-compact-mode"] });

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
        } else if (parts.includes(word)) {
          score += weight * 2;
        } else if (ICON_SYNONYMS[word] === name) {
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
      all.push(...vectors);
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
    name = name.split(/\s+/).slice(0, 3).join(" ");
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
    return tidyName(readGeneratedText(result), tabs);
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
    if (!featureOn("folder-icon-suggest") || !isFolder(folder) || folderIconURL(folder)) {
      return;
    }
    // A folder made empty (New Folder) has nothing to go by but its own
    // default name, which only ever suggested a plain folder icon
    // (Zen keeps a hidden placeholder tab in an empty folder: not a tab)
    if (!(folder.tabs || []).some((tab) => !tab.hasAttribute("zen-empty-tab"))) {
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

  // Only a folder you've just made is named. Zen announces every folder it
  // brings back at start-up the same way as a new one, and Cmd+Z can bring
  // a deleted one back, so a restored "New Folder" was being renamed: the
  // naming waits until the window's tabs are back, and sits out an undo.
  const FOLDER_NAMING_SETTLE_MS = 3000;

  function watchNewFolders() {
    let ready = false;
    const settle = () => setTimeout(() => (ready = true), FOLDER_NAMING_SETTLE_MS);
    const restored = window.SessionStore?.promiseAllWindowsRestored;
    if (restored) {
      restored.then(settle, settle);
    } else {
      settle();
    }
    gBrowser.tabContainer.addEventListener("TabGroupCreate", (event) => {
      if (!ready || Date.now() < (window.ziaReopeningUntil || 0) || wasDeletedFolder(event.target)) {
        return;
      }
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
    setAttr(folder, "zia-folder-color", color || null);
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
    setStyle(group, "--zia-group-swatch", swatch || null);
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
      (child) =>
        child.localName === "zen-folder" ||
        // (a split in it too: it kept its slot, showing under the split)
        child.localName === "tab-group" ||
        (child.classList.contains("tabbrowser-tab") && !child.hasAttribute("zen-empty-tab"))
    );
  }

  // The slot is sized from a real tab in the sidebar (its background, the gaps
  // around it and how far it's inset in a folder), so it's exactly where the
  // first tab will sit, and a tab dragged in replaces it without anything
  // moving. Measured from a tab inside an open folder when there is one.
  const FOLDER_SLOT_INSET = { start: 14, end: 5 };
  const rootPx = (name, fallback) => parseFloat(getComputedStyle(root).getPropertyValue(name)) || fallback;
  let slotSize = "";
  function measureFolderSlot() {
    // (not a glance: its tab sits inside the one it came from, drawn as a
    // small picture, and the slot shrank to that while a glance was open)
    const visible = (tab) =>
      tab.getBoundingClientRect().height > 8 &&
      !tab.hasAttribute("zen-empty-tab") &&
      !tab.hasAttribute("zen-glance-tab") &&
      !tab.parentElement?.closest(".tabbrowser-tab");
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
      // (the list's own padding below the slot is part of that gap)
      const gap = boxBottom - (inner.bottom - (parseFloat(getComputedStyle(container).paddingBottom) || 0) - bottom);
      if (gap > 0 && gap < 20) {
        end = inner.right - (boxRight - gap);
      }
    }
    const values = [top, bottom, start, end, b.height].map((n) => `${Math.round(n * 2) / 2}px`);
    if (values.join(" ") === slotSize) {
      return;
    }
    slotSize = values.join(" ");
    ["mt", "mb", "ms", "me", "h"].forEach((name, i) => root.style.setProperty(`--zia-slot-${name}`, values[i]));
  }

  // The slot's dashes, drawn to its size so they're even all the way round
  // at any sidebar width: two dashes centred on each corner, and on each
  // side as many as fit, spread evenly between the corners' (each set on a
  // whole screen pixel, so none blurs). Firefox's own dashes, spread to fit
  // each side, fell between pixels and greyed; a fixed pattern drawn round
  // the box came back to its start uneven.
  const SLOT_DASH = 3;
  const SLOT_GAP = 3;
  function slotDashesPath(width, height, radius, dpr) {
    const snap = (n) => Math.round(n * dpr) / dpr;
    const c = radius - 0.5;
    const arc = (Math.PI / 2) * c;
    // the corner's two dashes, centred on its arc, a gap between them
    const cornerPad = (arc - 2 * SLOT_DASH - SLOT_GAP) / 2;
    const parts = [];
    const corner = (cx, cy, from) => {
      for (const start of [cornerPad, cornerPad + SLOT_DASH + SLOT_GAP]) {
        const a1 = from + (start / arc) * (Math.PI / 2);
        const a2 = from + ((start + SLOT_DASH) / arc) * (Math.PI / 2);
        const x1 = cx + c * Math.cos(a1);
        const y1 = cy + c * Math.sin(a1);
        const x2 = cx + c * Math.cos(a2);
        const y2 = cy + c * Math.sin(a2);
        parts.push(`M${x1.toFixed(2)} ${y1.toFixed(2)}A${c} ${c} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`);
      }
    };
    // a side from its start to its end, along x or y at a fixed other
    const side = (from, to, fixed, horizontal) => {
      const length = to - from;
      // the gap at each end makes up a whole gap with the corner's pad
      const end = Math.max(0, SLOT_GAP - cornerPad);
      const n = Math.max(1, Math.round((length - 2 * end + SLOT_GAP) / (SLOT_DASH + SLOT_GAP)));
      const gap = n > 1 ? (length - 2 * end - n * SLOT_DASH) / (n - 1) : 0;
      for (let i = 0; i < n; i++) {
        const a = n > 1 ? snap(from + end + i * (SLOT_DASH + gap)) : snap(from + (length - SLOT_DASH) / 2);
        const b = a + SLOT_DASH;
        parts.push(horizontal ? `M${a} ${fixed}H${b}` : `M${fixed} ${a}V${b}`);
      }
    };
    const right = width - 0.5;
    const bottom = height - 0.5;
    corner(radius, radius, Math.PI);
    side(radius, width - radius, 0.5, true);
    corner(width - radius, radius, -Math.PI / 2);
    side(radius, height - radius, right, false);
    corner(width - radius, height - radius, 0);
    side(radius, width - radius, bottom, true);
    corner(radius, height - radius, Math.PI / 2);
    side(radius, height - radius, 0.5, false);
    return parts.join("");
  }

  function slotDashesImage(width, height, radius, dpr) {
    const svg =
      `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' viewBox='0 0 ${width} ${height}' preserveAspectRatio='none'>` +
      `<path d='${slotDashesPath(width, height, radius, dpr)}' fill='none' stroke='context-stroke' stroke-width='1'/></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }

  // The slot shows its dashes from a canvas of its folder's (-moz-element),
  // redrawn to size at every step of a sidebar resize: a canvas shows its
  // new drawing at once, where a new picture blanked while it loaded, and
  // the last one stretched while it waited. The canvases sit off screen.
  let slotCanvasHolder = null;
  let slotCanvasCount = 0;
  const slotCanvases = new Set();

  function drawSlotCanvas(folder, container, width, height, radius, dpr) {
    let canvas = folder.ziaSlotCanvas;
    if (!canvas) {
      if (!slotCanvasHolder) {
        slotCanvasHolder = document.createElementNS(XHTML_NS, "div");
        slotCanvasHolder.id = "zia-slot-canvases";
        slotCanvasHolder.setAttribute("aria-hidden", "true");
        slotCanvasHolder.style.cssText = "position: fixed; top: 0; left: -10000px; pointer-events: none;";
        (document.body || document.documentElement).appendChild(slotCanvasHolder);
      }
      canvas = document.createElementNS(XHTML_NS, "canvas");
      canvas.id = `zia-slot-dashes-${++slotCanvasCount}`;
      canvas.style.display = "block";
      slotCanvasHolder.appendChild(canvas);
      canvas.ziaFolder = folder;
      folder.ziaSlotCanvas = canvas;
      slotCanvases.add(canvas);
      folder.style.setProperty("--zia-slot-dashes-live", `-moz-element(#${canvas.id})`);
    }
    const color = getComputedStyle(container, "::after").stroke;
    const key = `${width}x${height}@${dpr}:${color}`;
    if (canvas.ziaKey === key) {
      return;
    }
    canvas.ziaKey = key;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const context = canvas.getContext("2d");
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    context.lineWidth = 1;
    // (a colour the canvas can't read leaves the stand-in)
    context.strokeStyle = "rgba(255, 255, 255, 0.13)";
    if (color && color !== "none") {
      context.strokeStyle = color;
    }
    context.stroke(new Path2D(slotDashesPath(width, height, radius, dpr)));
  }

  function dropGoneSlotCanvases() {
    for (const canvas of slotCanvases) {
      if (!canvas.ziaFolder.isConnected) {
        canvas.remove();
        slotCanvases.delete(canvas);
      }
    }
  }

  // Each empty folder's slot gets its own (a folder inside another is
  // narrower); the page's keeps the latest, for a tab dragged in from
  // outside any folder. The slot's canvas is redrawn at once; the picture
  // a dragged tab wears is drawn afresh once the width has held still for
  // a moment, swapped in only once it's ready: drawn at every step, each
  // new one blanked the dashes while it loaded.
  const SLOT_DASHES_SETTLE_MS = 200;
  let lastSlotDashes = "";
  let slotDashesTimer = 0;
  function drawSlotDashes() {
    clearTimeout(slotDashesTimer);
    drawSlotDashesNow(true);
    // (a slot not drawn yet, a folder just made or opened, is drawn at once)
    if ([...document.querySelectorAll("zen-folder[zia-empty]")].some((folder) => !folder.ziaSlotDashes)) {
      drawSlotDashesNow();
      return;
    }
    slotDashesTimer = setTimeout(() => drawSlotDashesNow(), SLOT_DASHES_SETTLE_MS);
  }

  function useSlotDashes(target, image) {
    const url = image.slice(5, -2);
    const picture = new Image();
    picture.src = url;
    picture.decode().catch(() => {}).then(() => target.style.setProperty("--zia-slot-dashes-image", image));
  }

  function drawSlotDashesNow(canvasOnly = false) {
    dropGoneSlotCanvases();
    const height = rootPx("--zia-slot-h", 35);
    const inset = rootPx("--zia-slot-ms", 16) + rootPx("--zia-slot-me", 7);
    const radius = rootPx("--zia-tab-radius", 9.5);
    const dpr = window.devicePixelRatio || 1;
    for (const folder of document.querySelectorAll("zen-folder[zia-empty]")) {
      const container = folder.querySelector(":scope > .tab-group-container");
      const style = container && getComputedStyle(container);
      const box = container?.getBoundingClientRect();
      const width = box
        ? Math.round((box.width - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0) - inset) * dpr) / dpr
        : 0;
      if (width < 2 * radius + 2 * SLOT_DASH || height < 2 * radius) {
        continue;
      }
      drawSlotCanvas(folder, container, width, height, radius, dpr);
      if (canvasOnly) {
        continue;
      }
      const key = `${width}x${height}@${dpr}`;
      if (folder.ziaSlotDashes !== key) {
        folder.ziaSlotDashes = key;
        const image = slotDashesImage(width, height, radius, dpr);
        useSlotDashes(folder, image);
        if (!folder.parentElement?.closest("zen-folder") && image !== lastSlotDashes) {
          lastSlotDashes = image;
          useSlotDashes(root, image);
        }
      }
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
      drawSlotDashes();
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
    // (the slot's canvas takes its dashes' colour: redrawn when a folder's
    // colour changes, or the space turns light or dark)
    new MutationObserver(schedule).observe(tabs, { subtree: true, attributes: true, attributeFilter: ["zia-folder-color"] });
    new MutationObserver(schedule).observe(root, { attributes: true, attributeFilter: ["zia-light"] });
    // An empty folder opens by sliding its slot down into view, as a folder
    // does its tabs. Emptied (its last tab dragged out) and shut, Zen had
    // measured it with no slot showing, so it was only 4px up out of view
    // and opened with a snap. It's put a slot's height up before Zen opens it.
    window.addEventListener(
      "TabGroupExpand",
      (event) => {
        const folder = event.target;
        if (folder?.localName !== "zen-folder" || !folder.hasAttribute("zia-empty")) {
          return;
        }
        const start = folder.groupStartElement;
        if (!start) {
          return;
        }
        const room = rootPx("--zia-slot-h", 35) + rootPx("--zia-slot-mt", 2) + rootPx("--zia-slot-mb", 2);
        if ((parseFloat(getComputedStyle(start).marginTop) || 0) > -room) {
          start.style.marginTop = `${-(room + 4)}px`;
        }
      },
      true
    );
    for (const type of ["TabGroupCreate", "TabGrouped", "TabUngrouped", "TabClose", "TabMove", "TabGroupExpand"]) {
      gBrowser.tabContainer.addEventListener(type, schedule);
    }
    window.addEventListener("ZenWorkspacesUIUpdate", schedule);
    // The sidebar's width changes a tab's size
    new ResizeObserver(schedule).observe(tabs);
    schedule();
  }

  // Folders show a glass folder in their colour
  // (or the space's) holding a sheet of paper for each tab in it, up to
  // three: an empty folder is just the folder. It opens and closes with the
  // folder, and a tab dropped in drops a sheet in with it. A folder given
  // an icon of its own wears it on the glass front (or, right-clicked,
  // shows it alone).
  //
  // Past three it becomes a glass archive box: the folder shrinks and blurs
  // away and the box grows into focus. For each tab added the lid opens, a
  // sheet drops in and the lid shuts; for each one taken out a sheet rises
  // out. The box shows up to eight sheets; past that a sheet still goes in
  // or out each time, without the pile growing. Its lid stays open while
  // the folder is.
  const FOLDER_ICON_MAX_SHEETS = 3;
  const FOLDER_BOX_MAX_SHEETS = 8;
  const FOLDER_ICON_DROP_MS = 650;
  // the box's timings (ms): the morph, a sheet's way in, the lid open around it
  const FOLDER_BOX_MORPH_MS = 560;
  const FOLDER_BOX_LID_LEAD_MS = 120;
  const FOLDER_BOX_SHEET_MS = 600;
  const FOLDER_BOX_LID_MS = FOLDER_BOX_LID_LEAD_MS + FOLDER_BOX_SHEET_MS + 120;

  function folderIconBox(folder) {
    return folder?.querySelector?.(":scope > .tab-group-label-container .tab-group-folder-icon");
  }

  function folderIconPart(parent, className) {
    const el = document.createElementNS(XHTML_NS, "div");
    el.className = className;
    parent.append(el);
    return el;
  }

  function addFolderIcon(folder) {
    const box = folderIconBox(folder);
    if (!box || box.querySelector(":scope > .zia-fi")) {
      return;
    }
    const icon = document.createElementNS(XHTML_NS, "div");
    icon.className = "zia-fi";
    // the folder, back to front: its back, the sheets, the glass front
    const fold = folderIconPart(icon, "zia-fi-fold");
    for (const part of ["back", "sheet zia-fi-s3", "sheet zia-fi-s2", "sheet zia-fi-s1", "front"]) {
      folderIconPart(fold, `zia-fi-${part}`);
    }
    // the folder's own icon, on the front of each (it tips with the front)
    folderIconMark(fold.querySelector(".zia-fi-front"));
    // the box, back to front: its inside, the pile, a passing sheet, the
    // glass front, the lid
    const archive = folderIconPart(icon, "zia-fb");
    folderIconPart(archive, "zia-fb-back");
    for (let i = 0; i < FOLDER_BOX_MAX_SHEETS; i++) {
      folderIconPart(archive, "zia-fb-sheet").style.setProperty("--i", i);
    }
    folderIconPart(archive, "zia-fb-pass");
    folderIconMark(folderIconPart(archive, "zia-fb-front"));
    folderIconPart(archive, "zia-fb-lid");
    box.append(icon);
  }

  function folderIconMark(front) {
    const mark = document.createElementNS(XHTML_NS, "img");
    mark.className = "zia-fi-mark";
    mark.alt = "";
    front.append(mark);
  }

  // A folder's own icon (Zen keeps it in its folder picture, an SVG
  // <image>), shown alone in the folder's place; or, a folder at a time
  // (right-click it, Show Icon on Folder), worn on the glass folder's
  // front. Kept by folder id, as its colour is.
  const FOLDER_ICON_ON_FOLDER_PREF = "zia.folder-icon-on-folder";

  function readIconOnFolder() {
    try {
      return JSON.parse(Services.prefs.getStringPref(FOLDER_ICON_ON_FOLDER_PREF, "{}")) || {};
    } catch (err) {
      return {};
    }
  }

  function setIconOnFolder(folder, on) {
    if (!folder?.id) {
      return;
    }
    const map = readIconOnFolder();
    if (on) {
      map[folder.id] = true;
    } else {
      delete map[folder.id];
    }
    try {
      Services.prefs.setStringPref(FOLDER_ICON_ON_FOLDER_PREF, JSON.stringify(map));
    } catch (err) {
      noteError("folder icon: save icon on folder", err);
    }
    folder.toggleAttribute("zia-icon-on-folder", on);
  }

  function restoreIconOnFolder() {
    const map = readIconOnFolder();
    for (const folder of document.querySelectorAll("zen-folder")) {
      folder.toggleAttribute("zia-icon-on-folder", !!map[folder.id]);
    }
  }

  function folderHasOwnIcon(folder) {
    return !!folderIconBox(folder)?.querySelector("svg .icon image")?.getAttribute("href");
  }

  function addIconOnFolderMenuItem() {
    let item = null;
    document.addEventListener(
      "popupshowing",
      (event) => {
        const menu = event.target;
        if (menu?.id !== "zenFolderActions") {
          return;
        }
        const folder = folderFromNode(menu.triggerNode || event.explicitOriginalTarget);
        if (!item) {
          item = document.createXULElement("menuitem");
          item.id = "zia-folder-icon-on-folder";
          item.setAttribute("type", "checkbox");
          // (Zia ticks it from the folder, not the menu: a menu tick is
          // there for any "checked", even "false")
          item.setAttribute("autocheck", "false");
          item.setAttribute("label", "Show Icon on Folder");
          item.addEventListener("command", () => {
            const folder = item.ziaFolder;
            setIconOnFolder(folder, !folder?.hasAttribute("zia-icon-on-folder"));
          });
          const after = document.getElementById("zia-folder-color-menu") || document.getElementById("context_zenFolderRename");
          if (after?.parentElement === menu) {
            after.after(item);
          } else {
            menu.appendChild(item);
          }
        }
        // only for a folder with an icon of its own
        const shown = !!folder?.isZenFolder && folderHasOwnIcon(folder);
        item.hidden = !shown;
        item.ziaFolder = shown ? folder : null;
        setAttr(item, "checked", shown && folder.hasAttribute("zia-icon-on-folder") ? "true" : null);
      },
      true
    );
  }

  function syncFolderMark(folder) {
    const box = folderIconBox(folder);
    const href = box?.querySelector("svg .icon image")?.getAttribute("href") || null;
    const icon = box?.querySelector(":scope > .zia-fi");
    if (!icon) {
      return;
    }
    folder.toggleAttribute("zia-fi-marked", !!href);
    for (const mark of icon.querySelectorAll(".zia-fi-mark")) {
      if (mark.getAttribute("src") !== href) {
        setAttr(mark, "src", href);
      }
    }
  }

  // What's in a folder: its tabs (a split counts once) and folders
  function folderItemCount(folder) {
    const container = folder.querySelector(":scope > .tab-group-container");
    if (!container) {
      return 0;
    }
    return [...container.children].filter(
      (el) =>
        (el.classList.contains("tabbrowser-tab") && !el.hasAttribute("zen-empty-tab")) ||
        el.localName === "zen-folder" ||
        el.localName === "tab-group"
    ).length;
  }

  // An animation attribute put on afresh, after a delay, and taken off once
  // it's run, so the same one can play again next time
  function replayFolderIcon(el, attr, delay, length) {
    clearTimeout(el.ziaReplayOff);
    el.removeAttribute(attr);
    void el.offsetWidth;
    el.style.animationDelay = `${delay}ms`;
    el.setAttribute(attr, "");
    el.ziaReplayOff = setTimeout(() => el.removeAttribute(attr), delay + length + 60);
  }

  function countFolderBox(folder, count, before) {
    const icon = folderIconBox(folder)?.querySelector(":scope > .zia-fi");
    if (!icon) {
      return;
    }
    const shown = count > FOLDER_ICON_MAX_SHEETS ? Math.min(count, FOLDER_BOX_MAX_SHEETS) : 0;
    const wasShown = before > FOLDER_ICON_MAX_SHEETS ? Math.min(before, FOLDER_BOX_MAX_SHEETS) : 0;
    const full = count > FOLDER_ICON_MAX_SHEETS;
    const wasFull = before > FOLDER_ICON_MAX_SHEETS;
    // how full the box looks: none at four, all of it at eight
    icon.style.setProperty("--fb-full", full ? ((shown - FOLDER_ICON_MAX_SHEETS - 1) / (FOLDER_BOX_MAX_SHEETS - FOLDER_ICON_MAX_SHEETS - 1)).toFixed(3) : "0");
    const sheets = [...icon.querySelectorAll(".zia-fb-sheet")];
    const quiet = before === null || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (quiet) {
      folder.toggleAttribute("zia-fi-full", full);
      sheets.forEach((sheet, i) => sheet.toggleAttribute("zia-on", i < shown));
      return;
    }
    const up = full && !wasFull;
    const down = !full && wasFull;
    const adding = count > before;
    // the box comes in once the folder has gone; going back, its last sheet
    // comes out first
    const start = up ? FOLDER_BOX_MORPH_MS : 0;
    if (up || down) {
      const wait = down ? FOLDER_BOX_LID_LEAD_MS + FOLDER_BOX_SHEET_MS : 0;
      const [out, into] = up ? [".zia-fi-fold", ".zia-fb"] : [".zia-fb", ".zia-fi-fold"];
      setTimeout(() => folder.toggleAttribute("zia-fi-full", full), wait);
      replayFolderIcon(icon.querySelector(out), "zia-morph-out", wait, 200);
      replayFolderIcon(icon.querySelector(into), "zia-morph-in", wait + 140, 420);
    }
    if (full || down) {
      // the lid opens for the sheet (it's already open with the folder open)
      replayFolderIcon(icon, "zia-fb-peek", start, FOLDER_BOX_LID_MS);
    }
    sheets.forEach((sheet, i) => {
      const on = i < shown;
      const was = sheet.hasAttribute("zia-on");
      // going back to the folder, the sheets it'll hold stay in the box
      // until it's gone
      if (down && was && i < count) {
        clearTimeout(sheet.ziaKeep);
        sheet.ziaKeep = setTimeout(() => sheet.toggleAttribute("zia-on", folder.ziaFolderItems > FOLDER_ICON_MAX_SHEETS && i < Math.min(folder.ziaFolderItems, FOLDER_BOX_MAX_SHEETS)), FOLDER_BOX_LID_LEAD_MS + FOLDER_BOX_SHEET_MS + 200);
        return;
      }
      clearTimeout(sheet.ziaKeep);
      sheet.toggleAttribute("zia-on", on);
      if (on && !was && (!up || i === shown - 1)) {
        replayFolderIcon(sheet, "zia-fall", start + FOLDER_BOX_LID_LEAD_MS, FOLDER_BOX_SHEET_MS);
      } else if (!on && was) {
        replayFolderIcon(sheet, "zia-rise", 100, 500);
      }
    });
    // past eight, a sheet still passes in or out
    if (full && wasFull && shown === wasShown) {
      replayFolderIcon(icon.querySelector(".zia-fb-pass"), adding ? "zia-in" : "zia-out", FOLDER_BOX_LID_LEAD_MS, FOLDER_BOX_SHEET_MS);
    }
  }

  function countFolderSheets(folder) {
    addFolderIcon(folder);
    syncFolderMark(folder);
    const items = folderItemCount(folder);
    const itemsBefore = folder.ziaFolderItems ?? null;
    folder.ziaFolderItems = items;
    if (itemsBefore !== items) {
      countFolderBox(folder, items, itemsBefore);
    }
    const count = Math.min(FOLDER_ICON_MAX_SHEETS, items);
    const before = folder.hasAttribute("zia-fi-count") ? Number(folder.getAttribute("zia-fi-count")) : null;
    if (before === count) {
      return;
    }
    folder.setAttribute("zia-fi-count", String(count));
    if (before === null) {
      return;
    }
    // a sheet more than before: it drops in. A sheet fewer: the top one
    // lifts out and away, as if pulled from the folder with the tab.
    clearTimeout(folder.ziaFolderDropTimer);
    folder.removeAttribute("zia-fi-drop");
    folder.removeAttribute("zia-fi-lift");
    if (count > before) {
      folder.setAttribute("zia-fi-drop", String(count));
    } else {
      folder.setAttribute("zia-fi-lift", String(before));
    }
    folder.ziaFolderDropTimer = setTimeout(() => {
      folder.removeAttribute("zia-fi-drop");
      folder.removeAttribute("zia-fi-lift");
    }, FOLDER_ICON_DROP_MS);
  }

  function countAllFolderSheets() {
    document.querySelectorAll("zen-folder, tab-group:not([split-view-group])").forEach(countFolderSheets);
  }

  // Counted once the folders have stopped changing: while Zen drops a tab
  // in, the folder holds an extra child for a moment, and counting then
  // put down two sheets before settling on one, the sheet jumping wider.
  const FOLDER_ICON_SETTLE_MS = 150;

  function watchFolderIcon() {
    let timer = null;
    const recount = () => {
      clearTimeout(timer);
      timer = setTimeout(countAllFolderSheets, FOLDER_ICON_SETTLE_MS);
    };
    for (const type of ["TabGroupCreate", "TabGrouped", "TabUngrouped", "TabOpen", "TabClose", "TabMove", "TabGroupRemoved"]) {
      gBrowser.tabContainer.addEventListener(type, recount);
    }
    window.addEventListener("ZenWorkspacesUIUpdate", recount);
    // tabs moved in and out by Zen's own drag and drop, without an event;
    // and a folder given an icon, or its icon changed
    new MutationObserver(recount).observe(gBrowser.tabContainer, { subtree: true, childList: true, attributes: true, attributeFilter: ["href"] });
    // (the old per-folder "icon only" choice is the default now)
    Services.prefs.clearUserPref("zia.folder-icon-only");
    restoreIconOnFolder();
    setTimeout(restoreIconOnFolder, 1500);
    gBrowser.tabContainer.addEventListener("TabGroupCreate", (event) => {
      event.target?.toggleAttribute?.("zia-icon-on-folder", !!readIconOnFolder()[event.target.id]);
    });
    addIconOnFolderMenuItem();
    countAllFolderSheets();
    // folders restored at start-up
    setTimeout(countAllFolderSheets, 1500);
  }
  // ---------- Folders brought back after being deleted
  // Firefox keeps a deleted folder as a plain tab group and reopens it as one: it
  // wouldn't collapse, Zia's animations passed it by, and it was named afresh. One
  // back with a deleted folder's id is made a folder again, with its name, icon, colour.
  const DELETED_FOLDER_KEEP_MS = 30 * 60 * 1000;
  const deletedFolders = new Map();

  // (back in any form: a folder you deleted is never named afresh)
  function wasDeletedFolder(group) {
    return !!group?.id && deletedFolders.has(group.id);
  }

  function isReopenedFolder(group) {
    return wasDeletedFolder(group) && !group.isZenFolder && group.localName === "tab-group" && !group.hasAttribute("split-view-group");
  }

  function rememberDeletedFolder(folder) {
    if (!folder?.isZenFolder || !folder.id) {
      return;
    }
    const now = Date.now();
    for (const [id, saved] of deletedFolders) {
      if (now - saved.at > DELETED_FOLDER_KEEP_MS) {
        deletedFolders.delete(id);
      }
    }
    deletedFolders.set(folder.id, {
      at: now,
      label: folder.label,
      icon: folder.iconURL || "",
      color: readFolderColors()[folder.id] || null,
      workspaceId: folder.getAttribute("zen-workspace-id") || undefined,
    });
  }

  function remakeReopenedFolder(group) {
    const saved = deletedFolders.get(group.id);
    if (!saved || !group.isConnected || group.isZenFolder) {
      return;
    }
    deletedFolders.delete(group.id);
    const tabs = [...(group.tabs || [])].filter((tab) => tab.isConnected);
    if (!tabs.length || !window.gZenFolders?.createFolder) {
      return;
    }
    // (the new folder announces itself too: it isn't named either)
    window.ziaReopeningUntil = Date.now() + 3000;
    try {
      const label = group.label || saved.label;
      const workspaceId = saved.workspaceId || group.getAttribute("zen-workspace-id") || undefined;
      group.ungroupTabs?.();
      const folder = window.gZenFolders.createFolder(tabs, { label, workspaceId });
      const made = folder?.isZenFolder ? folder : tabs[0]?.group?.isZenFolder ? tabs[0].group : null;
      if (!made) {
        return;
      }
      if (saved.icon) {
        window.gZenFolders.setFolderUserIcon?.(made, saved.icon);
      }
      if (saved.color) {
        setFolderColor(made, saved.color);
      }
    } catch (err) {
      console.warn("[Zia] Couldn't make the reopened folder a folder again:", err);
    }
  }

  function watchReopenedFolders() {
    gBrowser.tabContainer.addEventListener("TabGroupRemoved", (event) => rememberDeletedFolder(event.target));
    gBrowser.tabContainer.addEventListener("TabGroupCreate", (event) => {
      const group = event.target;
      if (isReopenedFolder(group)) {
        // (once Firefox has put all its tabs back in it)
        requestAnimationFrame(() => requestAnimationFrame(() => safely("remakeReopenedFolder", () => remakeReopenedFolder(group))));
      }
    });
  }

  // Optional: the last essential stretches across whatever's left of its row.
  // The grid can't span "to the end of the row" by itself, so Zia counts the
  // columns and sets the span.
  const FILL_ROW_PREF = "zia.essentials.fill-row";
  // Zia's narrower essentials (off: Zen's widths, which already fill the row)
  const ZIA_WIDTH_PREF = "zia.essentials.zia-width";

  // The grid's own columns, worked out as the grid does (as many as fit at
  // the tiles' least width). Its computed column list also holds the extra
  // columns a span wider than the grid creates; counting those grew the
  // span, which made more of them, until tiles were squeezed into slivers.
  const TWO_PER_ROW_PREF = "zia.essentials.two-per-row";

  function gridColumns(grid) {
    if (Services.prefs.getBoolPref(TWO_PER_ROW_PREF, false)) {
      return 2;
    }
    const style = getComputedStyle(grid);
    const width = grid.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
    const gap = parseFloat(style.columnGap) || 0;
    const least = parseFloat(getComputedStyle(root).getPropertyValue("--zia-essential-min-width")) || 54;
    return Math.max(1, Math.floor((width + gap) / (least + gap)));
  }

  function fillEssentialRows() {
    const on =
      Services.prefs.getBoolPref(FILL_ROW_PREF, false) &&
      (Services.prefs.getBoolPref(ZIA_WIDTH_PREF, true) || Services.prefs.getBoolPref(TWO_PER_ROW_PREF, false)) &&
      root.getAttribute("zen-sidebar-expanded") === "true";
    const wanted = new Map();
    if (on) {
      for (const grid of document.querySelectorAll(".zen-essentials-container")) {
        const tabs = [...grid.children].filter((tab) =>
          tab.matches?.(".tabbrowser-tab[zen-essential]:not([hidden], [zia-essential-proxy])")
        );
        const columns = gridColumns(grid);
        // (a single row already spans the sidebar: the grid folds away the
        // columns it doesn't need)
        const empty = columns - (tabs.length % columns || columns);
        if (tabs.length > columns && empty > 0) {
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
    watchPrefs([FILL_ROW_PREF, ZIA_WIDTH_PREF, TWO_PER_ROW_PREF], schedule);
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
    setStyle(essential, "--zia-split-glow", icon ? cssUrl(icon) : null);
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
    watchPrefs(SPLIT_PREF, restore);
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
      root.style.removeProperty("--zia-media-solid");
      return;
    }
    root.style.setProperty("--zia-media-solid", cssColor(colorOver(tint, colorOver(paint, base))));
  }

  // Light spaces (23-light-spaces.css): a space whose colour is light, which
  // Zen marks zen-should-be-dark-mode="false", and also a window with no
  // space colour at all in light mode: Zen leaves the mark off then and
  // goes by the window's own light or dark, so Zia drew its dark look, white
  // text on the pale window. Mirrored to :root[zia-light].
  function watchLightSpace() {
    const update = () => {
      const mark = root.getAttribute("zen-should-be-dark-mode");
      let light = mark === "false";
      if (mark === null) {
        try {
          light = window.gZenThemePicker ? !window.gZenThemePicker.isDarkMode : window.matchMedia("(prefers-color-scheme: light)").matches;
        } catch (err) {
          light = false;
        }
      }
      if (root.hasAttribute("zia-light") !== light) {
        root.toggleAttribute("zia-light", light);
      }
    };
    update();
    new MutationObserver(update).observe(root, { attributes: true, attributeFilter: ["zen-should-be-dark-mode", "zen-default-theme"] });
    window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", update);
    Services.obs.addObserver(update, "zen-theme-change");
    window.addEventListener("unload", () => Services.obs.removeObserver(update, "zen-theme-change"), { once: true });
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
    // (a light space has its own, white music card)
    watcher.observe(root, { attributes: true, attributeFilter: ["zen-compact-mode", "zen-should-be-dark-mode", "zia-light"] });
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

  // ---------- Room for the essentials above every space's tabs
  // Zen pads a space's tabs clear of the essentials as you go to it, but a space made
  // this session started at 0 and its tabs slid in under them (Windows). With shared
  // essentials each space gets that room; one being made or animated is left to Zen.
  function keepRoomForEssentials() {
    const separate = () => {
      try {
        return Services.prefs.getBoolPref("zen.workspaces.separate-essentials", false);
      } catch (err) {
        return false;
      }
    };
    const essentials = () =>
      [...document.querySelectorAll(".zen-essentials-container")].find((el) => !el.hidden && el.getBoundingClientRect().width);

    const fit = () => {
      if (separate() || root.hasAttribute("zen-creating-workspace")) {
        return;
      }
      const box = essentials();
      if (!box) {
        return;
      }
      const room = Math.max(2, box.getBoundingClientRect().height);
      for (const space of document.querySelectorAll("zen-workspace")) {
        if (space.querySelector("zen-workspace-creation") || space.getAnimations().length) {
          continue;
        }
        const now = parseFloat(space.style.paddingTop);
        if (!(Math.abs(now - room) < 0.5)) {
          space.style.paddingTop = `${room}px`;
        }
      }
    };

    // as a switch starts (the space coming in already has its room as it
    // slides), and once it has settled
    new MutationObserver((records) => {
      if (records.some((record) => record.target.localName === "zen-workspace")) {
        fit();
        setTimeout(fit, 400);
      }
    }).observe(document.getElementById("navigator-toolbox") || root, { subtree: true, attributes: true, attributeFilter: ["active"] });

    let watched = null;
    const resize = new ResizeObserver(() => fit());
    const watch = () => {
      const box = essentials();
      if (box && box !== watched) {
        watched?.isConnected && resize.unobserve(watched);
        watched = box;
        resize.observe(box);
      }
    };
    watch();
    setInterval(watch, 5000);
    fit();
  }

  const TAB_CARD_DELAY = 600;
  const TAB_CARD_GRACE = 120;
  const TAB_CARD_GAP = 8;

  // (how far an essential's card tucks under its corner: with the squircle
  // corners on both, 6px brings the card's corner to the tile's)
  const ESSENTIAL_CARD_OVERLAP_X = 6;
  const ESSENTIAL_CARD_OVERLAP_Y = 2;
  const DEFAULT_TAB_ICON = "chrome://sine/content/zia/icons/tab-default.svg";

  const TAB_CARD_ACTIONS = [
    {
      name: "essential",
      icon: "card-pin",
      label: "Add to Essentials",
      // a split goes in whole, as a split essential: Zen can't make one of
      // its tabs an essential (it left the other stranded, without a title)
      run: (tab) => (inSplit(tab) ? addSplitToEssentials(tab) : gZenPinnedTabManager?.addToEssentials(tab)),
      hidden: (tab) => tab.hasAttribute("zen-essential") || tab.pinned || (inSplit(tab) && !canBecomeSplitEssential(tab)),
    },
    {
      name: "unpin",
      icon: "card-pinned-off",
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
      icon: "card-split",
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
      icon: "card-paperclip",
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
      button.toggleAttribute("zia-copied", copied);
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

  // The paperclip goes beside Zen's site settings button, which Zen adds
  // to the address bar itself, sometimes only after Zia has started (with
  // Zia just installed into an open window, say); until then Zia waits for
  // it, as Zen's own copy button is hidden for the paperclip (zia.css)
  function addCopyLinkButton() {
    if (document.getElementById("zia-copy-link-button")) {
      return;
    }
    const siteData = document.getElementById("zen-site-data-icon-button");
    if (!siteData) {
      const urlbar = document.getElementById("urlbar");
      if (!urlbar || addCopyLinkButton.waiting) {
        return;
      }
      addCopyLinkButton.waiting = new MutationObserver(() => {
        if (document.getElementById("zen-site-data-icon-button")) {
          addCopyLinkButton.waiting.disconnect();
          safely("addCopyLinkButton", addCopyLinkButton);
        }
      });
      addCopyLinkButton.waiting.observe(urlbar, { childList: true, subtree: true });
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
    const thumb = document.createElementNS(XHTML_NS, "canvas");
    thumb.className = "zia-tab-card-thumb";
    thumb.hidden = true;
    card.append(thumb, title, sub, row);
    root.appendChild(card);
    return card;
  }

  // the page's picture when Firefox's hover previews are on (Zia's card replaces Firefox's)
  const TAB_THUMB_RATIO = 0.55;
  let thumbToken = 0;

  function wantsTabThumb(tab) {
    return (
      Services.prefs.getBoolPref("browser.tabs.hoverPreview.enabled", false) &&
      Services.prefs.getBoolPref("browser.tabs.hoverPreview.showThumbnails", true) &&
      !tab.selected &&
      !tab.hasAttribute("pending") &&
      !!tab.linkedPanel &&
      tabCardKind(tab) !== "new"
    );
  }

  async function drawTabThumb(canvas, tab, token) {
    const browser = tab.linkedBrowser;
    let captured = false;
    try {
      const { PageThumbs } = ChromeUtils.importESModule(
        "resource://gre/modules/PageThumbs.sys.mjs",
      );
      if (typeof PageThumbs?.captureTabPreviewThumbnail === "function") {
        // captureTabPreviewThumbnail draws directly onto the canvas and returns
        // true on success, false on failure — it does not return an image object.
        captured = await PageThumbs.captureTabPreviewThumbnail(browser, canvas);
      }
    } catch (err) {
      captured = false;
    }
    if (!captured) {
      // Fallback: drawSnapshot returns an ImageBitmap-like object we draw ourselves.
      let picture = null;
      const windowGlobal = browser?.browsingContext?.currentWindowGlobal;
      const width = browser?.clientWidth;
      if (windowGlobal && width) {
        try {
          picture = await windowGlobal.drawSnapshot(
            new DOMRect(0, 0, width, width * TAB_THUMB_RATIO),
            canvas.width / width,
            "white",
          );
        } catch (err) {
          picture = null;
        }
      }
      if (!picture || token !== thumbToken || !canvas.isConnected) {
        picture?.close?.();
        return;
      }
      const ctx = canvas.getContext("2d");
      const sw = picture.width;
      const sh = Math.min(picture.height, sw * TAB_THUMB_RATIO);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(picture, 0, 0, sw, sh, 0, 0, canvas.width, canvas.height);
      picture.close?.();
    } else if (token !== thumbToken || !canvas.isConnected) {
      // captureTabPreviewThumbnail succeeded but the card is stale — clear it.
      canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  function fillTabCard(card, tab) {
    // a split essential's card is about the half you're in
    const shown = splitCardSource(tab) || tab;
    const isNew = tabCardKind(shown) === "new";
    card.querySelector(".zia-tab-card-title").textContent = shown.label || "New Tab";
    const sub = card.querySelector(".zia-tab-card-sub");
    sub.textContent = isNew ? "" : tabCardDomain(shown);
    sub.hidden = !sub.textContent;

    const thumb = card.querySelector(".zia-tab-card-thumb");
    const token = ++thumbToken;
    thumb.hidden = !wantsTabThumb(shown);
    if (!thumb.hidden) {
      const ratio = Math.max(1, window.devicePixelRatio || 1);
      // (the card's set width: it's still hidden here)
      const width = parseFloat(getComputedStyle(root).getPropertyValue("--zia-tab-card-width")) || 260;
      thumb.width = Math.round(width * ratio);
      thumb.height = Math.round(width * TAB_THUMB_RATIO * ratio);
      drawTabThumb(thumb, shown, token).catch((err) => noteError("hover card: thumbnail", err));
    }

    const row = card.querySelector("#zia-tab-card-actions");
    row.hidden = isNew;
    for (const button of row.children) {
      const action = TAB_CARD_ACTIONS.find((a) => a.name === button.getAttribute("zia-action"));
      button.hidden = !!action?.hidden?.(tab);
    }
  }

  // keeps the card in the window; returns the top it got
  function moveCard(card, x, y) {
    x = Math.max(TAB_CARD_GAP, Math.min(x, window.innerWidth - card.offsetWidth - TAB_CARD_GAP));
    y = Math.max(TAB_CARD_GAP, Math.min(y, window.innerHeight - card.offsetHeight - TAB_CARD_GAP));
    card.style.left = `${Math.round(x)}px`;
    card.style.top = `${Math.round(y)}px`;
    return y;
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
      y = tabBox.bottom - ESSENTIAL_CARD_OVERLAP_Y;
      if (onRight) {
        card.setAttribute("zia-side", "right");
        x = tabBox.left - width + ESSENTIAL_CARD_OVERLAP_X;
        origin = "top right";
      } else {
        card.removeAttribute("zia-side");
        x = tabBox.right - ESSENTIAL_CARD_OVERLAP_X;
        origin = "top left";
      }
    } else {
      card.setAttribute("zia-anchor", "tab");
      card.removeAttribute("zia-side");
      x = onRight ? sidebar.left - width - TAB_CARD_GAP : sidebar.right + TAB_CARD_GAP;
      y = tabBox.top + tabBox.height / 2 - height / 2;
      origin = onRight ? "right center" : "left center";
    }
    moveCard(card, x, y);
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
    const color = folder.getAttribute("zia-folder-color");
    setAttr(card, "zia-folder-color", color || null);
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
    const inset = tabEdgeInset();
    if (inset) {
      list.style.setProperty("--zia-folder-card-inset", `${inset}px`);
    }
    const scrolled = card.querySelector(".zia-folder-card-list")?.scrollTop || 0;
    list.append(...rows);
    card.replaceChildren(list);
    list.scrollTop = scrolled;
  }

  // a tab's icon inset in the sidebar, which the folder card keeps on all sides
  function tabEdgeInset() {
    try {
      const tab = gBrowser.visibleTabs.find((t) => !t.pinned && !t.hasAttribute("zen-essential") && t.getBoundingClientRect().width);
      const edge = tab?.querySelector(".tab-background")?.getBoundingClientRect();
      // (the icon itself: the box it sits in can reach further out)
      const icon = [".tab-icon-image", ".tab-icon-stack"]
        .map((selector) => tab?.querySelector(selector)?.getBoundingClientRect())
        .find((box) => box?.width);
      const inset = edge && icon?.width ? Math.round((icon.left - edge.left) * 2) / 2 : 0;
      return inset >= 4 && inset <= 16 ? inset : 0;
    } catch (err) {
      noteError("hover cards: tab inset", err);
      return 0;
    }
  }

  function newTabButtonIcon() {
    const button = document.querySelector("#vertical-tabs-newtab-button, #tabs-newtab-button");
    const shown = button?.querySelector(".toolbarbutton-icon");
    const style = shown ? getComputedStyle(shown) : null;
    const url = style?.listStyleImage?.match(/^url\("?(.*?)"?\)$/)?.[1];
    const icon = folderCardIcon(url || "chrome://sine/content/zia/icons/ui/plus.svg", "zia-folder-card-icon");
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
    const x = onRight ? sidebar.left - card.offsetWidth - TAB_CARD_GAP : sidebar.right + TAB_CARD_GAP;
    // first row level with the folder, so a one-tab card centres on it like a tab's
    const first = card.querySelector(".zia-folder-card-row");
    const middle = first ? first.offsetTop + first.offsetHeight / 2 : card.offsetHeight / 2;
    const y = moveCard(card, x, box.top + box.height / 2 - middle);
    card.style.transformOrigin = `${onRight ? "right" : "left"} ${Math.round(box.top + box.height / 2 - y)}px`;
  }

  function hoveredFolderLabel(target) {
    const label = target?.closest?.(".tab-group-label-container");
    const folder = label?.parentElement;
    return folder?.isZenFolder && folder.collapsed && !folder.hasAttribute("split-view-group") ? label : null;
  }

  function quietZenFolderPopup() {
    const folders = window.gZenFolders;
    if (!folders || typeof folders.openTabsPopup !== "function" || folders.openTabsPopup.ziaWrapped) {
      return;
    }
    const original = folders.openTabsPopup;
    const wrapped = function (...args) {
      return featureOn("tab-hover-cards") ? undefined : original.apply(this, args);
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

    // Compact mode hides the sidebar once the pointer leaves it, and the cards sit
    // outside it: hold it open, as Zen does for its own menus, while on a card.
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
      try {
        const manager = window.gZenCompactModeManager;
        if (manager?.preference) {
          if (toolbox.matches(":hover")) {
            // The card was inside the sidebar. Restore zen-has-hover synchronously
            // before dropping has-popup-menu so there is no gap with zero attributes.
            manager._setElementExpandAttribute?.(toolbox, true, "zen-has-hover");
            toolbox.setAttribute("zen-has-hover", "true");
            toolbox.setAttribute("zen-has-implicit-hover", "true");
          } else {
            const keep = Services.prefs.getIntPref("zen.view.compact.sidebar-keep-hover.duration", 0);
            if (keep > 0) {
              manager.flashElement(toolbox, keep, `has-hover${toolbox.id}`, "zen-has-hover");
            }
          }
        }
      } catch (err) {
        noteError("hover cards: release sidebar", err);
      }
      toolbox.removeAttribute("has-popup-menu");
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

    const watchCard = (node) => {
      node.addEventListener("mouseenter", () => {
        clearTimeout(hideTimer);
        holdSidebar(true);
      });
      node.addEventListener("mouseleave", () => {
        holdSidebar(false);
        hideSoon();
      });
    };

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
        watchCard(folderCard);
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
          Promise.try(() => action.run(tab)).catch((err) => console.error(`[Zia] ${action.label} failed:`, err));
        });
        watchCard(card);
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
      const tab = event.target?.closest?.(".tabbrowser-tab, .tab-group-label-container");
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
        if ((Date.now() < keepCardUntil && folderCard && !folderCard.hidden) || cardHovered()) {
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

    // What's dragged in the sidebar has Zia's own stand-in, so the system's picture is
    // blanked (for an essential, anything: it showed as a window-wide blurred band).
    // A drag in the Library (its spaces' tabs) is Zen's own, with its own picture
    // under the pointer and its drop line: Zia leaves it alone.
    const inLibrary = (event) => event.composedPath?.().some((node) => node.localName === "zen-library");
    let libraryDragging = false;
    window.addEventListener("dragstart", (event) => (libraryDragging = !!inLibrary(event)), true);
    window.addEventListener("dragend", () => (libraryDragging = false), true);

    const isTabGhost = (node) =>
      !libraryDragging &&
      (!!(node?.querySelector?.("[drag-image]") || node?.hasAttribute?.("drag-image")) ||
      !!essentialDragging ||
      !!node?.closest?.("#zen-essentials, .zen-essentials-container") ||
      !!node?.querySelector?.(".tabbrowser-tab[zen-essential]"));
    let essentialDragging = false;
    for (const name of ["setDragImage", "updateDragImage"]) {
      const original = DataTransfer.prototype[name];
      DataTransfer.prototype[name] = function (node, x, y) {
        return isTabGhost(node) ? original.call(this, blankImage(), 0, 0) : original.call(this, node, x, y);
      };
    }

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
        // a split essential's own tabs, kept hidden in the list, aren't rows (as 0-high rows
        // between a folder and the next, no tab could be dropped into the folder)
        if (item.hasAttribute?.("zia-split-of") || item.group?.querySelector?.(":scope .tabbrowser-tab[zia-split-of]")) {
          continue;
        }
        // nor the selected tabs folded into the one dragged: hidden, as 0-high rows each step
        // past them moved nothing, and the dragged tab slid over the rows that should part
        if (item.hasAttribute?.("zia-drag-companion")) {
          continue;
        }
        let node = nodeToMove(item);
        // A closed folder is one row, its name and the tab it shows (that tab as a row too
        // moved aside twice and came apart from it, uncovering the tabs it hides).
        let closed = null;
        for (
          let host = node?.closest?.(FOLDER_SELECTOR);
          host;
          host = host.parentElement?.closest?.(FOLDER_SELECTOR)
        ) {
          if (host !== node && (host.hasAttribute("collapsed") || host.collapsed) && !host.contains(keepOpen)) {
            closed = host;
          }
        }
        // (only a folder showing a tab: a plain closed folder is its name, so a tab dragged
        // up past the separator lands below it first)
        if (closed?.hasAttribute("has-active")) {
          node = closed;
        } else {
          const host = node?.closest?.(FOLDER_SELECTOR);
          if (
            host &&
            host !== node &&
            (host.hasAttribute("collapsed") || host.collapsed) &&
            node.classList?.contains("tab-group-label-container") &&
            !host.contains(keepOpen)
          ) {
            node = host;
          }
        }
        if (!node || seen.has(node)) {
          continue;
        }
        seen.add(node);
        const box = layoutTop(node);
        // (showing its open tab: the name's height, where a tab can go in above that one)
        const header = closed?.hasAttribute("has-active") && node === closed ? headerOf(closed) : null;
        const head = header ? layoutTop(header).height : 0;
        rows.push({
          item,
          node,
          index: rows.length,
          top: box.top,
          mid: box.top + box.height / 2,
          height: box.height,
          head: head > 0 && head < box.height - 4 ? head : 0,
          delta: 0,
        });
      }
      // Numbered by place in the sidebar, not Firefox's tab count: that can lag a move,
      // and the folders a tab sat under all moved up out of its way
      rows.sort((a, b) => (a.node === b.node ? 0 : a.node.compareDocumentPosition(b.node) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
      rows.forEach((row, i) => {
        row.index = i;
      });
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
      for (const name of ["top", "position", "z-index", "transform", "--zia-drag-y"]) {
        node.style.removeProperty(name);
      }
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

    // An open empty folder's slot takes a tab's room under its header without being a
    // row: its height (measured once per drag) counts toward the folder's size, and a
    // tab dragged in takes its place instead of more room.
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
      return node.parentElement?.closest?.(FOLDER_SELECTOR) || null;
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
      // The folder it came from loses its highlight once it's dragged out (Firefox kept
      // it hovered until the mouse next moved, after the drop), and regains it coming back
      for (let home = drag.moving?.parentElement?.closest?.(FOLDER_SELECTOR); home; home = home.parentElement?.closest?.(FOLDER_SELECTOR)) {
        home.toggleAttribute("zia-left", !folder || (folder !== home && !home.contains(folder)));
      }
      // Over an empty folder the tab (or a split's box) covers its slot, so it wears the
      // slot's dashes instead (chrome.css), in the folder's colour.
      const tabs = drag.moving === drag.tab || (drag.split && drag.moving === drag.split) ? [drag.moving] : [];
      const into = !!folder?.hasAttribute("zia-empty");
      const border = into ? getComputedStyle(folder).getPropertyValue("--zia-slot-border") : "";
      for (const tab of tabs) {
        if (into) {
          tab.style.setProperty("--zia-slot-border", border);
        }
        tab.toggleAttribute("zia-into-empty", into);
      }
    };

    // Room for a tab going in at the top of a closed folder showing its open tab: that
    // tab moves down a tab's height or, coming from above, the folder's name moves up
    let topRoom = null;
    const roomAtTop = (folder, way) => {
      const key = folder ? `${way}` : null;
      if (topRoom?.folder === folder && topRoom?.key === key) {
        return;
      }
      if (topRoom) {
        topRoom.node.style.removeProperty("translate");
        topRoom = null;
      }
      if (!folder || !drag) {
        return;
      }
      const node = way === "up" ? headerOf(folder) : folder.querySelector(":scope > .tab-group-container");
      if (!node) {
        return;
      }
      node.style.setProperty("transition", "translate 0.15s ease");
      node.style.setProperty("translate", `0 ${way === "up" ? -drag.pitch : drag.pitch}px`);
      topRoom = { folder, key, node };
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
        // the last folder before the separator: its slot is a whole tab tall, not the sliver
        // down to the separator
        if (!same(next) && slotTop != null) {
          // Coming up past the separator, the tab lands below the last folder first and goes
          // in once its middle is a little way into the slot (half: a band of a few pixels,
          // so it seemed to drop straight in; a third: so tall it seemed not to go in at all;
          // 4 tenths from below, where it counts as past the separator a fifth of the way in).
          // Leaving downward it stays in until its bottom meets the folder's (any earlier left
          // a tiny gap under the folder).
          const fromBelow = drag.sepTop != null && drag.origin > drag.sepTop;
          const inIt = drag.target?.folder === pf;
          cut = slotTop + drag.height * (fromBelow && !inIt ? 0.4 : 0.5);
        } else {
          const down = leaveDown(next);
          if (down != null) {
            cut = (leaveUp(prev) + down) / 2;
          }
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
      // Between two rows inside the same open folder: that folder, not the list (it went
      // full width though still inside)
      if (!folder && prev && next && same(prev) && same(next)) {
        const holder = (node) => node?.parentElement?.closest?.(FOLDER_SELECTOR) || null;
        let common = holder(prev.node);
        while (common && !common.contains(next.node)) {
          common = holder(common);
        }
        if (common && !isCollapsed(common) && !drag.moving.contains?.(common) && !(drag.folder && !canNest(drag.folder, common))) {
          folder = common;
        }
      }
      // Out past the end of a folder inside another that ends there too: the outer one
      // takes it before the list (it went full width for a moment, still inside)
      if (!folder && pf && cut != null && visualMid >= cut) {
        const outer = pf.parentElement?.closest?.(FOLDER_SELECTOR);
        if (outer && !isCollapsed(outer) && outer.contains(prev.node) && !(next && outer.contains(next.node)) && !drag.moving.contains?.(outer)) {
          const down = same(next) ? leaveDown(next) : null;
          const outerCut = down != null && down > cut ? (cut + down) / 2 : cut + drag.height / 2;
          if (visualMid < outerCut) {
            folder = outer;
            atEnd = true;
          }
        }
      }
      // Between a closed folder's name and the tab it shows: into it at the top (a tab only;
      // the shown tab moves down to make room, or the name up)
      let first = null;
      const shows = (row) => !!row?.head && isFolderEl(row.node) && isCollapsed(row.node) && same(row);
      if (!drag.folder) {
        if (folder === pf && shows(prev) && visualMid < prev.top + (prev.delta || 0) + prev.head + (prev.height - prev.head) / 2) {
          first = "down";
        } else if (!folder && shows(next) && !drag.shifted.has(next.node) && visualMid > next.top + (next.delta || 0) + next.head / 2) {
          folder = next.node;
          first = "up";
        }
        if (first) {
          atEnd = false;
        }
      }
      if (folder && drag.moving.contains?.(folder)) {
        folder = null;
        first = null;
      }
      // a folder goes into another only where Zen allows that deep
      if (drag.folder && folder && !canNest(drag.folder, folder)) {
        folder = null;
        atEnd = false;
      }
      roomAtTop(first ? folder : null, first);

      const crosses = below === !!drag.tab.pinned;

      // A split is always Zia's to place: Zen won't take one across the separator, dropped
      // it outside a closed or empty folder, and went by what's under the pointer (at the
      // top of the list, below the first folder or back where it came from)
      const hand = !!(drag.folder || drag.split || folder || pf || (nf && isFolderStart(next, nf)) || crosses);
      // a tap going into or out of a folder (Zen's own are muted during a drag), not for
      // the one it's in as it starts
      if (drag.target && folder !== drag.target.folder) {
        tap();
      }
      drag.target = { folder, atEnd, first: !!first, prev, next, below, sameNext: same(next), slotTop, hand };
      setDropSlot(folder);
    };

    const paintedFolders = new Set();
    // Folders' boxes stretched round the room made for what's dragged: a tab, or
    // (listRoom) an essential brought down into the list, whose folders didn't open
    const paintFolders = (
      { rows, target, pitch, height, skip, outer, moving } =
        { rows: drag.rows, target: drag.target, pitch: drag.pitch, height: drag.height, skip: notARow, outer: drag.folder, moving: drag.moving }
    ) => {
      const folders = new Set();
      for (const row of rows) {
        for (let f = rowFolder(row); f; f = f.parentElement?.closest?.(FOLDER_SELECTOR)) {
          folders.add(f);
        }
      }
      for (const f of folders) {
        if (outer && (f === outer || outer.contains(f))) {
          continue;
        }
        const into = !!target?.folder && (target.folder === f || f.contains(target.folder));
        let top = 0;
        let grow = 0;
        if (isCollapsed(f) && !f.contains(moving)) {
          grow = into ? pitch : 0;
          if (into && topRoom?.folder === f && topRoom.key === "up") {
            top = -pitch;
            grow = 0;
          }
        } else {
          let origBottom = -Infinity;
          let shownBottom = -Infinity;
          let showsTab = false;
          for (const row of rows) {
            if (row.node === f || !f.contains(row.node)) {
              continue;
            }
            const slot = slotAfterHeader(row);
            origBottom = Math.max(origBottom, row.top + row.height + slot);
            if (row.node === headerOf(f)) {
              top = row.delta || 0;
            }
            if (!skip(row)) {
              const intoThisSlot = slot && into && target.folder === row.node.parentElement;
              shownBottom = Math.max(shownBottom, row.top + (row.delta || 0) + row.height + (intoThisSlot ? 0 : slot));
              showsTab ||= row.node !== headerOf(f);
            }
          }
          if (into && target.slotTop != null) {
            shownBottom = Math.max(shownBottom, target.slotTop + height);
            showsTab = true;
          }
          if (Number.isFinite(origBottom) && Number.isFinite(shownBottom)) {
            grow = shownBottom - origBottom;
          }
          // closed, its open tab dragged out, it loses the padding below that tab too
          // (chrome.css): the box closed up less that and snapped the rest on the drop
          if (isCollapsed(f) && !showsTab) {
            grow -= parseFloat(getComputedStyle(f).getPropertyValue("--zia-folder-inner-gap")) || 0;
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
      if (topRoom) {
        const { node } = topRoom;
        topRoom = null;
        node.style.removeProperty("translate");
        setTimeout(() => node.style.removeProperty("transition"), 200);
      }
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
        (tab) => tab !== drag?.tab && !tab.hasAttribute("zen-essential") && !tab.hasAttribute("zen-empty-tab") && showing(tab) &&
          (inside ? true : !tab.group || tab.group.hasAttribute("split-view-group") ? !inside : true)
      );
    const widthFor = (folder) => {
      if (folder) {
        const own = sampleTab(folder);
        if (own && own.group === folder) {
          return showing(own);
        }
        let inset = FOLDER_TAB_INSET;
        const other = [...gBrowser.visibleTabs].find(
          (tab) => tab !== drag?.tab && tab.group && isFolderEl(tab.group) && !tab.group.group && showing(tab)
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
        (tab) => tab !== drag?.tab && !tab.group && !tab.hasAttribute("zen-essential") && !tab.hasAttribute("zen-empty-tab") && showing(tab)
      );
      if (plain) {
        return showing(plain);
      }
      const anyFolder = document.querySelector("#tabbrowser-tabs zen-folder");
      return anyFolder ? folderBox(anyFolder) : null;
    };

    // A dragged folder narrows the same way over a folder it would go into, to the
    // width of folders already inside one (its margins, eased)
    const morphFolderWidth = (into) => {
      const moving = drag.folder;
      const key = into || "plain";
      if (drag.widthKey === key) {
        return;
      }
      drag.widthKey = key;
      if (!drag.folderBase) {
        const style = getComputedStyle(moving);
        drag.folderBase = {
          box: folderBox(moving),
          start: parseFloat(style.marginInlineStart) || 0,
          end: parseFloat(style.marginInlineEnd) || 0,
        };
      }
      const base = drag.folderBase;
      // (back among the rows it started in, it's its own width again)
      const startedIn = moving.parentElement?.closest?.(FOLDER_SELECTOR) || null;
      const want = into || startedIn ? widthFor(into) : null;
      let start = want ? want.left - base.box.left : 0;
      let end = want ? base.box.right - want.right : 0;
      if (Math.abs(start) > 60 || Math.abs(end) > 60) {
        start = 0;
        end = 0;
      }
      moving.setAttribute("zia-morph-folder", "true");
      // eased frame by frame (the drag's own rules turn transitions off)
      const from = drag.folderShown || { start: base.start, end: base.end };
      const to = { start: base.start + start, end: base.end + end };
      const began = performance.now();
      const id = (drag.folderMorphId = (drag.folderMorphId || 0) + 1);
      const draw = (at) => {
        moving.style.setProperty("margin-inline-start", `${at.start}px`, "important");
        moving.style.setProperty("margin-inline-end", `${at.end}px`, "important");
        if (drag) {
          drag.folderShown = at;
        }
      };
      const step = (now) => {
        if (!drag || drag.folder !== moving || drag.folderMorphId !== id || !moving.hasAttribute("zia-morph-folder")) {
          return;
        }
        const t = Math.min(1, (now - began) / 140);
        const k = 1 - Math.pow(1 - t, 3);
        draw({ start: from.start + (to.start - from.start) * k, end: from.end + (to.end - from.end) * k });
        if (t < 1) {
          requestAnimationFrame(step);
        }
      };
      requestAnimationFrame(step);
    };
    const unmorphFolder = (folder) => {
      if (!folder?.hasAttribute?.("zia-morph-folder")) {
        return;
      }
      folder.removeAttribute("zia-morph-folder");
      for (const name of ["margin-inline-start", "margin-inline-end"]) {
        folder.style.removeProperty(name);
      }
    };

    const morphWidth = (folder) => {
      if (drag.folder) {
        morphFolderWidth(folder);
        return;
      }
      const key = folder || "plain";
      // (out of a folder inside another into none waits a moment: passing to the outer
      // one it counted as in none for a sliver and went full width in between)
      if (key !== "plain" || drag.widthKey === "plain") {
        clearTimeout(drag.widthTimer);
        drag.widthTimer = 0;
      } else if (!drag.widthGo && drag.widthKey && drag.widthKey !== "plain" && drag.widthKey.parentElement?.closest?.(FOLDER_SELECTOR)) {
        if (!drag.widthTimer) {
          const current = drag;
          drag.widthTimer = setTimeout(() => {
            if (drag !== current) {
              return;
            }
            drag.widthTimer = 0;
            drag.widthGo = true;
            morphWidth(null);
            drag.widthGo = false;
          }, 200);
        }
        return;
      }
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

    // Dropped, its narrower look goes straight to the row's own and the landing glide
    // starts from there: eased while the glide moved the row the other way (a folder's
    // indent changing), the two didn't cancel and it bulged sideways. Only a width that
    // differs from the one it was let go at eases, by its right edge.
    const MORPH_PROPS = ["--zia-morph-bg-start", "--zia-morph-bg-end", "--zia-morph-content-start", "--zia-morph-content-end"];
    // a dropped tab and, if it's in a split, the split: whichever wears the look
    const morphNodes = (tab) => [tab, tab?.group?.hasAttribute?.("split-view-group") ? tab.group : null];
    const settleDroppedWidth = (tab, width) => {
      const node = morphNodes(tab).find((n) => n?.hasAttribute?.("zia-morph"));
      if (!node) {
        return;
      }
      const split = node.localName === "tab-group";
      const box = split ? node.querySelector(":scope > .tab-group-container") : node.querySelector(".tab-background");
      const content = split ? null : node.querySelector(".tab-content");
      node.setAttribute("zia-morph-done", "true");
      node.removeAttribute("zia-morph");
      for (const name of MORPH_PROPS) {
        node.style.removeProperty(name);
      }
      const own = box?.getBoundingClientRect();
      const off = own && width > 0 ? own.width - width : 0;
      if (Math.abs(off) >= 0.5 && Math.abs(off) < 60) {
        const bs = getComputedStyle(box);
        const cs = content ? getComputedStyle(content) : null;
        node.style.setProperty("--zia-morph-bg-start", bs.marginInlineStart);
        node.style.setProperty("--zia-morph-bg-end", `${(parseFloat(bs.marginInlineEnd) || 0) + off}px`);
        if (cs) {
          node.style.setProperty("--zia-morph-content-start", cs.marginInlineStart);
          node.style.setProperty("--zia-morph-content-end", `${(parseFloat(cs.marginInlineEnd) || 0) + off}px`);
        }
        node.setAttribute("zia-morph", "true");
        box.getBoundingClientRect();
        node.removeAttribute("zia-morph-done");
        easeOutWidth(tab);
        return;
      }
      box?.getBoundingClientRect();
      node.removeAttribute("zia-morph-done");
    };

    const easeOutWidth = (tab) => {
      for (const node of morphNodes(tab)) {
        if (!node?.hasAttribute?.("zia-morph")) {
          continue;
        }
        node.setAttribute("zia-morph-out", "true");
        node.removeAttribute("zia-morph");
        for (const name of MORPH_PROPS) {
          node.style.removeProperty(name);
        }
        clearTimeout(node.ziaMorphOutTimer);
        node.ziaMorphOutTimer = setTimeout(() => node.removeAttribute("zia-morph-out"), 450);
      }
    };

    const newTabOnTop = () => Services.prefs.getBoolPref("zen.view.show-newtab-button-top", false);
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
        const button = newTabOnTop() ? newTabButton() : null;
        if (button) {
          place(button, sepDelta, false);
        }
      }
    };

    // A dragged folder whose height changed since the list was measured (it shut after
    // the drag began): measured again, or rows moved by the old height and it dropped wrong
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

      // New Tab at the foot of the list, when the list closes up (only if the
      // row taken out was above it)
      const shiftNewTab = (by) => {
        if (newTabOnTop()) {
          return;
        }
        const button = newTabButton();
        if (!button) {
          return;
        }
        drag.newTabTop ??= button.getBoundingClientRect().top;
        const want = by && drag.origin < drag.newTabTop ? by : 0;
        if ((drag.newTabShift || 0) !== want) {
          drag.newTabShift = want;
          place(button, want, false);
        }
      };
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
        // (New Tab under the list too: it stayed, leaving a gap above it
        // until the drop)
        shiftNewTab(-drag.pitch);
        drag.target = null;
        setDropSlot(null);
        takeEmptySlot();
        paintFolders();
        return;
      }

      shiftNewTab(0);
      let rowsMoved = false;
      for (const row of drag.rows) {
        if (notARow(row)) {
          continue;
        }
        const was = drag.shifted.has(row.node);
        let shift = false;
        // (a closed folder showing a tab moves aside only once the tab is
        // past its name: over the tab it shows, the tab goes in above it)
        if (row.index > drag.index) {
          shift = visualMid > row.top + (row.head || 0) + (was ? -10 : 8);
        } else if (row.index < drag.index) {
          shift = visualMid < row.top + (row.head || row.height) - (was ? -10 : 8);
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
        // Coming up from below, it's over the separator a fifth of the way into the space that
        // opens (halfway, the gap under the last folder came first and it went in still in the
        // space made for it); back down, just past that point with a few pixels' give.
        const upTo = drag.sepTop + drag.pitch * 0.8 + (drag.sepDelta ? 4 : 0);
        if (startedBelow && visualMid < upTo) {
          sepDelta = drag.pitch;
        } else if (!startedBelow && visualMid > drag.sepTop + 2) {
          sepDelta = -drag.pitch;
        }
        // crossing the separator taps like a row moving does
        if (drag.sepDelta !== sepDelta && (drag.sepDelta || sepDelta)) {
          rowsMoved = true;
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

    // Dropping into an open empty folder uses its slot as the tab's room: rows after the
    // folder move up by the slot's height too, and the slot fades (chrome.css).
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
          const button = newTabOnTop() ? newTabButton() : null;
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
          // (a tab only: a split's own group is the split itself)
          if (gBrowser.isTab(tab) && tab.group && !before.closest?.("tab-group")) {
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

    // The row a drop into a folder goes before, as one of the folder's own
    // (none at its end, or when it's closed)
    const nextInFolder = (folder, box, target) => {
      let next = !target.atEnd && !isCollapsed(folder) && target.next && folder.contains(target.next.node) ? target.next.node : null;
      while (next && next.parentElement !== box) {
        next = next.parentElement;
      }
      return next;
    };

    // A split let go in a folder goes where it was shown (beside the hidden tab Zen
    // keeps in an empty one), and a closed folder shuts on it again
    const splitIntoFolder = (split, folder, target) => {
      folder.removeAttribute("zia-drop-slot");
      const box = folder.querySelector(":scope > .tab-group-container");
      if (!box) {
        return;
      }
      const items = [...box.children].filter(
        (item) => item !== split && ((gBrowser.isTab(item) && !item.hasAttribute("zen-empty-tab")) || isFolderEl(item) || item.localName === "tab-group")
      );
      // (a closed folder is marked as showing a tab before the split goes in,
      // as for a tab: with the open tab in the split, Zen opened the folder)
      const shut = isCollapsed(folder);
      const selected = [...split.tabs].some((t) => t.selected);
      const hadActive = folder.hasAttribute("has-active");
      if (shut && !hadActive) {
        folder.setAttribute("has-active", "true");
        folder.activeTabs = [];
      }
      let next = nextInFolder(folder, box, target);
      if (target.first && items.length) {
        next = items[0];
      }
      if (next && next !== split) {
        placeBefore(split, next);
      } else if (items.length) {
        placeAfter(split, items.at(-1));
      } else {
        const empty = box.querySelector(":scope > .tabbrowser-tab[zen-empty-tab]");
        if (empty) {
          placeAfter(split, empty);
        }
      }
      if (split.parentElement !== box) {
        box.appendChild(split);
      }
      if (!shut) {
        return;
      }
      if (!hadActive && !selected) {
        folder.removeAttribute("has-active");
        folder.activeTabs = [];
      }
      try {
        if (!isCollapsed(folder)) {
          folder.collapsed = true;
        } else if (selected) {
          const open = [...split.tabs].filter((t) => t.selected);
          if (!showOpenTabShut(folder, open)) {
            window.gZenFolders?.animateSelect?.(folder);
          }
        } else {
          window.gZenFolders?.on_TabGroupCollapse?.({ target: folder });
        }
      } catch (err) {
        noteError("tab dragging: split into a closed folder", err);
      }
      jumpToEnd(folder);
    };

    // Several selected tabs let go together: the others (folded into the dragged one) land
    // beside it in the order they had, as Firefox lays out a multiple drop. Firefox's own
    // drop placed them by its measure of the list, which Zia's drag had moved, so they
    // went to its end.
    const finishDrop = (tab, target, party = null) => {
      placeDropped(tab, target);
      const at = party?.indexOf(tab) ?? -1;
      if (at < 0 || !tab.isConnected || tab.group?.hasAttribute("split-view-group")) {
        return;
      }
      const pinned = !target.below;
      let anchor = tab;
      for (const other of party.slice(at + 1)) {
        pinFor(other, pinned);
        placeAfter(other, anchor);
        anchor = other;
      }
      anchor = tab;
      for (const other of party.slice(0, at).reverse()) {
        pinFor(other, pinned);
        placeBefore(other, anchor);
        anchor = other;
      }
    };

    const placeDropped = (tab, target) => {
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
        // (read after pinning, which can give the split a new group)
        const group = tab.group || split;
        const folder = target.folder?.isConnected && !split.contains(target.folder) ? target.folder : null;
        if (folder) {
          splitIntoFolder(split, folder, target);
          return;
        }
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
        parkInFolder(tab, folder, target.first);
        return;
      }
      if (folder && target.atEnd) {
        const last = target.prev?.item;
        // (a tab of this folder's own: the row above can be in a folder
        // inside it, which the tab isn't going into)
        if (last && gBrowser.isTab(last) && last.group === folder) {
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
      const sep = currentSeparator();
      if (sep) {
        placeBefore(tab, sep);
      }
    };

    // Zen drops a folder by what's under the pointer, often a closed folder it then nests
    // it in: straight after, it's put where Zia showed it, never inside another folder.
    // (canNest: Zen's own limit on how deep folders go)
    const canNest = (folder, into) => {
      try {
        const inside = into.querySelector(":scope > .tab-group-container > .tabbrowser-tab") || into.labelElement || into;
        return window.gZenFolders?.canDropElement?.(folder, inside) ?? true;
      } catch (err) {
        return true;
      }
    };
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
      // (the folder it comes out of, emptied, shuts itself: without the bounce, as when a
      // tab is taken out, or the line below jolted)
      if (nestedIn) {
        nestedIn.ziaLentUntil = Date.now() + 800;
      }
      const into = target.folder?.isConnected && target.folder !== folder && !folder.contains(target.folder) ? target.folder : null;
      if (into) {
        // (no longer empty: its slot went only on the next frame, and the folder opened
        // round both, twice the room, for a moment)
        into.removeAttribute("zia-empty");
        if (isCollapsed(into)) {
          into.ziaDroppedUntil = Date.now() + 500;
        }
        // Dropped where Zia showed it inside a folder: there, before the row
        // it was shown above (at the end, if none or the folder is closed)
        const box = into.querySelector(":scope > .tab-group-container");
        const next = nextInFolder(into, box, target);
        if (next && next !== folder) {
          placeBefore(folder, next);
        } else if (box) {
          const last = [...box.children].reverse().find((item) => item !== folder && (gBrowser.isTab(item) || isFolderEl(item)));
          if (last) {
            placeAfter(folder, last);
          }
          if (folder.parentElement !== box) {
            box.appendChild(folder);
          }
        }
        // a closed one keeps showing only its open tab
        if (isCollapsed(into)) {
          try {
            window.gZenFolders?.on_TabGroupCollapse?.({ target: into });
          } catch (err) {
            noteError("tab dragging: folder into a closed folder", err);
          }
          jumpToEnd(into);
        }
      } else {
        const next = target.next && target.sameNext && !target.below ? outermostRow(target.next.node) : null;
        if (next && next !== folder && !folder.contains(next)) {
          placeBefore(folder, next);
        } else if (currentSeparator()) {
          placeBefore(folder, currentSeparator());
        }
        if (folder.parentElement?.closest?.("zen-folder")) {
          console.warn("[Zia] The dropped folder is still inside another folder");
        }
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

    // A closed folder showing the open tab just put in. Zen does it (animateSelect) unless
    // every tab in the folder is the open one: then it opened the folder, flashing open and
    // shut, so it's laid out here as Zen would. False when Zen's own way is fine.
    const showOpenTabShut = (folder, open) => {
      const zen = window.gZenFolders;
      const others = (folder.tabs || []).filter(
        (t) => !t.hasAttribute("zen-empty-tab") && !open.includes(t) && !(t.group?.hasAttribute?.("split-view-group") && open.some((o) => o.group === t.group))
      );
      if (others.length || !zen?.setFolderIndentation || folder.group) {
        return false;
      }
      folder.setAttribute("has-active", "true");
      folder.activeTabs = open;
      const container = folder.groupContainer || folder.querySelector(":scope > .tab-group-container");
      container?.removeAttribute("hidden");
      const start = folder.groupStartElement;
      if (start) {
        start.style.marginTop = "0px";
      }
      for (const tab of open) {
        zen.setFolderIndentation([tab], folder, true, false);
      }
      return true;
    };

    const parkInFolder = (tab, folder, first = false) => {
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
      // (let go between its name and the tab it shows: first in it)
      if (first) {
        const container = folder.querySelector(":scope > .tab-group-container");
        const head = [...(container?.children || [])].find(
          (el) => el !== tab && (gBrowser.isTab(el) || isFolderEl(el) || el.localName === "tab-group")
        );
        if (head) {
          placeBefore(tab, head);
        }
      }
      try {
        if (!isCollapsed(folder)) {
          folder.collapsed = true;
        } else if (tab.selected) {
          if (!showOpenTabShut(folder, [tab])) {
            window.gZenFolders?.animateSelect?.(folder);
          }
        } else {
          window.gZenFolders?.on_TabGroupCollapse?.({ target: folder });
        }
      } catch (err) {
        console.error("[Zia] Could not settle the folder:", err);
      }
      // Zen slides the folder's list down into place, so the tab just dropped blinked out
      // and slid in from above: it's where it landed already
      jumpToEnd(folder);
    };

    let proxy = null;
    let proxyLeaveTimer = 0;
    let landingTab = null;
    const PROXY_MS = 140;
    // (back into a row quicker than it became a tile: as long, it lagged)
    const PROXY_BACK_MS = 100;

    // A drag's copies are clones of the tab, so Zen could take one for a real tab: taking
    // an essential out mid-drag, it moved the copy into the list and put it back after the
    // drop (a duplicate row). A copy is live until removed; one put back after is taken out.
    const liveCopies = new WeakSet();
    // Once in the list the copy was in the browser's cached tabs, which a removal doesn't
    // refresh: closing the selected tab then picked the copy, failed, and wouldn't close
    const dropCopy = (node) => {
      liveCopies.delete(node);
      Element.prototype.remove.call(node);
      try {
        gBrowser.tabContainer._invalidateCachedTabs?.();
        gBrowser.tabContainer._invalidateCachedVisibleTabs?.();
      } catch (err) {
        noteError("tab dragging: forget the copy", err);
      }
    };
    const trackCopy = (node) => {
      liveCopies.add(node);
      node.remove = function () {
        dropCopy(this);
      };
      return node;
    };
    // A floating copy of a tab, without the drag's own marks on it (among
    // them what a drop just before left: a lock that pins position, so the
    // copy stuck where it started and the drag was trapped)
    const cloneCopy = (tab) => {
      const copy = trackCopy(tab.cloneNode(true));
      copy.removeAttribute("id");
      for (const name of [
        "dragtarget", "pending-drag", "multiselected", "zen-pinned-changed", "folder-active", "zen-folder-active",
        "zia-drop-lock", "zia-landing", "zia-hover-held", "zia-held-pinned", "zia-shift", "zia-dragging", "zia-to-essential",
      ]) {
        copy.removeAttribute(name);
      }
      copy.setAttribute("zia-essential-proxy", "true");
      floatCopy(copy);
      return copy;
    };
    // its size eased (the drag's own rules turn transitions off)
    const easeSize = (node, ms) =>
      node.style.setProperty(
        "transition",
        ["width", "height", "min-width", "max-width", "min-height", "max-height"].map((name) => `${name} ${ms}ms ease-out`).join(", "),
        "important"
      );
    // a copy floating over everything, drawn from its middle (left, top)
    const floatCopy = (node) => {
      node.style.cssText = "";
      for (const [name, value] of [
        ["position", "fixed"],
        ["margin", "0"],
        ["z-index", "2147483646"],
        ["pointer-events", "none"],
        ["transform", "none"],
        ["translate", "-50% -50%"],
      ]) {
        node.style.setProperty(name, value, "important");
      }
    };

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

    // A split tile's halves fill an essential's inner box less 8px all round; a stand-in
    // isn't that size, so its halves get the real ones' size, centred. With none to measure,
    // worked out as the tile does it: 4:5, at most half its box less 3px (left to the
    // stand-in's own narrower box, each landed 2px wider)
    const fitSplitHalves = (node, stackHeight, half = null, tileWidth = 0) => {
      if (half) {
        node.style.setProperty("--zia-split-half-height", `${half.height}px`);
        node.style.setProperty("--zia-split-half-width", `${half.width}px`);
      } else if (stackHeight > 16) {
        const height = stackHeight - 16;
        node.style.setProperty("--zia-split-half-height", `${height}px`);
        if (tileWidth > 16) {
          node.style.setProperty("--zia-split-half-width", `${Math.min(height * 0.8, (tileWidth - 16) / 2 - 3)}px`);
        }
      }
    };

    const moveProxy = (x, y) => {
      const off = proxy.ziaOffset || { x: 0, y: 0 };
      proxy.style.setProperty("left", `${Math.round(x - off.x)}px`, "important");
      proxy.style.setProperty("top", `${Math.round(y - off.y)}px`, "important");
    };

    // A stand-in changing between a row and a tile hides what's in it while the box morphs
    // (an icon stretched a row wide, a split's icons sliding, looked broken), then blurs
    // into focus once it's the new shape, as Dia's morphs do
    const fadeSplitContent = (node, ms) => {
      if (!node) {
        return;
      }
      const blur = matchMedia("(prefers-reduced-motion: reduce)").matches ? "blur(0px)" : "blur(6px)";
      node.querySelector(".tab-content")?.animate(
        [
          { opacity: 0, filter: blur },
          { opacity: 0, filter: blur, offset: 0.45 },
          { opacity: 1, filter: "blur(0px)" },
        ],
        { duration: Math.round(ms * 1.5), easing: "ease-out" }
      );
    };

    const showProxy = (x, y) => {
      clearTimeout(proxyLeaveTimer);
      if (!proxy) {
        const host = root;
        if (!host || !drag?.tab) {
          return;
        }
        proxy = cloneCopy(drag.tab);
        proxy.setAttribute("zen-essential", "true");
        proxy.setAttribute("pinned", "true");
        proxy.id = "zia-essential-proxy";
        const row = drag.moving.getBoundingClientRect();
        sizeCopy(proxy, row.width, row.height);
        host.appendChild(proxy);
        if (drag.split) {
          // a split starts as its row (both sites, icon and title), and
          // morphs into its tile below
          dressSplitProxy(proxy, drag.tab);
          proxy.removeAttribute("zen-essential");
          proxy.removeAttribute("pinned");
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
      easeSize(proxy, PROXY_MS);
      if (!drag.moving.hasAttribute("zia-to-essential")) {
        tap();
      }
      drag.moving.setAttribute("zia-to-essential", "true");
      const tile = tileSize();

      // (and back into a tile, headed back over the essentials)
      if (!proxy.hasAttribute("zen-essential")) {
        proxy.setAttribute("zen-essential", "true");
        proxy.setAttribute("pinned", "true");
        if (drag.split) {
          fitSplitHalves(proxy, tile.stackHeight, tile.half, tile.width);
        }
        fadeSplitContent(proxy, PROXY_MS);
      }
      sizeCopy(proxy, tile.width, tile.height);
      moveProxy(x, y);
    };

    const hideProxy = () => {
      if (!proxy || proxy.ziaLeaving || !drag?.moving) {
        return;
      }
      proxy.ziaLeaving = true;
      // (back to its row, not a tile stretched to a row's size, as a split does)
      if (proxy.hasAttribute("zen-essential")) {
        const current = proxy.getBoundingClientRect();
        proxy.removeAttribute("zen-essential");
        proxy.removeAttribute("pinned");
        sizeCopy(proxy, current.width, current.height);
        proxy.getBoundingClientRect();
        fadeSplitContent(proxy, PROXY_BACK_MS);
      }
      // Eased frame by frame to wherever its row is now: Zen slides the list
      // up as its cell in the essentials goes, so the row's place moves as
      // the tile travels (sent to where it was, it landed off and jumped)
      const leaving = proxy;
      const moving = drag.moving;
      const from = leaving.getBoundingClientRect();
      const began = performance.now();
      leaving.style.setProperty("transition", "none", "important");
      const step = (now) => {
        if (proxy !== leaving || !leaving.ziaLeaving) {
          return;
        }
        const t = Math.min(1, (now - began) / PROXY_BACK_MS);
        const k = 1 - (1 - t) * (1 - t);
        const row = moving.getBoundingClientRect();
        const at = (a, b) => a + (b - a) * k;
        sizeCopy(leaving, at(from.width, row.width), at(from.height, row.height));
        moveProxy(at(from.left + from.width / 2, row.left + row.width / 2), at(from.top + from.height / 2, row.top + row.height / 2));
        if (t < 1) {
          requestAnimationFrame(step);
        }
      };
      requestAnimationFrame(step);
      proxyLeaveTimer = setTimeout(() => {
        if (proxy === leaving && leaving.ziaLeaving) {
          leaving.remove();
          proxy = null;
          moving.removeAttribute("zia-to-essential");
        }
      }, PROXY_BACK_MS);
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
            sizeCopy(tile, box.width, box.height);
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

    // Zen opens a cell for a tab dragged over the essentials but turns a split down there,
    // so Zia opens the same cell for a split essential, where the pointer is (always at the
    // end, the others never moved aside); over a tile it takes that tile's side, swapping.
    let splitSlot = null;
    const holdSplitSlot = (on, point = null) => {
      const grid = on ? window.gZenWorkspaces?.getCurrentEssentialsContainer?.() : null;
      if (!grid) {
        splitSlot?.remove();
        splitSlot = null;
        return;
      }
      if (!splitSlot || splitSlot.parentElement !== grid) {
        splitSlot?.remove();
        splitSlot = document.createXULElement("vbox");
        splitSlot.setAttribute("zia-split-slot", "true");
        grid.appendChild(splitSlot);
        fitSlot(splitSlot);
      }
      if (!point?.x && !point?.y) {
        return;
      }
      const cells = [...grid.children];
      // (not one still sliding: it's drawn where it was, under the pointer,
      // and swapped straight back, over and over)
      const tile = cells.find(
        (cell) =>
          cell !== splitSlot &&
          cell.classList?.contains("tabbrowser-tab") &&
          !cell.hasAttribute("zia-essential-proxy") &&
          !cell.getAnimations().some((a) => a.id === "zia-slot-slide") &&
          inBox(cell, point)
      );
      if (!tile) {
        return;
      }
      // (the tiles slide to their new places with a tap, as Zen's do: they jumped silently)
      const tiles = cells.filter((cell) => cell !== splitSlot && cell.classList?.contains("tabbrowser-tab") && !cell.hasAttribute("zia-essential-proxy"));
      const was = new Map(tiles.map((cell) => [cell, cell.getBoundingClientRect()]));
      if (cells.indexOf(splitSlot) < cells.indexOf(tile)) {
        tile.after(splitSlot);
      } else {
        tile.before(splitSlot);
      }
      tap();
      for (const cell of tiles) {
        const from = was.get(cell);
        const to = cell.getBoundingClientRect();
        const dx = from.left - to.left;
        const dy = from.top - to.top;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
          continue;
        }
        const slide = cell.animate([{ translate: `${dx}px ${dy}px` }, { translate: "0 0" }], { duration: 180, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
        slide.id = "zia-slot-slide";
      }
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

    const fillPicture = (node, tab) => {
      if (!node) {
        return;
      }
      const source = pictureSource();
      if (source) {
        let canvas = node.querySelector("canvas");
        if (!canvas) {
          canvas = document.createElementNS(XHTML_NS, "canvas");
          node.replaceChildren(canvas);
        }
        if (canvas.width !== source.width || canvas.height !== source.height) {
          canvas.width = source.width;
          canvas.height = source.height;
        }
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(source, 0, 0);
        node.removeAttribute("zia-card");
      } else if (!node.firstChild && tab) {
        const icon = document.createElementNS(XHTML_NS, "img");
        icon.setAttribute("src", gBrowser.getIcon(tab) || DEFAULT_TAB_ICON);
        node.replaceChildren(icon);
        node.setAttribute("zia-card", "true");
      }
    };
    const fillThumb = () => fillPicture(thumb, drag?.tab);

    const sizeThumb = (node, width, height) => {
      node.style.width = `${Math.round(width)}px`;
      node.style.height = `${Math.round(height)}px`;
    };
    // sized to a box and centred on it (it's drawn from its middle)
    const fitThumb = (node, box) => {
      sizeThumb(node, box.width, box.height);
      node.style.left = `${Math.round(box.left + box.width / 2)}px`;
      node.style.top = `${Math.round(box.top + box.height / 2)}px`;
    };

    const showThumb = (x, y) => {
      clearTimeout(thumbTimer);
      if (!thumb) {
        thumb = document.createElementNS(XHTML_NS, "div");
        thumb.id = "zia-drag-thumb";
        fitThumb(thumb, (bgOf(drag.tab) || drag.moving).getBoundingClientRect());
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
      fitThumb(leaving, (bgOf(drag.tab) || moving).getBoundingClientRect());
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

    // A closed folder whose one showing tab is dragged out is marked, so its room closes
    // smoothly once the tab lands (06: Zen's easing, as the spring's steps stuttered)
    const lendOut = (row) => {
      const home = row?.parentElement?.closest?.("zen-folder");
      if (!home || !isCollapsed(home) || !home.hasAttribute("has-active")) {
        return;
      }
      const showing = (home.activeTabs || []).filter((t) => t?.isConnected);
      if (showing.some((t) => t !== row && !row.contains?.(t))) {
        return;
      }
      home.setAttribute("zia-lent", "true");
    };
    // As the tab leaves, the folder's box is held where it ended through the drag, then
    // eased to its own height (in one step it snapped; held by its whole height it showed
    // more first, opening a little before closing)
    let lentHomes = [];
    const holdLent = () => {
      const homes = lentHomes;
      lentHomes = [];
      for (const home of homes) {
        let held = home.ziaHeldHeight;
        const boxBottom = home.ziaBoxBottom;
        const below = home.ziaBelow;
        home.ziaHeldHeight = home.ziaBoxBottom = home.ziaBelow = null;
        if (!home.isConnected || !(held > 0) || boxBottom == null) {
          continue;
        }
        // held so what's below stays where it was seen
        if (below?.node?.isConnected && !below.node.hasAttribute("zia-landing")) {
          const height = home.getBoundingClientRect().height;
          held = Math.max(0, height + below.top - below.node.getBoundingClientRect().top);
        }
        // its whole height (what's below stays) and its box's bottom where it was: as the tab
        // leaves, padding and inset change, and held by either alone the other moved
        home.style.setProperty("height", `${held}px`, "important");
        const inset = home.getBoundingClientRect().top + held - boxBottom;
        home.style.setProperty("--zia-hold-inset", `${inset}px`);
        home.setAttribute("zia-holding", "true");
        setTimeout(() => {
          home.style.removeProperty("height");
          home.removeAttribute("zia-holding");
          home.style.removeProperty("--zia-hold-inset");
          if (!home.isConnected) {
            return;
          }
          // (closed and showing no tab, it ends as its name alone: Zen is still shutting it,
          // a few pixels taller, so it eased open to that and snapped back)
          const shut = isCollapsed(home) && !home.hasAttribute("has-active") && !home.querySelector(".tabbrowser-tab[selected]");
          const own = shut && headerOf(home) ? headerOf(home).getBoundingClientRect().height : home.getBoundingClientRect().height;
          const ownInset = parseFloat(getComputedStyle(home, "::before").bottom) || 0;
          const timing = { duration: 200, easing: "cubic-bezier(0.25, 1, 0.5, 1)" };
          if (shut) {
            // ...held there until Zen has shut its list (sooner, it showed it part shut)
            const easing = home.animate([{ height: `${held}px` }, { height: `${own}px` }], { ...timing, fill: "forwards" });
            const until = performance.now() + 1000;
            const release = () => {
              const list = home.querySelector(":scope > .tab-group-container");
              const busy = home.getAnimations({ subtree: true }).some((a) => a !== easing && a.playState === "running");
              if (home.isConnected && performance.now() < until && (busy || (list && !list.hidden) || easing.playState === "running")) {
                requestAnimationFrame(release);
                return;
              }
              easing.cancel();
            };
            requestAnimationFrame(release);
          } else if (Math.abs(own - held) >= 0.5) {
            home.animate([{ height: `${held}px` }, { height: `${own}px` }], timing);
          }
          if (Math.abs(ownInset - inset) >= 0.5) {
            for (const pseudoElement of ["::before", "::after"]) {
              home.animate([{ bottom: `${inset}px` }, { bottom: `${ownInset}px` }], { ...timing, pseudoElement });
            }
          }
        }, 60);
      }
    };

    // What shows next below a folder (for holdLent: where it was seen)
    const shownAfter = (home) => {
      const strip = document.getElementById("tabbrowser-tabs");
      for (let at = home; at && at !== strip && strip?.contains(at); at = at.parentElement) {
        for (let next = at.nextElementSibling; next; next = next.nextElementSibling) {
          if (next.hasAttribute("zia-landing") || next.hasAttribute("zia-dragging")) {
            continue;
          }
          if (next.getBoundingClientRect().height > 0) {
            return next;
          }
        }
      }
      return null;
    };

    const unlend = () => {
      for (const home of document.querySelectorAll("zen-folder[zia-lent]")) {
        home.ziaLentUntil = Date.now() + 800;
        home.removeAttribute("zia-lent");
        // where its box ended through the drag (its visible bottom), for holdLent
        home.ziaBoxBottom = home.getBoundingClientRect().bottom - (parseFloat(getComputedStyle(home, "::before").bottom) || 0);
        home.ziaHeldHeight = home.getBoundingClientRect().height;
        // and where what's below was seen: the rows round it were shifted to show the tab gone,
        // so held by its height alone, what's below dropped a row first
        const below = shownAfter(home);
        home.ziaBelow = below ? { node: below, top: below.getBoundingClientRect().top } : null;
        lentHomes.push(home);
      }
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
      // Several tabs selected: the others fold into the one dragged (out of the list, the
      // rows closing up, a count on it), as macOS drags several things; Firefox moves them
      // all on the drop, and they show again there. (Only the dragged one moved, and the
      // rest jumped across on the drop.)
      if (!folder && !split && target.multiselected) {
        const others = gBrowser.selectedTabs.filter((tab) => tab !== target && !tab.hasAttribute("zen-essential") && tab.isConnected);
        for (const tab of others) {
          tab.setAttribute("zia-drag-companion", "true");
        }
        if (others.length) {
          target.setAttribute("zia-drag-count", String(others.length + 1));
        }
      }
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
        // (only between two side-by-side rows in the same list: a folder's name-to-tab gap and
        // its padding made the step short or long, and everything snapped the rest on the drop)
        const head = (row) => !!row.node?.classList?.contains("tab-group-label-container");
        const pair = (a, b) => !head(a) && !head(b) && a.node?.parentElement === b.node?.parentElement && side(a.top) === side(b.top);
        let best = Infinity;
        for (const row of rows) {
          if (Math.abs(row.index - mine.index) !== 1 || !pair(row, mine)) {
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
            if (!pair(sorted[i - 1], sorted[i])) {
              continue;
            }
            const gap = sorted[i].top - sorted[i - 1].top;
            if (fits(gap) && gap < best) {
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
      lendOut(split || (folder ? null : target));
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

    // An open folder is shut the moment it starts to be dragged (before the drag begins,
    // its animations jumped to their end so the list is closed at once), and dragged as a
    // closed folder. A plain click still just closes it.
    let snapping = null;
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
      if (inLibrary(event)) {
        return;
      }
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

    const essentialsGrid = () => window.gZenWorkspaces?.getCurrentEssentialsContainer?.() || document.querySelector(".zen-essentials-container");

    // the lowest of a bottom and the essentials' tiles' bottoms
    const tilesBottom = (bottom, grid = essentialsGrid()) => {
      for (const tile of grid?.querySelectorAll(".tabbrowser-tab[zen-essential]:not([zia-essential-proxy])") || []) {
        bottom = Math.max(bottom, tile.getBoundingClientRect().bottom);
      }
      return bottom;
    };
    const essentialsBottom = () => tilesBottom(document.getElementById("zen-essentials")?.getBoundingClientRect().bottom ?? -Infinity);

    // Over the tiles themselves or just below the last row: the essentials' own box stops
    // a little short of it, so a drag along it kept flipping into a list row.
    const overAnyTile = (point) => {
      const grid = essentialsGrid();
      if (!grid) {
        return false;
      }
      const box = grid.getBoundingClientRect();
      return box.width > 0 && point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= tilesBottom(box.bottom, grid) + 6;
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
        const sideBox = document.getElementById("navigator-toolbox")?.getBoundingClientRect();
        drag.away =
          !drag.folder && !!point.x && !over?.closest?.("#navigator-toolbox") && !!sideBox?.width &&
          (point.x < sideBox.left || point.x > sideBox.right);

        if (drag.away) {
          drag.essentials = false;
          setFlag("zia-drag-over-essentials", false);
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
        const grid = essentialsGrid();
        const hasTiles = !!grid?.querySelector(".tabbrowser-tab[zen-essential]:not([zia-essential-proxy])");
        const promo = over?.closest?.("zen-essentials-promo") || null;

        // (#zen-essentials can measure 0px tall with the tiles drawn above
        // it, so the space's own grid is measured too)
        let overEssentials =
          !!promo || !!over?.closest?.("#zen-essentials, .zen-essentials-container") || inBox(essentials, point) || inBox(grid, point);

        drag.firstTop = drag.rows?.length ? Math.min(...drag.rows.map((row) => row.top)) : null;
        if (!overEssentials && !hasTiles && drag.firstTop != null) {
          overEssentials = point.y < drag.firstTop + 4;
        }
        drag.hasTiles = hasTiles;
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
        holdSplitSlot(drag.splitEssential, point);
        if (drag.splitEssential) {
          acceptSplitDrop(event);
          if (point.x) {
            tapOnNewTile(point, null);
            showProxy(point.x, point.y);
          }
        } else if (drag.split) {
          hideProxy();
        }
        // the dragged tab's section stops covering the essentials, so Zen
        // sees them under the pointer and takes the drop
        setFlag("zia-drag-over-essentials", !!(drag.essentials || drag.splitEssential));
        drag.noTiles = drag.essentials && !hasTiles && !promo;
        makeRoom(drag.noTiles ? document.getElementById("zen-essentials") || grid : null);
        if (drag.essentials) {
          fitZenSlot();
        }
        if (drag.essentials && point.x) {
          tapOnTileShift();
          showProxy(point.x, point.y);
        } else if (!drag.essentials && !drag.splitEssential) {
          drag.tileShifts = null;
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
      const folder = target.node.closest?.(FOLDER_SELECTOR);
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
      // (a tab on its own in the list: half of a split, or a tab in a
      // folder, is narrower, and an essential dragged off came out that size)
      const sample = [...gBrowser.visibleTabs].find(
        (tab) => !tab.hasAttribute("zen-essential") && !tab.hasAttribute("zen-empty-tab") && !tab.group && tab.getBoundingClientRect().height > 8
      );
      const splitBox = sample
        ? null
        : [...document.querySelectorAll("#tabbrowser-tabs tab-group[split-view-group] > .tab-group-container")].find(
            (box) => !box.closest(FOLDER_SELECTOR) && box.getBoundingClientRect().height > 8
          );
      const bg = (sample?.querySelector(".tab-background") || splitBox)?.getBoundingClientRect();
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
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType === 1 && node.hasAttribute("zia-essential-proxy") && !liveCopies.has(node)) {
            dropCopy(node);
          }
        }
      }
    }).observe(document.getElementById("navigator-toolbox") || document.documentElement, { childList: true, subtree: true });

    // Zen's placeholder for a tab dragged over the essentials is a cell, and Zen sets the
    // grid's columns by cell count (eight essentials and it went three to a row) but shifts
    // the tiles by the old columns, past the sidebar's edge: the columns are kept meanwhile.
    new MutationObserver((records) => {
      for (const { target: grid, oldValue } of records) {
        const slot = grid.querySelector(":scope > vbox:not(.tabbrowser-tab)");
        if (!slot) {
          continue;
        }
        if (grid.ziaColumns?.slot !== slot) {
          grid.ziaColumns = { slot, value: oldValue };
        }
        const value = grid.ziaColumns.value;
        if (grid.getAttribute("data-hack-type") !== value) {
          if (value === null) {
            grid.removeAttribute("data-hack-type");
          } else {
            grid.setAttribute("data-hack-type", value);
          }
        }
      }
    }).observe(document.getElementById("navigator-toolbox") || document.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-hack-type"],
      attributeOldValue: true,
    });

    window.addEventListener("mousemove", (event) => {
      if (essentialDrag && event.buttons === 0 && Date.now() - (essentialDrag.startedAt || 0) > 300) {
        endEssentialDrag();
      }
    }, true);

    const onEssentialStart = (event) => {
      const tab = event.target?.closest?.(".tabbrowser-tab[zen-essential]");
      if (!tab || tab.hasAttribute("zia-essential-proxy") || !featureOn("dia-tab-drag") || inLibrary(event)) {
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
      const copy = cloneCopy(tab);
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

    // A tab over the essentials taps as Zen moves the tiles aside for it (by the tile under
    // the pointer, it tapped crossing tiles that didn't move and missed some that did)
    const tapOnTileShift = () => {
      setTimeout(() => {
        if (!drag?.essentials) {
          if (drag) {
            drag.tileShifts = null;
          }
          return;
        }
        const grid = window.gZenWorkspaces?.getCurrentEssentialsContainer?.();
        const tiles = grid ? [...grid.children].filter((cell) => cell.classList?.contains("tabbrowser-tab") && !cell.hasAttribute("zia-essential-proxy") && cell !== drag.tab) : [];
        const shifts = tiles.map((cell) => `${cell.style.transform}${cell.style.translate}`).join("|");
        if (drag.tileShifts != null && shifts !== drag.tileShifts) {
          tap();
        }
        drag.tileShifts = shifts;
      }, 0);
    };

    const OVER_GAP = {};
    let lastTileUnder = null;
    let lastTapPoint = null;
    let lastTapAt = 0;
    const tapOnNewTile = (point, skip) => {
      const tile = tileUnder(point, skip);
      if (tile && tile !== lastTileUnder && lastTileUnder !== null) {
        const box = tile.getBoundingClientRect();
        // half a tile on from the last tap, or long enough after: edge jitter doesn't tap twice,
        // but heading back over the same edge does
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
        // over the essentials but on no tile (the drop's gap, or its own spot): the next tile is
        // a new one, so moving back onto the tile that just slid aside taps again
        lastTileUnder = OVER_GAP;
      }
    };

    const listRoom = { rows: null, pitch: 0, sep: null, sepTop: null, sepDelta: 0, first: undefined, folder: null };

    // An essential dragged into the list goes into a folder as a tab does:
    // over a closed folder (its end), between the tabs of an open one, or
    // over an open empty one's slot
    const listRoomFolder = (prev, first, y) => {
      if (!prev) {
        return null;
      }
      if (isFolderEl(prev.node) && isCollapsed(prev.node)) {
        // Once in, it stays until its bottom meets the slot's, as a tab's does (it's drawn
        // centred on the pointer, so half a row past the name, plus the gap): at four
        // tenths it left the folder with its bottom still well inside
        const reach = listRoom.folder === prev.node ? listRoom.pitch / 2 + 2 : listRoom.pitch * 0.4;
        return listMid(y) < prev.top + prev.height + reach ? prev.node : null;
      }
      const label = prev.node.classList?.contains("tab-group-label-container");
      const folder = label ? prev.node.parentElement : prev.node.parentElement?.closest?.(FOLDER_SELECTOR);
      if (!folder || !isFolderEl(folder) || isCollapsed(folder)) {
        return null;
      }
      const firstInside = first && folder.contains(first.node) && first.node !== folder.labelContainerElement;
      if (firstInside) {
        return folder;
      }
      if (label && folder.hasAttribute("zia-empty") && y < prev.top + prev.height * 2) {
        return folder;
      }
      return null;
    };
    const markListRoomFolder = (folder) => {
      if (listRoom.folder === folder) {
        return;
      }
      listRoom.folder?.removeAttribute("zia-drop-slot");
      listRoom.folder = folder || null;
      folder?.setAttribute("zia-drop-slot", "true");
    };
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
    // Where it counts as being, for where it goes: as a dragged tab's, a row past
    // once it's 8px into where that row is shown, pushed down to make room. By the
    // rows' own middles it went into a folder, and out, three quarters of a row early.
    const listAt = (y) => y - (listRoom.pitch / 2 + 8);
    // The cuts a tab coming up past the separator uses, by the dragged row's middle (listAt
    // plus half a tab and 8px): above the separator until four fifths of a tab past its top,
    // and into the closed folder before it only four tenths of a tab into that folder's slot.
    // Cut at the separator's top and the folder's bottom, the place after the last folder
    // (the line right under it) was a sliver: it went into the folder sooner, and skipped it.
    const listMid = (y) => y + listRoom.pitch / 2 + 8;
    const aboveListSep = (y) => listRoom.sepTop != null && listMid(y) < listRoom.sepTop + listRoom.pitch * 0.8;
    const shapeListRoom = (pointerY) => {
      if (!listRoom.rows) {
        openListRoom();
      }
      const y = listAt(pointerY);
      let first = null;
      let prev = null;
      for (const row of listRoom.rows) {
        const down = row.mid > y;
        if (down && !first) {
          first = row;
        }
        if (!down) {
          prev = row;
        }
        const delta = down ? listRoom.pitch : 0;
        if (row.delta !== delta) {
          row.delta = delta;
          place(row.node, delta, false);
        }
      }
      if (listRoom.sep) {
        const delta = aboveListSep(y) ? listRoom.pitch : 0;
        if (listRoom.sepDelta !== delta) {
          listRoom.sepDelta = delta;
          place(listRoom.sep, delta, false);
        }
      }
      if (listRoom.button && listRoom.buttonBottom != null) {
        // New Tab at the top (Zen's option) sits under the separator, where nothing drops above
        // it: it moves with the separator rather than making way as at the foot of the list
        const delta = newTabOnTop() ? listRoom.sepDelta : listRoom.buttonBottom > y ? listRoom.pitch : 0;
        if (listRoom.buttonDelta !== delta) {
          listRoom.buttonDelta = delta;
          place(listRoom.button, delta, false);
        }
      }
      // a tap as the rows make way, or going into or out of a folder, as a tab's drag taps
      const folder = listRoomFolder(prev, first, y) || null;
      if (listRoom.first !== undefined && (first !== listRoom.first || folder !== listRoom.folder)) {
        tap();
      }
      listRoom.first = first;
      markListRoomFolder(folder);
      paintFolders({
        rows: listRoom.rows,
        target: { folder: listRoom.folder, slotTop: prev ? prev.top + prev.height : null },
        pitch: listRoom.pitch,
        height: listRoom.pitch,
        skip: () => false,
        outer: null,
        moving: null,
      });
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
      markListRoomFolder(null);
      clearFolderPaint();
      listRoom.rows = null;
      listRoom.first = undefined;
    };

    const dropIntoListRoom = (tab, y) => {
      const first = listRoom.first || null;
      const sep = listRoom.sep;
      const sepTop = listRoom.sepTop;
      const below = sepTop != null && !aboveListSep(listAt(y));
      const folder = listRoom.folder?.isConnected ? listRoom.folder : null;
      markListRoomFolder(null);
      listRoom.rows = null;
      listRoom.first = undefined;
      // Zen takes the tab out of the essentials in its own time after the drop: it's placed
      // once that's happened (or Zia does it after a second), or Zen's own placing (the end
      // of the list) stuck
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

      // It lands under the pointer, which the browser doesn't see until it next moves: its x
      // (or -) is kept on, as for a dropped tab (nothing under the pointer at the drop counts)
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
              if (folder) {
                const inside = first && folder.contains(first.node) ? first : null;
                splitIntoFolder(group, folder, { first: false, atEnd: !inside, next: inside });
                return;
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
          if (folder) {
            if (isCollapsed(folder)) {
              parkInFolder(tab, folder);
            } else if (first && folder.contains(first.node) && gBrowser.isTab(first.node)) {
              placeBefore(tab, first.node);
            } else {
              folder.addTabs?.([tab]);
            }
            return;
          }
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

    // The essentials slide from where they were to where a change puts them
    const slideTiles = (change) => {
      const grid = window.gZenWorkspaces?.getCurrentEssentialsContainer?.();
      const tiles = grid ? [...grid.querySelectorAll(":scope > .tabbrowser-tab")].filter((t) => !t.hasAttribute("zia-essential-proxy")) : [];
      const was = new Map(tiles.map((t) => [t, t.getBoundingClientRect()]));
      change();
      for (const t of tiles) {
        const from = was.get(t);
        const to = t.getBoundingClientRect();
        if (!from.width || !to.width) {
          continue;
        }
        const dx = from.left - to.left;
        const dy = from.top - to.top;
        if (Math.abs(dx) >= 0.5 || Math.abs(dy) >= 0.5) {
          t.animate([{ translate: `${dx}px ${dy}px` }, { translate: "0 0" }], { duration: 180, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
        }
      }
    };

    // An essential dragged out over the page (to the split cards) turns into
    // its page's picture, as a tab does, and back into its tile coming back
    // (it stayed a tile out there)
    const essentialThumb = (state, point) => {
      if (!state.thumb || state.thumb.hasAttribute("zia-leaving")) {
        clearTimeout(state.thumbTimer);
        state.thumb?.remove();
        const node = document.createElementNS(XHTML_NS, "div");
        node.id = "zia-drag-thumb";
        fitThumb(node, state.copy.getBoundingClientRect());
        root.appendChild(node);
        node.getBoundingClientRect();
        state.thumb = node;
        state.copy.setAttribute("zia-over-page", "true");
        tap();
      }
      fillPicture(state.thumb, state.tab);
      const size = pictureSize();
      sizeThumb(state.thumb, size.width, size.height);
      state.thumb.style.left = `${Math.round(point.x)}px`;
      state.thumb.style.top = `${Math.round(point.y)}px`;
    };
    const essentialThumbBack = (state) => {
      const node = state.thumb;
      if (!node || node.hasAttribute("zia-leaving")) {
        return;
      }
      node.setAttribute("zia-leaving", "true");
      fitThumb(node, state.copy.getBoundingClientRect());
      state.thumbTimer = setTimeout(() => {
        node.remove();
        if (state.thumb === node) {
          state.thumb = null;
          state.copy?.removeAttribute("zia-over-page");
        }
      }, THUMB_MS);
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
      const sideBox = document.getElementById("navigator-toolbox")?.getBoundingClientRect();
      if (sideBox?.width && !event.target?.closest?.("#navigator-toolbox") && (point.x < sideBox.left || point.x > sideBox.right)) {
        essentialThumb(state, point);
        return;
      }
      essentialThumbBack(state);
      tapOnNewTile(point, state.tab);
      const essentials = document.getElementById("zen-essentials");
      const overTiles = !!event.target?.closest?.("#zen-essentials") || inBox(essentials, point) || overAnyTile(point);
      // A row only once below the essentials altogether, so a drag along their last row stays
      // a tile; by their bottom as the drag began (afresh, the grid losing a row moved the line
      // past the pointer and back, flipping between tile and row)
      state.bottom ??= essentialsBottom();
      const asTab = !overTiles && inBox(document.getElementById("navigator-toolbox"), point) && point.y > state.bottom + 8;
      const copy = state.copy;
      if (asTab !== state.asTab) {
        state.asTab = asTab;
        state.rowFor = undefined;
        easeSize(copy, ESSENTIAL_MS);
        // (the others close up behind it out over the list, and open again if it comes back;
        // the only one keeps its cell: given up, the essentials emptied, the list jumped up under
        // the pointer and the row flashed over the first tab)
        const others = [...(essentialsGrid()?.querySelectorAll(".tabbrowser-tab[zen-essential]:not([zia-essential-proxy])") || [])].some((tile) => tile !== state.tab);
        slideTiles(() => state.tab.toggleAttribute("zia-essential-out", asTab && others));
        const current = copy.getBoundingClientRect();
        moveCopyTo(copy, asTab ? document.getElementById("tabbrowser-tabs") || root : root);
        sizeCopy(copy, current.width, current.height);
        copy.getBoundingClientRect();
        for (const name of ["zen-essential", "pinned"]) {
          if (asTab) {
            copy.removeAttribute(name);
          } else {
            copy.setAttribute(name, "true");
          }
        }
        fadeSplitContent(copy, ESSENTIAL_MS);
        const size = asTab ? plainTabSize() : state.tile;
        sizeCopy(copy, size.width, size.height);
        state.offset = asTab ? { x: 0, y: 0 } : state.offset;
      }
      // (as a row, the width a tab takes where it would go: over a folder, its
      // tabs' narrower width, as a dragged tab does; it stayed full width)
      let row = null;
      if (asTab) {
        shapeListRoom(point.y);
        row = widthFor(listRoom.folder);
        if (row && state.rowFor !== (listRoom.folder || "plain")) {
          state.rowFor = listRoom.folder || "plain";
          sizeCopy(copy, row.right - row.left, plainTabSize().height);
        }
      } else {
        closeListRoom();
      }
      const x = !asTab
        ? point.x - state.offset.x
        : row
          ? (row.left + row.right) / 2
          : (document.getElementById("navigator-toolbox")?.getBoundingClientRect().left || 0) + 8 + plainTabSize().width / 2;
      // (as a row, never over the essentials: turned into a row just below
      // them, it's centred on the pointer, and its top half showed over them)
      const y = asTab ? Math.max(point.y, essentialsBottom() + plainTabSize().height / 2 + 2) : point.y - state.offset.y;
      const shift = copy.ziaHostShift || { x: 0, y: 0 };
      copy.style.setProperty("left", `${Math.round(x - shift.x)}px`, "important");
      copy.style.setProperty("top", `${Math.round(y - shift.y)}px`, "important");
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
      clearTimeout(state.thumbTimer);
      state.thumb?.remove();
      state.thumb = null;
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
      const reveal = (now = false) => {
        state.tab.style.visibility = "";
        state.tab.removeAttribute("zia-essential-dragged");
        state.tab.removeAttribute("zia-essential-out");
        // (dropped into the list, the tab's already showing in its place:
        // the copy goes with it, not a frame later)
        if (now === true) {
          copy.remove();
        } else {
          requestAnimationFrame(() => copy.remove());
        }
      };
      // Dropped among the essentials: the tile glides from where it was let
      // go into its place (once that's settled) before the real one shows
      const glideHome = () => {
        // dropped into the list: it shows once it's in its place, not first
        // wherever Zen put it
        if (state.placing) {
          state.placing.finally(() => reveal(true));
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
          const t = Math.min(1, (performance.now() - began) / LAND_MS);
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
    // Firefox moves the dragged tab too, after Zia, and stops it at the last tab: under the
    // list its move won, two of the tab showing. Zia's move is put back after Firefox's go.
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
          // (it goes where the cell was opened for it)
          const before = splitSlot?.isConnected ? splitSlot.nextElementSibling : null;
          try {
            essential = addSplitToEssentials(tab);
            if (essential && before?.hasAttribute?.("zen-essential") && before !== essential) {
              gBrowser.moveTabBefore(essential, before);
            }
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
          // Into a closed folder Zia puts it there, Zen's drop not run: that opened the folder,
          // the dropped one missing for a frame, and left it open. Into an empty one too: Zen
          // moved it back out under the folder after Zia had put it in, and the folder, emptied,
          // shut over the gap
          if (target.folder && (isCollapsed(target.folder) || target.folder.hasAttribute("zia-empty")) && target.folder !== folder && !folder.contains(target.folder)) {
            event.preventDefault();
            event.stopPropagation();
          }
          // (the folder it goes into keeps its hover box too, as for a tab:
          // it went blank until the pointer next moved)
          heldFolder = target.folder || null;
          pendingFinish = true;
          setTimeout(() => {
            try {
              finishFolderDrop(folder, target);
              // (held where it was let go in the same step, as a tab is: a frame showed it at its
              // new place still shifted by the drag, up and back down)
              repinLanding?.();
            } catch (err) {
              console.error("[Zia] Folder drop failed:", err);
            }
            pendingFinish = false;
          }, 0);
        } else if (tab && !drag.folder && !drag.away && drag.target?.hand) {
          const target = drag.target;
          // Zia places it, Zen's drop not run: told to drop it where it was, Zen still took a tab
          // in a closed folder out of it for a frame (its favicon flashing left of where it lands).
          // Several selected go with it (finishDrop), in the order they're in now.
          const party = tab.multiselected
            ? gBrowser.selectedTabs.filter((t) => t.isConnected && !t.hasAttribute("zen-essential") && !t.group?.hasAttribute?.("split-view-group"))
            : null;
          event.preventDefault();
          event.stopPropagation();
          heldFolder = target.folder || null;
          heldPinned = !target.below;
          pendingFinish = true;
          // Put in place as the drop settles, in the same step (see settle): a moment later, the
          // room made for it in a folder had closed and it showed outside, full width, for a frame
          const run = () => {
            try {
              finishDrop(tab, target, party);
              // (its width put right as it moves: the row's new width showed
              // first otherwise, 14px narrower)
              refitLanding?.();
              repinLanding?.();
              refitHeld?.();
            } catch (err) {
              console.error("[Zia] Tab drop failed:", err);
            }
            pendingFinish = false;
          };
          finishNow = run;
          setTimeout(() => {
            if (finishNow === run) {
              finishNow = null;
              run();
            }
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
        const props = ["overflow", "overflow-x", "overflow-y", "contain"];
        remember(el, props);
        for (const prop of props) {
          el.style.setProperty(prop, prop === "contain" ? "none" : "visible", "important");
        }
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

    // What's just dropped keeps its hover look (box, x): the drag's look ends a frame before
    // the browser sees the pointer still over it, and Firefox forgets what's hovered until the
    // pointer next moves (Zen shows x and - only on hover), so what showed is noted and kept
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
      // The dragged tab lets the pointer through, so its own button wasn't noted: dropped into
      // a folder it showed nothing until the browser found the pointer on it (a split: both
      // its tabs' x, as it shows both while hovered)
      const dropSplit = gBrowser.isTab(folder) && folder.group?.hasAttribute?.("split-view-group") ? folder.group : null;
      if (gBrowser.isTab(folder) && !buttons.some((button) => (dropSplit || folder).contains(button))) {
        for (const tab of dropSplit ? [...dropSplit.querySelectorAll(".tabbrowser-tab")] : [folder]) {
          const own = tab.querySelector(tab.pinned ? ".tab-reset-button" : ".tab-close-button");
          if (own) {
            buttons.push(own);
          }
        }
      }
      for (const node of held) {
        node.setAttribute("zia-hover-held", "true");
      }
      for (const button of buttons) {
        button.setAttribute("zia-held-shown", "true");
      }
      // A tab dropped into a folder is pinned there and shows a - where it had an x (the other
      // way pulled out): swapped as soon as it's let go, not when the pointer next moved
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
      // Over a node by where the pointer is, not :hover: Zen tidies a folder just after a drop
      // and Firefox forgets the hover, so a move then let go and the folder's box flashed
      const over = (node, event) => {
        if (node.matches(":hover")) {
          return true;
        }
        if (!event?.clientX && !event?.clientY) {
          return false;
        }
        const box = node.getBoundingClientRect();
        return event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
      };
      const check = (event) => {
        if (!held.some((node) => node.isConnected && over(node, event))) {
          release();
          return;
        }
        // a button is held only while the pointer is on its own tab (on to the next tab in the
        // same folder, both showed their -)
        buttons = buttons.filter((button) => {
          const tab = button.closest(".tabbrowser-tab");
          // (a split's x's are held while it's hovered, either tab)
          const host = tab?.closest("tab-group[split-view-group]") || tab;
          if (host && over(host, event)) {
            return true;
          }
          button.removeAttribute("zia-held-shown");
          tab?.removeAttribute("zia-held-pinned");
          if (tab && held.includes(tab)) {
            tab.removeAttribute("zia-hover-held");
          }
          return false;
        });
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
    let refitLanding = null;
    let finishNow = null;
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
        const bgBox = bg?.getBoundingClientRect();
        droppedFrom = { node: drag.moving, top: from.top, left: from.left, tab: drag.tab, bg, bgLeft: bgBox?.left, bgWidth: bgBox?.width };
      }
      essentialDropped = null;
      // (a folder let go is moved a step later: its folders keep their look till then)
      const folderLanding = !!drag?.folder && pendingFinish;
      if (drag?.folder) {
        const dropped = drag.folder;
        // (a landing one goes just before its glide, which measures it)
        setTimeout(() => {
          if (!dropped.hasAttribute("zia-landing")) {
            unmorphFolder(dropped);
          }
        }, 0);
      }
      if (drag?.bg) {
        setTimeout(() => requestAnimationFrame(() => easeOutWidth(droppedTab)), 0);
      }
      drag = null;
      pending = null;
      document.documentElement.removeAttribute("zia-dragging-tab");
      for (const tab of document.querySelectorAll("[zia-drag-companion]")) {
        tab.removeAttribute("zia-drag-companion");
      }
      for (const tab of document.querySelectorAll("[zia-drag-count]")) {
        tab.removeAttribute("zia-drag-count");
      }
      setFlag("zia-drag-over-essentials", false);
      muteZenHaptics(false);
      reclip();
      document.querySelectorAll("[zia-drop-slot]").forEach((folder) => folder.removeAttribute("zia-drop-slot"));
      if (document.querySelector("[zia-left]")) {
        // (until the mouse moves, when Firefox works out what's hovered)
        window.addEventListener("mousemove", () => document.querySelectorAll("[zia-left]").forEach((folder) => folder.removeAttribute("zia-left")), { once: true, capture: true });
      }
      unlend();
      document.querySelectorAll("[zia-into-empty]").forEach((tab) => {
        tab.removeAttribute("zia-into-empty");
        tab.style.removeProperty("--zia-slot-border");
      });
      // (cleared at once, the folder it left wrapped it again, or the one it went into shut
      // to its name, for a frame before it moved)
      if (folderLanding) {
        setTimeout(clearFolderPaint, 0);
      } else {
        clearFolderPaint();
      }
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
        // Firefox clears every tab's transform as its drag ends, so the tab painted a frame at
        // its new spot before the glide: it's pinned where let go each frame until the drop moves it
        const pin = () => {
          if (!node.isConnected) {
            return;
          }
          node.style.removeProperty("transform");
          const at = node.getBoundingClientRect();
          node.style.setProperty("transform", `translate(${landing.left - at.left}px, ${landing.top - at.top}px)`, "important");
        };
        repinLanding = pin;
        refitLanding = landing.bg ? () => settleDroppedWidth(landing.tab, landing.bgWidth) : null;
        const glideIn = () => {
          if (pendingFinish) {
            pin();
            requestAnimationFrame(glideIn);
            return;
          }
          repinLanding = null;
          refitLanding = null;
          refitHeld?.();
          node.style.removeProperty("transform");
          // the narrower look goes before the glide, which then starts the background where it
          // showed (in a folder, it stepped left as the glide began and slid back)
          if (landing.bg) {
            settleDroppedWidth(landing.tab, landing.bgWidth);
          }
          unmorphFolder(node);
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
      // A new drag started within the settling time is left alone: the wipe undid the offsets
      // Zen gives the other essentials to open a gap
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

          // Firefox hides what's dragged until its own drop animation ends: for a folder, a part
          // inside it, so the whole folder vanished for a moment after landing
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
      // the drop's own placing, now its landing is set up
      if (finishNow) {
        const run = finishNow;
        finishNow = null;
        run();
      }
      holdLent();
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

    // A drag that ends where this window can't see (another window, the desktop, its tab
    // closed) never sends dragend, leaving every tab's x hidden until a restart. No mouse
    // moves arrive during a drag, so a move with no button held means it's over: tidy up.
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
      const button = document.createElementNS(XHTML_NS, "button");
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
  // A page glanced at from an essential: a small card springs out from behind its
  // icon (CSS) and, as Zen takes the tab away at once, a stand-in is sucked back in.
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

  // Extension icons: right-click an extension's button (in the toolbar or
  // the extensions panel) to give it an icon of your own, an SVG from your
  // computer or one of Zia's icons. An SVG takes the toolbar's colour, as
  // Zia's own icons do, unless it keeps its own colours. Extensions that
  // change their icon themselves (on or off, per site) are noted, since a
  // custom icon hides that.
  const EXT_ICONS_PREF = "zia.extensionIcons";
  const EXT_CHANGING_PREF = "zia.extensionIcons.changing";
  const EXT_SVG_MAX = 300 * 1024;
  let extIcons = null;
  let extChanging = null;
  let extSheet = null;

  function readJSONPref(name, fallback) {
    try {
      return JSON.parse(Services.prefs.getStringPref(name, "")) || fallback;
    } catch (err) {
      return fallback;
    }
  }

  function extIconMap() {
    if (!extIcons) {
      extIcons = readJSONPref(EXT_ICONS_PREF, {});
    }
    return extIcons;
  }

  function saveExtIcons() {
    try {
      Services.prefs.setStringPref(EXT_ICONS_PREF, JSON.stringify(extIconMap()));
    } catch (err) {
      noteError("extension icons: save", err);
    }
  }

  function changingSet() {
    if (!extChanging) {
      extChanging = new Set(readJSONPref(EXT_CHANGING_PREF, []));
    }
    return extChanging;
  }

  function extIconsDir() {
    return PathUtils.join(PathUtils.profileDir, "zia-icons", "extensions");
  }

  // Uploaded icons are read through resource://, like Zia's own: Firefox
  // only lets an SVG take the toolbar's colour from there, not from a file
  const EXT_ICON_HOST = "zia-extension-icons";
  function pointAtExtIcons() {
    pointResource(EXT_ICON_HOST, `${PathUtils.toFileURI(extIconsDir())}/`);
  }

  function extIconUrl(entry) {
    if (!entry.uploaded) {
      return entry.url;
    }
    const name = entry.own ? entry.file : entry.tinted || entry.file;
    return name ? `resource://${EXT_ICON_HOST}/${encodeURIComponent(name)}` : "";
  }

  // The custom icons as one stylesheet: each overrides the image Firefox
  // gives the button (in the toolbar and the panel, light and dark)
  function applyExtIcons() {
    const rules = [];
    for (const [id, entry] of Object.entries(extIconMap())) {
      const url = extIconUrl(entry);
      if (!url) {
        continue;
      }
      const selector = `.webextension-browser-action[data-extensionid="${id.replace(/["\\]/g, "\\$&")}"]`;
      const image = `url("${url.replace(/["\\]/g, "\\$&")}")`;
      rules.push(`${selector} {
        --webextension-toolbar-image: ${image} !important;
        --webextension-toolbar-image-dark: ${image} !important;
        --webextension-menupanel-image: ${image} !important;
        --webextension-menupanel-image-dark: ${image} !important;
      }`);
      // (in the same shade as reload and the sidebar button beside them,
      // as the other extensions' are, 02-address-bar)
      if (!entry.own) {
        rules.push(`${selector}, ${selector} .toolbarbutton-icon {
          -moz-context-properties: fill, fill-opacity, stroke, stroke-opacity !important;
          fill: var(--toolbarbutton-icon-fill, var(--zia-toolbar-ink, currentColor)) !important;
          stroke: var(--toolbarbutton-icon-fill, var(--zia-toolbar-ink, currentColor)) !important;
          fill-opacity: 1 !important;
          stroke-opacity: 1 !important;
        }`);
      }
    }
    const utils = window.windowUtils;
    if (extSheet) {
      try {
        utils.removeSheetUsingURIString(extSheet, utils.AUTHOR_SHEET);
      } catch (err) {
        noteError("extension icons: remove sheet", err);
      }
      extSheet = null;
    }
    extSheet = `data:text/css;charset=utf-8,${encodeURIComponent(rules.join("\n"))}`;
    try {
      utils.loadSheetUsingURIString(extSheet, utils.AUTHOR_SHEET);
    } catch (err) {
      noteError("extension icons: load sheet", err);
    }
  }

  // Only the drawing is kept: no scripts, links out, embedded pages or
  // pictures, or event handlers
  function cleanSvgText(text) {
    const svgText = svgSourceOf(text);
    if (!svgText) {
      return null;
    }
    const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
    const svg = doc.documentElement;
    if (!svg || svg.localName !== "svg" || doc.getElementsByTagName("parsererror").length) {
      return null;
    }
    for (const el of [...svg.querySelectorAll("script, foreignObject, iframe, object, embed, audio, video, image, feImage")]) {
      el.remove();
    }
    const outside = /url\(\s*['"]?\s*(?!#)/i;
    for (const el of [svg, ...svg.querySelectorAll("*")]) {
      for (const attr of [...el.attributes]) {
        const name = attr.name.toLowerCase();
        const value = attr.value.trim();
        if (name.startsWith("on") || ((name === "href" || name === "xlink:href") && !value.startsWith("#")) || outside.test(value)) {
          el.removeAttribute(attr.name);
        }
      }
    }
    for (const style of svg.querySelectorAll("style")) {
      style.textContent = style.textContent.replace(/@import[^;]*;?/gi, "").replace(/url\(\s*['"]?\s*(?!#)[^)]*\)/gi, "none");
    }
    if (!svg.hasAttribute("viewBox")) {
      const width = parseFloat(svg.getAttribute("width"));
      const height = parseFloat(svg.getAttribute("height"));
      if (width > 0 && height > 0) {
        svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      }
    }
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    return svg;
  }

  // Its colours become the toolbar's (what Zia's own icons use)
  function tintSvg(svg) {
    const copy = svg.cloneNode(true);
    const keep = /^(none|transparent)$/i;
    for (const el of [copy, ...copy.querySelectorAll("*")]) {
      for (const prop of ["fill", "stroke"]) {
        const value = el.getAttribute(prop);
        if (value && !keep.test(value.trim())) {
          el.setAttribute(prop, "context-fill");
        }
      }
      const inline = el.getAttribute("style");
      if (inline) {
        el.setAttribute("style", inline.replace(/(^|;)\s*(fill|stroke)\s*:\s*(?!none|transparent)[^;]+/gi, "$1$2: context-fill"));
      }
    }
    for (const style of copy.querySelectorAll("style")) {
      style.textContent = style.textContent.replace(/\b(fill|stroke)\s*:\s*(?!none|transparent)[^;}]+/gi, "$1: context-fill");
    }
    if (!copy.hasAttribute("fill")) {
      copy.setAttribute("fill", "context-fill");
    }
    return copy;
  }

  async function removeExtIconFiles(entry) {
    if (!entry?.uploaded) {
      return;
    }
    for (const name of [entry.file, entry.tinted]) {
      if (name && !/[\\/]/.test(name)) {
        try {
          await IOUtils.remove(PathUtils.join(extIconsDir(), name), { ignoreAbsent: true });
        } catch (err) {
          noteError("extension icons: remove file", err);
        }
      }
    }
  }

  async function setExtIcon(id, entry) {
    const old = extIconMap()[id];
    if (entry) {
      extIconMap()[id] = entry;
    } else {
      delete extIconMap()[id];
    }
    saveExtIcons();
    applyExtIcons();
    if (old && old.file !== entry?.file) {
      await removeExtIconFiles(old);
    }
  }

  // A custom icon hides an extension's own changes to its icon: said first
  function okToCover(id) {
    if (!changingSet().has(id)) {
      return true;
    }
    const prompts = Services.prompt;
    const pressed = prompts.confirmEx(
      window,
      "This extension changes its own icon",
      "It uses its icon to show what it's doing (on or off, or something for the site you're on). A custom icon will hide that.",
      prompts.BUTTON_POS_0 * prompts.BUTTON_TITLE_IS_STRING + prompts.BUTTON_POS_1 * prompts.BUTTON_TITLE_CANCEL + prompts.BUTTON_POS_1_DEFAULT,
      "Use it anyway",
      null,
      null,
      null,
      {}
    );
    return pressed === 0;
  }

  // Asks for an SVG and cleans it: null when cancelled or unusable (said)
  function askForSvg(then) {
    const picker = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
    picker.init(window.browsingContext, "Choose an SVG icon", Ci.nsIFilePicker.modeOpen);
    picker.appendFilter("SVG images", "*.svg");
    picker.open(async (result) => {
      if (result !== Ci.nsIFilePicker.returnOK || !picker.file) {
        then(null);
        return;
      }
      try {
        const path = picker.file.path;
        if (!/\.svg$/i.test(path)) {
          Services.prompt.alert(window, "Only SVG icons", "Choose an .svg file: it can take the toolbar's colour, as Zia's own icons do.");
          then(null);
          return;
        }
        const info = await IOUtils.stat(path);
        if (info.size > EXT_SVG_MAX) {
          Services.prompt.alert(window, "That SVG is too big", "Icons need to be under 300 KB.");
          then(null);
          return;
        }
        const svg = cleanSvgText(await IOUtils.readUTF8(path));
        if (!svg) {
          Services.prompt.alert(window, "That isn't an SVG Zia can read", "Choose another .svg file.");
        }
        then(svg);
      } catch (err) {
        console.error("[Zia] Could not use that icon:", err);
        then(null);
      }
    });
  }

  // Writes the SVG as it is and tinted, returning the two file names
  async function saveSvgIcon(dir, base, svg) {
    const serialize = (node) => new XMLSerializer().serializeToString(node);
    await IOUtils.makeDirectory(dir, { ignoreExisting: true });
    await IOUtils.writeUTF8(PathUtils.join(dir, `${base}.svg`), serialize(svg));
    await IOUtils.writeUTF8(PathUtils.join(dir, `${base}.tinted.svg`), serialize(tintSvg(svg)));
    return { file: `${base}.svg`, tinted: `${base}.tinted.svg` };
  }

  function chooseExtSvg(id) {
    if (!okToCover(id)) {
      return;
    }
    askForSvg(async (svg) => {
      if (!svg) {
        return;
      }
      try {
        const names = await saveSvgIcon(extIconsDir(), `${id.replace(/[^\w.-]+/g, "_")}-${Date.now()}`, svg);
        pointAtExtIcons();
        await setExtIcon(id, { ...names, own: !!extIconMap()[id]?.own, uploaded: true });
      } catch (err) {
        console.error("[Zia] Could not use that icon:", err);
      }
    });
  }

  // Your own SVGs for folders and spaces (their menus' Change icon):
  // kept in the profile and read, tinted like Zia's icons, through
  // resource://, pointed at as this script loads, since Zen draws folder
  // and space icons as it restores them, before the rest of Zia starts.
  const OWN_ICON_HOST = "zia-own-icons";
  function ownIconsDir() {
    return PathUtils.join(PathUtils.profileDir, "zia-icons", "own");
  }
  function pointAtOwnIcons() {
    pointResource(OWN_ICON_HOST, `${PathUtils.toFileURI(ownIconsDir())}/`);
  }
  try {
    pointAtOwnIcons();
  } catch (err) {
    noteError("own icons: early", err);
  }

  // Asks for an SVG and gives its (tinted) address, or null
  function chooseOwnSvg() {
    return new Promise((resolve) => {
      askForSvg(async (svg) => {
        if (!svg) {
          resolve(null);
          return;
        }
        try {
          const { tinted } = await saveSvgIcon(ownIconsDir(), `icon-${Date.now()}`, svg);
          pointAtOwnIcons();
          resolve(`resource://${OWN_ICON_HOST}/${encodeURIComponent(tinted)}`);
        } catch (err) {
          console.error("[Zia] Could not use that icon:", err);
          resolve(null);
        }
      });
    });
  }

  function pickExtIcon(id, anchor) {
    const icons = window.gZenEmojiPicker;
    if (!icons?.open || !okToCover(id)) {
      return;
    }
    // Opened from the extensions menu, the picker hangs off its toolbar
    // button instead: the menu closes when the picker is clicked, and the
    // picker would close with it.
    const inMenu = anchor?.closest?.("panel, menupopup");
    const shown = anchor?.isConnected && !inMenu && anchor.getBoundingClientRect().width > 0;
    const at = shown ? anchor : document.getElementById("unified-extensions-button") || document.getElementById("nav-bar");
    // The picker stays open, and each icon clicked goes on the button
    // straight away; the bin puts the extension's own icon back
    const onSelect = (url) => {
      if (url === null) {
        setExtIcon(id, null);
      } else if (typeof url === "string" && /^(chrome|resource):/.test(url)) {
        setExtIcon(id, { url, own: false, uploaded: false });
      }
    };
    try {
      Promise.resolve(icons.open(at, { onlySvgIcons: true, allowNone: !!extIconMap()[id], closeOnSelect: false, onSelect })).catch(() => {});
    } catch (err) {
      noteError("extension icons: open the picker", err);
    }
  }

  // Which extensions change their icon: seen when the image Firefox gives
  // the button changes after it's first drawn
  const watchedExtButtons = new WeakSet();
  function extImageOf(button) {
    return (button.getAttribute("style") || "").match(/--webextension-toolbar-image:\s*([^;]+);/)?.[1]?.trim() || "";
  }
  function watchExtButtons() {
    for (const button of document.querySelectorAll(".webextension-browser-action[data-extensionid]")) {
      if (watchedExtButtons.has(button)) {
        continue;
      }
      watchedExtButtons.add(button);
      let first = extImageOf(button);
      new MutationObserver(() => {
        const now = extImageOf(button);
        if (!now || now === first) {
          return;
        }
        if (!first) {
          first = now;
          return;
        }
        const id = button.getAttribute("data-extensionid");
        if (id && !changingSet().has(id)) {
          changingSet().add(id);
          try {
            Services.prefs.setStringPref(EXT_CHANGING_PREF, JSON.stringify([...changingSet()]));
          } catch (err) {
            noteError("extension icons: note a change", err);
          }
        }
      }).observe(button, { attributes: true, attributeFilter: ["style"] });
    }
  }

  function menuItem(label) {
    const item = document.createXULElement("menuitem");
    item.setAttribute("label", label);
    return item;
  }

  function addExtIconMenus() {
    for (const menuId of ["toolbar-context-menu", "unified-extensions-context-menu"]) {
      const menu = document.getElementById(menuId);
      if (!menu || menu.querySelector(".zia-ext-icon-menu")) {
        continue;
      }
      const separator = document.createXULElement("menuseparator");
      separator.className = "zia-ext-icon-separator";
      const item = document.createXULElement("menu");
      item.className = "zia-ext-icon-menu";
      item.setAttribute("label", "Change icon");
      const popup = document.createXULElement("menupopup");
      const note = menuItem("This extension changes its own icon");
      note.setAttribute("disabled", "true");
      note.className = "zia-ext-icon-note";
      const noteSeparator = document.createXULElement("menuseparator");
      const upload = menuItem("Choose an SVG…");
      const choose = menuItem("Pick from Zia's icons…");
      const keepSeparator = document.createXULElement("menuseparator");
      const keep = menuItem("Keep the SVG's own colours");
      keep.setAttribute("type", "checkbox");
      const reset = menuItem("Reset to the original icon");
      popup.append(note, noteSeparator, upload, choose, keepSeparator, keep, reset);
      item.append(popup);
      menu.append(separator, item);

      let target = null;
      menu.addEventListener("popupshowing", (event) => {
        if (event.target !== menu) {
          return;
        }
        target = menu.triggerNode?.closest?.("[data-extensionid]") || null;
        const id = target?.getAttribute("data-extensionid");
        const show = !!id;
        item.hidden = separator.hidden = !show;
        if (!show) {
          return;
        }
        watchExtButtons();
        const entry = extIconMap()[id];
        const changes = changingSet().has(id);
        note.hidden = noteSeparator.hidden = !changes;
        keep.hidden = !entry?.uploaded;
        keep.setAttribute("checked", String(!!entry?.own));
        reset.disabled = !entry;
      });
      const idOf = () => target?.getAttribute("data-extensionid");
      const buttonOf = () => (target?.matches?.(".webextension-browser-action") ? target : target?.querySelector?.(".webextension-browser-action")) || target;
      upload.addEventListener("command", () => idOf() && chooseExtSvg(idOf()));
      choose.addEventListener("command", () => idOf() && pickExtIcon(idOf(), buttonOf()));
      keep.addEventListener("command", () => {
        const id = idOf();
        const entry = id && extIconMap()[id];
        if (entry) {
          setExtIcon(id, { ...entry, own: keep.getAttribute("checked") === "true" });
        }
      });
      reset.addEventListener("command", () => idOf() && setExtIcon(idOf(), null));
    }
  }

  function watchExtensionIcons() {
    try {
      pointAtExtIcons();
    } catch (err) {
      noteError("extension icons: point at folder", err);
    }
    applyExtIcons();
    addExtIconMenus();
    try {
      addOwnIconMenus();
    } catch (err) {
      noteError("own icons: menus", err);
    }
    watchExtButtons();
    try {
      CustomizableUI.addListener({
        onWidgetAfterDOMChange: () => watchExtButtons(),
        onWidgetAdded: () => requestAnimationFrame(watchExtButtons),
        onWidgetCreated: () => requestAnimationFrame(watchExtButtons),
      });
    } catch (err) {
      noteError("extension icons: listen", err);
    }
    document.getElementById("unified-extensions-panel")?.addEventListener("popupshowing", watchExtButtons);
    setTimeout(watchExtButtons, 3000);
  }

  // Folders and spaces: Zen's "Change icon" becomes a menu like the
  // extensions' one, with your own SVG, Zia's icons (Zen's picker), your
  // SVG's own colours, and taking the icon off. Zen's own item stays,
  // hidden, as the way to its picker.
  const OWN_ICON_PREFIX = `resource://${OWN_ICON_HOST}/`;
  const isOwnIcon = (url) => typeof url === "string" && url.startsWith(OWN_ICON_PREFIX);
  const ownColoursOf = (url) => isOwnIcon(url) && !/\.tinted\.svg$/.test(url);

  function iconTargets() {
    return {
      folder: {
        menuId: "zenFolderActions",
        itemId: "context_zenFolderChangeIcon",
        find(menu) {
          const folder = folderFromNode(menu.triggerNode);
          return folder?.isZenFolder ? folder : null;
        },
        icon: (folder) => folder.iconURL || null,
        set(folder, url) {
          gZenFolders.setFolderUserIcon(folder, url);
          folder.dispatchEvent(new CustomEvent("TabGroupUpdate", { bubbles: true }));
        },
        pick: (folder) => gZenFolders.changeFolderUserIcon(folder),
      },
      space: {
        menuId: "zenWorkspaceMoreActions",
        itemId: "context_zenEditWorkspaceIcon",
        find(menu) {
          const node = menu.triggerNode;
          const id = node?.closest?.("toolbarbutton[zen-workspace-id]")?.getAttribute("zen-workspace-id") || gZenWorkspaces.activeWorkspace;
          return gZenWorkspaces.getWorkspaceFromId(id) ? id : null;
        },
        icon: (id) => gZenWorkspaces.getWorkspaceFromId(id)?.icon || null,
        async set(id, url) {
          const space = gZenWorkspaces.getWorkspaceFromId(id);
          if (space) {
            space.icon = url;
            await gZenWorkspaces.saveWorkspace(space);
          }
        },
        pick: () => gZenWorkspaces.changeWorkspaceIcon(),
      },
    };
  }

  function addOwnIconMenus() {
    for (const target of Object.values(iconTargets())) {
      const menu = document.getElementById(target.menuId);
      const zens = document.getElementById(target.itemId);
      if (!menu || !zens || menu.querySelector(".zia-own-icon-menu")) {
        continue;
      }
      const item = document.createXULElement("menu");
      item.className = "zia-own-icon-menu";
      item.setAttribute("label", "Change icon");
      const popup = document.createXULElement("menupopup");
      const upload = menuItem("Choose an SVG…");
      const choose = menuItem("Pick from Zia's icons…");
      const keepSeparator = document.createXULElement("menuseparator");
      const keep = menuItem("Keep the SVG's own colours");
      keep.setAttribute("type", "checkbox");
      const remove = menuItem("Remove icon");
      popup.append(upload, choose, keepSeparator, keep, remove);
      item.append(popup);
      zens.before(item);

      let subject = null;
      menu.addEventListener("popupshowing", (event) => {
        if (event.target !== menu) {
          return;
        }
        subject = null;
        try {
          subject = target.find(menu);
        } catch (err) {
          noteError("own icons: find", err);
        }
        // Zen's item stays hidden either way: ours takes its place
        zens.hidden = true;
        item.hidden = !subject;
        if (!subject) {
          zens.hidden = false;
          return;
        }
        const icon = target.icon(subject);
        keep.hidden = !isOwnIcon(icon);
        keep.setAttribute("checked", String(ownColoursOf(icon)));
        remove.disabled = !icon;
      });
      const run = (what) => async () => {
        const at = subject;
        if (at === null) {
          return;
        }
        try {
          await what(at);
        } catch (err) {
          console.error("[Zia] Could not change the icon:", err);
        }
      };
      upload.addEventListener("command", run(async (at) => {
        const url = await chooseOwnSvg();
        if (url) {
          await target.set(at, url);
        }
      }));
      choose.addEventListener("command", run((at) => target.pick(at)));
      keep.addEventListener("command", run(async (at) => {
        const icon = target.icon(at);
        if (!isOwnIcon(icon)) {
          return;
        }
        const own = keep.getAttribute("checked") === "true";
        const url = own ? icon.replace(/\.tinted\.svg$/, ".svg") : icon.replace(/(?<!\.tinted)\.svg$/, ".tinted.svg");
        await target.set(at, url);
      }));
      remove.addEventListener("command", run((at) => target.set(at, null)));
    }
  }
  // Tab numbers: hold Cmd (Ctrl elsewhere) and a key shows on every visible tab and
  // essential, Zia taking over Cmd/Ctrl+digit so all are reachable (Firefox's stop at
  // 8). The typed number lights up and is chosen only on letting go, so nothing loads
  // by accident; past nine, type the digits in turn. Optionally shown all the time.
  const TAB_NUMBERS_ALWAYS_PREF = "zia.tab-numbers.always";
  const TAB_NUMBERS_COLOR_PREF = "zia.tab-numbers.color";

  // The tabs the keys go to, in order: what's on screen, in the tab strip's
  // order (a tab inside a closed folder is skipped)
  function numberableTabs() {
    return (gBrowser.visibleTabs || []).filter((tab) => {
      try {
        return tab.checkVisibility ? tab.checkVisibility() : tab.getBoundingClientRect().height > 0;
      } catch (err) {
        return true;
      }
    });
  }

  function keyOf(tab) {
    return tab.querySelector(":scope > .tab-stack > .tab-content > .zia-tab-number");
  }

  function numberTabs() {
    const tabs = numberableTabs();
    const numbers = new Map(tabs.map((tab, i) => [tab, i + 1]));
    for (const tab of gBrowser.tabs) {
      const number = numbers.get(tab);
      let key = keyOf(tab);
      if (!number) {
        key?.remove();
        continue;
      }
      if (!key) {
        key = document.createElementNS(XHTML_NS, "span");
        key.className = "zia-tab-number";
        key.setAttribute("aria-hidden", "true");
        tab.querySelector(":scope > .tab-stack > .tab-content")?.append(key);
      }
      // the digits in a box of their own, trimmed to their height, so the
      // key can centre them exactly (zia.css)
      if (key.textContent !== String(number)) {
        const digits = document.createElementNS(XHTML_NS, "span");
        digits.textContent = String(number);
        key.replaceChildren(digits);
      }
      // one digit keeps its key square; two widen it
      key.toggleAttribute("zia-wide", number > 9);
    }
    return tabs;
  }

  const TAB_NUMBERS_LEAVE_MS = 110;

  function watchTabNumbers() {
    const mac = AppConstants.platform === "macosx";
    const isModKey = (event) => event.key === (mac ? "Meta" : "Control");
    const modHeld = (event) =>
      (mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey) && !event.altKey && !event.shiftKey;

    let tabs = [];
    let typed = "";
    let lastDigit = null;

    // The key of the tab typed so far lights up
    const markTarget = () => {
      tabs.forEach((tab, i) => keyOf(tab)?.toggleAttribute("zia-target", !!typed && Number(typed) === i + 1));
    };

    // Letting go, the keys slide back off to the right the way they came
    let leaving = null;
    const show = () => {
      clearTimeout(leaving);
      setFlag("zia-tab-numbers-leaving", false);
      tabs = numberTabs();
      setFlag("zia-tab-numbers", true);
    };
    const hide = () => {
      typed = "";
      markTarget();
      if (root.hasAttribute("zia-tab-numbers") && !Services.prefs.getBoolPref(TAB_NUMBERS_ALWAYS_PREF, false)) {
        setFlag("zia-tab-numbers-leaving", true);
        clearTimeout(leaving);
        leaving = setTimeout(() => setFlag("zia-tab-numbers-leaving", false), TAB_NUMBERS_LEAVE_MS);
      }
      setFlag("zia-tab-numbers", false);
    };
    // Letting go: the tab typed, if any
    const commit = () => {
      const tab = typed ? tabs[Number(typed) - 1] : null;
      hide();
      if (tab?.isConnected) {
        gBrowser.selectedTab = tab;
      }
    };
    const startsANumber = (prefix) => tabs.some((_, i) => String(i + 1).startsWith(prefix));

    const onDigit = (digit) => {
      if (!root.hasAttribute("zia-tab-numbers")) {
        show();
      }
      // Carries on from the digits before if together they still name a
      // tab; otherwise starts again from this one
      const next = typed + digit;
      typed = startsANumber(next) ? next : startsANumber(digit) ? digit : "";
      markTarget();
    };

    // Seen both ways: keys pressed in a page reach the window only
    // afterwards, in the system group. A digit is handled once, but held
    // back from Firefox's own shortcut both times.
    for (const options of [{ capture: true }, { capture: true, mozSystemGroup: true }]) {
      window.addEventListener(
        "keydown",
        (event) => {
          if (isModKey(event)) {
            if (!event.repeat && !root.hasAttribute("zia-tab-numbers")) {
              show();
            }
            return;
          }
          const digit = /^(?:Digit|Numpad)([0-9])$/.exec(event.code)?.[1];
          if (digit !== undefined && modHeld(event)) {
            event.preventDefault();
            event.stopPropagation();
            const stamp = `${event.timeStamp}:${event.code}`;
            if (stamp !== lastDigit && !event.repeat) {
              lastDigit = stamp;
              onDigit(digit);
            }
          } else if (root.hasAttribute("zia-tab-numbers")) {
            // Any other shortcut (Cmd+W, Cmd+T…) or key: the keys go, and
            // nothing is chosen. Closing a tab can lose the letting go of
            // Cmd, which would otherwise leave them up.
            hide();
          }
        },
        options
      );
      window.addEventListener(
        "keyup",
        (event) => {
          if (isModKey(event)) {
            commit();
          }
        },
        options
      );
    }
    // Should the letting go of Cmd still be missed, the next key or move
    // of the mouse without it held puts the keys away
    const heldStill = (event) => (mac ? event.metaKey : event.ctrlKey);
    for (const type of ["mousemove", "mousedown", "wheel", "keyup"]) {
      window.addEventListener(
        type,
        (event) => {
          if (root.hasAttribute("zia-tab-numbers") && !heldStill(event) && !isModKey(event)) {
            hide();
          }
        },
        { capture: true, passive: true }
      );
    }
    // Only when the window itself is left: focus moving into the page just
    // chosen reads as a blur too, with the key still held
    window.addEventListener("blur", (event) => {
      if (event.target !== window) {
        return;
      }
      setTimeout(() => {
        if (Services.focus.activeWindow !== window) {
          hide();
        }
      }, 0);
    });
    document.addEventListener("visibilitychange", () => document.hidden && hide());

    // Kept up to date as tabs come and go, for when they show all the time
    let queued = false;
    const renumber = () => {
      if (queued || !(root.hasAttribute("zia-tab-numbers") || Services.prefs.getBoolPref(TAB_NUMBERS_ALWAYS_PREF, false))) {
        return;
      }
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        tabs = numberTabs();
      });
    };
    // TabSelect too: the newly selected tab can be redrawn, losing its key
    for (const type of ["TabSelect", "TabOpen", "TabClose", "TabMove", "TabShow", "TabHide", "TabPinned", "TabUnpinned", "TabGrouped", "TabUngrouped", "TabGroupExpand", "TabGroupCollapse"]) {
      gBrowser.tabContainer.addEventListener(type, renumber);
    }
    window.addEventListener("ZenWorkspacesUIUpdate", renumber);
    window.addEventListener("ZenWorkspaceChanged", renumber);
    watchPrefs(TAB_NUMBERS_ALWAYS_PREF, renumber);

    // Zia blue or the space's colour for the number being typed
    const showColor = () => {
      const space = Services.prefs.getStringPref(TAB_NUMBERS_COLOR_PREF, "zia") === "space";
      setAttr(root, "zia-tab-number-color", space ? "space" : null);
    };
    showColor();
    watchPrefs(TAB_NUMBERS_COLOR_PREF, showColor);
    renumber();
  }
  // The welcome tour (welcome/index.html): once on a first install, and once after
  // a release that bumps WELCOME_VERSION ("release + welcome card"), over a dimmed
  // window. Closed, it stays closed; settings can switch it off or show it again.
  const WELCOME_VERSION = "2.102.0";
  const WELCOME_SEEN_PREF = "zia.welcome.seen";
  const WELCOME_UPDATES_PREF = "zia.welcome.show";
  const WELCOME_AGAIN_PREF = "zia.welcome.again";
  const WHATS_NEW_AGAIN_PREF = "zia.welcome.whats-new-again";
  const WELCOME_URL = "chrome://sine/content/zia/welcome/index.html";

  function showWelcome(mode) {
    if (document.getElementById("zia-welcome")) {
      return;
    }
    const overlay = document.createElementNS(XHTML_NS, "div");
    overlay.id = "zia-welcome";
    // In the top layer, as pop-ups are: above the toolbar and address bar,
    // which sit over anything else in the window
    overlay.setAttribute("popover", "manual");
    const frame = document.createElementNS(XHTML_NS, "iframe");
    // (with Ultra on, the page puts its wordmark in liquid metal)
    const ultra = Services.prefs.getBoolPref("zia.ultra", true) ? "?ultra" : "";
    frame.setAttribute("src", `${WELCOME_URL}${ultra}#${mode === "update" ? `update-${WELCOME_VERSION}` : mode}`);
    frame.setAttribute("title", "Welcome to Zia");
    overlay.append(frame);

    const close = () => {
      if (!overlay.isConnected || overlay.hasAttribute("closing")) {
        return;
      }
      overlay.setAttribute("closing", "");
      setTimeout(() => {
        try {
          overlay.hidePopover?.();
        } catch (err) {}
        overlay.remove();
      }, 260);
      gBrowser.selectedBrowser?.focus();
    };
    // The page tells Zia what to do three ways (it runs apart from the
    // window, so functions handed to it don't reach it): an event on its
    // document, a message to this window, and a mark on the page, looked
    // for every quarter second. The first to arrive counts.
    let acted = false;
    const act = (text) => {
      if (acted) {
        return;
      }
      let message = {};
      try {
        message = JSON.parse(String(text));
      } catch (err) {
        return;
      }
      // Star on GitHub: a tab in this window, and the tour is done
      if (message.action === "open" && /^https:\/\/github\.com\/z1n-k\/zia\/?$/.test(message.url || "")) {
        gBrowser.selectedTab = gBrowser.addTrustedTab(message.url);
      }
      if (message.action === "open" || message.action === "done") {
        acted = true;
        close();
      }
    };
    const onMessage = (event) => {
      if (event.source === frame.contentWindow && typeof event.data?.ziaWelcome === "string") {
        act(event.data.ziaWelcome);
      }
    };
    window.addEventListener("message", onMessage);
    const watch = setInterval(() => {
      if (!overlay.isConnected) {
        clearInterval(watch);
        window.removeEventListener("message", onMessage);
        return;
      }
      try {
        const mark = frame.contentDocument?.documentElement?.getAttribute("data-zia-welcome");
        if (mark) {
          frame.contentDocument.documentElement.removeAttribute("data-zia-welcome");
          act(mark);
        }
      } catch (err) {
        noteError("welcome: look", err);
      }
    }, 250);
    frame.addEventListener("load", () => {
      try {
        frame.contentDocument?.addEventListener("ZiaWelcome", (event) => act(event.detail));
        frame.contentWindow?.focus();
      } catch (err) {
        noteError("welcome: hook", err);
      }
    });
    document.documentElement.appendChild(overlay);
    try {
      overlay.showPopover();
    } catch (err) {
      noteError("welcome: top layer", err);
    }
    requestAnimationFrame(() => overlay.setAttribute("shown", ""));
  }

  function watchWelcome() {
    const seen = Services.prefs.getStringPref(WELCOME_SEEN_PREF, "");
    if (seen !== WELCOME_VERSION) {
      const firstTime = !seen;
      // Marked seen straight away, so a second window opening now doesn't
      // show it too
      Services.prefs.setStringPref(WELCOME_SEEN_PREF, WELCOME_VERSION);
      if (firstTime || Services.prefs.getBoolPref(WELCOME_UPDATES_PREF, true)) {
        // after the window has settled, so it isn't lost under the restore
        setTimeout(() => showWelcome(firstTime ? "install" : "update"), 1500);
      }
    }

    // "Show the welcome tour again" and "Show what's new again" in
    // settings: each shows its tour, then turns itself back off
    for (const [pref, mode] of [[WELCOME_AGAIN_PREF, "install"], [WHATS_NEW_AGAIN_PREF, "update"]]) {
      const again = () => {
        if (!Services.prefs.getBoolPref(pref, false)) {
          return;
        }
        Services.prefs.setBoolPref(pref, false);
        if (Services.wm.getMostRecentWindow("navigator:browser") === window) {
          showWelcome(mode);
        }
      };
      watchPrefs(pref, again);
      again();
    }
  }
  // A page peeked at with Glance shows on its tab as a small picture of the
  // page, tipped at an angle, as in Dia, in place of Zen's icon tile.
  // Hovering the tab brings its close button over the picture, and that
  // first close shuts the glance; the next one closes the tab. It is
  // taken while the glance is on screen (Zia can only photograph a page
  // that's showing), when it opens, as it loads, and every few seconds
  // after, and kept when you switch away.
  const GLANCE_THUMB_PREF = "zia.glance.thumbnail";
  const GLANCE_THUMB_W = 36;
  const GLANCE_THUMB_H = 42;
  const GLANCE_THUMB_EVERY = 3000;
  // the sink in chrome.css; the hover tip eases home first
  const GLANCE_THUMB_SINK_MS = 300;
  const GLANCE_THUMB_UNTIP_MS = 450;
  const GLANCE_CUTS = ["--zia-glance-cut-top", "--zia-glance-cut-right", "--zia-glance-cut-bottom"];
  const glanceHost = new WeakMap();
  // A close is marked as soon as the picture starts sinking, so the glance
  // mark coming off afterwards does not play the sink a second time.
  // Splitting also drops the mark, then immediately rebuilds the tab strip.
  // The sink waits out that rebuild, or the strip work eats into it and
  // the drop looks quicker than a close or an expand.
  const glanceClosing = new WeakSet();
  let glanceSplitOpen = false;

  function glanceTabsOnNormalTabs() {
    return [...gBrowser.tabContainer.querySelectorAll(
      ".tabbrowser-tab:not([zen-essential]) > .tab-stack > .tab-content > .tabbrowser-tab[zen-glance-tab]"
    )];
  }

  // Where the tab the glance sits on ends, so the picture is cut off there
  // (insets from the glance's own edges)
  function cutGlanceAtTab(glanceTab) {
    const background = glanceTab.parentElement
      ?.closest(".tabbrowser-tab")
      ?.querySelector(":scope > .tab-stack > .tab-background");
    if (!background) {
      return;
    }
    const glance = glanceTab.getBoundingClientRect();
    const tab = background.getBoundingClientRect();
    const px = (n) => `${Math.round(n * 2) / 2}px`;
    glanceTab.style.setProperty("--zia-glance-cut-top", px(tab.top - glance.top));
    glanceTab.style.setProperty("--zia-glance-cut-right", px(glance.right - tab.right));
    glanceTab.style.setProperty("--zia-glance-cut-bottom", px(glance.bottom - tab.bottom));
    const host = background.closest(".tabbrowser-tab");
    if (host && host !== glanceTab) {
      glanceHost.set(glanceTab, host);
    }
  }

  // Opening a glance into a real tab keeps the tab and drops the glance
  // mark. The picture was drawn on that tab, so without this it stays
  // in the stack and covers the site's icon.
  function clearGlanceThumb(glanceTab) {
    glanceTab.removeAttribute("zia-glance-thumb");
    for (const name of GLANCE_CUTS) {
      glanceTab.style.removeProperty(name);
    }
    glanceTab.querySelector(":scope > .tab-stack > .zia-glance-thumb")?.remove();
  }

  // The tab the glance was sitting on. Zen has already moved the glance
  // out by the time its mark comes off, so this is remembered while the
  // picture is still nested, and the previous tab is the fallback.
  function glanceHostTab(glanceTab) {
    const remembered = glanceHost.get(glanceTab);
    if (remembered?.isConnected && !remembered.hasAttribute("zen-essential")) {
      return remembered;
    }
    const nested = glanceTab.parentElement?.closest(".tabbrowser-tab");
    if (nested && nested !== glanceTab && !nested.hasAttribute("zen-essential")) {
      return nested;
    }
    const previous = glanceTab.previousElementSibling;
    if (previous?.classList?.contains("tabbrowser-tab") && !previous.hasAttribute("zen-essential")) {
      return previous;
    }
    return null;
  }

  // A copy stays on the parent tab and sinks through its bottom edge.
  // The real canvas leaves at once, so the opened tab's icon stays clear.
  // Closing passes true: Zen has already hidden the picture, and this copy
  // sinks while the page flies back. The later mark removal must not play it again.
  function sinkGlanceThumb(glanceTab, closing = false, defer = false) {
    if (!closing && (glanceClosing.has(glanceTab) || glanceTab.style.display === "none")) {
      glanceHost.delete(glanceTab);
      clearGlanceThumb(glanceTab);
      return false;
    }
    const canvas = glanceTab.querySelector(":scope > .tab-stack > .zia-glance-thumb");
    const parent = glanceHostTab(glanceTab);
    const content = parent?.querySelector(":scope > .tab-stack > .tab-content");
    glanceHost.delete(glanceTab);
    const thumbsOn = Services.prefs.getBoolPref(GLANCE_THUMB_PREF, true);
    if (!canvas || !parent?.isConnected || !content || !thumbsOn ||
        matchMedia("(prefers-reduced-motion: reduce)").matches) {
      clearGlanceThumb(glanceTab);
      return false;
    }
    if (closing) {
      glanceClosing.add(glanceTab);
    }

    const copy = document.createElementNS(XHTML_NS, "canvas");
    copy.className = "zia-glance-thumb";
    copy.width = canvas.width;
    copy.height = canvas.height;
    copy.getContext("2d").drawImage(canvas, 0, 0);

    const card = document.createElementNS(XHTML_NS, "div");
    card.className = "zia-glance-thumb-exit-card";
    card.append(copy);

    const exit = document.createElementNS(XHTML_NS, "div");
    exit.className = "zia-glance-thumb-exit";
    for (const name of GLANCE_CUTS) {
      const value = glanceTab.style.getPropertyValue(name);
      if (value) {
        exit.style.setProperty(name, value);
      }
    }
    exit.append(card);
    content.querySelector(":scope > .zia-glance-thumb-exit")?.remove();

    // hovering tips the card further and dims it; that eases back, then
    // the card sinks
    const fromHover = parent.matches(":hover");
    if (fromHover) {
      card.style.rotate = "-16deg";
      copy.style.filter = "brightness(0.4)";
      card.style.animationDelay = `${GLANCE_THUMB_UNTIP_MS}ms`;
    }
    const drop = () => exit.remove();
    const play = () => {
      const live = parent.querySelector(":scope > .tab-stack > .tab-content");
      if (!live?.isConnected) {
        return;
      }
      live.querySelector(":scope > .zia-glance-thumb-exit")?.remove();
      card.style.animationPlayState = "running";
      live.append(exit);
      if (fromHover) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            card.style.rotate = "";
            copy.style.filter = "";
          });
        });
      }
      card.addEventListener("animationend", (event) => {
        if (event.animationName === "zia-glance-sink") {
          drop();
        }
      });
      setTimeout(drop, GLANCE_THUMB_SINK_MS + (fromHover ? GLANCE_THUMB_UNTIP_MS : 0) + 80);
    };
    // held off the tab until the strip has finished moving, so the sink
    // starts after that work instead of during it
    clearGlanceThumb(glanceTab);
    if (defer) {
      requestAnimationFrame(() => requestAnimationFrame(play));
    } else {
      play();
    }
    return true;
  }

  // The canvas that sits over a glance tab's tile
  function glanceThumbParts(glanceTab) {
    const stack = glanceTab.querySelector(":scope > .tab-stack");
    if (!stack) {
      return null;
    }
    cutGlanceAtTab(glanceTab);
    let canvas = stack.querySelector(":scope > .zia-glance-thumb");
    if (!canvas) {
      canvas = document.createElementNS(XHTML_NS, "canvas");
      canvas.className = "zia-glance-thumb";
      const ratio = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.round(GLANCE_THUMB_W * ratio);
      canvas.height = Math.round(GLANCE_THUMB_H * ratio);
      stack.append(canvas);
    }
    return canvas;
  }

  async function photographGlance(glanceTab) {
    const canvas = glanceThumbParts(glanceTab);
    const browser = glanceTab.linkedBrowser;
    const windowGlobal = browser?.browsingContext?.currentWindowGlobal;
    const width = browser?.clientWidth;
    const height = browser?.clientHeight;
    if (!canvas || !windowGlobal || !width || !height) {
      return;
    }
    // The top of the page, cut to the tile's shape
    const rectHeight = Math.min(height, (width * GLANCE_THUMB_H) / GLANCE_THUMB_W);
    const scale = canvas.width / width;
    let bitmap = null;
    try {
      bitmap = await windowGlobal.drawSnapshot(new DOMRect(0, 0, width, rectHeight), scale, "white");
    } catch (err) {
      return;
    }
    // Expanded into a normal tab while the shot was being taken: the
    // canvas is already gone, and a late paint must not put it back.
    if (!bitmap || !canvas.isConnected || !glanceTab.hasAttribute("zen-glance-tab")) {
      bitmap?.close();
      return;
    }
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    glanceTab.setAttribute("zia-glance-thumb", "true");
  }

  // The glance on a normal tab, if it has one
  function glanceOnTab(tab) {
    return tab && !tab.hasAttribute("zen-essential")
      ? tab.querySelector(":scope > .tab-stack > .tab-content > .tabbrowser-tab[zen-glance-tab]")
      : null;
  }

  function closeGlanceOn(glanceTab) {
    const parent = glanceTab.parentElement?.closest(".tabbrowser-tab");
    try {
      if ((glanceTab.selected || parent?.selected) && window.gZenGlanceManager?.closeGlance) {
        window.gZenGlanceManager.closeGlance({ onTabClose: true });
      } else {
        gBrowser.removeTab(glanceTab, { animate: false });
      }
    } catch (err) {
      noteError("glance thumbnail: close", err);
    }
  }

  function watchGlanceThumbs() {
    const on = () => Services.prefs.getBoolPref(GLANCE_THUMB_PREF, true);
    // on unless switched off: the styles look for this mark, not the setting
    const markOff = () => setFlag("zia-glance-thumb-off", !on());
    markOff();
    watchPrefs(GLANCE_THUMB_PREF, markOff);
    gBrowser.tabContainer.addEventListener(
      "GlanceClose",
      (event) => {
        if (event.target?.classList?.contains("tabbrowser-tab")) {
          glanceClosing.add(event.target);
        }
      },
      true
    );
    // Zen's close flies the page back into the tab and hides the picture
    // immediately. The picture sinks while that flight plays. A first click
    // that only asks for confirmation does not hide the tab, so it does not sink.
    const manager = window.gZenGlanceManager;
    if (manager?.closeGlance && !manager.closeGlance.ziaGlanceSink) {
      const originalClose = manager.closeGlance;
      const closeGlance = function (options) {
        const glanceTab = options?.noAnimation
          ? null
          : glanceTabsOnNormalTabs().find((tab) => tab.selected || glanceHost.get(tab)?.selected);
        const result = originalClose.call(this, options);
        if (glanceTab?.style.display === "none") {
          sinkGlanceThumb(glanceTab, true);
        }
        return result;
      };
      closeGlance.ziaGlanceSink = true;
      manager.closeGlance = closeGlance;
    }
    if (manager?.fullyOpenGlance && !manager.fullyOpenGlance.ziaGlanceSink) {
      const originalOpen = manager.fullyOpenGlance;
      const fullyOpenGlance = function (options) {
        const splitting = !!options?.forSplit;
        if (splitting) {
          glanceSplitOpen = true;
        }
        try {
          return originalOpen.call(this, options);
        } finally {
          if (splitting) {
            queueMicrotask(() => {
              glanceSplitOpen = false;
            });
          }
        }
      };
      fullyOpenGlance.ziaGlanceSink = true;
      manager.fullyOpenGlance = fullyOpenGlance;
    }
    const photographShowing = () => {
      if (!on() || document.hidden) {
        return;
      }
      for (const glanceTab of glanceTabsOnNormalTabs()) {
        const parent = glanceTab.parentElement?.closest(".tabbrowser-tab");
        // only a glance that's on screen: while it's open Zen selects the
        // glance's own tab, not the one it came from
        if (glanceTab.selected || parent?.selected) {
          photographGlance(glanceTab);
        } else {
          glanceThumbParts(glanceTab);
        }
      }
    };

    // A glance opening: photographed as it appears, as it loads, and after.
    // Opening it into a normal tab takes the mark off the same tab; the
    // picture sinks back into the tab it came from.
    new MutationObserver((records) => {
      let opened = false;
      for (const record of records) {
        const tab = record.target;
        if (!tab.classList?.contains("tabbrowser-tab")) {
          continue;
        }
        if (tab.hasAttribute("zen-glance-tab")) {
          opened = true;
        } else {
          const splitting = glanceSplitOpen;
          glanceSplitOpen = false;
          sinkGlanceThumb(tab, false, splitting);
        }
      }
      if (opened) {
        // cut where the tab ends before it's first drawn, not after
        glanceTabsOnNormalTabs().forEach(cutGlanceAtTab);
        [150, 600, 1500].forEach((ms) => setTimeout(photographShowing, ms));
      }
    }).observe(gBrowser.tabContainer, { subtree: true, attributes: true, attributeFilter: ["zen-glance-tab"] });
    gBrowser.tabContainer.addEventListener("TabSelect", () => setTimeout(photographShowing, 300));
    gBrowser.addTabsProgressListener({
      onStateChange(browser, webProgress, request, flags) {
        if (webProgress?.isTopLevel && flags & Ci.nsIWebProgressListener.STATE_STOP &&
            gBrowser.getTabForBrowser(browser)?.hasAttribute("zen-glance-tab")) {
          setTimeout(photographShowing, 200);
        }
      },
    });
    setInterval(photographShowing, GLANCE_THUMB_EVERY);
    photographShowing();

    // A tab with a glance: its close button, which sits over the picture,
    // closes the glance first, and only then the tab
    const glanceUnderClose = (event) => {
      if (!on() || event.button !== 0) {
        return null;
      }
      const close = event.target?.closest?.(".tab-close-button");
      const tab = close?.closest(".tabbrowser-tab");
      return close?.parentElement?.parentElement?.parentElement === tab ? glanceOnTab(tab) : null;
    };
    gBrowser.tabContainer.addEventListener(
      "click",
      (event) => {
        const glanceTab = glanceUnderClose(event);
        if (glanceTab) {
          event.preventDefault();
          event.stopPropagation();
          closeGlanceOn(glanceTab);
        }
      },
      true
    );
    for (const type of ["mousedown", "mouseup"]) {
      gBrowser.tabContainer.addEventListener(
        type,
        (event) => {
          if (glanceUnderClose(event)) {
            event.stopPropagation();
          }
        },
        true
      );
    }
  }
  // Firefox's own sidebar panels (Bookmarks, History, Synced Tabs) are
  // pages of their own inside the panel, which Zia's chrome.css doesn't
  // reach: zia-sidebar.css is loaded into each as it opens. The panel's
  // frame is styled in chrome.css. On unless switched off in settings.
  const SIDEBAR_PANELS_PREF = "zia.sidebar-panels.style";
  // fresh each session, so an updated Zia's styles aren't served from cache
  const SIDEBAR_SHEET = `chrome://sine/content/zia/zia-sidebar.css?${Date.now()}`;

  // The tabs' own measurements, read off a tab in the sidebar, for the
  // panels' rows to match: text size and weight, row height, the gap
  // between rows, the corner radius and the padding before the icon
  function tabMeasurements() {
    const tabs = gBrowser.visibleTabs.filter((tab) => !tab.hasAttribute("zen-essential") && !tab.hasAttribute("zen-glance-tab"));
    // one whose icon is showing (not hovered, where the close button takes
    // its place, nor loading), else any to be seen
    const shownIcon = (t) => {
      const image = t.querySelector(".tab-icon-image");
      return image && !t.matches(":hover") && image.getBoundingClientRect().width > 0 ? image : null;
    };
    const tab = tabs.find((t) => t.getBoundingClientRect().height > 0 && shownIcon(t)) || tabs.find((t) => t.getBoundingClientRect().height > 0);
    if (!tab) {
      return null;
    }
    const background = tab.querySelector(".tab-background");
    const label = tab.querySelector(".tab-label");
    const content = tab.querySelector(".tab-content");
    const icon = shownIcon(tab);
    if (!background || !label || !content) {
      return null;
    }
    const height = background.getBoundingClientRect().height;
    const next = tabs[tabs.indexOf(tab) + 1]?.querySelector(".tab-background");
    const gap = next
      ? next.getBoundingClientRect().top - background.getBoundingClientRect().bottom
      : 2 * parseFloat(getComputedStyle(tab).getPropertyValue("--tab-margin-block") || "2");
    const text = getComputedStyle(label);
    const box = content.getBoundingClientRect();
    const toolbox = document.getElementById("navigator-toolbox")?.getBoundingClientRect();
    const inset = toolbox ? background.getBoundingClientRect().left - toolbox.left : 8;
    return {
      "--zia-row-h": `${height}px`,
      "--zia-row-gap": `${Math.max(0, Math.min(12, gap))}px`,
      "--zia-row-radius": getComputedStyle(background).borderTopLeftRadius,
      "--zia-row-font-size": text.fontSize,
      "--zia-row-font-weight": text.fontWeight,
      "--zia-row-font-family": text.fontFamily,
      // from the tab's own edge (its background), not its content box
      "--zia-row-pad": `${within(icon ? icon.getBoundingClientRect().left - background.getBoundingClientRect().left : NaN, 2, 24, 10)}px`,
      // text: an unselected tab's (dimmed, as in Dia) and a selected one's
      "--zia-row-text": labelColor(tabs.find((t) => !t.selected && !t.hasAttribute("visuallyselected"))) || "rgba(255, 255, 255, 0.8)",
      "--zia-row-text-selected": labelColor(gBrowser.selectedTab?.hasAttribute("zen-essential") ? null : gBrowser.selectedTab) || "rgb(255, 255, 255)",
      "--zia-row-inset": `${Math.max(0, Math.min(16, inset))}px`,
      "--zia-row-hover-bg": getComputedStyle(root).getPropertyValue("--zia-tab-hover-bg").trim() || "rgba(255, 255, 255, 0.115)",
      "--zia-row-selected-bg": getComputedStyle(root).getPropertyValue("--zia-active-tab-bg").trim() || "rgba(0, 0, 0, 0.1)",
      "--zia-row-indent": `${folderIndent(tab)}px`,
      "--zia-row-icon-gap": `${within(icon ? label.getBoundingClientRect().left - icon.getBoundingClientRect().right : NaN, 2, 16, 8)}px`,
    };
  }

  // a measurement only if it's a sensible one, else the usual
  function within(value, low, high, usual) {
    return Number.isFinite(value) && value >= low && value <= high ? value : usual;
  }

  function labelColor(tab) {
    const label = tab?.querySelector(".tab-label-container");
    return label ? getComputedStyle(label).color : null;
  }

  // How far a tab in a folder steps in from one that isn't
  function folderIndent(tab) {
    const inFolder = gBrowser.visibleTabs.find((t) => t.closest("zen-folder, tab-group:not([split-view-group])") && t.getBoundingClientRect().height > 0);
    const outer = tab.closest("zen-folder, tab-group") ? null : tab;
    if (inFolder && outer) {
      const step = inFolder.querySelector(".tab-background").getBoundingClientRect().left - outer.querySelector(".tab-background").getBoundingClientRect().left;
      if (step > 0 && step < 40) {
        return step;
      }
    }
    return 14;
  }

  // The tab sidebar's own sides: from the window's edge to its tabs, and
  // from its tabs to the page's card. The panel takes the same, mirrored
  // (less the splitter, which is the gap on its card side).
  function sidebarSides() {
    const tab = gBrowser.visibleTabs.find((t) => !t.hasAttribute("zen-essential") && !t.closest("zen-folder, tab-group") && t.getBoundingClientRect().height > 0);
    const background = tab?.querySelector(".tab-background")?.getBoundingClientRect();
    const card = document.getElementById("zen-appcontent-wrapper")?.getBoundingClientRect();
    const splitter = document.getElementById("sidebar-splitter")?.getBoundingClientRect().width || 0;
    if (!background || !card) {
      return;
    }
    const right = root.getAttribute("zen-right-side") === "true";
    // On the tab sidebar's own side, the panel sits between the tabs and
    // the card, parted from the tabs by a line: the gap from the tabs to
    // that line is the panel's gap after it, and before the card
    const panel = document.getElementById("sidebar-box");
    const panelOnRight = panel?.hasAttribute("sidebar-positionend");
    if (panel && !panel.hidden && root.hasAttribute("zia-panels-beside") && panelOnRight === right) {
      const edge = panel.getBoundingClientRect();
      const gap = right ? background.left - edge.right : edge.left - background.right;
      if (gap >= 0 && gap < 40) {
        root.style.setProperty("--zia-panel-pad-window", `${gap}px`);
        root.style.setProperty("--zia-panel-pad-card", `${Math.max(0, gap - splitter)}px`);
      }
      return;
    }
    const windowSide = right ? window.innerWidth - background.right : background.left;
    const cardSide = right ? background.left - card.right : card.left - background.right;
    if (windowSide >= 0 && windowSide < 40 && cardSide >= 0 && cardSide < 40) {
      root.style.setProperty("--zia-panel-pad-window", `${windowSide}px`);
      root.style.setProperty("--zia-panel-pad-card", `${Math.max(0, cardSide - splitter)}px`);
    }
  }

  // The close button in the downloads button's colour: its icon's fill,
  // at the strength it's drawn (its fill's own and the button's opacity)
  function matchCloseToDownloads() {
    const icon = document.querySelector("#downloads-button .toolbarbutton-icon, #downloads-button image");
    if (!icon || !icon.getBoundingClientRect().width) {
      return;
    }
    const style = getComputedStyle(icon);
    let strength = (parseFloat(style.fillOpacity) || 1) * (parseFloat(style.opacity) || 1);
    for (let el = icon.parentElement; el && el.id !== "zia-workspace-slot" && el !== root; el = el.parentElement) {
      strength *= parseFloat(getComputedStyle(el).opacity) || 1;
      if (el.id === "downloads-button") {
        break;
      }
    }
    root.style.setProperty("--zia-panel-close-fill", style.fill && style.fill !== "none" ? style.fill : "rgb(255, 255, 255)");
    root.style.setProperty("--zia-panel-close-opacity", String(Math.round(strength * 1000) / 1000));
  }

  function matchTabs(doc) {
    safely("sidebar panels: sides", sidebarSides);
    safely("sidebar panels: close colour", matchCloseToDownloads);
    const sizes = tabMeasurements();
    if (sizes) {
      for (const [name, value] of Object.entries(sizes)) {
        doc.documentElement.style.setProperty(name, value);
      }
    }
    // beside the page, the panel's own sides give the room
    setStyle(doc.documentElement, "--zia-panel-inset", root.hasAttribute("zia-panels-beside") ? "0px" : null);
    // the highlights' shape: the space name's own pill
    const label = document.getElementById("zia-space-label");
    if (label) {
      const pill = getComputedStyle(label);
      doc.documentElement.style.setProperty("--zia-pill-radius", pill.borderTopLeftRadius);
      const corner = pill.getPropertyValue("corner-top-left-shape");
      if (corner) {
        doc.documentElement.style.setProperty("--zia-pill-corner", corner);
      }
    }
    roundTreeRows(doc);
    styleSearchField(doc);
    doc.defaultView.requestAnimationFrame(() =>
      doc.defaultView.requestAnimationFrame(() => {
        levelTitle();
        spaceTitle(doc);
      })
    );
  }

  // The space between the panel's title and its search field is the one
  // between the space's name and the essentials below it, text to tile:
  // measured on both, and the header's padding made up to it
  function spaceTitle(doc) {
    const label = document.getElementById("zia-space-label") || document.querySelector(".zen-current-workspace-indicator-name");
    const essential = [...document.querySelectorAll(".zen-essentials-container .tabbrowser-tab[zen-essential] > .tab-stack > .tab-background")]
      .find((e) => e.getBoundingClientRect().height > 0);
    const title = document.getElementById("sidebar-title");
    const header = document.getElementById("sidebar-header");
    const browser = document.getElementById("sidebar");
    const search = doc.querySelector("#search-box, .sidebar-search-container.selected .tabsFilter");
    if (!label || !essential || !title || !header || !browser || !search) {
      return;
    }
    const textBottom = (el) => {
      const box = el.getBoundingClientRect();
      return box.top + box.height / 2 + parseFloat(getComputedStyle(el).fontSize) / 2;
    };
    const wanted = essential.getBoundingClientRect().top - textBottom(label);
    const now = browser.getBoundingClientRect().top + search.getBoundingClientRect().top - textBottom(title);
    if (!(wanted > 0 && wanted < 48) || Math.abs(wanted - now) < 0.5) {
      return;
    }
    const padding = parseFloat(getComputedStyle(header).paddingBottom) || 0;
    root.style.setProperty("--zia-panel-title-pad", `${Math.max(0, padding + wanted - now)}px`);
  }

  // The panel's title sits level with the space's name across the window
  function levelTitle() {
    const label = document.getElementById("zia-space-label");
    const pill = document.getElementById("sidebar-switcher-target");
    const header = document.getElementById("sidebar-header");
    if (!label || !pill || !header || !label.getBoundingClientRect().height || !pill.getBoundingClientRect().height) {
      return;
    }
    const off = label.getBoundingClientRect().top - pill.getBoundingClientRect().top;
    if (Math.abs(off) < 0.5) {
      return;
    }
    const padding = parseFloat(getComputedStyle(header).paddingTop) || 0;
    const next = padding + off;
    if (next >= 0 && next < 40) {
      root.style.setProperty("--zia-panel-title-top", `${next}px`);
    }
  }

  // The search field draws itself inside a component of its own, which a
  // page's styles don't reach: Zia hands it its own few rules there. A
  // faint hairline when it's focused, inside it so nothing is cut off at
  // the panel's edge, in place of Firefox's thick ring.
  const SEARCH_FIELD_RULES = `
    #input {
      appearance: none !important;
      border: 1px solid transparent !important;
      outline: none !important;
      box-shadow: none !important;
    }
    #input:focus,
    #input:focus-visible {
      outline: none !important;
      border-color: rgba(255, 255, 255, 0.14) !important;
    }
  `;

  function styleSearchField(doc) {
    const win = doc.defaultView;
    for (const field of doc.querySelectorAll("moz-input-search")) {
      const apply = () => {
        const shadow = field.shadowRoot;
        if (!shadow || shadow.ziaStyled) {
          return;
        }
        try {
          const sheet = new win.CSSStyleSheet();
          sheet.replaceSync(SEARCH_FIELD_RULES);
          shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, sheet];
          shadow.ziaStyled = true;
        } catch (err) {
          noteError("sidebar panels: search field", err);
        }
      };
      apply();
      // drawn a moment later, the first time
      field.updateComplete?.then(apply, () => {});
      win.setTimeout(apply, 300);
    }
  }

  // Bookmarks and History are trees, whose rows can't be rounded or
  // spaced apart. Zia draws the hovered and the selected row's highlight
  // itself, behind the tree, shaped like a tab: as tall as a tab, rounded
  // like one, with the gap between rows left clear.
  function roundTreeRows(doc) {
    const tree = doc.querySelector(".sidebar-placesTree");
    if (!tree || doc.getElementById("zia-row-pills")) {
      return;
    }
    const win = doc.defaultView;
    const layer = doc.createElementNS(XHTML_NS, "div");
    layer.id = "zia-row-pills";
    const hover = doc.createElementNS(XHTML_NS, "div");
    hover.className = "zia-row-pill";
    hover.setAttribute("hover", "");
    const chosen = doc.createElementNS(XHTML_NS, "div");
    chosen.className = "zia-row-pill";
    chosen.setAttribute("selected", "");
    layer.append(chosen, hover);
    tree.before(layer);

    let hoveredRow = -1;
    const put = (pill, row) => {
      const body = tree.treeBody || tree.querySelector("treechildren");
      const height = tree.rowHeight;
      if (row < 0 || !body || !height) {
        pill.hidden = true;
        return;
      }
      const shown = row - tree.getFirstVisibleRow();
      const box = body.getBoundingClientRect();
      // each row is a tab's height and the gap after it: the pill is the tab
      const gap = parseFloat(win.getComputedStyle(doc.documentElement).getPropertyValue("--zia-row-gap")) || 0;
      const top = box.top + shown * height;
      if (shown < 0 || top + height > box.bottom + 1) {
        pill.hidden = true;
        return;
      }
      // a row inside a folder steps in, as a folder's tabs do
      const indent = (tree.view?.getLevel(row) || 0) * (parseFloat(win.getComputedStyle(doc.documentElement).getPropertyValue("--zia-row-indent")) || 0);
      pill.hidden = false;
      pill.style.top = `${top + gap / 2}px`;
      pill.style.left = `${box.left + indent}px`;
      pill.style.width = `${Math.max(0, box.width - indent)}px`;
      pill.style.height = `${height - gap}px`;
    };
    let queued = false;
    const update = () => {
      if (queued) {
        return;
      }
      queued = true;
      win.requestAnimationFrame(() => {
        queued = false;
        try {
          // the selected row keeps its look under the pointer, as a tab does
          const current = tree.view?.selection?.count ? tree.currentIndex : -1;
          put(chosen, current);
          put(hover, hoveredRow === current ? -1 : hoveredRow);
        } catch (err) {
          noteError("sidebar panels: rows", err);
        }
      });
    };
    tree.addEventListener("mousemove", (event) => {
      const row = tree.getRowAt(event.clientX, event.clientY);
      if (row !== hoveredRow) {
        hoveredRow = row;
        update();
      }
    });
    tree.addEventListener("mouseleave", () => {
      hoveredRow = -1;
      update();
    });
    for (const type of ["select", "wheel", "keydown", "click", "focus", "blur"]) {
      tree.addEventListener(type, update, true);
    }
    win.addEventListener("resize", update);
    // rows coming and going (a search, a folder opened) and scrolling the
    // tree itself don't all tell anyone: checked over as well while open
    const every = win.setInterval(update, 250);
    win.addEventListener("unload", () => win.clearInterval(every));
    update();
  }

  function watchSidebarPanels() {
    const on = () => Services.prefs.getBoolPref(SIDEBAR_PANELS_PREF, true);
    const styled = new WeakSet();
    const style = () => {
      const win = document.getElementById("sidebar")?.contentWindow;
      const doc = win?.document;
      if (!doc || doc.documentURI === "about:blank") {
        return;
      }
      try {
        // switched off with a panel open: its styles go straight away
        if (!on()) {
          if (styled.has(doc)) {
            win.windowUtils.removeSheetUsingURIString(SIDEBAR_SHEET, win.windowUtils.AUTHOR_SHEET);
            styled.delete(doc);
          }
        } else {
          if (!styled.has(doc)) {
            win.windowUtils.loadSheetUsingURIString(SIDEBAR_SHEET, win.windowUtils.AUTHOR_SHEET);
            styled.add(doc);
          }
          matchTabs(doc);
        }
      } catch (err) {
        noteError("sidebar panels: style", err);
      }
    };
    const markPlain = () => {
      setFlag("zia-panels-plain", !on());
      style();
    };
    markPlain();
    watchPrefs(SIDEBAR_PANELS_PREF, markPlain);
    // each panel's page loads into the same #sidebar browser
    document.getElementById("sidebar")?.addEventListener("load", style, true);
    safely("placeSidebarPanel", placeSidebarPanel);
  }

  // Zen puts the panel inside the page's card, under the toolbar. Zia
  // moves it beside the card instead, full height on the window's own
  // background, a second sidebar, on whichever side it's set to (Firefox's
  // "Move sidebar to left/right"). Off in settings: back where Zen has it.
  const SIDEBAR_BESIDE_PREF = "zia.sidebar-panels.beside";

  function placeSidebarPanel() {
    const box = document.getElementById("sidebar-box");
    const splitter = document.getElementById("sidebar-splitter");
    const card = document.getElementById("zen-appcontent-wrapper");
    if (!box || !splitter || !card) {
      return;
    }
    // where Zen had them, to put them back
    const home = box.parentNode;
    const homeNext = splitter.nextSibling;
    const resize = [splitter.getAttribute("resizebefore"), splitter.getAttribute("resizeafter")];

    const reload = () => {
      // a moved panel's page starts again: shown again if it was open
      try {
        const id = window.SidebarController?.currentID;
        if (id && !box.hidden) {
          window.SidebarController.show(id);
        }
      } catch (err) {
        noteError("sidebar panels: reload", err);
      }
    };
    const place = () => {
      const beside = Services.prefs.getBoolPref(SIDEBAR_BESIDE_PREF, true);
      setFlag("zia-panels-beside", beside);
      const end = box.hasAttribute("sidebar-positionend");
      let moved = false;
      if (beside) {
        // the splitter sits between the card and the panel, and resizes
        // the panel
        if (end && (card.nextElementSibling !== splitter || splitter.nextElementSibling !== box)) {
          card.after(splitter, box);
          moved = true;
        } else if (!end && (card.previousElementSibling !== splitter || splitter.previousElementSibling !== box)) {
          card.before(box, splitter);
          moved = true;
        }
        splitter.setAttribute("resizebefore", end ? "none" : "sibling");
        splitter.setAttribute("resizeafter", end ? "sibling" : "none");
      } else if (box.parentNode !== home) {
        home.insertBefore(box, homeNext);
        home.insertBefore(splitter, homeNext);
        splitter.setAttribute("resizebefore", resize[0] ?? "sibling");
        splitter.setAttribute("resizeafter", resize[1] ?? "none");
        moved = true;
      }
      if (moved) {
        reload();
      }
    };
    place();
    watchPrefs(SIDEBAR_BESIDE_PREF, place);

    // no wider than Zen lets the tab sidebar be (dragging its edge stops
    // there too), and following that setting if it's changed
    const MAX_PREF = "zen.view.sidebar-expanded.max-width";
    // the tab sidebar's own limit as Zen sets it on it, else its setting
    const maxWidth = () => {
      const toolbox = parseFloat(gNavToolbox?.style.maxWidth || getComputedStyle(gNavToolbox).maxWidth);
      if (toolbox > 0) {
        return toolbox;
      }
      try {
        return Services.prefs.getIntPref(MAX_PREF);
      } catch (err) {
        return 300;
      }
    };
    let clamping = false;
    const cap = () => {
      if (clamping) {
        return;
      }
      const beside = Services.prefs.getBoolPref(SIDEBAR_BESIDE_PREF, true);
      const max = maxWidth();
      if (!beside || !(max > 0)) {
        box.style.removeProperty("max-width");
        return;
      }
      box.style.setProperty("max-width", `${max}px`, "important");
      // dragged past it anyway: back to the limit, as the tab sidebar stops
      if (box.getBoundingClientRect().width > max + 0.5) {
        clamping = true;
        box.style.width = `${max}px`;
        box.setAttribute("width", String(max));
        clamping = false;
      }
    };
    cap();
    new MutationObserver(cap).observe(box, { attributes: true, attributeFilter: ["width", "style"] });
    new MutationObserver(cap).observe(gNavToolbox, { attributes: true, attributeFilter: ["style"] });
    watchPrefs([MAX_PREF, SIDEBAR_BESIDE_PREF], cap);
    // moving it to the other side
    new MutationObserver(place).observe(box, { attributes: true, attributeFilter: ["sidebar-positionend"] });

    // It slides in from the window's edge as it opens, the page giving way
    // to it, and back out as it closes: exactly as Zen slides the tab
    // sidebar (its outer margin, from minus its width to nothing, with
    // Zen's own spring: no bounce, a tenth of a second)
    const beside = () => Services.prefs.getBoolPref(SIDEBAR_BESIDE_PREF, true) && !matchMedia("(prefers-reduced-motion: reduce)").matches;
    let slides = 0;
    const sliding = (on) => {
      slides = Math.max(0, slides + (on ? 1 : -1));
      // a little after it stops, as the site catches up with its new size
      if (slides) {
        setFlag("zia-panel-sliding", true);
      } else {
        setTimeout(() => !slides && setFlag("zia-panel-sliding", false), 250);
      }
    };
    // the tab sidebar's own slide too: Zen marks it while it runs, and the
    // colour is held a moment after, as the site catches up
    let zenSliding = false;
    new MutationObserver(() => {
      const now = root.hasAttribute("zen-compact-animating");
      if (now !== zenSliding) {
        zenSliding = now;
        sliding(now);
      }
    }).observe(root, { attributes: true, attributeFilter: ["zen-compact-animating"] });
    const slide = (opening) => {
      const run = slideBox(opening);
      sliding(true);
      return run.finally(() => {
        sliding(false);
        // its sides measured where it has come to rest
        if (opening) {
          safely("sidebar panels: sides", sidebarSides);
        }
      });
    };
    const slideBox = (opening) => {
      // off the window's edge; but on the tab sidebar's own side that edge
      // is the tabs, so it's tucked under the page instead (the margin on
      // the page's side), never sliding over the tabs
      const onRight = box.hasAttribute("sidebar-positionend");
      const besideTabs = onRight === (root.getAttribute("zen-right-side") === "true");
      const side = onRight !== besideTabs ? "marginRight" : "marginLeft";
      const hidden = `-${box.getBoundingClientRect().width}px`;
      const motion = window.gZenUIManager?.motion;
      const done = () => box.style.removeProperty(side === "marginRight" ? "margin-right" : "margin-left");
      if (motion?.animate) {
        box.style[side] = opening ? hidden : "0px";
        return Promise.resolve(
          motion.animate(box, { [side]: opening ? [hidden, "0px"] : ["0px", hidden] }, {
            ease: opening ? "easeOut" : "easeIn",
            type: "spring",
            bounce: 0,
            duration: 0.1,
          })
        ).then(() => {
          if (opening) {
            done();
          }
          return done;
        });
      }
      const run = box.animate([{ [side]: opening ? hidden : "0px" }, { [side]: opening ? "0px" : hidden }], {
        duration: 100,
        easing: opening ? "ease-out" : "ease-in",
        fill: "forwards",
      });
      return run.finished.catch(() => {}).then(() => () => run.cancel());
    };
    let wasHidden = box.hidden;
    new MutationObserver(() => {
      if (wasHidden && !box.hidden && beside()) {
        slide(true).catch((err) => noteError("sidebar panels: slide in", err));
      }
      wasHidden = box.hidden;
    }).observe(box, { attributes: true, attributeFilter: ["hidden"] });

    // closing: slid out first, then hidden as Firefox would have
    const controller = window.SidebarController;
    if (controller && typeof controller.hide === "function" && !controller.ziaSlides) {
      const hide = controller.hide;
      let sliding = false;
      controller.hide = function (...args) {
        if (sliding || box.hidden || !beside()) {
          return hide.apply(this, args);
        }
        sliding = true;
        slide(false)
          .catch((err) => {
            noteError("sidebar panels: slide out", err);
            return () => {};
          })
          .then((undo) => {
            sliding = false;
            try {
              hide.apply(this, args);
            } finally {
              undo?.();
            }
          });
        return undefined;
      };
      controller.ziaSlides = true;
    }
  }
  // A page gone full screen inside the window (a YouTube video) is shown square,
  // edge to edge: it kept the page's rounded card, grey behind the video's corners.
  function watchPageFullscreen() {
    const update = () => setFlag("zia-page-fullscreen", !!document.fullscreenElement);
    const soon = () => requestAnimationFrame(update);
    window.addEventListener("MozDOMFullscreen:Entered", soon);
    window.addEventListener("MozDOMFullscreen:Exited", soon);
    document.addEventListener("fullscreenchange", soon);
    update();
  }
  // Dia's swipe arrow and card of pages, in place of Firefox's arrow. Firefox
  // still navigates; this wraps gHistorySwipeAnimation and gGestureSupport.
  const SWIPE_PREF = "zia.swipe.dia-arrow";
  const SWIPE_HOLD_MS = 450;
  const SWIPE_MAX_PAGES = 8;
  const SWIPE_LEAVE_MS = 260;
  const SWIPE_SETTLE_MS = 240;

  function swipePages(forward) {
    const pages = [];
    try {
      const history = gBrowser.selectedBrowser.browsingContext.sessionHistory;
      const step = forward ? 1 : -1;
      for (let i = history.index + step; i >= 0 && i < history.count && pages.length < SWIPE_MAX_PAGES; i += step) {
        const entry = history.getEntryAtIndex(i);
        const url = entry.URI?.spec || "";
        pages.push({ title: entry.title || url, url });
      }
    } catch (err) {
      noteError("swipe arrow: history", err);
    }
    return pages;
  }

  function swipeChevron() {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2.6");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", "M14 5.5l-5.5 6.5l5.5 6.5");
    svg.append(path);
    return svg;
  }

  // Zen's tap leaves the timing to macOS, which never plays it with the fingers
  // held still; this asks AppKit to play it now (null where it can't).
  let tapNow;
  function nativeTapNow() {
    if (tapNow !== undefined) {
      return tapNow;
    }
    tapNow = null;
    if (AppConstants.platform !== "macosx") {
      return tapNow;
    }
    try {
      const { ctypes } = ChromeUtils.importESModule("resource://gre/modules/ctypes.sys.mjs");
      const objc = ctypes.open("/usr/lib/libobjc.A.dylib");
      const id = ctypes.voidptr_t;
      const getClass = objc.declare("objc_getClass", ctypes.default_abi, id, ctypes.char.ptr);
      const selector = objc.declare("sel_registerName", ctypes.default_abi, id, ctypes.char.ptr);
      const send = objc.declare("objc_msgSend", ctypes.default_abi, id, id, id);
      const sendFeedback = objc.declare("objc_msgSend", ctypes.default_abi, ctypes.void_t, id, id, ctypes.long, ctypes.unsigned_long);
      const manager = getClass("NSHapticFeedbackManager");
      if (manager.isNull()) {
        return tapNow;
      }
      const performer = send(manager, selector("defaultPerformer"));
      const perform = selector("performFeedbackPattern:performanceTime:");
      // NSHapticFeedbackPatternAlignment (1), as Zen's; NSHapticFeedbackPerformanceTimeNow (1)
      tapNow = () => sendFeedback(performer, perform, 1, 1);
    } catch (err) {
      noteError("swipe arrow: native tap", err);
    }
    return tapNow;
  }

  // now: play macOS's tap at once rather than Zen's
  function swipeTap(now = false) {
    try {
      if (!Services.prefs.getBoolPref(HAPTIC_PREF, true)) {
        return;
      }
      const tap = now && nativeTapNow();
      if (tap) {
        tap();
      } else {
        zenHaptic?.();
      }
    } catch (err) {
      noteError("swipe arrow: tap", err);
    }
  }

  function watchSwipeArrow() {
    const swipe = window.gHistorySwipeAnimation;
    if (!swipe || swipe.ziaWrapped) {
      return;
    }
    swipe.ziaWrapped = true;
    const on = () => Services.prefs.getBoolPref(SWIPE_PREF, true);
    // hides Firefox's own arrow (22-swipe-arrow.css)
    const mark = () => setFlag("zia-swipe-arrow", on());
    mark();
    watchPrefs(SWIPE_PREF, mark);

    // Firefox calls its animation's methods on every swipe, arrow shown or not
    let swiping = false;
    let el = null;
    let backdrop = null;
    let holdTimer = null;
    let side = null;
    let pinned = false;
    // Zen's tap only plays inside a trackpad event, so the card opens on an
    // update; held still (no updates), a timer opens it with macOS's tap, and
    // where that can't be done the tap waits for the next update or the lift
    let willSince = 0;
    let tapOwed = false;
    const payTap = () => {
      if (tapOwed) {
        tapOwed = false;
        swipeTap();
      }
    };

    const clearHold = () => {
      clearTimeout(holdTimer);
      holdTimer = null;
    };

    const discard = () => {
      clearHold();
      pinned = false;
      el?.remove();
      backdrop?.remove();
      el = backdrop = side = null;
    };

    const close = () => {
      const node = el;
      el = null;
      discard();
      if (node) {
        node.toggleAttribute("commit", node.hasAttribute("open"));
        node.setAttribute("leaving", "");
        setTimeout(() => node.remove(), SWIPE_LEAVE_MS);
      }
    };

    const goTo = (depth, forward) => {
      try {
        const history = gBrowser.selectedBrowser.browsingContext.sessionHistory;
        const target = history.index + (forward ? depth : -depth);
        if (target >= 0 && target < history.count) {
          gBrowser.gotoIndex(target);
        }
      } catch (err) {
        noteError("swipe arrow: go to page", err);
      }
    };

    const build = (forward) => {
      discard();
      const stack = gBrowser.selectedBrowser?.closest(".browserStack");
      if (!stack) {
        return;
      }
      side = forward ? "forward" : "back";
      el = document.createElementNS(XHTML_NS, "div");
      el.id = "zia-swipe";
      el.setAttribute("side", side);
      const arrow = document.createElementNS(XHTML_NS, "div");
      arrow.className = "zia-swipe-arrow";
      arrow.append(swipeChevron());
      const list = document.createElementNS(XHTML_NS, "div");
      list.className = "zia-swipe-pages";
      el.append(arrow, list);
      stack.append(el);
    };

    const open = (fromEvent = false) => {
      clearHold();
      if (!el || el.hasAttribute("open")) {
        return;
      }
      const forward = side === "forward";
      const pages = swipePages(forward);
      if (!pages.length) {
        return;
      }
      const list = el.querySelector(".zia-swipe-pages");
      list.replaceChildren(
        ...pages.map((page, i) => {
          const row = document.createElementNS(XHTML_NS, "div");
          row.className = "zia-swipe-page";
          row.toggleAttribute("selected", i === 0);
          const icon = document.createElementNS(XHTML_NS, "img");
          icon.alt = "";
          icon.src = `page-icon:${page.url}`;
          icon.addEventListener("error", () => icon.setAttribute("src", "chrome://global/skin/icons/defaultFavicon.svg"), { once: true });
          const title = document.createElementNS(XHTML_NS, "span");
          title.textContent = page.title;
          row.append(icon, title);
          // close first, then navigate: navigating at once kept the browser busy
          // and the card hung before it left
          row.addEventListener("click", () => {
            close();
            requestAnimationFrame(() => requestAnimationFrame(() => goTo(i + 1, forward)));
          });
          return row;
        })
      );
      el.style.setProperty("--zia-swipe-n", `${pages.length}`);
      el.setAttribute("open", "");
      // squircle only once the morph ends (see 22-swipe-arrow.css)
      const card = el;
      setTimeout(() => card.setAttribute("settled", ""), SWIPE_SETTLE_MS);
      pinned = true;
      backdrop = document.createElementNS(XHTML_NS, "div");
      backdrop.id = "zia-swipe-backdrop";
      backdrop.addEventListener("mousedown", close);
      el.before(backdrop);
      if (fromEvent || nativeTapNow()) {
        swipeTap(!fromEvent);
      } else {
        tapOwed = true;
      }
    };

    const follow = (animation, update) => {
      if (!on() || !swiping) {
        return;
      }
      payTap();
      if (pinned) {
        return;
      }
      const back = !!animation._willGoBack?.(update);
      const forward = !back && !!animation._willGoForward?.(update);
      if (!back && !forward) {
        if (el) {
          el.style.setProperty("--p", "0");
          el.removeAttribute("will");
        }
        clearHold();
        return;
      }
      if (!el || side !== (forward ? "forward" : "back")) {
        build(forward);
      }
      if (!el) {
        return;
      }
      const progress = Math.min(Math.abs(update?.delta || 0) * 4, 1);
      el.style.setProperty("--p", `${progress}`);
      const will = progress >= 1;
      if (will && !el.hasAttribute("will")) {
        swipeTap();
        willSince = Date.now();
      }
      el.toggleAttribute("will", will);
      if (will) {
        if (Date.now() - willSince >= SWIPE_HOLD_MS) {
          open(true);
        } else if (!holdTimer) {
          holdTimer = setTimeout(open, SWIPE_HOLD_MS);
        }
      } else {
        clearHold();
      }
    };

    const leave = () => {
      payTap();
      if (!pinned) {
        close();
      }
    };

    window.addEventListener(
      "keydown",
      (event) => {
        if (pinned && event.key === "Escape") {
          close();
          event.preventDefault();
          event.stopPropagation();
        }
      },
      true
    );

    const start = swipe.startAnimation;
    swipe.startAnimation = function () {
      discard();
      swiping = true;
      tapOwed = false;
      return start.apply(this, arguments);
    };
    const update = swipe.updateAnimation;
    swipe.updateAnimation = function (aSwipeUpdate) {
      const result = update.apply(this, arguments);
      try {
        follow(this, aSwipeUpdate);
      } catch (err) {
        noteError("swipe arrow: update", err);
      }
      return result;
    };
    const stop = swipe.stopAnimation;
    swipe.stopAnimation = function () {
      swiping = false;
      try {
        leave();
      } catch (err) {
        noteError("swipe arrow: stop", err);
      }
      return stop.apply(this, arguments);
    };
    gBrowser.tabContainer.addEventListener("TabSelect", discard);

    // letting go with the card open: no navigating, the card stays
    const gestures = window.gGestureSupport;
    const coordinate = gestures?._coordinateSwipeEventWithAnimation;
    if (gestures && coordinate) {
      gestures._coordinateSwipeEventWithAnimation = function (aEvent, aDir) {
        if (on() && pinned) {
          swipe.stopAnimation();
          return;
        }
        return coordinate.apply(this, arguments);
      };
    }
  }
  // ---------- Zen's Library: Clear in Downloads, and rows measured off the tabs
  // Off with "Zen's own Library look" (zia.library.zen-look): Zia leaves the
  // Library as Zen draws it (24-library.css is off then too).
  const LIBRARY_ZEN_LOOK_PREF = "zia.library.zen-look";
  const libraryZenLook = () => Services.prefs.getBoolPref(LIBRARY_ZEN_LOOK_PREF, false);

  // The Library's rows (and the downloads that fan out above its button)
  // take the tabs' own padding before the icon and gap after it, measured
  // off a tab as the Bookmarks and History panels' rows are
  // (28h-sidebar-panels.js)
  function matchLibraryRowsToTabs() {
    const sizes = tabMeasurements();
    if (!sizes) {
      return;
    }
    root.style.setProperty("--zia-lib-row-pad", sizes["--zia-row-pad"]);
    root.style.setProperty("--zia-lib-icon-gap", sizes["--zia-row-icon-gap"]);
  }

  // ---------- Media's tiles catch the light
  // Over a picture in the Library's Media, the tile leans a little towards
  // the cursor, its fine edge lights up nearest it, and the picture on it
  // lifts a touch, its shadow falling the other way (24-library.css draws
  // it from where the cursor is, set here). Still for anyone whose system
  // asks for less motion.
  function liftMediaUnderCursor(library) {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    const TILT = 8;
    let current = null;
    const settle = (item) => {
      if (!item) {
        return;
      }
      item.removeAttribute("zia-lifting");
      for (const name of ["--zia-lift-rx", "--zia-lift-ry", "--zia-lift-sx", "--zia-lift-sy", "--zia-lift-mx", "--zia-lift-my", "--zia-lift"]) {
        item.style.removeProperty(name);
      }
    };
    library.addEventListener("pointermove", (event) => {
      const item = event.target.closest?.(".zen-library-media-item");
      if (item !== current) {
        settle(current);
        current = item;
      }
      if (!item || still.matches || libraryZenLook()) {
        return;
      }
      const box = item.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
      const y = Math.min(1, Math.max(0, (event.clientY - box.top) / box.height));
      item.setAttribute("zia-lifting", "true");
      item.style.setProperty("--zia-lift", "1");
      item.style.setProperty("--zia-lift-ry", `${((x - 0.5) * 2 * TILT).toFixed(2)}deg`);
      item.style.setProperty("--zia-lift-rx", `${((0.5 - y) * 2 * TILT).toFixed(2)}deg`);
      item.style.setProperty("--zia-lift-sx", `${(-(x - 0.5) * 8).toFixed(1)}px`);
      item.style.setProperty("--zia-lift-sy", `${(-(y - 0.5) * 8).toFixed(1)}px`);
      item.style.setProperty("--zia-lift-mx", `${(x * 100).toFixed(1)}%`);
      item.style.setProperty("--zia-lift-my", `${(y * 100).toFixed(1)}%`);
    });
    library.addEventListener("pointerleave", () => {
      settle(current);
      current = null;
    });
  }

  // ---------- The chosen section's tile slides between sections
  // One lit tile behind the section buttons, moved to the chosen one, so
  // choosing another slides it there along the column, with Zia's spring,
  // rather than one going out and the other coming on (24-library.css).
  function railLibrarySections(library) {
    const column = library.querySelector("#zen-library-sidebar-tabs");
    if (!column) {
      return;
    }
    let rail = column.querySelector(":scope > .zia-library-rail");
    if (!rail) {
      rail = document.createElementNS(XHTML_NS, "div");
      rail.className = "zia-library-rail";
      column.appendChild(rail);
      new ResizeObserver(() => placeRail(column, rail, true)).observe(column);
    }
    placeRail(column, rail, !rail.hasAttribute("placed"));
  }

  function placeRail(column, rail, instantly) {
    const tab = column.querySelector(".zen-library-tab[active]");
    if (!tab) {
      rail.hidden = true;
      return;
    }
    const box = tab.getBoundingClientRect();
    const top = box.top - column.getBoundingClientRect().top + column.scrollTop;
    if (!box.height) {
      return;
    }
    const moved = rail.hasAttribute("placed") && rail.style.transform !== `translateY(${top}px)`;
    rail.hidden = false;
    rail.toggleAttribute("instant", instantly);
    rail.style.height = `${box.height}px`;
    rail.style.transform = `translateY(${top}px)`;
    rail.setAttribute("placed", "true");
    if (instantly) {
      requestAnimationFrame(() => rail.removeAttribute("instant"));
    } else if (moved && ultraOn()) {
      // (with Ultra on, it stretches and squashes on the way, 28s-ultra.js)
      ultraRailSquash(rail);
    }
  }

  // ---------- The Library button's picture of the last download clears itself
  // Zen leaves a small picture of the last download on the Library button
  // until the button is next hovered. It shows as the file flies in, then
  // clears a few seconds later (a download under way keeps its ring).
  function clearLibraryBadgeSoon() {
    const foot = document.getElementById("zen-sidebar-foot-buttons");
    if (!foot) {
      return;
    }
    let timer = null;
    const check = () => {
      clearTimeout(timer);
      if (!foot.hasAttribute("zen-library-badge")) {
        return;
      }
      timer = setTimeout(() => {
        const badge = document.getElementById("library-button-badge");
        if (!badge?.hasAttribute("downloading") && !foot.hasAttribute("zen-library-stack-open")) {
          foot.removeAttribute("zen-library-badge");
        }
      }, 4000);
    };
    new MutationObserver(check).observe(foot, { attributes: true, attributeFilter: ["zen-library-badge"] });
    check();
  }

  // ---------- Clear in the Library's Downloads and History
  // Zen's Library can only remove downloads one by one: Clear does what Firefox's
  // Clear Downloads does (finished ones leave the list and history, the files stay).
  // Zen redraws the section, so it's put back whenever missing. History's Clear
  // opens Firefox's Clear browsing data dialog.
  function dressLibrary() {
    const clearDownloads = () => {
      try {
        window.DownloadsCommon.getData(window, true).removeFinished();
      } catch (err) {
        console.warn("[Zia] Couldn't clear the downloads:", err);
      }
      if (!window.PrivateBrowsingUtils?.isWindowPrivate(window)) {
        PlacesUtils.history
          .removeVisitsByFilter({ transition: PlacesUtils.history.TRANSITIONS.DOWNLOAD })
          .catch((err) => console.warn("[Zia] Couldn't clear the downloads' history:", err));
      }
    };

    const clearHistory = () => {
      try {
        if (window.Sanitizer?.showUI) {
          window.Sanitizer.showUI(window);
        } else {
          document.getElementById("Tools:Sanitize")?.doCommand();
        }
      } catch (err) {
        console.warn("[Zia] Couldn't open Clear browsing data:", err);
      }
    };

    const CLEARS = [
      ["zen-library-downloads-section", "Clear downloads", "Clear downloads (the files stay)", clearDownloads],
      ["zen-library-history-section", "Clear history", "Clear history…", clearHistory],
    ];

    const addButtons = (library) => {
      if (libraryZenLook()) {
        for (const button of library.querySelectorAll(".zia-library-clear")) {
          button.remove();
        }
        return;
      }
      for (const [section, label, title, clear] of CLEARS) {
        for (const header of library.querySelectorAll(`${section} .zen-library-search-header`)) {
          if (header.querySelector(".zia-library-clear")) {
            continue;
          }
          const button = document.createElementNS(XHTML_NS, "button");
          button.className = "zen-library-filter-button zia-library-clear";
          button.setAttribute("aria-label", label);
          button.title = title;
          button.addEventListener("click", clear);
          header.appendChild(button);
        }
      }
    };

    // the Library is only made the first time it's opened
    let watched = null;
    const sectionWatcher = new MutationObserver((records) => {
      addButtons(watched);
      if (!records.every((record) => record.target.classList?.contains("zia-library-rail"))) {
        safely("library: rail", () => railLibrarySections(watched));
      }
      if (records.some((record) => record.target === watched && record.attributeName === "open") && watched.hasAttribute("open")) {
        safely("library: rows", matchLibraryRowsToTabs);
      }
    });
    const watchLibrary = () => {
      const library = document.querySelector("zen-library");
      if (!library || library === watched) {
        return;
      }
      watched = library;
      sectionWatcher.disconnect();
      sectionWatcher.observe(library, { childList: true, subtree: true, attributes: true, attributeFilter: ["open", "active"] });
      addButtons(library);
      safely("library: lift media", () => liftMediaUnderCursor(library));
      // (with Ultra on, its pictures dissolve in from a pixel mosaic, 28s-ultra.js)
      safely("library: media loader", () => ultraWatchMedia(library));
    };
    const toolbox = document.getElementById("navigator-toolbox");
    if (toolbox?.parentNode) {
      new MutationObserver(watchLibrary).observe(toolbox.parentNode, { childList: true });
    }
    watchLibrary();
    // (and before the downloads fan out above the Library button)
    document.getElementById("zen-library-button")?.addEventListener("mouseenter", () => safely("library: rows", matchLibraryRowsToTabs));
    safely("library: rows", matchLibraryRowsToTabs);
    watchPrefs(LIBRARY_ZEN_LOOK_PREF, () => watched && addButtons(watched));
  }

  // ---------- Rename finished downloads with AI (Tidy Downloads, by Bxthesda and
  // Zylaah, in tidy-downloads/ with their permission). Loaded here, only with the
  // option on: as the mod's own scripts, they ran only after Sine installed Zia.
  const TIDY_DOWNLOADS_SCRIPTS = ["tidy-downloads", "tidy-downloads-models"];

  function loadTidyDownloads() {
    if (!Services.prefs.getBoolPref("zia.features.tidy-downloads", false) || window.__ziaTidyDownloads) {
      return;
    }
    for (const name of TIDY_DOWNLOADS_SCRIPTS) {
      try {
        Services.scriptloader.loadSubScript(`chrome://sine/content/zia/tidy-downloads/${name}.js`, window);
      } catch (err) {
        console.error(`[Zia] Couldn't load Tidy Downloads (${name}):`, err);
        return;
      }
    }
  }

  // ---------- Zia's glass: the light where it's pressed
  function watchLiquidGlass() {
    // Pressed: a soft light under the pointer, fading once let go
    // (27-liquid-glass.css), on what has the glass. Marked on the
    // essential or button, with where the press is inside the box
    // that lights up.
    const PRESSABLE = [
      // (essentials, not the plain tabs, which have no glass)
      [".tabbrowser-tab[zen-essential]", (hit) => hit, (owner) => owner.querySelector(":scope > .tab-stack > .tab-background")],
      // (not Clear, whose icon is its background picture)
      ["zen-library :is(.zen-library-filter-button, .zen-library-filter-done, .zen-library-filter-chip):not(.zia-library-clear)", (hit) => hit, (owner) => owner],
      // (the chosen Library section lights the tile that slides behind it,
      // so it shines too; another lights its own hover tile, as the sliding
      // one's still behind the old section until the press is let go)
      ["zen-library .zen-library-tab", (hit) => (hit.hasAttribute("active") ? hit.parentNode.querySelector(":scope > .zia-library-rail") : hit), (owner, hit) => hit],
    ];
    let pressed = null;
    let pressedBox = null;
    let pressedAt = 0;
    // The light's strength, eased here rather than by a CSS transition: that
    // needs the colours registered with @property, which Zen's stylesheets
    // for mods don't take, so the light only ever snapped off.
    const shines = new Map();
    const rgba = (name) => {
      const parts = getComputedStyle(root).getPropertyValue(name).match(/[\d.]+/g)?.map(Number) || [255, 255, 255, 0];
      return parts.length > 3 ? parts : [...parts, 1];
    };
    const shine = (owner, to, ms, done) => {
      const run = shines.get(owner) || { level: 0, frame: 0 };
      cancelAnimationFrame(run.frame);
      shines.set(owner, run);
      const light = rgba("--zia-glass-press-light");
      const wash = rgba("--zia-glass-press-wash");
      const from = run.level;
      const start = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - start) / ms);
        // (ease out)
        run.level = from + (to - from) * (1 - (1 - t) ** 3);
        const paint = ([r, g, b, a]) => `rgba(${r}, ${g}, ${b}, ${a * run.level})`;
        owner.style.setProperty("--zia-press-light", paint(light));
        owner.style.setProperty("--zia-press-wash", paint(wash));
        if (t < 1) {
          run.frame = requestAnimationFrame(step);
        } else {
          run.frame = 0;
          done?.();
        }
      };
      run.frame = requestAnimationFrame(step);
    };
    const placeLight = (event) => {
      const box = pressedBox?.getBoundingClientRect();
      if (box) {
        pressed.style.setProperty("--zia-press-x", `${event.clientX - box.left}px`);
        pressed.style.setProperty("--zia-press-y", `${event.clientY - box.top}px`);
      }
    };
    // (held, the light follows the pointer, even off the button, and on
    // through a drag: holding and moving a tab or essential starts one,
    // which cancels the pointer, so the light waits for the real release)
    const follow = (event) => {
      if (pressed && (event.clientX || event.clientY)) {
        placeLight(event);
      }
    };
    const press = (event) => {
      // (only with Zia's glass on, an option)
      if (event.button !== 0 || !Services.prefs.getBoolPref("zia.glass", false)) {
        return;
      }
      for (const node of event.composedPath()) {
        if (node.nodeType !== Node.ELEMENT_NODE) {
          continue;
        }
        const match = PRESSABLE.find(([selector]) => node.matches(selector));
        if (!match) {
          continue;
        }
        const owner = match[1](node);
        const lit = owner && match[2](owner, node);
        if (!lit) {
          return;
        }
        pressed = owner;
        pressedBox = lit;
        placeLight(event);
        owner.setAttribute("zia-glass-press", "in");
        pressedAt = performance.now();
        shine(owner, 1, 60);
        return;
      }
    };
    const letGo = () => {
      const owner = pressed;
      pressed = null;
      pressedBox = null;
      if (!owner) {
        return;
      }
      // (a quick click still lights up for a moment before it fades)
      const lit = Math.max(0, 120 - (performance.now() - pressedAt));
      setTimeout(() => {
        if (owner.getAttribute("zia-glass-press") !== "in" || pressed === owner) {
          return;
        }
        owner.setAttribute("zia-glass-press", "out");
        shine(owner, 0, 280, () => {
          if (owner.getAttribute("zia-glass-press") === "out") {
            owner.removeAttribute("zia-glass-press");
            for (const name of ["--zia-press-x", "--zia-press-y", "--zia-press-light", "--zia-press-wash"]) {
              owner.style.removeProperty(name);
            }
            shines.delete(owner);
          }
        });
      }, lit);
    };
    const PRESS_EVENTS = [
      ["pointerdown", press],
      ["pointermove", follow],
      ["mousemove", follow],
      ["dragover", follow],
      ["pointerup", letGo],
      ["mouseup", letGo],
      ["dragend", letGo],
      ["drop", letGo],
      // (the window losing focus mid-press; not a field inside it)
      ["blur", (event) => event.target === window && letGo()],
    ];
    for (const [type, handler] of PRESS_EVENTS) {
      window.addEventListener(type, handler, true);
    }
  }
  // ---------- Zia's settings: rows shown only with the setting they belong to
  // Sine's first check of a row's conditions (preferences.json) runs before the row
  // is on the page, so every row showed; Zia applies them as its rows arrive.
  function fixSettingsConditions() {
    let rows = null;
    const loadRows = async () => {
      if (!rows) {
        const prefs = await (await fetch("chrome://sine/content/zia/preferences.json")).json();
        rows = new Map(prefs.filter((pref) => pref.conditions).map((pref) => [(pref.id ?? pref.property).replaceAll(".", "-"), pref]));
      }
      return rows;
    };

    const prefValue = ({ property, value }) => {
      if (typeof value === "boolean") {
        return Services.prefs.getBoolPref(property, false);
      }
      if (typeof value === "number") {
        return Services.prefs.getIntPref(property, 0);
      }
      return Services.prefs.getStringPref(property, "");
    };
    // (Sine's rules: "if" or "not", nested lists with their own "operator",
    // and a row's own list "OR" unless it says otherwise)
    const holds = (conditions, operator) => {
      const list = Array.isArray(conditions) ? conditions : [conditions];
      const results = list.map((cond) => {
        if (cond.if || cond.not) {
          const test = cond.if || cond.not;
          return (prefValue(test) === test.value) === !cond.not;
        }
        return cond.conditions ? holds(cond.conditions, cond.operator || "AND") : false;
      });
      return operator === "OR" ? results.some(Boolean) : results.every(Boolean);
    };

    const apply = async (doc) => {
      const known = await loadRows();
      for (const [id, pref] of known) {
        const row = doc.getElementById(id);
        if (row) {
          row.style.display = holds(pref.conditions, pref.operator || "OR") ? "flex" : "none";
        }
      }
    };

    const watch = (doc) => {
      let frame = 0;
      const soon = () => {
        if (!frame) {
          frame = doc.defaultView?.requestAnimationFrame(() => {
            frame = 0;
            apply(doc).catch((err) => noteError("settings: conditions", err));
          });
        }
      };
      new MutationObserver(soon).observe(doc, { childList: true, subtree: true });
      soon();
    };

    const onDocument = (doc) => {
      if (!/^about:(preferences|settings)/.test(doc?.documentURI || "") || doc.defaultView?.browsingContext?.topChromeWindow !== window) {
        return;
      }
      doc.defaultView.addEventListener("DOMContentLoaded", () => watch(doc), { once: true });
    };
    Services.obs.addObserver(onDocument, "document-element-inserted");
    window.addEventListener("unload", () => Services.obs.removeObserver(onDocument, "document-element-inserted"), { once: true });
  }

  // What a tab's buttons say they do. On a tab holding a glance the close
  // shuts the glance (28g-glance-thumbs.js) and the minus lets the glance
  // go, and on a pinned tab the minus only lets the tab go: nothing
  // switches, though Zen's word for the minus is "Unload and switch to
  // tab" either way. The tips are reworded while that wouldn't be true,
  // and handed back to Fluent when it would.
  function watchButtonTooltips() {
    const TIP_MARK = "zia-tip";
    const originals = new WeakMap();

    const retipButton = (button, text) => {
      if (!button) {
        return;
      }
      if (text) {
        if (!originals.has(button)) {
          originals.set(button, button.getAttribute("tooltiptext"));
        }
        if (button.getAttribute("tooltiptext") !== text) {
          button.setAttribute("tooltiptext", text);
        }
        button.setAttribute(TIP_MARK, "true");
        return;
      }
      if (!button.hasAttribute(TIP_MARK)) {
        return;
      }
      button.removeAttribute(TIP_MARK);
      const id = button.getAttribute("data-l10n-id");
      let args = {};
      try {
        args = JSON.parse(button.getAttribute("data-l10n-args") || "{}");
      } catch (err) {
        args = {};
      }
      if (id && document.l10n) {
        document.l10n.setAttributes(button, id, args);
      } else {
        setAttr(button, "tooltiptext", originals.get(button));
      }
      originals.delete(button);
    };

    const retip = (tab) => {
      if (!tab?.classList?.contains("tabbrowser-tab")) {
        return;
      }
      const glance = tab.hasAttribute("zen-glance-tab") || !!glanceOnTab(tab);
      retipButton(
        tab.querySelector(":scope > .tab-stack > .tab-content > .tab-close-button"),
        glance ? "Close glance" : null
      );
      retipButton(
        tab.querySelector(":scope > .tab-stack > .tab-content > .tab-reset-button"),
        glance ? "Unload glance" : tab.pinned ? "Unload tab" : null
      );
    };

    const retipAll = () => {
      for (const tab of gBrowser.tabs) {
        retip(tab);
      }
    };

    // Fluent rewrites a button's tip when its args change (a multiselect
    // growing, say), so the rewording is put back whenever the tip or the
    // marks it's set off change. (A tip is only set when it differs, so
    // this settles.)
    new MutationObserver(retipAll).observe(gBrowser.tabContainer, {
      subtree: true,
      attributes: true,
      attributeFilter: ["zen-glance-tab", "pinned", "tooltiptext", "data-l10n-args"],
    });
    for (const type of ["TabOpen", "TabPinned", "TabUnpinned"]) {
      gBrowser.tabContainer.addEventListener(type, retipAll);
    }
    retipAll();
  }

  // The spaces at the foot of the sidebar and the add-ons along the top
  // get the cards tabs get: a beat on the first hover, then the next one
  // is there at once, so a sweep across them reads them all, as Arc does
  // (#339). Their own tips are stashed so only the card shows — the stash
  // follows, as Zen rewrites a space's tip when the space is renamed and
  // an add-on on its own changes. What's in a pop-up or a menu keeps
  // Firefox's tip.
  function watchTipCards() {
    const TIPPED =
      "toolbarbutton[zen-workspace-id], toolbarbutton.webextension-browser-action, " +
      "toolbarbutton[data-extensionid], #unified-extensions-button";
    const TIP_ATTR = "zia-tip-text";
    // longer than a tab's grace: the row's gaps between buttons are wider
    const TIP_GRACE = 300;
    const inPopup = (el) => !!el.closest("popup, menupopup, panel, tooltip");

    const stash = (el) => {
      // an add-on's own tip can sit on a wrapper over the button (the
      // "unified-extensions-item" toolbaritem carries it too), and a tip
      // hunts up through ancestors, so the stash climbs to the toolbar
      for (let n = el; n && !inPopup(n); n = n.parentElement) {
        const text = n.getAttribute?.("tooltiptext");
        if (text !== null && text !== undefined) {
          if (text) {
            n.setAttribute(TIP_ATTR, text);
          }
          n.removeAttribute("tooltiptext");
        }
        if (n.matches?.("toolbar, #navigator-toolbox")) {
          break;
        }
      }
    };
    const stashUnder = (node) => {
      if (node?.matches?.(TIPPED)) {
        stash(node);
      }
      for (const el of node?.querySelectorAll?.(TIPPED) || []) {
        stash(el);
      }
    };
    // (the window itself, not the sidebar's box: the top row's add-ons
    // sit outside it. New buttons — an add-on installed, a space made —
    // are stashed as they land, and a tip Zen rewrites is re-stashed,
    // the wrapper's along with the button's.)
    stashUnder(document);
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "attributes") {
          if (record.target?.matches?.(TIPPED) || record.target?.querySelector?.(TIPPED)) {
            stash(record.target);
          }
        } else {
          for (const node of record.addedNodes) {
            stashUnder(node);
          }
        }
      }
    }).observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["tooltiptext"] });

    let card = null;
    let current = null;
    let showTimer = 0;
    let hideTimer = 0;
    let closeTimer = 0;
    const CARD_OUT_MS = 120;
    const cardUp = () => card && !card.hidden && !card.hasAttribute("zia-closing");

    const place = (el) => {
      const box = el.getBoundingClientRect();
      const width = card.offsetWidth;
      const height = card.offsetHeight;
      // below like a tip, unless there's no room: the spaces sit at the
      // window's foot, so theirs go above the icons
      const below = box.bottom + TAB_CARD_GAP + height <= window.innerHeight - TAB_CARD_GAP;
      const y = below ? box.bottom + TAB_CARD_GAP : box.top - height - TAB_CARD_GAP;
      const x = Math.max(
        TAB_CARD_GAP,
        Math.min(box.left + box.width / 2 - width / 2, window.innerWidth - width - TAB_CARD_GAP)
      );
      card.style.left = `${Math.round(x)}px`;
      card.style.top = `${Math.round(y)}px`;
      card.style.transformOrigin = `center ${below ? "top" : "bottom"}`;
    };

    const show = (el) => {
      const text =
        el.getAttribute(TIP_ATTR) ||
        el.getAttribute("tooltiptext") ||
        el.getAttribute("aria-label") ||
        el.getAttribute("label") ||
        "";
      if (!text.trim()) {
        return;
      }
      if (!card) {
        card = document.createElementNS(XHTML_NS, "div");
        card.id = "zia-tip-card";
        card.hidden = true;
        root.appendChild(card);
      }
      const wasUp = cardUp();
      current = el;
      card.textContent = text;
      card.hidden = false;
      place(el);
      clearTimeout(closeTimer);
      card.removeAttribute("zia-closing");
      if (wasUp) {
        card.setAttribute("zia-snap", "true");
        card.setAttribute("zia-open", "true");
        return;
      }
      card.removeAttribute("zia-snap");
      card.removeAttribute("zia-open");
      void card.offsetWidth;
      card.setAttribute("zia-open", "true");
    };

    const hide = () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      current = null;
      if (card && !card.hidden && !card.hasAttribute("zia-closing")) {
        card.removeAttribute("zia-snap");
        card.setAttribute("zia-closing", "true");
      }
      clearTimeout(closeTimer);
      closeTimer = setTimeout(() => {
        if (card?.hasAttribute("zia-closing")) {
          card.hidden = true;
          card.removeAttribute("zia-closing");
          card.removeAttribute("zia-open");
        }
      }, CARD_OUT_MS);
    };

    const tippedTarget = (node) => {
      const el = node?.closest?.(TIPPED);
      if (!el || inPopup(el)) {
        return null;
      }
      // one that slipped past the watcher is stashed as it's hovered
      stash(el);
      return el;
    };

    // the covered button under the pointer, before its card is even up:
    // a native tip anchored to it — or to a wrapper around it — is shut
    // at the door, so a card and a Firefox tip never double up
    let hovered = null;
    const tipIsOurs = (trigger) => {
      if (!trigger) {
        return false;
      }
      if (tippedTarget(trigger)) {
        return true;
      }
      const el = hovered || current;
      return !!el && (el.contains(trigger) || trigger.contains(el));
    };
    window.addEventListener(
      "popupshowing",
      (event) => {
        const popup = event.target;
        if (popup?.localName !== "tooltip") {
          return;
        }
        if (tipIsOurs(popup.triggerNode || document.tooltipNode)) {
          event.preventDefault();
          event.stopPropagation();
        }
      },
      true
    );
    window.addEventListener(
      "popupshown",
      (event) => {
        const popup = event.target;
        if (popup?.localName === "tooltip" && tipIsOurs(popup.triggerNode || document.tooltipNode)) {
          popup.hidePopup?.();
        }
      },
      true
    );

    root.addEventListener("mouseover", (event) => {
      const el = tippedTarget(event.target);
      if (!el || el.contains(event.relatedTarget)) {
        return;
      }
      hovered = el;
      clearTimeout(hideTimer);
      if (el === current) {
        return;
      }
      clearTimeout(showTimer);
      if (current) {
        show(el);
        return;
      }
      showTimer = setTimeout(() => {
        if (el.isConnected && el.matches(":hover")) {
          show(el);
        }
      }, TAB_CARD_DELAY);
    });
    root.addEventListener("mouseout", (event) => {
      const el = tippedTarget(event.target);
      if (!el || el.contains(event.relatedTarget)) {
        return;
      }
      hovered = null;
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      hideTimer = setTimeout(hide, TIP_GRACE);
    });
    for (const type of ["mousedown", "dragstart", "contextmenu", "popupshown"]) {
      window.addEventListener(type, () => hide(), true);
    }
    window.addEventListener("wheel", () => hide(), { passive: true, capture: true });
    window.addEventListener("blur", hide);
  }
  // ---------- Address bar commands: Zia's own actions in Zen's list, and answers
  // Zen lists its actions in the address bar's results (one shared list, matched
  // and learned from by Zen). Zia adds the ones people look for and can't reach
  // in one step (settings pages, this page's tools, moving a tab to a space),
  // drops the ones nobody types (next/previous tab or space, plain reload), and
  // renames a few to the words people use. Commands run with the window they
  // were picked in, never this script's own, since the list outlives windows.
  const ZEN_ICON = "chrome://browser/skin/zen-icons/";

  function ziaAction(label, icon, command, isAvailable = () => true) {
    return {
      label,
      icon: ZEN_ICON + icon + ".svg",
      command,
      commandId: "zia:" + label.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      isAvailable,
      extraPayload: {},
      zia: true,
    };
  }

  const isPage = (win) => !win.gBrowser.selectedTab.hasAttribute("zen-empty-tab");
  const isWebPage = (win) => isPage(win) && /^https?$/.test(win.gBrowser.currentURI?.scheme || "");
  // a Firefox command that can be run now (it's there and not disabled)
  const commandReady = (id) => (win) => {
    const el = win.document.getElementById(id);
    return !!el && el.getAttribute("disabled") !== "true";
  };
  const openPane = (pane) => (win) => win.openPreferences(pane);

  // A Settings page that's only just opening doesn't have Sine's page yet, and
  // Firefox shows the last one you looked at instead: once Sine has added its
  // page (up to 4 seconds), go there.
  async function openSineMods(win) {
    win.openPreferences("paneSineMods");
    for (let i = 0; i < 40; i++) {
      await new Promise((resolve) => win.setTimeout(resolve, 100));
      const browser = win.gBrowser.selectedBrowser;
      if (!browser.currentURI?.spec.startsWith("about:preferences")) {
        continue;
      }
      const doc = browser.contentDocument;
      if (doc?.getElementById("category-sine-mods")) {
        if (doc.location.hash.toLowerCase() !== "#sinemods") {
          browser.contentWindow.gotoPref("paneSineMods");
        }
        return;
      }
    }
  }
  const openPage = (url) => (win) => win.openTrustedLinkIn(url, "tab");
  const copyText = (text) => {
    Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper).copyString(text);
  };

  function cleanLink(uri) {
    try {
      const stripper = Cc["@mozilla.org/url-query-string-stripper;1"].getService(Ci.nsIURLQueryStringStripper);
      return (stripper.stripForCopyOrShare(uri) || uri).spec;
    } catch (err) {
      return uri.spec;
    }
  }

  function clearSiteData(win) {
    const { SiteDataManager } = ChromeUtils.importESModule("resource:///modules/SiteDataManager.sys.mjs");
    const base = SiteDataManager.getBaseDomainFromHost(win.gBrowser.currentURI.host);
    // Firefox's own confirmation first, as from the site's padlock
    if (SiteDataManager.promptSiteDataRemoval(win, [base])) {
      SiteDataManager.remove(base);
    }
  }

  function toggleDevTools(win) {
    try {
      const { require } = ChromeUtils.importESModule("resource://devtools/shared/loader/Loader.sys.mjs");
      const { gDevToolsBrowser } = require("resource://devtools/client/framework/devtools-browser.js");
      gDevToolsBrowser.toggleToolboxCommand(win.gBrowser, Cu.now());
    } catch (err) {
      noteError("address bar commands: developer tools", err);
    }
  }

  function moveTabToSpace(win, uuid) {
    const spaces = win.gZenWorkspaces;
    const tab = win.gBrowser.selectedTab;
    spaces.moveTabsToWorkspace([tab], uuid);
    spaces.lastSelectedWorkspaceTabs[uuid] = tab;
    spaces.changeWorkspace(spaces.getWorkspaces().find((space) => space.uuid === uuid));
  }

  const ZIA_ACTIONS = [
    // Settings, straight to the page
    ziaAction("Zia Settings", "settings", openSineMods),
    ziaAction("Keyboard Shortcuts", "settings", openPane("paneZenCKS")),
    ziaAction("Look and Feel Settings", "palette", openPane("paneZenLooks")),
    ziaAction("Spaces and Tabs Settings", "tab", openPane("paneZenTabManagement")),
    ziaAction("Search Engine Settings", "search-glass", openPane("paneSearch")),
    ziaAction("Privacy and Security Settings", "security", openPane("panePrivacy")),
    ziaAction("Sync Settings", "send-to-device", openPane("paneSync")),
    ziaAction("Passwords", "passwords", openPage("about:logins")),
    ziaAction("Task Manager", "tool-profiler", openPage("about:processes")),
    // This page
    ziaAction("Copy Link as Markdown", "link", (win) => {
      const tab = win.gBrowser.selectedTab;
      copyText(`[${tab.label.replace(/[[\]]/g, "")}](${win.gBrowser.currentURI.spec})`);
    }, isWebPage),
    ziaAction("Copy Clean Link", "link", (win) => copyText(cleanLink(win.gBrowser.currentURI)), isWebPage),
    ziaAction("Mute Tab", "media-mute", (win) => win.gBrowser.selectedTab.toggleMuteAudio(), (win) => isPage(win) && !win.gBrowser.selectedTab.muted),
    ziaAction("Unmute Tab", "media-unmute", (win) => win.gBrowser.selectedTab.toggleMuteAudio(), (win) => isPage(win) && win.gBrowser.selectedTab.muted),
    ziaAction("Picture-in-Picture", "screen", "View:PictureInPicture", (win) => isWebPage(win) && commandReady("View:PictureInPicture")(win)),
    ziaAction("Reader View", "reader-mode", "View:ReaderView", (win) => isWebPage(win) && commandReady("View:ReaderView")(win)),
    ziaAction("Translate Page", "translations", "cmd_translate", (win) => isWebPage(win) && commandReady("cmd_translate")(win)),
    ziaAction("Bookmark Page", "bookmark", "Browser:AddBookmarkAs", isWebPage),
    ziaAction("Reset Zoom", "zoom-out", "cmd_fullZoomReset", (win) => isPage(win) && win.ZoomManager?.zoom !== 1),
    ziaAction("Site Settings", "permissions", (win) => win.BrowserCommands.pageInfo(null, "permTab"), isWebPage),
    ziaAction("Clear Cookies and Site Data", "cookies-fill", clearSiteData, isWebPage),
    ziaAction("Developer Tools", "developer", toggleDevTools, isPage),
    // Tabs
    ziaAction("Move Tab to New Window", "window", (win) => win.gBrowser.replaceTabWithWindow(win.gBrowser.selectedTab), (win) => isPage(win) && win.gBrowser.visibleTabs.length > 1),
    ziaAction("Close Other Tabs", "close", (win) => win.gBrowser.removeAllTabsBut(win.gBrowser.selectedTab), (win) => win.gBrowser.visibleTabs.some((tab) => !tab.pinned && !tab.selected)),
    ziaAction("Unload Other Tabs", "moon-stars", (win) => {
      for (const tab of win.gBrowser.visibleTabs) {
        if (!tab.selected && tab.linkedPanel) {
          win.gBrowser.discardBrowser(tab);
        }
      }
    }, (win) => win.gBrowser.visibleTabs.some((tab) => !tab.selected && tab.linkedPanel)),
    ziaAction("Add to Multiview", "split", (win) => win.ZiaCommands?.addToMultiview(), (win) => !!win.ZiaCommands?.canAddToMultiview()),
    // History and Zia
    ziaAction("Downloads", "downloads", "Tools:Downloads"),
    ziaAction("Clear Recent History", "history", "Tools:Sanitize"),
    ziaAction("What's New in Zia", "sparkles", () => Services.prefs.setBoolPref("zia.welcome.whats-new-again", true)),
    ziaAction("Toggle Edge to Edge Page", "fullscreen", () => {
      Services.prefs.setBoolPref("zia.page.edge-to-edge", !Services.prefs.getBoolPref("zia.page.edge-to-edge", false));
    }),
  ];

  // Zen's that nobody types (keyboard moves, plain reload) come out; a few are
  // renamed to the words people search with
  const ZEN_DROPPED = ["next-space", "previous-space", "next-tab", "previous-tab", "reload-tab", "new-blank-window"];
  const ZEN_RENAMED = {
    "unsplit-view": "Unsplit View",
    "reload-tab-without-cache": "Hard Refresh",
    "duplicate-tab": "Duplicate Tab",
    "copy-current-url": "Copy Link",
  };

  function addressBarActions() {
    try {
      return ChromeUtils.importESModule("resource:///modules/ZenUBGlobalActions.sys.mjs").globalActions;
    } catch (err) {
      return null;
    }
  }

  // "Move Tab to …", one per other space, kept in step with the spaces each
  // time the address bar is focused
  function refreshSpaceActions(actions, win) {
    for (let i = actions.length - 1; i >= 0; i--) {
      if (actions[i].ziaSpace) {
        actions.splice(i, 1);
      }
    }
    const spaces = win.gZenWorkspaces;
    if (!spaces || spaces.privateWindowOrDisabled) {
      return;
    }
    for (const space of spaces.getWorkspaces() || []) {
      const action = ziaAction(`Move Tab to ${space.name}`, "forward", (w) => moveTabToSpace(w, space.uuid), (w) => isPage(w) && w.gZenWorkspaces.activeWorkspace !== space.uuid);
      action.commandId = `zia:move-to-space-${space.uuid}`;
      action.ziaSpace = true;
      actions.push(action);
    }
  }

  // Zen matches commands loosely ("zia settings" found Sync Settings) and puts
  // one you've used before first, so Enter ran the wrong one. A command now
  // shows only when each word typed starts a word of its name (or of the space
  // or extension it's for). Prefixed searches (Zen's action and space modes)
  // are left as Zen has them.
  const ACTIONS_PROVIDER = "ZenUrlbarProviderGlobalActions";

  function actionsProvider() {
    try {
      const { ProvidersManager } = ChromeUtils.importESModule("moz-src:///browser/components/urlbar/UrlbarProvidersManager.sys.mjs");
      return ProvidersManager.getInstanceForSap("urlbar").getProvider(ACTIONS_PROVIDER);
    } catch (err) {
      return null;
    }
  }

  // (also its initials, so "pip" finds Picture-in-Picture)
  function namesCommand(query, result) {
    const plain = (text) => text.toLowerCase().replace(/['’]/g, "");
    const words = plain(query).trim().split(/\s+/).filter(Boolean);
    const name = plain(`${result.payload.title || ""} ${result.payload.prettyName || ""}`);
    const nameWords = name.split(/[\s\-–:/.()]+/).filter(Boolean);
    const initials = nameWords.map((nameWord) => nameWord[0]).join("");
    return (
      words.every((word) => nameWords.some((nameWord) => nameWord.startsWith(word))) ||
      (words.length === 1 && words[0].length > 1 && initials.startsWith(words[0]))
    );
  }

  function matchCommandsStrictly() {
    const provider = actionsProvider();
    if (!provider) {
      return;
    }
    const original = provider.ziaOriginalStartQuery || provider.startQuery;
    provider.ziaOriginalStartQuery = original;
    provider.startQuery = function (queryContext, addCallback) {
      if (queryContext.searchMode) {
        return original.call(this, queryContext, addCallback);
      }
      return original.call(this, queryContext, (from, result) => {
        if (namesCommand(queryContext.searchString || "", result)) {
          addCallback(from, result);
        }
      });
    };
  }

  function unmatchCommandsStrictly() {
    const provider = actionsProvider();
    if (provider?.ziaOriginalStartQuery) {
      provider.startQuery = provider.ziaOriginalStartQuery;
      delete provider.ziaOriginalStartQuery;
    }
  }

  // One window installs Zia's entries in the shared list (and the colour answer);
  // as it closes, another open window takes over, since functions made in a
  // closed window can't be run.
  let colourProvider = null;

  function installAddressBarCommands(actions) {
    for (let i = actions.length - 1; i >= 0; i--) {
      const key = String(actions[i].l10nId || "").replace("zen-action-", "");
      if (ZEN_DROPPED.includes(key)) {
        actions.splice(i, 1);
      } else if (ZEN_RENAMED[key]) {
        // a plain string, so nothing of this window stays behind in Zen's entry
        Object.defineProperty(actions[i], "label", { value: ZEN_RENAMED[key], configurable: true });
      }
    }
    actions.push(...ZIA_ACTIONS);
    actions.ziaOwner = window;
    colourProvider = registerColourAnswer();
    matchCommandsStrictly();
  }

  function removeZiaEntries(actions, spacesOnly) {
    for (let i = actions.length - 1; i >= 0; i--) {
      if (actions[i].ziaSpace || (!spacesOnly && actions[i].zia)) {
        actions.splice(i, 1);
      }
    }
  }

  function setupAddressBarCommands() {
    const actions = addressBarActions();
    if (!actions) {
      return;
    }
    // what only this window can do, for commands picked in it
    window.ZiaCommands = {
      canAddToMultiview: () => Services.prefs.getBoolPref("zia.multiview", true) && !!tabMultiviewEntry(gBrowser.selectedTab),
      addToMultiview: () => {
        const entry = tabMultiviewEntry(gBrowser.selectedTab);
        if (entry) {
          addToMultiview(entry);
        }
      },
      takeOver: () => {
        installAddressBarCommands(actions);
        refreshSpaceActions(actions, window);
      },
    };
    if (!actions.some((action) => action.zia)) {
      installAddressBarCommands(actions);
    }
    refreshSpaceActions(actions, window);
    gURLBar.inputField?.addEventListener("focus", () => refreshSpaceActions(actions, window));
    window.addEventListener("unload", () => {
      if (actions.ziaOwner !== window) {
        // its "Move Tab to" entries may be this window's: made again on the next focus
        removeZiaEntries(actions, true);
        return;
      }
      removeZiaEntries(actions, false);
      unmatchCommandsStrictly();
      actions.ziaOwner = null;
      try {
        colourProvider?.manager.unregisterProvider(colourProvider.provider);
      } catch (err) {}
      for (const other of Services.wm.getEnumerator("navigator:browser")) {
        if (other !== window && other.ZiaCommands) {
          other.ZiaCommands.takeOver();
          break;
        }
      }
    });
  }

  // ---------- Colour answers: a hex or rgb() colour, shown with its swatch and
  // its other forms; picking it copies the hex. (Maths, units and time zones are
  // Firefox's own, switched on in applyZenDefaults.)
  function colourOf(text) {
    const s = text.trim();
    let rgb = null;
    let m = s.match(/^#([0-9a-f]{6}|[0-9a-f]{3})$/i);
    if (m) {
      const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
      rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    } else if ((m = s.match(/^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\s*(?:[,/][^)]*)?\)$/i))) {
      rgb = [m[1], m[2], m[3]].map(Number);
      if (rgb.some((v) => v > 255)) {
        return null;
      }
    }
    if (!rgb) {
      return null;
    }
    const [r, g, b] = rgb.map((v) => v / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    let h = 0;
    let sat = 0;
    if (d) {
      sat = d / (1 - Math.abs(2 * l - 1));
      h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h = Math.round(h * 60 + 360) % 360;
    }
    return {
      hex: "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase(),
      rgb: `rgb(${rgb.join(" ")})`,
      hsl: `hsl(${h} ${Math.round(sat * 100)}% ${Math.round(l * 100)}%)`,
    };
  }

  function registerColourAnswer() {
    let manager;
    let UrlbarProvider;
    let UrlbarResult;
    let UrlbarShared;
    try {
      ({ ProvidersManager: manager } = ChromeUtils.importESModule("moz-src:///browser/components/urlbar/UrlbarProvidersManager.sys.mjs"));
      manager = manager.getInstanceForSap("urlbar");
      ({ UrlbarProvider } = ChromeUtils.importESModule("moz-src:///browser/components/urlbar/UrlbarUtils.sys.mjs"));
      ({ UrlbarResult } = ChromeUtils.importESModule("chrome://browser/content/urlbar/UrlbarResult.mjs"));
      ({ UrlbarShared } = ChromeUtils.importESModule("chrome://browser/content/urlbar/UrlbarShared.mjs"));
    } catch (err) {
      noteError("address bar commands: colour answer", err);
      return null;
    }
    const existing = manager.getProvider("ProviderZiaColour");
    if (existing) {
      manager.unregisterProvider(existing);
    }
    class ProviderZiaColour extends UrlbarProvider {
      get type() {
        return UrlbarShared.PROVIDER_TYPE.PROFILE;
      }

      async isActive({ searchString }) {
        this.colour = colourOf(searchString || "");
        return !!this.colour;
      }

      getViewTemplate() {
        return {
          attributes: { selectable: true },
          children: [
            {
              name: "content",
              tag: "span",
              classList: ["urlbarView-no-wrap"],
              children: [
                { name: "swatch", tag: "span" },
                { name: "output", tag: "strong" },
                { name: "forms", tag: "span" },
              ],
            },
          ],
        };
      }

      getViewUpdate(result) {
        const { hex, rgb, hsl } = result.payload;
        return {
          swatch: { style: { "background-color": hex } },
          output: { textContent: hex },
          forms: { textContent: `${rgb} · ${hsl}` },
        };
      }

      startQuery(queryContext, addCallback) {
        addCallback(
          this,
          new UrlbarResult({
            type: UrlbarShared.RESULT_TYPE.DYNAMIC,
            source: UrlbarShared.RESULT_SOURCE.OTHER_LOCAL,
            suggestedIndex: 1,
            payload: { dynamicType: "ziaColour", ...this.colour },
          })
        );
      }

      onEngagement(queryContext, controller, details) {
        copyText(details.result.payload.hex);
      }
    }
    const provider = new ProviderZiaColour();
    manager.registerProvider(provider);
    return { manager, provider };
  }

  // The screenshot buttons as Zia's tiles: flat, a squircle, a hairline, lighter
  // on hover, as the site panel's (25c-screenshots.css draws the card round
  // them). They're drawn inside the element, out of reach of chrome.css, so
  // their look is put in there as each one appears. Full page, Firefox's
  // primary button, is a tile like the other rather than a bright one.
  const SCREENSHOT_BUTTON_RULES = `
    moz-button-group {
      gap: 6px !important;
    }
    .screenshot-button,
    .mini-window-option {
      appearance: none !important;
      margin: 0 !important;
      border: none !important;
      border-radius: var(--zia-glass-button-radius, 10px) !important;
      corner-shape: var(--zia-squircle, round) !important;
      background-color: color-mix(in srgb, currentColor 7%, transparent) !important;
      box-shadow: inset 0 0 0 0.5px color-mix(in srgb, currentColor 6%, transparent) !important;
      color: inherit !important;
      font-weight: 500 !important;
      stroke: color-mix(in srgb, currentColor 30%, transparent) !important;
      transition: background-color 0.12s ease, transform 0.12s ease !important;
    }
    .screenshot-button:hover,
    .mini-window-option:hover {
      background-color: color-mix(in srgb, currentColor 12%, transparent) !important;
    }
    .screenshot-button:hover:active,
    .mini-window-option:hover:active {
      background-color: color-mix(in srgb, currentColor 20%, transparent) !important;
      transform: scale(0.97);
    }
    .screenshot-button:focus-visible,
    .mini-window-option:focus-visible {
      outline: 2px solid color-mix(in srgb, currentColor 40%, transparent) !important;
      outline-offset: 1px !important;
    }
    .mini-window-option[data-default] {
      background-color: color-mix(in srgb, currentColor 12%, transparent) !important;
    }
  `;

  function watchScreenshotButtons() {
    let sheet = null;
    const style = (el) => {
      const shadow = el?.shadowRoot;
      if (!shadow || shadow.ziaStyled) {
        return;
      }
      try {
        if (!sheet) {
          sheet = new window.CSSStyleSheet();
          sheet.replaceSync(SCREENSHOT_BUTTON_RULES);
        }
        shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, sheet];
        shadow.ziaStyled = true;
      } catch (err) {
        noteError("screenshots: buttons", err);
      }
    };
    // (each put in the window as a screenshot starts, over the page or, in older
    // Firefox, in the window's pop-ups; drawn inside as it goes in, so styled after)
    const find = (node) => {
      if (node.nodeType !== Node.ELEMENT_NODE) {
        return;
      }
      if (node.localName === "screenshots-buttons") {
        style(node);
      } else if (node.firstElementChild) {
        node.querySelectorAll("screenshots-buttons").forEach(style);
      }
    };
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach(find);
      }
    });
    for (const id of ["tabbrowser-tabpanels", "mainPopupSet"]) {
      const where = document.getElementById(id);
      if (where) {
        observer.observe(where, { childList: true, subtree: true });
      }
    }
    window.addEventListener("unload", () => observer.disconnect());
    document.querySelectorAll("screenshots-buttons").forEach(style);
  }
  // ---------- Thinking orbs: a small dotted 3D orb on a 2D canvas
  // A framework-free port of the canvas engine in thinking-orbs 0.3.2
  // (https://libraries.dev/orbs), for the tab's loading spinner. The
  // geometry, projection, presets and painter are the package's, line for
  // line (the one change: a one-device-pixel floor on dots, which only
  // matters under a device pixel ratio of 5/3; see ORB_MIN_DEVICE_R); the
  // React component around them is replaced by ziaOrb() and one shared
  // animation loop.
  //
  // thinking-orbs is MIT licensed:
  //
  //   MIT License
  //
  //   Copyright (c) 2026 Jakub Antalik
  //
  //   Permission is hereby granted, free of charge, to any person obtaining a
  //   copy of this software and associated documentation files (the
  //   "Software"), to deal in the Software without restriction, including
  //   without limitation the rights to use, copy, modify, merge, publish,
  //   distribute, sublicense, and/or sell copies of the Software, and to
  //   permit persons to whom the Software is furnished to do so, subject to
  //   the following conditions:
  //
  //   The above copyright notice and this permission notice shall be included
  //   in all copies or substantial portions of the Software.
  //
  //   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
  //   OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
  //   MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
  //   IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
  //   CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
  //   TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
  //   SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
  //
  // Use:
  //   const orb = ziaOrb(document.createElementNS(XHTML_NS, "canvas"), { state: "searching", size: 16 });
  //   box.append(orb.canvas);
  //   orb.setState("connecting"); orb.setDark(false); orb.destroy();
  //
  // Options: state (one of ORB_STATES, default "working"); size in CSS px
  // (default 64; 64, 32 and 20 are the package's tunings, sizes between
  // are interpolated the way the package made its 32, and anything under
  // 20 is the 20 tuning drawn at that size); dark (true: light dots for a
  // dark background, false: dark dots for a light one, left out: follow
  // prefers-color-scheme); and, as in the package, speed (a multiplier),
  // color (an ink tint, "#rgb", "#rrggbb" or "rgb()") and label (the
  // canvas's aria-label; it's left alone if the canvas is aria-hidden).
  //
  // A canvas that's out of the document when the loop next runs is dropped
  // (destroy() isn't needed for it); setState() or setDark() on a handle
  // whose canvas is back in the document picks it up again.

  // ----- geometry helpers (engine/core)
  function orbLerp(a, b, f) {
    return a + (b - a) * f;
  }

  function orbFrac(x) {
    return x - Math.floor(x);
  }

  // deterministic hash in [0, 1)
  function orbHash(a, b) {
    const h = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
    return h - Math.floor(h);
  }

  // value noise on a 2D lattice: smooth, deterministic, cheap
  function orbNoise(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    let fx = x - xi;
    let fy = y - yi;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const a = orbHash(xi, yi);
    const b = orbHash(xi + 1, yi);
    const c = orbHash(xi, yi + 1);
    const d = orbHash(xi + 1, yi + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }

  // stable directions on a unit sphere (Fibonacci lattice)
  function orbFibDir(i, n) {
    const golden = Math.PI * (3 - Math.sqrt(5));
    const y = 1 - (2 * (i + 0.5)) / n;
    const rad = Math.sqrt(1 - y * y);
    const a = i * golden;
    return [rad * Math.cos(a), y, rad * Math.sin(a)];
  }

  // shortest signed angular distance, wrapped to (-pi, pi]
  function orbAngleDelta(a, b) {
    return Math.atan2(Math.sin(a - b), Math.cos(a - b));
  }

  // shared spin (yaw) + tilt + orthographic projection
  function orbProjector(yaw, tilt, cx, cy, scale) {
    const st = Math.sin(tilt);
    const ct = Math.cos(tilt);
    const sy = Math.sin(yaw);
    const cyw = Math.cos(yaw);
    return (x, y, z) => {
      const x1 = x * cyw + z * sy;
      const z1 = -x * sy + z * cyw;
      const y1 = y * ct - z1 * st;
      const z2 = y * st + z1 * ct;
      return [cx + x1 * scale, cy - y1 * scale, z2];
    };
  }

  // dot radii were tuned for a 300px frame; sub-linear scaling keeps small
  // orbs legible
  function orbRadiusScale(size, pow) {
    return (size / 300) ** pow;
  }

  // drop invisible marks, clamp radii to the mode's floor, and z-sort
  // far to near into draw order
  function orbFinalize(dots, lines, rMin = 0.3) {
    const visible = [];
    for (const d of dots) {
      if ((d.a ?? 1) < 0.02) {
        continue;
      }
      d.r = Math.max(rMin, d.r);
      visible.push(d);
    }
    visible.sort((a, b) => a.z - b.z);
    return { dots: visible, lines: lines.filter((l) => (l.a ?? 1) >= 0.02) };
  }

  // ----- painter: matte grayscale dots; on a dark background the ink value
  // is mirrored (1 - white) so near dots read bright
  function orbInk(w, alpha, dark, tint) {
    if (!tint) {
      const g = Math.round((dark ? 1 - w : w) * 255);
      return `rgba(${g},${g},${g},${alpha})`;
    }
    const ramp = (c) => Math.round(dark ? c * (1 - w) : c + (255 - c) * w);
    return `rgba(${ramp(tint.r)},${ramp(tint.g)},${ramp(tint.b)},${alpha})`;
  }

  // lines first, so the nodes sit on top of their edges. (minR, in CSS px,
  // is this port's: see ORB_MIN_DEVICE_R.)
  function orbPaintFrame(ctx, frame, dark, tint, minR = 0) {
    for (const l of frame.lines) {
      const w = Math.min(1, Math.max(0, l.white));
      ctx.strokeStyle = orbInk(w, l.a ?? 1, dark, tint);
      ctx.lineWidth = l.w;
      ctx.beginPath();
      ctx.moveTo(l.x1, l.y1);
      ctx.lineTo(l.x2, l.y2);
      ctx.stroke();
    }
    for (const d of frame.dots) {
      const w = Math.min(1, Math.max(0, d.white));
      ctx.fillStyle = orbInk(w, d.a ?? 1, dark, tint);
      ctx.beginPath();
      ctx.arc(d.x, d.y, Math.max(d.r, minR), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // "#rgb", "#rrggbb" or "rgb()/rgba()" to {r, g, b}, else undefined
  function orbParseTint(color) {
    if (!color) {
      return undefined;
    }
    const hex = String(color).trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex) {
      let h = hex[1];
      if (h.length === 3) {
        h = h.replace(/./g, (c) => c + c);
      }
      const n = parseInt(h, 16);
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }
    const fn = String(color).trim().match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
    if (fn) {
      return { r: Number(fn[1]), g: Number(fn[2]), b: Number(fn[3]) };
    }
    return undefined;
  }

  // ----- modes: pure geometry over (size, t, opts), one per state

  // weaving: three strands plait around the sphere
  function orbFrameBraid(size, t, o) {
    const cx = size / 2;
    const cy = size / 2;
    const R = (size / 2) * 0.76;
    const pt = orbProjector(t * 0.4, 0.3, cx, cy, 1);
    const rs = orbRadiusScale(size, o.rsPow ?? 0.6);
    const dots = [];
    const ghostN = o.ghostN ?? 150;
    for (let i = 0; i < ghostN; i++) {
      const d = orbFibDir(i, ghostN);
      const [px, py, z] = pt(d[0] * R, d[1] * R, d[2] * R);
      const depth = (z / R + 1) / 2;
      dots.push({ x: px, y: py, z, r: 0.8 * rs, white: 0.78, a: 0.1 + 0.22 * depth });
    }
    const strandN = o.strandN ?? 52;
    const turns = o.turns ?? 3;
    for (let s = 0; s < 3; s++) {
      const phase = (s / 3) * 2 * Math.PI;
      for (let i = 0; i < strandN; i++) {
        const u = (orbFrac(i / strandN + t * 0.045) * 2 - 1) * 0.96;
        const surf = Math.sqrt(Math.max(0, 1 - u * u));
        const endFade = Math.min(1, (1 - Math.abs(u)) / 0.1);
        const a = u * Math.PI * turns + phase;
        const weave = 1 + 0.075 * Math.sin(u * Math.PI * turns * 2 + phase * 2 + t * 0.8);
        const rr = surf * R * weave;
        const [px, py, zr] = pt(Math.cos(a) * rr, u * R * weave, Math.sin(a) * rr);
        const depth = (zr / R + 1) / 2;
        dots.push({
          x: px,
          y: py,
          z: zr,
          r: ((o.rBase ?? 1.2) + (o.rDepth ?? 1.8) * depth) * rs,
          white: 0.55 - 0.45 * depth,
          a: endFade * (0.45 + 0.55 * depth),
        });
      }
    }
    return orbFinalize(dots, [], o.rMin);
  }

  // solving: the scramble-then-solve schedule and the quarter-turn moves
  function orbSolveCycle(time, count, slotDur, rest) {
    const cyc = 2 * count * slotDur + rest;
    const tc = time % cyc;
    const amount = new Array(count).fill(0);
    let active = -1;
    if (tc < 2 * count * slotDur) {
      const slot = Math.floor(tc / slotDur);
      const p = (tc - slot * slotDur) / slotDur;
      const cl = Math.min(1, p / 0.7);
      const ep = 1 - (1 - cl) ** 3;
      if (slot < count) {
        for (let i = 0; i < slot; i++) {
          amount[i] = 1;
        }
        amount[slot] = ep;
        active = slot;
      } else {
        const u = 2 * count - 1 - slot;
        for (let i = 0; i < u; i++) {
          amount[i] = 1;
        }
        amount[u] = 1 - ep;
        active = u;
      }
    }
    return { amount, active };
  }

  function orbApplyMoves(pt3, moves, sc) {
    let [x, y, z] = pt3;
    let inActive = false;
    for (let i = 0; i < moves.length; i++) {
      if (sc.amount[i] <= 0) {
        continue;
      }
      const mv = moves[i];
      const coord = mv.axis === 0 ? x : mv.axis === 1 ? y : z;
      if (coord < mv.lo || coord >= mv.hi) {
        continue;
      }
      if (i === sc.active) {
        inActive = true;
      }
      const a = mv.ang * sc.amount[i];
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      if (mv.axis === 0) {
        const y2 = y * ca - z * sa;
        z = y * sa + z * ca;
        y = y2;
      } else if (mv.axis === 1) {
        const x2 = x * ca + z * sa;
        z = -x * sa + z * ca;
        x = x2;
      } else {
        const x2 = x * ca - y * sa;
        y = x * sa + y * ca;
        x = x2;
      }
    }
    return [x, y, z, inActive];
  }

  function orbMakeMoves(count) {
    const moves = [];
    for (let i = 0; i < count; i++) {
      const axis = Math.min(2, Math.floor(orbHash(i, 2.3) * 3));
      const lo = -1 + 0.5 * Math.min(3, Math.floor(orbHash(i, 5.9) * 4));
      const dir = orbHash(i, 7.7) < 0.5 ? 1 : -1;
      moves.push({ axis, lo, hi: lo + 0.5, ang: (dir * Math.PI) / 2 });
    }
    return moves;
  }

  // searching: a scan meridian sweeps a dotted globe
  function orbFrameGlobe(size, t, o) {
    const spin = 0.5;
    const cx = size / 2;
    const cy = size / 2;
    const radius = (size / 2) * 0.82;
    const tilt = 0.4 + 0.06 * Math.sin(t * 0.35);
    const pt = orbProjector(t * spin, tilt, cx, cy, radius);
    const scan = t * (spin + (1.7 - spin) * (o.scanMul ?? 1));
    const rs = orbRadiusScale(size, o.rsPow ?? 0.6);
    const dimBase = o.dimBase ?? 1;
    const dots = [];
    const latRings = o.latRings ?? 17;
    const lonDensity = o.lonDensity ?? 44;
    for (let li = 0; li <= latRings; li++) {
      const lat = -Math.PI / 2 + (li / latRings) * Math.PI;
      const cosLat = Math.cos(lat);
      const sinLat = Math.sin(lat);
      const lonCount = Math.max(1, Math.round(Math.abs(cosLat) * lonDensity));
      for (let lj = 0; lj < lonCount; lj++) {
        const lon = (lj / lonCount) * 2 * Math.PI;
        const [px, py, z] = pt(cosLat * Math.cos(lon), sinLat, cosLat * Math.sin(lon));
        const depth = (z + 1) / 2;
        const d = orbAngleDelta(lon + t * spin, scan);
        const boost = Math.exp(-(d * d) / 0.18) * Math.max(0, z);
        dots.push({
          x: px,
          y: py,
          z,
          r: ((o.rBase ?? 0.6) + (o.rDepth ?? 1.7) * depth + (o.rBoost ?? 1) * boost) * rs,
          white: (o.inkFar ?? 0.62) - (o.inkSpan ?? 0.54) * depth,
          // (dimBase under 1 fades the un-scanned dots so the meridian reads)
          a: dimBase + (1 - dimBase) * Math.min(1, boost),
        });
      }
    }
    return orbFinalize(dots, [], o.rMin);
  }

  // solving: bands scramble in quarter turns, then click back
  function orbFrameRubik(size, t, o) {
    const cx = size / 2;
    const cy = size / 2;
    const R = (size / 2) * 0.82;
    const pt = orbProjector(t * 0.55, 0.35 + 0.1 * Math.sin(t * 0.9), cx, cy, R);
    const rs = orbRadiusScale(size, o.rsPow ?? 0.6);
    const moveCount = o.moveCount ?? 14;
    const moves = orbMakeMoves(moveCount);
    const sc = orbSolveCycle(t, moveCount, 0.42, 1.2);
    const dots = [];
    const latRings = o.latRings ?? 15;
    const lonDensity = o.lonDensity ?? 40;
    for (let li = 0; li <= latRings; li++) {
      const lat = -Math.PI / 2 + (li / latRings) * Math.PI;
      const cosLat = Math.cos(lat);
      const sinLat = Math.sin(lat);
      const lonCount = Math.max(1, Math.round(Math.abs(cosLat) * lonDensity));
      for (let lj = 0; lj < lonCount; lj++) {
        const lon = (lj / lonCount) * 2 * Math.PI;
        const [x, y, z, inActive] = orbApplyMoves([cosLat * Math.cos(lon), sinLat, cosLat * Math.sin(lon)], moves, sc);
        const [px, py, zr] = pt(x, y, z);
        const depth = (zr + 1) / 2;
        dots.push({
          x: px,
          y: py,
          z: zr,
          r: ((o.rBase ?? 0.6) + (o.rDepth ?? 1.7) * depth + (inActive ? (o.rActive ?? 0.3) : 0)) * rs,
          white: (o.inkFar ?? 0.62) - (o.inkSpan ?? 0.54) * depth - (inActive ? 0.14 : 0),
        });
      }
    }
    return orbFinalize(dots, [], o.rMin);
  }

  // listening: a waveform rolls through latitude rings
  function orbFrameWave(size, t, o) {
    const cx = size / 2;
    const cy = size / 2;
    const R = (size / 2) * 0.874;
    const pt = orbProjector(t * 0.18, 0.38, cx, cy, 1);
    const rs = orbRadiusScale(size, o.rsPow ?? 0.6);
    const dots = [];
    const rings = o.rings ?? 15;
    const lonDensity = o.lonDensity ?? 40;
    for (let ri = 0; ri <= rings; ri++) {
      const lat = -Math.PI / 2 + (ri / rings) * Math.PI;
      const cosLat = Math.cos(lat);
      const sinLat = Math.sin(lat);
      const w = 0.62 * Math.sin(t * 2.1 - ri * 0.52) + 0.38 * Math.sin(t * 1.27 + ri * 0.83);
      const rr = R * (0.88 + 0.105 * w);
      const lonCount = Math.max(1, Math.round(Math.abs(cosLat) * lonDensity));
      for (let lj = 0; lj < lonCount; lj++) {
        const lon = (lj / lonCount) * 2 * Math.PI;
        const [px, py, z] = pt(cosLat * Math.cos(lon) * rr, sinLat * rr, cosLat * Math.sin(lon) * rr);
        const depth = (z / R + 1) / 2;
        const crest = Math.max(0, w);
        dots.push({
          x: px,
          y: py,
          z,
          r: ((o.rBase ?? 0.6) + (o.rDepth ?? 1.7) * depth) * (1 + 0.4 * crest) * rs,
          white: 0.66 - 0.56 * depth - 0.1 * crest,
        });
      }
    }
    return orbFinalize(dots, [], o.rMin);
  }

  // shaping: a dotted outline morphs circle, triangle, square
  function orbSmooth(x) {
    return x * x * (3 - 2 * x);
  }

  function orbPolyPath(verts) {
    const V = verts.length;
    const L = [];
    let total = 0;
    for (let i = 0; i < V; i++) {
      const a = verts[i];
      const b = verts[(i + 1) % V];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      L.push(l);
      total += l;
    }
    return (f) => {
      let target = f * total;
      let i = 0;
      while (target > L[i] && i < V - 1) {
        target -= L[i];
        i++;
      }
      const a = verts[i];
      const b = verts[(i + 1) % V];
      const ff = L[i] ? Math.min(1, target / L[i]) : 0;
      return [a[0] + (b[0] - a[0]) * ff, a[1] + (b[1] - a[1]) * ff];
    };
  }

  const ORB_SHAPES = [
    (f) => {
      const a = -Math.PI / 2 + f * 2 * Math.PI;
      return [Math.cos(a) * 0.24, Math.sin(a) * 0.24];
    },
    orbPolyPath([
      [0, -0.26],
      [0.24, 0.16],
      [-0.24, 0.16],
    ]),
    orbPolyPath([
      [0, -0.2],
      [0.2, -0.2],
      [0.2, 0.2],
      [-0.2, 0.2],
      [-0.2, -0.2],
    ]),
  ];
  const ORB_SHAPE_HOLD = 1.4;
  const ORB_SHAPE_MORPH = 0.9;

  function orbFrameMorph(size, t, o) {
    const SEG = ORB_SHAPE_HOLD + ORB_SHAPE_MORPH;
    const K = ORB_SHAPES.length;
    const tc = t % (SEG * K);
    const held = o.shape != null && o.shape >= 0 && o.shape < K ? Math.floor(o.shape) : -1;
    const k = held >= 0 ? held : Math.floor(tc / SEG);
    const local = held >= 0 ? t % SEG : tc - k * SEG;
    const m = held >= 0 ? 0 : local > ORB_SHAPE_HOLD ? orbSmooth((local - ORB_SHAPE_HOLD) / ORB_SHAPE_MORPH) : 0;
    const sprd = o.spread ?? 1;
    const pA = ORB_SHAPES[k];
    const pB = held >= 0 ? pA : ORB_SHAPES[(k + 1) % K];
    const M = 160;
    const pts = [];
    for (let i = 0; i < M; i++) {
      const f = i / M;
      const a = pA(f);
      const b = pB(f);
      pts.push([(a[0] + (b[0] - a[0]) * m) * sprd, (a[1] + (b[1] - a[1]) * m) * sprd]);
    }
    const L = [];
    let total = 0;
    for (let i = 0; i < M; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % M];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      L.push(l);
      total += l;
    }
    const n = Math.max(6, Math.round(34 * (o.iconD ?? 1)));
    const re = (o.rDot ?? 0.021) * 1.35 * sprd;
    const pulse = 1 + 0.02 * Math.sin(local * 3.1);
    const dots = [];
    const c2 = size / 2;
    let seg = 0;
    let acc = 0;
    for (let k2 = 0; k2 < n; k2++) {
      const target = (k2 / n) * total;
      while (acc + L[seg] < target && seg < M - 1) {
        acc += L[seg];
        seg++;
      }
      const a = pts[seg];
      const b = pts[(seg + 1) % M];
      const f = L[seg] ? Math.min(1, (target - acc) / L[seg]) : 0;
      const x = (a[0] + (b[0] - a[0]) * f) * pulse;
      const y = (a[1] + (b[1] - a[1]) * f) * pulse;
      dots.push({
        x: c2 + x * size,
        y: c2 + y * size,
        z: 0,
        r: Math.max(0.35, re * size),
        white: 0.1,
      });
    }
    return orbFinalize(dots, [], o.rMin);
  }

  // working: particles on tilted orbits
  function orbFrameOrbits(size, t, o) {
    const cx = size / 2;
    const cy = size / 2;
    const R = (size / 2) * 0.82;
    const pt = orbProjector(t * 0.12, 0.3, cx, cy, 1);
    const rs = orbRadiusScale(size, o.rsPow ?? 0.6);
    const dots = [];
    const orbitN = o.orbitN ?? 12;
    const ghostN = o.ghostN ?? 40;
    const particles = o.particles ?? 3;
    for (let orb = 0; orb < orbitN; orb++) {
      const h1 = orbHash(orb, 1.7);
      const h2 = orbHash(orb, 5.2);
      const h3 = orbHash(orb, 8.9);
      const ro = R * (0.45 + 0.52 * h1);
      const th = h1 * 2 * Math.PI;
      const phi = Math.acos(2 * h2 - 1);
      const nx = Math.sin(phi) * Math.cos(th);
      const ny = Math.cos(phi);
      const nz = Math.sin(phi) * Math.sin(th);
      let ux = -ny;
      let uy = nx;
      const uz = 0;
      const ul = Math.max(1e-6, Math.sqrt(ux * ux + uy * uy));
      ux /= ul;
      uy /= ul;
      const vx = ny * uz - nz * uy;
      const vy = nz * ux - nx * uz;
      const vz = nx * uy - ny * ux;
      const speed = (0.25 + 0.55 * h3) * (h3 > 0.5 ? 1 : -1);
      for (let k = 0; k < ghostN; k++) {
        const a = (k / ghostN) * 2 * Math.PI;
        const [px, py, z] = pt(
          (ux * Math.cos(a) + vx * Math.sin(a)) * ro,
          (uy * Math.cos(a) + vy * Math.sin(a)) * ro,
          (uz * Math.cos(a) + vz * Math.sin(a)) * ro,
        );
        const depth = (z / ro + 1) / 2;
        dots.push({
          x: px,
          y: py,
          z,
          r: (o.ghostR ?? 0.9) * rs,
          white: 0.72,
          a: (o.ghostA ?? 0.5) * (0.4 + 0.6 * depth),
        });
      }
      for (let m = 0; m < particles; m++) {
        const a = t * speed + (m / particles) * 2 * Math.PI + h2 * 6;
        const [px, py, z] = pt(
          (ux * Math.cos(a) + vx * Math.sin(a)) * ro,
          (uy * Math.cos(a) + vy * Math.sin(a)) * ro,
          (uz * Math.cos(a) + vz * Math.sin(a)) * ro,
        );
        const depth = (z / ro + 1) / 2;
        dots.push({
          x: px,
          y: py,
          z,
          r: ((o.partR ?? 1.2) + (o.partRDepth ?? 1.6) * depth) * rs,
          white: 0.3 - 0.22 * depth,
        });
      }
    }
    return orbFinalize(dots, [], o.rMin);
  }

  // composing: an undulating multi-band sash; breathing (faceOn): the same
  // sash turned face-on, undulating in its radius, with no ghost sphere
  function orbFrameRibbon(size, t, o) {
    const cx = size / 2;
    const cy = size / 2;
    const R = (size / 2) * 0.78;
    const spin = o.spin ?? 1;
    const camTilt = 0.3;
    const pt = orbProjector(t * 0.1 * spin, camTilt, cx, cy, 1);
    const rs = orbRadiusScale(size, o.rsPow ?? 0.6);
    const dots = [];
    const ghostN = o.ghostN ?? 150;
    for (let i = 0; i < ghostN; i++) {
      const d = orbFibDir(i, ghostN);
      const [px, py, z] = pt(d[0] * R, d[1] * R, d[2] * R);
      const depth = (z / R + 1) / 2;
      dots.push({ x: px, y: py, z, r: 0.8 * rs, white: 0.78, a: 0.1 + 0.22 * depth });
    }
    const ya = t * 0.24 * spin;
    const ta = o.faceOn ? -camTilt : 0.55 + 0.3 * Math.sin(t * 0.18) * spin;
    const ux = Math.cos(ya);
    const uy = 0;
    const uz = Math.sin(ya);
    const vx = -uz * Math.sin(ta);
    const vy = Math.cos(ta);
    const vz = ux * Math.sin(ta);
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const wobAmp = 0.23 * (o.wobMul ?? 1);
    const baseR = o.faceOn ? R / (1 + 0.85 * wobAmp) : R;
    const baseLanes = o.lanes ?? 5;
    const segs = o.segs ?? 88;
    const lanes = Math.max(1, Math.round(baseLanes * (o.bandMul ?? 1)));
    for (let w = 0; w < lanes; w++) {
      const laneOff = (w - (lanes - 1) / 2) * 0.075;
      const edge = Math.abs(w - (lanes - 1) / 2) / Math.max(1, (lanes - 1) / 2);
      for (let k = 0; k < segs; k++) {
        const a = (k / segs) * 2 * Math.PI;
        const wob = (0.16 * Math.sin(a * 3 - t * 1.7 + w * 0.22) + 0.07 * Math.sin(a * 5 + t * 1.1)) * (o.wobMul ?? 1);
        const radial = o.faceOn ? 1 + wob : 1;
        const off = o.faceOn ? laneOff : laneOff + wob;
        const x = ux * Math.cos(a) + vx * Math.sin(a) + nx * off;
        const y = uy * Math.cos(a) + vy * Math.sin(a) + ny * off;
        const z = uz * Math.cos(a) + vz * Math.sin(a) + nz * off;
        const l = Math.sqrt(x * x + y * y + z * z);
        const rr = baseR * radial;
        const [px, py, zr] = pt((x / l) * rr, (y / l) * rr, (z / l) * rr);
        const depth = (zr / R + 1) / 2;
        dots.push({
          x: px,
          y: py,
          z: zr,
          r: ((o.rBase ?? 1.1) + (o.rDepth ?? 1.7) * depth) * (1 - 0.25 * edge) * rs,
          white: 0.52 - 0.44 * depth + 0.18 * edge,
          a: 0.4 + 0.6 * depth,
        });
      }
    }
    return orbFinalize(dots, [], o.rMin);
  }

  // connecting: a constellation wires itself, packets running the edges
  function orbFrameWeb(size, t, o) {
    const cx = size / 2;
    const cy = size / 2;
    const R = (size / 2) * 0.8 * (o.spread ?? 1);
    const pt = orbProjector(t * 0.12, 0.32, cx, cy, R);
    const rs = orbRadiusScale(size, o.rsPow ?? 0.6);
    const nodeN = o.nodeN ?? 30;
    const thr = o.thr ?? 0.72;
    const nodeR = o.nodeR ?? 1.4;
    const nodeRDepth = o.nodeRDepth ?? 1.8;
    const nodes = [];
    for (let i = 0; i < nodeN; i++) {
      const d = orbFibDir(i, nodeN);
      const x = d[0] + 0.3 * (orbNoise(i * 0.31 + 9, t * 0.24) - 0.5) * 2;
      const y = d[1] + 0.3 * (orbNoise(i * 0.53 + 27, t * 0.21) - 0.5) * 2;
      const z = d[2] + 0.3 * (orbNoise(i * 0.77 + 55, t * 0.27) - 0.5) * 2;
      const l = Math.sqrt(x * x + y * y + z * z);
      nodes.push([x / l, y / l, z / l]);
    }
    const lines = [];
    const dots = [];
    for (let i = 0; i < nodeN; i++) {
      for (let j = i + 1; j < nodeN; j++) {
        const dx = nodes[i][0] - nodes[j][0];
        const dy = nodes[i][1] - nodes[j][1];
        const dz = nodes[i][2] - nodes[j][2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist >= thr) {
          continue;
        }
        const [x1, y1, z1] = pt(nodes[i][0], nodes[i][1], nodes[i][2]);
        const [x2, y2, z2] = pt(nodes[j][0], nodes[j][1], nodes[j][2]);
        const depth = ((z1 + z2) / 2 + 1) / 2;
        lines.push({
          x1,
          y1,
          x2,
          y2,
          white: 0.42,
          a: (1 - dist / thr) * (0.3 + 0.55 * depth),
          w: Math.max(0.6, (o.lineW ?? 0.8) * rs),
        });
      }
    }
    for (let i = 0; i < nodeN; i++) {
      const [px, py, z] = pt(nodes[i][0], nodes[i][1], nodes[i][2]);
      const depth = (z + 1) / 2;
      const pulse = 1 + 0.25 * Math.sin(t * 1.4 + i * 2.7);
      dots.push({
        x: px,
        y: py,
        z,
        r: (nodeR + nodeRDepth * depth) * pulse * rs,
        white: 0.55 - 0.45 * depth,
      });
    }
    const signals = o.signals ?? 5;
    for (let s = 0; s < signals; s++) {
      const seg = Math.floor(t * 0.55 + s * 7.31);
      const a = Math.floor(orbHash(seg, s * 3.1 + 1.7) * nodeN);
      const b = Math.floor(orbHash(seg, s * 5.7 + 4.2) * nodeN);
      if (a === b) {
        continue;
      }
      const f = orbFrac(t * 0.55 + s * 7.31);
      const x = orbLerp(nodes[a][0], nodes[b][0], f);
      const y = orbLerp(nodes[a][1], nodes[b][1], f);
      const z = orbLerp(nodes[a][2], nodes[b][2], f);
      const l = Math.max(1e-6, Math.sqrt(x * x + y * y + z * z));
      const [px, py, zr] = pt(x / l, y / l, z / l);
      const depth = (zr + 1) / 2;
      dots.push({
        x: px,
        y: py,
        z: zr,
        r: (nodeR * 1.5 + nodeRDepth * depth) * rs,
        white: 0.05,
        a: 0.5 + 0.5 * depth,
      });
    }
    return orbFinalize(dots, lines, o.rMin);
  }

  const ORB_FRAMES = {
    orbits: orbFrameOrbits,
    globe: orbFrameGlobe,
    rubik: orbFrameRubik,
    wave: orbFrameWave,
    web: orbFrameWeb,
    braid: orbFrameBraid,
    ribbon: orbFrameRibbon,
    // (ring is ribbon's geometry; its faceOn profile flag switches it)
    ring: orbFrameRibbon,
    morph: orbFrameMorph,
  };

  // ----- presets: state to mode, base profiles, and the tuned sizes
  const ORB_STATE_MODE = {
    working: "orbits",
    searching: "globe",
    solving: "rubik",
    listening: "wave",
    connecting: "web",
    weaving: "braid",
    composing: "ribbon",
    breathing: "ring",
    shaping: "morph",
  };
  const ORB_STATES = Object.keys(ORB_STATE_MODE);

  const ORB_LABELS = {
    working: "Working…",
    searching: "Searching…",
    solving: "Solving…",
    listening: "Listening…",
    connecting: "Connecting…",
    weaving: "Weaving…",
    composing: "Composing…",
    breathing: "Thinking…",
    shaping: "Shaping…",
  };

  const ORB_BASE_PROFILES = {
    globe: { latRings: 17, lonDensity: 44, rBase: 0.6, rDepth: 1.7, rBoost: 1, inkFar: 0.62, inkSpan: 0.54, rsPow: 0.6, rMin: 0.3 },
    orbits: { orbitN: 12, ghostN: 40, ghostR: 0.9, ghostA: 0.5, particles: 3, partR: 1.2, partRDepth: 1.6, rsPow: 0.6, rMin: 0.3 },
    rubik: { latRings: 15, lonDensity: 40, moveCount: 14, rBase: 0.6, rDepth: 1.7, rActive: 0.3, inkFar: 0.62, inkSpan: 0.54, rsPow: 0.6, rMin: 0.3 },
    wave: { rings: 15, lonDensity: 40, rBase: 0.6, rDepth: 1.7, rsPow: 0.6, rMin: 0.3 },
    web: { nodeN: 30, thr: 0.72, signals: 5, nodeR: 1.4, nodeRDepth: 1.8, lineW: 0.8, rsPow: 0.6, rMin: 0.3 },
    braid: { strandN: 52, turns: 3, ghostN: 150, rBase: 1.2, rDepth: 1.8, rsPow: 0.6, rMin: 0.3 },
    ribbon: { lanes: 5, segs: 88, ghostN: 150, rBase: 1.1, rDepth: 1.7, rsPow: 0.6, rMin: 0.3 },
    ring: { lanes: 5, segs: 88, ghostN: 0, faceOn: 1, rBase: 1.1, rDepth: 1.7, rsPow: 0.6, rMin: 0.3 },
    morph: { rDot: 0.021, iconD: 1, rMin: 0.25 },
  };

  // per mode and size: speed, a dot-count multiplier, a dot-size multiplier
  // and extra opts. 64 and 20 are hand-tuned; 32 is interpolated from them
  // in log space (orbPreset does the same for other sizes between).
  const ORB_PRESETS = {
    orbits: {
      64: { speed: 1.885, count: 1, size: 1 },
      32: { speed: 2.9072, count: 0.4251, size: 1.6849 },
      20: { speed: 3.9, count: 0.238, size: 2.4 },
    },
    globe: {
      64: { speed: 2.015, count: 0.42, size: 1.15, extra: { scanMul: 4.08, dimBase: 0.45 } },
      32: { speed: 2.3803, count: 0.1839, size: 1.4769, extra: { scanMul: 4.2301, dimBase: 0.45 } },
      20: { speed: 2.665, count: 0.105, size: 1.75, extra: { scanMul: 4.335, dimBase: 0.45 } },
    },
    rubik: {
      64: { speed: 1.82, count: 0.35, size: 1.05 },
      32: { speed: 1.8964, count: 0.1537, size: 1.4951 },
      20: { speed: 1.95, count: 0.088, size: 1.9 },
    },
    wave: {
      64: { speed: 4.388, count: 0.341, size: 1 },
      32: { speed: 4.1512, count: 0.169, size: 1.3232 },
      20: { speed: 3.998, count: 0.105, size: 1.6 },
    },
    web: {
      64: { speed: 3.315, count: 1.35, size: 0.95 },
      32: { speed: 5.0104, count: 0.4942, size: 1.2571 },
      20: { speed: 6.63, count: 0.25, size: 1.52 },
    },
    braid: {
      64: { speed: 1.625, count: 0.5, size: 1 },
      32: { speed: 2.2234, count: 0.2056, size: 1.2011 },
      20: { speed: 2.75, count: 0.1125, size: 1.36 },
    },
    ribbon: {
      64: { speed: 2.34, count: 0.25, size: 0.85, extra: { spin: 0, bandMul: 3.9, wobMul: 1 } },
      32: { speed: 2.7776, count: 0.0969, size: 0.9766, extra: { spin: 0, bandMul: 4.49, wobMul: 1 } },
      20: { speed: 3.12, count: 0.051, size: 1.073, extra: { spin: 0, bandMul: 4.94, wobMul: 1 } },
    },
    ring: {
      64: { speed: 3.24, count: 0.25, size: 0.956, extra: { spin: 0, bandMul: 3.627, wobMul: 0.368 } },
      32: { speed: 3.5517, count: 0.0678, size: 1.31, extra: { spin: 0, bandMul: 3.8265, wobMul: 0.4751 } },
      20: { speed: 3.78, count: 0.028, size: 1.622, extra: { spin: 0, bandMul: 3.968, wobMul: 0.565 } },
    },
    morph: {
      64: { speed: 2.405, count: 0.702, size: 0.395, extra: { spread: 1.45 } },
      32: { speed: 2.2057, count: 0.5937, size: 0.6916, extra: { spread: 1.45 } },
      20: { speed: 2.08, count: 0.53, size: 1.011, extra: { spread: 1.45 } },
    },
  };

  const ORB_COUNT_PAIRS = [
    ["latRings", "lonDensity"],
    ["rings", "lonDensity"],
    ["lanes", "segs"],
  ];
  const ORB_COUNT_KEYS = ["orbitN", "ghostN", "nodeN", "strandN", "signals"];
  const ORB_RADIUS_KEYS = ["rBase", "rDepth", "rActive", "rDot", "ghostR", "partR", "partRDepth", "nodeR", "nodeRDepth"];

  // grid pairs scale by the square root so their product tracks the scale
  function orbScaleCounts(opts, scale) {
    const out = { ...opts };
    const done = new Set();
    const rt = Math.sqrt(scale);
    for (const [a, b] of ORB_COUNT_PAIRS) {
      if (out[a] != null && out[b] != null && !done.has(a) && !done.has(b)) {
        out[a] = Math.max(2, Math.round(out[a] * rt));
        out[b] = Math.max(2, Math.round(out[b] * rt));
        done.add(a);
        done.add(b);
      }
    }
    for (const k of ORB_COUNT_KEYS) {
      const v = out[k];
      if (v != null && v !== 0 && !done.has(k)) {
        out[k] = Math.max(1, Math.round(v * scale));
      }
    }
    if (out.iconD != null) {
      out.iconD = Math.max(0.02, out.iconD * scale);
    }
    return out;
  }

  function orbScaleRadii(opts, scale) {
    const out = { ...opts };
    for (const k of ORB_RADIUS_KEYS) {
      if (out[k] != null) {
        out[k] *= scale;
      }
    }
    out.rSizeMul = (out.rSizeMul ?? 1) * scale;
    return out;
  }

  // the tuned preset for a size: 64, 32 and 20 as shipped, others between
  // 20 and 64 interpolated in log space as the package made its 32 (those
  // knobs are ratios), 20's tuning below 20 and 64's above 64
  function orbPreset(mode, size) {
    const table = ORB_PRESETS[mode];
    if (table[size]) {
      return table[size];
    }
    if (size <= 20) {
      return table[20];
    }
    if (size >= 64) {
      return table[64];
    }
    const f = Math.log(size / 64) / Math.log(20 / 64);
    const mix = (a, b) => (a > 0 && b > 0 ? Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * f) : a + (b - a) * f);
    const big = table[64];
    const small = table[20];
    const preset = { speed: mix(big.speed, small.speed), count: mix(big.count, small.count), size: mix(big.size, small.size) };
    if (big.extra) {
      preset.extra = {};
      for (const key of Object.keys(big.extra)) {
        preset.extra[key] = mix(big.extra[key], small.extra[key]);
      }
    }
    return preset;
  }

  const orbResolvedCache = new Map();

  // a (state, size) pair to its mode, speed and fully scaled draw options
  function orbResolve(state, size) {
    const key = `${state}-${size}`;
    const hit = orbResolvedCache.get(key);
    if (hit) {
      return hit;
    }
    const mode = ORB_STATE_MODE[state];
    const preset = orbPreset(mode, size);
    let opts = { ...ORB_BASE_PROFILES[mode] };
    if (preset.count !== 1) {
      opts = orbScaleCounts(opts, preset.count);
    }
    if (preset.size !== 1) {
      opts = orbScaleRadii(opts, preset.size);
    }
    if (preset.extra) {
      opts = { ...opts, ...preset.extra };
    }
    const resolved = { mode, speed: preset.speed, opts };
    orbResolvedCache.set(key, resolved);
    return resolved;
  }

  // ----- the orbs on screen, and the one loop that draws them
  const ORB_XHTML = "http://www.w3.org/1999/xhtml";
  // (the frame the package shows under prefers-reduced-motion)
  const ORB_STILL_T = 0.6;
  // The one change to the package's look: no dot is drawn smaller than one
  // device pixel across. The package floors dots at 0.3 CSS px, which on a
  // 1x screen is a 0.6px smudge, so at 16 and 20 px the globe-like states
  // (searching, listening, weaving, composing) went faint. At a device
  // pixel ratio of 5/3 or more this floor is under the package's and changes
  // nothing. Set it to 0 for the package's dots everywhere.
  const ORB_MIN_DEVICE_R = 0.5;
  const orbLive = new Set();
  const orbByCanvas = new WeakMap();
  let orbLoop = 0;
  let orbHooked = false;
  let orbReduceQuery = null;
  let orbDarkQuery = null;
  let orbSeen = null;

  function orbStill() {
    return !!orbReduceQuery?.matches;
  }

  // (as in the package: dark when there's no media query to ask)
  function orbSystemDark() {
    return orbDarkQuery ? orbDarkQuery.matches : true;
  }

  // device pixel ratio, capped at 2 as in the package
  function orbDpr() {
    return Math.min(2, window.devicePixelRatio || 1);
  }

  // listeners shared by every orb, set up with the first
  function orbHook() {
    if (orbHooked) {
      return;
    }
    orbHooked = true;
    if (typeof matchMedia === "function") {
      orbReduceQuery = matchMedia("(prefers-reduced-motion: reduce)");
      orbDarkQuery = matchMedia("(prefers-color-scheme: dark)");
      orbReduceQuery.addEventListener("change", orbRedrawAll);
      orbDarkQuery.addEventListener("change", orbRedrawAll);
      orbWatchDpr();
    }
    document.addEventListener("visibilitychange", orbWake);
    // (orbs scrolled or folded out of view rest, as in the package)
    if (typeof IntersectionObserver === "function") {
      orbSeen = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          const orb = orbByCanvas.get(entry.target);
          if (orb) {
            orb.visible = entry.isIntersecting;
          }
        }
        orbWake();
      });
    }
  }

  // redraw at the new sharpness when the window moves to another screen or
  // is zoomed (the loop would catch it, but not for a still orb)
  function orbWatchDpr() {
    const query = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    query.addEventListener(
      "change",
      () => {
        orbWatchDpr();
        orbRedrawAll();
      },
      { once: true },
    );
  }

  function orbRedrawAll() {
    const now = performance.now();
    for (const orb of orbLive) {
      if (orb.canvas.isConnected) {
        orbDraw(orb, now);
      } else {
        orbDrop(orb);
      }
    }
    orbWake();
  }

  // start the loop if something on screen needs it
  function orbWake() {
    if (orbLoop || document.hidden || orbStill()) {
      return;
    }
    for (const orb of orbLive) {
      if (orb.visible || !orb.canvas.isConnected) {
        orbLoop = requestAnimationFrame(orbTick);
        return;
      }
    }
  }

  function orbTick(now) {
    orbLoop = 0;
    if (document.hidden || orbStill()) {
      return;
    }
    // (orbs in the same state and size share one frame, and with the same
    // ink a painted copy of it)
    const frames = new Map();
    const copies = new Map();
    let drawing = false;
    for (const orb of orbLive) {
      if (!orb.canvas.isConnected) {
        orbDrop(orb);
        continue;
      }
      if (!orb.visible) {
        continue;
      }
      drawing = true;
      orbDraw(orb, now, frames, copies);
    }
    if (drawing) {
      orbLoop = requestAnimationFrame(orbTick);
    }
  }

  // one frame onto the orb's canvas: the package's shared clock (seconds
  // times the preset's speed), or its still frame under reduced motion
  function orbDraw(orb, now, frames, copies) {
    const { canvas, ctx } = orb;
    if (!ctx) {
      return;
    }
    const dpr = orbDpr();
    if (orb.dpr !== dpr) {
      orb.dpr = dpr;
      canvas.width = Math.round(orb.size * dpr);
      canvas.height = Math.round(orb.size * dpr);
    }
    const dark = orb.dark ?? orbSystemDark();
    const shape = `${orb.state}|${orb.size}|${orb.speed}`;
    const look = `${shape}|${dark}|${orb.tintKey}|${dpr}`;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const twin = copies?.get(look);
    if (twin) {
      ctx.drawImage(twin, 0, 0);
      return;
    }
    let frame = frames?.get(shape);
    if (!frame) {
      const t = orbStill() ? ORB_STILL_T : (now / 1000) * orb.speed;
      frame = ORB_FRAMES[orb.mode](orb.size, t, orb.opts);
      frames?.set(shape, frame);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    orbPaintFrame(ctx, frame, dark, orb.tint, ORB_MIN_DEVICE_R / dpr);
    copies?.set(look, canvas);
  }

  function orbDrop(orb) {
    orbLive.delete(orb);
    orbSeen?.unobserve(orb.canvas);
    orb.live = false;
    orb.dropped = true;
  }

  // (re)join the loop and draw now, as the package does on every change
  function orbShow(orb) {
    if (orb.gone) {
      return;
    }
    if (!orb.live) {
      if (orb.dropped && !orb.canvas.isConnected) {
        // (dropped, and still out of the document)
        return;
      }
      orb.live = true;
      orb.visible = true;
      orbLive.add(orb);
      orbSeen?.observe(orb.canvas);
    }
    orbDraw(orb, performance.now());
    orbWake();
  }

  function orbApplyState(orb, state) {
    const resolved = orbResolve(state, orb.size);
    orb.state = state;
    orb.mode = resolved.mode;
    orb.opts = resolved.opts;
    orb.speed = resolved.speed * orb.pace;
    if (orb.canvas.getAttribute("aria-hidden") !== "true") {
      orb.canvas.setAttribute("role", "img");
      orb.canvas.setAttribute("aria-label", orb.label || ORB_LABELS[state]);
    }
  }

  // ziaOrb(canvas, { state, size, dark, speed, color, label })
  //   -> { canvas, setState(name), setDark(bool or null), destroy() }
  function ziaOrb(canvas, options = {}) {
    canvas ||= document.createElementNS(ORB_XHTML, "canvas");
    orbHook();
    orbByCanvas.get(canvas)?.handle.destroy();
    const size = Number(options.size) > 0 ? Number(options.size) : 64;
    const orb = {
      canvas,
      ctx: canvas.getContext("2d"),
      size,
      dark: typeof options.dark === "boolean" ? options.dark : null,
      pace: Number(options.speed) > 0 ? Number(options.speed) : 1,
      tint: orbParseTint(options.color),
      tintKey: options.color ? String(options.color) : "",
      label: options.label || "",
      dpr: 0,
      visible: true,
      live: false,
      dropped: false,
      gone: false,
    };
    orbApplyState(orb, ORB_STATE_MODE[options.state] ? options.state : "working");
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    canvas.style.display = "block";
    orb.handle = {
      canvas,
      setState(name) {
        if (!ORB_STATE_MODE[name]) {
          return;
        }
        if (name !== orb.state) {
          orbApplyState(orb, name);
        }
        orbShow(orb);
      },
      // (true: light dots for a dark background, false: dark dots for a
      // light one, null: follow prefers-color-scheme)
      setDark(value) {
        orb.dark = typeof value === "boolean" ? value : null;
        orbShow(orb);
      },
      destroy() {
        orb.gone = true;
        orbDrop(orb);
        if (orbByCanvas.get(canvas) === orb) {
          orbByCanvas.delete(canvas);
        }
      },
    };
    orbByCanvas.set(canvas, orb);
    orbShow(orb);
    return orb.handle;
  }
  // ---------- Ultra (zia.ultra, on by default)
  // Effects ported from Libraries.dev (https://libraries.dev, MIT, by Jakub
  // Antalik), each where its author places it: a thinking orb for loading, a
  // glow under what's playing, the Library's chosen section springing to the
  // next, liquid metal along the loading line, and the Library's pictures
  // dissolving in from a pixel mosaic (the colour round the open essential
  // drifting is 28-ultra.css).
  const ULTRA_PREF = "zia.ultra";
  const ultraOn = () => Services.prefs.getBoolPref(ULTRA_PREF, true);

  // A loading tab's spinner as a thinking orb (28r-ultra-orb-engine.js):
  // "connecting" until the page starts arriving, then "searching", the dotted
  // globe. Only once it's been loading a moment, as the orbs' author advises:
  // a quick load keeps its icon rather than flashing an orb.
  function watchUltraOrbs() {
    const orbs = new Map();
    const dark = () => !root.hasAttribute("zia-light");
    const stateFor = (tab) => (tab.hasAttribute("progress") ? "searching" : "connecting");

    const drop = (tab) => {
      const entry = orbs.get(tab);
      if (!entry) {
        return;
      }
      clearTimeout(entry.timer);
      entry.orb?.destroy();
      entry.orb?.canvas.remove();
      tab.removeAttribute("zia-orb");
      orbs.delete(tab);
    };

    const show = (tab, entry) => {
      const stack = tab.querySelector(".tab-icon-stack");
      if (!ultraOn() || !tab.isConnected || !tab.hasAttribute("busy") || !stack) {
        drop(tab);
        return;
      }
      const canvas = document.createElementNS(XHTML_NS, "canvas");
      canvas.className = "zia-orb";
      // (the tab's own name says what's loading)
      canvas.setAttribute("aria-hidden", "true");
      stack.append(canvas);
      entry.orb = ziaOrb(canvas, { state: stateFor(tab), size: 16, dark: dark() });
      tab.setAttribute("zia-orb", "true");
    };

    const sync = (tab) => {
      if (!ultraOn() || !tab.isConnected || !tab.hasAttribute("busy")) {
        drop(tab);
        return;
      }
      const entry = orbs.get(tab);
      if (entry) {
        entry.orb?.setState(stateFor(tab));
        return;
      }
      const waiting = { orb: null, timer: 0 };
      waiting.timer = setTimeout(() => show(tab, waiting), 300);
      orbs.set(tab, waiting);
    };

    const syncAll = () => {
      for (const tab of new Set([...gBrowser.tabs, ...orbs.keys()])) {
        sync(tab);
      }
    };

    gBrowser.tabContainer.addEventListener("TabAttrModified", (event) => {
      const changed = event.detail?.changed || [];
      if (changed.includes("busy") || changed.includes("progress")) {
        sync(event.target);
      }
    });
    gBrowser.tabContainer.addEventListener("TabClose", (event) => drop(event.target));
    watchPrefs(ULTRA_PREF, syncAll);
    new MutationObserver(() => {
      for (const entry of orbs.values()) {
        entry.orb?.setDark(dark());
      }
    }).observe(root, { attributes: true, attributeFilter: ["zia-light"] });
    syncAll();
  }

  // A few of a picture's colours for the music player's glow, most present
  // first and as bright as a glow wants them; null for a grey picture (the glow
  // keeps its own colours)
  const ultraArtPalettes = new Map();

  async function readArtPalette(url) {
    const data = await readPixels(url, 32);
    if (!data) {
      return null;
    }
    const bins = Array.from({ length: 12 }, (_, hue) => ({ hue, n: 0, r: 0, g: 0, b: 0 }));
    let seen = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      if (a < 128) {
        continue;
      }
      seen++;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max ? (max - min) / max : 0;
      if (sat < 0.25 || max < 50) {
        continue;
      }
      const bin = bins[Math.floor(rgbToHsl(r, g, b)[0] * 12) % 12];
      bin.n += sat;
      bin.r += r * sat;
      bin.g += g * sat;
      bin.b += b * sat;
    }
    // the strongest hues, none next to one already taken (one colour, not two shades of it)
    const picked = [];
    for (const bin of bins.filter((b) => b.n > seen * 0.012).sort((x, y) => y.n - x.n)) {
      if (picked.length < 4 && picked.every((p) => Math.min((p.hue - bin.hue + 12) % 12, (bin.hue - p.hue + 12) % 12) > 1)) {
        picked.push(bin);
      }
    }
    if (!picked.length) {
      return null;
    }
    const glowy = ([h, s, l]) => [h, Math.max(0.7, s), Math.min(0.62, Math.max(0.52, l))];
    const colors = picked.map((bin) => glowy(rgbToHsl(bin.r / bin.n, bin.g / bin.n, bin.b / bin.n)));
    // one colour alone: it and a shade either side of it, so the glow still shifts
    if (colors.length === 1) {
      const [h, s, l] = colors[0];
      colors.push([(h + 0.07) % 1, s, l], [(h + 0.93) % 1, s, l]);
    }
    return colors.map(([h, s, l]) => `rgb(${hslToRgb(h, s, l).join(", ")})`);
  }

  function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) {
      return [0, 0, l];
    }
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h / 6, s, l];
  }

  function hslToRgb(h, s, l) {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const channel = (t) => {
      t = (t + 1) % 1;
      const v = t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
      return Math.round(v * 255);
    };
    return [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)];
  }

  // The music player card glows along its bottom edge as voice-glow's beam does
  // under a voice (28t-ultra-glow-engine.js), in the colours of what's playing:
  // while you point at it and it plays. The browser can't hear the tab, so it
  // follows a gentle, music-like level, and sinks and fades out when paused or
  // left. Under the card's text and buttons.
  function watchUltraGlow() {
    const glows = new Map();
    const dark = () => !root.hasAttribute("zia-light");
    const cards = () => document.querySelectorAll("#zen-media-controls-toolbar .zen-media-card");

    const tint = async (card, glow) => {
      const url = artUrlOf(card);
      if (card.__ziaGlowArt === url) {
        return;
      }
      card.__ziaGlowArt = url;
      if (!ultraArtPalettes.has(url)) {
        ultraArtPalettes.set(url, url ? await readArtPalette(url) : null);
      }
      if (card.__ziaGlowArt === url && glows.get(card) === glow) {
        glow.setColors(ultraArtPalettes.get(url));
      }
    };

    const sync = () => {
      const on = ultraOn();
      const seen = new Set();
      for (const card of on ? cards() : []) {
        seen.add(card);
        let glow = glows.get(card);
        if (!glow) {
          // (the card's squircle, as Zia sets it: it's what the glow is cut to)
          const cornerShape = getComputedStyle(card).getPropertyValue("--zia-squircle").trim();
          glow = ziaGlow(card, { dark: dark(), cornerShape });
          glows.set(card, glow);
          card.__ziaGlowArt = undefined;
        }
        tint(card, glow).catch((err) => noteError("ultra: glow colours", err));
        glow.setPlaying(card.classList.contains("playing") && card.matches(":hover"));
      }
      for (const [card, glow] of glows) {
        if (!seen.has(card)) {
          glow.destroy();
          glows.delete(card);
        }
      }
    };

    const toolbar = document.getElementById("zen-media-controls-toolbar");
    if (toolbar) {
      new MutationObserver(sync).observe(toolbar, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "zia-art", "zia-favicon"],
      });
      // (a frame on, once the pointer's left the card for whatever it's now over)
      let pending = 0;
      const later = () => {
        pending ||= requestAnimationFrame(() => {
          pending = 0;
          sync();
        });
      };
      toolbar.addEventListener("mouseover", later);
      toolbar.addEventListener("mouseout", later);
    }
    new MutationObserver(() => {
      for (const glow of glows.values()) {
        glow.setDark(dark());
      }
    }).observe(root, { attributes: true, attributeFilter: ["zia-light"] });
    watchPrefs(ULTRA_PREF, sync);
    sync();
  }

  // The Library's chosen-section tile (28k-library.js), as it slides to the
  // section you pick, stretches a touch as it goes and squashes a touch as it
  // lands, as liquid-gooey's "move" does, glass edge and all (on a gentler
  // spring than its own, 28-ultra.css, so the two don't add up to a wobble).
  // Nothing under reduced motion.
  function ultraRailSquash(rail) {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || typeof rail.animate !== "function") {
      return;
    }
    rail.ziaSquash?.cancel();
    rail.ziaSquash = rail.animate(
      [
        { scale: "1 1" },
        { scale: "0.97 1.05", offset: 0.35 },
        { scale: "1.02 0.98", offset: 0.7 },
        { scale: "1 1" },
      ],
      { duration: 400, easing: "ease-out" }
    );
  }

  // The pictures in the Library's Media (Zen loads each as its tile comes into
  // view): img-fx's pixel mosaic churns where the picture will be, takes the
  // picture's own shape once it's loaded, and dissolves into it
  // (28y-ultra-image-engine.js), and again for the ones in view each time
  // Media is opened (Zen keeps the pictures it's loaded). Videos and file
  // icons as they were. 28k-library.js hands each Library over as it's made.
  function ultraWatchMedia(library) {
    const THUMB = "img.zen-library-media-thumb:not(.zen-library-media-file)";
    const live = new Map();

    const finish = (img) => {
      const entry = live.get(img);
      if (!entry) {
        return;
      }
      live.delete(img);
      entry.fx.destroy();
      entry.box.remove();
      img.removeAttribute("zia-media-loading");
    };

    const start = (img) => {
      const frame = img.parentNode;
      if (live.has(img) || !frame || !ultraOn() || libraryZenLook()) {
        return;
      }
      const box = document.createElementNS(XHTML_NS, "div");
      box.className = "zia-media-load";
      frame.append(box);
      let fx = null;
      try {
        fx = ziaImgFx(box, {
          preset: "pixels-organic",
          dark: !root.hasAttribute("zia-light"),
          // (a picture read from disk comes at once: long enough to read as the loader)
          minChurnMs: 450,
          revealSeconds: 1.6,
        });
      } catch (err) {
        noteError("ultra: media loader", err);
      }
      if (!fx) {
        box.remove();
        return;
      }
      img.setAttribute("zia-media-loading", "true");
      live.set(img, { fx, box });
      const reveal = () => {
        if (live.get(img)?.fx !== fx) {
          return;
        }
        if (!img.naturalWidth) {
          finish(img);
          return;
        }
        // the picture's own box (shown whole, no larger than it is), then into it
        const fw = frame.clientWidth;
        const fh = frame.clientHeight;
        const k = Math.min(1, fw / img.naturalWidth, fh / img.naturalHeight);
        const w = img.naturalWidth * k;
        const h = img.naturalHeight * k;
        Object.assign(box.style, { left: `${(fw - w) / 2}px`, top: `${(fh - h) / 2}px`, width: `${w}px`, height: `${h}px` });
        // (once the mosaic has taken the new size)
        requestAnimationFrame(() => requestAnimationFrame(() => live.get(img)?.fx === fx && fx.reveal(img, { onDone: () => finish(img) })));
      };
      if (img.complete) {
        reveal();
      } else {
        img.addEventListener("load", reveal, { once: true });
        img.addEventListener("error", () => finish(img), { once: true });
      }
    };

    // the pictures already loaded and in view, once Media shows again
    const replay = () => {
      if (!ultraOn() || libraryZenLook()) {
        return;
      }
      const view = library.getBoundingClientRect();
      for (const img of library.querySelectorAll(THUMB)) {
        const box = img.getBoundingClientRect();
        if (img.complete && img.naturalWidth && box.width && box.bottom > view.top && box.top < view.bottom) {
          start(img);
        }
      }
    };
    const mediaOpen = () => !!library.querySelector('.zen-library-tab[data-section="media"][active]');

    new MutationObserver((records) => {
      let shown = false;
      for (const record of records) {
        if (record.type === "attributes") {
          const tab = record.target.matches?.('.zen-library-tab[data-section="media"]') && record.target.hasAttribute("active");
          const opened = record.target === library && library.hasAttribute("open") && mediaOpen();
          shown ||= tab || opened;
          continue;
        }
        for (const node of record.addedNodes) {
          if (node.nodeType === 1 && node.matches(THUMB)) {
            start(node);
          }
        }
      }
      for (const img of live.keys()) {
        if (!img.isConnected) {
          finish(img);
        }
      }
      if (shown) {
        // (once it's laid out)
        requestAnimationFrame(replay);
      }
    }).observe(library, { childList: true, subtree: true, attributes: true, attributeFilter: ["active", "open"] });
  }

  function watchUltra() {
    safely("watchUltraOrbs", watchUltraOrbs);
    safely("watchUltraGlow", watchUltraGlow);
    safely("watchUltraMetalLine", watchUltraMetalLine);
  }
// Zia glow: a colourful glow along the bottom edge of a card that rises and
// blooms while media plays. A framework-free port of the "glow" look of
// voice-glow 0.3.0 (component VoiceBeam, https://libraries.dev).
// voice-glow is MIT licensed:
//
//   MIT License
//
//   Copyright (c) 2026 Jakub Antalik
//
//   Permission is hereby granted, free of charge, to any person obtaining a copy
//   of this software and associated documentation files (the "Software"), to deal
//   in the Software without restriction, including without limitation the rights
//   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
//   copies of the Software, and to permit persons to whom the Software is
//   furnished to do so, subject to the following conditions:
//
//   The above copyright notice and this permission notice shall be included in all
//   copies or substantial portions of the Software.
//
//   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
//   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
//   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
//   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
//   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
//   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
//   SOFTWARE.
//
//   const glow = ziaGlow(card, { dark: true });
//   glow.setPlaying(true);   // fades in, follows a synthetic music level
//   glow.setPlaying(false);  // the level settles and the glow fades out
//   glow.setDark(false);     // switch palette and tuning
//   glow.setColors(list);    // the lobes' colours ("rgb(r, g, b)"), or null for the theme's
//   glow.setMotion(m);       // optional: the package's `motion` (see NOTES.md)
//   glow.destroy();
//
// Plain functions in a shared scope: no imports or exports. Needs glow.css.
// Elements are created in the XHTML namespace so it works in a XUL chrome document.

const ZIA_GLOW_XHTML = "http://www.w3.org/1999/xhtml";
const ZIA_GLOW_SVG = "http://www.w3.org/2000/svg";
const ZIA_GLOW_TAU = Math.PI * 2;

// Seven soft ellipses fanned out from the bottom centre, in px for a ~350px host:
// the centre lobe follows the lows, its neighbours the mids, the outer pair the
// highs and the far pair the mids again.
const ZIA_GLOW_LOBES = [
  { x: 0, w: 74, h: 46, band: 0 },
  { x: -36, w: 54, h: 40, band: 1 },
  { x: 36, w: 54, h: 40, band: 1 },
  { x: -72, w: 48, h: 32, band: 2 },
  { x: 72, w: 48, h: 32, band: 2 },
  { x: -108, w: 42, h: 26, band: 1 },
  { x: 108, w: 42, h: 26, band: 1 },
];
const ZIA_GLOW_SPAN = 36 * ZIA_GLOW_LOBES.length; // the flow ring, 252px

// Theme tuning of the "colorful" variant on the "default" (chat input) type, resolved
// the way VoiceBeam resolves it: theme preset, then type style, then light overrides.
const ZIA_GLOW_THEMES = {
  dark: {
    colors: [
      "rgb(255, 70, 120)",
      "rgb(60, 190, 255)",
      "rgb(175, 70, 255)",
      "rgb(60, 220, 130)",
      "rgb(255, 150, 40)",
      "rgb(90, 100, 255)",
      "rgb(40, 200, 190)",
    ],
    band: { core: "255, 255, 255", above: "255, 70, 80", mid: "90, 255, 150", below: "80, 140, 255" },
    strokeOpacity: 1.16,
    innerOpacity: 0.47,
    bloomOpacity: 0.89,
    bloomAlpha: 0.9,
    innerShadow: "rgba(255, 255, 255, 0.1)",
    brightness: 1.15,
    saturation: 1.2,
    strength: 1,
    hueBase: 0,
    hueRange: 24,
    hueDuration: 12,
    reach: 1.2,
    spread: 1.05,
    bandStrength: 1.55,
    coreLight: 0,
  },
  light: {
    colors: [
      "rgb(255, 201, 21)",
      "rgb(126, 196, 255)",
      "rgb(180, 40, 230)",
      "rgb(235, 100, 160)",
      "rgb(255, 176, 122)",
      "rgb(154, 160, 255)",
      "rgb(127, 217, 238)",
    ],
    band: { core: "197, 139, 255", above: "255, 122, 182", mid: "126, 196, 255", below: "45, 255, 171" },
    strokeOpacity: 1.2,
    innerOpacity: 0.85,
    bloomOpacity: 0.5,
    bloomAlpha: 0.7,
    innerShadow: "rgba(0, 0, 0, 0.08)",
    brightness: 0.95,
    saturation: 1.6,
    strength: 0.8,
    hueBase: 5,
    hueRange: 40,
    hueDuration: 8.5,
    reach: 1.8,
    spread: 0.8,
    bandStrength: 1.7,
    coreLight: 1.8,
  },
};

// The package's defaults (voiceDefaults + the component's response defaults).
const ZIA_GLOW_TUNING = {
  threshold: 0.015,
  attack: 0.325,
  release: 0.86,
  idle: 0.18,
  breatheDuration: 5.2,
  bands: true,
  flow: 48,
  bend: 60,
  glowSize: 1,
  bandWidth: 2.15,
  bandPosition: 0.35,
  bandCurve: 1.75,
  bandSpread: 0.87,
  bandSkew: 0.12,
  bandOffset: -27,
  bandTail: 0.59,
  bandTailPosition: 0.67,
  bandTailCurve: 2.4,
  bandTailOverflow: 15,
  bandAberration: 0.89,
  distortion: 0.62,
  distortionDetail: 2.3,
  glowWidth: 0.65,
  glowHeight: 1.25,
  lobeSpacing: 0.85,
  rangeWidth: 0.75,
  rangeHeight: 1,
  softness: 1.07,
  coreSize: 1,
  coreLightWidth: 1,
  coreLightHeight: 1,
  strokeScale: 1,
  innerScale: 1,
  innerHeight: 1,
  bloomScale: 1,
  bloomHeight: 1,
};

// libraries.dev shrinks the glow on narrow hosts with scale = min(1, width / 371).
const ZIA_GLOW_HOST_WIDTH = 371;
const ZIA_GLOW_MIN_SCALE = 0.4;
// The level held under prefers-reduced-motion (a still glow, about mid-height).
const ZIA_GLOW_STEADY = 0.18;
// Fade timings of the package (0.6s in, 0.5s out, CSS "ease"), mirrored in glow.css.
const ZIA_GLOW_FADE_OUT_MS = 520;
const ZIA_GLOW_BAND_POINTS = 56;
const ZIA_GLOW_STILL = { gather: 0, offset: 0, stretch: 0, heldLevel: 0, cornerFollow: 0 };

const ziaGlowLive = new Set(); // instances the loop draws
const ziaGlowAll = new Set(); // every instance not destroyed, for media-query changes
let ziaGlowRaf = null;
let ziaGlowLastFrame = 0;
let ziaGlowPrevTs = 0;
let ziaGlowHalfRate = false;
let ziaGlowSkip = false;
let ziaGlowSlowSince = 0;
let ziaGlowProbeAt = 0;
let ziaGlowMotionQuery = null;
let ziaGlowListening = false;
let ziaGlowCount = 0;

function ziaGlowClamp(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// Noise gate and soft saturation: below the threshold is silence.
function ziaGlowShape(v, threshold) {
  if (v <= threshold) {
    return 0;
  }
  const a = (v - threshold) / Math.max(1e-3, 1 - threshold);
  return ziaGlowClamp((1 - Math.exp(-3 * a)) / (1 - Math.exp(-3)));
}

// Attack / release envelope (seconds are time constants).
function ziaGlowFollow(current, target, dt, attack, release) {
  const tau = target > current ? attack : release;
  return current + (target - current) * (1 - Math.exp(-dt / Math.max(1e-3, tau)));
}

// Wrap into [-span/2, span/2): the lobes cycle through the centre.
function ziaGlowWrap(x, span) {
  const half = span / 2;
  return (((x + half) % span) + span) % span - half;
}

// Lobes shrink to nothing as they reach the ends of the flow ring.
function ziaGlowRingFade(x, span) {
  const k = x / (span / 2 + 4);
  return Math.max(0, 1 - k * k);
}

// The band's organic bell, exp(-(|x| / spread)^curve), skewed and settled to 0 at |x| = 1.
function ziaGlowBell(x, curve, spread, skew) {
  const s = Math.max(0.05, spread * (x < 0 ? 1 - skew : 1 + skew));
  const v = Math.exp(-Math.pow(Math.abs(x) / s, curve));
  const end = Math.exp(-Math.pow(1 / s, curve));
  return Math.max(0, (v - end) / (1 - end));
}

// The band's ends rising again into the corners.
function ziaGlowTail(dist, reach, amount, position, curve) {
  if (amount <= 0 || reach <= 0) {
    return 0;
  }
  const start = reach * Math.max(0, Math.min(0.98, position));
  if (dist <= start) {
    return 0;
  }
  const k = Math.min(1, (dist - start) / Math.max(1, reach - start));
  return amount * Math.pow(k, Math.max(0.5, curve));
}

function ziaGlowCornerRadius(radius, w, h) {
  return Math.max(0, Math.min(radius, w / 2, h / 2));
}

// How far a corner of radius r lifts the bottom edge at x: a quarter of
// |x|^n + |y|^n = 1, a circle at n = 2.
function ziaGlowArc(x, w, r, inset = 0, n = 2) {
  if (r <= 0) {
    return 0;
  }
  const d = Math.min(x, w - x) - inset;
  if (d >= r) {
    return 0;
  }
  if (d <= 0) {
    return r;
  }
  const k = (r - d) / r;
  return r - r * Math.pow(Math.max(0, 1 - Math.pow(k, n)), 1 / n);
}

// The host's corner-shape: the one given, else its own.
function ziaGlowCornerShapeOf(container, given) {
  const style = getComputedStyle(container);
  return (given || style.getPropertyValue("corner-bottom-left-shape") || style.getPropertyValue("corner-shape") || "")
    .trim()
    .split(/\s+(?![^(]*\))/)[0];
}

// Its exponent: CSS draws corner-shape superellipse(K) as |x|^n + |y|^n = 1 with
// n = 2^K (round is K = 1, squircle K = 2).
function ziaGlowCornerExp(shape) {
  const named = { round: 1, squircle: 2, bevel: 0, square: 8 };
  let k = named[shape];
  const m = shape.match(/^superellipse\(\s*([^)]*)\)$/);
  if (m) {
    k = parseFloat(m[1]);
    if (!Number.isFinite(k)) {
      k = /^-/.test(m[1].trim()) ? 0 : 8;
    }
  }
  return Math.pow(2, Math.max(0, Math.min(8, k ?? 1)));
}

// The host's outline as a path, inset by `inset`: its corners as CSS draws them.
function ziaGlowOutlinePath(w, h, r, n, inset) {
  const x0 = inset;
  const y0 = inset;
  const x1 = w - inset;
  const y1 = h - inset;
  const rr = Math.max(0, Math.min(r - inset, (x1 - x0) / 2, (y1 - y0) / 2));
  const e = 2 / n;
  const f = (v) => v.toFixed(2);
  const pts = [];
  for (const [cx, cy, a0] of [
    [x0 + rr, y0 + rr, Math.PI],
    [x1 - rr, y0 + rr, 1.5 * Math.PI],
    [x1 - rr, y1 - rr, 0],
    [x0 + rr, y1 - rr, 0.5 * Math.PI],
  ]) {
    for (let i = 0; i <= 16; i++) {
      const a = a0 + (Math.PI / 2) * (i / 16);
      const c = Math.cos(a);
      const s = Math.sin(a);
      pts.push(
        `${f(cx + rr * Math.sign(c) * Math.pow(Math.abs(c), e))} ${f(cy + rr * Math.sign(s) * Math.pow(Math.abs(s), e))}`
      );
    }
  }
  return `M ${pts.join(" L ")} Z`;
}

// The glow is clipped to the host's outline, and its edge stroke drawn along it,
// as paths: Firefox clips overflow (and masks) to a round corner whatever the
// corner-shape, and the glow came out rounder than a squircle card.
function ziaGlowOutline(g, w, h) {
  const { radius, cornerN } = g.cfg;
  const key = `${w} ${h} ${radius} ${cornerN}`;
  if (key === g.outlineKey) {
    return;
  }
  g.outlineKey = key;
  const outer = ziaGlowOutlinePath(w, h, radius, cornerN, 0);
  const inner = ziaGlowOutlinePath(w, h, radius, cornerN, 1);
  g.root.style.setProperty("--zg-outline", `path("${outer}")`);
  g.root.style.setProperty("--zg-ring", `path(evenodd, "${outer} ${inner}")`);
}

// The band's fringes in the lobes' colours (light themes tint the core too).
function ziaGlowBandFrom(colors, T) {
  const rgb = (c) => (String(c).match(/\d+(\.\d+)?/g) || [255, 255, 255]).slice(0, 3).join(", ");
  return {
    core: T === ZIA_GLOW_THEMES.dark ? T.band.core : rgb(colors[0]),
    above: rgb(colors[0]),
    mid: rgb(colors[1]),
    below: rgb(colors[2]),
  };
}

// A believable, gentle "music is playing" level (0..1, before the gate and envelope):
// a slow phrase swell, a slower sway, a soft beat and a wandering random energy.
function ziaGlowMusicNew() {
  const r = Math.random;
  return {
    swell: r() * ZIA_GLOW_TAU,
    sway: r() * ZIA_GLOW_TAU,
    beat: (92 + r() * 34) / 60, // 92-126 bpm
    from: r(),
    to: r(),
    at: 0,
    dur: 0.6,
  };
}

function ziaGlowMusic(m, t) {
  if (t >= m.at + m.dur || t < m.at) {
    m.from = m.to;
    m.to = Math.random();
    m.at = t;
    m.dur = 0.35 + Math.random() * 0.85;
  }
  const k = (1 - Math.cos(Math.PI * Math.min(1, (t - m.at) / m.dur))) / 2;
  const energy = m.from + (m.to - m.from) * k;
  const swell = 0.5 + 0.5 * Math.sin(t * 0.83 + m.swell); // ~7.6s phrases
  const sway = 0.5 + 0.5 * Math.sin(t * 2.1 + m.sway); // ~3s
  const beat = Math.pow(0.5 + 0.5 * Math.cos(ZIA_GLOW_TAU * m.beat * t), 6);
  return 0.08 + 0.08 * swell + 0.04 * sway + 0.05 * beat + 0.08 * energy;
}

function ziaGlowScaleFor(width) {
  const s = Math.min(1, width / ZIA_GLOW_HOST_WIDTH);
  return Math.max(ZIA_GLOW_MIN_SCALE, Math.round(s * 50) / 50);
}

function ziaGlowRadiusOf(container) {
  const r = parseFloat(getComputedStyle(container).borderTopLeftRadius);
  return r > 0 ? r : 16;
}

function ziaGlowReducedMotion() {
  if (!ziaGlowMotionQuery && typeof matchMedia === "function") {
    ziaGlowMotionQuery = matchMedia("(prefers-reduced-motion: reduce)");
  }
  return !!ziaGlowMotionQuery?.matches;
}

function ziaGlowListen() {
  if (ziaGlowListening) {
    return;
  }
  ziaGlowListening = true;
  ziaGlowReducedMotion();
  ziaGlowMotionQuery?.addEventListener("change", () => {
    for (const g of ziaGlowAll) {
      if (g.playing) {
        ziaGlowWake(g);
      }
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      ziaGlowStop();
    } else {
      ziaGlowStart();
    }
  });
}

// Per theme and scale: the CSS the layers paint with. Everything that moves is a
// custom property on the root that the loop writes each frame.
function ziaGlowBuild(g, scale) {
  const T = g.dark ? ZIA_GLOW_THEMES.dark : ZIA_GLOW_THEMES.light;
  const P = ZIA_GLOW_TUNING;
  const colors = g.colors || T.colors;
  const F = scale;
  const cfg = {
    dark: g.dark,
    scale: F,
    radius: ziaGlowRadiusOf(g.container),
    cornerShape: ziaGlowCornerShapeOf(g.container, g.cornerShape),
    threshold: P.threshold,
    attack: P.attack,
    release: P.release,
    idle: P.idle,
    breatheDuration: P.breatheDuration,
    bands: P.bands,
    flow: P.flow * F,
    bend: P.bend * F,
    reach: T.reach,
    spread: T.spread,
    lobeSpacing: P.lobeSpacing * F,
    rangeWidth: P.rangeWidth * F,
    rangeHeight: P.rangeHeight * F,
    bandStrength: T.bandStrength,
    bandWidth: P.bandWidth * F,
    bandPosition: P.bandPosition,
    bandCurve: P.bandCurve,
    bandSpread: P.bandSpread,
    bandSkew: P.bandSkew,
    bandOffset: P.bandOffset * F,
    bandTail: P.bandTail,
    bandTailPosition: P.bandTailPosition,
    bandTailCurve: P.bandTailCurve,
    bandTailOverflow: P.bandTailOverflow * F,
    bandAberration: P.bandAberration,
    bandColors: g.colors ? ziaGlowBandFrom(g.colors, T) : T.band,
    distortion: g.displace ? P.distortion : 0,
    coreLight: T.coreLight,
    // (a narrower drift for colours given, so they stay the picture's)
    hueRange: g.colors ? Math.min(10, T.hueRange) : T.hueRange,
    hueDuration: T.hueDuration,
  };
  cfg.cornerN = ziaGlowCornerExp(cfg.cornerShape);
  g.cfg = cfg;
  g.dirty = false;

  const r1 = (v) => Math.round(v * 10) / 10;
  const glowWidth = P.glowWidth * F;
  const glowHeight = P.glowHeight * F;
  const coreSize = P.coreSize * F;
  const glowSize = P.glowSize * F;
  const fade = Math.round(Math.max(40, Math.min(95, 70 * P.softness)));
  const edge = r1(28 * F);
  const shadow = r1(9 * F);
  const at = "calc(50% + var(--zg-cx) * var(--zg-w))";

  const lobes = (alpha, sw, sh, y, stop) =>
    ZIA_GLOW_LOBES.map((lobe, i) => {
      const color =
        alpha >= 1 ? colors[i] : colors[i].replace("rgb(", "rgba(").replace(")", `, ${alpha.toFixed(2)})`);
      return (
        `radial-gradient(ellipse calc(${Math.round(lobe.w * sw)}px * var(--zg-w)) ` +
        `calc(${Math.round(lobe.h * sh)}px * var(--zg-h) * var(--zg-l${i})) ` +
        `at calc(50% + (var(--zg-cx) + var(--zg-x${i})) * var(--zg-w)) calc(100% + ${y}px + var(--zg-y${i})), ` +
        `${color} 0%, transparent ${stop}%)`
      );
    }).join(", ");

  // The visible range: a centred ellipse whose top humps up with the bend.
  const range = (rw, rh, mid, rim) =>
    `radial-gradient(ellipse calc(${r1(rw * cfg.rangeWidth)}px * var(--zg-w) * var(--zg-mw)) ` +
    `calc(${r1(rh * cfg.rangeHeight)}px * var(--zg-h) + var(--zg-bh)) at ${at} calc(100% + var(--zg-cy)), ` +
    `white 0%, rgba(255, 255, 255, 0.5) ${mid}%${rim > 0 ? `, rgba(255, 255, 255, ${rim}) 85%` : ""}, transparent 100%)`;

  // The hot spot in the stroke: white on dark, an ink core on light.
  const spot = g.dark
    ? `radial-gradient(ellipse calc(${r1(30 * coreSize)}px * var(--zg-w)) calc(${r1(30 * coreSize)}px * var(--zg-h)) ` +
      `at ${at} calc(100% + 2px + var(--zg-cy)), rgba(255, 255, 255, 0.45) 0%, rgba(255, 255, 255, 0.14) 30%, transparent 65%)`
    : `radial-gradient(ellipse calc(${r1(40 * coreSize)}px * var(--zg-w)) calc(${r1(30 * coreSize)}px * var(--zg-h)) ` +
      `at ${at} calc(100% + 2px + var(--zg-cy)), rgba(0, 0, 0, 0.55) 0%, rgba(0, 0, 0, 0.22) 35%, transparent 70%)`;

  const strokeBg = `${spot}, ${lobes(1, glowWidth * P.strokeScale, glowHeight * P.strokeScale, 2, fade)}`;
  const strokeMask = range(170, 64, 45, 0);
  const innerBg = lobes(
    0.46,
    glowWidth * 0.9 * P.innerScale,
    glowHeight * 0.9 * P.innerScale * P.innerHeight,
    0,
    fade
  );
  const innerMask =
    `${range(170, 64, 45, 0.3)}, ` +
    `linear-gradient(white, transparent ${edge}px, transparent calc(100% - ${edge}px), white), ` +
    `linear-gradient(to right, white, transparent ${edge}px, transparent calc(100% - ${edge}px), white)`;
  const bloomBg = lobes(
    T.bloomAlpha,
    glowWidth * 1.15 * P.bloomScale,
    glowHeight * 1.5 * P.bloomScale * P.bloomHeight,
    0,
    Math.min(95, fade + 2)
  );
  const bloomMask = range(200, 130, 35, 0);

  const set = (el, prop, value) => el && el.style.setProperty(prop, value);
  set(g.stroke, "background", strokeBg);
  set(g.stroke, "mask-image", strokeMask);
  for (const el of [g.inner, g.innerWarp]) {
    set(el, "background", innerBg);
    set(el, "mask-image", innerMask);
  }
  for (const el of [g.bloom, g.bloomWarp]) {
    set(el, "background", bloomBg);
    set(el, "mask-image", bloomMask);
  }

  const root = g.root.style;
  root.setProperty(
    "--zg-tone",
    `hue-rotate(calc(${T.hueBase}deg + var(--zg-hue))) brightness(${T.brightness.toFixed(2)}) saturate(${T.saturation.toFixed(2)})`
  );
  root.setProperty("--zg-blur", `${r1(Math.max(0.5, Math.round(10 * glowSize * 100) / 100))}px`);
  root.setProperty("--zg-shadow", `inset 0 0 ${shadow}px 1px ${T.innerShadow}`);
  root.setProperty("--zg-stroke-k", T.strokeOpacity.toFixed(2));
  root.setProperty("--zg-inner-k", T.innerOpacity.toFixed(2));
  root.setProperty("--zg-bloom-k", T.bloomOpacity.toFixed(2));
  root.setProperty("--zg-strength", String(T.strength));

  // The epicentre: a white wash at the source under the band line (light theme).
  const light = Math.max(0, Math.min(3, cfg.coreLight));
  g.root.toggleAttribute("data-core", light > 0);
  if (light > 0) {
    const w = Math.max(0, Math.min(2, light - 1));
    const a = Math.min(1, w);
    const b = Math.max(0, w - 1);
    const grow = 1 + 0.3 * w;
    const solid = r1(45 * a + 27 * b);
    const mid = r1(40 + 25 * a + 15 * b);
    const midAlpha = Math.min(1, 0.55 + 0.35 * a + 0.1 * b).toFixed(2);
    const end = r1(72 + 14 * a + 8 * b);
    set(
      g.coreFill,
      "background",
      `radial-gradient(ellipse calc(${r1(120 * P.coreLightWidth * grow * F)}px * var(--zg-w)) ` +
        `calc(${r1(70 * P.coreLightHeight * grow * F)}px * var(--zg-h) + var(--zg-bh)) at ${at} calc(100% + var(--zg-cy)), ` +
        `white 0%, white ${solid}%, rgba(255, 255, 255, ${midAlpha}) ${mid}%, transparent ${end}%)`
    );
    root.setProperty("--zg-core-blur", `${r1(Math.max(0.5, Math.round(8 * glowSize * 100) / 100))}px`);
    root.setProperty("--zg-core-k", (Math.min(1, light) * (1.6 + 1.4 * w)).toFixed(2));
  }

  if (g.turbulence) {
    const detail = P.distortionDetail / F;
    g.turbulence.setAttribute("baseFrequency", `${(0.012 * detail).toFixed(4)} ${(0.05 * detail).toFixed(4)}`);
  }
}

// The band line: a bell over the glow's range, ends rising into the corners.
function ziaGlowBandPoints(cfg, e, w, h) {
  const cx = w / 2 + e.cx * e.w;
  const half = 170 * cfg.rangeWidth * e.w * e.mw;
  const cap = h * 0.82 * Math.min(1, cfg.scale);
  const peak = Math.min(cap, (64 * cfg.rangeHeight * e.h + e.lift) * cfg.bandPosition);
  const base = h - cfg.bandOffset;
  const c = Math.min(1, e.corner * 4);
  const tail = cfg.bandTail * (1 - c * c * (3 - 2 * c));
  const hasTail = tail > 1e-3;
  const over = hasTail ? cfg.bandTailOverflow : 0;
  const x0 = hasTail ? -over : cx - half;
  const x1 = hasTail ? w + over : cx + half;
  const radius = ziaGlowCornerRadius(cfg.radius, w, h);
  const pts = [];
  for (let i = 0; i <= ZIA_GLOW_BAND_POINTS; i++) {
    const x = x0 + ((x1 - x0) * i) / ZIA_GLOW_BAND_POINTS;
    const u = Math.max(-1, Math.min(1, (x - cx) / Math.max(1, half)));
    const reach = (x < cx ? cx : w - cx) + over;
    const d =
      ziaGlowBell(u, cfg.bandCurve, cfg.bandSpread, cfg.bandSkew) +
      ziaGlowTail(Math.abs(x - cx), reach, tail, cfg.bandTailPosition, cfg.bandTailCurve);
    const lift = e.corner > 0 ? ziaGlowArc(x, w, radius, 0, cfg.cornerN) * e.corner : 0;
    pts.push([x, base - peak * d - lift]);
  }
  return pts;
}

// Clip polygons above / below the band line: only the glow under it warps.
function ziaGlowClip(g, pts, w, h) {
  const px = (v) => v.toFixed(1) + "px";
  const line = pts.map(([x, y]) => `${px(x)} ${px(y)}`);
  g.root.style.setProperty("--zg-clip-below", `polygon(0 ${px(h)}, ${line.join(", ")}, ${px(w)} ${px(h)})`);
  g.root.style.setProperty(
    "--zg-clip-above",
    `polygon(0 0, ${px(w)} 0, ${px(w)} ${px(h)}, ${line.reverse().join(", ")}, 0 ${px(h)})`
  );
}

// Narrow the filter region to the strip under the band line.
function ziaGlowFilterRegion(g, pts, h) {
  let top = h;
  for (const p of pts) {
    if (p[1] < top) {
      top = p[1];
    }
  }
  const y = Math.max(0, Math.min(0.9, Math.floor((top - 6) / h / 0.05) * 0.05));
  if (y === g.filterTop) {
    return;
  }
  g.filterTop = y;
  const bottom = 1 + Math.max(0.1, 12 / h);
  g.filter.setAttribute("x", "-10%");
  g.filter.setAttribute("width", "120%");
  g.filter.setAttribute("y", `${(y * 100).toFixed(0)}%`);
  g.filter.setAttribute("height", `${((bottom - y) * 100).toFixed(1)}%`);
}

// The band canvas: a soft halo and four chromatic fringes along the line.
function ziaGlowDrawBand(g, e, pts, w, h) {
  const { canvas, ctx, cfg } = g;
  if (!ctx) {
    return;
  }
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cw = Math.round(w * dpr);
  const ch = Math.round(h * dpr);
  if (canvas.width !== cw || canvas.height !== ch) {
    canvas.width = cw;
    canvas.height = ch;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const strength = Math.min(1, 0.6 * cfg.bandStrength * e.strength);
  if (strength < 5e-3 || cfg.bandWidth <= 0) {
    return;
  }
  const width = cfg.bandWidth * (1 + 0.35 * e.level);
  const split = cfg.bandAberration * (0.35 + 0.65 * e.level);
  const dy = (4 + 12 * split) * cfg.scale;
  const dx = 4 * split * cfg.scale;
  const alpha = (cfg.dark ? 0.42 : 0.4) * strength;
  const line = 14 * width;
  const blur = ((3.5 * cfg.bandWidth) / 2) * dpr;
  const colors = cfg.bandColors;
  const passes = [
    [1, 0.16],
    [0.72, 0.2],
    [0.46, 0.26],
    [0.22, 0.34],
  ];
  const fringes = [
    { rgb: colors.above, a: 1, ox: dx, oy: -dy },
    { rgb: colors.mid, a: 0.55, ox: dx * 0.35, oy: -dy * 0.35 },
    { rgb: colors.below, a: 1, ox: -dx, oy: dy },
    { rgb: colors.core, a: 0.9, ox: 0, oy: 0 },
  ];
  const x0 = pts[0][0];
  const x1 = pts[pts.length - 1][0];
  const k = cfg.bandTail > 0 ? 0.015 : 0.18;
  const paint = (rgb, a) => {
    const grad = ctx.createLinearGradient(x0, 0, x1, 0);
    grad.addColorStop(0, `rgba(${rgb}, 0)`);
    grad.addColorStop(k, `rgba(${rgb}, ${a.toFixed(3)})`);
    grad.addColorStop(1 - k, `rgba(${rgb}, ${a.toFixed(3)})`);
    grad.addColorStop(1, `rgba(${rgb}, 0)`);
    return grad;
  };
  const trace = (ox, oy) => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0] + ox, pts[0][1] + oy);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i][0] + ox, pts[i][1] + oy);
    }
  };
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = `blur(${(blur * 3).toFixed(1)}px)`;
  ctx.strokeStyle = paint(colors.core, alpha * 0.3);
  ctx.lineWidth = line * 2.2;
  trace(0, 0);
  ctx.stroke();
  ctx.filter = `blur(${blur.toFixed(1)}px)`;
  for (const f of fringes) {
    for (const [lw, la] of passes) {
      ctx.strokeStyle = paint(f.rgb, alpha * f.a * la);
      ctx.lineWidth = Math.max(0.6, line * lw);
      trace(f.ox, f.oy);
      ctx.stroke();
    }
  }
  ctx.filter = "none";
}

function ziaGlowMotionOf(g) {
  const m = typeof g.motion === "function" ? g.motion() : g.motion;
  if (!m) {
    return ZIA_GLOW_STILL;
  }
  return {
    gather: ziaGlowClamp(m.gather || 0),
    offset: m.offset || 0,
    stretch: ziaGlowClamp(m.stretch || 0),
    heldLevel: ziaGlowClamp(m.heldLevel || 0),
    cornerFollow: ziaGlowClamp(m.cornerFollow || 0),
  };
}

// One frame of one instance: level -> envelope -> geometry -> custom properties.
function ziaGlowStep(g, ts, reduced) {
  const root = g.root;
  const w = root.clientWidth;
  const h = root.clientHeight;
  if (!w || !h) {
    return false;
  }
  const scale = ziaGlowScaleFor(w);
  if (g.dirty || scale !== g.cfg?.scale) {
    ziaGlowBuild(g, scale);
  }
  const cfg = g.cfg;
  ziaGlowOutline(g, w, h);
  const s = g.s;
  const dt = s.lastTs ? Math.min(0.05, (ts - s.lastTs) / 1000) : 1 / 60;
  s.lastTs = ts;
  s.t += dt;
  const t = s.t;

  // The level: synthetic music while playing, silence while paused. The bands are
  // synthesised from it the way VoiceBeam does for a `level` getter.
  const d = g.playing ? (reduced ? ZIA_GLOW_STEADY : ziaGlowClamp(ziaGlowMusic(g.music, t))) : 0;
  const raw = reduced
    ? [d, d * 0.72, d * 0.6]
    : [d, d * (0.72 + 0.28 * Math.sin(t * 9.1)), d * (0.6 + 0.4 * Math.sin(t * 13.7 + 2))];
  const level = ziaGlowShape(d, cfg.threshold);
  s.level = reduced ? level : ziaGlowFollow(s.level, level, dt, cfg.attack, cfg.release);
  for (let i = 0; i < 3; i++) {
    const band = ziaGlowShape(raw[i], cfg.threshold * 0.6);
    s.bands[i] = reduced ? band : ziaGlowFollow(s.bands[i], band, dt, cfg.attack, cfg.release * 1.15);
  }

  const m = ziaGlowMotionOf(g);
  const gather = m.gather;
  const ring = ZIA_GLOW_SPAN * cfg.lobeSpacing;
  const cx = reduced ? 0 : (m.offset * ring) / 2;
  const pull = 1 - gather * 0.6;
  const narrow = 1 - gather * 0.45;
  const stretch = 1 + gather * 0.3 * m.stretch;
  const breathe = reduced ? 0.5 : 0.5 + 0.5 * Math.sin((ZIA_GLOW_TAU * t) / cfg.breatheDuration);
  const voiced = s.level + (1 - s.level) * cfg.idle * breathe;
  const held = Math.max(0, Math.min(1, (gather - 0.25) / 0.75));
  const R = Math.max(voiced, m.heldLevel * held * held * (3 - 2 * held));
  const glow = 0.15 + 0.85 * R;
  const tall = 0.5 + cfg.reach * R;
  const wide = (0.85 + cfg.spread * R) * stretch;
  if (cfg.flow !== 0 && !reduced) {
    s.phase = (((s.phase + cfg.flow * R * dt) % ring) + ring) % ring;
  }

  const st = root.style;
  st.setProperty("--zg-cx", `${cx.toFixed(1)}px`);
  st.setProperty("--zg-mw", narrow.toFixed(3));
  const lift = cfg.bend * R;
  st.setProperty("--zg-bh", `${Math.max(0, lift).toFixed(1)}px`);
  const e = {
    cx,
    w: wide,
    h: tall,
    mw: narrow,
    lift,
    strength: cfg.bend > 0 ? Math.min(1, lift / cfg.bend) : 0,
    level: s.level,
    corner: gather,
  };
  const radius = ziaGlowCornerRadius(cfg.radius, w, h);
  const follow = gather * m.cornerFollow;
  const spot = 30 * cfg.scale * wide;
  st.setProperty("--zg-cy", `${(-ziaGlowArc(w / 2 + cx * wide, w, radius, spot * 1.4, cfg.cornerN) * follow).toFixed(1)}px`);

  // Distortion settles out while the glow is gathered, and is off under reduced motion.
  s.warp = ziaGlowFollow(s.warp, gather > 0.02 ? 0 : 1, dt, 0.35, 0.06);
  const warpOff = !g.displace || cfg.distortion <= 0 || reduced || s.warp < 0.03;
  if (warpOff !== g.warpOff) {
    g.warpOff = warpOff;
    root.toggleAttribute("data-warp-off", warpOff);
  }
  const pts = ziaGlowBandPoints(cfg, e, w, h);
  if (!warpOff || cfg.coreLight > 0) {
    ziaGlowClip(g, pts, w, h);
  }
  if (!warpOff) {
    ziaGlowFilterRegion(g, pts, h);
    g.displace.scale.baseVal = cfg.distortion * 120 * cfg.scale * (0.15 + 0.85 * R) * s.warp;
    g.shift.dx.baseVal = 8 * cfg.scale * Math.sin(t * 0.9);
    g.shift.dy.baseVal = 4 * cfg.scale * Math.sin(t * 0.6 + 1.3);
  }
  ziaGlowDrawBand(g, e, pts, w, h);

  st.setProperty("--zg-glow", glow.toFixed(3));
  st.setProperty("--zg-h", tall.toFixed(3));
  st.setProperty("--zg-w", wide.toFixed(3));
  for (let i = 0; i < ZIA_GLOW_LOBES.length; i++) {
    const lobe = ZIA_GLOW_LOBES[i];
    const x = ziaGlowWrap(lobe.x * cfg.lobeSpacing + s.phase, ring);
    const gain = cfg.bands ? 0.6 + 0.7 * s.bands[lobe.band] : 1;
    st.setProperty(`--zg-x${i}`, `${(x * pull).toFixed(1)}px`);
    st.setProperty(`--zg-l${i}`, (gain * ziaGlowRingFade(x, ring)).toFixed(3));
    const lx = w / 2 + (cx + x * pull) * wide;
    st.setProperty(`--zg-y${i}`, `${(-ziaGlowArc(lx, w, radius, spot, cfg.cornerN) * follow).toFixed(1)}px`);
  }
  const hue =
    reduced || cfg.hueRange === 0
      ? 0
      : -cfg.hueRange + cfg.hueRange * (1 - Math.cos((ZIA_GLOW_TAU * t) / cfg.hueDuration));
  st.setProperty("--zg-hue", `${hue.toFixed(2)}deg`);
  return true;
}

// The shared loop: capped at ~60 fps, every other frame on a device that cannot hold
// 60 (probing full rate again after 4s), stopped when nothing is left to draw.
function ziaGlowFrame(ts) {
  ziaGlowRaf = requestAnimationFrame(ziaGlowFrame);
  const gap = ziaGlowPrevTs ? ts - ziaGlowPrevTs : 0;
  ziaGlowPrevTs = ts;
  if (ziaGlowHalfRate) {
    ziaGlowSkip = !ziaGlowSkip;
    if (ziaGlowSkip) {
      return;
    }
    if (ts >= ziaGlowProbeAt) {
      ziaGlowHalfRate = false;
      ziaGlowSlowSince = 0;
    }
  } else if (gap > 22) {
    if (!ziaGlowSlowSince) {
      ziaGlowSlowSince = ts;
    } else if (ts - ziaGlowSlowSince > 500) {
      ziaGlowHalfRate = true;
      ziaGlowSkip = false;
      ziaGlowProbeAt = ts + 4000;
    }
  } else {
    ziaGlowSlowSince = 0;
  }
  if (ts - ziaGlowLastFrame < 1000 / 60 - 2) {
    return;
  }
  ziaGlowLastFrame = ts;

  const reduced = ziaGlowReducedMotion();
  for (const g of ziaGlowLive) {
    if (!g.root.isConnected) {
      ziaGlowLive.delete(g);
      ziaGlowAll.delete(g);
      continue;
    }
    if (!g.visible) {
      ziaGlowLive.delete(g);
      continue;
    }
    if (!g.playing) {
      g.offAt ||= ts;
      // keep following the settling level while the CSS fade-out runs
      if (reduced || ts - g.offAt > ZIA_GLOW_FADE_OUT_MS) {
        ziaGlowLive.delete(g);
        continue;
      }
    }
    const drawn = ziaGlowStep(g, ts, reduced);
    if (reduced && drawn) {
      ziaGlowLive.delete(g); // nothing moves under reduced motion: one still frame
    }
  }
  if (!ziaGlowLive.size) {
    ziaGlowStop();
  }
}

function ziaGlowStart() {
  if (ziaGlowRaf == null && ziaGlowLive.size && !document.hidden) {
    ziaGlowLastFrame = 0;
    ziaGlowPrevTs = 0;
    ziaGlowSlowSince = 0;
    ziaGlowRaf = requestAnimationFrame(ziaGlowFrame);
  }
}

function ziaGlowStop() {
  if (ziaGlowRaf != null) {
    cancelAnimationFrame(ziaGlowRaf);
    ziaGlowRaf = null;
  }
}

function ziaGlowWake(g) {
  if (g.destroyed) {
    return;
  }
  ziaGlowAll.add(g);
  if (!ziaGlowLive.has(g)) {
    g.s.lastTs = 0;
    ziaGlowLive.add(g);
  }
  ziaGlowStart();
}

function ziaGlow(container, { dark = true, cornerShape = "" } = {}) {
  ziaGlowListen();
  const doc = container.ownerDocument;
  const id = `zia-glow-distort-${++ziaGlowCount}`;
  const make = (cls, tag = "div") => {
    const el = doc.createElementNS(ZIA_GLOW_XHTML, tag);
    if (cls) {
      el.className = cls;
    }
    return el;
  };
  const svgEl = (tag, attrs) => {
    const el = doc.createElementNS(ZIA_GLOW_SVG, tag);
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, v);
    }
    return el;
  };

  // Layers, back to front as VoiceBeam stacks them: inner light (and its warp mirror),
  // edge stroke, bloom (and its warp mirror), band canvas, epicentre.
  const root = make("zia-glow");
  root.setAttribute("aria-hidden", "true");
  root.toggleAttribute("data-warp-off", true);
  const inner = make("zia-glow-layer zia-glow-inner");
  const innerWarp = make("zia-glow-layer zia-glow-inner zia-glow-warp");
  const stroke = make("zia-glow-layer zia-glow-stroke");
  const bloom = make("zia-glow-layer zia-glow-bloom");
  const bloomWarp = make("zia-glow-layer zia-glow-bloom zia-glow-warp");
  const canvas = make("zia-glow-layer zia-glow-band", "canvas");
  const core = make("zia-glow-layer zia-glow-core");
  const coreFill = make("");
  core.append(coreFill);

  // The distortion: drifting fractal noise, green pinned to 0.5 so only x displaces.
  const svg = svgEl("svg", { width: "0", height: "0", class: "zia-glow-defs" });
  const filter = svgEl("filter", {
    id,
    x: "-20%",
    y: "-20%",
    width: "140%",
    height: "140%",
    "color-interpolation-filters": "sRGB",
  });
  const turbulence = svgEl("feTurbulence", {
    type: "fractalNoise",
    baseFrequency: "0.04 0.17",
    numOctaves: "2",
    seed: "7",
    result: "noise",
  });
  const shift = svgEl("feOffset", { in: "noise", dx: "0", dy: "0", result: "moved" });
  const matrix = svgEl("feColorMatrix", {
    in: "moved",
    type: "matrix",
    values: "1 0 0 0 0  0 0 0 0 0.5  0 0 0 0 0  0 0 0 0 1",
    result: "map",
  });
  const displace = svgEl("feDisplacementMap", {
    in: "SourceGraphic",
    in2: "map",
    scale: "0",
    xChannelSelector: "R",
    yChannelSelector: "G",
  });
  filter.append(turbulence, shift, matrix, displace);
  svg.append(filter);
  innerWarp.style.setProperty("filter", `var(--zg-tone) url(#${id})`);
  bloomWarp.style.setProperty("filter", `blur(var(--zg-blur)) var(--zg-tone) url(#${id})`);

  root.append(inner, innerWarp, stroke, bloom, bloomWarp, canvas, core, svg);
  container.append(root);

  const g = {
    container,
    root,
    inner,
    innerWarp,
    stroke,
    bloom,
    bloomWarp,
    canvas,
    ctx: canvas.getContext("2d"),
    coreFill,
    filter,
    turbulence,
    shift,
    displace,
    filterTop: -1,
    warpOff: true,
    dark: !!dark,
    cornerShape,
    colors: null,
    colorKey: "",
    outlineKey: "",
    dirty: true,
    cfg: null,
    playing: false,
    offAt: 0,
    visible: true,
    destroyed: false,
    motion: null,
    music: ziaGlowMusicNew(),
    s: { level: 0, bands: [0, 0, 0], phase: 0, t: 0, lastTs: 0, warp: 1 },
  };

  // Offscreen (a collapsed or slid-out sidebar): leave the loop until it shows again.
  if (typeof IntersectionObserver === "function") {
    g.io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          g.visible = entry.isIntersecting;
        }
        if (g.visible && g.playing) {
          ziaGlowWake(g);
        }
      },
      { rootMargin: "256px" }
    );
    g.io.observe(root);
  }
  // A still frame (reduced motion) is redrawn when the card is resized.
  if (typeof ResizeObserver === "function") {
    g.ro = new ResizeObserver(() => {
      if (g.playing && ziaGlowReducedMotion()) {
        ziaGlowWake(g);
      }
    });
    g.ro.observe(root);
  }

  return {
    setPlaying(on) {
      on = !!on;
      if (g.destroyed || on === g.playing) {
        return;
      }
      g.playing = on;
      g.offAt = 0;
      root.toggleAttribute("data-on", on);
      ziaGlowWake(g);
    },
    setDark(on) {
      on = !!on;
      if (g.destroyed || on === g.dark) {
        return;
      }
      g.dark = on;
      g.dirty = true;
      if (g.playing) {
        ziaGlowWake(g);
      }
    },
    // The lobes' colours, "rgb(r, g, b)" strings repeated round the seven, with the
    // band's fringes from the first three; null for the theme's own.
    setColors(list) {
      list = Array.isArray(list) && list.length ? list : null;
      const key = list ? list.join("|") : "";
      if (g.destroyed || key === g.colorKey) {
        return;
      }
      g.colorKey = key;
      g.colors = list ? ZIA_GLOW_LOBES.map((_, i) => list[i % list.length]) : null;
      g.dirty = true;
      if (g.playing) {
        ziaGlowWake(g);
      }
    },
    // VoiceBeam's `motion`: { gather, offset, stretch, heldLevel, cornerFollow },
    // or a getter sampled every frame, or null for the glow at rest.
    setMotion(motion) {
      g.motion = motion || null;
      if (g.playing) {
        ziaGlowWake(g);
      }
    },
    destroy() {
      if (g.destroyed) {
        return;
      }
      g.destroyed = true;
      g.io?.disconnect();
      g.ro?.disconnect();
      ziaGlowLive.delete(g);
      ziaGlowAll.delete(g);
      root.remove();
      if (!ziaGlowLive.size) {
        ziaGlowStop();
      }
    },
  };
}
// ---------- Metal surfaces: Paper Shaders' liquidMetal as metal-fx draws it
// The shader of metal-fx 2.0.11 (https://libraries.dev, "Liquid metal"), as
// the welcome tour's metal.js has it, in the package's "silver" preset (its
// plain metal: a white tint and only a touch of colour at the edges, where
// "chromatic" splits it into colours), painted into canvases of Zia's own
// rather than into lettering: one hidden WebGL2 canvas draws each surface in
// turn and it's copied over.
//
//   const metal = ziaMetalSurface(canvas, { speed: 0.1, every: 120, light: false });
//   metal.setLight(true);   // the preset's light tuning, for a light space
//   metal.destroy();
//
// `speed` scales the shader's clock (1 is the package's), `every` is the ms
// between frames (66, about 15 a second, is the package's), `band` takes a
// thin strip through the middle of a squarer render (for a line, whose own
// shape would squeeze the pattern). Still under reduced motion; nothing at
// all without WebGL2. The canvas's own width and height set the resolution.
//
// metal-fx is MIT licensed:
//
//   MIT License
//
//   Copyright (c) 2026 Jakub Antalik
//
//   Permission is hereby granted, free of charge, to any person obtaining a copy
//   of this software and associated documentation files (the "Software"), to deal
//   in the Software without restriction, including without limitation the rights
//   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
//   copies of the Software, and to permit persons to whom the Software is
//   furnished to do so, subject to the following conditions:
//
//   The above copyright notice and this permission notice shall be included in all
//   copies or substantial portions of the Software.
//
//   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
//   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
//   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
//   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
//   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
//   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
//   SOFTWARE.
//
// The package's NOTICE, which applies to the two shaders below:
//
//   metal-fx
//   Copyright (c) Jakub Antalik
//
//   This product includes software developed by Paper Design, Inc.
//
//     Paper Shaders (https://github.com/paper-design/shaders)
//     Copyright (c) Paper Design, Inc.
//     Licensed under the Apache License, Version 2.0
//     http://www.apache.org/licenses/LICENSE-2.0
//
//   The `liquidMetal` fragment shader is consumed unmodified from the
//   `@paper-design/shaders` npm package; the sizing vertex shader is copied
//   verbatim from `packages/shaders/src/vertex-shader.ts` @ 0.0.80. No changes
//   were made to either shader's source (nor are any made here).

// Shared GLSL pieces (Paper Shaders), copied verbatim from metal-fx's dist.
const ZIA_METAL_DEFINES = `
#define TWO_PI 6.28318530718
#define PI 3.14159265358979323846
`;
const ZIA_METAL_ROTATE = `
vec2 rotate(vec2 uv, float th) {
return mat2(cos(th), sin(th), -sin(th), cos(th)) * uv;
}
`;
const ZIA_METAL_GRAIN = `
color += 1. / 256. * (fract(sin(dot(.014 * gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453123) - .5);
`;
const ZIA_METAL_SNOISE = `
vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float snoise(vec2 v) {
const vec4 C = vec4(0.211324865405187, 0.366025403784439,
  -0.577350269189626, 0.024390243902439);
vec2 i = floor(v + dot(v, C.yy));
vec2 x0 = v - i + dot(i, C.xx);
vec2 i1;
i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
vec4 x12 = x0.xyxy + C.xxzz;
x12.xy -= i1;
i = mod(i, 289.0);
vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
  + i.x + vec3(0.0, i1.x, 1.0));
vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
    dot(x12.zw, x12.zw)), 0.0);
m = m * m;
m = m * m;
vec3 x = 2.0 * fract(p * C.www) - 1.0;
vec3 h = abs(x) - 0.5;
vec3 ox = floor(x + 0.5);
vec3 a0 = x - ox;
m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
vec3 g;
g.x = a0.x * x0.x + h.x * x0.y;
g.yz = a0.yz * x12.xz + h.yz * x12.yw;
return 130.0 * dot(m, g);
}
`;
// Paper Shaders' liquidMetal fragment shader, as metal-fx inlines it.
const ZIA_METAL_FRAG = `#version 300 es
precision mediump float;

uniform sampler2D u_image;
uniform float u_imageAspectRatio;

uniform vec2 u_resolution;
uniform float u_time;

uniform vec4 u_colorBack;
uniform vec4 u_colorTint;

uniform float u_softness;
uniform float u_repetition;
uniform float u_shiftRed;
uniform float u_shiftBlue;
uniform float u_distortion;
uniform float u_contour;
uniform float u_angle;

uniform float u_shape;
uniform bool u_isImage;

in vec2 v_objectUV;
in vec2 v_responsiveUV;
in vec2 v_responsiveBoxGivenSize;
in vec2 v_imageUV;

out vec4 fragColor;

${ZIA_METAL_DEFINES}
${ZIA_METAL_ROTATE}
${ZIA_METAL_SNOISE}

float getColorChanges(float c1, float c2, float stripe_p, vec3 w, float blur, float bump, float tint) {

float ch = mix(c2, c1, smoothstep(.0, 2. * blur, stripe_p));

float border = w[0];
ch = mix(ch, c2, smoothstep(border, border + 2. * blur, stripe_p));

if (u_isImage == true) {
  bump = smoothstep(.2, .8, bump);
}
border = w[0] + .4 * (1. - bump) * w[1];
ch = mix(ch, c1, smoothstep(border, border + 2. * blur, stripe_p));

border = w[0] + .5 * (1. - bump) * w[1];
ch = mix(ch, c2, smoothstep(border, border + 2. * blur, stripe_p));

border = w[0] + w[1];
ch = mix(ch, c1, smoothstep(border, border + 2. * blur, stripe_p));

float gradient_t = (stripe_p - w[0] - w[1]) / w[2];
float gradient = mix(c1, c2, smoothstep(0., 1., gradient_t));
ch = mix(ch, gradient, smoothstep(border, border + .5 * blur, stripe_p));

// Tint color is applied with color burn blending
ch = mix(ch, 1. - min(1., (1. - ch) / max(tint, 0.0001)), u_colorTint.a);
return ch;
}

float getImgFrame(vec2 uv, float th) {
float frame = 1.;
frame *= smoothstep(0., th, uv.y);
frame *= 1.0 - smoothstep(1. - th, 1., uv.y);
frame *= smoothstep(0., th, uv.x);
frame *= 1.0 - smoothstep(1. - th, 1., uv.x);
return frame;
}

float blurEdge3x3(sampler2D tex, vec2 uv, vec2 dudx, vec2 dudy, float radius, float centerSample) {
vec2 texel = 1.0 / vec2(textureSize(tex, 0));
vec2 r = radius * texel;

float w1 = 1.0, w2 = 2.0, w4 = 4.0;
float norm = 16.0;
float sum = w4 * centerSample;

sum += w2 * textureGrad(tex, uv + vec2(0.0, -r.y), dudx, dudy).r;
sum += w2 * textureGrad(tex, uv + vec2(0.0, r.y), dudx, dudy).r;
sum += w2 * textureGrad(tex, uv + vec2(-r.x, 0.0), dudx, dudy).r;
sum += w2 * textureGrad(tex, uv + vec2(r.x, 0.0), dudx, dudy).r;

sum += w1 * textureGrad(tex, uv + vec2(-r.x, -r.y), dudx, dudy).r;
sum += w1 * textureGrad(tex, uv + vec2(r.x, -r.y), dudx, dudy).r;
sum += w1 * textureGrad(tex, uv + vec2(-r.x, r.y), dudx, dudy).r;
sum += w1 * textureGrad(tex, uv + vec2(r.x, r.y), dudx, dudy).r;

return sum / norm;
}

float lst(float edge0, float edge1, float x) {
return clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
}

void main() {

const float firstFrameOffset = 2.8;
float t = .3 * (u_time + firstFrameOffset);

vec2 uv = v_imageUV;
vec2 dudx = dFdx(v_imageUV);
vec2 dudy = dFdy(v_imageUV);
vec4 img = textureGrad(u_image, uv, dudx, dudy);

if (u_isImage == false) {
  uv = v_objectUV + .5;
  uv.y = 1. - uv.y;
}

float cycleWidth = u_repetition;
float edge = 0.;
float contOffset = 1.;

vec2 rotatedUV = uv - vec2(.5);
float angle = (-u_angle + 70.) * PI / 180.;
float cosA = cos(angle);
float sinA = sin(angle);
rotatedUV = vec2(
rotatedUV.x * cosA - rotatedUV.y * sinA,
rotatedUV.x * sinA + rotatedUV.y * cosA
) + vec2(.5);

if (u_isImage == true) {
  float edgeRaw = img.r;
  edge = blurEdge3x3(u_image, uv, dudx, dudy, 6., edgeRaw);
  edge = pow(edge, 1.6);
  edge *= mix(0.0, 1.0, smoothstep(0.0, 0.4, u_contour));
} else {
  if (u_shape < 1.) {
    // full-fill on canvas
    vec2 borderUV = v_responsiveUV + .5;
    float ratio = v_responsiveBoxGivenSize.x / v_responsiveBoxGivenSize.y;
    vec2 mask = min(borderUV, 1. - borderUV);
    vec2 pixel_thickness = min(250. / v_responsiveBoxGivenSize, vec2(.5));
    float maskX = smoothstep(0.0, pixel_thickness.x, mask.x);
    float maskY = smoothstep(0.0, pixel_thickness.y, mask.y);
    maskX = pow(maskX, .25);
    maskY = pow(maskY, .25);
    edge = clamp(1. - maskX * maskY, 0., 1.);

    uv = v_responsiveUV;
    if (ratio > 1.) {
      uv.y /= ratio;
    } else {
      uv.x *= ratio;
    }
    uv += .5;
    uv.y = 1. - uv.y;

    cycleWidth *= 2.;
    contOffset = 1.5;

  } else if (u_shape < 2.) {
    // circle
    vec2 shapeUV = uv - .5;
    shapeUV *= .67;
    edge = pow(clamp(3. * length(shapeUV), 0., 1.), 18.);
  } else if (u_shape < 3.) {
    // daisy
    vec2 shapeUV = uv - .5;
    shapeUV *= 1.68;

    float r = length(shapeUV) * 2.;
    float a = atan(shapeUV.y, shapeUV.x) + .2;
    r *= (1. + .05 * sin(3. * a + 2. * t));
    float f = abs(cos(a * 3.));
    edge = smoothstep(f, f + .7, r);
    edge *= edge;

    uv *= .8;
    cycleWidth *= 1.6;

  } else if (u_shape < 4.) {
    // diamond
    vec2 shapeUV = uv - .5;
    shapeUV = rotate(shapeUV, .25 * PI);
    shapeUV *= 1.42;
    shapeUV += .5;
    vec2 mask = min(shapeUV, 1. - shapeUV);
    vec2 pixel_thickness = vec2(.15);
    float maskX = smoothstep(0.0, pixel_thickness.x, mask.x);
    float maskY = smoothstep(0.0, pixel_thickness.y, mask.y);
    maskX = pow(maskX, .25);
    maskY = pow(maskY, .25);
    edge = clamp(1. - maskX * maskY, 0., 1.);
  } else if (u_shape < 5.) {
    // metaballs
    vec2 shapeUV = uv - .5;
    shapeUV *= 1.3;
    edge = 0.;
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float speed = 1.5 + 2./3. * sin(fi * 12.345);
      float angle = -fi * 1.5;
      vec2 dir1 = vec2(cos(angle), sin(angle));
      vec2 dir2 = vec2(cos(angle + 1.57), sin(angle + 1.));
      vec2 traj = .4 * (dir1 * sin(t * speed + fi * 1.23) + dir2 * cos(t * (speed * 0.7) + fi * 2.17));
      float d = length(shapeUV + traj);
      edge += pow(1.0 - clamp(d, 0.0, 1.0), 4.0);
    }
    edge = 1. - smoothstep(.65, .9, edge);
    edge = pow(edge, 4.);
  }

  edge = mix(smoothstep(.9 - 2. * fwidth(edge), .9, edge), edge, smoothstep(0.0, 0.4, u_contour));

}

float opacity = 0.;
if (u_isImage == true) {
  opacity = img.g;
  float frame = getImgFrame(v_imageUV, 0.);
  opacity *= frame;
} else {
  opacity = 1. - smoothstep(.9 - 2. * fwidth(edge), .9, edge);
  if (u_shape < 2.) {
    edge = 1.2 * edge;
  } else if (u_shape < 5.) {
    edge = 1.8 * pow(edge, 1.5);
  }
}

float diagBLtoTR = rotatedUV.x - rotatedUV.y;
float diagTLtoBR = rotatedUV.x + rotatedUV.y;

vec3 color = vec3(0.);
vec3 color1 = vec3(.98, 0.98, 1.);
vec3 color2 = vec3(.1, .1, .1 + .1 * smoothstep(.7, 1.3, diagTLtoBR));

vec2 grad_uv = uv - .5;

float dist = length(grad_uv + vec2(0., .2 * diagBLtoTR));
grad_uv = rotate(grad_uv, (.25 - .2 * diagBLtoTR) * PI);
float direction = grad_uv.x;

float bump = pow(1.8 * dist, 1.2);
bump = 1. - bump;
bump *= pow(uv.y, .3);


float thin_strip_1_ratio = .12 / cycleWidth * (1. - .4 * bump);
float thin_strip_2_ratio = .07 / cycleWidth * (1. + .4 * bump);
float wide_strip_ratio = (1. - thin_strip_1_ratio - thin_strip_2_ratio);

float thin_strip_1_width = cycleWidth * thin_strip_1_ratio;
float thin_strip_2_width = cycleWidth * thin_strip_2_ratio;

float noise = snoise(uv - t);

edge += (1. - edge) * u_distortion * noise;

direction += diagBLtoTR;
float contour = 0.;
direction -= 2. * noise * diagBLtoTR * (smoothstep(0., 1., edge) * (1.0 - smoothstep(0., 1., edge)));
direction *= mix(1., 1. - edge, smoothstep(.5, 1., u_contour));
direction -= 1.7 * edge * smoothstep(.5, 1., u_contour);
direction += .2 * pow(u_contour, 4.) * (1.0 - smoothstep(0., 1., edge));

bump *= clamp(pow(uv.y, .1), .3, 1.);
direction *= (.1 + (1.1 - edge) * bump);

direction *= (.4 + .6 * (1.0 - smoothstep(.5, 1., edge)));
direction += .18 * (smoothstep(.1, .2, uv.y) * (1.0 - smoothstep(.2, .4, uv.y)));
direction += .03 * (smoothstep(.1, .2, 1. - uv.y) * (1.0 - smoothstep(.2, .4, 1. - uv.y)));

direction *= (.5 + .5 * pow(uv.y, 2.));
direction *= cycleWidth;
direction -= t;


float colorDispersion = (1. - bump);
colorDispersion = clamp(colorDispersion, 0., 1.);
float dispersionRed = colorDispersion;
dispersionRed += .03 * bump * noise;
dispersionRed += 5. * (smoothstep(-.1, .2, uv.y) * (1.0 - smoothstep(.1, .5, uv.y))) * (smoothstep(.4, .6, bump) * (1.0 - smoothstep(.4, 1., bump)));
dispersionRed -= diagBLtoTR;

float dispersionBlue = colorDispersion;
dispersionBlue *= 1.3;
dispersionBlue += (smoothstep(0., .4, uv.y) * (1.0 - smoothstep(.1, .8, uv.y))) * (smoothstep(.4, .6, bump) * (1.0 - smoothstep(.4, .8, bump)));
dispersionBlue -= .2 * edge;

dispersionRed *= (u_shiftRed / 20.);
dispersionBlue *= (u_shiftBlue / 20.);

float blur = 0.;
float rExtraBlur = 0.;
float gExtraBlur = 0.;
if (u_isImage == true) {
  float softness = 0.05 * u_softness;
  blur = softness + .5 * smoothstep(1., 10., u_repetition) * smoothstep(.0, 1., edge);
  float smallCanvasT = 1.0 - smoothstep(100., 500., min(u_resolution.x, u_resolution.y));
  blur += smallCanvasT * smoothstep(.0, 1., edge);
  rExtraBlur = softness * (0.05 + .1 * (u_shiftRed / 20.) * bump);
  gExtraBlur = softness * 0.05 / max(0.001, abs(1. - diagBLtoTR));
} else {
  blur = u_softness / 15. + .3 * contour;
}

vec3 w = vec3(thin_strip_1_width, thin_strip_2_width, wide_strip_ratio);
w[1] -= .02 * smoothstep(.0, 1., edge + bump);
float stripe_r = fract(direction + dispersionRed);
float r = getColorChanges(color1.r, color2.r, stripe_r, w, blur + fwidth(stripe_r) + rExtraBlur, bump, u_colorTint.r);
float stripe_g = fract(direction);
float g = getColorChanges(color1.g, color2.g, stripe_g, w, blur + fwidth(stripe_g) + gExtraBlur, bump, u_colorTint.g);
float stripe_b = fract(direction - dispersionBlue);
float b = getColorChanges(color1.b, color2.b, stripe_b, w, blur + fwidth(stripe_b), bump, u_colorTint.b);

color = vec3(r, g, b);
color *= opacity;

vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
color = color + bgColor * (1. - opacity);
opacity = opacity + u_colorBack.a * (1. - opacity);

${ZIA_METAL_GRAIN}

fragColor = vec4(color, opacity);
}
`;
// Paper Shaders' sizing vertex shader (vertex-shader.ts @ 0.0.80), as metal-fx vendors it.
const ZIA_METAL_VERT = /* glsl */ `#version 300 es
precision mediump float;

layout(location = 0) in vec4 a_position;

uniform vec2 u_resolution;
uniform float u_pixelRatio;
uniform float u_imageAspectRatio;
uniform float u_originX;
uniform float u_originY;
uniform float u_worldWidth;
uniform float u_worldHeight;
uniform float u_fit;
uniform float u_scale;
uniform float u_rotation;
uniform float u_offsetX;
uniform float u_offsetY;

out vec2 v_objectUV;
out vec2 v_objectBoxSize;
out vec2 v_responsiveUV;
out vec2 v_responsiveBoxGivenSize;
out vec2 v_patternUV;
out vec2 v_patternBoxSize;
out vec2 v_imageUV;

vec3 getBoxSize(float boxRatio, vec2 givenBoxSize) {
vec2 box = vec2(0.);
// fit = none
box.x = boxRatio * min(givenBoxSize.x / boxRatio, givenBoxSize.y);
float noFitBoxWidth = box.x;
if (u_fit == 1.) { // fit = contain
  box.x = boxRatio * min(u_resolution.x / boxRatio, u_resolution.y);
} else if (u_fit == 2.) { // fit = cover
  box.x = boxRatio * max(u_resolution.x / boxRatio, u_resolution.y);
}
box.y = box.x / boxRatio;
return vec3(box, noFitBoxWidth);
}

void main() {
gl_Position = a_position;

vec2 uv = gl_Position.xy * .5;
vec2 boxOrigin = vec2(.5 - u_originX, u_originY - .5);
vec2 givenBoxSize = vec2(u_worldWidth, u_worldHeight);
givenBoxSize = max(givenBoxSize, vec2(1.)) * u_pixelRatio;
float r = u_rotation * 3.14159265358979323846 / 180.;
mat2 graphicRotation = mat2(cos(r), sin(r), -sin(r), cos(r));
vec2 graphicOffset = vec2(-u_offsetX, u_offsetY);


// ===================================================

float fixedRatio = 1.;
vec2 fixedRatioBoxGivenSize = vec2(
(u_worldWidth == 0.) ? u_resolution.x : givenBoxSize.x,
(u_worldHeight == 0.) ? u_resolution.y : givenBoxSize.y
);

v_objectBoxSize = getBoxSize(fixedRatio, fixedRatioBoxGivenSize).xy;
vec2 objectWorldScale = u_resolution.xy / v_objectBoxSize;

v_objectUV = uv;
v_objectUV *= objectWorldScale;
v_objectUV += boxOrigin * (objectWorldScale - 1.);
v_objectUV += graphicOffset;
v_objectUV /= u_scale;
v_objectUV = graphicRotation * v_objectUV;

// ===================================================

v_responsiveBoxGivenSize = vec2(
(u_worldWidth == 0.) ? u_resolution.x : givenBoxSize.x,
(u_worldHeight == 0.) ? u_resolution.y : givenBoxSize.y
);
float responsiveRatio = v_responsiveBoxGivenSize.x / v_responsiveBoxGivenSize.y;
vec2 responsiveBoxSize = getBoxSize(responsiveRatio, v_responsiveBoxGivenSize).xy;
vec2 responsiveBoxScale = u_resolution.xy / responsiveBoxSize;

v_responsiveUV = uv;
v_responsiveUV *= responsiveBoxScale;
v_responsiveUV += boxOrigin * (responsiveBoxScale - 1.);
v_responsiveUV += graphicOffset;
v_responsiveUV /= u_scale;
v_responsiveUV.x *= responsiveRatio;
v_responsiveUV = graphicRotation * v_responsiveUV;
v_responsiveUV.x /= responsiveRatio;

// ===================================================

float patternBoxRatio = givenBoxSize.x / givenBoxSize.y;
vec2 patternBoxGivenSize = vec2(
(u_worldWidth == 0.) ? u_resolution.x : givenBoxSize.x,
(u_worldHeight == 0.) ? u_resolution.y : givenBoxSize.y
);
patternBoxRatio = patternBoxGivenSize.x / patternBoxGivenSize.y;

vec3 boxSizeData = getBoxSize(patternBoxRatio, patternBoxGivenSize);
v_patternBoxSize = boxSizeData.xy;
float patternBoxNoFitBoxWidth = boxSizeData.z;
vec2 patternBoxScale = u_resolution.xy / v_patternBoxSize;

v_patternUV = uv;
v_patternUV += graphicOffset / patternBoxScale;
v_patternUV += boxOrigin;
v_patternUV -= boxOrigin / patternBoxScale;
v_patternUV *= u_resolution.xy;
v_patternUV /= u_pixelRatio;
if (u_fit > 0.) {
  v_patternUV *= (patternBoxNoFitBoxWidth / v_patternBoxSize.x);
}
v_patternUV /= u_scale;
v_patternUV = graphicRotation * v_patternUV;
v_patternUV += boxOrigin / patternBoxScale;
v_patternUV -= boxOrigin;
// x100 is a default multiplier between vertex and fragmant shaders
// we use it to avoid UV presision issues
v_patternUV *= .01;

// ===================================================

vec2 imageBoxSize;
if (u_fit == 1.) { // contain
  imageBoxSize.x = min(u_resolution.x / u_imageAspectRatio, u_resolution.y) * u_imageAspectRatio;
} else if (u_fit == 2.) { // cover
  imageBoxSize.x = max(u_resolution.x / u_imageAspectRatio, u_resolution.y) * u_imageAspectRatio;
} else {
  imageBoxSize.x = min(10.0, 10.0 / u_imageAspectRatio * u_imageAspectRatio);
}
imageBoxSize.y = imageBoxSize.x / u_imageAspectRatio;
vec2 imageBoxScale = u_resolution.xy / imageBoxSize;

v_imageUV = uv;
v_imageUV *= imageBoxScale;
v_imageUV += boxOrigin * (imageBoxScale - 1.);
v_imageUV += graphicOffset;
v_imageUV /= u_scale;
v_imageUV.x *= u_imageAspectRatio;
v_imageUV = graphicRotation * v_imageUV;
v_imageUV.x /= u_imageAspectRatio;

v_imageUV += .5;
v_imageUV.y = 1. - v_imageUV.y;
}`;

// (Paper's defaults, then the silver preset's dark tuning; its light one is
// ZIA_METAL_LIGHT)
const ZIA_METAL_PRESET = {
  colorBack: "#00000000",
  colorTint: "#ffffff66",
  repetition: 1.5,
  softness: 0.05,
  shiftRed: 0.3,
  shiftBlue: 0.3,
  distortion: 0.1,
  contour: 0.4,
  angle: 90,
  shape: 0,
  scale: 1,
  rotation: 0,
  offsetX: 0,
  offsetY: 0,
  originX: 0.5,
  originY: 0.5,
  worldWidth: 0,
  worldHeight: 0,
  fit: 1,
  shaderOpacity: 0.88,
};
const ZIA_METAL_LIGHT = { colorTint: "#ffffff40", shaderOpacity: 1 };
const ZIA_METAL_SIZE = 256;
const ziaMetalSurfaces = new Set();
let ziaMetalGL = null;
let ziaMetalFailed = false;
let ziaMetalFrame = 0;

function ziaMetalHex(hex) {
  const e = hex.replace("#", "");
  const a = e.length >= 8 ? parseInt(e.slice(6, 8), 16) / 255 : 1;
  return [parseInt(e.slice(0, 2), 16) / 255, parseInt(e.slice(2, 4), 16) / 255, parseInt(e.slice(4, 6), 16) / 255, a];
}

function ziaMetalSetup() {
  if (ziaMetalGL || ziaMetalFailed) {
    return ziaMetalGL;
  }
  try {
    const canvas = document.createElementNS(XHTML_NS, "canvas");
    canvas.width = ZIA_METAL_SIZE;
    canvas.height = ZIA_METAL_SIZE;
    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false });
    if (!gl) {
      throw new Error("no WebGL2");
    }
    const compile = (type, src) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader) || "shader");
      }
      return shader;
    };
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, ZIA_METAL_VERT));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, ZIA_METAL_FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || "program");
    }
    gl.useProgram(program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    // (the shader samples an image it isn't given here: a 1px stand-in)
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    const u = (name) => gl.getUniformLocation(program, name);
    const p = ZIA_METAL_PRESET;
    gl.uniform1i(u("u_image"), 0);
    gl.uniform4fv(u("u_colorBack"), ziaMetalHex(p.colorBack));
    gl.uniform4fv(u("u_colorTint"), ziaMetalHex(p.colorTint));
    for (const key of ["repetition", "softness", "shiftRed", "shiftBlue", "distortion", "contour", "angle", "shape", "originX", "originY", "worldWidth", "worldHeight", "fit", "scale", "rotation", "offsetX", "offsetY"]) {
      gl.uniform1f(u(`u_${key}`), p[key]);
    }
    gl.uniform1i(u("u_isImage"), 0);
    gl.uniform1f(u("u_imageAspectRatio"), 1);
    gl.uniform1f(u("u_pixelRatio"), 1);
    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      ziaMetalGL = null;
    });
    ziaMetalGL = { canvas, gl, resolution: u("u_resolution"), time: u("u_time"), tint: u("u_colorTint") };
  } catch (err) {
    ziaMetalFailed = true;
    noteError("metal: set up", err);
  }
  return ziaMetalGL;
}

function ziaMetalDraw(s, now) {
  const R = ziaMetalSetup();
  const { width: w, height: h } = s.canvas;
  if (!R || !w || !h) {
    return;
  }
  const { gl } = R;
  // its shape, at most ZIA_METAL_SIZE on its longer side; a band is a strip
  // through a render a sixth as tall as it's wide
  const k = ZIA_METAL_SIZE / Math.max(w, s.band ? 0 : h, 1);
  const vw = Math.max(1, Math.round(Math.min(w * k, ZIA_METAL_SIZE)));
  const vh = s.band ? Math.round(vw / 6) : Math.max(1, Math.round(Math.min(h * k, ZIA_METAL_SIZE)));
  gl.viewport(0, 0, vw, vh);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  const mode = s.light ? ZIA_METAL_LIGHT : ZIA_METAL_PRESET;
  gl.uniform4fv(R.tint, ziaMetalHex(mode.colorTint));
  gl.uniform2f(R.resolution, vw, vh);
  gl.uniform1f(R.time, ((now - s.t0) / 1000) * s.speed);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  const sh = s.band ? Math.max(1, Math.round(vh / 12)) : vh;
  const sy = R.canvas.height - vh + Math.round((vh - sh) / 2);
  s.ctx.clearRect(0, 0, w, h);
  s.ctx.globalAlpha = mode.shaderOpacity;
  s.ctx.drawImage(R.canvas, 0, sy, vw, sh, 0, 0, w, h);
}

function ziaMetalTick(now) {
  ziaMetalFrame = 0;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  for (const s of ziaMetalSurfaces) {
    if (!s.canvas.isConnected) {
      continue;
    }
    if (now >= s.next) {
      ziaMetalDraw(s, now);
      s.next = now + s.every;
      s.drawn = true;
    }
  }
  const moving = [...ziaMetalSurfaces].some((s) => !reduced || !s.drawn);
  if (moving && !document.hidden && !ziaMetalFailed) {
    ziaMetalFrame = requestAnimationFrame(ziaMetalTick);
  }
}

function ziaMetalWake() {
  if (!ziaMetalFrame && ziaMetalSurfaces.size) {
    ziaMetalFrame = requestAnimationFrame(ziaMetalTick);
  }
}

function ziaMetalSurface(canvas, { speed = 1, every = 66, band = false, light = false } = {}) {
  const ctx = canvas.getContext("2d");
  const s = { canvas, ctx, speed, every, band, light, t0: performance.now() - Math.random() * 60000, next: 0, drawn: false };
  if (ctx) {
    ziaMetalSurfaces.add(s);
    ziaMetalWake();
  }
  return {
    setLight(on) {
      s.light = !!on;
      s.next = 0;
      s.drawn = false;
      ziaMetalWake();
    },
    destroy() {
      ziaMetalSurfaces.delete(s);
    },
  };
}

document.addEventListener("visibilitychange", ziaMetalWake);
  // ---------- ziaImgFx: Ultra's pixel-mosaic loader (the hover card's page preview)
  /*
   * A framework-free port of img-fx 0.5.1 (https://libraries.dev; npm
   * "img-fx", the Libraries.dev "Image" loader by Jakub Antalik, a React
   * component on three.js) to raw WebGL2 (WebGL1 fallback), no three.js.
   * The GLSL, the presets (both tunings), the palette, the engine constants
   * and the reveal / hide pipeline are copied from the package's
   * dist/index.es.js; see NOTES.md for what was ported and what changed.
   *
   * MIT License
   *
   * Copyright (c) 2026 Jakub Antalik
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   *
   * ziaImgFx(host, { preset, strength, dark, radius, palette, cardBg, minChurnMs, revealSeconds })
   *   -> { reveal(source, { onDone }), hide(), setDark(dark), destroy(), element }
   *
   * revealSeconds: the dissolve's length in place of the preset's (3s for
   * pixels-organic), its parts kept in proportion: a hover card's preview
   * wants it quicker.
   *
   * palette: optional CSS colours (a few) that re-tint the mosaic's colour
   * field in place of the preset's own, fed to the shader's seven colour
   * uniforms as the package's colors override (see ziaImgRetint).
   *
   * The loader churns at once. reveal() snapshots a canvas, ImageBitmap or
   * loaded <img> and dissolves into it as the package's
   * triggerReveal({ hold: "manual" }) does (object-fit: cover), then holds it;
   * hide() fades back to the churn as triggerHide() does. A host that can't
   * hold children (canvas, img, video...) gets the loader as its next sibling,
   * laid over its box; any other host gets it appended inside, filling it.
   */

  const ZIA_IMG_NS = "http://www.w3.org/1999/xhtml";

  // The presets, verbatim from the package (dist: mt / vt / xt)
  const ZIA_IMG_PRESETS = {
    "pixels-organic": {
      name: "pixels-organic",
      modes: {
        dark: {
          theme: "dark",
          effectIndex: 22,
          colors: ["#0f0f0f", "#4a4949", "#b9b9b9", "#0f0f0f", "#d8d8d8", "#0f0f0f", "#2f2f2f"],
          alphas: [1, 1, 1, 1, 1, 1, 1],
          cardBg: "#0f0f0f",
          dotMode: 1,
          pixelConfig: {
            cellSize: 0.22,
            gap: 0.14,
            dotOpacity: 0.68,
            dotSize: 0.8,
            dotSoftness: 0.1,
            hlScale: 0.8,
            fillOpacity: 0.44,
            edgeFade: 24,
            fadeStr: 1
          },
          dotConfig: {
            cellSize: 0.58,
            gap: 0,
            dotOpacity: 1,
            dotSize: 0.22,
            dotSoftness: 0.1,
            hlScale: 0.26,
            fillOpacity: 0,
            edgeFade: 34,
            fadeStr: 0.34
          },
          direction: 0,
          speed: 0.3,
          intensity: 1,
          scale: 1,
          softness: 0.76,
          distortion: 0.3,
          complexity: 0.2,
          shape: 0.52,
          blur: 1,
          highlight: 0.2,
          vignette: 0.26,
          vigOpacity: 1,
          shaderOpacity: 1,
          revealConfig: {
            duration: 3,
            easing: "easeOutCubic",
            maskShape: "shaderColor4",
            softness: 0.5,
            blur: 0,
            pixDuration: 2.65,
            pixEasing: "easeOutCubic",
            dotDuration: 2.05,
            dotEasing: "easeOutCubic"
          },
          effect: "Chromium Flow"
        },
        light: {
          theme: "light",
          effectIndex: 22,
          colors: ["#e3e3e3", "#ffffff", "#f5f5f5", "#f5f5f5", "#080808", "#f5f5f5", "#f5f5f5"],
          alphas: [1, 1, 1, 1, 1, 1, 1],
          cardBg: "#f5f5f5",
          dotMode: 1,
          pixelConfig: {
            cellSize: 0.22,
            gap: 0.14,
            dotOpacity: 0.68,
            dotSize: 0.8,
            dotSoftness: 0.1,
            hlScale: 0.8,
            fillOpacity: 0.18,
            edgeFade: 20,
            fadeStr: 1
          },
          dotConfig: {
            cellSize: 0.58,
            gap: 0,
            dotOpacity: 1,
            dotSize: 0.22,
            dotSoftness: 0.1,
            hlScale: 0.26,
            fillOpacity: 0,
            edgeFade: 34,
            fadeStr: 0.34
          },
          direction: 25,
          speed: 0.3,
          intensity: 0.85,
          scale: 1,
          softness: 0.76,
          distortion: 0.3,
          complexity: 0.2,
          shape: 0.52,
          blur: 1,
          highlight: 0.7,
          vignette: 0,
          vigOpacity: 0,
          shaderOpacity: 1,
          revealConfig: {
            duration: 3,
            easing: "easeOutCubic",
            maskShape: "shaderColor4",
            softness: 0.5,
            blur: 0,
            pixDuration: 2.55,
            pixEasing: "easeOutCubic",
            dotDuration: 2.05,
            dotEasing: "easeOutCubic"
          },
          effect: "Chromium Flow"
        }
      }
    },
    "pixels-mechanic": {
      name: "pixels-mechanic",
      modes: {
        dark: {
          theme: "dark",
          effectIndex: 11,
          colors: ["#949494", "#2d2d2d", "#333333", "#3a3a3a", "#0b0b0b", "#060606", "#2f2f2f"],
          alphas: [1, 1, 1, 1, 1, 1, 1],
          cardBg: "#0f0f0f",
          dotMode: 1,
          pixelConfig: {
            cellSize: 0.22,
            gap: 0.14,
            dotOpacity: 0.68,
            dotSize: 0.8,
            dotSoftness: 0.1,
            hlScale: 0.8,
            fillOpacity: 0.44,
            edgeFade: 24,
            fadeStr: 1
          },
          dotConfig: {
            cellSize: 0.58,
            gap: 0,
            dotOpacity: 1,
            dotSize: 0.22,
            dotSoftness: 0.1,
            hlScale: 0.26,
            fillOpacity: 0,
            edgeFade: 34,
            fadeStr: 0.34
          },
          direction: 0,
          speed: 0.7,
          intensity: 1,
          scale: 1.4,
          softness: 0.76,
          distortion: 0.3,
          flicker: 0.5,
          complexity: 0.2,
          shape: 0.52,
          blur: 1,
          highlight: 0.32,
          vignette: 0.26,
          vigOpacity: 1,
          shaderOpacity: 1,
          revealConfig: {
            duration: 3,
            easing: "easeOutCubic",
            maskShape: "shaderColor4",
            softness: 0.5,
            blur: 0,
            pixDuration: 2.65,
            pixEasing: "easeOutCubic",
            dotDuration: 2.05,
            dotEasing: "easeOutCubic"
          },
          effect: "Nebula"
        },
        light: {
          theme: "light",
          effectIndex: 11,
          colors: ["#e0e0e0", "#fdfdfd", "#f2f2f2", "#0a0a0a", "#dcdcdc", "#f5f5f5", "#f5f5f5"],
          alphas: [1, 1, 1, 1, 1, 1, 1],
          cardBg: "#f5f5f5",
          dotMode: 1,
          pixelConfig: {
            cellSize: 0.22,
            gap: 0.14,
            dotOpacity: 0.68,
            dotSize: 0.8,
            dotSoftness: 0.1,
            hlScale: 0.8,
            fillOpacity: 0.18,
            edgeFade: 20,
            fadeStr: 1
          },
          dotConfig: {
            cellSize: 0.58,
            gap: 0,
            dotOpacity: 1,
            dotSize: 0.22,
            dotSoftness: 0.1,
            hlScale: 0.26,
            fillOpacity: 0,
            edgeFade: 34,
            fadeStr: 0.34
          },
          direction: 25,
          speed: 0.55,
          intensity: 0.85,
          scale: 0.9,
          softness: 0.76,
          distortion: 0.3,
          flicker: 0.5,
          complexity: 0.2,
          shape: 0.52,
          blur: 1,
          highlight: 0.92,
          vignette: 0,
          vigOpacity: 0,
          shaderOpacity: 1,
          revealConfig: {
            duration: 3,
            easing: "easeOutCubic",
            maskShape: "shaderColor3",
            softness: 0.5,
            blur: 0,
            pixDuration: 2.6,
            pixEasing: "easeOutCubic",
            dotDuration: 2.05,
            dotEasing: "easeOutCubic"
          },
          effect: "Nebula"
        }
      }
    },
    "sweep-gradient": {
      name: "sweep-gradient",
      modes: {
        dark: {
          theme: "dark",
          effectIndex: 25,
          colors: ["#0f0f0f", "#0f0f0f", "#282828", "#3a3a3a", "#525252", "#0f0f0f", "#0f0f0f"],
          alphas: [1, 1, 1, 1, 1, 1, 1],
          cardBg: "#0f0f0f",
          dotMode: 1,
          pixelConfig: {
            cellSize: 0.22,
            gap: 0.14,
            dotOpacity: 0.68,
            dotSize: 0.8,
            dotSoftness: 0.1,
            hlScale: 0.8,
            fillOpacity: 0.44,
            edgeFade: 24,
            fadeStr: 1
          },
          dotConfig: {
            cellSize: 0.58,
            gap: 0,
            dotOpacity: 1,
            dotSize: 0.22,
            dotSoftness: 0.1,
            hlScale: 0.26,
            fillOpacity: 0,
            edgeFade: 34,
            fadeStr: 0.34
          },
          direction: 0,
          speed: 2.65,
          intensity: 1,
          scale: 1,
          softness: 0.76,
          distortion: 0.3,
          flicker: 0.5,
          complexity: 0.2,
          shape: 0.52,
          blur: 1,
          highlight: 0.32,
          vignette: 0.26,
          vigOpacity: 1,
          shaderOpacity: 1,
          sweepEase: 1,
          revealConfig: {
            duration: 3,
            easing: "easeOutCubic",
            maskShape: "gradientSweep",
            softness: 0.5,
            blur: 0,
            pixDuration: 2.65,
            pixEasing: "easeOutCubic",
            dotDuration: 2.05,
            dotEasing: "easeOutCubic"
          },
          effect: "Gradient Sweep"
        },
        light: {
          theme: "light",
          effectIndex: 25,
          colors: ["#f5f5f5", "#f5f5f5", "#ededed", "#eaeaea", "#d2d2d2", "#f5f5f5", "#f5f5f5"],
          alphas: [1, 1, 1, 1, 1, 1, 1],
          cardBg: "#f5f5f5",
          dotMode: 1,
          pixelConfig: {
            cellSize: 0.22,
            gap: 0.14,
            dotOpacity: 0.68,
            dotSize: 0.8,
            dotSoftness: 0.1,
            hlScale: 0.8,
            fillOpacity: 0.18,
            edgeFade: 20,
            fadeStr: 1
          },
          dotConfig: {
            cellSize: 0.58,
            gap: 0,
            dotOpacity: 1,
            dotSize: 0.22,
            dotSoftness: 0.1,
            hlScale: 0.26,
            fillOpacity: 0,
            edgeFade: 34,
            fadeStr: 0.34
          },
          direction: 0,
          speed: 2.65,
          intensity: 0.85,
          scale: 1,
          softness: 0.76,
          distortion: 0.3,
          flicker: 0.5,
          complexity: 0.2,
          shape: 0.52,
          blur: 1,
          highlight: 0.92,
          vignette: 0,
          vigOpacity: 0,
          shaderOpacity: 1,
          sweepEase: 1,
          revealConfig: {
            duration: 3,
            easing: "easeOutCubic",
            maskShape: "gradientSweep",
            softness: 0.5,
            blur: 0,
            pixDuration: 2.6,
            pixEasing: "easeOutCubic",
            dotDuration: 2.05,
            dotEasing: "easeOutCubic"
          },
          effect: "Gradient Sweep"
        }
      }
    },
  };

  // The shaders, verbatim from the package (dist: bt / _t)
  const ZIA_IMG_VERT = /* glsl */ `
  void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
  const ZIA_IMG_FRAG = /* glsl */ `
  uniform vec2 u_resolution;
  uniform float u_dpr;
  uniform float u_time;
  uniform vec3 u_color1, u_color2, u_color3, u_color4, u_color5, u_color6, u_color7, u_cardBg;
  uniform float u_alpha1, u_alpha2, u_alpha3, u_alpha4, u_alpha5, u_alpha6, u_alpha7;
  uniform float u_speed, u_intensity, u_scale, u_direction;
  uniform float u_softness, u_distortion, u_complexity, u_shape, u_flicker;
  uniform float u_vignette, u_vigOpacity, u_blur, u_highlight, u_shaderOpacity;
  uniform float u_cellSize, u_gap, u_dotSize, u_dotSoftness, u_dotOpacity, u_hlScale, u_fillOpacity, u_edgeFade, u_fadeStr;
  uniform float u_dotMode;
  uniform int u_effect;
  uniform int u_sweepEase;

  // Reference card edge length (CSS px) at which the original preset cellSize
  // gives the canonical cell count. Cell PIXEL size stays constant across card
  // sizes by scaling gridSize proportionally to (currentCssDim / REF_DIM).
  const float REF_DIM = 320.0;

  /** Anisotropic cell count: returns the number of cells along x and y so that
   *  each cell stays SQUARE in screen space regardless of the card's aspect
   *  ratio. A 600×300 card gets twice as many cells horizontally as vertically;
   *  cells stay the same physical size as on a 300×300 card. */
  vec2 gridCounts(float baseCount) {
    vec2 cssRes = u_resolution / max(u_dpr, 0.0001);
    return max(vec2(2.0), floor(baseCount * cssRes / REF_DIM));
  }

  vec3 mod289(vec3 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
  vec2 mod289v2(vec2 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289((x * 34.0 + 1.0) * x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289v2(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m * m; m = m * m;
    vec3 x_ = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x_) - 0.5;
    vec3 ox = floor(x_ + 0.5);
    vec3 a0 = x_ - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  float fbm(vec2 p, float oct) {
    float val = 0.0, amp = 0.5;
    int n = int(oct);
    for (int i = 0; i < 4; i++) {
      if (i >= n) break;
      val += amp * snoise(p);
      p *= 2.0;
      amp *= 0.5;
    }
    return val;
  }

  float nfbm(vec2 p) { return fbm(p, 2.0 + u_complexity * 2.0); }

  vec3 palette(float t) {
    t = clamp(t, 0.0, 1.0);
    t = t * t * (3.0 - 2.0 * t);
    float k = 64.0;
    float w1 = u_alpha1 * exp(-k * t * t);
    float w2 = u_alpha2 * exp(-k * (t - 0.25) * (t - 0.25));
    float w3 = u_alpha3 * exp(-k * (t - 0.5)  * (t - 0.5));
    float w4 = u_alpha4 * exp(-k * (t - 0.75) * (t - 0.75));
    float w5 = u_alpha5 * exp(-k * (t - 1.0)  * (t - 1.0));
    float total = w1 + w2 + w3 + w4 + w5 + 0.0001;
    return (u_color1*w1 + u_color2*w2 + u_color3*w3 + u_color4*w4 + u_color5*w5) / total;
  }

  vec3 softBlend(float a, float b, float c) {
    a = clamp(a, 0.0, 1.0); a *= a;
    b = clamp(b, 0.0, 1.0); b *= b;
    c = clamp(c, 0.0, 1.0); c *= c;
    float d = clamp(a * 0.7 + c * 0.3, 0.0, 1.0); d *= d;
    float e = clamp(b * 0.5 + c * 0.5, 0.0, 1.0); e *= e;
    a *= u_alpha1; b *= u_alpha2; c *= u_alpha3; d *= u_alpha4; e *= u_alpha5;
    float total = a + b + c + d + e;
    float floorW = max(0.001 - total, 0.0);
    vec3 fallback = (u_color1 + u_color2 + u_color3 + u_color4 + u_color5) * 0.2;
    return (u_color1 * a + u_color2 * b + u_color3 * c + u_color4 * d + u_color5 * e + fallback * floorW) / (total + floorW);
  }

  vec2 warp(vec2 p, float t) {
    float str = u_distortion * 2.0;
    return vec2(
      nfbm(p + vec2(t * 0.1, 0.0)),
      nfbm(p + vec2(0.0, t * 0.12) + 5.0)
    ) * str;
  }

  float sweepEase(float x) {
    if (u_sweepEase == 1) return x * x * (3.0 - 2.0 * x);
    if (u_sweepEase == 2) {
      float p = 1.0 - x;
      return 1.0 - p * p * p;
    }
    if (u_sweepEase == 3) {
      return x < 0.5 ? 4.0 * x * x * x : 1.0 - pow(-2.0 * x + 2.0, 3.0) * 0.5;
    }
    if (u_sweepEase == 4) return 1.0 - pow(2.0, -10.0 * x) * (1.0 - x);
    return x;
  }

  float blob(vec2 p, vec2 center, float radius) {
    float r = radius * (0.5 + u_shape * 0.8);
    float soft = 0.05 + u_softness * 0.4;
    return smoothstep(r + soft, r - soft * 0.5, length(p - center));
  }

  vec3 computeEffect(vec2 uv, float aspect, float t, float dist, float soft, float cpx, float shp) {
    vec2 p = (uv - 0.5) * u_scale;
    p.x *= aspect;
    p += vec2(cos(u_direction), sin(u_direction)) * t * 0.15;
    vec3 col = vec3(0.0);

    if (u_effect == 0) {
      float val = sin(p.x * 3.0 + t) * 0.5 + 0.5;
      val += sin(p.y * 2.0 + t * 0.7) * 0.3;
      val += sin((p.x + p.y) * (1.0 + cpx * 3.0) - t * 0.5) * 0.2;
      vec2 w = warp(p, t);
      val += (w.x + w.y) * 0.15;
      col = palette(clamp(val * u_intensity, 0.0, 1.0));

    } else if (u_effect == 1) {
      float freq = 3.0 + cpx * 8.0;
      float val = 0.0;
      val += sin(p.x * freq + t);
      val += sin(p.y * freq + t * 1.3);
      val += sin((p.x + p.y) * freq * 0.7 + t * 0.7);
      val += sin(length(p) * freq * 0.8 - t * 1.5);
      vec2 w = warp(p, t);
      val += (w.x + w.y) * dist;
      val = val * 0.2 * u_intensity + 0.5;
      col = palette(clamp(val, 0.0, 1.0));

    } else if (u_effect == 2) {
      vec2 q = vec2(nfbm(p + t * 0.3), nfbm(p + vec2(5.2, 1.3) + t * 0.2));
      float val = nfbm(p + q * (1.0 + dist * 3.0) + t * 0.1);
      val = val * u_intensity * 0.5 + 0.5;
      col = palette(clamp(val, 0.0, 1.0));

    } else if (u_effect == 3) {
      float d = length(p);
      float val = sin(d * (3.0 + cpx * 6.0) - t * 2.0) * 0.5 + 0.5;
      val *= exp(-d * (0.3 + shp * 1.0));
      val += sin(atan(p.y, p.x) * (1.5 + cpx * 2.0) + t) * 0.15;
      col = palette(clamp(val * u_intensity, 0.0, 1.0));

    } else if (u_effect == 4) {
      vec2 q = vec2(nfbm(p * (0.5 + shp * 0.6) + vec2(t * 0.12, t * 0.08)), nfbm(p * (0.5 + shp * 0.6) + vec2(t * 0.09, -t * 0.11)));
      vec2 r = vec2(nfbm(p + q * (1.0 + dist * 2.0) + vec2(1.7, 9.2) + t * 0.06), nfbm(p + q * (1.0 + dist * 2.0) + vec2(8.3, 2.8) - t * 0.08));
      float val = nfbm(p + r * 2.0);
      float lo = -0.3 - soft * 0.5;
      float hi = 0.5 + soft * 0.5;
      val = smoothstep(lo, hi, val * u_intensity);
      col = palette(val);

    } else if (u_effect == 5) {
      float n1 = nfbm(vec2(p.x * 0.5 + t * 0.15, p.y * (1.0 + cpx * 1.5)));
      float n2 = nfbm(vec2(p.x * 0.3 - t * 0.1, p.y * (0.8 + cpx * 1.0) + 3.0));
      float band = sin(p.y * 3.0 + n1 * (1.0 + dist * 2.0) + t * 0.3) * 0.5 + 0.5;
      float shimmer = sin(p.y * 4.0 + n2 * 1.5 - t * 0.2) * 0.5 + 0.5;
      float w1 = band * (0.5 + 0.5 * sin(p.x * 1.5 + t * 0.2 + n1));
      float w2 = shimmer * (0.5 + 0.5 * cos(p.x * 1.0 - t * 0.15 + n2));
      float w3 = nfbm(p * 0.5 + t * 0.05) * 0.5 + 0.5;
      col = softBlend(w1 * u_intensity, w2 * u_intensity, w3 * 0.6 * u_intensity);

    } else if (u_effect == 6) {
      vec2 wp = warp(p * 1.2, t);
      float blobR = 0.15 + shp * 0.2;
      float b1 = blob(p, vec2(sin(t * 0.3) * 0.3, cos(t * 0.2) * 0.4) + wp * 0.2, blobR);
      float b2 = blob(p, vec2(cos(t * 0.25) * 0.4, sin(t * 0.35) * 0.3 - 0.2) + wp * 0.15, blobR * 1.2);
      float b3 = blob(p, vec2(-sin(t * 0.2) * 0.3, -cos(t * 0.3) * 0.35) + wp * 0.18, blobR);
      float bg = nfbm(p * 0.5 + t * 0.05) * 0.3 + 0.15;
      col = softBlend((b1 + bg * 0.5) * u_intensity, (b2 + bg * 0.3) * u_intensity, (b3 + bg * 0.4) * u_intensity);

    } else if (u_effect == 7) {
      float sz = 0.4 + shp * 0.6;
      float sigma = sz * sz * 2.0;
      vec2 a1 = vec2(-0.45 + sin(t * 0.07) * 0.06, 0.45 + cos(t * 0.09) * 0.05);
      vec2 a2 = vec2(0.45 + cos(t * 0.08) * 0.06, 0.45 + sin(t * 0.06) * 0.05);
      vec2 a3 = vec2(0.0 + sin(t * 0.05) * 0.1, 0.0 + cos(t * 0.07) * 0.1);
      vec2 a4 = vec2(-0.4 + cos(t * 0.06) * 0.07, -0.3 + sin(t * 0.08) * 0.06);
      vec2 a5 = vec2(0.4 + sin(t * 0.07) * 0.06, -0.4 + cos(t * 0.05) * 0.06);
      float g1 = exp(-dot(p - a1, p - a1) / sigma);
      float g2 = exp(-dot(p - a2, p - a2) / sigma);
      float g3 = exp(-dot(p - a3, p - a3) / sigma);
      float g4 = exp(-dot(p - a4, p - a4) / sigma);
      float g5 = exp(-dot(p - a5, p - a5) / sigma);
      float nudge = dist > 0.01 ? snoise(p * (0.5 + cpx) + t * 0.04) * dist * 0.08 : 0.0;
      float w1 = (g1 + g4 + nudge) * u_intensity;
      float w2 = (g2 + g5 + nudge) * u_intensity;
      float w3 = (g3 + nudge) * u_intensity;
      col = softBlend(w1, w2, w3);

    } else if (u_effect == 8) {
      vec2 w1 = vec2(nfbm(p * (0.7 + cpx * 0.5) + t * 0.1), nfbm(p * (0.7 + cpx * 0.5) + vec2(3.3, 7.7) + t * 0.08));
      vec2 w2 = vec2(nfbm(p * 0.6 + w1 * (1.0 + dist) + t * 0.06), nfbm(p * 0.6 + w1 * (1.0 + dist) + vec2(1.7, 4.2) - t * 0.07));
      float f1 = nfbm(p + w2 * 1.5);
      float f2 = nfbm(p + w2 * 1.5 + vec2(4.1, 2.3));
      float f3 = nfbm(p + w2 * 1.5 + vec2(7.5, 6.1));
      col = softBlend((f1 * 0.5 + 0.5) * u_intensity, (f2 * 0.5 + 0.5) * u_intensity, (f3 * 0.5 + 0.5) * u_intensity);

    } else if (u_effect == 9) {
      vec2 sw = vec2(sin(p.y * 2.0 + t * 0.3) * 0.15 + snoise(p * 1.5 + t * 0.15) * dist * 0.3, cos(p.x * 1.8 + t * 0.25) * 0.15 + snoise(p * 1.5 + vec2(5.0, 0.0) + t * 0.12) * dist * 0.3);
      vec2 wp = p + sw;
      float caustic = (snoise(wp * (1.5 + cpx * 2.0) + t * 0.2) * 0.5 + 0.5) + (snoise(wp * (2.0 + cpx * 2.0) - t * 0.15) * 0.5 + 0.5) * 0.5;
      caustic = caustic / 1.5;
      float depth = nfbm(vec2(p.x * 0.3, p.y * 0.8) + t * 0.05) * 0.5 + 0.5;
      col = softBlend(depth * u_intensity, (1.0 - depth) * u_intensity, caustic * u_intensity);

    } else if (u_effect == 10) {
      float angle = 0.6 + shp * 1.2;
      float ca = cos(angle), sa = sin(angle);
      vec2 rp = vec2(p.x * ca - p.y * sa, p.x * sa + p.y * ca);
      float n1 = nfbm(rp * 0.8 + t * 0.12) * (1.0 + dist * 2.0);
      float n2 = nfbm(rp * 0.6 + vec2(3.0, 0.0) + t * 0.1) * (1.0 + dist * 1.5);
      float wave = sin(rp.x * (2.0 + cpx * 2.0) + n1 + t * 0.3);
      float wave2 = sin(rp.x * (1.5 + cpx * 1.5) + n2 - t * 0.2);
      float ribbon1 = exp(-2.0 * (rp.y - wave * 0.35) * (rp.y - wave * 0.35)) * u_intensity;
      float ribbon2 = exp(-2.0 * (rp.y - 0.15 - wave2 * 0.3) * (rp.y - 0.15 - wave2 * 0.3)) * u_intensity;
      float bg = nfbm(p * 0.4 + t * 0.03) * 0.5 + 0.5;
      col = softBlend(ribbon1, ribbon2, bg * 0.5 * u_intensity);

    } else if (u_effect == 11) {
      vec2 q = vec2(nfbm(p * 0.5 + vec2(t * 0.05, 0.0)), nfbm(p * 0.5 + vec2(0.0, t * 0.07)));
      vec2 r = vec2(nfbm(p * 0.6 + q * (1.0 + dist * 1.5) + vec2(1.7, 9.2) + t * 0.03), nfbm(p * 0.6 + q * (1.0 + dist * 1.5) + vec2(8.3, 2.8) + t * 0.04));
      float f = nfbm(p + r * 1.5);
      float f2 = nfbm(p * 0.7 + r + vec2(3.0, 7.0));
      col = softBlend((f * 0.5 + 0.5) * u_intensity, (f2 * 0.5 + 0.5) * u_intensity, (nfbm(p * 0.4 - t * 0.02) * 0.5 + 0.5) * u_intensity);

    } else if (u_effect == 12) {
      vec2 w = warp(p * 0.5, t * 0.7);
      float fold1 = sin(p.x * (1.5 + cpx * 2.0) + w.x * 1.5 + t * 0.2) * 0.5 + 0.5;
      float fold2 = sin(p.y * (1.2 + cpx * 1.5) + w.y * 1.5 - t * 0.15) * 0.5 + 0.5;
      float fold3 = sin((p.x - p.y) * (0.8 + cpx * 0.8) + (w.x + w.y) + t * 0.1) * 0.5 + 0.5;
      col = softBlend(fold1 * u_intensity, fold2 * u_intensity, fold3 * 0.7 * u_intensity);

    } else if (u_effect == 13) {
      float spread = 0.25 + shp * 0.35;
      vec2 w = warp(p, t * 0.5);
      vec2 c1 = vec2(sin(t * 0.08) * spread, cos(t * 0.11) * spread) + w * 0.15;
      vec2 c2 = vec2(cos(t * 0.09) * spread * 1.3, sin(t * 0.07) * spread) + w * 0.12;
      vec2 c3 = vec2(-sin(t * 0.1) * spread, -cos(t * 0.08) * spread * 1.2) + w * 0.1;
      float falloff = 0.3 + soft * 0.7;
      float d1 = 1.0 - smoothstep(0.0, falloff, length(p - c1 + w * dist * 0.3));
      float d2 = 1.0 - smoothstep(0.0, falloff, length(p - c2 + w * dist * 0.25));
      float d3 = 1.0 - smoothstep(0.0, falloff, length(p - c3 + w * dist * 0.2));
      float detail = nfbm(p * 2.0 + t * 0.05) * cpx * 0.3;
      col = softBlend((d1 + detail) * u_intensity, (d2 + detail) * u_intensity, (d3 + detail) * u_intensity);

    } else if (u_effect == 14) {
      vec2 w = warp(p * 0.6, t * 0.6);
      float angle = atan(p.y + w.y * dist, p.x + w.x * dist);
      float radius = length(p);
      float field1 = sin(angle * (2.0 + cpx * 4.0) + radius * (3.0 + cpx * 3.0) + t * 0.4 + nfbm(p + t * 0.1) * dist * 2.0) * 0.5 + 0.5;
      float field2 = sin(angle * (1.5 + cpx * 2.5) - radius * 2.0 - t * 0.3 + nfbm(p * 0.6 + t * 0.08) * dist * 1.5) * 0.5 + 0.5;
      float bg = nfbm(p * 0.3 + t * 0.03) * 0.5 + 0.5;
      col = softBlend(field1 * u_intensity, field2 * u_intensity, bg * 0.5 * u_intensity);

    } else if (u_effect == 15) {
      vec2 drift = vec2(t * 0.06, t * 0.03);
      float c1 = nfbm((p + drift) * (0.4 + cpx * 0.5)) * 0.5 + 0.5;
      float c2 = nfbm((p + drift + vec2(3.7, 1.2)) * (0.35 + cpx * 0.4)) * 0.5 + 0.5;
      float c3 = nfbm((p + drift + vec2(7.1, 4.5)) * (0.3 + cpx * 0.35)) * 0.5 + 0.5;
      vec2 w = warp(p * 0.2, t * 0.4);
      c1 += w.x * dist * 0.3;
      c2 += w.y * dist * 0.25;
      col = softBlend(c1 * u_intensity, c2 * u_intensity, c3 * u_intensity);

    } else if (u_effect == 16) {
      vec2 w = warp(vec2(p.x * 0.3, p.y * 0.6), t * 0.5);
      float c1 = sin(p.x * (1.5 + cpx * 2.0) + w.x * (1.0 + dist * 2.0) + t * 0.15) * 0.5 + 0.5;
      float c2 = sin(p.x * (1.0 + cpx * 1.5) + w.y * (1.0 + dist * 1.5) - t * 0.12 + 2.0) * 0.5 + 0.5;
      float c3 = sin(p.x * (0.8 + cpx * 1.0) + (w.x + w.y) * 0.5 * (1.0 + dist) + t * 0.08 + 4.0) * 0.5 + 0.5;
      float fade = nfbm(vec2(p.x * 0.3, p.y * 0.5) + t * 0.03) * 0.5 + 0.5;
      col = softBlend(c1 * fade * u_intensity, c2 * fade * u_intensity, c3 * (1.0 - fade * 0.4) * u_intensity * 0.7);

    } else if (u_effect == 17) {
      vec2 w = warp(p * 0.8, t * 0.6);
      vec2 w2 = warp(p * 0.5 + w * 0.4, t * 0.4);
      float r1 = (snoise((p + w * dist * 0.5) * (1.5 + cpx * 2.0) + t * 0.1) * 0.5 + 0.5) * u_intensity;
      float r2 = (snoise((p + w2 * dist * 0.4) * (1.2 + cpx * 1.5) + t * 0.08 + 3.0) * 0.5 + 0.5) * u_intensity;
      float r3 = (snoise((p + (w + w2) * dist * 0.3) * (0.8 + cpx * 1.0) - t * 0.06 + 7.0) * 0.5 + 0.5) * u_intensity;
      col = softBlend(r1, r2, r3);

    } else if (u_effect == 18) {
      vec2 w = warp(p * 0.5, t * 0.5);
      float blobSize = 0.2 + shp * 0.3;
      float total1 = 0.0, total2 = 0.0;
      for (int i = 0; i < 5; i++) {
        float fi = float(i);
        vec2 c1 = vec2(sin(t * 0.1 + fi * 2.1) * 0.4, cos(t * 0.13 + fi * 1.7) * 0.35) + w * dist * 0.15;
        vec2 c2 = vec2(cos(t * 0.12 + fi * 1.9) * 0.35, sin(t * 0.09 + fi * 2.3) * 0.4) + w * dist * 0.12;
        total1 += blobSize * blobSize / (dot(p - c1, p - c1) + 0.02);
        total2 += blobSize * blobSize / (dot(p - c2, p - c2) + 0.02);
      }
      total1 = clamp(total1 * 0.25, 0.0, 1.0);
      total2 = clamp(total2 * 0.25, 0.0, 1.0);
      float total3 = nfbm(p + w * dist * 0.3 + t * 0.05) * 0.5 + 0.5;
      col = softBlend(total1 * u_intensity, total2 * u_intensity, total3 * 0.7 * u_intensity);

    } else if (u_effect == 19) {
      vec2 w = warp(p * 0.4, t * 0.4);
      float angle = atan(p.y, p.x);
      float radius = length(p);
      float s1 = sin(angle * (1.5 + cpx * 2.0) + radius * (3.0 + cpx * 3.0) + t * 0.3 + w.x * dist * 1.5) * 0.5 + 0.5;
      float s2 = sin(angle * (1.2 + cpx * 1.5) - radius * (2.5 + cpx * 2.5) - t * 0.25 + w.y * dist * 1.5 + 1.5) * 0.5 + 0.5;
      float s3 = sin((angle + 3.14) * (0.8 + cpx) + radius * (2.0 + cpx * 2.0) + t * 0.15 + (w.x + w.y) * dist) * 0.5 + 0.5;
      float fade = exp(-radius * (0.5 - shp * 0.3));
      col = softBlend(s1 * fade * u_intensity, s2 * fade * u_intensity, s3 * fade * 0.7 * u_intensity);

    } else if (u_effect == 20) {
      vec2 w = warp(p * 0.5, t * 0.4);
      vec2 wp = p + w * (0.4 + dist * 0.6);
      float scale = 0.6 + cpx * 0.8;
      float h  = nfbm(wp * scale + t * 0.08);
      float eps = 0.06;
      float hx = nfbm((wp + vec2(eps, 0.0)) * scale + t * 0.08) - h;
      float hy = nfbm((wp + vec2(0.0, eps)) * scale + t * 0.08) - h;
      vec3 n = normalize(vec3(-hx * 6.0, -hy * 6.0, 1.0));
      vec3 lightDir = normalize(vec3(0.55, 0.65, 0.8));
      float light = max(dot(n, lightDir), 0.0);
      float spec = pow(light, 6.0 + shp * 26.0);
      float diffuse = light * 0.6 + 0.35;
      float fres = pow(1.0 - max(n.z, 0.0), 2.0);
      float w1 = (diffuse + spec * 0.5) * u_intensity;
      float w2 = (h * 0.5 + 0.5 + spec * 0.3 + fres * 0.3) * u_intensity;
      float w3 = (spec * 1.4 + fres * 0.5) * u_intensity;
      col = softBlend(w1, w2, w3);

    } else if (u_effect == 21) {
      vec2 w = warp(p * 0.4, t * 0.3);
      float angle = 0.2 + shp * 1.3;
      float ca = cos(angle), sa = sin(angle);
      vec2 rp = vec2(p.x * ca - p.y * sa, p.x * sa + p.y * ca);
      float band = sin(rp.y * (3.0 + cpx * 5.0) + w.x * (1.0 + dist * 2.5) + t * 0.35);
      float ridge = 1.0 - abs(band);
      ridge = pow(ridge, 5.0 + shp * 10.0);
      float band2 = sin(rp.y * (2.0 + cpx * 3.0) + w.y * (0.8 + dist * 2.0) - t * 0.22 + 1.4);
      float ridge2 = 1.0 - abs(band2);
      ridge2 = pow(ridge2, 3.0 + shp * 8.0);
      float bg = nfbm(p * 0.45 + t * 0.05) * 0.5 + 0.5;
      float w1 = (ridge * 1.4 + bg * 0.25) * u_intensity;
      float w2 = (ridge2 * 1.0 + bg * 0.45) * u_intensity;
      float w3 = (ridge * 0.5 + ridge2 * 0.5) * u_intensity * 0.8;
      col = softBlend(w1, w2, w3);

    } else if (u_effect == 22) {
      vec2 w  = warp(p * 0.7, t * 0.5);
      vec2 w2 = warp(p * 0.4 + w * 0.3, t * 0.3);
      vec2 wp = p + w * (0.4 + dist * 0.6);
      float n1 = snoise(wp * (1.4 + cpx * 1.6) + t * 0.14);
      float n2 = snoise((wp + w2 * dist * 0.4) * (2.0 + cpx * 2.0) + vec2(3.0, 7.0) - t * 0.1);
      float ridge1 = 1.0 - abs(n1);
      ridge1 = pow(ridge1, 5.0 + shp * 12.0);
      float ridge2 = 1.0 - abs(n2);
      ridge2 = pow(ridge2, 4.0 + shp * 10.0);
      float base = (n1 + n2) * 0.25 + 0.5;
      float w1 = (base * 0.6 + ridge1 * 1.2) * u_intensity;
      float w2c = ((1.0 - base) * 0.6 + ridge2 * 1.0) * u_intensity;
      float w3 = (ridge1 * 0.8 + ridge2 * 0.6) * u_intensity;
      col = softBlend(w1, w2c, w3);

    } else if (u_effect == 23) {
      float angle = 0.1 + shp * 1.4;
      float ca = cos(angle), sa = sin(angle);
      vec2 rp = vec2(p.x * ca - p.y * sa, p.x * sa + p.y * ca);
      vec2 stretch = vec2(rp.x * (5.0 + cpx * 4.0), rp.y * (0.35 + cpx * 0.3));
      vec2 sw = warp(stretch * 0.3, t * 0.3) * dist;
      float n1 = snoise(stretch + sw + t * 0.08);
      float n2 = snoise(stretch * 1.4 + vec2(2.0, 5.0) + sw - t * 0.06);
      float streak = 1.0 - abs(n1);
      streak = pow(streak, 6.0 + shp * 12.0);
      float streak2 = 1.0 - abs(n2);
      streak2 = pow(streak2, 4.0 + shp * 8.0);
      float bg = nfbm(p * 0.4 + t * 0.04) * 0.4 + 0.4;
      float w1 = (streak * 1.4 + bg * 0.3) * u_intensity;
      float w2 = (streak2 * 0.9 + bg * 0.5) * u_intensity;
      float w3 = (streak * 0.7 + streak2 * 0.4) * u_intensity * 0.8;
      col = softBlend(w1, w2, w3);

    } else if (u_effect == 24) {
      vec2 w1 = warp(p * 0.55, t * 0.4);
      vec2 w2 = warp(p * 0.7 + w1 * 0.4, t * 0.3);
      vec2 wp = p + (w1 + w2) * (0.4 + dist * 0.7);

      float scale = 0.65 + cpx * 0.7;
      float n1 = nfbm(wp * scale + vec2(0.0, 0.0) + t * 0.10);
      float n2 = nfbm(wp * scale + vec2(3.7, 5.2) - t * 0.07);
      float n3 = nfbm(wp * scale + vec2(7.1, 2.3) + t * 0.06);
      float n4 = nfbm(wp * scale + vec2(1.8, 8.4) - t * 0.08);
      float n5 = nfbm(wp * scale + vec2(4.9, 1.1) + t * 0.05);
      float n6 = nfbm(wp * scale + vec2(6.3, 7.8) - t * 0.09);
      float n7 = nfbm(wp * scale + vec2(2.4, 4.6) + t * 0.04);

      float pw = 2.5 + shp * 5.0;
      n1 = pow(clamp(n1, 0.0, 1.0), pw);
      n2 = pow(clamp(n2, 0.0, 1.0), pw);
      n3 = pow(clamp(n3, 0.0, 1.0), pw);
      n4 = pow(clamp(n4, 0.0, 1.0), pw);
      n5 = pow(clamp(n5, 0.0, 1.0), pw);
      n6 = pow(clamp(n6, 0.0, 1.0), pw);
      n7 = pow(clamp(n7, 0.0, 1.0), pw);

      float intens = 0.5 + u_intensity * 0.9;
      float a1 = n1 * u_alpha1 * intens;
      float a2 = n2 * u_alpha2 * intens;
      float a3 = n3 * u_alpha3 * intens;
      float a4 = n4 * u_alpha4 * intens;
      float a5 = n5 * u_alpha5 * intens;
      float a6 = n6 * u_alpha6 * intens;
      float a7 = n7 * u_alpha7 * intens;
      float total = a1 + a2 + a3 + a4 + a5 + a6 + a7 + 0.001;
      col = (u_color1 * a1 + u_color2 * a2 + u_color3 * a3 + u_color4 * a4
           + u_color5 * a5 + u_color6 * a6 + u_color7 * a7) / total;

    } else if (u_effect == 25) {
      float d = (uv.x + (1.0 - uv.y)) * 0.5;
      float w = 0.9 / max(u_scale, 0.25);
      float cyc = t * 0.08;
      float pA = mix(-w, 1.0 + w, sweepEase(fract(cyc)));
      float pB = mix(-w, 1.0 + w, sweepEase(fract(cyc + 0.5)));
      float band = max(
        clamp(1.0 - abs(d - pA) / w, 0.0, 1.0),
        clamp(1.0 - abs(d - pB) / w, 0.0, 1.0)
      );
      float v = band * u_intensity;

      vec2 ggs = gridCounts(6.0 + u_cellSize * 74.0);
      if (u_dotMode > 1.5) {
        ggs = max(vec2(2.0), floor(ggs * (1.0 - u_gap * 0.8)));
      }
      vec2 cell = floor(uv * ggs);
      float clk = t * 1.6;
      // Wrap the stepped clock to keep sin() arguments small. u_time grows
      // unbounded over a session; on mediump-float GPUs (older Android, some
      // iOS) large hash inputs lose precision and the flicker bands/freezes.
      // mod(x, 1024) keeps the crossfade continuous across the wrap
      // (step 1023 fades into step 0, whose hash is the next s0).
      float step0 = mod(floor(clk), 1024.0);
      float step1 = mod(step0 + 1.0, 1024.0);
      float fz = smoothstep(0.0, 1.0, fract(clk));
      float cellSeed = dot(cell, vec2(127.1, 311.7));
      float r1 = fract(sin(cellSeed + step0 * 17.23) * 43758.5453);
      float r2 = fract(sin(cellSeed + step1 * 17.23) * 43758.5453);
      float rnd = mix(r1, r2, fz);
      v += (rnd - 0.5) * u_flicker * 0.9 * (0.15 + band * 0.85);

      col = palette(clamp(v, 0.0, 1.0));
    }

    return col;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    float aspect = u_resolution.x / u_resolution.y;
    float t = u_time * u_speed;
    float dist = u_distortion;
    float soft = u_softness;
    float cpx = u_complexity;
    float shp = u_shape;

    vec2 sampleUV = uv;
    if (u_dotMode > 0.5) {
      vec2 gs = gridCounts(6.0 + u_cellSize * 74.0);
      if (u_dotMode > 1.5) {
        gs = max(vec2(2.0), floor(gs * (1.0 - u_gap * 0.8)));
      }
      sampleUV = (floor(uv * gs) + vec2(0.5)) / gs;
    }

    vec3 col;
    if (u_blur < 0.01) {
      col = computeEffect(sampleUV, aspect, t, dist, soft, cpx, shp);
    } else {
      float r = u_blur * 0.02;
      col  = computeEffect(sampleUV, aspect, t, dist, soft, cpx, shp) * 0.4;
      col += computeEffect(sampleUV + vec2( r,  0.0), aspect, t, dist, soft, cpx, shp) * 0.15;
      col += computeEffect(sampleUV + vec2(-r,  0.0), aspect, t, dist, soft, cpx, shp) * 0.15;
      col += computeEffect(sampleUV + vec2( 0.0,  r), aspect, t, dist, soft, cpx, shp) * 0.15;
      col += computeEffect(sampleUV + vec2( 0.0, -r), aspect, t, dist, soft, cpx, shp) * 0.15;
    }

    vec3 baseCol = col;
    if (u_dotMode < 0.5) {
      col = pow(col, vec3(1.3));
    }

    // CSS-pixel distance to the nearest edge — keeps the vignette / edge-fade
    // bands a consistent physical width on every side of any aspect ratio.
    vec2 cssRes = u_resolution / max(u_dpr, 0.0001);
    vec2 cssCoord = uv * cssRes;
    float edgeDistPx = min(
      min(cssCoord.x, cssRes.x - cssCoord.x),
      min(cssCoord.y, cssRes.y - cssCoord.y)
    );
    float vigRangePx = 40.0 * (1.0 + u_vignette * 3.0);
    float vig = (edgeDistPx * edgeDistPx) / (vigRangePx * vigRangePx);
    vig = smoothstep(0.0, 1.0, vig);
    col *= mix(1.0, vig, u_vignette * u_vigOpacity);

    float colorAlpha = (u_alpha1 + u_alpha2 + u_alpha3 + u_alpha4 + u_alpha5) / 5.0;
    if (colorAlpha < 0.999) {
      vec3 c1d = col - u_color1, c2d = col - u_color2, c3d = col - u_color3, c4d = col - u_color4, c5d = col - u_color5;
      float prox1 = exp(-8.0 * dot(c1d, c1d));
      float prox2 = exp(-8.0 * dot(c2d, c2d));
      float prox3 = exp(-8.0 * dot(c3d, c3d));
      float prox4 = exp(-8.0 * dot(c4d, c4d));
      float prox5 = exp(-8.0 * dot(c5d, c5d));
      float pTotal = prox1 + prox2 + prox3 + prox4 + prox5 + 0.0001;
      colorAlpha = (prox1*u_alpha1 + prox2*u_alpha2 + prox3*u_alpha3 + prox4*u_alpha4 + prox5*u_alpha5) / pTotal;
    }
    float alpha = colorAlpha;

    if (u_dotMode > 0.5) {
      vec2 gridSize = gridCounts(6.0 + u_cellSize * 74.0);
      if (u_dotMode > 1.5) {
        gridSize = max(vec2(2.0), floor(gridSize * (1.0 - u_gap * 0.8)));
      }
      // cellLocal is in [0,1] within each cell. Because gridSize was chosen so
      // that cell PIXEL size is square, distance / mask math here works in
      // screen-square units even though we're operating in normalised cell uv.
      vec2 cellLocal = fract(uv * gridSize);

      float hlFactor = 0.0;
      if (u_highlight > 0.01 || u_hlScale > 0.01) {
        vec2 cellCenter = (floor(uv * gridSize) + vec2(0.5)) / gridSize;
        vec2 cp2 = (cellCenter - 0.5) * u_scale;
        cp2.x *= aspect;
        float lw = sin(cp2.x * 3.0 + t * 1.5) * 0.5 + 0.5;
        lw *= sin(cp2.y * 2.5 - t * 1.1) * 0.5 + 0.5;
        lw += (snoise(cp2 * 2.0 + t * 0.6) * 0.5 + 0.5) * 0.3;
        hlFactor = clamp(lw, 0.0, 1.0);
        hlFactor *= hlFactor;
      }

      float scaleBoost = 1.0 + smoothstep(0.2, 0.8, hlFactor) * u_hlScale * 1.2;

      float mask = 1.0;
      if (u_dotMode < 1.5) {
        float gapW = u_gap * 0.35 / scaleBoost;
        if (gapW > 0.003) {
          mask = step(gapW, cellLocal.x) * step(gapW, 1.0 - cellLocal.x)
               * step(gapW, cellLocal.y) * step(gapW, 1.0 - cellLocal.y);
        }
      } else {
        // Render the circular dot mask in screen-pixel space rather than
        // cell-local UV. We map the cell-local offset to actual pixels
        // (cellPx = u_resolution / gridSize), then apply a 1-pixel AA
        // floor to the smoothstep edge so the dot rim is crisp and
        // properly anti-aliased even at u_dotSoftness near 0. The user
        // softness slider still scales linearly on top of the floor.
        // No fwidth() / GL_OES_standard_derivatives needed - dPx is
        // already in pixel units, so a fixed 1-px edge IS pixel-perfect.
        // gridCounts() already keeps cells square in screen space, so
        // pxOffset traces true circles (not ellipses) on any aspect.
        vec2 cellPx = u_resolution / gridSize;
        vec2 pxOffset = (cellLocal - 0.5) * cellPx;
        float dPx = length(pxOffset);
        float minCellPx = min(cellPx.x, cellPx.y);
        float radiusPx = u_dotSize * 0.5 * minCellPx * scaleBoost;
        // 0.5-px AA floor (1-px total smoothstep ramp) keeps the rim
        // pixel-perfect at u_dotSoftness=0 while letting the user softness
        // value dominate at the bundled preset defaults (e.g. softness=0.1
        // on a ~28-px cell yields softPx=0.56 -> ~1.1-px ramp, matching
        // the original cell-local behaviour). A larger floor (e.g. 1.0)
        // would widen low-softness dots and visually lighten dot presets.
        float aaPx = 0.5;
        float softPx = u_dotSoftness * 0.2 * minCellPx;
        float edgePx = max(aaPx, softPx);
        mask = 1.0 - smoothstep(radiusPx - edgePx, radiusPx + edgePx, dPx);
      }

      if (u_highlight > 0.01) {
        float hl = hlFactor * u_highlight;
        col = col * (1.0 + hl * 2.5) + vec3(hl * hl * 0.3);
      }

      if (u_edgeFade > 0.5 && u_fadeStr > 0.005) {
        float ef = smoothstep(0.0, u_edgeFade, edgeDistPx);
        mask *= mix(1.0, ef, u_fadeStr);
      }

      float baseOpacity = (u_dotMode < 1.5) ? u_fillOpacity : 0.0;
      alpha = colorAlpha * mix(baseOpacity, u_dotOpacity, mask);

      float bgLum  = dot(u_cardBg, vec3(0.299, 0.587, 0.114));
      float colLum = dot(baseCol, vec3(0.299, 0.587, 0.114));
      alpha *= smoothstep(0.0, 0.33, abs(colLum - bgLum));
    }

    gl_FragColor = vec4(col, alpha * u_shaderOpacity);
  }
`;

  // the package's engine constants (dist: He, Me, Ct, Nt, qt, De, Vt) and its cycle's revealFadeOutMs
  const ZIA_IMG_FRAME_MS = 1e3 / 10;
  const ZIA_IMG_MAX_DPR = 1.25;
  const ZIA_IMG_MAX_CANVAS_DPR = 2;
  const ZIA_IMG_SAMPLE = 64;
  const ZIA_IMG_SAMPLE_DOTS = 96;
  const ZIA_IMG_REF_DIM = 320;
  const ZIA_IMG_COVER_INSET = 6e-3;
  const ZIA_IMG_HIDE_MS = 300;
  // this port's own: the reduced-motion / no-WebGL crossfade, and how long the
  // shared context outlives its last loader (so each hover doesn't recompile)
  const ZIA_IMG_FADE_MS = 200;
  const ZIA_IMG_KEEP_GL_MS = 30e3;
  // hosts that can't hold rendered children: the loader goes over them, as a sibling
  const ZIA_IMG_REPLACED = /^(canvas|img|video|iframe|embed|object|picture|svg|input|textarea|select)$/i;
  const ZIA_IMG_MASK_SLOT = { shaderColor1: 0, shaderColor2: 1, shaderColor3: 2, shaderColor4: 3, shaderColor5: 4 };

  // the package's easings (dist: Ke / Pe)
  const ZIA_IMG_EASE = {
    linear: (e) => e,
    smoothstep: (e) => e * e * (3 - 2 * e),
    easeOutCubic: (e) => 1 - Math.pow(1 - e, 3),
    easeOutQuint: (e) => 1 - Math.pow(1 - e, 5),
    easeInOutCubic: (e) => (e < 0.5 ? 4 * e * e * e : 1 - Math.pow(-2 * e + 2, 3) / 2),
    easeOutExpo: (e) => (e === 1 ? 1 : 1 - Math.pow(2, -10 * e)),
    easeOutBack: (e) => 1 + (1.70158 + 1) * Math.pow(e - 1, 3) + 1.70158 * Math.pow(e - 1, 2),
  };

  function ziaImgEase(key, t) {
    return (ZIA_IMG_EASE[key] ?? ZIA_IMG_EASE.smoothstep)(Math.max(0, Math.min(1, t)));
  }

  function ziaImgEl(tag) {
    return document.createElementNS(ZIA_IMG_NS, tag);
  }

  function ziaImgOpacity(el, v) {
    const s = String(v);
    if (el.style.opacity !== s) {
      el.style.opacity = s;
    }
  }

  // ---- colours (dist: be / ze)

  let ziaImgColorCtx;

  function ziaImgParseColor(e) {
    if (typeof e !== "string" || e.length === 0) {
      return [0, 0, 0];
    }
    if (e[0] === "#") {
      let l = e.slice(1);
      if (l.length === 3) {
        l = l[0] + l[0] + l[1] + l[1] + l[2] + l[2];
      }
      if ((l.length === 6 || l.length === 8) && /^[0-9a-fA-F]+$/.test(l)) {
        return [parseInt(l.slice(0, 2), 16) / 255, parseInt(l.slice(2, 4), 16) / 255, parseInt(l.slice(4, 6), 16) / 255];
      }
    }
    if (ziaImgColorCtx === undefined) {
      const c = ziaImgEl("canvas");
      c.width = 1;
      c.height = 1;
      ziaImgColorCtx = c.getContext("2d");
    }
    const t = ziaImgColorCtx;
    if (!t) {
      return [0, 0, 0];
    }
    t.fillStyle = "#000000";
    t.fillStyle = e;
    const a = t.fillStyle;
    t.fillStyle = "#ffffff";
    t.fillStyle = e;
    if (a !== t.fillStyle) {
      return [0, 0, 0];
    }
    if (a[0] === "#") {
      return [parseInt(a.slice(1, 3), 16) / 255, parseInt(a.slice(3, 5), 16) / 255, parseInt(a.slice(5, 7), 16) / 255];
    }
    const i = a.match(/^rgba?\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/);
    if (i) {
      const l = (c) => Math.max(0, Math.min(255, c)) / 255;
      return [l(parseFloat(i[1])), l(parseFloat(i[2])), l(parseFloat(i[3]))];
    }
    return [0, 0, 0];
  }

  // a palette slot, swapped for the card colour where it was the preset's card colour
  function ziaImgPresetColor(inst, slot) {
    const a = inst.preset;
    const [n, o, i] = ziaImgParseColor(a.colors[slot]);
    if (inst.cardBgOverride == null) {
      return [n, o, i];
    }
    const [l, c, f] = ziaImgParseColor(a.cardBg);
    const s = (h) => Math.round(h * 255);
    return s(n) === s(l) && s(o) === s(c) && s(i) === s(f) ? ziaImgParseColor(inst.cardBgOverride) : [n, o, i];
  }

  // a slot's colour as the shader gets it: the per-slot override where there
  // is one (the package's colors prop / Instance.colorsOverride, dist: It), else
  // the preset's (dist: ze)
  function ziaImgSlotColor(inst, slot) {
    const o = inst.colorsOverride && inst.colorsOverride[slot];
    return o || ziaImgPresetColor(inst, slot);
  }

  // Zia's palette option: a few CSS colours spread over the preset's 7 shader
  // slots the way the package re-tints its colour field from an image
  // (triggerRegenerate's tint, dist: la): the colours and the preset's slots
  // are each ranked by luminance (0.299 / 0.587 / 0.114), and the slot of rank
  // u takes the colour at quantile 0.05 + 0.9 * u / 6. The result is fed as
  // the colors override (dist: Ht), so the animation, the cell grid and the
  // card colour the shader reasons against stay the preset's.
  function ziaImgRetint(preset, palette) {
    const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
    const px = [];
    for (const v of palette) {
      if (typeof v === "string" && v) {
        px.push(ziaImgParseColor(v));
      }
    }
    if (px.length === 0) {
      return null;
    }
    px.sort((a, b) => lum(a) - lum(b));
    const slots = preset.colors
      .map((c, slot) => ({ slot, lum: lum(ziaImgParseColor(c)) }))
      .sort((a, b) => a.lum - b.lum);
    const out = new Array(slots.length);
    for (let u = 0; u < slots.length; u++) {
      const g = 0.05 + (0.9 * u) / Math.max(1, slots.length - 1);
      out[slots[u].slot] = px[Math.min(px.length - 1, Math.round(g * (px.length - 1)))];
    }
    return out;
  }

  // ---- the shared engine: one WebGL context, one program, one rAF loop (dist: Mt / lt / it / st / Ee)

  let ziaImgShared = null;

  function ziaImgGLOk(eng) {
    return !!(eng.gl && eng.prog && !eng.contextLost);
  }

  function ziaImgCompile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      if (!gl.isContextLost()) {
        console.warn("ziaImgFx: shader failed to compile", gl.getShaderInfoLog(sh));
      }
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  // (re)builds the program and state; what three's WebGLRenderer + ShaderMaterial set up
  function ziaImgInitGL(eng) {
    eng.prog = null;
    const gl = eng.gl;
    if (!gl || gl.isContextLost()) {
      return false;
    }
    // three's ShaderMaterial wrapping: GLSL ES 3.00 with gl_FragColor mapped to
    // an output, and highp (its default precision) for floats and ints
    const hi = eng.gl2 || gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT).precision > 0;
    const precision = `precision ${hi ? "highp" : "mediump"} float;\nprecision ${hi ? "highp" : "mediump"} int;\n`;
    const vs = eng.gl2
      ? `#version 300 es\n#define attribute in\n#define varying out\n${precision}attribute vec3 position;\n${ZIA_IMG_VERT}`
      : `${precision}attribute vec3 position;\n${ZIA_IMG_VERT}`;
    const fs = eng.gl2
      ? `#version 300 es\n#define varying in\nlayout(location = 0) out highp vec4 pc_fragColor;\n#define gl_FragColor pc_fragColor\n${precision}${ZIA_IMG_FRAG}`
      : `${precision}${ZIA_IMG_FRAG}`;
    const v = ziaImgCompile(gl, gl.VERTEX_SHADER, vs);
    const f = v && ziaImgCompile(gl, gl.FRAGMENT_SHADER, fs);
    if (!v || !f) {
      return false;
    }
    const prog = gl.createProgram();
    gl.attachShader(prog, v);
    gl.attachShader(prog, f);
    gl.bindAttribLocation(prog, 0, "position");
    gl.linkProgram(prog);
    gl.deleteShader(v);
    gl.deleteShader(f);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      if (!gl.isContextLost()) {
        console.warn("ziaImgFx: program failed to link", gl.getProgramInfoLog(prog));
      }
      gl.deleteProgram(prog);
      return false;
    }
    // three's PlaneGeometry(2, 2) under the pass-through vertex shader: the whole viewport
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.useProgram(prog);
    // transparent, depthTest/depthWrite off, NormalBlending with a straight-alpha
    // material (three: SRC_ALPHA, ONE_MINUS_SRC_ALPHA, ONE, ONE_MINUS_SRC_ALPHA),
    // over a clear to (0, 0, 0, 0) inside the scissored viewport
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    eng.prog = prog;
    eng.buf = buf;
    eng.loc = Object.create(null);
    eng.uv = Object.create(null);
    eng.lastInstance = null;
    return true;
  }

  function ziaImgLoc(eng, name) {
    if (!(name in eng.loc)) {
      eng.loc[name] = eng.gl.getUniformLocation(eng.prog, name);
    }
    return eng.loc[name];
  }

  // uniform setters that skip unchanged values (three's uniform cache does the same)
  function ziaImgU1(eng, name, v, int) {
    if (eng.uv[name] === v) {
      return;
    }
    eng.uv[name] = v;
    const loc = ziaImgLoc(eng, name);
    if (loc) {
      if (int) {
        eng.gl.uniform1i(loc, v);
      } else {
        eng.gl.uniform1f(loc, v);
      }
    }
  }

  function ziaImgUN(eng, name, v) {
    const c = eng.uv[name];
    if (c && c.length === v.length && c.every((x, i) => x === v[i])) {
      return;
    }
    eng.uv[name] = v.slice();
    const loc = ziaImgLoc(eng, name);
    if (loc) {
      if (v.length === 2) {
        eng.gl.uniform2f(loc, v[0], v[1]);
      } else {
        eng.gl.uniform3f(loc, v[0], v[1], v[2]);
      }
    }
  }

  function ziaImgEngine() {
    let eng = ziaImgShared;
    if (eng) {
      if (eng.keepTimer) {
        clearTimeout(eng.keepTimer);
        eng.keepTimer = 0;
      }
      return eng;
    }
    const glCanvas = ziaImgEl("canvas");
    glCanvas.width = 8;
    glCanvas.height = 8;
    eng = ziaImgShared = {
      glCanvas,
      gl: null,
      gl2: false,
      prog: null,
      buf: null,
      loc: null,
      uv: null,
      pixelRatio: Math.min(window.devicePixelRatio || 1, ZIA_IMG_MAX_DPR),
      instances: new Set(),
      rafId: 0,
      lastFrameMs: 0,
      lastTickMs: performance.now(),
      churning: false,
      lastInstance: null,
      contextLost: false,
      keepTimer: 0,
      reduceQuery: null,
      listeners: [],
    };
    // three's context attributes, but not "high-performance" (that wakes a
    // laptop's discrete GPU for a hover card), and no depth buffer (unused)
    const attrs = {
      alpha: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "low-power",
    };
    try {
      eng.gl = glCanvas.getContext("webgl2", attrs);
      eng.gl2 = !!eng.gl;
      if (!eng.gl) {
        eng.gl = glCanvas.getContext("webgl", attrs);
      }
      ziaImgInitGL(eng);
    } catch (err) {
      eng.prog = null;
    }
    const listen = (target, type, fn) => {
      target.addEventListener(type, fn, false);
      eng.listeners.push([target, type, fn]);
    };
    listen(glCanvas, "webglcontextlost", (event) => {
      event.preventDefault();
      eng.contextLost = true;
      // a dissolve can't go on without the shader: show its image
      for (const inst of eng.instances) {
        inst.reveal.finishNow();
      }
    });
    listen(glCanvas, "webglcontextrestored", () => {
      eng.contextLost = false;
      ziaImgInitGL(eng);
      for (const inst of eng.instances) {
        inst.uniformsDirty = true;
        ziaImgRenderNow(eng, inst);
      }
      ziaImgKick(eng);
    });
    listen(document, "visibilitychange", () => {
      for (const inst of eng.instances) {
        ziaImgUpdateVisible(eng, inst);
      }
    });
    eng.reduceQuery = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    if (eng.reduceQuery) {
      listen(eng.reduceQuery, "change", () => {
        for (const inst of eng.instances) {
          inst.reduced = eng.reduceQuery.matches;
          if (inst.reduced) {
            inst.reveal.finishNow();
          }
          ziaImgRenderNow(eng, inst);
        }
        ziaImgKick(eng);
      });
    }
    return eng;
  }

  function ziaImgRelease(eng) {
    if (eng.instances.size || eng.keepTimer || eng !== ziaImgShared) {
      return;
    }
    eng.keepTimer = setTimeout(() => {
      eng.keepTimer = 0;
      if (eng.instances.size || eng !== ziaImgShared) {
        return;
      }
      ziaImgShared = null;
      if (eng.rafId) {
        cancelAnimationFrame(eng.rafId);
        eng.rafId = 0;
      }
      for (const [target, type, fn] of eng.listeners) {
        target.removeEventListener(type, fn, false);
      }
      eng.listeners = [];
      const gl = eng.gl;
      if (gl && !gl.isContextLost()) {
        if (eng.prog) {
          gl.deleteProgram(eng.prog);
        }
        if (eng.buf) {
          gl.deleteBuffer(eng.buf);
        }
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      }
      eng.gl = null;
      eng.prog = null;
      eng.glCanvas.width = 1;
      eng.glCanvas.height = 1;
    }, ZIA_IMG_KEEP_GL_MS);
  }

  // the package's uniforms from a preset block (dist: It)
  function ziaImgApplyPreset(eng, inst) {
    const a = inst.preset;
    ziaImgU1(eng, "u_effect", a.effectIndex, true);
    ziaImgU1(eng, "u_speed", a.speed);
    ziaImgU1(eng, "u_intensity", a.intensity);
    ziaImgU1(eng, "u_scale", a.scale);
    ziaImgU1(eng, "u_direction", (a.direction * Math.PI) / 180);
    ziaImgU1(eng, "u_softness", a.softness);
    ziaImgU1(eng, "u_distortion", a.distortion);
    ziaImgU1(eng, "u_complexity", a.complexity);
    ziaImgU1(eng, "u_shape", a.shape);
    ziaImgU1(eng, "u_flicker", a.flicker ?? 0);
    ziaImgU1(eng, "u_vignette", a.vignette);
    ziaImgU1(eng, "u_vigOpacity", a.vigOpacity);
    ziaImgU1(eng, "u_blur", a.blur);
    ziaImgU1(eng, "u_highlight", a.highlight);
    ziaImgU1(eng, "u_shaderOpacity", a.shaderOpacity);
    ziaImgU1(eng, "u_dotMode", a.dotMode);
    ziaImgU1(eng, "u_sweepEase", a.sweepEase != null ? Math.floor(a.sweepEase) : 0, true);
    const o = a.dotMode === 1 ? a.pixelConfig : a.dotConfig;
    ziaImgU1(eng, "u_cellSize", o.cellSize);
    ziaImgU1(eng, "u_gap", o.gap);
    ziaImgU1(eng, "u_dotSize", o.dotSize);
    ziaImgU1(eng, "u_dotSoftness", o.dotSoftness);
    ziaImgU1(eng, "u_dotOpacity", o.dotOpacity);
    ziaImgU1(eng, "u_hlScale", o.hlScale);
    ziaImgU1(eng, "u_fillOpacity", o.fillOpacity);
    ziaImgU1(eng, "u_edgeFade", o.edgeFade);
    ziaImgU1(eng, "u_fadeStr", o.fadeStr);
    if (!inst.colors) {
      inst.colors = [];
      for (let s = 0; s < 7; s++) {
        inst.colors.push(ziaImgSlotColor(inst, s));
      }
      inst.colors.push(ziaImgParseColor(inst.cardBgOverride ?? a.cardBg));
    }
    for (let s = 0; s < 7; s++) {
      ziaImgUN(eng, `u_color${s + 1}`, inst.colors[s]);
      ziaImgU1(eng, `u_alpha${s + 1}`, a.alphas[s]);
    }
    ziaImgUN(eng, "u_cardBg", inst.colors[7]);
    inst.uniformsDirty = false;
  }

  // grows the GL canvas to the biggest loader showing (dist: lt)
  function ziaImgGrow(eng, also) {
    const pr = Math.min(window.devicePixelRatio || 1, ZIA_IMG_MAX_DPR);
    if (pr !== eng.pixelRatio) {
      eng.pixelRatio = pr;
      eng.lastInstance = null;
    }
    let t = 0;
    let a = 0;
    for (const h of eng.instances) {
      if (h !== also && (!h.visible || h.paused)) {
        continue;
      }
      if (h.cssWidth > t) {
        t = h.cssWidth;
      }
      if (h.cssHeight > a) {
        a = h.cssHeight;
      }
    }
    if (t <= 0 || a <= 0) {
      return;
    }
    const n = eng.pixelRatio;
    const o = Math.max(1, Math.floor(t * n));
    const i = Math.max(1, Math.floor(a * n));
    const l = eng.glCanvas.width;
    const c = eng.glCanvas.height;
    if (o <= l && i <= c) {
      return;
    }
    const f = Math.max(t, l / Math.max(n, 1e-4));
    const s = Math.max(a, c / Math.max(n, 1e-4));
    eng.glCanvas.width = Math.floor(f * n);
    eng.glCanvas.height = Math.floor(s * n);
  }

  function ziaImgDraw(eng) {
    const gl = eng.gl;
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // one loader's frame: the shader into the shared canvas's bottom-left corner,
  // copied (nearest-neighbour) into the loader's own 2D canvas (dist: it)
  function ziaImgRender(eng, t, a) {
    if (!ziaImgGLOk(eng)) {
      return;
    }
    const gl = eng.gl;
    const n = Math.max(1, Math.floor(t.cssWidth * t.dpr));
    const o = Math.max(1, Math.floor(t.cssHeight * t.dpr));
    const vw = Math.round(Math.max(1, t.cssWidth) * eng.pixelRatio);
    const vh = Math.round(Math.max(1, t.cssHeight) * eng.pixelRatio);
    gl.viewport(0, 0, vw, vh);
    gl.scissor(0, 0, vw, vh);
    ziaImgUN(eng, "u_resolution", [n, o]);
    ziaImgU1(eng, "u_dpr", t.dpr || 1);
    if (eng.lastInstance !== t || t.uniformsDirty) {
      ziaImgApplyPreset(eng, t);
      eng.lastInstance = t;
    }
    ziaImgU1(eng, "u_time", t.accumulatedTime);
    ziaImgDraw(eng);
    const f = Math.max(1, Math.floor(t.cssWidth * t.canvasDpr));
    const s = Math.max(1, Math.floor(t.cssHeight * t.canvasDpr));
    if (t.canvas.width !== f || t.canvas.height !== s) {
      t.canvas.width = f;
      t.canvas.height = s;
    }
    t.ctx.clearRect(0, 0, f, s);
    const h = eng.glCanvas.height - o;
    t.ctx.imageSmoothingEnabled = false;
    t.ctx.drawImage(eng.glCanvas, 0, h, n, o, 0, 0, f, s);
    if (t.shownAtMs < 0) {
      t.shownAtMs = a;
    }
    t.reveal.afterShaderFrame(eng, t, a);
    if (t.reveal.isActive()) {
      eng.lastInstance = null;
    }
  }

  // a frame now, outside the loop (dist: Be)
  function ziaImgRenderNow(eng, inst) {
    if (inst.destroyed || !ziaImgGLOk(eng) || !inst.visible || inst.cssWidth < 1 || inst.cssHeight < 1) {
      return;
    }
    ziaImgGrow(eng, inst);
    ziaImgRender(eng, inst, performance.now());
  }

  // whether the loop has to draw this loader's shader (not while its image is
  // held over it, nor for a still or a crossfade)
  function ziaImgChurns(inst) {
    return (
      !inst.destroyed &&
      inst.visible &&
      !inst.paused &&
      !inst.reduced &&
      inst.cssWidth >= 1 &&
      inst.cssHeight >= 1 &&
      inst.reveal.churns()
    );
  }

  function ziaImgUpdateVisible(eng, inst) {
    const v = inst.inView && !document.hidden;
    if (v === inst.visible) {
      return;
    }
    inst.visible = v;
    if (v) {
      ziaImgRenderNow(eng, inst);
      ziaImgKick(eng);
    }
  }

  function ziaImgTryStart(eng, inst, now) {
    const p = inst.pending;
    // (a reveal asked for during a hide waits for it to finish)
    if (!p || inst.destroyed || inst.reveal.isActive()) {
      return;
    }
    if (inst.minChurnMs > 0 && (inst.shownAtMs < 0 || now - inst.shownAtMs < inst.minChurnMs)) {
      return;
    }
    inst.pending = null;
    inst.reveal.startReveal({
      image: p.image,
      simple: inst.reduced || !ziaImgGLOk(eng),
      onRevealComplete: p.onDone,
    });
    ziaImgKick(eng);
  }

  // the loop: crossfades every frame, shader frames under the fps cap (dist: st)
  function ziaImgTick(now) {
    const eng = ziaImgShared;
    if (!eng) {
      return;
    }
    eng.rafId = 0;
    let again = false;
    try {
      for (const inst of eng.instances) {
        if (inst.pending) {
          if (inst.shownAtMs < 0 && inst.visible && inst.cssWidth >= 1 && inst.cssHeight >= 1 && !ziaImgGLOk(eng)) {
            inst.shownAtMs = now;
          }
          ziaImgTryStart(eng, inst, now);
          if (inst.pending && inst.visible) {
            again = true;
          }
        }
        if (inst.reveal.stepSimple(now)) {
          again = true;
        }
      }
      const list = [];
      if (ziaImgGLOk(eng)) {
        for (const inst of eng.instances) {
          if (ziaImgChurns(inst)) {
            list.push(inst);
          }
        }
      }
      if (!list.length) {
        eng.churning = false;
      } else {
        again = true;
        if (!eng.churning) {
          eng.churning = true;
          eng.lastTickMs = now;
          eng.lastFrameMs = now;
        } else {
          const t = now - eng.lastFrameMs;
          if (t >= ZIA_IMG_FRAME_MS) {
            eng.lastFrameMs = now - (t % ZIA_IMG_FRAME_MS);
            const a = (now - eng.lastTickMs) / 1e3;
            eng.lastTickMs = now;
            for (const inst of list) {
              inst.accumulatedTime += a;
            }
            ziaImgGrow(eng, null);
            for (const inst of list) {
              const d = Math.min(window.devicePixelRatio || 1, ZIA_IMG_MAX_DPR);
              if (inst.dpr !== d) {
                inst.dpr = d;
                inst.canvasDpr = Math.min(window.devicePixelRatio || 1, ZIA_IMG_MAX_CANVAS_DPR);
              }
              if (!inst.destroyed) {
                try {
                  ziaImgRender(eng, inst, now);
                } catch (err) {
                  if (!eng.warned) {
                    eng.warned = true;
                    console.error("ziaImgFx: frame failed", err);
                  }
                }
              }
            }
          }
        }
      }
    } finally {
      if (again && eng === ziaImgShared && !eng.rafId) {
        eng.rafId = requestAnimationFrame(ziaImgTick);
      }
    }
  }

  // starts the loop if it's stopped (dist: Ee)
  function ziaImgKick(eng) {
    if (!eng || eng !== ziaImgShared || eng.rafId) {
      return;
    }
    eng.lastTickMs = performance.now();
    eng.lastFrameMs = eng.lastTickMs;
    eng.churning = ziaImgGLOk(eng) && [...eng.instances].some(ziaImgChurns);
    eng.rafId = requestAnimationFrame(ziaImgTick);
  }

  // ---- the reveal (dist: Qe, he, ct, ut, ft, Xt, jt, aa)

  // object-fit: cover, less a 0.6% inset on each side (dist: Qe)
  function ziaImgCoverRect(e, t, a) {
    const n = t / Math.max(1, a);
    const o = e.width / Math.max(1, e.height);
    let i = 0;
    let l = 0;
    let c = e.width;
    let f = e.height;
    if (o > n) {
      c = e.height * n;
      i = (e.width - c) / 2;
    } else {
      f = e.width / n;
      l = (e.height - f) / 2;
    }
    const s = Math.min(c, f) * ZIA_IMG_COVER_INSET;
    if (c - 2 * s > 1 && f - 2 * s > 1) {
      i += s;
      l += s;
      c -= 2 * s;
      f -= 2 * s;
    }
    return { sx: i, sy: l, sw: c, sh: f };
  }

  // the image, cover-fitted at the canvas's size, cached (dist: he)
  function ziaImgCover(e, a, n, o) {
    let i = e.coverA;
    if (!i) {
      const l = ziaImgEl("canvas");
      i = e.coverA = { canvas: l, ctx: l.getContext("2d"), img: null, w: 0, h: 0 };
    }
    if (i.img !== a || i.w !== n || i.h !== o) {
      i.canvas.width = n;
      i.canvas.height = o;
      i.w = n;
      i.h = o;
      i.img = a;
      const { sx: l, sy: c, sw: f, sh: s } = ziaImgCoverRect(a, n, o);
      i.ctx.clearRect(0, 0, n, o);
      i.ctx.imageSmoothingEnabled = true;
      i.ctx.imageSmoothingQuality = "high";
      i.ctx.drawImage(a, l, c, f, s, 0, 0, n, o);
    }
    return i.canvas;
  }

  function ziaImgRevealTiming(e) {
    const t = e.revealConfig;
    return e.dotMode === 2
      ? { duration: Math.max(0.05, t.dotDuration), easingKey: t.dotEasing }
      : { duration: Math.max(0.05, t.duration), easingKey: t.easing };
  }

  function ziaImgEnsureSample(e, t) {
    if (!e.sampleCanvas) {
      e.sampleCanvas = ziaImgEl("canvas");
      e.sampleCtx = e.sampleCanvas.getContext("2d", { willReadFrequently: true });
    }
    if (e.sampleCanvas.width !== t || e.sampleCanvas.height !== t) {
      e.sampleCanvas.width = t;
      e.sampleCanvas.height = t;
      e.sampleImgData = null;
      e.sampleDataCache = null;
      e.sampleFrameCounter = 0;
    }
    if (!e.maskGrad) {
      e.maskGrad = ziaImgEl("canvas");
      e.maskGradCtx = e.maskGrad.getContext("2d");
    }
    if (e.maskGrad.width !== t || e.maskGrad.height !== t) {
      e.maskGrad.width = t;
      e.maskGrad.height = t;
      e.maskImgData = null;
    }
    if (!e.maskImgData && e.maskGradCtx) {
      e.maskImgData = e.maskGradCtx.createImageData(t, t);
    }
  }

  // the shader re-rendered smooth (no mosaic), shrunk to o x o and read back:
  // the colour field the dissolve mask is made from (dist: ft)
  function ziaImgSampleShader(e, eng, a, n, o) {
    const prevMode = eng.uv.u_dotMode;
    const prevFill = eng.uv.u_fillOpacity;
    const c = a.preset.dotMode;
    const f = c < 1.5 ? 0 : 1;
    ziaImgU1(eng, "u_dotMode", f);
    ziaImgU1(eng, "u_fillOpacity", f > 0.5 ? (c === 1 ? a.preset.pixelConfig.fillOpacity : a.preset.dotConfig.fillOpacity) : 0);
    ziaImgDraw(eng);
    const s = Math.max(1, Math.floor(a.cssWidth * a.dpr));
    const h = Math.max(1, Math.floor(a.cssHeight * a.dpr));
    const u = Math.max(0, eng.glCanvas.height - h);
    if (!e.sampleGpuCanvas) {
      e.sampleGpuCanvas = ziaImgEl("canvas");
      e.sampleGpuCtx = e.sampleGpuCanvas.getContext("2d");
    }
    const g = e.sampleGpuCanvas;
    const m = e.sampleGpuCtx;
    if (g.width !== o || g.height !== o) {
      g.width = o;
      g.height = o;
    }
    m.clearRect(0, 0, o, o);
    m.drawImage(eng.glCanvas, 0, u, s, h, 0, 0, o, o);
    n.clearRect(0, 0, o, o);
    n.drawImage(g, 0, 0);
    ziaImgU1(eng, "u_dotMode", prevMode);
    ziaImgU1(eng, "u_fillOpacity", prevFill);
    e.sampleImgData = n.getImageData(0, 0, o, o);
    e.sampleDataCache = e.sampleImgData.data;
    return e.sampleDataCache;
  }

  // the cell hash (dist: inside Xt / ta)
  function ziaImgHash(U, z) {
    const q = Math.sin(U * 127.1 + z * 17.23) * 43758.5453;
    return q - Math.floor(q);
  }

  // one dissolve frame into the overlay (dist: Xt)
  function ziaImgRevealFrame(e, eng, a, n) {
    if (!e.image) {
      return;
    }
    const o = a.preset;
    const i = a.canvas.width;
    const l = a.canvas.height;
    if (n.canvas.width !== i || n.canvas.height !== l) {
      n.canvas.width = i;
      n.canvas.height = l;
    }
    n.clearRect(0, 0, i, l);
    const { duration: c, easingKey: f } = ziaImgRevealTiming(o);
    const s = (performance.now() - e.revealStartMs) / 1e3;
    const h = Math.min(s / c, 1);
    const u = ziaImgEase(f, h);
    const g = e.image;
    const I = o.revealConfig.blur;
    const filter = h < 1 && I > 0 && I * (1 - u) > 0.1 ? `blur(${(I * (1 - u)).toFixed(1)}px)` : "none";
    if (n.canvas.style.filter !== filter) {
      n.canvas.style.filter = filter;
    }
    if (h >= 1) {
      n.imageSmoothingEnabled = true;
      n.imageSmoothingQuality = "high";
      n.drawImage(ziaImgCover(e, g, i, l), 0, 0);
      return;
    }
    const w = o.dotMode === 2 ? ZIA_IMG_SAMPLE_DOTS : ZIA_IMG_SAMPLE;
    ziaImgEnsureSample(e, w);
    const M = o.revealConfig.maskShape;
    const d = o.revealConfig.softness;
    const x = M.startsWith("shader");
    let C = null;
    let y = null;
    if (x) {
      const T = e.sampleFrameCounter++;
      C = e.sampleDataCache == null || (T & 1) === 0 ? ziaImgSampleShader(e, eng, a, e.sampleCtx, w) : e.sampleDataCache;
      if (ZIA_IMG_MASK_SLOT[M] != null) {
        // (the package reads the preset colour here even under a colors
        // override; with Zia's palette the dissolve follows the re-tinted
        // slot instead, or every cell would reveal in the same last third)
        y = ziaImgSlotColor(a, ZIA_IMG_MASK_SLOT[M]);
      }
    }
    const _ = 1 - u * (1 + d);
    const W = M === "gradientSweep";
    let j = 0;
    let S = 0;
    let G = 2;
    const V = o.flicker ?? 0;
    let ae = null;
    let H = null;
    let R = 0;
    let X = 0;
    let A = 0;
    if (V > 3e-3) {
      G = Math.max(2, Math.floor(6 + o.pixelConfig.cellSize * 74));
      const T = a.accumulatedTime * Math.max(o.speed, 2) * 1.6;
      const Z = Math.floor(T);
      R = Z % 1024;
      X = (R + 1) % 1024;
      A = T - Z;
      A = A * A * (3 - 2 * A);
      H = ziaImgHash;
      const E = G * G;
      if (!e.gsFlickerTable || e.gsFlickerTable.length !== E) {
        e.gsFlickerTable = new Float32Array(E);
      }
      ae = e.gsFlickerTable;
      for (let U = 0; U < E; U++) {
        const z = ziaImgHash(U, R) * (1 - A) + ziaImgHash(U, X) * A;
        ae[U] = (z - 0.5) * V * 1.6;
      }
    }
    if (W) {
      j = 0.9 / Math.max(o.scale, 0.25);
      S = -j + u * (1 + 2 * j);
    }
    const ce = e.maskImgData.data;
    for (let T = 0; T < w; T++) {
      for (let Z = 0; Z < w; Z++) {
        let N;
        if (x && C) {
          const z = (T * w + Z) * 4;
          const q = C[z] / 255;
          const se = C[z + 1] / 255;
          const r = C[z + 2] / 255;
          if (y) {
            const D = q - y[0];
            const K = se - y[1];
            const le = r - y[2];
            N = Math.exp(-8 * (D * D + K * K + le * le));
          } else {
            N = (C[z] * 0.299 + C[z + 1] * 0.587 + C[z + 2] * 0.114) / 255;
          }
        } else {
          // (the package's geometric masks, dist: Qt, aren't used by any preset)
          N = W ? 0 : -1;
        }
        let E;
        if (W) {
          const z = Z / (w - 1);
          const q = T / (w - 1);
          const se = (z + q) * 0.5;
          E = (S + j - se) / (2 * j);
        } else {
          E = (N - _) / d;
        }
        if (ae && E > -0.5 && E < 1.5) {
          const z = E < 0 ? 0 : E > 1 ? 1 : E;
          const q = z * (1 - z) * 4;
          if (q > 1e-3) {
            const se = Z / (w - 1);
            const r = T / (w - 1);
            // (on the last row this indexes past the table, as in the package:
            // NaN, so those mask pixels go clear while the band crosses them)
            const D = Math.floor(r * G) * G + Math.floor(se * G);
            E += ae[D] * q;
          }
        }
        if (E < 0) {
          E = 0;
        } else if (E > 1) {
          E = 1;
        }
        E = E * E * (3 - 2 * E);
        const U = (T * w + Z) * 4;
        ce[U] = 255;
        ce[U + 1] = 255;
        ce[U + 2] = 255;
        ce[U + 3] = (E * 255 + 0.5) | 0;
      }
    }
    e.maskGradCtx.putImageData(e.maskImgData, 0, 0);
    if (o.dotMode === 1) {
      // the gradient sweep's mask already flickers along its band, so its dissolve doesn't
      ziaImgPixelReveal(e, n, g, o, s, i, l, a, W ? 0 : V, H, R, X, A);
    } else {
      // (dotMode 2's pixel reveal, dist: $t, isn't used by any preset)
      n.imageSmoothingEnabled = true;
      n.imageSmoothingQuality = "high";
      n.drawImage(ziaImgCover(e, g, i, l), 0, 0);
      n.globalCompositeOperation = "destination-in";
      n.drawImage(e.maskGrad, 0, 0, i, l);
      n.globalCompositeOperation = "source-over";
    }
  }

  // the image in cells: each cell pixelated until its random moment, then
  // sharp, and the whole masked cell by cell (dist: jt)
  function ziaImgPixelReveal(e, t, a, c, f, s, h, u, g, m, v, b, P) {
    const w = 6 + c.pixelConfig.cellSize * 74;
    const oe = Math.max(1, u.cssWidth);
    const ie = Math.max(1, u.cssHeight);
    const F = Math.max(2, Math.floor((w * oe) / ZIA_IMG_REF_DIM));
    const M = Math.max(2, Math.floor((w * ie) / ZIA_IMG_REF_DIM));
    const d = F * M;
    const x = Math.max(0.05, c.revealConfig.pixDuration);
    const C = Math.max(0, Math.min(1, f / x));
    const y = ziaImgEase(c.revealConfig.pixEasing, C);
    if (!e.pixCanvas) {
      e.pixCanvas = ziaImgEl("canvas");
      e.pixCtx = e.pixCanvas.getContext("2d");
    }
    const k = e.pixCanvas;
    const _ = e.pixCtx;
    if (k.width !== F || k.height !== M) {
      k.width = F;
      k.height = M;
    }
    if (!e.pixDrop) {
      e.pixDrop = ziaImgEl("canvas");
      e.pixDropCtx = e.pixDrop.getContext("2d");
    }
    const W = e.pixDrop;
    const j = e.pixDropCtx;
    if (W.width !== F || W.height !== M || !e.pixDropImgData) {
      W.width = F;
      W.height = M;
      e.pixDropImgData = j.createImageData(F, M);
      const R = e.pixDropImgData.data;
      for (let X = 0; X < R.length; X += 4) {
        R[X] = 255;
        R[X + 1] = 255;
        R[X + 2] = 255;
      }
    }
    const S = 0.07;
    const G = 1 / (2 * S);
    if (!e.pixDropPattern || e.pixDropPatternW !== F || e.pixDropPatternH !== M || e.pixDropRevealStart !== e.revealStartMs) {
      e.pixDropPattern = new Float32Array(d);
      const R = S;
      const X = 1 - 2 * S;
      for (let A = 0; A < e.pixDropPattern.length; A++) {
        e.pixDropPattern[A] = R + Math.random() * X;
      }
      e.pixDropPatternW = F;
      e.pixDropPatternH = M;
      e.pixDropRevealStart = e.revealStartMs;
    }
    const V = e.pixDropImgData.data;
    const ae = e.pixDropPattern;
    const H = g > 3e-3 && m != null;
    for (let R = 0; R < ae.length; R++) {
      const X = ae[R];
      let A = 0.5 + (X - y) * G;
      A = A < 0 ? 0 : A > 1 ? 1 : A;
      if (H) {
        const pe = 1 - Math.abs(y - X) * 6.25;
        if (pe > 0) {
          const ce = m(R, v) * (1 - P) + m(R, b) * P;
          A += (ce - 0.5) * g * 1.6 * pe;
          A = A < 0 ? 0 : A > 1 ? 1 : A;
        }
      }
      V[R * 4 + 3] = (A * 255 + 0.5) | 0;
    }
    j.putImageData(e.pixDropImgData, 0, 0);
    const cover = ziaImgCover(e, a, s, h);
    _.globalCompositeOperation = "source-over";
    _.clearRect(0, 0, F, M);
    _.imageSmoothingEnabled = true;
    _.imageSmoothingQuality = "high";
    _.drawImage(cover, 0, 0, s, h, 0, 0, F, M);
    _.globalCompositeOperation = "destination-in";
    _.imageSmoothingEnabled = false;
    _.drawImage(W, 0, 0);
    _.globalCompositeOperation = "source-over";
    t.imageSmoothingEnabled = true;
    t.imageSmoothingQuality = "high";
    t.drawImage(cover, 0, 0);
    t.imageSmoothingEnabled = false;
    t.drawImage(k, 0, 0, F, M, 0, 0, s, h);
    t.imageSmoothingEnabled = true;
    _.globalCompositeOperation = "source-over";
    _.clearRect(0, 0, F, M);
    _.imageSmoothingEnabled = true;
    _.imageSmoothingQuality = "high";
    _.drawImage(e.maskGrad, 0, 0, F, M);
    t.imageSmoothingEnabled = false;
    t.globalCompositeOperation = "destination-in";
    t.drawImage(k, 0, 0, F, M, 0, 0, s, h);
    t.imageSmoothingEnabled = true;
    t.globalCompositeOperation = "source-over";
  }

  // the overlay's state machine: idle -> reveal -> hold -> hide -> idle (dist: aa).
  // "simple" runs a reveal / hide as a plain crossfade, every frame: for
  // reduced motion, and when there's no WebGL
  function ziaImgCreateReveal(inst, canvas, setShaderOpacity) {
    const t = canvas.getContext("2d");
    // the two canvases' fade levels now, so a hide starts from wherever the
    // dissolve had got to (from the hold, as in the package: 0 and 1)
    let shaderLevel = 1;
    let overlayLevel = 1;
    const setShader = (v) => {
      shaderLevel = v;
      setShaderOpacity(v);
    };
    const setOverlay = (v) => {
      overlayLevel = v;
      ziaImgOpacity(t.canvas, v);
    };
    const a = {
      active: false,
      phase: "idle",
      simple: false,
      revealStartMs: 0,
      holdStartMs: 0,
      hideStartMs: 0,
      hideDurationMs: ZIA_IMG_HIDE_MS,
      hideShaderFrom: 0,
      hideOverlayFrom: 1,
      image: null,
      onRevealComplete: null,
      sampleCanvas: null,
      sampleCtx: null,
      sampleImgData: null,
      sampleDataCache: null,
      sampleFrameCounter: 0,
      maskGrad: null,
      maskGradCtx: null,
      maskImgData: null,
      gsFlickerTable: null,
      pixCanvas: null,
      pixCtx: null,
      pixDrop: null,
      pixDropCtx: null,
      pixDropImgData: null,
      pixDropPattern: null,
      pixDropPatternW: 0,
      pixDropPatternH: 0,
      pixDropRevealStart: -1,
      coverA: null,
      holdPaintedImg: null,
      holdPaintedW: 0,
      holdPaintedH: 0,
      sampleGpuCanvas: null,
      sampleGpuCtx: null,
    };

    function done() {
      const cb = a.onRevealComplete;
      a.onRevealComplete = null;
      if (cb) {
        try {
          cb();
        } catch (err) {
          console.error(err);
        }
      }
    }

    // the whole image, as the hold phase paints it
    function paintFull() {
      const m = Math.max(1, Math.floor(inst.cssWidth * inst.canvasDpr));
      const v = Math.max(1, Math.floor(inst.cssHeight * inst.canvasDpr));
      if (t.canvas.width !== m || t.canvas.height !== v) {
        t.canvas.width = m;
        t.canvas.height = v;
        a.holdPaintedImg = null;
      }
      if (t.canvas.style.filter !== "none") {
        t.canvas.style.filter = "none";
      }
      if (a.holdPaintedImg !== a.image || a.holdPaintedW !== m || a.holdPaintedH !== v) {
        t.clearRect(0, 0, m, v);
        t.globalCompositeOperation = "source-over";
        t.globalAlpha = 1;
        t.imageSmoothingEnabled = true;
        t.imageSmoothingQuality = "high";
        t.drawImage(ziaImgCover(a, a.image, m, v), 0, 0);
        a.holdPaintedImg = a.image;
        a.holdPaintedW = m;
        a.holdPaintedH = v;
      }
    }

    function endHide() {
      a.active = false;
      a.phase = "idle";
      a.simple = false;
      setOverlay(1);
      t.clearRect(0, 0, t.canvas.width, t.canvas.height);
      setShader(1);
      a.image = null;
      a.coverA = null;
      a.holdPaintedImg = null;
    }

    return {
      afterShaderFrame(eng, c, f) {
        if (!a.active) {
          if (t.canvas.style.filter && t.canvas.style.filter !== "none") {
            t.canvas.style.filter = "none";
          }
          return;
        }
        if (a.simple) {
          return;
        }
        const { duration: s, easingKey: h } = ziaImgRevealTiming(c.preset);
        if (a.phase === "reveal" && a.image) {
          const g = (f - a.revealStartMs) / 1e3;
          const m = Math.min(g / s, 1);
          const v = ziaImgEase(h, m);
          setShader(1 - v);
          ziaImgRevealFrame(a, eng, c, t);
          if (m >= 1) {
            a.phase = "hold";
            a.holdStartMs = f;
            setShader(0);
            done();
          }
        } else if (a.phase === "hold" && a.image) {
          paintFull();
          setShader(0);
        } else if (a.phase === "hide") {
          const g = f - a.hideStartMs;
          const m = Math.min(g / Math.max(1, a.hideDurationMs), 1);
          setOverlay(a.hideOverlayFrom * (1 - m));
          setShader(a.hideShaderFrom + (1 - a.hideShaderFrom) * m);
          if (m >= 1) {
            endHide();
          }
        }
      },
      // the reduced-motion / no-WebGL crossfades; true while one runs
      stepSimple(now) {
        if (!a.active || !a.simple) {
          return false;
        }
        if (a.phase === "reveal") {
          if (inst.cssWidth < 1 || inst.cssHeight < 1) {
            return true;
          }
          paintFull();
          const k = Math.min(1, (now - a.revealStartMs) / ZIA_IMG_FADE_MS);
          setOverlay(k);
          setShader(1 - k);
          if (k >= 1) {
            a.phase = "hold";
            a.holdStartMs = now;
            setShader(0);
            done();
            return false;
          }
          return true;
        }
        if (a.phase === "hide") {
          const m = Math.min((now - a.hideStartMs) / Math.max(1, a.hideDurationMs), 1);
          setOverlay(a.hideOverlayFrom * (1 - m));
          setShader(a.hideShaderFrom + (1 - a.hideShaderFrom) * m);
          if (m >= 1) {
            endHide();
            return false;
          }
          return true;
        }
        return false;
      },
      startReveal(l) {
        a.image = l.image;
        a.onRevealComplete = l.onRevealComplete || null;
        a.revealStartMs = performance.now();
        a.phase = "reveal";
        a.active = true;
        a.simple = !!l.simple;
        a.sampleFrameCounter = 0;
        a.sampleDataCache = null;
        a.holdPaintedImg = null;
        setOverlay(a.simple ? 0 : 1);
      },
      startHide(ms, simple) {
        if (!a.active || a.phase === "hide") {
          return false;
        }
        a.hideStartMs = performance.now();
        // (the package jumps the shader to 0 here even mid-dissolve: a pop)
        a.hideShaderFrom = shaderLevel;
        a.hideOverlayFrom = overlayLevel;
        if (a.phase === "hold") {
          // the package's loop kept the (hidden) shader's clock running while
          // the image was held; this one skips those frames, so it catches up
          inst.accumulatedTime += Math.max(0, a.hideStartMs - a.holdStartMs) / 1e3;
        }
        a.phase = "hide";
        a.hideDurationMs = ms;
        if (simple) {
          a.simple = true;
        }
        return true;
      },
      // jumps a running dissolve to its end, or a hide to idle
      finishNow() {
        if (!a.active || !a.image) {
          if (a.active && a.phase === "hide") {
            endHide();
          }
          return;
        }
        if (a.phase === "reveal") {
          a.simple = true;
          a.phase = "hold";
          a.holdStartMs = performance.now();
          setOverlay(1);
          paintFull();
          setShader(0);
          done();
        } else if (a.phase === "hide") {
          endHide();
        }
      },
      repaintHold() {
        if (a.active && a.phase === "hold" && a.image && inst.cssWidth >= 1 && inst.cssHeight >= 1) {
          paintFull();
        }
      },
      churns() {
        return !(a.active && (a.simple || a.phase === "hold"));
      },
      isActive() {
        return a.active;
      },
      phase() {
        return a.phase;
      },
      dispose() {
        a.active = false;
        a.phase = "idle";
        a.onRevealComplete = null;
        for (const key of Object.keys(a)) {
          if (a[key] && typeof a[key] === "object") {
            a[key] = null;
          }
        }
      },
    };
  }

  // a copy of the source's pixels now, so a later redraw of it can't change the reveal
  function ziaImgSnapshot(src) {
    if (!src) {
      return null;
    }
    let w = 0;
    let h = 0;
    if (src.localName === "img") {
      if (!src.complete) {
        return null;
      }
      w = src.naturalWidth;
      h = src.naturalHeight;
    } else if (src.localName === "video") {
      w = src.videoWidth;
      h = src.videoHeight;
    } else {
      w = src.width;
      h = src.height;
    }
    w = Math.floor(w);
    h = Math.floor(h);
    if (!(w > 0 && h > 0)) {
      return null;
    }
    const c = ziaImgEl("canvas");
    c.width = w;
    c.height = h;
    try {
      c.getContext("2d").drawImage(src, 0, 0, w, h);
    } catch (err) {
      return null;
    }
    return c;
  }

  function ziaImgFx(host, opts) {
    opts = opts || {};
    if (!host || !host.ownerDocument) {
      throw new TypeError("ziaImgFx: needs a host element");
    }
    const eng = ziaImgEngine();
    const name = Object.hasOwn(ZIA_IMG_PRESETS, opts.preset) ? opts.preset : "pixels-organic";
    const fixedRadius = Number.isFinite(opts.radius) ? Math.max(0, opts.radius) : null;
    let dark = opts.dark !== false;
    // (the preset with its dissolve stretched or squeezed to revealSeconds)
    const tuned = (preset) => {
      const want = Number(opts.revealSeconds);
      const r = preset.revealConfig;
      if (!(want > 0) || !r?.duration) {
        return preset;
      }
      const k = want / r.duration;
      return { ...preset, revealConfig: { ...r, duration: want, pixDuration: r.pixDuration * k, dotDuration: r.dotDuration * k } };
    };

    const layer = ziaImgEl("div");
    layer.className = "zia-imgfx";
    layer.setAttribute("aria-hidden", "true");
    const shaderCanvas = ziaImgEl("canvas");
    shaderCanvas.className = "zia-imgfx-shader";
    const overlay = ziaImgEl("canvas");
    overlay.className = "zia-imgfx-overlay";
    layer.append(shaderCanvas, overlay);

    // over a replaced element (Zia's thumbnail <canvas>): its next sibling, on
    // its box; anything else: inside it, filling it
    const over = ZIA_IMG_REPLACED.test(host.localName || "");
    let hostPosition = null;
    if (over) {
      layer.setAttribute("zia-imgfx-over", "");
      host.after(layer);
    } else {
      if (getComputedStyle(host).position === "static") {
        hostPosition = host.style.position;
        host.style.position = "relative";
      }
      host.appendChild(layer);
    }

    const inst = {
      canvas: shaderCanvas,
      ctx: shaderCanvas.getContext("2d"),
      cssWidth: 0,
      cssHeight: 0,
      dpr: Math.min(window.devicePixelRatio || 1, ZIA_IMG_MAX_DPR),
      canvasDpr: Math.min(window.devicePixelRatio || 1, ZIA_IMG_MAX_CANVAS_DPR),
      preset: tuned(ZIA_IMG_PRESETS[name].modes[dark ? "dark" : "light"]),
      cardBgOverride: typeof opts.cardBg === "string" && opts.cardBg ? opts.cardBg : null,
      palette: Array.isArray(opts.palette) ? opts.palette.slice() : null,
      colorsOverride: null,
      colors: null,
      strength: Math.max(0, Math.min(1, Number.isFinite(opts.strength) ? opts.strength : 1)),
      inView: true,
      visible: !document.hidden,
      paused: false,
      reduced: !!eng.reduceQuery?.matches,
      uniformsDirty: true,
      reveal: null,
      accumulatedTime: Math.random() * 1e3,
      shownAtMs: -1,
      pending: null,
      minChurnMs: Math.max(0, Number(opts.minChurnMs) || 0),
      destroyed: false,
    };
    inst.colorsOverride = inst.palette && ziaImgRetint(inst.preset, inst.palette);
    // strength is the shader canvas's opacity, under the reveal's own fade
    const setShaderOpacity = (v) => ziaImgOpacity(shaderCanvas, v * inst.strength);
    setShaderOpacity(1);
    inst.reveal = ziaImgCreateReveal(inst, overlay, setShaderOpacity);

    const paintCard = () => {
      layer.style.backgroundColor = inst.cardBgOverride ?? inst.preset.cardBg;
    };
    paintCard();

    let radius = -1;
    function sync() {
      if (inst.destroyed) {
        return;
      }
      let w;
      let h;
      if (over) {
        // (its padding box, inside its borders: a thumbnail's bottom rule stays visible)
        w = host.clientWidth;
        h = host.clientHeight;
        layer.style.left = `${host.offsetLeft + host.clientLeft}px`;
        layer.style.top = `${host.offsetTop + host.clientTop}px`;
        layer.style.width = `${w}px`;
        layer.style.height = `${h}px`;
      } else {
        w = host.clientWidth;
        h = host.clientHeight;
      }
      let r = fixedRadius;
      if (r == null) {
        const value = getComputedStyle(host).borderTopLeftRadius;
        const n = parseFloat(value);
        r = Number.isFinite(n) && n > 0 ? (value.endsWith("%") ? (n / 100) * Math.min(w, h) : n) : 0;
      }
      if (r !== radius) {
        radius = r;
        layer.style.borderRadius = `${r}px`;
      }
      const d = Math.min(window.devicePixelRatio || 1, ZIA_IMG_MAX_DPR);
      if (w === inst.cssWidth && h === inst.cssHeight && d === inst.dpr) {
        return;
      }
      inst.cssWidth = w;
      inst.cssHeight = h;
      inst.dpr = d;
      inst.canvasDpr = Math.min(window.devicePixelRatio || 1, ZIA_IMG_MAX_CANVAS_DPR);
      if (w >= 1 && h >= 1) {
        if (!ziaImgGLOk(eng) && inst.shownAtMs < 0 && inst.visible) {
          inst.shownAtMs = performance.now();
        }
        ziaImgRenderNow(eng, inst);
        inst.reveal.repaintHold();
      }
      ziaImgKick(eng);
    }

    const ro = new ResizeObserver(sync);
    ro.observe(host);
    let io = null;
    if (typeof IntersectionObserver === "function") {
      io = new IntersectionObserver(
        (entries) => {
          inst.inView = entries[entries.length - 1].isIntersecting;
          ziaImgUpdateVisible(eng, inst);
        },
        { rootMargin: "64px" },
      );
      io.observe(layer);
    }
    eng.instances.add(inst);
    sync();
    ziaImgKick(eng);

    return {
      element: layer,
      // dissolves into a snapshot of source (canvas, ImageBitmap, loaded <img>),
      // then holds it; false if it can't (nothing to show, or an image is
      // already dissolving in or shown: as the package, hide() first). Asked
      // during a hide, it starts when the hide ends; asked again before it
      // starts (minChurnMs), the newer source replaces the older
      reveal(source, options) {
        if (inst.destroyed || (inst.reveal.isActive() && inst.reveal.phase() !== "hide")) {
          return false;
        }
        const image = ziaImgSnapshot(source);
        if (!image) {
          return false;
        }
        inst.pending = { image, onDone: options && typeof options.onDone === "function" ? options.onDone : null };
        sync();
        ziaImgTryStart(eng, inst, performance.now());
        ziaImgKick(eng);
        return true;
      },
      hide() {
        if (inst.destroyed) {
          return;
        }
        inst.pending = null;
        // (the shader canvas sits at opacity 0 while held: the loop draws a
        // fresh frame before it fades back in)
        inst.reveal.startHide(ZIA_IMG_HIDE_MS, inst.reduced || !ziaImgGLOk(eng));
        ziaImgKick(eng);
      },
      setDark(value) {
        if (inst.destroyed || !!value === dark) {
          return;
        }
        dark = !!value;
        inst.preset = tuned(ZIA_IMG_PRESETS[name].modes[dark ? "dark" : "light"]);
        inst.colorsOverride = inst.palette && ziaImgRetint(inst.preset, inst.palette);
        inst.colors = null;
        inst.uniformsDirty = true;
        paintCard();
        ziaImgRenderNow(eng, inst);
      },
      destroy() {
        if (inst.destroyed) {
          return;
        }
        inst.destroyed = true;
        inst.pending = null;
        ro.disconnect();
        io?.disconnect();
        eng.instances.delete(inst);
        if (eng.lastInstance === inst) {
          eng.lastInstance = null;
        }
        inst.reveal.dispose();
        layer.remove();
        if (hostPosition !== null) {
          host.style.position = hostPosition;
        }
        ziaImgRelease(eng);
      },
    };
  }
  function safely(name, fn) {
    try {
      fn();
    } catch (err) {
      console.error(`[Zia] ${name} failed:`, err);
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
      for (const el of document.querySelectorAll("[zia-no-glow]")) {
        el.removeAttribute("zia-no-glow");
      }
      const tab = gBrowser.selectedTab;
      if (tab.hasAttribute("zen-essential")) {
        return;
      }
      // (a split glows as a whole: at the top, it's the split that goes
      // without, whichever of its tabs is open)
      const split = tab.group?.hasAttribute?.("split-view-group") ? tab.group : null;
      const glowing = split || tab;
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
        if (rows[0] === tab || (split && split.contains(rows[0]))) {
          glowing.setAttribute("zia-no-glow", "true");
        }
        return;
      }
      const mine = glowing.getBoundingClientRect();
      if (!mine.height) {
        return;
      }
      let above = false;
      for (const row of document.querySelectorAll(
        "#tabbrowser-tabs .tabbrowser-tab:not([zen-essential], [zen-empty-tab], [hidden]), #tabbrowser-tabs .tab-group-label-container"
      )) {
        if (row === tab || (split && split.contains(row))) {
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
      }
      if (!above) {
        glowing.setAttribute("zia-no-glow", "true");
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
    safely("closeSplitTabsInPlace", closeSplitTabsInPlace);
    safely("moveTabsLikeDia", moveTabsLikeDia);
    safely("hideTabListScrollbars", hideTabListScrollbars);
    safely("addFolderBounce", addFolderBounce);
    safely("keepFolderNamesInCollapsedSpaces", keepFolderNamesInCollapsedSpaces);
    safely("tuckAwayUnopenedPins", tuckAwayUnopenedPins);
    safely("revealOpenSubfolders", revealOpenSubfolders);
    safely("keepSeparatorWhenPinsTuck", keepSeparatorWhenPinsTuck);
    safely("keepTabsHiddenAfterActiveLeaves", keepTabsHiddenAfterActiveLeaves);
    safely("openKeptFolderNames", openKeptFolderNames);
    safely("allowEmojiFolderIcons", allowEmojiFolderIcons);
    safely("hideWwwInUrlbar", hideWwwInUrlbar);
    safely("watchRightEdges", watchRightEdges);
    ifOn("media-player", "watchMediaGlow", watchMediaGlow);
    ifOn("media-player", "cardForPositionlessMedia", cardForPositionlessMedia);
    safely("keepMediaCardsInPlace", keepMediaCardsInPlace);
    safely("watchTabSoundBars", watchTabSoundBars);
    safely("watchSelectedTabGlow", watchSelectedTabGlow);
    safely("watchSplitDrop", watchSplitDrop);
    safely("watchSplitPanes", watchSplitPanes);
    ifOn("find-bar", "watchFindBars", watchFindBars);
    safely("watchSpaceColor", watchSpaceColor);
    safely("animateEssentialsAdds", animateEssentialsAdds);
    ifOn("undo-close", "watchUndoClose", watchUndoClose);
    ifOn("tab-numbers", "watchTabNumbers", watchTabNumbers);
    safely("watchWelcome", watchWelcome);
    safely("watchGlanceThumbs", watchGlanceThumbs);
    safely("watchButtonTooltips", watchButtonTooltips);
    safely("watchTipCards", watchTipCards);
    safely("watchSidebarPanels", watchSidebarPanels);
    safely("watchTypedAddress", watchTypedAddress);
    safely("setupAddressBarCommands", setupAddressBarCommands);
    safely("registerScrollActor", registerScrollActor);
    safely("registerPdfActor", registerPdfActor);
    safely("watchScrollInput", watchScrollInput);
    safely("createTitleElement", createTitleElement);
    safely("watchTitleOnly", watchTitleOnly);
    safely("watchCenteredAddress", watchCenteredAddress);
    safely("watchScreenshotButtons", watchScreenshotButtons);
    safely("watchUltra", watchUltra);
    safely("addDownloadProgress", addDownloadProgress);
    safely("flyFirstDownloadToButton", flyFirstDownloadToButton);
    safely("flyDownloadRows", flyDownloadRows);
    safely("watchDownloadDialog", watchDownloadDialog);
    ifOn("icon-picker", "addIconPicker", addIconPicker);
    safely("watchCompactTopRow", watchCompactTopRow);
    safely("watchOldIcons", watchOldIcons);
    safely("watchNewFolders", watchNewFolders);
    safely("watchReopenedFolders", watchReopenedFolders);
    safely("keepRoomForEssentials", keepRoomForEssentials);
    safely("watchFolderColors", watchFolderColors);
    safely("watchFolderIcon", watchFolderIcon);
    safely("addFolderColorPicker", addFolderColorPicker);
    safely("watchGroupColors", watchGroupColors);
    safely("watchFolderCloseButtons", watchFolderCloseButtons);
    safely("watchEmptyFolders", watchEmptyFolders);
    safely("watchEssentialRows", watchEssentialRows);
    safely("watchSplitEssentials", watchSplitEssentials);
    safely("watchLightSpace", watchLightSpace);
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
        if (webProgress.isTopLevel && stateFlags & STATE_START) {
          blankLoadingNewTabAddress(browser, request);
        }
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
            showColor(ERROR_PAGE_COLOR);
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
        keepNewTabAddressEmpty(browser, location);

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
          showColor(ERROR_PAGE_COLOR);
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
    safely("addCopyLinkButton", addCopyLinkButton);
    safely("addToastCloseButtons", addToastCloseButtons);
    safely("suckInEssentialGlances", suckInEssentialGlances);
    safely("animateNavButtons", animateNavButtons);
    safely("springReloadHover", springReloadHover);
    safely("watchEdgeGlow", watchEdgeGlow);
    safely("watchExtensionIcons", watchExtensionIcons);
    safely("keepSidebarUnscrolledSideways", keepSidebarUnscrolledSideways);
    safely("watchColorDrift", watchColorDrift);
    safely("watchPopUpColor", watchPopUpColor);
    safely("addToolbarColorMenuItems", addToolbarColorMenuItems);
    safely("quietZenHaptics", quietZenHaptics);
    safely("watchHapticsMute", watchHapticsMute);
    safely("watchUnloadable", watchUnloadable);
    safely("watchPageFullscreen", watchPageFullscreen);
    safely("watchSwipeArrow", watchSwipeArrow);
    safely("revertTypedTextOnLeave", () => revertTypedTextOnLeave(urlbar));
    safely("neverShowScheme", neverShowScheme);
    safely("dressLibrary", dressLibrary);
    safely("clearLibraryBadgeSoon", clearLibraryBadgeSoon);
    safely("loadTidyDownloads", loadTidyDownloads);
    safely("watchLiquidGlass", watchLiquidGlass);
    safely("fixSettingsConditions", fixSettingsConditions);

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
