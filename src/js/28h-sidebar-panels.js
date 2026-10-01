
  // Firefox's own sidebar panels (Bookmarks, History, Synced Tabs) are
  // pages of their own inside the panel, which Zia's chrome.css doesn't
  // reach: zia-sidebar.css is loaded into each as it opens. The panel's
  // frame is styled in chrome.css. On unless switched off in settings.
  const SIDEBAR_PANELS_PREF = "zia.sidebar-panels.style";
  // fresh each session, so an updated Zia's styles aren't served from cache
  const SIDEBAR_SHEET = `chrome://sine/content/zia/zia-sidebar.css?${Date.now()}`;

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
        } else if (!styled.has(doc)) {
          win.windowUtils.loadSheetUsingURIString(SIDEBAR_SHEET, win.windowUtils.AUTHOR_SHEET);
          styled.add(doc);
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
  // moves it beside the card instead, full height, as a card of its own
  // like a split pane, on whichever side it's set to (Firefox's "Move
  // sidebar to left/right"). Off in settings: back where Zen has it.
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
    window.addEventListener("unload", () => Services.prefs.removeObserver(SIDEBAR_BESIDE_PREF, place));
    // moving it to the other side
    new MutationObserver(place).observe(box, { attributes: true, attributeFilter: ["sidebar-positionend"] });
  }
