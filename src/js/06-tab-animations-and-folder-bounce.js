  // Closing one of a split's two tabs: Zen unsplits first, so the closing one shrank
  // as a row and the other slid up from under it, a jump. It goes at once instead.
  function closeSplitTabsInPlace() {
    gBrowser.tabContainer.addEventListener(
      "TabClose",
      (event) => {
        const tab = event.target;
        const split = tab?.group?.hasAttribute?.("split-view-group") ? tab.group : null;
        if (split && split.tabs.filter((t) => !t.closing || t === tab).length <= 2) {
          tab.setAttribute("zia-split-closing", "true");
        }
      },
      true
    );
  }

  function watchTabAnimations() {
    gBrowser.tabContainer.addEventListener("TabOpen", (event) => {
      const tab = event.target;
      if (tab.hasAttribute("zen-essential")) {
        return;
      }
      tab.setAttribute("zia-opening", "true");
      setTimeout(() => tab.removeAttribute("zia-opening"), 350);
    });

    const essentials = document.getElementById("zen-essentials");
    if (!essentials) {
      return;
    }
    const known = new WeakSet(essentials.querySelectorAll(".tabbrowser-tab"));
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!node.classList?.contains("tabbrowser-tab") || known.has(node)) {
            continue;
          }
          known.add(node);
          if (node.hasAttribute("zia-to-essential")) {
            continue;
          }
          node.setAttribute("zia-essential-enter", "true");
          setTimeout(() => node.removeAttribute("zia-essential-enter"), 450);
        }
      }
    }).observe(essentials, { childList: true, subtree: true });
  }

  // Zen's even 0.18s folder slide becomes a spring: quick in, a pixel or two past (the
  // same whatever the folder's size), then back. Opening, the box stretches past;
  // closing, what's below bounces up. Only the slide of the folder's start changes.
  const FOLDER_SPRING_MS = 420;
  const FOLDER_OVERSHOOT_PX = 2;
  const FOLDER_CLOSE_BOUNCE_PX = 1.5;
  const FOLDER_SELECTOR = "zen-folder, tab-group:not([split-view-group])";

  // The spring moved by fractions of a pixel, and the box's 1px outline fades for a
  // frame between pixels, so its bottom edge flickered: the motion is held steps,
  // each on a whole screen pixel counted from where it comes to rest.
  const cubicBezier = (x1, y1, x2, y2) => (t) => {
    let u = t;
    for (let i = 0; i < 8; i++) {
      const x = 3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u - t;
      const dx = 3 * (1 - u) * (1 - u) * x1 + 6 * (1 - u) * u * (x2 - x1) + 3 * u * u * (1 - x2);
      if (Math.abs(x) < 1e-5 || !dx) {
        break;
      }
      u = Math.min(1, Math.max(0, u - x / dx));
    }
    return 3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u;
  };
  const EASE_OUT = cubicBezier(0.25, 1, 0.5, 1);
  const EASE_IN_OUT = cubicBezier(0.42, 0, 0.58, 1);
  const STEPS_PER_SECOND = 120;

  // points: [offset, value, easing to the next point]
  function pixelSteps(prop, points, duration, restValue) {
    const scale = window.devicePixelRatio || 1;
    const count = Math.max(2, Math.ceil((duration / 1000) * STEPS_PER_SECOND));
    const valueAt = (t) => {
      for (let i = 0; i < points.length - 1; i++) {
        const [a, from, ease] = points[i];
        const [b, to] = points[i + 1];
        if (t <= b) {
          const local = b > a ? (t - a) / (b - a) : 1;
          return from + (to - from) * (ease ? ease(local) : local);
        }
      }
      return points.at(-1)[1];
    };
    const frames = [];
    let last = null;
    for (let i = 0; i <= count; i++) {
      const offset = i / count;
      const exact = i === count ? restValue : valueAt(offset);
      const value = i === count ? restValue : restValue + Math.round((exact - restValue) * scale) / scale;
      if (value === last && i !== count) {
        continue;
      }
      last = value;
      frames.push({ [prop]: `${value}px`, offset, easing: "steps(1, end)" });
    }
    if (frames[0].offset !== 0) {
      frames.unshift({ [prop]: `${points[0][1]}px`, offset: 0, easing: "steps(1, end)" });
    }
    delete frames.at(-1).easing;
    return frames;
  }

  // Zen's folder slides: two keyframes and a duration
  const isSlide = (keyframes, options) =>
    Array.isArray(keyframes) && keyframes.length === 2 && typeof options === "object" && options?.duration > 0;

  const bounceOn = () => {
    try {
      return Services.prefs.getBoolPref("zia.folders.bounce", true);
    } catch (err) {
      return false;
    }
  };

  // a few pixels past the end, whichever way it's going
  const pastEnd = (from, to) => to + Math.sign(to - from) * Math.min(FOLDER_OVERSHOOT_PX, Math.abs(to - from) / 4);

  // the folder's height animated outright, held for the time (zia-folder-holding)
  function animateFolderHeight(container, from, to, options, animate = Element.prototype.animate) {
    container.setAttribute("zia-folder-holding", "true");
    const done = () => {
      if (!container.ziaHold) {
        container.removeAttribute("zia-folder-holding");
      }
    };
    animate.call(container, [{ height: `${from}px` }, { height: `${to}px` }], options).finished.then(done, done);
  }

  const isFolder = (el) =>
    el?.localName === "zen-folder" || (el?.localName === "tab-group" && !el.hasAttribute("split-view-group"));

  function springFolderAnimation(element, keyframes, options) {
    // (a space's pinned tabs, hidden by clicking its name, are a folder to Zen too:
    // the same start and slide, so the tabs below spring the same way)
    const spaceStart = element.classList?.contains("space-fake-collapsible-start");
    if (
      !element.classList?.contains("zen-tab-group-start") ||
      !(spaceStart || isFolder(element.parentElement?.parentElement)) ||
      !isSlide(keyframes, options)
    ) {
      return null;
    }
    // Clicked open and shut quickly, Zen's ends go stale (opening "from 0 to 0"): the
    // way comes from the folder, and the ends from where open (0) and shut really are
    const folder = spaceStart ? element.closest("zen-workspace") : element.parentElement.parentElement;
    if (!folder) {
      return null;
    }
    // With a tab selected inside, Zen shows just that tab and the other tabs' own
    // animations carry the motion (springFolderItem), so Zen's slide is left as it was
    if (!spaceStart && (folder.hasAttribute("has-active") || folder.contains(gBrowser.selectedTab))) {
      element.parentElement.ziaHold?.();
      return null;
    }
    const closing = spaceStart ? folder.hasAttribute("collapsedpinnedtabs") : folder.hasAttribute("collapsed");
    // (a folder whose one showing tab was just dragged out of it already
    // looks shut: its room closes, without the bounce, 28-tab-dragging)
    const lentOut = (folder.ziaLentUntil || 0) > Date.now();
    const zenFrom = parseFloat(keyframes[0]?.marginTop);
    const zenTo = parseFloat(keyframes[1]?.marginTop);
    // (a space's pinned section keeps its bottom line when hidden: shut by its whole
    // height, the line vanished and came back, and the tabs below snapped down)
    const line = spaceStart ? element.parentElement.querySelector(":scope > .pinned-tabs-container-separator") : null;
    const lineHeight = line ? line.getBoundingClientRect().height : 0;
    const shut = -Math.max(
      1,
      element.parentElement.getBoundingClientRect().height - lineHeight,
      ...(spaceStart ? [] : [closing ? -zenTo : -zenFrom].filter(Number.isFinite))
    );
    const from = closing ? 0 : Number.isFinite(zenFrom) && zenFrom < 0 ? zenFrom : shut;
    // (a space's own end is where Zen leaves it once done: ended anywhere
    // else, the tabs below jumped the difference as Zen's took over)
    const zenShut = Number.isFinite(zenTo) && zenTo < 0;
    const to = closing ? (spaceStart && zenShut ? zenTo : zenShut ? Math.min(zenTo, shut) : shut) : 0;
    // Spring off: Zen's own timing, but still the folder opening over its
    // tabs (holdFolderContents); the setting is for the bounce only
    if (!bounceOn() || lentOut) {
      return { from, to, closing, plain: true, keyframes: [{ marginTop: `${from}px` }, { marginTop: `${to}px` }], options };
    }
    // Opening, the margin goes a little past 0; closing, a little past shut, so the
    // rows below rise past their place and drop back.
    const past = pastEnd(from, to);
    return {
      from,
      to,
      closing,
      keyframes: pixelSteps("marginTop", [[0, from, EASE_OUT], [0.62, past, EASE_IN_OUT], [1, to]], FOLDER_SPRING_MS, to),
      options: { ...options, duration: FOLDER_SPRING_MS, easing: "linear" },
    };
  }

  // Closing, the contents shrink to nothing before the overshoot, and a height can't
  // go below nothing, so the overshoot moved nothing: a negative bottom margin pulls
  // the folder's box and everything below up past their place and back.
  function bounceUpAfterClosing(container, animate) {
    if (!container?.classList?.contains("tab-group-container") && !container?.classList?.contains("zen-workspace-pinned-tabs-section")) {
      return;
    }
    // A space's pinned section never shrinks to nothing (its line stays), so the slide's
    // own overshoot already moves line and tabs together; this on top over-bounced the tabs
    const line = container.querySelector(":scope > .pinned-tabs-container-separator");
    if (line && line.getBoundingClientRect().height > 0) {
      return;
    }
    animate.call(
      container,
      pixelSteps("marginBottom", [[0, 0, null], [0.45, 0, EASE_OUT], [0.66, -FOLDER_CLOSE_BOUNCE_PX, EASE_IN_OUT], [1, 0]], FOLDER_SPRING_MS, 0),
      { duration: FOLDER_SPRING_MS }
    );
  }

  // Zen opens a folder by sliding its contents down from under its name (a clipped
  // margin). As in Dia, the tabs stay put and the folder opens over them: the margin
  // jumps to its end (closing, waits for it) and the folder's height takes the motion,
  // so the rows below move as before. Closing, the tabs fade out in place.
  function holdFolderContents(start, spring, animate) {
    const container = start.parentElement;
    if (!container?.classList?.contains("tab-group-container")) {
      return null;
    }
    const { to, closing } = spring;
    // From the height it's at (turned round part way); reopened mid-close, the height
    // kept when that close was stopped a moment ago
    const kept = container.ziaShown;
    container.ziaShown = null;
    const fromHeight = kept && performance.now() - kept.at < 100 ? kept.height : container.getBoundingClientRect().height;
    container.ziaHold?.();
    // to the measured height open or shut, not the margin's: Zen's ends go stale, and an
    // empty folder's margin moves just a few pixels, which stepped the height
    const saved = start.style.marginTop;
    start.style.marginTop = "0px";
    const openHeight = container.getBoundingClientRect().height;
    let toHeight = openHeight;
    if (closing) {
      start.style.marginTop = `${-2 * openHeight - 1}px`;
      toHeight = container.getBoundingClientRect().height;
    }
    start.style.marginTop = saved;
    // Shut, the margin takes everything in the folder out of sight (Zen's
    // own end can fall short when it's turned round part way)
    const shut = Math.min(to, -openHeight);
    // Already there: nothing moves (Zen's own slide would move the tabs)
    if (!(Math.abs(toHeight - fromHeight) > 0.5)) {
      const still = `${closing ? shut : 0}px`;
      return [{ marginTop: still }, { marginTop: still }];
    }
    const heights = spring.plain
      ? [{ height: `${fromHeight}px` }, { height: `${toHeight}px` }]
      : pixelSteps(
          "height",
          [
            [0, fromHeight, EASE_OUT],
            [0.62, Math.max(0, pastEnd(fromHeight, toHeight)), EASE_IN_OUT],
            [1, toHeight],
          ],
          spring.options.duration,
          toHeight
        );
    const margin = closing
      ? [{ marginTop: "0px" }, { marginTop: "0px", offset: 0.999 }, { marginTop: `${shut}px` }]
      : [{ marginTop: "0px" }, { marginTop: "0px" }];

    const items = [...container.children].filter((child) => child !== start);
    const fades = closing
      ? items.map((item) =>
          animate.call(item, [{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: "ease-in", fill: "forwards" })
        )
      : [];
    container.setAttribute("zia-folder-holding", "true");
    const growing = animate.call(container, heights, { duration: spring.options.duration, easing: spring.options.easing || "linear" });
    let done = false;
    const unfade = () => {
      for (const fade of fades) {
        fade.cancel();
      }
      gBrowser.tabContainer.removeEventListener("TabSelect", onSelect);
      window.removeEventListener("TabGroupExpand", onOpen, true);
    };
    // (however it's opened: not every opening comes through here)
    const onOpen = (event) => {
      if (event.target !== container.parentElement) {
        return;
      }
      // Opened again part way through closing: it grows back from where it got to, not
      // snapping open (Zen doesn't animate it, its margin never having got to closed)
      const midway = growing.playState === "running";
      const shown = container.getBoundingClientRect().height;
      // (for Zen's opening animation, which comes just after)
      container.ziaShown = { height: shown, at: performance.now() };
      stop();
      if (!midway) {
        return;
      }
      requestAnimationFrame(() => {
        if (container.ziaHold || !container.isConnected) {
          return;
        }
        const full = container.getBoundingClientRect().height;
        if (Math.abs(full - shown) < 1) {
          return;
        }
        animateFolderHeight(container, shown, full, { duration: FOLDER_SPRING_MS, easing: "cubic-bezier(0.25, 1, 0.5, 1)" }, animate);
      });
    };
    // A tab selected inside the closed folder is shown by Zen: it can't
    // stay faded out
    const onSelect = () => {
      if (container.contains(gBrowser.selectedTab)) {
        unfade();
      }
    };
    const stop = () => {
      if (done) {
        return;
      }
      done = true;
      if (container.ziaHold === stop) {
        container.ziaHold = null;
      }
      container.removeAttribute("zia-folder-holding");
      growing.cancel();
      unfade();
    };
    container.ziaHold = stop;
    // Closing, it's watched for opening again: that opening needn't come back through
    // here, and the tabs were left faded out in an open folder
    if (closing) {
      window.addEventListener("TabGroupExpand", onOpen, true);
    }
    growing.finished.then(() => {
      if (!closing || !container.parentElement?.hasAttribute("collapsed")) {
        stop();
        return;
      }
      // Closed, the tabs stay faded out: Zen leaves them just above the folder, where they
      // flashed over the rows above. They come back as it opens again or one is selected.
      // It's shut all the way whatever end Zen keeps: Zen writes its own (short, turned
      // round part way) just after, so this waits a frame, before anything's drawn.
      requestAnimationFrame(() => {
        if (done || !container.parentElement?.hasAttribute("collapsed")) {
          return;
        }
        if (parseFloat(getComputedStyle(start).marginTop) > shut + 0.5) {
          start.style.marginTop = `${shut}px`;
        }
        container.removeAttribute("zia-folder-holding");
        growing.cancel();
      });
      gBrowser.tabContainer.addEventListener("TabSelect", onSelect);
    }, () => {});
    return margin;
  }

  // With a tab selected inside, Zen shrinks the other tabs away (or grows them back)
  // instead of sliding, so the spring never ran: their own animations get its first leg
  // (arriving at 62%), and the contents stretch or pull past, then settle.
  const FOLDER_ARRIVE = 0.62;
  let folderMotion = null;

  function noteFolderMotion(event) {
    const group = event.target;
    if (!isFolder(group)) {
      return;
    }
    const motion = {
      group,
      closing: event.type === "TabGroupCollapse",
      hadActive: group.hasAttribute("has-active"),
      bounced: false,
    };
    folderMotion = motion;
    setTimeout(() => {
      if (folderMotion === motion) {
        folderMotion = null;
      }
    }, 0);
  }

  function springFolderItem(element, keyframes, options) {
    const motion = folderMotion;
    if (
      !motion ||
      !isSlide(keyframes, options) ||
      !(motion.closing ? motion.group.hasAttribute("has-active") : motion.hadActive)
    ) {
      return null;
    }
    const container = motion.group.groupContainer;
    if (!container?.contains(element) || container === element) {
      return null;
    }
    const [a, b] = keyframes;
    const props = Object.keys(b).filter((prop) => prop !== "offset" && prop !== "easing" && prop !== "composite");
    if (!props.includes("height")) {
      return null;
    }
    const scale = window.devicePixelRatio || 1;
    const tracks = [];
    for (const prop of props) {
      const from = parseFloat(a?.[prop]);
      const to = parseFloat(b[prop]);
      const numeric = Number.isFinite(from) && Number.isFinite(to);
      if (prop === "height" && (!numeric || from === to)) {
        return null;
      }
      if (numeric) {
        tracks.push({ prop, from, to, unit: prop === "opacity" ? "" : "px" });
      } else if (Number.isFinite(from)) {
        // Growing back to a natural size ("auto"): hold the size it starts
        // at until the very end, when the tab is its full height anyway.
        tracks.push({ prop, hold: a[prop], end: b[prop] });
      } else {
        tracks.push({ prop, hold: b[prop], end: b[prop] });
      }
    }
    if (!bounceOn()) {
      return null;
    }
    const count = Math.max(2, Math.ceil((FOLDER_SPRING_MS / 1000) * STEPS_PER_SECOND));
    const frames = [];
    for (let i = 0; i <= count; i++) {
      const offset = i / count;
      const k = offset >= FOLDER_ARRIVE ? 1 : EASE_OUT(offset / FOLDER_ARRIVE);
      const frame = { offset, easing: "steps(1, end)" };
      for (const track of tracks) {
        if (track.hold !== undefined) {
          frame[track.prop] = i === count ? track.end : track.hold;
          continue;
        }
        let value = track.from + (track.to - track.from) * k;
        if (track.unit) {
          value = track.to + Math.round((value - track.to) * scale) / scale;
        }
        frame[track.prop] = `${value}${track.unit}`;
      }
      frames.push(frame);
    }
    delete frames.at(-1).easing;
    const bounce = motion.bounced
      ? null
      : {
          container,
          keyframes: pixelSteps(
            "marginBottom",
            [
              [0, 0, EASE_OUT],
              [FOLDER_ARRIVE, motion.closing ? -FOLDER_CLOSE_BOUNCE_PX : FOLDER_OVERSHOOT_PX, EASE_IN_OUT],
              [1, 0],
            ],
            FOLDER_SPRING_MS,
            0
          ),
        };
    motion.bounced = true;
    return {
      bounce,
      keyframes: frames,
      options: { ...options, duration: FOLDER_SPRING_MS, easing: "linear" },
    };
  }

  function allowEmojiFolderIcons() {
    const picker = window.gZenEmojiPicker;
    if (!picker || typeof picker.open !== "function" || picker.open.__zia) {
      return;
    }
    const original = picker.open;
    const patched = function (anchor, options = {}) {
      if (options?.onlySvgIcons && anchor?.closest?.("zen-folder")) {
        options = { ...options, onlySvgIcons: false, emojiAsSVG: true };
      }
      return original.call(this, anchor, options);
    };
    patched.__zia = true;
    picker.open = patched;
  }

  // Opening a folder that showed just its open tab, Zen restores the other tabs'
  // "own" opacity, which can't be animated to, so they popped in: they fade instead.
  function fadeBackIn(element, keyframes) {
    if (element.localName !== "tab" || !element.closest?.(FOLDER_SELECTOR)) {
      return keyframes;
    }
    if (Array.isArray(keyframes)) {
      const last = keyframes.at(-1);
      if (keyframes.length >= 2 && last && "opacity" in last && (last.opacity === "" || last.opacity == null)) {
        return [...keyframes.slice(0, -1), { ...last, opacity: 1 }];
      }
      return keyframes;
    }
    const opacity = keyframes?.opacity;
    if (Array.isArray(opacity) && opacity.length >= 2 && (opacity.at(-1) === "" || opacity.at(-1) == null)) {
      return { ...keyframes, opacity: [...opacity.slice(0, -1), 1] };
    }
    return keyframes;
  }

  // Pinned tabs tucked away and no longer showing a tab: Zen pushed the list up by the
  // shrinking folder's height too, so the separator shot out of sight and snapped back
  // to -4px. Zen's push is made to end there, the separator travelling to its place.
  function settleTuckedPins(element, keyframes) {
    const pins = window.gZenWorkspaces?.activeWorkspaceElement?.collapsiblePins;
    if (!pins || element !== pins.groupStartElement || !pins.collapsed || pins.hasAttribute("has-active")) {
      return keyframes;
    }
    // (only with folders squashed from showing one tab, held there by Zen's finished
    // animations; Zen's placeholder tab and hidden rows are always 0 high, so don't count)
    const rows = (pins.allItems || []).filter((item) => !item.hasAttribute("zen-empty-tab") && !item.hidden && getComputedStyle(item).display !== "none");
    if (!rows.some((item) => item.getBoundingClientRect().height < 1)) {
      return keyframes;
    }
    const px = (v) => parseFloat(v);
    const target = -4;
    // each margin moved so the last lands on the target, or null where it can't
    const rescaled = (values) => {
      const from = px(values[0]);
      const to = px(values.at(-1));
      if (!Number.isFinite(from) || !Number.isFinite(to) || to >= target || from === to) {
        return null;
      }
      const scale = (target - from) / (to - from);
      return values.map((v) => (Number.isFinite(px(v)) ? `${from + (px(v) - from) * scale}px` : null));
    };
    if (Array.isArray(keyframes) && keyframes.length >= 2) {
      const margins = rescaled(keyframes.map((frame) => frame?.marginTop));
      return margins ? keyframes.map((frame, i) => (margins[i] === null ? frame : { ...frame, marginTop: margins[i] })) : keyframes;
    }
    const list = keyframes?.marginTop;
    if (Array.isArray(list) && list.length >= 2) {
      const margins = rescaled(list);
      return margins ? { ...keyframes, marginTop: margins.map((v, i) => v ?? list[i]) } : keyframes;
    }
    return keyframes;
  }

  function addFolderBounce() {
    const animate = Element.prototype.animate;
    if (animate.__zia) {
      return;
    }
    const patched = function (keyframes, options) {
      try {
        keyframes = fadeBackIn(this, keyframes);
        keyframes = settleTuckedPins(this, keyframes);
      } catch (err) {
        noteError("folder bounce: fade back in", err);
      }
      const spring = springFolderAnimation(this, keyframes, options);
      if (!spring) {
        const item = springFolderItem(this, keyframes, options);
        if (!item) {
          return animate.call(this, keyframes, options);
        }
        if (item.bounce) {
          animate.call(item.bounce.container, item.bounce.keyframes, { duration: FOLDER_SPRING_MS });
        }
        return animate.call(this, item.keyframes, item.options);
      }
      if (spring.closing && !spring.plain) {
        bounceUpAfterClosing(this.parentElement, animate);
      }
      let margin = null;
      try {
        margin = holdFolderContents(this, spring, animate);
      } catch (err) {
        noteError("folder bounce: hold contents", err);
      }
      return animate.call(this, margin || spring.keyframes, spring.options);
    };
    patched.__zia = true;
    Element.prototype.animate = patched;
    window.addEventListener("TabGroupCollapse", noteFolderMotion, true);
    window.addEventListener("TabGroupExpand", noteFolderMotion, true);
  }

  function hideWwwInUrlbar() {
    const original = gURLBar?._zenTrimURL;
    if (typeof original !== "function" || original.__zia) {
      return;
    }
    const wrapped = function (url) {
      const trimmed = original.call(this, url);
      return typeof trimmed === "string" ? plainAddress(trimmed) : trimmed;
    };
    wrapped.__zia = true;
    gURLBar._zenTrimURL = wrapped;
    try {
      gURLBar.setURI();
    } catch (err) {
      noteError("tab animations and folder bounce: hideWwwInUrlbar", err);
    }
  }

  // A collapsed space keeps the names of folders its open tab is in
  // (06-folders-and-sidebar.css), from collapsing until it has finished opening.
  const SPACE_OPEN_MS = 700;

  // A closed folder showing its selected tab keeps the other tabs see-through. When Zen
  // stops showing the tab (unloaded, or a tab chosen elsewhere), they showed piled on one
  // row as it shut: the folder keeps its layout while they fade, then shrinks shut.
  function keepTabsHiddenAfterActiveLeaves() {
    const tabs = gBrowser.tabContainer;
    if (!tabs) {
      return;
    }
    // (which tab it shows, and which folders in it keep their names: Zen
    // may clear its own marks for them as it lets go)
    const unmark = (folder) => {
      for (const el of folder.querySelectorAll("[zia-kept-tab], [zia-keeps-name]")) {
        el.removeAttribute("zia-kept-tab");
        el.removeAttribute("zia-keeps-name");
      }
    };
    const mark = (folder) => {
      unmark(folder);
      for (const tab of folder.querySelectorAll('.tabbrowser-tab:is([selected], [folder-active="true"])')) {
        tab.setAttribute("zia-kept-tab", "true");
        for (let el = tab.parentElement?.closest(FOLDER_SELECTOR); el && el !== folder; el = el.parentElement?.closest(FOLDER_SELECTOR)) {
          el.setAttribute("zia-keeps-name", "true");
        }
      }
    };
    const clear = (folder) => {
      clearTimeout(folder.ziaWasActiveTimer);
      folder.removeAttribute("zia-was-active");
      unmark(folder);
    };
    // Faded out, the folder lets go of them: Zen had already pulled them
    // out of sight, all at once, and the folder's box shrinks to match
    const settle = (folder) => {
      const container = folder.groupContainer;
      const before = container?.getBoundingClientRect().height ?? 0;
      clear(folder);
      if (!container || container.ziaHold || !folder.hasAttribute("collapsed")) {
        return;
      }
      const after = container.getBoundingClientRect().height;
      if (before - after < 0.5) {
        return;
      }
      animateFolderHeight(container, before, after, { duration: 220, easing: "cubic-bezier(0.42, 0, 0.58, 1)" });
    };
    new MutationObserver((records) => {
      for (const { target, oldValue } of records) {
        if (!isFolder(target)) {
          continue;
        }
        if (target.hasAttribute("has-active")) {
          if (target.hasAttribute("collapsed")) {
            clear(target);
            mark(target);
          }
          continue;
        }
        if (oldValue === null || !target.hasAttribute("collapsed")) {
          // (opening, the names stay while it does: gone at once, the tab
          // under one jumped up and back down)
          if (!target.hasAttribute("zia-revealing")) {
            unmark(target);
          }
          continue;
        }
        target.setAttribute("zia-was-active", "true");
        clearTimeout(target.ziaWasActiveTimer);
        target.ziaWasActiveTimer = setTimeout(() => settle(target), 170);
      }
    }).observe(tabs, { subtree: true, attributes: true, attributeFilter: ["has-active"], attributeOldValue: true });
    window.addEventListener(
      "TabGroupExpand",
      (event) => {
        const folder = event.target;
        if (folder?.hasAttribute?.("zia-was-active")) {
          clear(folder);
        }
        // Opening a folder that showed just its open tab, it's marked for a
        // moment, so the inner folder names it kept stay while it opens
        if (isFolder(folder) && folder.hasAttribute("has-active")) {
          folder.setAttribute("zia-revealing", "true");
          clearTimeout(folder.ziaRevealTimer);
          folder.ziaRevealTimer = setTimeout(() => {
            folder.removeAttribute("zia-revealing");
            if (!folder.hasAttribute("has-active")) {
              unmark(folder);
            }
          }, 500);
        }
      },
      true
    );
  }

  // Clicking a kept inner folder name opened it with everything round it still hidden,
  // so nothing showed: the folders it's in open too.
  function openKeptFolderNames() {
    window.addEventListener(
      "click",
      (event) => {
        if (event.button !== 0) {
          return;
        }
        const label = event.target?.closest?.(".tab-group-label-container");
        const folder = label?.parentElement;
        if (!isFolder(folder) || !folder.hasAttribute("collapsed") || !folder.querySelector('.tabbrowser-tab:is([selected], [folder-active="true"])')) {
          return;
        }
        if (event.target.closest(".tab-group-label-container toolbarbutton, .tab-close-button, .tab-reset-button, [anonid], button")) {
          return;
        }
        const outer = [];
        for (let el = folder.parentElement?.closest(FOLDER_SELECTOR); el; el = el.parentElement?.closest(FOLDER_SELECTOR)) {
          if (el.hasAttribute("collapsed")) {
            outer.unshift(el);
          }
        }
        if (!outer.length) {
          return;
        }
        event.stopPropagation();
        event.preventDefault();
        // One at a time, outermost first: asked to open while the folder
        // round it was still opening, Zen let it be
        const openNext = (list) => {
          const el = list.shift();
          if (!el) {
            return;
          }
          el.collapsed = false;
          requestAnimationFrame(() => {
            const moving = [el.groupStartElement, el.groupContainer]
              .filter(Boolean)
              .flatMap((node) => node.getAnimations());
            Promise.all(moving.map((a) => a.finished.catch(() => {}))).then(() => openNext(list));
          });
        };
        openNext([...outer, folder]);
      },
      true
    );
  }

  // Pinned tabs tucked away keep showing the open tab among them, as a closed folder
  // does. Once a tab outside is chosen they all shut at the name's speed, and folders
  // that were showing the tab are closed properly once out of sight.
  function tuckAwayUnopenedPins() {
    gBrowser.tabContainer.addEventListener("TabSelect", async (event) => {
      const tab = event.target;
      if (!tab || (tab.pinned && !tab.hasAttribute("zen-essential"))) {
        return;
      }
      const pins = window.gZenWorkspaces?.activeWorkspaceElement?.collapsiblePins;
      const zen = window.gZenFolders;
      if (!zen || !pins?.collapsed || !pins.hasAttribute("has-active") || pins.contains(tab)) {
        return;
      }
      try {
        // As its "-" does (the tab left open): the tab shown goes, its folder
        // and the pinned tabs shutting round it together
        const shown = [...(pins.groupContainer?.querySelectorAll?.(".tabbrowser-tab[folder-active]") || [])];
        if (shown.length && zen.animateUnload) {
          await Promise.all(
            shown.map((one) => {
              const folder = one.group?.hasAttribute("split-view-group") ? one.group.group : one.group;
              return zen.animateUnload(folder || pins, one);
            })
          );
          return;
        }
        const folders = pins.childActiveGroups || [];
        pins.removeAttribute("has-active");
        pins.activeTabs = [];
        await zen.animateCollapse(pins);
        if (!pins.collapsed || pins.hasAttribute("has-active")) {
          return;
        }
        for (const folder of folders) {
          if (!folder.isConnected || !folder.hasAttribute("has-active")) {
            continue;
          }
          folder.removeAttribute("has-active");
          folder.activeTabs = [];
          for (const shown of folder.querySelectorAll("[folder-active]")) {
            shown.removeAttribute("folder-active");
            (shown.group?.hasAttribute("split-view-group") ? shown.group : shown).style.removeProperty("--zen-folder-indent");
          }
          zen.styleCleanup(folder.allItemsRecursive || folder.allItems || []);
          if (folder.collapsed) {
            folder.groupContainer?.setAttribute("hidden", "true");
            if (folder.groupStartElement) {
              folder.groupStartElement.style.marginTop = "-4px";
            }
          }
        }
      } catch (err) {
        noteError("tuck away pins", err);
      }
    });
  }

  // Pinned tabs tucked away with none shown any more: Zen measured the push while the
  // folders were still squashed, so pushed too little and the separator went with
  // them. Once Zen is done they're pushed their whole height, the separator staying.
  function keepSeparatorWhenPinsTuck() {
    const fix = (pins) => {
      if (!pins?.isConnected || !pins.collapsed || pins.hasAttribute("has-active")) {
        return;
      }
      const start = pins.groupStartElement;
      const box = pins.groupContainer;
      const sep = box?.separatorElement || box?.querySelector?.(".pinned-tabs-container-separator");
      if (!start || !box || box.hasAttribute("hidden")) {
        return;
      }
      if (start.getAnimations().some((a) => a.playState === "running")) {
        requestAnimationFrame(() => fix(pins));
        return;
      }
      const items = pins.allItems || [];
      window.gZenFolders?.styleCleanup?.(items.filter((item) => item.style.height === "0px" || item.style.opacity === "0"));
      start.style.marginTop = "0px";
      const full = box.getBoundingClientRect().height - (sep ? sep.getBoundingClientRect().height : 0);
      start.style.marginTop = `${-(full + 4)}px`;
    };
    // (the moment the list shrinks, before it's drawn: put right later, the separator
    // went and came back)
    const watched = new WeakSet();
    const watch = () => {
      const pins = window.gZenWorkspaces?.activeWorkspaceElement?.collapsiblePins;
      const box = pins?.groupContainer;
      if (!box || watched.has(box)) {
        return;
      }
      watched.add(box);
      new ResizeObserver(() => {
        const sep = box.separatorElement || box.querySelector(".pinned-tabs-container-separator");
        if (sep && sep.getBoundingClientRect().bottom <= box.getBoundingClientRect().top + 1) {
          fix(pins);
        }
      }).observe(box);
    };
    watch();
    window.addEventListener("ZenWorkspacesUIUpdate", watch);
    gBrowser.tabContainer.addEventListener("TabSelect", watch);
    new MutationObserver((records) => {
      for (const record of records) {
        const pins = record.target;
        if (pins === window.gZenWorkspaces?.activeWorkspaceElement?.collapsiblePins && record.oldValue !== null && !pins.hasAttribute("has-active")) {
          requestAnimationFrame(() => fix(pins));
        }
      }
    }).observe(document.documentElement, {
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ["has-active"],
    });
  }

  // A folder opening round an open inner folder: Zen reveals only its own rows, so
  // the inner folder's tabs stayed hidden until tidied, then snapped in.
  function revealOpenSubfolders() {
    window.addEventListener(
      "TabGroupExpand",
      (event) => {
        const folder = event.target;
        if (folder?.localName !== "zen-folder") {
          return;
        }
        for (const inner of folder.querySelectorAll("zen-folder:not([collapsed]):not([has-active])")) {
          const hidden = (inner.allItems || []).filter((item) => item.style.height === "0px" || item.style.opacity === "0");
          if (hidden.length) {
            window.gZenFolders?.styleCleanup?.(hidden);
          }
        }
      },
      true
    );
  }

  function keepFolderNamesInCollapsedSpaces() {
    const timers = new WeakMap();
    const update = (space) => {
      clearTimeout(timers.get(space));
      if (space.hasAttribute("collapsedpinnedtabs")) {
        space.setAttribute("zia-keep-folder-names", "true");
        return;
      }
      if (space.hasAttribute("zia-keep-folder-names")) {
        timers.set(space, setTimeout(() => {
          if (!space.hasAttribute("collapsedpinnedtabs")) {
            space.removeAttribute("zia-keep-folder-names");
          }
        }, SPACE_OPEN_MS));
      }
    };
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.target.localName === "zen-workspace") {
          update(record.target);
        }
      }
    }).observe(document.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: ["collapsedpinnedtabs"],
    });
    for (const space of document.querySelectorAll("zen-workspace[collapsedpinnedtabs]")) {
      update(space);
    }
  }
