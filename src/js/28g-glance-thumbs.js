
  // A page peeked at with Glance shows on its tab as a small picture of the
  // page, tipped at an angle, as in Dia, in place of Zen's icon tile.
  // Hovering the tab brings its close button over the picture, and that
  // first close shuts the glance; the next one closes the tab. It is
  // taken while the glance is on screen (Zia can only photograph a page
  // that's showing), when it opens, as it loads, and every few seconds
  // after, and kept when you switch away.
  const GLANCE_THUMB_PREF = "zia.glance.thumbnail";
  const GLANCE_THUMB_W = 36;
  const GLANCE_THUMB_H = 42;
  const GLANCE_THUMB_EVERY = 3000;

  function glanceTabsOnNormalTabs() {
    return [...gBrowser.tabContainer.querySelectorAll(
      ".tabbrowser-tab:not([zen-essential]) > .tab-stack > .tab-content > .tabbrowser-tab[zen-glance-tab]"
    )];
  }

  // Where the tab the glance sits on ends, so the picture is cut off there
  function cutGlanceAtTab(glanceTab) {
    const background = glanceTab.parentElement
      ?.closest(".tabbrowser-tab")
      ?.querySelector(":scope > .tab-stack > .tab-background");
    if (!background) {
      return;
    }
    const cut = glanceTab.getBoundingClientRect().bottom - background.getBoundingClientRect().bottom;
    glanceTab.style.setProperty("--zia-glance-cut", `${Math.round(cut * 2) / 2}px`);
  }

  // The canvas that sits over a glance tab's tile
  function glanceThumbParts(glanceTab) {
    const stack = glanceTab.querySelector(":scope > .tab-stack");
    if (!stack) {
      return null;
    }
    cutGlanceAtTab(glanceTab);
    let canvas = stack.querySelector(":scope > .zia-glance-thumb");
    if (!canvas) {
      canvas = document.createElementNS(HTML_NS, "canvas");
      canvas.className = "zia-glance-thumb";
      const ratio = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.round(GLANCE_THUMB_W * ratio);
      canvas.height = Math.round(GLANCE_THUMB_H * ratio);
      stack.append(canvas);
    }
    return canvas;
  }

  async function photographGlance(glanceTab) {
    const canvas = glanceThumbParts(glanceTab);
    const browser = glanceTab.linkedBrowser;
    const windowGlobal = browser?.browsingContext?.currentWindowGlobal;
    const width = browser?.clientWidth;
    const height = browser?.clientHeight;
    if (!canvas || !windowGlobal || !width || !height) {
      return;
    }
    // The top of the page, cut to the tile's shape
    const rectHeight = Math.min(height, (width * GLANCE_THUMB_H) / GLANCE_THUMB_W);
    const scale = canvas.width / width;
    let bitmap = null;
    try {
      bitmap = await windowGlobal.drawSnapshot(new DOMRect(0, 0, width, rectHeight), scale, "white");
    } catch (err) {
      return;
    }
    if (!bitmap || !canvas.isConnected) {
      bitmap?.close();
      return;
    }
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    glanceTab.setAttribute("zia-glance-thumb", "true");
  }

  // The glance on a normal tab, if it has one
  function glanceOnTab(tab) {
    return tab && !tab.hasAttribute("zen-essential")
      ? tab.querySelector(":scope > .tab-stack > .tab-content > .tabbrowser-tab[zen-glance-tab]")
      : null;
  }

  function closeGlanceOn(glanceTab) {
    const parent = glanceTab.parentElement?.closest(".tabbrowser-tab");
    try {
      if ((glanceTab.selected || parent?.selected) && window.gZenGlanceManager?.closeGlance) {
        window.gZenGlanceManager.closeGlance({ onTabClose: true });
      } else {
        gBrowser.removeTab(glanceTab, { animate: false });
      }
    } catch (err) {
      noteError("glance thumbnail: close", err);
    }
  }

  function watchGlanceThumbs() {
    const on = () => Services.prefs.getBoolPref(GLANCE_THUMB_PREF, true);
    // on unless switched off: the styles look for this mark, not the setting
    const markOff = () => setFlag("zia-glance-thumb-off", !on());
    markOff();
    Services.prefs.addObserver(GLANCE_THUMB_PREF, markOff);
    const photographShowing = () => {
      if (!on() || document.hidden) {
        return;
      }
      for (const glanceTab of glanceTabsOnNormalTabs()) {
        const parent = glanceTab.parentElement?.closest(".tabbrowser-tab");
        // only a glance that's on screen: while it's open Zen selects the
        // glance's own tab, not the one it came from
        if (glanceTab.selected || parent?.selected) {
          photographGlance(glanceTab);
        } else {
          glanceThumbParts(glanceTab);
        }
      }
    };

    // A glance opening: photographed as it appears, as it loads, and after
    new MutationObserver((records) => {
      if (records.some((r) => r.target.hasAttribute?.("zen-glance-tab"))) {
        [150, 600, 1500].forEach((ms) => setTimeout(photographShowing, ms));
      }
    }).observe(gBrowser.tabContainer, { subtree: true, attributes: true, attributeFilter: ["zen-glance-tab"] });
    gBrowser.tabContainer.addEventListener("TabSelect", () => setTimeout(photographShowing, 300));
    gBrowser.addTabsProgressListener({
      onStateChange(browser, webProgress, request, flags) {
        if (webProgress?.isTopLevel && flags & Ci.nsIWebProgressListener.STATE_STOP &&
            gBrowser.getTabForBrowser(browser)?.hasAttribute("zen-glance-tab")) {
          setTimeout(photographShowing, 200);
        }
      },
    });
    setInterval(photographShowing, GLANCE_THUMB_EVERY);
    photographShowing();

    // A tab with a glance: its close button, which sits over the picture,
    // closes the glance first, and only then the tab
    const glanceUnderClose = (event) => {
      if (!on() || event.button !== 0) {
        return null;
      }
      const close = event.target?.closest?.(".tab-close-button");
      const tab = close?.closest(".tabbrowser-tab");
      return close?.parentElement?.parentElement?.parentElement === tab ? glanceOnTab(tab) : null;
    };
    gBrowser.tabContainer.addEventListener(
      "click",
      (event) => {
        const glanceTab = glanceUnderClose(event);
        if (glanceTab) {
          event.preventDefault();
          event.stopPropagation();
          closeGlanceOn(glanceTab);
        }
      },
      true
    );
    for (const type of ["mousedown", "mouseup"]) {
      gBrowser.tabContainer.addEventListener(
        type,
        (event) => {
          if (glanceUnderClose(event)) {
            event.stopPropagation();
          }
        },
        true
      );
    }
  }
