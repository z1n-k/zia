
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
  // the sink in chrome.css; the hover tip eases home first
  const GLANCE_THUMB_SINK_MS = 300;
  const GLANCE_THUMB_UNTIP_MS = 450;
  const glanceHost = new WeakMap();
  // A close is marked as soon as the picture starts sinking, so the glance
  // mark coming off afterwards does not play the sink a second time.
  // Splitting also drops the mark, then immediately rebuilds the tab strip.
  // The sink waits out that rebuild, or the strip work eats into it and
  // the drop looks quicker than a close or an expand.
  const glanceClosing = new WeakSet();
  let glanceSplitOpen = false;

  function glanceTabsOnNormalTabs() {
    return [...gBrowser.tabContainer.querySelectorAll(
      ".tabbrowser-tab:not([zen-essential]) > .tab-stack > .tab-content > .tabbrowser-tab[zen-glance-tab]"
    )];
  }

  // Where the tab the glance sits on ends, so the picture is cut off there
  // (insets from the glance's own edges)
  function cutGlanceAtTab(glanceTab) {
    const background = glanceTab.parentElement
      ?.closest(".tabbrowser-tab")
      ?.querySelector(":scope > .tab-stack > .tab-background");
    if (!background) {
      return;
    }
    const glance = glanceTab.getBoundingClientRect();
    const tab = background.getBoundingClientRect();
    const px = (n) => `${Math.round(n * 2) / 2}px`;
    glanceTab.style.setProperty("--zia-glance-cut-top", px(tab.top - glance.top));
    glanceTab.style.setProperty("--zia-glance-cut-right", px(glance.right - tab.right));
    glanceTab.style.setProperty("--zia-glance-cut-bottom", px(glance.bottom - tab.bottom));
    const host = background.closest(".tabbrowser-tab");
    if (host && host !== glanceTab) {
      glanceHost.set(glanceTab, host);
    }
  }

  // Opening a glance into a real tab keeps the tab and drops the glance
  // mark. The picture was drawn on that tab, so without this it stays
  // in the stack and covers the site's icon.
  function clearGlanceThumb(glanceTab) {
    glanceTab.removeAttribute("zia-glance-thumb");
    glanceTab.style.removeProperty("--zia-glance-cut-top");
    glanceTab.style.removeProperty("--zia-glance-cut-right");
    glanceTab.style.removeProperty("--zia-glance-cut-bottom");
    glanceTab.querySelector(":scope > .tab-stack > .zia-glance-thumb")?.remove();
  }

  // The tab the glance was sitting on. Zen has already moved the glance
  // out by the time its mark comes off, so this is remembered while the
  // picture is still nested, and the previous tab is the fallback.
  function glanceHostTab(glanceTab) {
    const remembered = glanceHost.get(glanceTab);
    if (remembered?.isConnected && !remembered.hasAttribute("zen-essential")) {
      return remembered;
    }
    const nested = glanceTab.parentElement?.closest(".tabbrowser-tab");
    if (nested && nested !== glanceTab && !nested.hasAttribute("zen-essential")) {
      return nested;
    }
    const previous = glanceTab.previousElementSibling;
    if (previous?.classList?.contains("tabbrowser-tab") && !previous.hasAttribute("zen-essential")) {
      return previous;
    }
    return null;
  }

  // A copy stays on the parent tab and sinks through its bottom edge.
  // The real canvas leaves at once, so the opened tab's icon stays clear.
  // Closing passes true: Zen has already hidden the picture, and this copy
  // sinks while the page flies back. The later mark removal must not play it again.
  function sinkGlanceThumb(glanceTab, closing = false, defer = false) {
    if (!closing && (glanceClosing.has(glanceTab) || glanceTab.style.display === "none")) {
      glanceHost.delete(glanceTab);
      clearGlanceThumb(glanceTab);
      return false;
    }
    const canvas = glanceTab.querySelector(":scope > .tab-stack > .zia-glance-thumb");
    const parent = glanceHostTab(glanceTab);
    const content = parent?.querySelector(":scope > .tab-stack > .tab-content");
    glanceHost.delete(glanceTab);
    const thumbsOn = Services.prefs.getBoolPref(GLANCE_THUMB_PREF, true);
    if (!canvas || !parent?.isConnected || !content || !thumbsOn ||
        matchMedia("(prefers-reduced-motion: reduce)").matches) {
      clearGlanceThumb(glanceTab);
      return false;
    }
    if (closing) {
      glanceClosing.add(glanceTab);
    }

    const copy = document.createElementNS(XHTML_NS, "canvas");
    copy.className = "zia-glance-thumb";
    copy.width = canvas.width;
    copy.height = canvas.height;
    copy.getContext("2d").drawImage(canvas, 0, 0);

    const card = document.createElementNS(XHTML_NS, "div");
    card.className = "zia-glance-thumb-exit-card";
    card.append(copy);

    const exit = document.createElementNS(XHTML_NS, "div");
    exit.className = "zia-glance-thumb-exit";
    for (const name of ["--zia-glance-cut-top", "--zia-glance-cut-right", "--zia-glance-cut-bottom"]) {
      const value = glanceTab.style.getPropertyValue(name);
      if (value) {
        exit.style.setProperty(name, value);
      }
    }
    exit.append(card);
    content.querySelector(":scope > .zia-glance-thumb-exit")?.remove();

    // hovering tips the card further and dims it; that eases back, then
    // the card sinks
    const fromHover = parent.matches(":hover");
    if (fromHover) {
      card.style.rotate = "-16deg";
      copy.style.filter = "brightness(0.4)";
      card.style.animationDelay = `${GLANCE_THUMB_UNTIP_MS}ms`;
    }
    const drop = () => exit.remove();
    const play = () => {
      const live = parent.querySelector(":scope > .tab-stack > .tab-content");
      if (!live?.isConnected) {
        return;
      }
      live.querySelector(":scope > .zia-glance-thumb-exit")?.remove();
      card.style.animationPlayState = "running";
      live.append(exit);
      if (fromHover) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            card.style.rotate = "";
            copy.style.filter = "";
          });
        });
      }
      card.addEventListener("animationend", (event) => {
        if (event.animationName === "zia-glance-sink") {
          drop();
        }
      });
      setTimeout(drop, GLANCE_THUMB_SINK_MS + (fromHover ? GLANCE_THUMB_UNTIP_MS : 0) + 80);
    };
    // held off the tab until the strip has finished moving, so the sink
    // starts after that work instead of during it
    clearGlanceThumb(glanceTab);
    if (defer) {
      requestAnimationFrame(() => requestAnimationFrame(play));
    } else {
      play();
    }
    return true;
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
      canvas = document.createElementNS(XHTML_NS, "canvas");
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
    // Expanded into a normal tab while the shot was being taken: the
    // canvas is already gone, and a late paint must not put it back.
    if (!bitmap || !canvas.isConnected || !glanceTab.hasAttribute("zen-glance-tab")) {
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
    watchPrefs(GLANCE_THUMB_PREF, markOff);
    gBrowser.tabContainer.addEventListener(
      "GlanceClose",
      (event) => {
        if (event.target?.classList?.contains("tabbrowser-tab")) {
          glanceClosing.add(event.target);
        }
      },
      true
    );
    // Zen's close flies the page back into the tab and hides the picture
    // immediately. The picture sinks while that flight plays. A first click
    // that only asks for confirmation does not hide the tab, so it does not sink.
    const manager = window.gZenGlanceManager;
    if (manager?.closeGlance && !manager.closeGlance.ziaGlanceSink) {
      const originalClose = manager.closeGlance;
      const closeGlance = function (options) {
        const glanceTab = options?.noAnimation
          ? null
          : glanceTabsOnNormalTabs().find((tab) => tab.selected || glanceHost.get(tab)?.selected);
        const result = originalClose.call(this, options);
        if (glanceTab?.style.display === "none") {
          sinkGlanceThumb(glanceTab, true);
        }
        return result;
      };
      closeGlance.ziaGlanceSink = true;
      manager.closeGlance = closeGlance;
    }
    if (manager?.fullyOpenGlance && !manager.fullyOpenGlance.ziaGlanceSink) {
      const originalOpen = manager.fullyOpenGlance;
      const fullyOpenGlance = function (options) {
        const splitting = !!options?.forSplit;
        if (splitting) {
          glanceSplitOpen = true;
        }
        try {
          return originalOpen.call(this, options);
        } finally {
          if (splitting) {
            queueMicrotask(() => {
              glanceSplitOpen = false;
            });
          }
        }
      };
      fullyOpenGlance.ziaGlanceSink = true;
      manager.fullyOpenGlance = fullyOpenGlance;
    }
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

    // A glance opening: photographed as it appears, as it loads, and after.
    // Opening it into a normal tab takes the mark off the same tab; the
    // picture sinks back into the tab it came from.
    new MutationObserver((records) => {
      let opened = false;
      for (const record of records) {
        const tab = record.target;
        if (!tab.classList?.contains("tabbrowser-tab")) {
          continue;
        }
        if (tab.hasAttribute("zen-glance-tab")) {
          opened = true;
        } else {
          const splitting = glanceSplitOpen;
          glanceSplitOpen = false;
          sinkGlanceThumb(tab, false, splitting);
        }
      }
      if (opened) {
        // cut where the tab ends before it's first drawn, not after
        glanceTabsOnNormalTabs().forEach(cutGlanceAtTab);
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
