  // Closing one of a split's two tabs: Zen breaks the split up, each tab a
  // row of its own again, so the closing one shrank away as a row with the
  // one left sliding up from under it, a jump where the split had been. It
  // goes at once, taking no room, and the one left is where the split was.
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

  // Zen slides a folder open and shut in 0.18s at an even pace. Zia turns
  // that slide into a spring: it eases in quickly, runs a few pixels past
  // where it's going, and settles back. Opening, the folder's box stretches a
  // little further than it needs to; closing, whatever is below the folder
  // bounces up a little. The overshoot is the same pixel or two whatever the
  // folder's size, like the music player's, rather than growing with it.
  // Zen moves the element that starts a folder's contents by its top margin;
  // Zia only changes that one animation.
  const FOLDER_SPRING_MS = 420;
  const FOLDER_OVERSHOOT_PX = 2;
  const FOLDER_CLOSE_BOUNCE_PX = 1.5;
  const FOLDER_SELECTOR = "zen-folder, tab-group:not([split-view-group])";

  // The spring moves the folder by fractions of a pixel, and the folder's
  // box has a one-pixel outline that fades out for a frame when it sits
  // between two pixels, so the bottom edge flickered as the spring settled.
  // The motion is sampled into small held steps instead, each landing on a
  // whole screen pixel counted from where the folder comes to rest.
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

  const isFolder = (el) =>
    el?.localName === "zen-folder" || (el?.localName === "tab-group" && !el.hasAttribute("split-view-group"));

  function springFolderAnimation(element, keyframes, options) {
    if (
      !element.classList?.contains("zen-tab-group-start") ||
      !isFolder(element.parentElement?.parentElement) ||
      !Array.isArray(keyframes) ||
      keyframes.length !== 2 ||
      !(typeof options === "object" && options?.duration > 0)
    ) {
      return null;
    }
    // Clicked open and shut quickly, Zen's own ends go stale (opening "from
    // 0 to 0", closing short of shut), so which way it's going comes from
    // the folder, and the ends from where open (0) and shut really are
    const folder = element.parentElement.parentElement;
    // With a tab selected inside, Zen shows just that tab (picked from the
    // closed folder's list, say, the folder stays "collapsed" while Zen
    // opens it round the tab), and the other tabs' own animations carry the
    // motion (springFolderItem): Zen's, as it was
    if (folder.hasAttribute("has-active") || folder.contains(gBrowser.selectedTab)) {
      element.parentElement.ziaHold?.();
      return null;
    }
    const closing = folder.hasAttribute("collapsed");
    // (a folder whose one showing tab was just dragged out of it already
    // looks shut: its room closes, without the bounce, 28-tab-dragging)
    const lentOut = (folder.ziaLentUntil || 0) > Date.now();
    const zenFrom = parseFloat(keyframes[0]?.marginTop);
    const zenTo = parseFloat(keyframes[1]?.marginTop);
    const shut = -Math.max(
      1,
      element.parentElement.getBoundingClientRect().height,
      ...[closing ? -zenTo : -zenFrom].filter(Number.isFinite)
    );
    const from = closing ? 0 : Number.isFinite(zenFrom) && zenFrom < 0 ? zenFrom : shut;
    const to = closing ? (Number.isFinite(zenTo) && zenTo < 0 ? Math.min(zenTo, shut) : shut) : 0;
    let bounce = true;
    try {
      bounce = Services.prefs.getBoolPref("zia.folders.bounce", true);
    } catch (err) {
      bounce = false;
    }
    // Spring off: Zen's own timing, but still the folder opening over its
    // tabs (holdFolderContents); the setting is for the bounce only
    if (!bounce || lentOut) {
      return {
        from,
        to,
        closing,
        plain: true,
        keyframes: [{ marginTop: `${from}px` }, { marginTop: `${to}px` }],
        options,
      };
    }
    // Opening, the margin rises to 0 and goes a little past; closing, it
    // falls and goes a little further, so the rows below rise past their
    // place and drop back.
    const past = to + Math.sign(to - from) * Math.min(FOLDER_OVERSHOOT_PX, Math.abs(to - from) / 4);
    return {
      from,
      to,
      closing,
      keyframes: pixelSteps("marginTop", [[0, from, EASE_OUT], [0.62, past, EASE_IN_OUT], [1, to]], FOLDER_SPRING_MS, to),
      options: { ...options, duration: FOLDER_SPRING_MS, easing: "linear" },
    };
  }

  // Closing, the folder's contents shrink to nothing before the slide
  // overshoots, and a height can't go below nothing, so the overshoot alone
  // moves nothing. The folder's contents also pull up by the same few pixels
  // (a little less than opening) with a negative bottom margin as they
  // arrive, so the folder's box and everything below it rise past their
  // place and drop back.
  function bounceUpAfterClosing(container, animate) {
    if (!container?.classList?.contains("tab-group-container")) {
      return;
    }
    animate.call(
      container,
      pixelSteps("marginBottom", [[0, 0, null], [0.45, 0, EASE_OUT], [0.66, -FOLDER_CLOSE_BOUNCE_PX, EASE_IN_OUT], [1, 0]], FOLDER_SPRING_MS, 0),
      { duration: FOLDER_SPRING_MS }
    );
  }

  // Zen opens a folder by sliding everything in it down from under its
  // name (a margin on its start, clipped by the folder). As in Dia, the
  // tabs stay where they sit instead and the folder opens over them: the
  // margin goes straight to where it ends (opening) or stays until the end
  // (closing), and the folder's height takes its motion instead, frame for
  // frame, so the rows below move just as before. Closing, the tabs fade
  // out in place.
  function holdFolderContents(start, spring, animate) {
    const container = start.parentElement;
    if (!container?.classList?.contains("tab-group-container")) {
      return null;
    }
    const { to, closing } = spring;
    // It goes from the height it's at (turned round part way, clicked
    // again before it finished, measured before the last one's stopped)
    // (reopened mid-close, the close was stopped a moment ago, when the
    // folder said it was opening: the height it had got to was kept then)
    const kept = container.ziaShown;
    container.ziaShown = null;
    const fromHeight = kept && performance.now() - kept.at < 100 ? kept.height : container.getBoundingClientRect().height;
    container.ziaHold?.();
    // to the folder's height open or shut, measured, not taken from the
    // margin: Zen's ends go stale mid-way, and an empty folder's margin
    // moves just a few pixels, which made the height move in steps
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
            [0.62, Math.max(0, toHeight + Math.sign(toHeight - fromHeight) * Math.min(FOLDER_OVERSHOOT_PX, Math.abs(toHeight - fromHeight) / 4)), EASE_IN_OUT],
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
      // Opened again part way through closing: the folder grows back from
      // where it had got to, rather than snapping open (Zen doesn't animate
      // it then, as its margin never got as far as closed)
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
        container.setAttribute("zia-folder-holding", "true");
        const back = animate.call(container, [{ height: `${shown}px` }, { height: `${full}px` }], {
          duration: FOLDER_SPRING_MS,
          easing: "cubic-bezier(0.25, 1, 0.5, 1)",
        });
        const done = () => {
          if (!container.ziaHold) {
            container.removeAttribute("zia-folder-holding");
          }
        };
        back.finished.then(done, done);
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
    // Closing, it's watched for opening again from the start: clicked again
    // before it finished, the opening needn't come back through here, and
    // the tabs were left faded out in an open folder
    if (closing) {
      window.addEventListener("TabGroupExpand", onOpen, true);
    }
    growing.finished.then(() => {
      if (!closing || !container.parentElement?.hasAttribute("collapsed")) {
        stop();
        return;
      }
      // Closed, the tabs stay faded out: Zen leaves them just above the
      // folder, and shown again there they flashed over the rows above.
      // They come back as it opens again (stop, from its next animation)
      // or when one of them is selected.
      // It's shut all the way, whatever end Zen keeps: Zen writes its own
      // end (short, turned round part way) just after, so this comes the
      // frame after, before anything's drawn.
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

  // With a tab selected inside it, Zen leaves the folder's start where it
  // is and shrinks the other tabs away instead (or grows them back), so the
  // spring above never ran. Those tabs' own animations get the spring's
  // first leg, arriving at 62% of the way through, and the folder's contents
  // stretch a couple of pixels past (or pull up past) where they land, then
  // settle, the same shape as a folder with nothing selected.
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
      !Array.isArray(keyframes) ||
      keyframes.length !== 2 ||
      !(typeof options === "object" && options?.duration > 0) ||
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
    try {
      if (!Services.prefs.getBoolPref("zia.folders.bounce", true)) {
        return null;
      }
    } catch (err) {
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

  // Opening a folder that showed just its open tab, Zen brings its other
  // tabs back to "their own" opacity, which can't be animated to: they
  // stayed invisible as the folder opened, then all showed at once. They
  // fade back in instead.
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

  function addFolderBounce() {
    const animate = Element.prototype.animate;
    if (animate.__zia) {
      return;
    }
    const patched = function (keyframes, options) {
      try {
        keyframes = fadeBackIn(this, keyframes);
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
      let trimmed = original.call(this, url);
      if (typeof trimmed !== "string") {
        return trimmed;
      }
      trimmed = plainAddress(trimmed);
      if (gURLBar.hasAttribute("breakout-extend")) {
        return trimmed;
      }
      return trimmed;
    };
    wrapped.__zia = true;
    gURLBar._zenTrimURL = wrapped;
    try {
      gURLBar.setURI();
    } catch (err) {
      noteError("tab animations and folder bounce: hideWwwInUrlbar", err);
    }
  }


  // A collapsed space keeps the names of the folders its open tab is in
  // (06-folders-and-sidebar.css), marked from when it collapses until it
  // has finished opening again.
  const SPACE_OPEN_MS = 700;

  // A closed folder showing its selected tab keeps its other tabs see-
  // through (chrome.css). Unloading the folder, or selecting a tab
  // elsewhere, Zen stops showing the tab: all its tabs showed piled on one
  // row while Zen shut it, or (with the tab in a folder inside) the tab and
  // that folder's name went at once. The folder keeps its layout a moment
  // while they fade (chrome.css), then shrinks shut.
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
      container.setAttribute("zia-folder-holding", "true");
      const shrink = container.animate([{ height: `${before}px` }, { height: `${after}px` }], {
        duration: 220,
        easing: "cubic-bezier(0.42, 0, 0.58, 1)",
      });
      const done = () => {
        if (!container.ziaHold) {
          container.removeAttribute("zia-folder-holding");
        }
      };
      shrink.finished.then(done, done);
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

  // A closed folder showing its selected tab keeps the name of a closed
  // folder inside it holding that tab (chrome.css). Clicked, it opened, but
  // everything round it stayed hidden, so nothing showed: the folders it's
  // in open too.
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

  // A space's pinned tabs tucked away (its name clicked) keep showing the
  // tab that was open among them, as a closed folder does. Once a tab
  // outside them is chosen, none of them is open: they all go, shut as the
  // name shuts them (the same speed), and the folders among them that were
  // showing that tab are closed properly once out of sight (left as they
  // were, one opened again showing the tab, at the tucked-away indent)
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

  // A folder opening round an open folder inside it: that folder's tabs,
  // hidden while the outer one showed just its open tab, come in with the
  // outer one (Zen reveals only the outer folder's own rows, so they stayed
  // hidden until something tidied them, and snapped in)
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
