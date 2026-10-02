  function isOverPage(event) {
    const box = gBrowser.tabbox.getBoundingClientRect();
    const inPage =
      event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
    return inPage && !isOverCollapsedSidebar(event);
  }

  function isOverCollapsedSidebar(event) {
    if (root.getAttribute("zen-compact-mode") !== "true") {
      return false;
    }
    const toolbox = document.getElementById("navigator-toolbox");
    if (!toolbox) {
      return false;
    }
    const box = toolbox.getBoundingClientRect();

    if (box.right <= 0) {
      return false;
    }
    return event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
  }

  function shortenFindCount(findbar) {
    const label = findbar?.querySelector?.(".found-matches");
    if (!label || label.__ziaCount) {
      return;
    }
    label.__ziaCount = true;
    const update = () => {
      const numbers = (label.getAttribute("value") || label.textContent || "").match(/\d[\d,.]*/g);
      label.setAttribute("zia-count", numbers?.length >= 2 ? `${numbers[0]}/${numbers[1]}` : numbers?.[0] || "");
    };
    new MutationObserver(update).observe(label, { attributes: true, attributeFilter: ["value"], childList: true, characterData: true, subtree: true });
    update();
  }

  // Find opens empty, as in Dia, rather than with the last search in it.
  // (Text selected on the page still fills it in: Firefox does that just
  // after this.)
  function clearFindBarOnOpen(event) {
    const findbar = event.target;
    if (findbar?.localName !== "findbar") {
      return;
    }
    // (not findbar.clear(): that collapses the page's selection too, which
    // Firefox is about to read)
    try {
      const field = findbar._findField;
      if (field?.value) {
        field.value = "";
        field.editor?.clearUndoRedo();
        findbar._updateStatusUI?.();
        findbar._enableFindButtons?.(false);
      }
    } catch (err) {
      noteError("find bar: clearFindBarOnOpen", err);
    }
  }

  function watchFindBars() {
    window.addEventListener("findbaropen", clearFindBarOnOpen, true);
    gBrowser.tabContainer.addEventListener("TabFindInitialized", (event) => {
      shortenFindCount(gBrowser.getCachedFindBar?.(event.target));
    });
    for (const tab of gBrowser.tabs) {
      if (gBrowser.isFindBarInitialized?.(tab)) {
        shortenFindCount(gBrowser.getCachedFindBar(tab));
      }
    }
  }

