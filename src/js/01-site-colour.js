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
  async function sampleTopColor(browser) {
    const windowGlobal = browser?.browsingContext?.currentWindowGlobal;
    const width = browser?.clientWidth;
    if (!windowGlobal || !width) {
      return null;
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

