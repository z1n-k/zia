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

  function watchUltra() {
    safely("watchUltraOrbs", watchUltraOrbs);
  }
