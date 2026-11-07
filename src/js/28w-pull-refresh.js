  // ---------- Pull to refresh (zia.pull-refresh): pulling the page down past its top (a trackpad
  // or Magic Mouse scroll, read in the page by ZiaChild) brings a bubble with the refresh arrow
  // down from the top of the page, the arrow turning as it comes; let go past PULL_FULL and the
  // page reloads, short of it and the bubble goes. As on a phone.
  // Used elsewhere: addPullRefresh.
  const PULL_PREF = "zia.pull-refresh";
  // (Firefox passes on little of a pull once the page is bouncing at its top: 150 was rarely reached)
  const PULL_FULL = 90;
  const PULL_RELOAD_SHOW_MS = 500;

  function addPullRefresh() {
    let bubble = null;
    let armed = false;
    let leaveTimer = 0;

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
      if (browser !== gBrowser.selectedBrowser || !Services.prefs.getBoolPref(PULL_PREF, true)) {
        return;
      }
      const el = bubbleFor(browser);
      if (!el) {
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
      try {
        BrowserCommands.reload();
      } catch (err) {
        gBrowser.reloadTab(gBrowser.selectedTab);
      }
      leaveTimer = setTimeout(() => leave(el), PULL_RELOAD_SHOW_MS);
    };
    gBrowser.tabContainer.addEventListener("TabSelect", () => bubble && leave(bubble));
  }
