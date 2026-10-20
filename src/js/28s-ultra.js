  // ---------- Ultra (zia.ultra, on by default)
  // Effects ported from Libraries.dev (https://libraries.dev, MIT, by Jakub
  // Antalik), each where its author places it: a thinking orb for loading, a
  // glow under what's playing, the Library's chosen section springing to the
  // next, and the colour round the open essential drifting.
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
      // centred on the tab's own icon (its spinner, while loading), which sits in a
      // wider box with uneven margins: centred in the box, or at its start, the orb
      // sat a few pixels right, then left, of the icons in the other tabs
      const icon = [...stack.querySelectorAll(":scope > :is(.tab-icon-image, .tab-throbber, .tab-icon-pending)")]
        .map((el) => el.getBoundingClientRect())
        .find((box) => box.width > 0 && box.height > 0);
      if (icon) {
        const own = canvas.getBoundingClientRect();
        canvas.style.translate = `${icon.left + icon.width / 2 - (own.left + own.width / 2)}px ${icon.top + icon.height / 2 - (own.top + own.height / 2)}px`;
      }
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

  // The colour Zen draws round the open essential's inner card (its icon's, blurred:
  // Zen's "essentials favicon background") slowly moving about: it turns, drifts
  // and swells on cycles of their own lengths, so the colours wander round the edge
  // without repeating for minutes. Still under reduced motion. Set going by Zia
  // rather than in CSS, on the page's own clock: Zen draws the colour only while the
  // essential is chosen, and as a CSS animation it started again from the beginning
  // each time it came back (a glance on the essential closing, say), a jump. Set
  // going again each time, it comes back where it would be had it run all along.
  const ESSENTIAL_DRIFT = [
    [[{ rotate: "0deg" }, { rotate: "360deg" }], { duration: 37000, direction: "normal" }],
    [
      [
        { translate: "-6% -4%", easing: "ease-in-out" },
        { translate: "5% -2%", offset: 0.3, easing: "ease-in-out" },
        { translate: "-2% 6%", offset: 0.55, easing: "ease-in-out" },
        { translate: "6% 3%", offset: 0.8, easing: "ease-in-out" },
        { translate: "-4% 5%" },
      ],
      { duration: 23000, direction: "alternate" },
    ],
    [[{ scale: 1.1, easing: "ease-in-out" }, { scale: 1.35 }], { duration: 17000, direction: "alternate" }],
  ];

  function watchUltraEssentialDrift() {
    const drifting = new Map();
    const still = matchMedia("(prefers-reduced-motion: reduce)");
    const wanted = () => ultraOn() && Services.prefs.getBoolPref("zen.theme.essentials-favicon-bg", false) && !still.matches;
    const stop = () => {
      for (const animations of drifting.values()) {
        for (const animation of animations) {
          animation.cancel();
        }
      }
      drifting.clear();
    };
    const start = (tab) => {
      const background = tab.querySelector(":scope > .tab-stack > .tab-background");
      if (!background) {
        return;
      }
      for (const animation of drifting.get(background) || []) {
        animation.cancel();
      }
      drifting.set(
        background,
        ESSENTIAL_DRIFT.map(([keyframes, timing]) => {
          const animation = background.animate(keyframes, { ...timing, iterations: Infinity, pseudoElement: "::after" });
          // (the page's clock: wherever it's started, it's where the others are)
          animation.startTime = 0;
          return animation;
        })
      );
    };
    const sync = () => {
      stop();
      if (!wanted()) {
        return;
      }
      for (const tab of document.querySelectorAll(".tabbrowser-tab[zen-essential][visuallyselected]")) {
        start(tab);
      }
    };
    // (an essential chosen again: its colour is drawn anew, so its drift too)
    new MutationObserver((records) => {
      if (!wanted()) {
        return;
      }
      for (const { target } of records) {
        if (target.hasAttribute("zen-essential") && target.hasAttribute("visuallyselected")) {
          start(target);
        }
      }
      for (const [background, animations] of drifting) {
        if (!background.isConnected) {
          animations.forEach((animation) => animation.cancel());
          drifting.delete(background);
        }
      }
    }).observe(gNavToolbox, { subtree: true, attributes: true, attributeFilter: ["visuallyselected"] });
    watchPrefs([ULTRA_PREF, "zen.theme.essentials-favicon-bg"], sync);
    still.addEventListener("change", sync);
    sync();
  }

  function watchUltra() {
    safely("watchUltraOrbs", watchUltraOrbs);
    safely("watchUltraGlow", watchUltraGlow);
    safely("watchUltraEssentialDrift", watchUltraEssentialDrift);
  }
