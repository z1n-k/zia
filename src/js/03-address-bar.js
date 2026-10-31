  // The address bar's text: the site and title shown closed, the address without its
  // scheme, the whole address selected by the click that opens the bar, typed text put back
  // on leaving it, and the bar (or its text) centred on the toolbar.
  // Used elsewhere: createTitleElement, watchTitleOnly, updateTitle, plainAddress,
  // neverShowScheme, keepWholeUrlSelected, revertTypedTextOnLeave, watchCenteredBar,
  // watchCenteredAddress.

  // (a click sent to a page or the bar's list is taken as going somewhere for this long)
  const NAVIGATING_MS = 1500;
  // (passes after the bar opens, as it writes in the whole address)
  const SELECTION_FIX_AT = [30, 100, 200];
  const SELECTION_FIX_UNTIL_MS = 400;

  let titleEl = null;
  let plainEl = null;

  function createTitleElement() {
    const inputBox = gURLBar.inputField?.parentNode;
    if (!inputBox) {
      return;
    }
    // each a host part and the rest
    const titleBox = (id) => {
      const box = document.createElementNS(XHTML_NS, "div");
      box.id = id;
      for (const part of ["host", "rest"]) {
        const span = document.createElementNS(XHTML_NS, "span");
        span.className = `zia-url-title-${part}`;
        box.append(span);
      }
      inputBox.append(box);
      return box;
    };
    titleEl = titleBox("zia-url-title");
    plainEl = titleBox("zia-url-plain");
  }

  function showTitle(el, host, rest) {
    el.firstChild.textContent = host;
    el.lastChild.textContent = rest;
  }

  const TITLE_ONLY_PREF = "zia.urlbar.title-only";

  function titleOnly() {
    try {
      return Services.prefs.getBoolPref(TITLE_ONLY_PREF, false);
    } catch (err) {
      return false;
    }
  }

  function watchTitleOnly() {
    watchPrefs([TITLE_ONLY_PREF, FULL_URL_PREF], () => {
      updateTitle();
      // (the address written out again, with or without its scheme, rather than at the next page)
      try {
        if (!gURLBar.focused) {
          gURLBar.setURI();
        }
      } catch (err) {
        noteError("address bar: full address", err);
      }
    });
  }

  // (an option: the page's whole address, as Firefox shows it, rather than the domain and title)
  const FULL_URL_PREF = "zia.urlbar.full-url";

  function updateTitle() {
    if (!titleEl) {
      return;
    }
    const urlbar = gURLBar.textbox || document.getElementById("urlbar");
    const browser = gBrowser.selectedBrowser;
    const uri = browser?.currentURI;
    let host = "";
    try {
      if (uri && /^https?$/.test(uri.scheme)) {
        host = uri.displayHost.replace(/^www\./, "");
      }
    } catch (err) {
      // (an address with no host)
    }
    const title = (browser?.contentTitle || "").trim();
    const valid = urlbar.getAttribute("pageproxystate") === "valid";

    // Multiview reads as a browser feature ("Multiview · 3"), not a website.
    if (valid && isMultiviewURI(uri)) {
      showTitle(titleEl, title || "Multiview", "");
      showTitle(plainEl, title || "Multiview", "");
      urlbar.setAttribute("zia-has-title", "true");
      return;
    }
    if (!host || !valid || isErrorPage(browser) || Services.prefs.getBoolPref(FULL_URL_PREF, false)) {
      urlbar.removeAttribute("zia-has-title");
      return;
    }
    let isHomePage = false;
    let path = "";
    try {
      isHomePage = (uri.filePath || "/") === "/" && !uri.query && !uri.ref;
      path = uri.pathQueryRef || "";
    } catch (err) {
      // (an address without a path)
    }
    const hasTitle = /[\p{L}\p{N}]/u.test(title);
    // Title only (an option): the title alone, in the domain's place and
    // colour, even on a site's home page; a page with none shows its domain
    if (titleOnly() && hasTitle) {
      showTitle(titleEl, title, "");
    } else {
      showTitle(titleEl, host, !isHomePage && hasTitle && title !== host ? ` / ${title}` : "");
    }
    showTitle(plainEl, host, path === "/" ? "" : path);
    urlbar.setAttribute("zia-has-title", "true");
  }

  let urlbarTyping = false;
  // What was last typed
  let typedValue = "";

  // A site's address with nothing after it ends in a bare "/", which Zia
  // leaves off: youtube.com, not youtube.com/.
  const BARE_SLASH = /^([^/?#\s]+)\/$/;

  function plainAddress(value) {
    // (with "Full address" on, the address as it is: Firefox's own trimming, browser.urlbar.
    // trimHttps, decides on its scheme, #519)
    if (typeof value !== "string" || Services.prefs.getBoolPref(FULL_URL_PREF, false)) {
      return value;
    }
    return value.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(BARE_SLASH, "$1");
  }

  function neverShowScheme() {
    const ui = window.gZenUIManager;
    if (ui && typeof ui.urlbarTrim === "function" && !ui.urlbarTrim.ziaWrapped) {
      const original = ui.urlbarTrim.bind(ui);
      const trimmed = (url) => (urlbarTyping && gURLBar.focused ? original(url) : plainAddress(original(url)));
      trimmed.ziaWrapped = true;
      ui.urlbarTrim = trimmed;
    }

    const input = gURLBar?.inputField || document.querySelector("#urlbar .urlbar-input");
    if (!input || input.ziaSchemeStripped) {
      return;
    }
    const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value");
    if (!desc?.get || !desc?.set) {
      return;
    }
    input.ziaSchemeStripped = true;
    Object.defineProperty(input, "value", {
      configurable: true,
      enumerable: desc.enumerable,
      get() {
        return desc.get.call(this);
      },
      set(next) {
        const typing = urlbarTyping && gURLBar.focused;
        // While typing, the only writes are Firefox's own, like autofill
        // completing "yo" to "youtube.com/": that loses its bare "/" too.
        // Typed characters don't come through here. A "/" typed on the end
        // stays, though: autofill writes "twitch.tv/" back for it, and
        // taking that off undid the key press.
        const keepSlash = typing && typedValue.endsWith("/");
        desc.set.call(
          this,
          typing ? (typeof next === "string" && !keepSlash ? next.replace(BARE_SLASH, "$1") : next) : plainAddress(next)
        );
        if (holdWholeSelection && gURLBar.focused) {
          this.select();
        }
      },
    });
    input.addEventListener("input", (event) => {
      if (event.isTrusted) {
        urlbarTyping = true;
        // (up to the caret: an autofilled ending after it may already be in)
        typedValue = desc.get.call(input).slice(0, input.selectionStart ?? undefined);
      }
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        urlbarTyping = false;
      }
    });
    input.addEventListener("blur", () => {
      urlbarTyping = false;
      typedValue = "";
    });
  }

  let holdWholeSelection = false;

  function holdSelectionOnRewrite(input) {
    if (input.ziaSelectionHeld) {
      return;
    }
    input.ziaSelectionHeld = true;
    const setRange = input.setSelectionRange;
    input.setSelectionRange = function (start, end, direction) {
      if (holdWholeSelection && gURLBar.focused) {
        return setRange.call(this, 0, this.value.length, direction);
      }
      return setRange.call(this, start, end, direction);
    };
  }

  function keepWholeUrlSelected(urlbar) {
    const input = urlbar.querySelector(".urlbar-input") || gURLBar.inputField;
    if (!input) {
      return;
    }
    holdSelectionOnRewrite(input);
    // The click that opens the bar: the address's length before it (closedLength), where it
    // was pressed, and where the pointer has been since
    const click = { closedLength: -1, pressedAt: null, lastPointer: null };
    urlbar.addEventListener(
      "mousedown",
      (event) => {
        const opening = !urlbar.hasAttribute("breakout-extend") && !gURLBar.focused;
        click.closedLength = opening ? input.value.length : -1;
        holdWholeSelection = opening && event.button === 0;
      },
      true
    );
    // The click that opens the bar selects the whole address. The bar moves
    // and grows as it opens, though, so with the button still down the text
    // slid under a pointer that hadn't moved and Firefox took it for a drag,
    // selecting only part of it ("youtub"). Unless the pointer itself moved,
    // that click selects the whole address however the text moved under it.
    urlbar.addEventListener(
      "mousedown",
      (event) => {
        click.pressedAt = holdWholeSelection ? { x: event.screenX, y: event.screenY } : null;
        click.lastPointer = null;
      },
      true
    );
    // While that click is held, a drag Firefox reads into the moving text is
    // undone as it happens, before it's drawn (only fixed on release, the
    // part-selection showed for a moment first). A real drag moves the
    // pointer, and is left alone.
    window.addEventListener(
      "mousemove",
      (event) => {
        click.lastPointer = click.pressedAt ? { x: event.screenX, y: event.screenY } : null;
      },
      true
    );
    const holdWhole = () => holdWholeWhilePressed(input, click);
    input.addEventListener("selectionchange", holdWhole);
    input.addEventListener("select", holdWhole);
    window.addEventListener("mouseup", (event) => selectWholeOnRelease(event, input, click), true);
    const release = () => {
      holdWholeSelection = false;
      click.pressedAt = null;
    };
    urlbar.addEventListener("keydown", release, true);
    input.addEventListener("input", release);
    input.addEventListener("blur", release);
    watchOpenedSelection(urlbar, input, click);
  }

  function holdWholeWhilePressed(input, click) {
    const press = click.pressedAt;
    if (!press || !gURLBar.focused || urlbarTyping) {
      return;
    }
    if (click.lastPointer && Math.hypot(click.lastPointer.x - press.x, click.lastPointer.y - press.y) > 4) {
      return;
    }
    if (input.selectionStart !== 0 || input.selectionEnd !== input.value.length) {
      input.select();
    }
  }

  function selectWholeOnRelease(event, input, click) {
    const press = click.pressedAt;
    click.pressedAt = null;
    if (!press || event.button !== 0 || Math.hypot(event.screenX - press.x, event.screenY - press.y) > 4) {
      return;
    }
    const wholeLater = () => {
      if (gURLBar.focused && !urlbarTyping && (input.selectionStart !== 0 || input.selectionEnd !== input.value.length)) {
        input.select();
      }
    };
    wholeLater();
    requestAnimationFrame(wholeLater);
  }

  // Opened, the bar writes in the whole address, longer than the closed one: a selection
  // of just the closed address's length is made the whole of it
  function watchOpenedSelection(urlbar, input, click) {
    const fix = () => {
      if (click.closedLength < 0) {
        return;
      }
      const { selectionStart, selectionEnd, value } = input;
      if (selectionStart === 0 && selectionEnd === click.closedLength && click.closedLength < value.length) {
        input.select();
        click.closedLength = -1;
      }
    };
    new MutationObserver(() => {
      if (!urlbar.hasAttribute("breakout-extend")) {
        click.closedLength = -1;
        return;
      }
      requestAnimationFrame(fix);
      // (not cancelled: each does nothing once the opening's selection is fixed or over)
      for (const ms of SELECTION_FIX_AT) {
        setTimeout(fix, ms);
      }
      setTimeout(() => {
        click.closedLength = -1;
      }, SELECTION_FIX_UNTIL_MS);
    }).observe(urlbar, { attributes: true, attributeFilter: ["breakout-extend"] });
  }

  function revertTypedTextOnLeave(urlbar) {
    const input = urlbar.querySelector(".urlbar-input") || gURLBar.inputField;
    if (!input || typeof gURLBar.handleRevert !== "function") {
      return;
    }
    let navigatingAt = 0;
    urlbar.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Enter") {
          navigatingAt = Date.now();
        }
      },
      true
    );
    urlbar.addEventListener(
      "mousedown",
      (event) => {
        if (event.target.closest?.(".urlbarView, #urlbar-go-button")) {
          navigatingAt = Date.now();
        }
      },
      true
    );
    input.addEventListener("blur", () => {
      const browser = gBrowser.selectedBrowser;
      setTimeout(() => {
        if (gURLBar.focused || !document.hasFocus() || Date.now() - navigatingAt < NAVIGATING_MS) {
          return;
        }
        if (urlbar.hasAttribute("zen-newtab")) {
          return;
        }
        try {
          if (browser && browser !== gBrowser.selectedBrowser) {
            if (browser.userTypedValue) {
              browser.userTypedValue = null;
            }
            return;
          }
          if (gBrowser.userTypedValue == null && !gURLBar.valueIsTyped) {
            return;
          }
          gURLBar.handleRevert();
          updateTitle();
        } catch (err) {
          console.error("[Zia] Could not restore the address:", err);
        }
      }, 0);
    });
  }

  // Optional (zia.urlbar.center-text): the address centred on the toolbar, not in the bar,
  // which the buttons either side push off the toolbar's middle; and held there as the
  // bar's own buttons show and hide on hover (re-centred in what was left, it slid aside
  // each time). Measured as either changes size, before it's drawn. Only the toolbar's
  // bar, closed: in the sidebar (Zen's single toolbar) or open, it's as it was.
  // Optional (zia.urlbar.center-bar): the address bar itself in the middle of the toolbar, as
  // much room before it as after, made up on the side with fewer buttons, rather than with
  // flexible spaces added by hand (#515). Measured again as the toolbar changes.
  const CENTER_BAR_PREF = "zia.urlbar.center-bar";
  function watchCenteredBar() {
    const container = document.getElementById("urlbar-container");
    const navBar = document.getElementById("nav-bar");
    if (!container || !navBar) {
      return;
    }
    const update = () => {
      let before = 0;
      let after = 0;
      if (Services.prefs.getBoolPref(CENTER_BAR_PREF, false) && root.getAttribute("zen-single-toolbar") !== "true") {
        const style = getComputedStyle(container);
        const own = [parseFloat(container.style.marginInlineStart) || 0, parseFloat(container.style.marginInlineEnd) || 0];
        const bar = container.getBoundingClientRect();
        const row = navBar.getBoundingClientRect();
        // (the room each side takes now, less what was added for it)
        const left = bar.left - row.left - (style.direction === "rtl" ? own[1] : own[0]);
        const right = row.right - bar.right - (style.direction === "rtl" ? own[0] : own[1]);
        const gap = Math.round(left - right);
        if (bar.width && Math.abs(gap) >= 1 && Math.abs(gap) < bar.width / 2) {
          [before, after] = gap > 0 ? [0, gap] : [-gap, 0];
          if (style.direction === "rtl") {
            [before, after] = [after, before];
          }
        }
      }
      const set = (name, px) =>
        px ? container.style.setProperty(name, `${px}px`, "important") : container.style.removeProperty(name);
      if ((parseFloat(container.style.marginInlineStart) || 0) !== before) {
        set("margin-inline-start", before);
      }
      if ((parseFloat(container.style.marginInlineEnd) || 0) !== after) {
        set("margin-inline-end", after);
      }
    };
    let pending = 0;
    const soon = () => {
      pending ||= requestAnimationFrame(() => {
        pending = 0;
        update();
      });
    };
    const observer = new ResizeObserver(soon);
    observer.observe(navBar);
    for (const item of navBar.querySelectorAll(":scope > *, #nav-bar-customization-target > *")) {
      observer.observe(item);
    }
    new MutationObserver(soon).observe(navBar, { childList: true, subtree: true });
    watchPrefs(CENTER_BAR_PREF, soon);
    window.addEventListener("unload", () => observer.disconnect());
    soon();
  }

  function watchCenteredAddress() {
    const urlbar = gURLBar.textbox || document.getElementById("urlbar");
    const box = gURLBar.inputField?.parentNode;
    const toolbar = document.getElementById("zen-appcontent-navbar-wrapper");
    if (!urlbar || !box || !toolbar) {
      return;
    }
    // (where the closed bar's text was centred, in the window)
    let closedCentre = null;
    const update = () => {
      let shift = 0;
      // Opened, the text stays where it was as the bar was clicked (centred in the opened
      // bar instead, it jumped aside, #443): the opened bar is wider and elsewhere, so the
      // shift is measured again from it, to the closed text's centre (kept, it moved the
      // closed bar's shift into the opened bar, still a jump, #475). Not with the opened
      // pop-up's text from the left (an option).
      if (
        urlbar.hasAttribute("breakout-extend") &&
        urlbar.getAttribute("zen-floating-urlbar") !== "true" &&
        !Services.prefs.getBoolPref("zia.urlbar.center-text.pop-up-left", false)
      ) {
        const bar = box.getBoundingClientRect();
        if (closedCentre !== null && bar.width) {
          const most = bar.width / 5;
          shift = Math.max(-most, Math.min(most, closedCentre - (bar.left + bar.width / 2)));
          setStyle(urlbar, "--zia-center-shift", Math.abs(shift) >= 1 ? `${Math.round(shift)}px` : null);
        }
        return;
      }
      closedCentre = null;
      if (
        Services.prefs.getBoolPref("zia.urlbar.center-text", false) &&
        root.getAttribute("zen-single-toolbar") !== "true" &&
        !urlbar.hasAttribute("breakout-extend") &&
        urlbar.getAttribute("zen-floating-urlbar") !== "true"
      ) {
        const bar = box.getBoundingClientRect();
        const card = toolbar.getBoundingClientRect();
        if (bar.width && card.width) {
          // (a fifth of the bar at most either way: a long address keeps most of its room)
          const most = bar.width / 5;
          shift = Math.max(-most, Math.min(most, card.left + card.width / 2 - (bar.left + bar.width / 2)));
          closedCentre = bar.left + bar.width / 2 + shift;
        }
      }
      setStyle(urlbar, "--zia-center-shift", Math.abs(shift) >= 1 ? `${Math.round(shift)}px` : null);
    };
    const observer = new ResizeObserver(update);
    observer.observe(box, { box: "border-box" });
    observer.observe(toolbar, { box: "border-box" });
    // (and a frame on, once the opened bar's in place: moved without a change of size,
    // nothing else measures it)
    new MutationObserver(() => {
      update();
      requestAnimationFrame(update);
    }).observe(urlbar, { attributes: true, attributeFilter: ["breakout-extend", "zen-floating-urlbar"] });
    watchPrefs(["zia.urlbar.center-text", "zia.urlbar.center-text.pop-up-left"], update);
    window.addEventListener("unload", () => observer.disconnect());
    update();
  }
