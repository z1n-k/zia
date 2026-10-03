  // Swiping back or forward with two fingers: Dia's round arrow slides in
  // from the page's edge at the pointer's height, in place of Firefox's.
  // Hold the swipe past the point where letting go navigates, and the arrow
  // opens into a card of the pages it goes back (or forward) through, the
  // one you'll land on first. Firefox still does the navigating; Zia wraps
  // its swipe animation (gHistorySwipeAnimation) to follow the gesture.
  const SWIPE_PREF = "zia.swipe.dia-arrow";
  const SWIPE_HOLD_MS = 450;
  const SWIPE_MAX_PAGES = 8;
  const SWIPE_ROW = 34;
  const SWIPE_LEAVE_MS = 260;
  // with the card open, each step this much further along the swipe (or a
  // two-finger scroll up or down, where the system passes it on) picks the
  // next page back
  const SWIPE_STEP = 0.07;
  const SWIPE_WHEEL_STEP = 28;

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

    // where the pointer was over the page, so the arrow comes in level with it
    let pointerY = null;
    document.getElementById("tabbrowser-tabpanels")?.addEventListener(
      "mousemove",
      (event) => {
        const rect = gBrowser.selectedBrowser?.closest(".browserStack")?.getBoundingClientRect();
        if (rect) {
          pointerY = event.clientY - rect.top;
        }
      },
      { passive: true }
    );

    let el = null;
    let holdTimer = null;
    let side = null;
    // the card: how far along the swipe was when it opened, scroll steps
    // since, and the page picked (how many back or forward)
    let lastDelta = 0;
    let openDelta = 0;
    let wheelSteps = 0;
    let wheelRest = 0;
    let choice = null;

    const pick = () => {
      const rows = el ? [...el.querySelectorAll(".zia-swipe-page")] : [];
      if (!el?.hasAttribute("open") || !rows.length) {
        choice = null;
        return;
      }
      const along = Math.floor(Math.max(0, lastDelta - openDelta) / SWIPE_STEP);
      const index = Math.min(Math.max(along + wheelSteps, 0), rows.length - 1);
      rows.forEach((row, i) => row.toggleAttribute("selected", i === index));
      choice = { depth: index + 1, forward: side === "forward" };
    };

    window.addEventListener(
      "wheel",
      (event) => {
        if (!el?.hasAttribute("open") || !event.deltaY) {
          return;
        }
        wheelRest += event.deltaY;
        while (Math.abs(wheelRest) >= SWIPE_WHEEL_STEP) {
          wheelSteps += Math.sign(wheelRest);
          wheelRest -= Math.sign(wheelRest) * SWIPE_WHEEL_STEP;
        }
        pick();
      },
      { capture: true, passive: true }
    );

    const clearHold = () => {
      clearTimeout(holdTimer);
      holdTimer = null;
    };

    const discard = () => {
      clearHold();
      el?.remove();
      el = null;
      side = null;
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
      const height = stack.clientHeight;
      const y = Math.min(Math.max(pointerY ?? height / 2, 60), height - 60);
      el.style.setProperty("--zia-swipe-y", `${y}px`);
      stack.append(el);
    };

    // the card of pages, the next one first
    const open = () => {
      holdTimer = null;
      if (!el || el.hasAttribute("open")) {
        return;
      }
      const pages = swipePages(side === "forward");
      if (!pages.length) {
        return;
      }
      const list = el.querySelector(".zia-swipe-pages");
      list.replaceChildren(
        ...pages.map((page) => {
          const row = document.createElementNS(HTML_NS, "div");
          row.className = "zia-swipe-page";
          const icon = document.createElementNS(HTML_NS, "img");
          icon.alt = "";
          icon.src = `page-icon:${page.url}`;
          icon.addEventListener("error", () => icon.setAttribute("src", "chrome://global/skin/icons/defaultFavicon.svg"), { once: true });
          const title = document.createElementNS(HTML_NS, "span");
          title.textContent = page.title;
          row.append(icon, title);
          return row;
        })
      );
      el.style.setProperty("--zia-swipe-h", `${pages.length * SWIPE_ROW + 12}px`);
      el.setAttribute("open", "");
      openDelta = lastDelta;
      wheelSteps = 0;
      wheelRest = 0;
      pick();
    };

    const follow = (animation, update) => {
      if (!on() || !swiping) {
        return;
      }
      const back = !!animation._willGoBack?.(update);
      const forward = !back && !!animation._willGoForward?.(update);
      if (!back && !forward) {
        if (el) {
          el.style.setProperty("--p", "0");
          el.removeAttribute("will");
          el.removeAttribute("open");
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
      lastDelta = Math.abs(update?.delta || 0);
      const progress = Math.min(lastDelta * 4, 1);
      el.style.setProperty("--p", `${progress}`);
      const will = progress >= 1;
      el.toggleAttribute("will", will);
      if (will) {
        if (!holdTimer && !el.hasAttribute("open")) {
          holdTimer = setTimeout(open, SWIPE_HOLD_MS);
        }
        pick();
      } else {
        clearHold();
        if (progress < 0.6) {
          el.removeAttribute("open");
          choice = null;
        }
      }
    };

    const leave = () => {
      clearHold();
      const gone = el;
      el = null;
      side = null;
      if (!gone) {
        return;
      }
      gone.setAttribute("leaving", "");
      setTimeout(() => gone.remove(), SWIPE_LEAVE_MS);
    };

    const start = swipe.startAnimation;
    swipe.startAnimation = function () {
      discard();
      swiping = true;
      choice = null;
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

    // Letting go with a page further back picked on the card: straight to
    // it, rather than the one page back Firefox would go
    const gestures = window.gGestureSupport;
    const coordinate = gestures?._coordinateSwipeEventWithAnimation;
    if (gestures && coordinate) {
      gestures._coordinateSwipeEventWithAnimation = function (aEvent, aDir) {
        const picked = choice;
        choice = null;
        if (on() && picked && picked.depth > 1) {
          try {
            const history = gBrowser.selectedBrowser.browsingContext.sessionHistory;
            const target = history.index + (picked.forward ? picked.depth : -picked.depth);
            if (target >= 0 && target < history.count) {
              swipe.stopAnimation();
              gBrowser.gotoIndex(target);
              return;
            }
          } catch (err) {
            noteError("swipe arrow: go to page", err);
          }
        }
        return coordinate.apply(this, arguments);
      };
    }
  }
