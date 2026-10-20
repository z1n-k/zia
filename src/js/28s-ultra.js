  // ---------- Ultra (zia.ultra, on by default)
  // Effects ported from Libraries.dev (https://libraries.dev, MIT, by Jakub
  // Antalik), each where its author places it: a thinking orb for loading, a
  // glow under what's playing, a border beam while a page loads, a liquid
  // highlight moving between tabs.
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

  // The address bar's loading line as border-beam's beam along its bottom edge,
  // in its blue "ocean" colours (28u-ultra-beam-engine.js), once the page has
  // been loading a moment; Zia's own line gives way to it (28-ultra.css). Zia keeps zia-loading on the root
  // until its line has finished.
  function watchUltraLoadingBeam() {
    const urlbar = gURLBar.textbox || document.getElementById("urlbar");
    if (!urlbar) {
      return;
    }
    let timer = 0;
    const sync = () => {
      clearTimeout(timer);
      if (!ultraOn() || root.getAttribute("zia-loading") !== "true") {
        ziaBeam(urlbar, "line", false);
        return;
      }
      if (urlbar.getAttribute("zia-beam") === "line") {
        // (back on, if it was fading out)
        ziaBeam(urlbar, "line");
      } else {
        timer = setTimeout(() => ziaBeam(urlbar, "line"), 600);
      }
    };
    new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ["zia-loading"] });
    watchPrefs(ULTRA_PREF, sync);
    sync();
  }

  // The selected tab's highlight travels to the tab you pick as liquid,
  // stretching and settling (28v-ultra-goo-engine.js, liquid-gooey's "move").
  // Only between plain tabs of one space, both on screen and not far apart;
  // anything else switches as before.
  function watchUltraGoo() {
    const BG = ":scope > .tab-stack > .tab-background";
    // (px: a longer jump just switches)
    const MAX_TRAVEL = 12 * 38;
    const spaces = new WeakMap();
    // the one moving now, if any
    let current = null;

    const bgOf = (tab) => tab?.querySelector?.(BG);
    const boxOf = (tab) => tab?.closest?.("zen-workspace arrowscrollbox.workspace-arrowscrollbox");
    const scrollportOf = (box) =>
      (box.scrollbox || box.shadowRoot?.querySelector('[part~="scrollbox"]'))?.getBoundingClientRect();
    const plain = (tab) =>
      tab?.isConnected &&
      !tab.closing &&
      !tab.hidden &&
      !tab.hasAttribute("zen-essential") &&
      !tab.closest("tab-group[split-view-group], :is(zen-folder, tab-group)[collapsed]");
    const light = () => root.hasAttribute("zia-light");

    const gooFor = (box) => {
      const known = spaces.get(box);
      if (known?.layer.isConnected) {
        return known.goo;
      }
      known?.goo.destroy();
      const layer = document.createElementNS(XHTML_NS, "div");
      layer.className = "zia-goo-layer";
      layer.setAttribute("aria-hidden", "true");
      box.prepend(layer);
      const goo = ziaGoo(layer, {
        radius: parseFloat(getComputedStyle(root).getPropertyValue("--zia-tab-radius")) || 9.5,
        background: "var(--zia-active-tab-bg)",
        bounds: () => scrollportOf(box),
        onStart: () => root.setAttribute("zia-goo-travel", "true"),
        onSettle: () => {
          root.removeAttribute("zia-goo-travel");
          current = null;
        },
      });
      spaces.set(box, { goo, layer });
      return goo;
    };

    // The highlight's look, from the tab now showing it: its own glow (plain,
    // in its favicon's colours, the light card's shadow, or none), and its
    // shine as a fine ring
    let lastShadow = null;
    const shadowOf = (bg) => {
      const own = getComputedStyle(bg).boxShadow;
      const ring = light() ? "inset 0 0 0 0.5px rgba(0,0,0,.07)" : "inset 0 0 0 0.5px rgba(255,255,255,.17)";
      return own && own !== "none" ? `${own}, ${ring}` : ring;
    };
    // (a folder's open tab is its own shade)
    const colourOf = (bg) => getComputedStyle(bg).getPropertyValue("--zia-active-tab-bg").trim();

    gBrowser.tabContainer.addEventListener("TabSelect", (event) => {
      const tab = event.target;
      const prev = event.detail?.previousTab;
      const box = boxOf(tab);
      const expanded = root.getAttribute("zen-sidebar-expanded") === "true";
      if (!ultraOn() || document.hidden || !expanded || !plain(tab) || !box) {
        current?.stop();
        return;
      }
      const to = bgOf(tab).getBoundingClientRect();
      if (current) {
        // mid-move: on to the new tab, in the same space
        if (spaces.get(box)?.goo === current) {
          current.moveTo(null, to);
        } else {
          current.stop();
        }
        return;
      }
      if (!plain(prev) || boxOf(prev) !== box) {
        return;
      }
      const from = bgOf(prev).getBoundingClientRect();
      const port = scrollportOf(box);
      const onScreen = (r) => r.height > 4 && port && r.bottom > port.top && r.top < port.bottom;
      if (!onScreen(from) || Math.abs(to.top - from.top) > MAX_TRAVEL || Math.abs(to.height - from.height) > 1) {
        return;
      }
      const goo = gooFor(box);
      const shadow = shadowOf(bgOf(tab));
      if (shadow !== lastShadow) {
        goo.restyle({ shadow });
        lastShadow = shadow;
      }
      current = goo;
      goo.moveTo(from, to, { fromBackground: colourOf(bgOf(prev)), background: colourOf(bgOf(tab)) });
    });

    // The tabs moving under it: straight over to the real highlight
    for (const type of ["TabClose", "TabMove", "TabGroupCollapse", "TabGroupExpand", "dragstart"]) {
      gBrowser.tabContainer.addEventListener(type, () => current?.stop(), true);
    }
    // (a space switch, as 04-space-label.js listens)
    window.addEventListener("ZenWorkspacesUIUpdate", () => current?.stop());
    watchPrefs(ULTRA_PREF, () => {
      if (!ultraOn()) {
        current?.stop();
      }
    });
  }

  function watchUltra() {
    safely("watchUltraOrbs", watchUltraOrbs);
    safely("watchUltraGlow", watchUltraGlow);
    safely("watchUltraLoadingBeam", watchUltraLoadingBeam);
    safely("watchUltraGoo", watchUltraGoo);
  }
