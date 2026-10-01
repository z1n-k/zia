
  // Firefox's own sidebar panels (Bookmarks, History, Synced Tabs) are
  // pages of their own inside the panel, which Zia's chrome.css doesn't
  // reach: zia-sidebar.css is loaded into each as it opens. The panel's
  // frame is styled in chrome.css. On unless switched off in settings.
  const SIDEBAR_PANELS_PREF = "zia.sidebar-panels.style";
  // fresh each session, so an updated Zia's styles aren't served from cache
  const SIDEBAR_SHEET = `chrome://sine/content/zia/zia-sidebar.css?${Date.now()}`;

  // The tabs' own measurements, read off a tab in the sidebar, for the
  // panels' rows to match: text size and weight, row height, the gap
  // between rows, the corner radius and the padding before the icon
  function tabMeasurements() {
    const tabs = gBrowser.visibleTabs.filter((tab) => !tab.hasAttribute("zen-essential") && !tab.hasAttribute("zen-glance-tab"));
    const tab = tabs.find((t) => t.getBoundingClientRect().height > 0);
    if (!tab) {
      return null;
    }
    const background = tab.querySelector(".tab-background");
    const label = tab.querySelector(".tab-label");
    const content = tab.querySelector(".tab-content");
    const icon = tab.querySelector(".tab-icon-image");
    if (!background || !label || !content) {
      return null;
    }
    const height = background.getBoundingClientRect().height;
    const next = tabs[tabs.indexOf(tab) + 1]?.querySelector(".tab-background");
    const gap = next
      ? next.getBoundingClientRect().top - background.getBoundingClientRect().bottom
      : 2 * parseFloat(getComputedStyle(tab).getPropertyValue("--tab-margin-block") || "2");
    const text = getComputedStyle(label);
    const box = content.getBoundingClientRect();
    const toolbox = document.getElementById("navigator-toolbox")?.getBoundingClientRect();
    const inset = toolbox ? background.getBoundingClientRect().left - toolbox.left : 8;
    return {
      "--zia-row-h": `${height}px`,
      "--zia-row-gap": `${Math.max(0, Math.min(12, gap))}px`,
      "--zia-row-radius": getComputedStyle(background).borderTopLeftRadius,
      "--zia-row-font-size": text.fontSize,
      "--zia-row-font-weight": text.fontWeight,
      "--zia-row-font-family": text.fontFamily,
      // from the tab's own edge (its background), not its content box
      "--zia-row-pad": `${icon ? icon.getBoundingClientRect().left - background.getBoundingClientRect().left : 10}px`,
      // text: an unselected tab's (dimmed, as in Dia) and a selected one's
      "--zia-row-text": labelColor(tabs.find((t) => !t.selected && !t.hasAttribute("visuallyselected"))) || "rgba(255, 255, 255, 0.8)",
      "--zia-row-text-selected": labelColor(gBrowser.selectedTab?.hasAttribute("zen-essential") ? null : gBrowser.selectedTab) || "rgb(255, 255, 255)",
      "--zia-row-inset": `${Math.max(0, Math.min(16, inset))}px`,
      "--zia-row-hover-bg": getComputedStyle(document.documentElement).getPropertyValue("--zia-tab-hover-bg").trim() || "rgba(255, 255, 255, 0.115)",
      "--zia-row-selected-bg": getComputedStyle(document.documentElement).getPropertyValue("--zia-active-tab-bg").trim() || "rgba(0, 0, 0, 0.1)",
      "--zia-row-indent": `${folderIndent(tab)}px`,
      "--zia-row-icon-gap": `${icon ? label.getBoundingClientRect().left - icon.getBoundingClientRect().right : 8}px`,
    };
  }

  function labelColor(tab) {
    const label = tab?.querySelector(".tab-label-container");
    return label ? getComputedStyle(label).color : null;
  }

  // How far a tab in a folder steps in from one that isn't
  function folderIndent(tab) {
    const inFolder = gBrowser.visibleTabs.find((t) => t.closest("zen-folder, tab-group:not([split-view-group])") && t.getBoundingClientRect().height > 0);
    const outer = tab.closest("zen-folder, tab-group") ? null : tab;
    if (inFolder && outer) {
      const step = inFolder.querySelector(".tab-background").getBoundingClientRect().left - outer.querySelector(".tab-background").getBoundingClientRect().left;
      if (step > 0 && step < 40) {
        return step;
      }
    }
    return 14;
  }

  // The tab sidebar's own sides: from the window's edge to its tabs, and
  // from its tabs to the page's card. The panel takes the same, mirrored
  // (less the splitter, which is the gap on its card side).
  function sidebarSides() {
    const tab = gBrowser.visibleTabs.find((t) => !t.hasAttribute("zen-essential") && !t.closest("zen-folder, tab-group") && t.getBoundingClientRect().height > 0);
    const background = tab?.querySelector(".tab-background")?.getBoundingClientRect();
    const card = document.getElementById("zen-appcontent-wrapper")?.getBoundingClientRect();
    const splitter = document.getElementById("sidebar-splitter")?.getBoundingClientRect().width || 0;
    if (!background || !card) {
      return;
    }
    const right = document.documentElement.getAttribute("zen-right-side") === "true";
    const windowSide = right ? window.innerWidth - background.right : background.left;
    const cardSide = right ? background.left - card.right : card.left - background.right;
    if (windowSide >= 0 && windowSide < 40 && cardSide >= 0 && cardSide < 40) {
      document.documentElement.style.setProperty("--zia-panel-pad-window", `${windowSide}px`);
      document.documentElement.style.setProperty("--zia-panel-pad-card", `${Math.max(0, cardSide - splitter)}px`);
    }
  }

  function matchTabs(doc) {
    safely("sidebar panels: sides", sidebarSides);
    const sizes = tabMeasurements();
    if (sizes) {
      for (const [name, value] of Object.entries(sizes)) {
        doc.documentElement.style.setProperty(name, value);
      }
    }
    // beside the page, the panel's own sides give the room
    if (document.documentElement.hasAttribute("zia-panels-beside")) {
      doc.documentElement.style.setProperty("--zia-panel-inset", "0px");
    } else {
      doc.documentElement.style.removeProperty("--zia-panel-inset");
    }
    // the highlights' shape: the space name's own pill
    const label = document.getElementById("zia-space-label");
    if (label) {
      const pill = getComputedStyle(label);
      doc.documentElement.style.setProperty("--zia-pill-radius", pill.borderTopLeftRadius);
      const corner = pill.getPropertyValue("corner-top-left-shape");
      if (corner) {
        doc.documentElement.style.setProperty("--zia-pill-corner", corner);
      }
    }
    roundTreeRows(doc);
    styleSearchField(doc);
    doc.defaultView.requestAnimationFrame(() =>
      doc.defaultView.requestAnimationFrame(() => {
        levelTitle();
        spaceTitle(doc);
      })
    );
  }

  // The space between the panel's title and its search field is the one
  // between the space's name and the essentials below it, text to tile:
  // measured on both, and the header's padding made up to it
  function spaceTitle(doc) {
    const label = document.getElementById("zia-space-label") || document.querySelector(".zen-current-workspace-indicator-name");
    const essential = [...document.querySelectorAll(".zen-essentials-container .tabbrowser-tab[zen-essential] > .tab-stack > .tab-background")]
      .find((e) => e.getBoundingClientRect().height > 0);
    const title = document.getElementById("sidebar-title");
    const header = document.getElementById("sidebar-header");
    const browser = document.getElementById("sidebar");
    const search = doc.querySelector("#search-box, .sidebar-search-container.selected .tabsFilter");
    if (!label || !essential || !title || !header || !browser || !search) {
      return;
    }
    const textBottom = (el) => {
      const box = el.getBoundingClientRect();
      return box.top + box.height / 2 + parseFloat(getComputedStyle(el).fontSize) / 2;
    };
    const wanted = essential.getBoundingClientRect().top - textBottom(label);
    const now = browser.getBoundingClientRect().top + search.getBoundingClientRect().top - textBottom(title);
    if (!(wanted > 0 && wanted < 48) || Math.abs(wanted - now) < 0.5) {
      return;
    }
    const padding = parseFloat(getComputedStyle(header).paddingBottom) || 0;
    document.documentElement.style.setProperty("--zia-panel-title-pad", `${Math.max(0, padding + wanted - now)}px`);
  }

  // The panel's title sits level with the space's name across the window
  function levelTitle() {
    const label = document.getElementById("zia-space-label");
    const pill = document.getElementById("sidebar-switcher-target");
    const header = document.getElementById("sidebar-header");
    if (!label || !pill || !header || !label.getBoundingClientRect().height || !pill.getBoundingClientRect().height) {
      return;
    }
    const off = label.getBoundingClientRect().top - pill.getBoundingClientRect().top;
    if (Math.abs(off) < 0.5) {
      return;
    }
    const padding = parseFloat(getComputedStyle(header).paddingTop) || 0;
    const next = padding + off;
    if (next >= 0 && next < 40) {
      document.documentElement.style.setProperty("--zia-panel-title-top", `${next}px`);
    }
  }

  // The search field draws itself inside a component of its own, which a
  // page's styles don't reach: Zia hands it its own few rules there. A
  // faint hairline when it's focused, inside it so nothing is cut off at
  // the panel's edge, in place of Firefox's thick ring.
  const SEARCH_FIELD_RULES = `
    #input {
      appearance: none !important;
      border: 1px solid transparent !important;
      outline: none !important;
      box-shadow: none !important;
    }
    #input:focus,
    #input:focus-visible {
      outline: none !important;
      border-color: rgba(255, 255, 255, 0.14) !important;
    }
  `;

  function styleSearchField(doc) {
    const win = doc.defaultView;
    for (const field of doc.querySelectorAll("moz-input-search")) {
      const apply = () => {
        const root = field.shadowRoot;
        if (!root || root.ziaStyled) {
          return;
        }
        try {
          const sheet = new win.CSSStyleSheet();
          sheet.replaceSync(SEARCH_FIELD_RULES);
          root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
          root.ziaStyled = true;
        } catch (err) {
          noteError("sidebar panels: search field", err);
        }
      };
      apply();
      // drawn a moment later, the first time
      field.updateComplete?.then(apply, () => {});
      win.setTimeout(apply, 300);
    }
  }

  // Bookmarks and History are trees, whose rows can't be rounded or
  // spaced apart. Zia draws the hovered and the selected row's highlight
  // itself, behind the tree, shaped like a tab: as tall as a tab, rounded
  // like one, with the gap between rows left clear.
  function roundTreeRows(doc) {
    const tree = doc.querySelector(".sidebar-placesTree");
    if (!tree || doc.getElementById("zia-row-pills")) {
      return;
    }
    const win = doc.defaultView;
    const layer = doc.createElementNS(HTML_NS, "div");
    layer.id = "zia-row-pills";
    const hover = doc.createElementNS(HTML_NS, "div");
    hover.className = "zia-row-pill";
    hover.setAttribute("hover", "");
    const chosen = doc.createElementNS(HTML_NS, "div");
    chosen.className = "zia-row-pill";
    chosen.setAttribute("selected", "");
    layer.append(chosen, hover);
    tree.before(layer);

    let hoveredRow = -1;
    const put = (pill, row) => {
      const body = tree.treeBody || tree.querySelector("treechildren");
      const height = tree.rowHeight;
      if (row < 0 || !body || !height) {
        pill.hidden = true;
        return;
      }
      const shown = row - tree.getFirstVisibleRow();
      const box = body.getBoundingClientRect();
      // each row is a tab's height and the gap after it: the pill is the tab
      const gap = parseFloat(win.getComputedStyle(doc.documentElement).getPropertyValue("--zia-row-gap")) || 0;
      const top = box.top + shown * height;
      if (shown < 0 || top + height > box.bottom + 1) {
        pill.hidden = true;
        return;
      }
      // a row inside a folder steps in, as a folder's tabs do
      const indent = (tree.view?.getLevel(row) || 0) * (parseFloat(win.getComputedStyle(doc.documentElement).getPropertyValue("--zia-row-indent")) || 0);
      pill.hidden = false;
      pill.style.top = `${top + gap / 2}px`;
      pill.style.left = `${box.left + indent}px`;
      pill.style.width = `${Math.max(0, box.width - indent)}px`;
      pill.style.height = `${height - gap}px`;
    };
    let queued = false;
    const update = () => {
      if (queued) {
        return;
      }
      queued = true;
      win.requestAnimationFrame(() => {
        queued = false;
        try {
          // the selected row keeps its look under the pointer, as a tab does
          const current = tree.view?.selection?.count ? tree.currentIndex : -1;
          put(chosen, current);
          put(hover, hoveredRow === current ? -1 : hoveredRow);
        } catch (err) {
          noteError("sidebar panels: rows", err);
        }
      });
    };
    tree.addEventListener("mousemove", (event) => {
      const row = tree.getRowAt(event.clientX, event.clientY);
      if (row !== hoveredRow) {
        hoveredRow = row;
        update();
      }
    });
    tree.addEventListener("mouseleave", () => {
      hoveredRow = -1;
      update();
    });
    for (const type of ["select", "wheel", "keydown", "click", "focus", "blur"]) {
      tree.addEventListener(type, update, true);
    }
    win.addEventListener("resize", update);
    // rows coming and going (a search, a folder opened) and scrolling the
    // tree itself don't all tell anyone: checked over as well while open
    const every = win.setInterval(update, 250);
    win.addEventListener("unload", () => win.clearInterval(every));
    update();
  }

  function watchSidebarPanels() {
    const on = () => Services.prefs.getBoolPref(SIDEBAR_PANELS_PREF, true);
    const styled = new WeakSet();
    const style = () => {
      const win = document.getElementById("sidebar")?.contentWindow;
      const doc = win?.document;
      if (!doc || doc.documentURI === "about:blank") {
        return;
      }
      try {
        // switched off with a panel open: its styles go straight away
        if (!on()) {
          if (styled.has(doc)) {
            win.windowUtils.removeSheetUsingURIString(SIDEBAR_SHEET, win.windowUtils.AUTHOR_SHEET);
            styled.delete(doc);
          }
        } else {
          if (!styled.has(doc)) {
            win.windowUtils.loadSheetUsingURIString(SIDEBAR_SHEET, win.windowUtils.AUTHOR_SHEET);
            styled.add(doc);
          }
          matchTabs(doc);
        }
      } catch (err) {
        noteError("sidebar panels: style", err);
      }
    };
    const markPlain = () => {
      setFlag("zia-panels-plain", !on());
      style();
    };
    markPlain();
    Services.prefs.addObserver(SIDEBAR_PANELS_PREF, markPlain);
    window.addEventListener("unload", () => Services.prefs.removeObserver(SIDEBAR_PANELS_PREF, markPlain));
    // each panel's page loads into the same #sidebar browser
    document.getElementById("sidebar")?.addEventListener("load", style, true);
    safely("placeSidebarPanel", placeSidebarPanel);
  }

  // Zen puts the panel inside the page's card, under the toolbar. Zia
  // moves it beside the card instead, full height on the window's own
  // background, a second sidebar, on whichever side it's set to (Firefox's
  // "Move sidebar to left/right"). Off in settings: back where Zen has it.
  const SIDEBAR_BESIDE_PREF = "zia.sidebar-panels.beside";

  function placeSidebarPanel() {
    const box = document.getElementById("sidebar-box");
    const splitter = document.getElementById("sidebar-splitter");
    const card = document.getElementById("zen-appcontent-wrapper");
    if (!box || !splitter || !card) {
      return;
    }
    // where Zen had them, to put them back
    const home = box.parentNode;
    const homeNext = splitter.nextSibling;
    const resize = [splitter.getAttribute("resizebefore"), splitter.getAttribute("resizeafter")];

    const reload = () => {
      // a moved panel's page starts again: shown again if it was open
      try {
        const id = window.SidebarController?.currentID;
        if (id && !box.hidden) {
          window.SidebarController.show(id);
        }
      } catch (err) {
        noteError("sidebar panels: reload", err);
      }
    };
    const place = () => {
      const beside = Services.prefs.getBoolPref(SIDEBAR_BESIDE_PREF, true);
      setFlag("zia-panels-beside", beside);
      const end = box.hasAttribute("sidebar-positionend");
      let moved = false;
      if (beside) {
        // the splitter sits between the card and the panel, and resizes
        // the panel
        if (end && (card.nextElementSibling !== splitter || splitter.nextElementSibling !== box)) {
          card.after(splitter, box);
          moved = true;
        } else if (!end && (card.previousElementSibling !== splitter || splitter.previousElementSibling !== box)) {
          card.before(box, splitter);
          moved = true;
        }
        splitter.setAttribute("resizebefore", end ? "none" : "sibling");
        splitter.setAttribute("resizeafter", end ? "sibling" : "none");
      } else if (box.parentNode !== home) {
        home.insertBefore(box, homeNext);
        home.insertBefore(splitter, homeNext);
        splitter.setAttribute("resizebefore", resize[0] ?? "sibling");
        splitter.setAttribute("resizeafter", resize[1] ?? "none");
        moved = true;
      }
      if (moved) {
        reload();
      }
    };
    place();
    Services.prefs.addObserver(SIDEBAR_BESIDE_PREF, place);

    // no wider than Zen lets the tab sidebar be (dragging its edge stops
    // there too), and following that setting if it's changed
    const MAX_PREF = "zen.view.sidebar-expanded.max-width";
    // the tab sidebar's own limit as Zen sets it on it, else its setting
    const maxWidth = () => {
      const toolbox = parseFloat(gNavToolbox?.style.maxWidth || getComputedStyle(gNavToolbox).maxWidth);
      if (toolbox > 0) {
        return toolbox;
      }
      try {
        return Services.prefs.getIntPref(MAX_PREF);
      } catch (err) {
        return 300;
      }
    };
    let clamping = false;
    const cap = () => {
      if (clamping) {
        return;
      }
      const beside = Services.prefs.getBoolPref(SIDEBAR_BESIDE_PREF, true);
      const max = maxWidth();
      if (!beside || !(max > 0)) {
        box.style.removeProperty("max-width");
        return;
      }
      box.style.setProperty("max-width", `${max}px`, "important");
      // dragged past it anyway: back to the limit, as the tab sidebar stops
      if (box.getBoundingClientRect().width > max + 0.5) {
        clamping = true;
        box.style.width = `${max}px`;
        box.setAttribute("width", String(max));
        clamping = false;
      }
    };
    cap();
    new MutationObserver(cap).observe(box, { attributes: true, attributeFilter: ["width", "style"] });
    new MutationObserver(cap).observe(gNavToolbox, { attributes: true, attributeFilter: ["style"] });
    Services.prefs.addObserver(MAX_PREF, cap);
    Services.prefs.addObserver(SIDEBAR_BESIDE_PREF, cap);
    window.addEventListener("unload", () => {
      Services.prefs.removeObserver(MAX_PREF, cap);
      Services.prefs.removeObserver(SIDEBAR_BESIDE_PREF, cap);
    });
    window.addEventListener("unload", () => Services.prefs.removeObserver(SIDEBAR_BESIDE_PREF, place));
    // moving it to the other side
    new MutationObserver(place).observe(box, { attributes: true, attributeFilter: ["sidebar-positionend"] });
  }
