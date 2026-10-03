  // Zen's Library (Zen 1.23) as another space of the sidebar. Swiped to past
  // the first space (or opened from its button), it comes in where the tabs
  // are, as the next space's would: the tabs slide out and the Library
  // slides in after them, while the sidebar's top (the toolbar, the window
  // buttons) and foot (its buttons, the spaces) stay where they are. It's the
  // sidebar's width, so the page beside it doesn't move; only Spaces, which
  // shows each space as a column, widens it as Zen does. Zen builds the
  // Library the first time it opens, after the sidebar, keeps the sidebar's
  // width on the sidebar's style, and slides the Library by setting its
  // transform each frame, which is followed here.
  function watchLibrary() {
    const toolbox = document.getElementById("navigator-toolbox");
    if (!toolbox?.parentElement) {
      return;
    }
    const root = document.documentElement;
    let library = null;
    let width = 0;
    const syncWidth = () => {
      if (!library) {
        return;
      }
      let w = parseFloat(toolbox.style.getPropertyValue("--actual-zen-sidebar-width"));
      if (!(w > 0)) {
        w = toolbox.getBoundingClientRect().width;
      }
      // (as Zen measures it: with the splitter, when the sidebar is open)
      if (root.hasAttribute("zen-sidebar-expanded")) {
        w += window.windowUtils.getBoundsWithoutFlushing(document.getElementById("zen-sidebar-splitter") || toolbox).width || 0;
      }
      if (w > 0) {
        width = Math.round(w);
        setVar("--zia-library-width", `${width}px`);
      }
    };

    // How far in the Library is, 0 to 1, from the transform Zen gives it
    const progressOf = () => {
      if (!library?.hasAttribute("open")) {
        return 0;
      }
      // (none yet as it opens: Zen sets it from the first frame on, and
      // reading that as all the way in emptied the sidebar for a moment)
      const match = /\(\s*1\s*-\s*([-\d.e]+)\s*\)/.exec(library.style.transform || "");
      if (!match) {
        return 0;
      }
      return Math.min(1, Math.max(0, parseFloat(match[1]) || 0));
    };

    const setVar = (name, value) => {
      if (library.style.getPropertyValue(name) !== value) {
        library.style.setProperty(name, value);
      }
    };

    // Spaces sizes the Library as its side rail plus its columns; the rail
    // is now the strip across its top, as wide as the Library itself, so
    // each time it was measured it grew again, nearly to the window's width.
    // The columns' part alone (what Zen asks for less the strip's width as it
    // measured it) is its width here instead.
    const fitSpaces = () => {
      const asked = parseFloat(library.style.getPropertyValue("--zen-library-content-width"));
      const side = library.querySelector("#zen-library-side");
      if (!(asked > 0) || !side) {
        return;
      }
      const columns = asked - window.windowUtils.getBoundsWithoutFlushing(side).width;
      if (columns > 0) {
        setVar("--zia-library-spaces-width", `${Math.round(Math.max(width, columns + 16))}px`);
      }
    };

    let sliding = false;
    const follow = () => {
      if (!library) {
        return;
      }
      const tabs = document.getElementById("tabbrowser-tabs");
      const header = library.querySelector("#zen-library-header");
      fitSpaces();
      const p = progressOf();
      if (p <= 0) {
        if (sliding) {
          sliding = false;
          root.removeAttribute("zia-library-on");
          root.style.removeProperty("--zia-library-p");
          tabs?.style.removeProperty("translate");
          header?.style.removeProperty("translate");
        }
        return;
      }
      sliding = true;
      root.setAttribute("zia-library-on", "true");
      root.style.setProperty("--zia-library-p", p.toFixed(3));
      // the Library's part of the sidebar is where the tabs are
      if (tabs) {
        const own = library.getBoundingClientRect();
        const box = tabs.getBoundingClientRect();
        // (only when changed: the Library's style is watched, so setting it
        // again each time would never stop)
        setVar("--zia-library-top", `${Math.max(0, Math.round(box.top - own.top))}px`);
        setVar("--zia-library-bottom", `${Math.max(0, Math.round(own.bottom - box.bottom))}px`);
      }
      // the tabs go the other way, as a space's do; the window buttons (which
      // Zen moves into the Library as it comes in) stay put
      const way = root.getAttribute("zen-right-side") === "true" ? -1 : 1;
      const w = width || library.getBoundingClientRect().width;
      tabs?.style.setProperty("translate", `${way * p * w}px 0`, "important");
      header?.style.setProperty("translate", `${way * (1 - p) * w}px 0`, "important");
    };

    const findLibrary = () => {
      const found = toolbox.parentElement.querySelector(":scope > zen-library");
      if (!found || found === library) {
        return;
      }
      library = found;
      syncWidth();
      new MutationObserver(follow).observe(library, { attributes: true, attributeFilter: ["style", "open"] });
      follow();
    };
    new MutationObserver(findLibrary).observe(toolbox.parentElement, { childList: true });
    new MutationObserver(syncWidth).observe(toolbox, { attributes: true, attributeFilter: ["style"] });
    new MutationObserver(syncWidth).observe(root, { attributes: true, attributeFilter: ["zen-sidebar-expanded"] });
    findLibrary();
  }

