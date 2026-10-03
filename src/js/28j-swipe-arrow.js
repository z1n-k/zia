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
    svg.setAttribute("stroke-width", "2.2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", "M14.5 6l-6 6l6 6");
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
      const y = Math.min(Math.max(pointerY ?? height / 2, 40), height - 40);
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
    };

    const follow = (animation, update) => {
      if (!on() || !animation.isAnimationRunning() || animation._isStoppingAnimation) {
        return;
      }
      const back = animation._prevBox && !animation._prevBox.collapsed;
      const forward = animation._nextBox && !animation._nextBox.collapsed;
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
      const progress = Math.min(Math.abs(update?.delta || 0) * 4, 1);
      el.style.setProperty("--p", `${progress}`);
      const will = progress >= 1;
      el.toggleAttribute("will", will);
      if (will) {
        if (!holdTimer && !el.hasAttribute("open")) {
          holdTimer = setTimeout(open, SWIPE_HOLD_MS);
        }
      } else {
        clearHold();
        if (progress < 0.6) {
          el.removeAttribute("open");
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
      try {
        leave();
      } catch (err) {
        noteError("swipe arrow: stop", err);
      }
      return stop.apply(this, arguments);
    };
    gBrowser.tabContainer.addEventListener("TabSelect", discard);
  }
