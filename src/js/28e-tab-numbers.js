
  // Tab numbers: hold Cmd (Ctrl on Windows and Linux) and a small key shows
  // at the end of each tab, and in the corner of each essential. Every tab
  // you can see has one, essentials first, and Zia takes over Cmd/Ctrl+
  // digit so each is reachable: Firefox's own shortcuts stop at 8 (9 is the
  // last tab). Each digit goes straight to its tab; past nine tabs, a
  // second digit pressed soon after carries on from the first (1 then 2
  // for the twelfth). The keys show the moment it goes down and stay until
  // it's let go or the window is left. Optionally they show all the time.
  const TAB_NUMBERS_ALWAYS_PREF = "zia.tab-numbers.always";
  // how soon a second digit must follow to carry on from the first
  const TAB_NUMBER_FOLLOW = 1000;

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
        key = document.createElementNS(HTML_NS, "span");
        key.className = "zia-tab-number";
        key.setAttribute("aria-hidden", "true");
        tab.querySelector(":scope > .tab-stack > .tab-content")?.append(key);
      }
      if (key.textContent !== String(number)) {
        key.textContent = String(number);
      }
    }
    return tabs;
  }

  function watchTabNumbers() {
    const mac = AppConstants.platform === "macosx";
    const isModKey = (event) => event.key === (mac ? "Meta" : "Control");
    const modHeld = (event) =>
      (mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey) && !event.altKey && !event.shiftKey;

    let tabs = [];
    let typed = "";
    let typedAt = 0;
    let lastDigit = null;

    const show = () => {
      tabs = numberTabs();
      setFlag("zia-tab-numbers", true);
    };
    const hide = () => {
      typed = "";
      setFlag("zia-tab-numbers", false);
    };
    const startsANumber = (prefix) => {
      for (let n = 1; n <= tabs.length; n++) {
        if (String(n).startsWith(prefix)) {
          return true;
        }
      }
      return false;
    };

    const onDigit = (digit) => {
      if (!root.hasAttribute("zia-tab-numbers")) {
        show();
      }
      // Carries on from the digit before, if it came soon and together
      // they name a tab; otherwise starts again from this one
      const now = Date.now();
      const next = now - typedAt < TAB_NUMBER_FOLLOW ? typed + digit : digit;
      typed = startsANumber(next) ? next : startsANumber(digit) ? digit : "";
      typedAt = now;
      const tab = typed ? tabs[Number(typed) - 1] : null;
      if (tab?.isConnected) {
        gBrowser.selectedTab = tab;
      }
      // Nothing longer starts with it: the next digit starts afresh
      if (!typed || Number(`${typed}0`) > tabs.length) {
        typed = "";
      }
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
          }
        },
        options
      );
      window.addEventListener(
        "keyup",
        (event) => {
          if (isModKey(event)) {
            hide();
          }
        },
        options
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
    Services.prefs.addObserver(TAB_NUMBERS_ALWAYS_PREF, renumber);
    renumber();
  }
