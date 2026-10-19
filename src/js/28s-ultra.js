  // ---------- Ultra (zia.ultra, off by default)
  // Effects ported from Libraries.dev (https://libraries.dev, MIT, by Jakub
  // Antalik), each where its author places it: a thinking orb for loading.
  const ULTRA_PREF = "zia.ultra";
  const ultraOn = () => Services.prefs.getBoolPref(ULTRA_PREF, false);

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

  // The music player card glows along its bottom edge while it plays, as
  // voice-glow's beam does under a voice (28t-ultra-glow-engine.js): the
  // browser can't hear the tab, so it follows a gentle, music-like level, and
  // sinks and fades out when paused. Under the card's text and buttons.
  function watchUltraGlow() {
    const glows = new Map();
    const dark = () => !root.hasAttribute("zia-light");
    const cards = () => document.querySelectorAll("#zen-media-controls-toolbar .zen-media-card");

    const sync = () => {
      const on = ultraOn();
      const seen = new Set();
      for (const card of on ? cards() : []) {
        seen.add(card);
        let glow = glows.get(card);
        if (!glow) {
          glow = ziaGlow(card, { dark: dark() });
          glows.set(card, glow);
        }
        glow.setPlaying(card.classList.contains("playing"));
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
      new MutationObserver(sync).observe(toolbar, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    }
    new MutationObserver(() => {
      for (const glow of glows.values()) {
        glow.setDark(dark());
      }
    }).observe(root, { attributes: true, attributeFilter: ["zia-light"] });
    watchPrefs(ULTRA_PREF, sync);
    sync();
  }

  function watchUltra() {
    safely("watchUltraOrbs", watchUltraOrbs);
    safely("watchUltraGlow", watchUltraGlow);
  }
