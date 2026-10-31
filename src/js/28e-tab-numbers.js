  // Tab numbers: hold Cmd (Ctrl elsewhere) and a key shows on every visible tab and
  // essential, Zia taking over Cmd/Ctrl+digit so all are reachable (Firefox's stop at
  // 8). The typed number lights up and is chosen only on letting go, so nothing loads
  // by accident; past nine, type the digits in turn. Optionally shown all the time.
  // Used elsewhere: watchTabNumbers.
  const TAB_NUMBERS_ALWAYS_PREF = "zia.tab-numbers.always";
  const TAB_NUMBERS_COLOR_PREF = "zia.tab-numbers.color";
  const TAB_NUMBERS_LEAVE_MS = 110;

  // While the keys are up: the tabs they number, the digits typed so far, the last digit
  // handled (each is seen twice, see watchTabNumbers), the keys' leaving timer, and
  // whether a renumbering waits for the next frame
  const tabKeys = { tabs: [], typed: "", lastDigit: null, leaving: null, queued: false };

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

  function isModKey(event) {
    return event.key === (AppConstants.platform === "macosx" ? "Meta" : "Control");
  }

  function modHeld(event) {
    const mac = AppConstants.platform === "macosx";
    return (mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey) && !event.altKey && !event.shiftKey;
  }

  // The key of the tab typed so far lights up
  function markTarget() {
    tabKeys.tabs.forEach((tab, i) => keyOf(tab)?.toggleAttribute("zia-target", !!tabKeys.typed && Number(tabKeys.typed) === i + 1));
  }

  function showTabNumbers() {
    clearTimeout(tabKeys.leaving);
    setFlag("zia-tab-numbers-leaving", false);
    tabKeys.tabs = numberTabs();
    setFlag("zia-tab-numbers", true);
  }

  // Letting go, the keys slide back off to the right the way they came
  function hideTabNumbers() {
    tabKeys.typed = "";
    markTarget();
    if (root.hasAttribute("zia-tab-numbers") && !Services.prefs.getBoolPref(TAB_NUMBERS_ALWAYS_PREF, false)) {
      setFlag("zia-tab-numbers-leaving", true);
      clearTimeout(tabKeys.leaving);
      tabKeys.leaving = setTimeout(() => setFlag("zia-tab-numbers-leaving", false), TAB_NUMBERS_LEAVE_MS);
    }
    setFlag("zia-tab-numbers", false);
  }

  // Letting go: the tab typed, if any
  function chooseTypedTab() {
    const tab = tabKeys.typed ? tabKeys.tabs[Number(tabKeys.typed) - 1] : null;
    hideTabNumbers();
    if (tab?.isConnected) {
      gBrowser.selectedTab = tab;
    }
  }

  function startsATabNumber(prefix) {
    return tabKeys.tabs.some((_, i) => String(i + 1).startsWith(prefix));
  }

  function typeTabDigit(digit) {
    if (!root.hasAttribute("zia-tab-numbers")) {
      showTabNumbers();
    }
    // Carries on from the digits before if together they still name a
    // tab; otherwise starts again from this one
    const next = tabKeys.typed + digit;
    tabKeys.typed = startsATabNumber(next) ? next : startsATabNumber(digit) ? digit : "";
    markTarget();
  }

  function onTabNumberKeyDown(event) {
    if (isModKey(event)) {
      if (!event.repeat && !root.hasAttribute("zia-tab-numbers")) {
        showTabNumbers();
      }
      return;
    }
    const digit = /^(?:Digit|Numpad)([0-9])$/.exec(event.code)?.[1];
    // A 0 names no tab on its own (they're counted from 1): it's Firefox's own
    // Cmd/Ctrl+0, the page back to its own size, unless it carries on a number
    // being typed (10, 20…). Held back, the zoom couldn't be reset.
    if (digit === "0" && modHeld(event) && !(tabKeys.typed && startsATabNumber(`${tabKeys.typed}0`))) {
      return;
    }
    if (digit !== undefined && modHeld(event)) {
      event.preventDefault();
      event.stopPropagation();
      const stamp = `${event.timeStamp}:${event.code}`;
      if (stamp !== tabKeys.lastDigit && !event.repeat) {
        tabKeys.lastDigit = stamp;
        typeTabDigit(digit);
      }
    } else if (root.hasAttribute("zia-tab-numbers")) {
      // Any other shortcut (Cmd+W, Cmd+T…) or key: the keys go, and
      // nothing is chosen. Closing a tab can lose the letting go of
      // Cmd, which would otherwise leave them up.
      hideTabNumbers();
    }
  }

  function onTabNumberKeyUp(event) {
    if (isModKey(event)) {
      chooseTypedTab();
    }
  }

  // Should the letting go of Cmd still be missed, the next key or move
  // of the mouse without it held puts the keys away
  function putAwayStrayNumbers(event) {
    const heldStill = AppConstants.platform === "macosx" ? event.metaKey : event.ctrlKey;
    if (root.hasAttribute("zia-tab-numbers") && !heldStill && !isModKey(event)) {
      hideTabNumbers();
    }
  }

  // Only when the window itself is left: focus moving into the page just
  // chosen reads as a blur too, with the key still held
  function onTabNumbersBlur(event) {
    if (event.target !== window) {
      return;
    }
    setTimeout(() => {
      if (Services.focus.activeWindow !== window) {
        hideTabNumbers();
      }
    }, 0);
  }

  // Kept up to date as tabs come and go, for when they show all the time
  function renumberTabs() {
    if (tabKeys.queued || !(root.hasAttribute("zia-tab-numbers") || Services.prefs.getBoolPref(TAB_NUMBERS_ALWAYS_PREF, false))) {
      return;
    }
    tabKeys.queued = true;
    requestAnimationFrame(() => {
      tabKeys.queued = false;
      tabKeys.tabs = numberTabs();
    });
  }

  // Zia blue or the space's colour for the number being typed
  function showTypedNumberColor() {
    const space = Services.prefs.getStringPref(TAB_NUMBERS_COLOR_PREF, "zia") === "space";
    setAttr(root, "zia-tab-number-color", space ? "space" : null);
  }

  function watchTabNumbers() {
    // Seen both ways: keys pressed in a page reach the window only
    // afterwards, in the system group. A digit is handled once, but held
    // back from Firefox's own shortcut both times.
    for (const options of [{ capture: true }, { capture: true, mozSystemGroup: true }]) {
      window.addEventListener("keydown", onTabNumberKeyDown, options);
      window.addEventListener("keyup", onTabNumberKeyUp, options);
    }
    for (const type of ["mousemove", "mousedown", "wheel", "keyup"]) {
      window.addEventListener(type, putAwayStrayNumbers, { capture: true, passive: true });
    }
    window.addEventListener("blur", onTabNumbersBlur);
    document.addEventListener("visibilitychange", () => document.hidden && hideTabNumbers());

    // TabSelect too: the newly selected tab can be redrawn, losing its key
    for (const type of ["TabSelect", "TabOpen", "TabClose", "TabMove", "TabShow", "TabHide", "TabPinned", "TabUnpinned", "TabGrouped", "TabUngrouped", "TabGroupExpand", "TabGroupCollapse"]) {
      gBrowser.tabContainer.addEventListener(type, renumberTabs);
    }
    window.addEventListener("ZenWorkspacesUIUpdate", renumberTabs);
    window.addEventListener("ZenWorkspaceChanged", renumberTabs);
    watchPrefs(TAB_NUMBERS_ALWAYS_PREF, renumberTabs);

    showTypedNumberColor();
    watchPrefs(TAB_NUMBERS_COLOR_PREF, showTypedNumberColor);
    renumberTabs();
  }
