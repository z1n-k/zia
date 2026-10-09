  const pointIn = (box, event) => event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;

  function isOverPage(event) {
    return pointIn(gBrowser.tabbox.getBoundingClientRect(), event) && !isOverCollapsedSidebar(event);
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
    return box.right > 0 && pointIn(box, event);
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

  // On macOS Firefox fills a find bar that opens with nothing selected from
  // the system's shared find clipboard, the last search made anywhere: so it
  // reopened with that search in it. Opened with nothing selected, it starts
  // empty; text selected on the page still fills it in.
  function skipClipboardPrefill(findbar) {
    if (!findbar || findbar.__ziaNoClipboardPrefill || typeof findbar.onCurrentSelection !== "function") {
      return;
    }
    findbar.__ziaNoClipboardPrefill = true;
    const original = findbar.onCurrentSelection;
    findbar.onCurrentSelection = function (selectionString, isInitialSelection) {
      if (!isInitialSelection || selectionString) {
        return original.call(this, selectionString, isInitialSelection);
      }
      // Firefox's own steps for an empty opening, minus the clipboard
      try {
        if (!this._startFindDeferred) {
          return undefined;
        }
        this._findField.value = "";
        this._enableFindButtons(false);
        this._findField.select();
        this._findField.focus();
        this._startFindDeferred.resolve();
        this._startFindDeferred = null;
        return undefined;
      } catch (err) {
        noteError("find bar: skipClipboardPrefill", err);
        return original.call(this, selectionString, isInitialSelection);
      }
    };
  }

  function dressFindBar(findbar) {
    shortenFindCount(findbar);
    skipClipboardPrefill(findbar);
  }

  function watchFindBars() {
    window.addEventListener("findbaropen", clearFindBarOnOpen, true);
    gBrowser.tabContainer.addEventListener("TabFindInitialized", (event) => {
      dressFindBar(gBrowser.getCachedFindBar?.(event.target));
    });
    for (const tab of gBrowser.tabs) {
      if (gBrowser.isFindBarInitialized?.(tab)) {
        dressFindBar(gBrowser.getCachedFindBar(tab));
      }
    }
  }

