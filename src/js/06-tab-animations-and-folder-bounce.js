  // Tabs opening and closing, and Zen's folder slides turned into Zia's spring: every animation
  // the window starts goes through addFolderBounce's Element.prototype.animate.
  // Used elsewhere: closeSplitTabsInPlace, watchTabAnimations, addFolderBounce, FOLDER_SELECTOR,
  // isFolder, cubicBezier, animateFolderHeight (only by 06a, its sibling).

  const TAB_OPENING_MS = 350;
  const ESSENTIAL_ENTER_MS = 450;
  // Zen's even 0.18s folder slide becomes a spring: quick in, a pixel or two past (the
  // same whatever the folder's size), then back. Opening, the box stretches past;
  // closing, what's below bounces up. Only the slide of the folder's start changes.
  const FOLDER_SPRING_MS = 420;
  const FOLDER_OVERSHOOT_PX = 2;
  const FOLDER_CLOSE_BOUNCE_PX = 1.5;
  const FOLDER_SELECTOR = "zen-folder, tab-group:not([split-view-group])";
  // (closing, the tabs in it fading out in place)
  const FOLDER_FADE_MS = 220;
  // (a close stopped this recently left the height to reopen from)
  const KEPT_HEIGHT_MS = 100;

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
      // (not kept: it only clears this tab's own mark, closed or not)
      setTimeout(() => tab.removeAttribute("zia-opening"), TAB_OPENING_MS);
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
          // (not kept: it only clears this tile's own mark)
          setTimeout(() => node.removeAttribute("zia-essential-enter"), ESSENTIAL_ENTER_MS);
        }
      }
    }).observe(essentials, { childList: true, subtree: true });
  }

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

  // The folder (or space) whose start this slide moves, or null for any other animation
  function slidingFolder(element, keyframes, options) {
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
    return folder ? { folder, spaceStart } : null;
  }

  function slideEnds(element, spaceStart, keyframes, closing) {
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
    return { from, to };
  }

  function springFolderAnimation(element, keyframes, options) {
    const sliding = slidingFolder(element, keyframes, options);
    if (!sliding) {
      return null;
    }
    const { folder, spaceStart } = sliding;
    // With a tab selected inside, Zen shows just that tab and the other tabs' own
    // animations carry the motion (springFolderItem), so Zen's slide is left as it was.
    // The same for a space's pinned tabs holding the selected tab (or one kept showing):
    // Zen's slide goes nowhere then, and Zia's slid the whole section up out of sight,
    // that tab with it, for it to snap back once done (and opening, down from nothing)
    const holdsShown = spaceStart
      ? folder.collapsiblePins?.hasAttribute("has-active") || element.parentElement.contains(gBrowser.selectedTab)
      : folder.hasAttribute("has-active") || folder.contains(gBrowser.selectedTab);
    if (holdsShown) {
      element.parentElement.ziaHold?.();
      return null;
    }
    const closing = spaceStart ? folder.hasAttribute("collapsedpinnedtabs") : folder.hasAttribute("collapsed");
    // (a folder whose one showing tab was just dragged out of it already
    // looks shut: its room closes, without the bounce, 28-tab-dragging)
    const lentOut = (folder.ziaLentUntil || 0) > Date.now();
    const { from, to } = slideEnds(element, spaceStart, keyframes, closing);
    // Spring off: Zen's own timing, but still the folder opening over its
    // tabs (holdFolderContents); the setting is for the bounce only
    // (a folder just dropped into it opens it, its room already made by the drag: at
    // once, rather than shut and springing open again, 28-tab-dragging)
    if ((folder.ziaDroppedUntil || 0) > Date.now() && !closing) {
      return { from: to, to, closing, plain: true, keyframes: [{ marginTop: `${to}px` }, { marginTop: `${to}px` }], options: { ...options, duration: 0 } };
    }
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
    const fromHeight = kept && performance.now() - kept.at < KEPT_HEIGHT_MS ? kept.height : container.getBoundingClientRect().height;
    container.ziaHold?.();
    const { openHeight, toHeight } = measureFolderHeights(start, container, closing);
    // Shut, the margin takes everything in the folder out of sight (Zen's
    // own end can fall short when it's turned round part way)
    const shut = Math.min(to, -openHeight);
    // Already there: nothing moves (Zen's own slide would move the tabs)
    if (!(Math.abs(toHeight - fromHeight) > 0.5)) {
      const still = `${closing ? shut : 0}px`;
      return [{ marginTop: still }, { marginTop: still }];
    }
    const heights = folderHeightSteps(spring, fromHeight, toHeight);
    const margin = closing
      ? [{ marginTop: "0px" }, { marginTop: "0px", offset: 0.999 }, { marginTop: `${shut}px` }]
      : [{ marginTop: "0px" }, { marginTop: "0px" }];

    const items = [...container.children].filter((child) => child !== start);
    const fades = closing
      ? items.map((item) =>
          animate.call(item, [{ opacity: 1 }, { opacity: 0 }], { duration: FOLDER_FADE_MS, easing: "ease-in", fill: "forwards" })
        )
      : [];
    container.setAttribute("zia-folder-holding", "true");
    const growing = animate.call(container, heights, { duration: spring.options.duration, easing: spring.options.easing || "linear" });
    holdUntilSettled({ container, start, shut, closing, animate, fades, growing, done: false });
    return margin;
  }

  // to the measured height open or shut, not the margin's: Zen's ends go stale, and an
  // empty folder's margin moves just a few pixels, which stepped the height
  function measureFolderHeights(start, container, closing) {
    const saved = start.style.marginTop;
    start.style.marginTop = "0px";
    const openHeight = container.getBoundingClientRect().height;
    let toHeight = openHeight;
    if (closing) {
      start.style.marginTop = `${-2 * openHeight - 1}px`;
      toHeight = container.getBoundingClientRect().height;
    }
    start.style.marginTop = saved;
    return { openHeight, toHeight };
  }

  function folderHeightSteps(spring, fromHeight, toHeight) {
    return spring.plain
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
  }

  // The folder held at its moving height until the move is done, or let go sooner
  // (container.ziaHold) when another move takes over
  function holdUntilSettled(hold) {
    const { container, closing, growing } = hold;
    // (however it's opened: not every opening comes through here)
    hold.onOpen = (event) => reopenHeldFolder(hold, event);
    // A tab selected inside the closed folder is shown by Zen: it can't
    // stay faded out
    hold.onSelect = () => {
      if (container.contains(gBrowser.selectedTab)) {
        unfadeHeldFolder(hold);
      }
    };
    hold.stop = () => stopHoldingFolder(hold);
    container.ziaHold = hold.stop;
    // Closing, it's watched for opening again: that opening needn't come back through
    // here, and the tabs were left faded out in an open folder
    if (closing) {
      window.addEventListener("TabGroupExpand", hold.onOpen, true);
    }
    growing.finished.then(() => settleHeldFolder(hold), () => {});
  }

  function unfadeHeldFolder(hold) {
    for (const fade of hold.fades) {
      fade.cancel();
    }
    gBrowser.tabContainer.removeEventListener("TabSelect", hold.onSelect);
    window.removeEventListener("TabGroupExpand", hold.onOpen, true);
  }

  function stopHoldingFolder(hold) {
    if (hold.done) {
      return;
    }
    hold.done = true;
    const { container } = hold;
    if (container.ziaHold === hold.stop) {
      container.ziaHold = null;
    }
    container.removeAttribute("zia-folder-holding");
    hold.growing.cancel();
    unfadeHeldFolder(hold);
  }

  function reopenHeldFolder(hold, event) {
    const { container, growing, animate } = hold;
    if (event.target !== container.parentElement) {
      return;
    }
    // Opened again part way through closing: it grows back from where it got to, not
    // snapping open (Zen doesn't animate it, its margin never having got to closed)
    const midway = growing.playState === "running";
    const shown = container.getBoundingClientRect().height;
    // (for Zen's opening animation, which comes just after)
    container.ziaShown = { height: shown, at: performance.now() };
    stopHoldingFolder(hold);
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
  }

  function settleHeldFolder(hold) {
    const { container, start, shut, closing, growing } = hold;
    if (!closing || !container.parentElement?.hasAttribute("collapsed")) {
      stopHoldingFolder(hold);
      return;
    }
    // Closed, the tabs stay faded out: Zen leaves them just above the folder, where they
    // flashed over the rows above. They come back as it opens again or one is selected.
    // It's shut all the way whatever end Zen keeps: Zen writes its own (short, turned
    // round part way) just after, so this waits a frame, before anything's drawn.
    requestAnimationFrame(() => {
      if (hold.done || !container.parentElement?.hasAttribute("collapsed")) {
        return;
      }
      if (parseFloat(getComputedStyle(start).marginTop) > shut + 0.5) {
        start.style.marginTop = `${shut}px`;
      }
      container.removeAttribute("zia-folder-holding");
      growing.cancel();
    });
    gBrowser.tabContainer.addEventListener("TabSelect", hold.onSelect);
  }

  // With a tab selected inside, Zen shrinks the other tabs away (or grows them back)
  // instead of sliding, so the spring never ran: their own animations get its first leg
  // (arriving at 62%), and the contents stretch or pull past, then settle.
  const FOLDER_ARRIVE = 0.62;
  let folderMotion = null;

  function noteFolderMotion(event) {
    const group = event.target;
    // (a space's pinned tabs, hidden or shown by clicking its name, too: holding the open tab,
    // in a folder there or not, they shut without a bounce, as Zen's slide is skipped then)
    if (!isFolder(group) && group?.localName !== "zen-workspace-collapsible-pins") {
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
      !(motion.closing ? motion.group.hasAttribute("has-active") : motion.hadActive) ||
      // (a folder opened where it is inside a closed one: Zen's own grow and shrink.
      // Held at no height till the end, as here, its tabs popped in once done, as
      // there's no shrinking rule round them to carry the motion)
      motion.group.matches("[zia-open-in-closed], [zia-closing-in-closed]")
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
    const tracks = itemTracks(props, a, b, naturalSize(element, a, b));
    if (!tracks || !bounceOn()) {
      return null;
    }
    const frames = itemSpringFrames(tracks);
    const bounce = motion.bounced ? null : { container, keyframes: itemBounce(motion) };
    motion.bounced = true;
    return {
      bounce,
      keyframes: frames,
      options: { ...options, duration: FOLDER_SPRING_MS, easing: "linear" },
    };
  }

  // Growing back to its own size ("auto"): to the size it has open, measured,
  // and handed back to auto at the end. Held at the size it started at till
  // then, the tabs faded in squashed onto one row and popped to their height
  // once done.
  function naturalSize(element, a, b) {
    const natural = {};
    if (Number.isFinite(parseFloat(a?.height)) && !Number.isFinite(parseFloat(b.height))) {
      const style = element.style;
      const saved = [style.height, style.minHeight];
      style.height = "";
      style.minHeight = "";
      natural.height = element.getBoundingClientRect().height;
      natural.minHeight = parseFloat(getComputedStyle(element).minHeight);
      [style.height, style.minHeight] = saved;
    }
    return natural;
  }

  // Each property's way from Zen's first keyframe to its last, or null where the
  // height doesn't move
  function itemTracks(props, a, b, natural) {
    const tracks = [];
    for (const prop of props) {
      const from = parseFloat(a?.[prop]);
      let to = parseFloat(b[prop]);
      let end;
      if (Number.isFinite(from) && !Number.isFinite(to) && Number.isFinite(natural[prop]) && natural[prop] > 0) {
        to = natural[prop];
        end = b[prop];
      }
      const numeric = Number.isFinite(from) && Number.isFinite(to);
      if (prop === "height" && (!numeric || from === to)) {
        return null;
      }
      if (numeric) {
        tracks.push({ prop, from, to, end, unit: prop === "opacity" ? "" : "px" });
      } else if (Number.isFinite(from)) {
        // (anything else growing back to its own size holds where it starts
        // until the very end)
        tracks.push({ prop, hold: a[prop], end: b[prop] });
      } else {
        tracks.push({ prop, hold: b[prop], end: b[prop] });
      }
    }
    return tracks;
  }

  function itemSpringFrames(tracks) {
    const scale = window.devicePixelRatio || 1;
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
        if (track.end !== undefined && i === count) {
          frame[track.prop] = track.end;
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
    return frames;
  }

  // The contents stretch past (opening) or pull up past (closing), then settle
  function itemBounce(motion) {
    return pixelSteps(
      "marginBottom",
      [
        [0, 0, EASE_OUT],
        [FOLDER_ARRIVE, motion.closing ? -FOLDER_CLOSE_BOUNCE_PX : FOLDER_OVERSHOOT_PX, EASE_IN_OUT],
        [1, 0],
      ],
      FOLDER_SPRING_MS,
      0
    );
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
    const replaced = patchMethod(Element.prototype, "animate", (animate) => function (keyframes, options) {
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
          // (a space's pinned section: its line is inside it, so the section's margin moved only
          // the tabs below, the line standing still as they bounced past it. The line's own top
          // margin carries it and the tabs below together)
          const line = item.bounce.container.querySelector(":scope > .pinned-tabs-container-separator");
          if (line && line.getBoundingClientRect().height > 0) {
            const frames = item.bounce.keyframes.map(({ marginBottom, ...frame }) => ({ ...frame, marginTop: marginBottom }));
            animate.call(line, frames, { duration: FOLDER_SPRING_MS });
          } else {
            animate.call(item.bounce.container, item.bounce.keyframes, { duration: FOLDER_SPRING_MS });
          }
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
    });
    if (!replaced) {
      return;
    }
    window.addEventListener("TabGroupCollapse", noteFolderMotion, true);
    window.addEventListener("TabGroupExpand", noteFolderMotion, true);
  }

