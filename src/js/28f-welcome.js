
  // The welcome tour (welcome/index.html): shown once on a first install,
  // and once after a release that has something to show, over a blurred
  // window. WELCOME_VERSION is the release that last asked for it: bump it
  // with that release ("release + welcome card"), and anyone who hasn't
  // seen that one gets the tour of what's new. Other releases leave it be.
  // Once closed it stays closed; it can be switched off after updates, or
  // asked for again, from Zia's settings.
  const WELCOME_VERSION = "2.76.0";
  const WELCOME_SEEN_PREF = "zia.welcome.seen";
  const WELCOME_UPDATES_PREF = "zia.welcome.show";
  const WELCOME_AGAIN_PREF = "zia.welcome.again";
  const WELCOME_URL = "chrome://sine/content/zia/welcome/index.html";

  function showWelcome(mode) {
    if (document.getElementById("zia-welcome")) {
      return;
    }
    const overlay = document.createElementNS(HTML_NS, "div");
    overlay.id = "zia-welcome";
    const frame = document.createElementNS(HTML_NS, "iframe");
    frame.setAttribute("src", `${WELCOME_URL}#${mode}`);
    frame.setAttribute("title", "Welcome to Zia");
    overlay.append(frame);

    const close = () => {
      if (!overlay.isConnected || overlay.hasAttribute("closing")) {
        return;
      }
      overlay.setAttribute("closing", "");
      setTimeout(() => overlay.remove(), 260);
      gBrowser.selectedBrowser?.focus();
    };
    frame.addEventListener("load", () => {
      try {
        frame.contentWindow.ziaWelcomeDone = close;
        frame.contentWindow.focus();
      } catch (err) {
        noteError("welcome: hook", err);
      }
    });
    document.documentElement.appendChild(overlay);
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

    // "Show the welcome tour again" in settings: shows it, then turns
    // itself back off
    const again = () => {
      if (!Services.prefs.getBoolPref(WELCOME_AGAIN_PREF, false)) {
        return;
      }
      Services.prefs.setBoolPref(WELCOME_AGAIN_PREF, false);
      if (Services.wm.getMostRecentWindow("navigator:browser") === window) {
        showWelcome("install");
      }
    };
    Services.prefs.addObserver(WELCOME_AGAIN_PREF, again);
    window.addEventListener("unload", () => Services.prefs.removeObserver(WELCOME_AGAIN_PREF, again));
    again();
  }
