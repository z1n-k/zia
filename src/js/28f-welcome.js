  // The welcome tour (welcome/index.html): once on a first install, and once after
  // a release that bumps WELCOME_VERSION ("release + welcome card"), over a dimmed
  // window. Closed, it stays closed; settings can switch it off or show it again.
  const WELCOME_VERSION = "2.95.9";
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
    frame.setAttribute("src", `${WELCOME_URL}#${mode === "update" ? `update-${WELCOME_VERSION}` : mode}`);
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
