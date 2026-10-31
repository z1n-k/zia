  // The split view's thumbnail, and rows lent out of a folder while dragging.
  // Used elsewhere: THUMB_MS, LENT_MS, pictureSize, fillPicture, sizeThumb, fitThumb, showThumb,
  // hideThumb, noLanding, lendOut, holdLent, unlend.

  const THUMB_MS = 150;
  const LENT_MS = 800;
  const HOLD_MS = 60;
  const HOLD_EASE_MS = 200;
  const SHUT_WAIT_MS = 1000;

  // the thumbnail shown out over the page, and its timer back into the row
  const thumb = { node: null, timer: 0 };

  // folders whose one showing tab was lent out, to hold as it lands (unlend, holdLent)
  let lentHomes = [];

  const showThumb = (x, y) => {
    clearTimeout(thumb.timer);
    if (!thumb.node) {
      thumb.node = document.createElementNS(XHTML_NS, "div");
      thumb.node.id = "zia-drag-thumb";
      fitThumb(thumb.node, (bgOf(drag.tab) || drag.moving).getBoundingClientRect());
      root.appendChild(thumb.node);
      thumb.node.getBoundingClientRect();
    }
    fillThumb();
    thumb.node.removeAttribute("zia-leaving");
    const size = pictureSize();
    sizeThumb(thumb.node, size.width, size.height);
    thumb.node.style.left = `${Math.round(x)}px`;
    thumb.node.style.top = `${Math.round(y)}px`;
    if (!drag.moving.hasAttribute("zia-drag-away")) {
      tap();
    }
    drag.moving.setAttribute("zia-drag-away", "true");
  };

  const hideThumb = (instant = false) => {
    if (!thumb.node || thumb.node.hasAttribute("zia-leaving")) {
      return;
    }
    const leaving = thumb.node;
    const moving = drag?.moving;
    const done = () => {
      leaving.remove();
      if (thumb.node === leaving) {
        thumb.node = null;
      }
      moving?.removeAttribute("zia-drag-away");
    };
    if (instant || !moving?.isConnected) {
      done();
      return;
    }
    leaving.setAttribute("zia-leaving", "true");
    fitThumb(leaving, (bgOf(drag.tab) || moving).getBoundingClientRect());
    thumb.timer = setTimeout(done, THUMB_MS);
  };

  const fillPicture = (node, tab) => {
    if (!node) {
      return;
    }
    const source = pictureSource();
    if (source) {
      let canvas = node.querySelector("canvas");
      if (!canvas) {
        canvas = document.createElementNS(XHTML_NS, "canvas");
        node.replaceChildren(canvas);
      }
      if (canvas.width !== source.width || canvas.height !== source.height) {
        canvas.width = source.width;
        canvas.height = source.height;
      }
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(source, 0, 0);
      node.removeAttribute("zia-card");
    } else if (!node.firstChild && tab) {
      const icon = document.createElementNS(XHTML_NS, "img");
      icon.setAttribute("src", gBrowser.getIcon(tab) || DEFAULT_TAB_ICON);
      node.replaceChildren(icon);
      node.setAttribute("zia-card", "true");
    }
  };
  const fillThumb = () => fillPicture(thumb.node, drag?.tab);

  const pictureSource = () => {
    const source = document.getElementById("zia-split-drag-picture");
    return source?.width ? source : null;
  };
  const pictureSize = () => {
    const source = pictureSource();
    const width = parseFloat(source?.style.width) || DRAG_PICTURE_W;
    const height = parseFloat(source?.style.height) || DRAG_PICTURE_H;
    return { width, height };
  };

  const sizeThumb = (node, width, height) => {
    node.style.width = `${Math.round(width)}px`;
    node.style.height = `${Math.round(height)}px`;
  };

  // sized to a box and centred on it (it's drawn from its middle)
  const fitThumb = (node, box) => {
    sizeThumb(node, box.width, box.height);
    node.style.left = `${Math.round(box.left + box.width / 2)}px`;
    node.style.top = `${Math.round(box.top + box.height / 2)}px`;
  };

  const noLanding = () => {
    const dnd = gBrowser.tabContainer.tabDragAndDrop;
    if (!dnd || dnd._landDragImageOnElements?.ziaQuiet) {
      return;
    }
    const original = dnd._landDragImageOnElements;
    const quiet = function (elements, ...rest) {
      try {
        for (const element of elements || []) {
          const { width, height } = element.getBoundingClientRect();
          this.ZenDragAndDropService.addDropLandingRect(
            Math.round(element.screenX),
            Math.round(element.screenY),
            Math.round(width),
            Math.round(height)
          );
        }
        this._landingElements = [];
      } catch (err) {
        return original?.call(this, elements, ...rest);
      }
      return undefined;
    };
    quiet.ziaQuiet = true;
    dnd._landDragImageOnElements = quiet;
  };

  // A closed folder whose one showing tab is dragged out is marked, so its room closes
  // smoothly once the tab lands (06: Zen's easing, as the spring's steps stuttered)
  const lendOut = (row) => {
    const home = row?.parentElement?.closest?.("zen-folder");
    if (!home || !isCollapsed(home) || !home.hasAttribute("has-active")) {
      return;
    }
    const shown = (home.activeTabs || []).filter((t) => t?.isConnected);
    if (shown.some((t) => t !== row && !row.contains?.(t))) {
      return;
    }
    home.setAttribute("zia-lent", "true");
  };

  const unlend = () => {
    for (const home of document.querySelectorAll("zen-folder[zia-lent]")) {
      // (on the folder itself, where its bounce looks, 06-tab-animations)
      home.ziaLentUntil = Date.now() + LENT_MS;
      home.removeAttribute("zia-lent");
      // where its box ended through the drag (its visible bottom), for holdLent
      home.ziaBoxBottom = home.getBoundingClientRect().bottom - (parseFloat(getComputedStyle(home, "::before").bottom) || 0);
      home.ziaHeldHeight = home.getBoundingClientRect().height;
      // and where what's below was seen: the rows round it were shifted to show the tab gone,
      // so held by its height alone, what's below dropped a row first
      const below = shownAfter(home);
      home.ziaBelow = below ? { node: below, top: below.getBoundingClientRect().top } : null;
      lentHomes.push(home);
    }
  };

  // What shows next below a folder (for holdLent: where it was seen)
  const shownAfter = (home) => {
    const strip = document.getElementById("tabbrowser-tabs");
    for (let at = home; at && at !== strip && strip?.contains(at); at = at.parentElement) {
      for (let next = at.nextElementSibling; next; next = next.nextElementSibling) {
        if (next.hasAttribute("zia-landing") || next.hasAttribute("zia-dragging")) {
          continue;
        }
        if (next.getBoundingClientRect().height > 0) {
          return next;
        }
      }
    }
    return null;
  };

  // As the tab leaves, the folder's box is held where it ended through the drag, then
  // eased to its own height (in one step it snapped; held by its whole height it showed
  // more first, opening a little before closing)
  const holdLent = () => {
    const homes = lentHomes;
    lentHomes = [];
    for (const home of homes) {
      holdHome(home);
    }
  };

  // (what's noted for it is kept on the folder itself, ziaHeldHeight and the like: noted
  // twice before it's held, the later note wins and it's held once)
  const holdHome = (home) => {
    let held = home.ziaHeldHeight;
    const boxBottom = home.ziaBoxBottom;
    const below = home.ziaBelow;
    home.ziaHeldHeight = home.ziaBoxBottom = home.ziaBelow = null;
    if (!home.isConnected || !(held > 0) || boxBottom == null) {
      return;
    }
    // held so what's below stays where it was seen
    if (below?.node?.isConnected && !below.node.hasAttribute("zia-landing")) {
      const height = home.getBoundingClientRect().height;
      held = Math.max(0, height + below.top - below.node.getBoundingClientRect().top);
    }
    // its whole height (what's below stays) and its box's bottom where it was: as the tab
    // leaves, padding and inset change, and held by either alone the other moved
    home.style.setProperty("height", `${held}px`, "important");
    const inset = home.getBoundingClientRect().top + held - boxBottom;
    home.style.setProperty("--zia-hold-inset", `${inset}px`);
    home.setAttribute("zia-holding", "true");
    // (not kept or cancelled: the release must always come, or the folder stays held)
    setTimeout(() => releaseHome(home, held, inset), HOLD_MS);
  };

  const releaseHome = (home, held, inset) => {
    home.style.removeProperty("height");
    home.removeAttribute("zia-holding");
    home.style.removeProperty("--zia-hold-inset");
    if (!home.isConnected) {
      return;
    }
    // (closed and showing no tab, it ends as its name alone: Zen is still shutting it,
    // a few pixels taller, so it eased open to that and snapped back)
    const shut = isCollapsed(home) && !home.hasAttribute("has-active") && !home.querySelector(".tabbrowser-tab[selected]");
    const own = shut && headerOf(home) ? headerOf(home).getBoundingClientRect().height : home.getBoundingClientRect().height;
    const ownInset = parseFloat(getComputedStyle(home, "::before").bottom) || 0;
    const timing = { duration: HOLD_EASE_MS, easing: "cubic-bezier(0.25, 1, 0.5, 1)" };
    if (shut) {
      // ...held there until Zen has shut its list (sooner, it showed it part shut)
      easeUntilShut(home, held, own, timing);
    } else if (Math.abs(own - held) >= 0.5) {
      home.animate([{ height: `${held}px` }, { height: `${own}px` }], timing);
    }
    if (Math.abs(ownInset - inset) >= 0.5) {
      for (const pseudoElement of ["::before", "::after"]) {
        home.animate([{ bottom: `${inset}px` }, { bottom: `${ownInset}px` }], { ...timing, pseudoElement });
      }
    }
  };

  const easeUntilShut = (home, held, own, timing) => {
    const easing = home.animate([{ height: `${held}px` }, { height: `${own}px` }], { ...timing, fill: "forwards" });
    // (checked each frame, and given up after SHUT_WAIT_MS, so it always ends)
    const until = performance.now() + SHUT_WAIT_MS;
    const release = () => {
      const list = home.querySelector(":scope > .tab-group-container");
      const busy = home.getAnimations({ subtree: true }).some((a) => a !== easing && a.playState === "running");
      if (home.isConnected && performance.now() < until && (busy || (list && !list.hidden) || easing.playState === "running")) {
        requestAnimationFrame(release);
        return;
      }
      easing.cancel();
    };
    requestAnimationFrame(release);
  };
