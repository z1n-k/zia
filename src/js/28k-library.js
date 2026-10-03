  // Zen's Library (Zen 1.23) as a space of the sidebar: it slides in over the
  // sidebar at the sidebar's own width (zia.css), so the page beside it stays
  // put, and only its Spaces section, which shows each space as a column,
  // widens it. Zen builds the Library the first time it opens, after the
  // sidebar, and keeps the sidebar's width on the sidebar's style, so Zia
  // watches for the one and copies the other across.
  function watchLibrary() {
    const toolbox = document.getElementById("navigator-toolbox");
    if (!toolbox?.parentElement) {
      return;
    }
    let library = null;
    const syncWidth = () => {
      if (!library) {
        return;
      }
      let width = parseFloat(toolbox.style.getPropertyValue("--actual-zen-sidebar-width"));
      if (!(width > 0)) {
        width = toolbox.getBoundingClientRect().width;
      }
      // (as Zen measures it: with the splitter, when the sidebar is open)
      if (document.documentElement.hasAttribute("zen-sidebar-expanded")) {
        width += window.windowUtils.getBoundsWithoutFlushing(document.getElementById("zen-sidebar-splitter") || toolbox).width || 0;
      }
      if (width > 0) {
        library.style.setProperty("--zia-library-width", `${Math.round(width)}px`);
      }
    };
    const findLibrary = () => {
      const found = toolbox.parentElement.querySelector(":scope > zen-library");
      if (!found || found === library) {
        return;
      }
      library = found;
      syncWidth();
    };
    new MutationObserver(findLibrary).observe(toolbox.parentElement, { childList: true });
    new MutationObserver(syncWidth).observe(toolbox, { attributes: true, attributeFilter: ["style"] });
    new MutationObserver(syncWidth).observe(document.documentElement, { attributes: true, attributeFilter: ["zen-sidebar-expanded"] });
    findLibrary();
  }

