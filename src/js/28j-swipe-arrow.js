  // Dia's swipe arrow and card of pages, in place of Firefox's arrow. Firefox
  // still navigates; this wraps gHistorySwipeAnimation and gGestureSupport.
  const SWIPE_PREF = "zia.swipe.dia-arrow";
  const SWIPE_HOLD_MS = 450;
  const SWIPE_MAX_PAGES = 8;
  const SWIPE_LEAVE_MS = 260;
  const SWIPE_SETTLE_MS = 240;

  function swipePages(forward) {
    const pages = [];
    try {
      const history = gBrowser.selectedBrowser.browsingContext.sessionHistory;
      const step = forward ? 1 : -1;
      for (let i = history.index + step; i >= 0 && i < history.count && pages.length < SWIPE_MAX_PAGES; i += step) {
        const entry = history.getEntryAtIndex(i);
        const url = entry.URI?.spec || "";
        pages.push({ title: entry.title || url, url });
      }
    } catch (err) {
      noteError("swipe arrow: history", err);
    }
    return pages;
  }

  function swipeChevron() {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2.6");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", "M14 5.5l-5.5 6.5l5.5 6.5");
    svg.append(path);
    return svg;
  }

  // Zen's tap leaves the timing to macOS, which never plays it with the fingers
  // held still; this asks AppKit to play it now (null where it can't).
  let tapNow;
  function nativeTapNow() {
    if (tapNow !== undefined) {
      return tapNow;
    }
    tapNow = null;
    if (AppConstants.platform !== "macosx") {
      return tapNow;
    }
    try {
      const { ctypes } = ChromeUtils.importESModule("resource://gre/modules/ctypes.sys.mjs");
      const objc = ctypes.open("/usr/lib/libobjc.A.dylib");
      const id = ctypes.voidptr_t;
      const getClass = objc.declare("objc_getClass", ctypes.default_abi, id, ctypes.char.ptr);
      const selector = objc.declare("sel_registerName", ctypes.default_abi, id, ctypes.char.ptr);
      const send = objc.declare("objc_msgSend", ctypes.default_abi, id, id, id);
      const sendFeedback = objc.declare("objc_msgSend", ctypes.default_abi, ctypes.void_t, id, id, ctypes.long, ctypes.unsigned_long);
      const manager = getClass("NSHapticFeedbackManager");
      if (manager.isNull()) {
        return tapNow;
      }
      const performer = send(manager, selector("defaultPerformer"));
      const perform = selector("performFeedbackPattern:performanceTime:");
      // NSHapticFeedbackPatternAlignment (1), as Zen's; NSHapticFeedbackPerformanceTimeNow (1)
      tapNow = () => sendFeedback(performer, perform, 1, 1);
    } catch (err) {
      noteError("swipe arrow: native tap", err);
    }
    return tapNow;
  }

  // now: play macOS's tap at once rather than Zen's
  function swipeTap(now = false) {
    try {
      if (!Services.prefs.getBoolPref(HAPTIC_PREF, true)) {
        return;
      }
      const tap = now && nativeTapNow();
      if (tap) {
        tap();
      } else {
        zenHaptic?.();
      }
    } catch (err) {
      noteError("swipe arrow: tap", err);
    }
  }

  function watchSwipeArrow() {
    const swipe = window.gHistorySwipeAnimation;
    if (!swipe || swipe.ziaWrapped) {
      return;
    }
    swipe.ziaWrapped = true;
    const on = () => Services.prefs.getBoolPref(SWIPE_PREF, true);
    // hides Firefox's own arrow (22-swipe-arrow.css)
    const mark = () => setFlag("zia-swipe-arrow", on());
    mark();
    watchPrefs(SWIPE_PREF, mark);

    // Firefox calls its animation's methods on every swipe, arrow shown or not
    let swiping = false;
    let el = null;
    let backdrop = null;
    let holdTimer = null;
    let side = null;
    let pinned = false;
    // Zen's tap only plays inside a trackpad event, so the card opens on an
    // update; held still (no updates), a timer opens it with macOS's tap, and
    // where that can't be done the tap waits for the next update or the lift
    let willSince = 0;
    let tapOwed = false;
    const payTap = () => {
      if (tapOwed) {
        tapOwed = false;
        swipeTap();
      }
    };

    const clearHold = () => {
      clearTimeout(holdTimer);
      holdTimer = null;
    };

    const discard = () => {
      clearHold();
      pinned = false;
      el?.remove();
      backdrop?.remove();
      el = backdrop = side = null;
    };

    const close = () => {
      const node = el;
      el = null;
      discard();
      if (node) {
        node.toggleAttribute("commit", node.hasAttribute("open"));
        node.setAttribute("leaving", "");
        setTimeout(() => node.remove(), SWIPE_LEAVE_MS);
      }
    };

    const goTo = (depth, forward) => {
      try {
        const history = gBrowser.selectedBrowser.browsingContext.sessionHistory;
        const target = history.index + (forward ? depth : -depth);
        if (target >= 0 && target < history.count) {
          gBrowser.gotoIndex(target);
        }
      } catch (err) {
        noteError("swipe arrow: go to page", err);
      }
    };

    const build = (forward) => {
      discard();
      const stack = gBrowser.selectedBrowser?.closest(".browserStack");
      if (!stack) {
        return;
      }
      side = forward ? "forward" : "back";
      el = document.createElementNS(XHTML_NS, "div");
      el.id = "zia-swipe";
      el.setAttribute("side", side);
      const arrow = document.createElementNS(XHTML_NS, "div");
      arrow.className = "zia-swipe-arrow";
      arrow.append(swipeChevron());
      const list = document.createElementNS(XHTML_NS, "div");
      list.className = "zia-swipe-pages";
      el.append(arrow, list);
      stack.append(el);
    };

    const open = (fromEvent = false) => {
      clearHold();
      if (!el || el.hasAttribute("open")) {
        return;
      }
      const forward = side === "forward";
      const pages = swipePages(forward);
      if (!pages.length) {
        return;
      }
      const list = el.querySelector(".zia-swipe-pages");
      list.replaceChildren(
        ...pages.map((page, i) => {
          const row = document.createElementNS(XHTML_NS, "div");
          row.className = "zia-swipe-page";
          row.toggleAttribute("selected", i === 0);
          const icon = document.createElementNS(XHTML_NS, "img");
          icon.alt = "";
          icon.src = `page-icon:${page.url}`;
          icon.addEventListener("error", () => icon.setAttribute("src", "chrome://global/skin/icons/defaultFavicon.svg"), { once: true });
          const title = document.createElementNS(XHTML_NS, "span");
          title.textContent = page.title;
          row.append(icon, title);
          // close first, then navigate: navigating at once kept the browser busy
          // and the card hung before it left
          row.addEventListener("click", () => {
            close();
            requestAnimationFrame(() => requestAnimationFrame(() => goTo(i + 1, forward)));
          });
          return row;
        })
      );
      el.style.setProperty("--zia-swipe-n", `${pages.length}`);
      el.setAttribute("open", "");
      // squircle only once the morph ends (see 22-swipe-arrow.css)
      const card = el;
      setTimeout(() => card.setAttribute("settled", ""), SWIPE_SETTLE_MS);
      pinned = true;
      backdrop = document.createElementNS(XHTML_NS, "div");
      backdrop.id = "zia-swipe-backdrop";
      backdrop.addEventListener("mousedown", close);
      el.before(backdrop);
      if (fromEvent || nativeTapNow()) {
        swipeTap(!fromEvent);
      } else {
        tapOwed = true;
      }
    };

    const follow = (animation, update) => {
      if (!on() || !swiping) {
        return;
      }
      payTap();
      if (pinned) {
        return;
      }
      const back = !!animation._willGoBack?.(update);
      const forward = !back && !!animation._willGoForward?.(update);
      if (!back && !forward) {
        if (el) {
          el.style.setProperty("--p", "0");
          el.removeAttribute("will");
        }
        clearHold();
        return;
      }
      if (!el || side !== (forward ? "forward" : "back")) {
        build(forward);
      }
      if (!el) {
        return;
      }
      const progress = Math.min(Math.abs(update?.delta || 0) * 4, 1);
      el.style.setProperty("--p", `${progress}`);
      const will = progress >= 1;
      if (will && !el.hasAttribute("will")) {
        swipeTap();
        willSince = Date.now();
      }
      el.toggleAttribute("will", will);
      if (will) {
        if (Date.now() - willSince >= SWIPE_HOLD_MS) {
          open(true);
        } else if (!holdTimer) {
          holdTimer = setTimeout(open, SWIPE_HOLD_MS);
        }
      } else {
        clearHold();
      }
    };

    const leave = () => {
      payTap();
      if (!pinned) {
        close();
      }
    };

    window.addEventListener(
      "keydown",
      (event) => {
        if (pinned && event.key === "Escape") {
          close();
          event.preventDefault();
          event.stopPropagation();
        }
      },
      true
    );

    const start = swipe.startAnimation;
    swipe.startAnimation = function () {
      discard();
      swiping = true;
      tapOwed = false;
      return start.apply(this, arguments);
    };
    const update = swipe.updateAnimation;
    swipe.updateAnimation = function (aSwipeUpdate) {
      const result = update.apply(this, arguments);
      try {
        follow(this, aSwipeUpdate);
      } catch (err) {
        noteError("swipe arrow: update", err);
      }
      return result;
    };
    const stop = swipe.stopAnimation;
    swipe.stopAnimation = function () {
      swiping = false;
      try {
        leave();
      } catch (err) {
        noteError("swipe arrow: stop", err);
      }
      return stop.apply(this, arguments);
    };
    gBrowser.tabContainer.addEventListener("TabSelect", discard);

    // letting go with the card open: no navigating, the card stays
    const gestures = window.gGestureSupport;
    const coordinate = gestures?._coordinateSwipeEventWithAnimation;
    if (gestures && coordinate) {
      gestures._coordinateSwipeEventWithAnimation = function (aEvent, aDir) {
        if (on() && pinned) {
          swipe.stopAnimation();
          return;
        }
        return coordinate.apply(this, arguments);
      };
    }
  }
