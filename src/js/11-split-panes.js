  // Split panes: each pane of a split gets a toolbar of its own (back, forward, reload, the
  // address as host and title with its loading bar, copy link, site settings, close), coloured
  // like its page; the focused one holds the extensions' buttons, and the top-right one the
  // window's buttons, both from the main toolbar a split hides.
  // Used elsewhere: watchSplitPanes, schedulePanes.
  const ICONS = "chrome://sine/content/zia/icons/";
  // (how long after a change a pane's colour is read, unless said otherwise)
  const PANE_COLOR_DELAY_MS = 60;
  // ...after it goes somewhere else, after it loads, and once more, late
  const PANE_COLOR_AFTER_MOVE_MS = 150;
  const PANE_COLOR_AFTER_LOAD_MS = 50;
  const PANE_COLOR_LATE_MS = 800;
  // The address's loading bar: how often it creeps on, how long it shows at least, how long
  // it's held full, and how long it takes to fade
  const PANE_PROGRESS_TICK_MS = 120;
  const PANE_LOAD_MIN_MS = 450;
  const PANE_LOAD_HOLD_MS = 250;
  const PANE_LOAD_FADE_MS = 320;
  const paneColorTimers = new WeakMap();

  function splitContainers() {
    const panels = gBrowser.tabpanels;
    if (panels?.getAttribute("zen-split-view") !== "true") {
      return [];
    }
    return [...panels.querySelectorAll(":scope > .browserSidebarContainer[zen-split='true']")].filter(
      (container) => !container.classList.contains("zen-glance-overlay")
    );
  }

  function paneBrowser(container) {
    return container.querySelector("browser");
  }

  function paneOfBrowser(browser) {
    const container = browser?.closest?.(".browserSidebarContainer");
    return container?.querySelector(":scope .zia-pane-bar") ? container : null;
  }

  function paneButton(name, label, onClick, icon = `${ICONS}${name}.svg`) {
    const button = document.createElementNS(XHTML_NS, "button");
    button.className = `zia-pane-button zia-pane-${name}`;
    button.setAttribute("title", label);
    button.setAttribute("aria-label", label);
    const img = document.createElementNS(XHTML_NS, "img");
    img.setAttribute("src", icon);
    img.setAttribute("alt", "");
    button.appendChild(img);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      onClick(event, button);
    });
    return button;
  }

  function paneTab(container) {
    return gBrowser.getTabForBrowser(paneBrowser(container));
  }

  function selectPane(container) {
    const tab = paneTab(container);
    if (tab && gBrowser.selectedTab !== tab) {
      gBrowser.selectedTab = tab;
    }
  }

  function reloadPane(container) {
    const browser = paneBrowser(container);
    const tab = paneTab(container);
    if (tab?.hasAttribute("busy")) {
      browser?.stop();
    } else {
      browser?.reload();
    }
  }

  function createPaneAddress(container) {
    const address = document.createElementNS(XHTML_NS, "div");
    address.className = "zia-pane-address";
    const host = document.createElementNS(XHTML_NS, "span");
    host.className = "zia-pane-host";
    const rest = document.createElementNS(XHTML_NS, "span");
    rest.className = "zia-pane-rest";
    address.append(host, rest);
    address.addEventListener("click", () => {
      selectPane(container);
      requestAnimationFrame(() => {
        placeOpenedAddressBar();
        document.getElementById("Browser:OpenLocation").doCommand();
      });
    });
    return address;
  }

  function copyPaneLink(container, button) {
    try {
      copyLink(paneTab(container));
      showCopied(button);
    } catch (err) {
      console.error("[Zia] Copy link failed:", err);
    }
  }

  function openPaneSiteSettings(container) {
    selectPane(container);
    placeOpenedAddressBar();
    requestAnimationFrame(() => document.getElementById("zen-site-data-icon-button")?.click());
  }

  // Closes the pane's tab, as Dia's does (Zen's own only takes it out of
  // the split, into a tab of its own)
  function closePane(container) {
    const tab = paneTab(container);
    if (tab && !tab.closing) {
      gBrowser.removeTab(tab);
    }
  }

  function createPaneBar(container) {
    const bar = document.createElementNS(XHTML_NS, "div");
    bar.className = "zia-pane-bar";
    bar.addEventListener("mousedown", () => selectPane(container));
    // (Zen's own sidebar button sits in the toolbar a split hides, and a
    // hidden button's doCommand does nothing: this goes to Zen's command)
    bar.appendChild(paneButton("sidebar", "Toggle sidebar", () => document.getElementById("cmd_zenCompactModeToggle")?.doCommand()));
    bar.appendChild(paneButton("back", "Back", () => paneBrowser(container)?.goBack()));
    bar.appendChild(paneButton("forward", "Forward", () => paneBrowser(container)?.goForward()));
    bar.appendChild(paneButton("reload", "Reload", () => reloadPane(container)));
    bar.appendChild(createPaneAddress(container));

    const extensions = document.createElementNS(XHTML_NS, "div");
    extensions.className = "zia-pane-extensions";
    bar.appendChild(extensions);

    bar.appendChild(paneButton("copy-link", "Copy link", (event, button) => copyPaneLink(container, button), COPY_ICON));
    bar.appendChild(paneButton("site-settings", "Site settings and extensions", () => openPaneSiteSettings(container)));
    bar.appendChild(paneButton("close", "Close", () => closePane(container)));

    const stack = container.querySelector(".browserStack");
    const holder = stack?.parentNode || container.querySelector(".browserContainer") || container;
    holder.insertBefore(bar, holder.firstChild);
    return bar;
  }

  const paneLoads = new WeakMap();

  function setPaneProgress(container, value) {
    const address = container.querySelector(".zia-pane-address");
    if (!address) {
      return;
    }
    const state = paneLoads.get(container) || { progress: 0, timer: null };
    state.progress = Math.max(state.progress, Math.min(1, value));
    paneLoads.set(container, state);
    address.style.setProperty("--zia-load-progress", state.progress.toFixed(3));
  }

  function startPaneLoad(container) {
    const address = container.querySelector(".zia-pane-address");
    if (!address) {
      return;
    }
    const old = paneLoads.get(container);
    clearInterval(old?.timer);
    const state = { progress: 0, timer: null };
    paneLoads.set(container, state);
    address.style.setProperty("--zia-load-progress", "0");
    address.setAttribute("zia-loading", "true");
    state.startedAt = Date.now();
    setPaneProgress(container, 0.12);

    state.timer = setInterval(() => {
      if (state.progress < 0.85) {
        setPaneProgress(container, state.progress + (0.85 - state.progress) * 0.08);
      }
    }, PANE_PROGRESS_TICK_MS);
  }

  function finishPaneLoad(container) {
    const address = container.querySelector(".zia-pane-address");
    const state = paneLoads.get(container);
    clearInterval(state?.timer);
    if (!address || !address.hasAttribute("zia-loading")) {
      return;
    }

    const shownFor = Date.now() - (state?.startedAt || 0);
    const stillThisLoad = () => paneLoads.get(container) === state;
    // (not kept: each checks it's still this load's before it does anything)
    setTimeout(() => stillThisLoad() && setPaneProgress(container, 1), Math.max(0, PANE_LOAD_MIN_MS - shownFor));
    setTimeout(() => {
      if (!stillThisLoad()) {
        return;
      }
      address.removeAttribute("zia-loading");
      // (not kept either: it checks the bar hasn't started loading again first)
      setTimeout(() => {
        if (!address.hasAttribute("zia-loading")) {
          address.style.setProperty("--zia-load-progress", "0");
          paneLoads.delete(container);
        }
      }, PANE_LOAD_FADE_MS);
    }, PANE_LOAD_HOLD_MS + Math.max(0, PANE_LOAD_MIN_MS - shownFor));
  }

  function updatePaneBar(container) {
    const bar = container.querySelector(".zia-pane-bar");
    const browser = paneBrowser(container);
    if (!bar || !browser) {
      return;
    }
    const tab = gBrowser.getTabForBrowser(browser);

    let host = "";
    let isHomePage = false;
    try {
      const uri = browser.currentURI;
      if (!isMultiviewURI(uri)) {
        host = /^https?$/.test(uri.scheme) ? uri.displayHost.replace(/^www\./, "") : uri.spec !== "about:blank" ? uri.spec : "";
      }
      isHomePage = (uri.filePath === "/" || uri.filePath === "") && !uri.query && !uri.ref;
    } catch (err) {
      // (no address yet, or one without a host or path)
    }
    const title = (browser.contentTitle || tab?.label || "").trim();
    bar.querySelector(".zia-pane-host").textContent = host || title || "New Tab";
    bar.querySelector(".zia-pane-rest").textContent =
      host && title && title !== host && !isHomePage ? ` / ${title}` : "";

    bar.querySelector(".zia-pane-back").disabled = !browser.canGoBack;
    bar.querySelector(".zia-pane-forward").disabled = !browser.canGoForward;
    const busy = !!tab?.hasAttribute("busy");
    const reload = bar.querySelector(".zia-pane-reload");
    reload.querySelector("img").setAttribute("src", `${ICONS}${busy ? "stop" : "reload"}.svg`);
    reload.setAttribute("title", busy ? "Stop" : "Reload");
  }

  async function colorPaneBar(container) {
    const bar = container.querySelector(".zia-pane-bar");
    const browser = paneBrowser(container);
    if (!bar || !browser) {
      return;
    }
    let reading = null;
    try {
      reading = await sampleTopColor(browser);
    } catch (err) {
      noteError("split panes: colorPaneBar", err);
    }
    if (!reading?.rgb) {
      return;
    }
    bar.style.setProperty("--zia-pane-bg", cssColor(reading.rgb));
    bar.toggleAttribute("light", wantsDarkInk(reading.rgb));
  }

  function colorPaneSoon(container, delay = PANE_COLOR_DELAY_MS) {
    if (!container || paneColorTimers.get(container)) {
      return;
    }
    paneColorTimers.set(
      container,
      setTimeout(() => {
        paneColorTimers.delete(container);
        colorPaneBar(container);
      }, delay)
    );
  }

  let paneFrame = null;

  function refreshPanes() {
    paneFrame = null;
    const containers = splitContainers();
    setFlag("zia-split", containers.length > 1);

    for (const bar of gBrowser.tabpanels.querySelectorAll(".zia-pane-bar")) {
      const container = bar.closest(".browserSidebarContainer");
      if (!containers.includes(container)) {
        bar.remove();
      }
    }
    if (containers.length < 2) {
      restorePaneExtensions();
      return;
    }

    let leftmost = null;
    for (const container of containers) {
      if (!container.querySelector(".zia-pane-bar")) {
        createPaneBar(container);
        colorPaneSoon(container, 0);
      }
      const rect = container.getBoundingClientRect();
      if (!leftmost || rect.left < leftmost.rect.left - 1 || (Math.abs(rect.left - leftmost.rect.left) <= 1 && rect.top < leftmost.rect.top)) {
        leftmost = { container, rect };
      }
      updatePaneBar(container);
    }
    for (const container of containers) {
      container.querySelector(".zia-pane-bar")?.toggleAttribute("first", container === leftmost?.container);
    }
    placeWindowButtons(containers);
    placeOpenedAddressBar(containers);
    placePaneExtensions(containers);
  }

  const PANE_EXTENSION_ITEMS = "#nav-bar-customization-target > .unified-extensions-item";
  // The extensions' buttons moved into a pane's toolbar, and where each came from
  const paneExtensions = { moved: [], homes: new Map() };

  function placePaneExtensions(containers) {
    const focused = containers.find((c) => c.classList.contains("deck-selected")) || containers[0];
    const slot = focused?.querySelector(".zia-pane-extensions");
    if (!slot) {
      return;
    }

    for (const node of document.querySelectorAll(PANE_EXTENSION_ITEMS)) {
      if (!paneExtensions.homes.has(node)) {
        paneExtensions.homes.set(node, { parent: node.parentNode, next: node.nextSibling });
        paneExtensions.moved.push(node);
      }
    }
    for (const node of paneExtensions.moved) {
      if (node.parentNode !== slot) {
        slot.appendChild(node);
      }
    }
  }

  function restorePaneExtensions() {
    for (const node of [...paneExtensions.moved].reverse()) {
      const home = paneExtensions.homes.get(node);
      if (!home?.parent?.isConnected) {
        continue;
      }
      const next = home.next?.parentNode === home.parent ? home.next : null;
      home.parent.insertBefore(node, next);
    }
    paneExtensions.moved = [];
    paneExtensions.homes.clear();
  }

  function placeOpenedAddressBar(containers = splitContainers()) {
    const focused = containers.find((c) => c.classList.contains("deck-selected")) || containers[0];
    const bar = focused?.querySelector(".zia-pane-bar");
    if (!bar) {
      return;
    }
    const rect = bar.getBoundingClientRect();
    root.style.setProperty("--zia-pane-url-left", `${Math.round(rect.left + 6)}px`);
    root.style.setProperty("--zia-pane-url-top", `${Math.round(rect.top + 4)}px`);
    root.style.setProperty("--zia-pane-url-width", `${Math.round(rect.width - 12)}px`);
    root.style.setProperty("--zia-pane-url-bottom", `${Math.round(window.innerHeight - rect.bottom + 4)}px`);
  }

  // The window's buttons (minimise, maximise, close) at the end of the top-right pane's
  // toolbar: they're in the main toolbar, which a split hides (#524). Room is kept for them
  // there, and they're drawn over it.
  function placeWindowButtons(containers) {
    let corner = null;
    for (const container of containers) {
      const bar = container.querySelector(".zia-pane-bar");
      bar?.removeAttribute("window-buttons");
      const rect = bar?.getBoundingClientRect();
      if (rect && (!corner || rect.top < corner.rect.top - 1 || (Math.abs(rect.top - corner.rect.top) <= 1 && rect.right > corner.rect.right))) {
        corner = { bar, rect };
      }
    }
    const box = document.querySelector("#nav-bar .titlebar-buttonbox-container");
    const width = box?.getBoundingClientRect().width || 0;
    if (!corner || !width) {
      return;
    }
    corner.bar.setAttribute("window-buttons", "true");
    root.style.setProperty("--zia-split-buttons-top", `${Math.round(corner.rect.top)}px`);
    root.style.setProperty("--zia-split-buttons-right", `${Math.round(window.innerWidth - corner.rect.right)}px`);
    root.style.setProperty("--zia-split-buttons-width", `${Math.ceil(width)}px`);
  }

  function schedulePanes() {
    if (!paneFrame) {
      paneFrame = requestAnimationFrame(refreshPanes);
    }
  }

  function onPaneTabChanged(event) {
    const container = paneOfBrowser(event.target.linkedBrowser);
    if (container) {
      updatePaneBar(container);
    }
  }

  // Each pane's address, buttons, loading bar and colour follow its page
  const paneProgressListener = {
    onProgressChange(browser, webProgress, request, curSelf, maxSelf, curTotal, maxTotal) {
      const container = paneOfBrowser(browser);
      if (container && maxTotal > 0) {
        setPaneProgress(container, 0.12 + (curTotal / maxTotal) * 0.8);
      }
    },
    onLocationChange(browser, webProgress) {
      const container = webProgress.isTopLevel && paneOfBrowser(browser);
      if (container) {
        updatePaneBar(container);
        colorPaneSoon(container, PANE_COLOR_AFTER_MOVE_MS);
      }
    },
    onStateChange(browser, webProgress, request, stateFlags) {
      const container = webProgress.isTopLevel && paneOfBrowser(browser);
      if (!container) {
        return;
      }
      const { STATE_START, STATE_STOP, STATE_IS_WINDOW } = Ci.nsIWebProgressListener;
      updatePaneBar(container);
      if (stateFlags & STATE_START && stateFlags & STATE_IS_WINDOW) {
        startPaneLoad(container);
      }
      if (stateFlags & STATE_STOP && stateFlags & STATE_IS_WINDOW) {
        finishPaneLoad(container);
        colorPaneSoon(container, PANE_COLOR_AFTER_LOAD_MS);
        colorPaneSoon(container, PANE_COLOR_LATE_MS);
      }
    },
  };

  // A pane's colour read again as its page scrolls or paints, after what the site colour does
  function colorPanesWithPage() {
    const onScroll = window.ziaOnPageScroll;
    window.ziaOnPageScroll = (browser, position) => {
      onScroll?.(browser, position);
      const container = paneOfBrowser(browser);
      if (container) {
        colorPaneSoon(container);
      }
    };
    const onPainted = window.ziaOnPagePainted;
    window.ziaOnPagePainted = (browser) => {
      onPainted?.(browser);
      const container = paneOfBrowser(browser);
      if (container) {
        colorPaneSoon(container, 0);
      }
    };
  }

  function watchSplitPanes() {
    const panels = gBrowser.tabpanels;
    if (!panels) {
      return;
    }
    new MutationObserver(schedulePanes).observe(panels, {
      attributes: true,
      subtree: true,
      attributeFilter: ["zen-split-view", "zen-split"],
    });
    gBrowser.tabContainer.addEventListener("TabSelect", schedulePanes);
    window.addEventListener("beforecustomization", restorePaneExtensions);
    window.addEventListener("aftercustomization", schedulePanes);
    gBrowser.tabContainer.addEventListener("TabAttrModified", onPaneTabChanged);
    window.addEventListener("resize", schedulePanes);
    gBrowser.addTabsProgressListener(paneProgressListener);
    colorPanesWithPage();
    schedulePanes();
  }
