  // Dia's swipe arrow and card of pages, in place of Firefox's arrow. Firefox
  // still navigates; this wraps gHistorySwipeAnimation and gGestureSupport.
  // Used elsewhere: watchSwipeArrow.
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

  // Firefox calls its animation's methods on every swipe, arrow shown or not: whether one is
  // under way, the arrow (which becomes the card) and the backdrop behind the card, the side
  // it's on, the timer that opens it when held, and whether it's open and stays after the lift.
  // Zen's tap only plays inside a trackpad event, so the card opens on an
  // update; held still (no updates), a timer opens it with macOS's tap, and
  // where that can't be done the tap waits for the next update or the lift
  // (willSince: when it last reached "will go"; tapOwed: that waiting tap).
  const swipeCard = { swiping: false, el: null, backdrop: null, holdTimer: null, side: null, pinned: false, willSince: 0, tapOwed: false };

  function swipeOn() {
    return Services.prefs.getBoolPref(SWIPE_PREF, true);
  }

  // hides Firefox's own arrow (22-swipe-arrow.css)
  function markSwipeArrow() {
    setFlag("zia-swipe-arrow", swipeOn());
  }

  function paySwipeTap() {
    if (swipeCard.tapOwed) {
      swipeCard.tapOwed = false;
      swipeTap();
    }
  }

  function clearSwipeHold() {
    clearTimeout(swipeCard.holdTimer);
    swipeCard.holdTimer = null;
  }

  function discardSwipe() {
    clearSwipeHold();
    swipeCard.pinned = false;
    swipeCard.el?.remove();
    swipeCard.backdrop?.remove();
    swipeCard.el = swipeCard.backdrop = swipeCard.side = null;
  }

  function closeSwipe() {
    const node = swipeCard.el;
    swipeCard.el = null;
    discardSwipe();
    if (node) {
      node.toggleAttribute("commit", node.hasAttribute("open"));
      node.setAttribute("leaving", "");
      // (not cancelled: a card on its way out goes, whatever comes after it)
      setTimeout(() => node.remove(), SWIPE_LEAVE_MS);
    }
  }

  function goToSwipePage(depth, forward) {
    try {
      const history = gBrowser.selectedBrowser.browsingContext.sessionHistory;
      const target = history.index + (forward ? depth : -depth);
      if (target >= 0 && target < history.count) {
        gBrowser.gotoIndex(target);
      }
    } catch (err) {
      noteError("swipe arrow: go to page", err);
    }
  }

  function buildSwipe(forward) {
    discardSwipe();
    const stack = gBrowser.selectedBrowser?.closest(".browserStack");
    if (!stack) {
      return;
    }
    swipeCard.side = forward ? "forward" : "back";
    const el = document.createElementNS(XHTML_NS, "div");
    swipeCard.el = el;
    el.id = "zia-swipe";
    el.setAttribute("side", swipeCard.side);
    const arrow = document.createElementNS(XHTML_NS, "div");
    arrow.className = "zia-swipe-arrow";
    arrow.append(swipeChevron());
    const list = document.createElementNS(XHTML_NS, "div");
    list.className = "zia-swipe-pages";
    el.append(arrow, list);
    stack.append(el);
  }

  function swipePageRow(page, i, forward) {
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
      closeSwipe();
      requestAnimationFrame(() => requestAnimationFrame(() => goToSwipePage(i + 1, forward)));
    });
    return row;
  }

  function openSwipe(fromEvent = false) {
    clearSwipeHold();
    const el = swipeCard.el;
    if (!el || el.hasAttribute("open")) {
      return;
    }
    const forward = swipeCard.side === "forward";
    const pages = swipePages(forward);
    if (!pages.length) {
      return;
    }
    const list = el.querySelector(".zia-swipe-pages");
    list.replaceChildren(...pages.map((page, i) => swipePageRow(page, i, forward)));
    el.style.setProperty("--zia-swipe-n", `${pages.length}`);
    el.setAttribute("open", "");
    // squircle only once the morph ends (see 22-swipe-arrow.css; on that card
    // only, so one already gone just goes)
    setTimeout(() => el.setAttribute("settled", ""), SWIPE_SETTLE_MS);
    swipeCard.pinned = true;
    const backdrop = document.createElementNS(XHTML_NS, "div");
    swipeCard.backdrop = backdrop;
    backdrop.id = "zia-swipe-backdrop";
    backdrop.addEventListener("mousedown", closeSwipe);
    el.before(backdrop);
    if (fromEvent || nativeTapNow()) {
      swipeTap(!fromEvent);
    } else {
      swipeCard.tapOwed = true;
    }
  }

  function followSwipe(animation, update) {
    if (!swipeOn() || !swipeCard.swiping) {
      return;
    }
    paySwipeTap();
    if (swipeCard.pinned) {
      return;
    }
    const back = !!animation._willGoBack?.(update);
    const forward = !back && !!animation._willGoForward?.(update);
    if (!back && !forward) {
      if (swipeCard.el) {
        swipeCard.el.style.setProperty("--p", "0");
        swipeCard.el.removeAttribute("will");
      }
      clearSwipeHold();
      return;
    }
    if (!swipeCard.el || swipeCard.side !== (forward ? "forward" : "back")) {
      buildSwipe(forward);
    }
    const el = swipeCard.el;
    if (!el) {
      return;
    }
    const progress = Math.min(Math.abs(update?.delta || 0) * 4, 1);
    el.style.setProperty("--p", `${progress}`);
    const will = progress >= 1;
    if (will && !el.hasAttribute("will")) {
      swipeTap();
      swipeCard.willSince = Date.now();
    }
    el.toggleAttribute("will", will);
    if (will) {
      if (Date.now() - swipeCard.willSince >= SWIPE_HOLD_MS) {
        openSwipe(true);
      } else if (!swipeCard.holdTimer) {
        swipeCard.holdTimer = setTimeout(openSwipe, SWIPE_HOLD_MS);
      }
    } else {
      clearSwipeHold();
    }
  }

  function leaveSwipe() {
    paySwipeTap();
    if (!swipeCard.pinned) {
      closeSwipe();
    }
  }

  function onSwipeKey(event) {
    if (swipeCard.pinned && event.key === "Escape") {
      closeSwipe();
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function wrapSwipeAnimation(swipe) {
    const start = swipe.startAnimation;
    swipe.startAnimation = function () {
      discardSwipe();
      swipeCard.swiping = true;
      swipeCard.tapOwed = false;
      return start.apply(this, arguments);
    };
    const update = swipe.updateAnimation;
    swipe.updateAnimation = function (aSwipeUpdate) {
      const result = update.apply(this, arguments);
      try {
        followSwipe(this, aSwipeUpdate);
      } catch (err) {
        noteError("swipe arrow: update", err);
      }
      return result;
    };
    const stop = swipe.stopAnimation;
    swipe.stopAnimation = function () {
      swipeCard.swiping = false;
      try {
        leaveSwipe();
      } catch (err) {
        noteError("swipe arrow: stop", err);
      }
      return stop.apply(this, arguments);
    };
  }

  // letting go with the card open: no navigating, the card stays
  function keepSwipeCardOnLift(swipe) {
    const gestures = window.gGestureSupport;
    const coordinate = gestures?._coordinateSwipeEventWithAnimation;
    if (gestures && coordinate) {
      gestures._coordinateSwipeEventWithAnimation = function (aEvent, aDir) {
        if (swipeOn() && swipeCard.pinned) {
          swipe.stopAnimation();
          return;
        }
        return coordinate.apply(this, arguments);
      };
    }
  }

  function watchSwipeArrow() {
    const swipe = window.gHistorySwipeAnimation;
    if (!swipe || swipe.ziaWrapped) {
      return;
    }
    swipe.ziaWrapped = true;
    markSwipeArrow();
    watchPrefs(SWIPE_PREF, markSwipeArrow);
    window.addEventListener("keydown", onSwipeKey, true);
    wrapSwipeAnimation(swipe);
    gBrowser.tabContainer.addEventListener("TabSelect", discardSwipe);
    keepSwipeCardOnLift(swipe);
  }
