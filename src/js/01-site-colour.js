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
      console.info("[Zia] PDF view: helper registered");
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

