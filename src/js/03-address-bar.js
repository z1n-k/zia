  let titleEl = null;
  let plainEl = null;

  function createTitleElement() {
    const inputBox = gURLBar.inputField?.parentNode;
    if (!inputBox) {
      return;
    }
    titleEl = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
    titleEl.id = "zia-url-title";
    const host = document.createElementNS("http://www.w3.org/1999/xhtml", "span");
    host.className = "zia-url-title-host";
    const rest = document.createElementNS("http://www.w3.org/1999/xhtml", "span");
    rest.className = "zia-url-title-rest";
    titleEl.append(host, rest);
    inputBox.append(titleEl);

    plainEl = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
    plainEl.id = "zia-url-plain";
    const plainHost = document.createElementNS("http://www.w3.org/1999/xhtml", "span");
    plainHost.className = "zia-url-title-host";
    const plainRest = document.createElementNS("http://www.w3.org/1999/xhtml", "span");
    plainRest.className = "zia-url-title-rest";
    plainEl.append(plainHost, plainRest);
    inputBox.append(plainEl);
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
    const apply = () => updateTitle();
    Services.prefs.addObserver(TITLE_ONLY_PREF, apply);
    window.addEventListener("unload", () => Services.prefs.removeObserver(TITLE_ONLY_PREF, apply));
  }

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
      host = "";
    }

    const title = (browser?.contentTitle || "").trim();
    const valid = urlbar.getAttribute("pageproxystate") === "valid";

    // Multiview reads as a browser feature ("Multiview · 3"), not a website.
    if (valid && isMultiviewURI(uri)) {
      titleEl.firstChild.textContent = title || "Multiview";
      titleEl.lastChild.textContent = "";
      if (plainEl) {
        plainEl.firstChild.textContent = title || "Multiview";
        plainEl.lastChild.textContent = "";
      }
      urlbar.setAttribute("zia-has-title", "true");
      return;
    }

    if (!host || !valid || isErrorPage(browser)) {
      urlbar.removeAttribute("zia-has-title");
      return;
    }

    let isHomePage = false;
    try {
      const path = uri.filePath || "/";
      isHomePage = (path === "/" || path === "") && !uri.query && !uri.ref;
    } catch (err) {
      isHomePage = false;
    }
    const hasTitle = /[\p{L}\p{N}]/u.test(title);
    // Title only (an option): the title alone, in the domain's place and
    // colour, even on a site's home page; a page with none shows its domain
    if (titleOnly() && hasTitle) {
      titleEl.firstChild.textContent = title;
      titleEl.lastChild.textContent = "";
    } else {
      titleEl.firstChild.textContent = host;
      titleEl.lastChild.textContent = !isHomePage && hasTitle && title !== host ? ` / ${title}` : "";
    }

    if (plainEl) {
      let path = "";
      try {
        path = uri.pathQueryRef || "";
      } catch (err) {
        path = "";
      }
      plainEl.firstChild.textContent = host;
      plainEl.lastChild.textContent = path === "/" ? "" : path;
    }

    urlbar.setAttribute("zia-has-title", "true");
  }

  let urlbarTyping = false;
  // What was last typed
  let typedValue = "";

  // A site's address with nothing after it ends in a bare "/", which Zia
  // leaves off: youtube.com, not youtube.com/.
  const BARE_SLASH = /^([^/?#\s]+)\/$/;

  function plainAddress(value) {
    return typeof value === "string"
      ? value.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(BARE_SLASH, "$1")
      : value;
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
    let closedLength = -1;
    urlbar.addEventListener(
      "mousedown",
      (event) => {
        const opening = !urlbar.hasAttribute("breakout-extend") && !gURLBar.focused;
        closedLength = opening ? input.value.length : -1;

        holdWholeSelection = opening && event.button === 0;
      },
      true
    );
    const release = () => {
      holdWholeSelection = false;
    };
    urlbar.addEventListener("keydown", release, true);
    input.addEventListener("input", release);
    input.addEventListener("blur", release);
    const fix = () => {
      if (closedLength < 0) {
        return;
      }
      const { selectionStart, selectionEnd, value } = input;
      if (selectionStart === 0 && selectionEnd === closedLength && closedLength < value.length) {
        input.select();
        closedLength = -1;
      }
    };
    new MutationObserver(() => {
      if (!urlbar.hasAttribute("breakout-extend")) {
        closedLength = -1;
        return;
      }
      requestAnimationFrame(fix);
      for (const ms of [30, 100, 200]) {
        setTimeout(fix, ms);
      }
      setTimeout(() => {
        closedLength = -1;
      }, 400);
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
        if (gURLBar.focused || !document.hasFocus() || Date.now() - navigatingAt < 1500) {
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

  let openOffset = 0;

  function desiredOpenTop() {
    return parseFloat(getComputedStyle(root).getPropertyValue("--zia-urlbar-open-top")) || 0;
  }

  let closedTextRect = null;
  let openOffsetX = 0;

  let clickedUrlbarAt = 0;

  function rememberClosedText() {
    const urlbar = gURLBar.textbox || document.getElementById("urlbar");
    if (!urlbar || urlbar.hasAttribute("breakout-extend") || root.getAttribute("zia-split") === "true") {
      return;
    }
    // At the bottom, the opened pop-up is pinned by its bottom edge to where
    // the closed bar sits, so it grows upwards instead of off the screen.
    const bar = urlbar.getBoundingClientRect();
    if (bar.width) {
      root.style.setProperty("--zia-url-left", `${Math.round(bar.left)}px`);
      root.style.setProperty("--zia-url-width", `${Math.round(bar.width)}px`);
      root.style.setProperty("--zia-url-bottom", `${Math.round(window.innerHeight - bar.bottom)}px`);
    }
    const title = document.getElementById("zia-url-title");
    const input = urlbar.querySelector(".urlbar-input");
    const titleRect = title?.getBoundingClientRect();
    const rect = titleRect?.width ? titleRect : input?.getBoundingClientRect();
    if (rect?.width) {
      closedTextRect = { left: rect.left, centerY: rect.top + rect.height / 2 };
    }
  }

  function alignOpenedUrlbar() {
    const urlbar = gURLBar.textbox || document.getElementById("urlbar");

    if (urlbar?.getAttribute("zen-floating-urlbar") === "true" && !urlbarAtBottom()) {
      root.style.setProperty("--zia-urlbar-open-offset", "0px");
      root.style.setProperty("--zia-urlbar-open-offset-x", "0px");
      return;
    }
    if (!urlbar?.hasAttribute("breakout-extend")) {
      return;
    }
    if (root.getAttribute("zia-split") === "true") {
      return;
    }
    const input = urlbar.querySelector(".urlbar-input");
    const inputRect = input?.getBoundingClientRect();

    // At the bottom the pop-up grows upwards from the bar, so the text always
    // stays where it was, however the bar was opened.
    const openedByClick = urlbarAtBottom() || Date.now() - clickedUrlbarAt < 1500;
    if (!openedByClick && openOffsetX) {
      openOffsetX = 0;
      root.style.setProperty("--zia-urlbar-open-offset-x", "0px");
    }
    if (openedByClick && closedTextRect && inputRect?.width) {
      const dx = closedTextRect.left - inputRect.left;
      const dy = closedTextRect.centerY - (inputRect.top + inputRect.height / 2);
      if (Math.abs(dx) > 0.5) {
        openOffsetX += dx;
        root.style.setProperty("--zia-urlbar-open-offset-x", `${openOffsetX}px`);
      }
      if (Math.abs(dy) > 0.5) {
        openOffset += dy;
        root.style.setProperty("--zia-urlbar-open-offset", `${openOffset}px`);
      }
      return;
    }

    const top = urlbar.getBoundingClientRect().top;
    const diff = desiredOpenTop() - top;
    if (Math.abs(diff) > 0.5) {
      openOffset += diff;
      root.style.setProperty("--zia-urlbar-open-offset", `${openOffset}px`);
    }
  }

  function alignOpenedUrlbarSoon() {
    // Straight away, before the opened bar is first drawn, so the text doesn't
    // visibly jump; the later passes only catch late layout changes.
    alignOpenedUrlbar();
    requestAnimationFrame(alignOpenedUrlbar);
    setTimeout(alignOpenedUrlbar, 60);
    setTimeout(alignOpenedUrlbar, 200);
  }


  // Restarts a CSS animation keyed on an attribute, then clears it.
  function replayAttribute(el, name, ms, value = "true") {
    el.removeAttribute(name);
    el.getBoundingClientRect();
    el.setAttribute(name, value);
    clearTimeout(el.ziaReplayTimers?.[name]);
    el.ziaReplayTimers = { ...el.ziaReplayTimers, [name]: setTimeout(() => el.removeAttribute(name), ms) };
  }

  // Back and forward slide through when clicked; reload and stop turn into
  // each other as a page starts and finishes loading (the motion itself is
  // in the CSS, keyed on these attributes).
  function animateNavButtons() {
    for (const id of ["back-button", "forward-button"]) {
      const button = document.getElementById(id);
      button?.addEventListener(
        "click",
        (event) => {
          if (event.button === 0 && !button.hasAttribute("disabled")) {
            replayAttribute(button, "zia-slide", 420);
          }
        },
        true
      );
    }
    const reload = document.getElementById("reload-button");
    const container = document.getElementById("stop-reload-button");
    if (!reload || !container) {
      return;
    }
    let showingStop = reload.hasAttribute("displaystop");
    new MutationObserver(() => {
      const now = reload.hasAttribute("displaystop");
      if (now === showingStop) {
        return;
      }
      showingStop = now;
      replayAttribute(container, "zia-morph", 450, now ? "to-stop" : "to-reload");
      // Reload's hover look (its arrowhead drawn back) isn't kept while
      // stop's showing: coming back, reload grew in whole and then snapped
      // to that look. It springs into it once it's in, if still hovered.
      if (now) {
        reload.ziaReloadCut?.(0, true);
      } else {
        setTimeout(() => {
          if (!reload.hasAttribute("displaystop") && container.matches(":hover")) {
            reload.ziaReloadCut?.(RELOAD_HOVER_CUT);
          }
        }, 330);
      }
    }).observe(reload, { attributes: true, attributeFilter: ["displaystop"] });
  }

  // Reload on hover: the arrowhead draws back 20 degrees round the circle
  // and the arc shortens with it, on Zia's spring. The CSS reads the angle
  // from --zia-reload-cut, eased here frame by frame.
  const RELOAD_HOVER_CUT = 20;
  const RELOAD_HOVER_MS = 380;

  function springReloadHover() {
    const button = document.getElementById("reload-button");
    if (!button) {
      return;
    }
    const ease = cubicBezier(0.3, 1.35, 0.5, 1);
    let cut = 0;
    let frame = 0;
    const go = (target) => {
      cancelAnimationFrame(frame);
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        cut = target;
        button.style.setProperty("--zia-reload-cut", `${cut}deg`);
        return;
      }
      const from = cut;
      const start = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - start) / RELOAD_HOVER_MS);
        cut = from + (target - from) * ease(t);
        button.style.setProperty("--zia-reload-cut", `${cut}deg`);
        if (t < 1) {
          frame = requestAnimationFrame(step);
        }
      };
      frame = requestAnimationFrame(step);
    };
    button.addEventListener("mouseenter", () => {
      // (not while it's coming back in from stop: that springs it after)
      if (!button.parentElement?.hasAttribute("zia-morph")) {
        go(RELOAD_HOVER_CUT);
      }
    });
    button.addEventListener("mouseleave", () => go(0));
    button.ziaReloadCut = (target, instant = false) => {
      if (instant) {
        cancelAnimationFrame(frame);
        cut = target;
        button.style.setProperty("--zia-reload-cut", `${cut}deg`);
        return;
      }
      go(target);
    };
  }
