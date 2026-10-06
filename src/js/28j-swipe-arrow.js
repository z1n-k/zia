  // Swiping back or forward with two fingers: Dia's round arrow slides in
  // from the page's edge, level with the middle of the page, in place of
  // Firefox's, with a tap as it comes fully in. Hold the swipe there and it
  // opens, with another tap, into a card of the pages it goes back (or
  // forward) through, the next one first; the card stays once the fingers
  // lift, to click the page wanted, and a click anywhere else closes it.
  // A quick swipe just goes back a page, as before. Firefox does the
  // navigating; Zia wraps its swipe animation (gHistorySwipeAnimation) and
  // gesture handling (gGestureSupport) to follow the gesture.
  const SWIPE_PREF = "zia.swipe.dia-arrow";
  const SWIPE_HOLD_MS = 450;
  const SWIPE_MAX_PAGES = 8;
  const SWIPE_LEAVE_MS = 260;

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

  // a tap on the trackpad, if Zen's haptics are on
  function swipeTap() {
    try {
      if (Services.prefs.getBoolPref(HAPTIC_PREF, true)) {
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
    // Firefox's own arrow is hidden while Zia's is on (zia.css)
    const mark = () => setFlag("zia-swipe-arrow", on());
    mark();
    Services.prefs.addObserver(SWIPE_PREF, mark);
    window.addEventListener("unload", () => Services.prefs.removeObserver(SWIPE_PREF, mark));

    // between a swipe starting and ending; Firefox calls its animation's
    // methods for every swipe, whether or not its own arrow is shown
    let swiping = false;
    let el = null;
    let backdrop = null;
    let holdTimer = null;
    let side = null;
    let pinned = false;
    // macOS only plays a tap while a trackpad event is being handled, so
    // the card's tap goes with the swipe's own updates: the card opens on
    // one once the hold is long enough, or, held quite still (no updates
    // coming), on a timer, its tap then waiting for the next update or
    // the fingers lifting
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

    const fade = (node) => {
      if (!node) {
        return;
      }
      node.setAttribute("leaving", "");
      setTimeout(() => node.remove(), SWIPE_LEAVE_MS);
    };

    const discard = () => {
      clearHold();
      pinned = false;
      el?.remove();
      backdrop?.remove();
      el = null;
      backdrop = null;
      side = null;
    };

    const close = () => {
      clearHold();
      pinned = false;
      fade(el);
      backdrop?.remove();
      el = null;
      backdrop = null;
      side = null;
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
      el = document.createElementNS(HTML_NS, "div");
      el.id = "zia-swipe";
      el.setAttribute("side", side);
      const arrow = document.createElementNS(HTML_NS, "div");
      arrow.className = "zia-swipe-arrow";
      arrow.append(swipeChevron());
      const list = document.createElementNS(HTML_NS, "div");
      list.className = "zia-swipe-pages";
      el.append(arrow, list);
      stack.append(el);
    };

    // The card of pages, the next one first. It stays from here on, a click
    // on a page going to it and a click anywhere round it closing it.
    const open = (fromEvent = false) => {
      clearHold();
      if (!el || el.hasAttribute("open")) {
        return;
      }
      const pages = swipePages(side === "forward");
      if (!pages.length) {
        return;
      }
      const forward = side === "forward";
      const list = el.querySelector(".zia-swipe-pages");
      list.replaceChildren(
        ...pages.map((page, i) => {
          const row = document.createElementNS(HTML_NS, "div");
          row.className = "zia-swipe-page";
          row.toggleAttribute("selected", i === 0);
          const icon = document.createElementNS(HTML_NS, "img");
          icon.alt = "";
          icon.src = `page-icon:${page.url}`;
          icon.addEventListener("error", () => icon.setAttribute("src", "chrome://global/skin/icons/defaultFavicon.svg"), { once: true });
          const title = document.createElementNS(HTML_NS, "span");
          title.textContent = page.title;
          row.append(icon, title);
          row.addEventListener("click", () => {
            close();
            goTo(i + 1, forward);
          });
          return row;
        })
      );
      // (its height from the rows', worked out with the tabs' sizes, 22)
      el.style.setProperty("--zia-swipe-n", `${pages.length}`);
      el.setAttribute("open", "");
      pinned = true;
      // behind the card, over the page: a click anywhere round it closes it
      backdrop = document.createElementNS(HTML_NS, "div");
      backdrop.id = "zia-swipe-backdrop";
      backdrop.addEventListener("mousedown", close);
      el.before(backdrop);
      // the arrow turning into the card
      tapOwed = true;
      if (fromEvent) {
        payTap();
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
      const wanted = forward ? "forward" : "back";
      if (!el || side !== wanted) {
        build(forward);
      }
      if (!el) {
        return;
      }
      const progress = Math.min(Math.abs(update?.delta || 0) * 4, 1);
      el.style.setProperty("--p", `${progress}`);
      const will = progress >= 1;
      if (will && !el.hasAttribute("will")) {
        // the arrow fully in: letting go now goes back
        swipeTap();
        willSince = Date.now();
      }
      el.toggleAttribute("will", will);
      if (will) {
        if (Date.now() - willSince >= SWIPE_HOLD_MS) {
          open(true);
        } else if (!holdTimer) {
          holdTimer = setTimeout(open, SWIPE_HOLD_MS + 120);
        }
      } else {
        clearHold();
      }
    };

    const leave = () => {
      payTap();
      // the card stays once the fingers lift
      if (pinned) {
        return;
      }
      close();
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

    // Letting go with the card open: no going back, the card stays to pick
    // from; otherwise Firefox's one page back
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
