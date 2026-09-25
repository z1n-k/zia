  const HTML_NS = "http://www.w3.org/1999/xhtml";
  const ICONS = "chrome://sine/content/zia/icons/";
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
    const button = document.createElementNS(HTML_NS, "button");
    button.className = `zia-pane-button zia-pane-${name}`;
    button.setAttribute("title", label);
    button.setAttribute("aria-label", label);
    const img = document.createElementNS(HTML_NS, "img");
    img.setAttribute("src", icon);
    img.setAttribute("alt", "");
    button.appendChild(img);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      onClick(event, button);
    });
    return button;
  }

  function createPaneBar(container) {
    const bar = document.createElementNS(HTML_NS, "div");
    bar.className = "zia-pane-bar";
    const tabOf = () => gBrowser.getTabForBrowser(paneBrowser(container));

    bar.addEventListener("mousedown", () => {
      const tab = tabOf();
      if (tab && gBrowser.selectedTab !== tab) {
        gBrowser.selectedTab = tab;
      }
    });

    bar.appendChild(
      paneButton("sidebar", "Toggle sidebar", () => {
        document.getElementById("zen-toggle-compact-mode")?.doCommand?.();
      })
    );
    bar.appendChild(paneButton("back", "Back", () => paneBrowser(container)?.goBack()));
    bar.appendChild(paneButton("forward", "Forward", () => paneBrowser(container)?.goForward()));
    bar.appendChild(
      paneButton("reload", "Reload", () => {
        const browser = paneBrowser(container);
        const tab = tabOf();
        if (tab?.hasAttribute("busy")) {
          browser?.stop();
        } else {
          browser?.reload();
        }
      })
    );

    const address = document.createElementNS(HTML_NS, "div");
    address.className = "zia-pane-address";
    const host = document.createElementNS(HTML_NS, "span");
    host.className = "zia-pane-host";
    const rest = document.createElementNS(HTML_NS, "span");
    rest.className = "zia-pane-rest";
    address.append(host, rest);
    address.addEventListener("click", () => {
      const tab = tabOf();
      if (tab && gBrowser.selectedTab !== tab) {
        gBrowser.selectedTab = tab;
      }

      requestAnimationFrame(() => {
        placeOpenedAddressBar();
        const command = document.getElementById("Browser:OpenLocation");
        if (command) {
          command.doCommand();
        } else {
          gURLBar.select();
        }
      });
    });
    bar.appendChild(address);

    const extensions = document.createElementNS(HTML_NS, "div");
    extensions.className = "zia-pane-extensions";
    bar.appendChild(extensions);

    bar.appendChild(
      paneButton(
        "copy-link",
        "Copy link",
        (event, button) => {
          try {
            copyLink(tabOf());
            showCopied(button);
          } catch (err) {
            console.error("[Zia] Copy link failed:", err);
          }
        },
        COPY_ICON
      )
    );
    bar.appendChild(
      paneButton("site-settings", "Site settings and extensions", () => {
        const tab = tabOf();
        if (tab && gBrowser.selectedTab !== tab) {
          gBrowser.selectedTab = tab;
        }
        placeOpenedAddressBar();

        requestAnimationFrame(() => document.getElementById("zen-site-data-icon-button")?.click());
      })
    );

    bar.appendChild(
      paneButton("close", "Remove from split", (event) => {
        window.gZenViewSplitter?.removeTabFromSplit?.(event, container);
      })
    );

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
    }, 120);
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
    setTimeout(() => stillThisLoad() && setPaneProgress(container, 1), Math.max(0, 450 - shownFor));
    setTimeout(() => {
      if (!stillThisLoad()) {
        return;
      }
      address.removeAttribute("zia-loading");
      setTimeout(() => {
        if (!address.hasAttribute("zia-loading")) {
          address.style.setProperty("--zia-load-progress", "0");
          paneLoads.delete(container);
        }
      }, 320);
    }, 250 + Math.max(0, 450 - shownFor));
  }

  function updatePaneBar(container) {
    const bar = container.querySelector(".zia-pane-bar");
    const browser = paneBrowser(container);
    if (!bar || !browser) {
      return;
    }
    const tab = gBrowser.getTabForBrowser(browser);

    let host = "";
    try {
      const uri = browser.currentURI;
      if (isMultiviewURI(uri)) {
        host = "";
      } else if (uri && /^https?$/.test(uri.scheme)) {
        host = uri.displayHost.replace(/^www\./, "");
      } else if (uri && uri.spec !== "about:blank") {
        host = uri.spec;
      }
    } catch (err) {
      host = "";
    }
    const title = (browser.contentTitle || tab?.label || "").trim();

    let isHomePage = false;
    try {
      const uri = browser.currentURI;
      isHomePage = (uri.filePath === "/" || uri.filePath === "") && !uri.query && !uri.ref;
    } catch (err) {
      isHomePage = false;
    }
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

  function colorPaneSoon(container, delay = 60) {
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
    placeOpenedAddressBar(containers);
    placePaneExtensions(containers);
  }

  const PANE_EXTENSION_ITEMS = "#nav-bar-customization-target > .unified-extensions-item";
  let movedExtensions = [];
  const extensionHomes = new Map();

  function placePaneExtensions(containers) {
    const focused = containers.find((c) => c.classList.contains("deck-selected")) || containers[0];
    const slot = focused?.querySelector(".zia-pane-extensions");
    if (!slot) {
      return;
    }

    for (const node of document.querySelectorAll(PANE_EXTENSION_ITEMS)) {
      if (!extensionHomes.has(node)) {
        extensionHomes.set(node, { parent: node.parentNode, next: node.nextSibling });
        movedExtensions.push(node);
      }
    }
    for (const node of movedExtensions) {
      if (node.parentNode !== slot) {
        slot.appendChild(node);
      }
    }
  }

  function restorePaneExtensions() {
    for (const node of [...movedExtensions].reverse()) {
      const home = extensionHomes.get(node);
      if (!home?.parent?.isConnected) {
        continue;
      }
      const next = home.next?.parentNode === home.parent ? home.next : null;
      home.parent.insertBefore(node, next);
    }
    movedExtensions = [];
    extensionHomes.clear();
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

  function schedulePanes() {
    if (!paneFrame) {
      paneFrame = requestAnimationFrame(refreshPanes);
    }
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
    gBrowser.tabContainer.addEventListener("TabAttrModified", (event) => {
      const container = paneOfBrowser(event.target.linkedBrowser);
      if (container) {
        updatePaneBar(container);
      }
    });
    window.addEventListener("resize", schedulePanes);

    const { STATE_STOP, STATE_IS_WINDOW } = Ci.nsIWebProgressListener;
    gBrowser.addTabsProgressListener({
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
          colorPaneSoon(container, 150);
        }
      },
      onStateChange(browser, webProgress, request, stateFlags) {
        const container = webProgress.isTopLevel && paneOfBrowser(browser);
        if (!container) {
          return;
        }
        updatePaneBar(container);
        if (stateFlags & Ci.nsIWebProgressListener.STATE_START && stateFlags & STATE_IS_WINDOW) {
          startPaneLoad(container);
        }
        if (stateFlags & STATE_STOP && stateFlags & STATE_IS_WINDOW) {
          finishPaneLoad(container);
          colorPaneSoon(container, 50);
          colorPaneSoon(container, 800);
        }
      },
    });

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

    schedulePanes();
  }

