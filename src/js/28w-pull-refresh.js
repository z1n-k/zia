  // ---------- Pull to refresh (zia.pull-refresh): pulling the page down past its top (a trackpad
  // or Magic Mouse scroll, read in the page by ZiaChild) brings a bubble with the refresh arrow
  // down from the top of the page, the arrow turning as it comes; let go past PULL_FULL and the
  // page reloads, short of it and the bubble goes. As on a phone.
  // Used elsewhere: addPullRefresh.
  const PULL_PREF = "zia.pull-refresh";
  // (as ZiaChild's PULL_FULL: a real trackpad pull passes 200 in a tenth of a second, and lower
  // went off with a casual scroll up at the top)
  const PULL_FULL = 200;
  // (the arrow spins from the let go until the page has loaded, at least this long, at most
  // PULL_RELOAD_MAX_MS)
  const PULL_RELOAD_SHOW_MS = 600;
  const PULL_RELOAD_MAX_MS = 8000;
  // (after a pull reloads, the reloaded page still gets the rest of the trackpad's coast, from
  // its top, and read it as another pull: none for this long)
  const PULL_QUIET_MS = 1600;

  function addPullRefresh() {
    let bubble = null;
    let armed = false;
    let leaveTimer = 0;
    let reloadedAt = 0;

    const bubbleFor = (browser) => {
      const stack = browser.closest(".browserStack");
      if (!stack) {
        return null;
      }
      if (bubble?.parentNode !== stack) {
        bubble?.remove();
        bubble = document.createElementNS(XHTML_NS, "div");
        bubble.id = "zia-pull";
        const icon = document.createElementNS(XHTML_NS, "img");
        icon.setAttribute("src", "chrome://sine/content/zia/icons/ui/refresh.svg");
        icon.setAttribute("alt", "");
        bubble.append(icon);
        stack.append(bubble);
      }
      return bubble;
    };

    const leave = (el) => {
      el.setAttribute("zia-leaving", "");
      el.style.setProperty("--p", "0");
      el.removeAttribute("armed");
      el.removeAttribute("reloading");
    };

    window.ziaOnPagePull = (browser, data) => {
      if (browser !== gBrowser.selectedBrowser || !Services.prefs.getBoolPref(PULL_PREF, true) || Date.now() - reloadedAt < PULL_QUIET_MS) {
        return;
      }
      const el = bubbleFor(browser);
      if (!el) {
        return;
      }
      if (el.hasAttribute("reloading")) {
        return;
      }
      clearTimeout(leaveTimer);
      el.removeAttribute("zia-leaving");
      const p = Math.min(1, Math.max(0, (Number(data?.pull) || 0) / PULL_FULL));
      el.style.setProperty("--p", p.toFixed(3));
      if (p >= 1 && !armed) {
        armed = true;
        el.setAttribute("armed", "");
        swipeTap(true);
      } else if (p < 1 && armed) {
        armed = false;
        el.removeAttribute("armed");
      }
      if (!data?.end) {
        return;
      }
      const reload = armed;
      armed = false;
      if (!reload) {
        leave(el);
        return;
      }
      el.setAttribute("reloading", "");
      reloadedAt = Date.now();
      try {
        BrowserCommands.reload();
      } catch (err) {
        gBrowser.reloadTab(gBrowser.selectedTab);
      }
      const loaded = () => {
        const waited = Date.now() - reloadedAt;
        if (waited >= PULL_RELOAD_MAX_MS || !browser.webProgress?.isLoadingDocument || !el.hasAttribute("reloading")) {
          leave(el);
        } else {
          leaveTimer = setTimeout(loaded, 100);
        }
      };
      leaveTimer = setTimeout(loaded, PULL_RELOAD_SHOW_MS);
    };
    gBrowser.tabContainer.addEventListener("TabSelect", () => bubble && leave(bubble));
  }
