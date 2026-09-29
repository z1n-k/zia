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

  // Folders open and shut on a spring: quick to start, a few pixels past
  // where they're going, then settling back. Opening, the folder's box
  // stretches a little further than it needs to; closing, whatever is below
  // the folder bounces up a little. The overshoot is the same pixel or two
  // whatever the folder's size, like the music player's. (Zia animates
  // folders itself: see below.)
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

  // Zia animates folders itself. Zen's own folder animations are switched
  // off (it has a switch for that): Zen jumps straight to each new layout,
  // opening, closing, showing just the open tab, letting go of it, and Zia
  // animates from what was on screen to that, the same way every time.
  // Zen's own animations had ends that went stale when a folder was clicked
  // again before it finished, and wrote their own values back after Zia's,
  // so every case needed its own fix; now there's one way.
  //
  // For each change: what's on screen is noted and held (the folder's
  // height and where its contents sit), Zen makes the change, and once it
  // has, the new layout is measured and the folder's box springs between
  // the two. Opening, the contents stay where they'll end and the box opens
  // over them; closing, they stay where they were and fade as the box
  // closes on them. Tabs that move within the folder (the one it keeps
  // showing) glide to their place; ones that appear fade in.
  const folderAnims = new WeakMap();
  const folderSkip = new WeakSet();

  // (for a change that shouldn't be animated, such as a folder shut as a
  // drag starts)
  function skipFolderAnimation(folder) {
    if (folder) {
      folderSkip.add(folder);
      setTimeout(() => folderSkip.delete(folder), 0);
    }
  }

  const folderContainer = (folder) => folder?.groupContainer || folder?.querySelector?.(":scope > .tab-group-container") || null;
  const folderStart = (folder) => folder?.groupStartElement || folderContainer(folder)?.querySelector?.(":scope > .zen-tab-group-start") || null;

  function bounceOn() {
    try {
      return Services.prefs.getBoolPref("zia.folders.bounce", true);
    } catch (err) {
      return false;
    }
  }

  // The rows inside a folder that are on screen, and where
  function folderRows(container) {
    const rows = new Map();
    if (!container) {
      return rows;
    }
    for (const el of container.querySelectorAll(".tabbrowser-tab, .tab-group-label-container")) {
      if (el.hasAttribute("zen-essential")) {
        continue;
      }
      const rect = el.getBoundingClientRect();
      if (rect.height < 2) {
        continue;
      }
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || parseFloat(style.opacity) < 0.05) {
        continue;
      }
      rows.set(el, {
        top: rect.top,
        height: rect.height,
        mt: parseFloat(style.marginTop) || 0,
        mb: parseFloat(style.marginBottom) || 0,
      });
    }
    return rows;
  }

  // Zen works out how far up a shut folder's contents go from the folder's
  // height as it is then: shut while Zia still held it part way open (open
  // and shut again quickly), that was the part-way height, and the bottom
  // tabs stayed showing under the shut folder. Measured again here, with
  // nothing of Zia's holding it.
  function settleShutFolder(folder, container, start) {
    if (!folder.collapsed || folder.hasAttribute("has-active") || !container.isConnected) {
      return;
    }
    const wasHidden = container.hasAttribute("hidden");
    container.removeAttribute("hidden");
    start.style.marginTop = "0px";
    let height = container.getBoundingClientRect().height;
    if (container.separatorElement) {
      height -= container.separatorElement.getBoundingClientRect().height;
    }
    start.style.marginTop = `${-(height + 4)}px`;
    if (wasHidden) {
      container.setAttribute("hidden", "true");
    }
  }

  function stopFolderAnimation(container) {
    const running = folderAnims.get(container);
    if (!running) {
      return;
    }
    folderAnims.delete(container);
    for (const anim of running.anims) {
      anim.cancel();
    }
    running.cleanup();
  }

  // Before Zen's change: what's on screen, held there until Zia animates
  function captureFolder(folder) {
    const container = folderContainer(folder);
    const start = folderStart(folder);
    if (!container || !start || !container.isConnected) {
      return null;
    }
    const shown = container.hasAttribute("hidden") ? 0 : container.getBoundingClientRect().height;
    const scene = {
      folder,
      container,
      start,
      height: shown,
      top: container.getBoundingClientRect().top,
      margin: parseFloat(getComputedStyle(start).marginTop) || 0,
      display: getComputedStyle(container).display,
      rows: folderRows(container),
    };
    stopFolderAnimation(container);
    // held, whatever Zen does in between (chrome.css; by a rule, not its
    // own inline styles, which are Zen's and are left alone)
    container.style.setProperty("--zia-freeze-h", `${shown}px`);
    container.style.setProperty("--zia-freeze-m", `${scene.margin}px`);
    container.setAttribute("zia-folder-frozen", "true");
    return scene;
  }

  function releaseFolder(scene) {
    scene.container.removeAttribute("zia-folder-frozen");
    scene.container.style.removeProperty("--zia-freeze-h");
    scene.container.style.removeProperty("--zia-freeze-m");
  }

  // The rows a folder shows both before and after (a closed folder's open
  // tab, and the name of a folder it sits in) ride the folder's bottom edge
  // as it opens or shuts: the rows coming in are uncovered from under them,
  // or the ones going are covered, instead of the kept rows gliding through
  // them. `heights` are the container's keyframes, `layout` where each row
  // sits while it plays, `from` and `to` where each is seen at the start
  // and end (all from the container's top).
  function rideFolderEdge(kept, heights, layout, from, to) {
    const h = heights.map((frame) => parseFloat(frame.height) || 0);
    const h0 = h[0];
    const hN = h.at(-1);
    const span = hN - h0 || 1;
    const scale = window.devicePixelRatio || 1;
    const anims = [];
    kept.forEach((row, i) => {
      // (kept rows under this one ride along below it)
      let below = 0;
      for (const other of kept.slice(i + 1)) {
        below += layout.get(other).height;
      }
      const bottom = layout.get(row).top + layout.get(row).height;
      const raw = h.map((value) => Math.min(0, value - bottom - below));
      const start = from.get(row).top - layout.get(row).top;
      const end = to.get(row).top - layout.get(row).top;
      const frames = heights.map((frame, k) => {
        const p = (h[k] - h0) / span;
        const value = raw[k] + (start - raw[0]) * (1 - p) + (end - raw.at(-1)) * p;
        const step = { translate: `0 ${Math.round(value * scale) / scale}px`, offset: frame.offset };
        if (frame.easing) {
          step.easing = frame.easing;
        }
        return step;
      });
      if (frames.every((frame) => frame.translate === "0 0px")) {
        return;
      }
      anims.push({ row, frames });
    });
    return anims;
  }

  // Rows a folder lets go of while it shuts keep their room until it has
  // (chrome.css), so the kept rows can cover them as they fade
  function holdRow(row, place) {
    row.style.setProperty("--zia-held-h", `${place.height}px`);
    row.style.setProperty("--zia-held-mt", `${place.mt}px`);
    row.style.setProperty("--zia-held-mb", `${place.mb}px`);
    row.setAttribute("zia-held-row", "true");
  }

  function letGoOfRow(row) {
    row.removeAttribute("zia-held-row");
    row.style.removeProperty("--zia-held-h");
    row.style.removeProperty("--zia-held-mt");
    row.style.removeProperty("--zia-held-mb");
  }

  // Positions from the container's top
  const fromTop = (rows, top) => new Map([...rows].map(([row, place]) => [row, { ...place, top: place.top - top }]));

  // After Zen's change: from what was on screen to the new layout
  function playFolder(scene) {
    const { folder, container, start } = scene;
    releaseFolder(scene);
    if (!container.isConnected) {
      return;
    }
    settleShutFolder(folder, container, start);
    if (folderSkip.has(folder)) {
      return;
    }
    const hidden = container.hasAttribute("hidden");
    const toHeight = hidden ? 0 : container.getBoundingClientRect().height;
    const toMargin = parseFloat(getComputedStyle(start).marginTop) || 0;
    const fromHeight = scene.height;
    if (Math.abs(toHeight - fromHeight) < 0.5 && Math.abs(toMargin - scene.margin) < 0.5) {
      return;
    }
    const closing = toHeight < fromHeight;
    const spring = bounceOn();
    const duration = spring ? FOLDER_SPRING_MS : 180;
    const anims = [];
    const held = [];

    // shown while it closes, though Zen has already hidden it
    if (hidden) {
      container.style.setProperty("display", scene.display === "none" ? "block" : scene.display, "important");
    }
    container.setAttribute("zia-folder-holding", "true");

    const heights = spring
      ? pixelSteps(
          "height",
          [
            [0, fromHeight, EASE_OUT],
            [0.62, Math.max(0, toHeight + Math.sign(toHeight - fromHeight) * Math.min(FOLDER_OVERSHOOT_PX, Math.abs(toHeight - fromHeight) / 4)), EASE_IN_OUT],
            [1, toHeight],
          ],
          duration,
          toHeight
        )
      : pixelSteps("height", [[0, fromHeight, EASE_IN_OUT], [1, toHeight]], duration, toHeight);
    const grow = container.animate(heights, { duration, easing: "linear" });
    anims.push(grow);

    const moved = Math.abs(toMargin - scene.margin) >= 0.5;
    if (closing && moved) {
      // Closing on its contents: they stay where they were, and fade
      anims.push(
        start.animate(
          [{ marginTop: `${scene.margin}px` }, { marginTop: `${scene.margin}px`, offset: 0.999 }, { marginTop: `${toMargin}px` }],
          { duration }
        )
      );
      // (every row: the ones Zen had hidden are put back as it lets go of a
      // folder's open tab, and flashed up piled on one row)
      for (const row of container.querySelectorAll(".tabbrowser-tab, .tab-group-label-container")) {
        const frames = scene.rows.has(row) ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: 0 }];
        anims.push(row.animate(frames, { duration: Math.min(220, duration), easing: "ease-in", fill: "forwards" }));
      }
      // (and whatever is below rises past its place and drops back)
      if (spring) {
        anims.push(
          container.animate(
            pixelSteps("marginBottom", [[0, 0, null], [0.45, 0, EASE_OUT], [0.66, -FOLDER_CLOSE_BOUNCE_PX, EASE_IN_OUT], [1, 0]], duration, 0),
            { duration, composite: "add" }
          )
        );
      }
    } else if (!moved) {
      const before = fromTop(scene.rows, scene.top);
      const top = container.getBoundingClientRect().top;
      const after = fromTop(folderRows(container), top);
      const kept = [...after.keys()].filter((row) => before.has(row));
      const going = [...before.keys()].filter((row) => !after.has(row) && row.isConnected && container.contains(row));
      const coming = [...after.keys()].filter((row) => !before.has(row));

      if (closing && going.length) {
        // Shutting down to the rows it keeps: the others keep their room
        // and fade, and the kept rows rise over them with the edge
        for (const row of going) {
          holdRow(row, before.get(row));
          held.push(row);
          for (const part of row.children) {
            anims.push(part.animate([{ opacity: 1 }, { opacity: 0 }], { duration: Math.min(220, duration), easing: "ease-in", fill: "forwards" }));
          }
        }
        const layout = fromTop(folderRows(container), top);
        for (const { row, frames } of rideFolderEdge(kept, heights, layout, before, after)) {
          anims.push(row.animate(frames, { duration, easing: "linear" }));
        }
      } else if (!closing && coming.length && kept.length) {
        // Opening from the rows it kept: they go down with the edge, and the
        // rest are uncovered from under them
        for (const { row, frames } of rideFolderEdge(kept, heights, after, before, after)) {
          anims.push(row.animate(frames, { duration, easing: "linear" }));
        }
        for (const row of coming) {
          anims.push(row.animate([{ opacity: 0 }, { opacity: 1 }], { duration: Math.min(240, duration), easing: "ease-out" }));
        }
      } else {
        // The tabs that stay glide to their new place; ones that appear fade in
        for (const row of coming) {
          anims.push(row.animate([{ opacity: 0 }, { opacity: 1 }], { duration: Math.min(240, duration), easing: "ease-out" }));
        }
        for (const row of kept) {
          const shift = before.get(row).top - after.get(row).top;
          if (Math.abs(shift) >= 0.5) {
            anims.push(
              row.animate([{ translate: `0 ${shift}px` }, { translate: "0 0" }], {
                duration,
                easing: spring ? "cubic-bezier(0.25, 1, 0.5, 1)" : "ease-in-out",
              })
            );
          }
        }
      }
    }

    let over = false;
    const cleanup = () => {
      if (over) {
        return;
      }
      over = true;
      for (const row of held) {
        letGoOfRow(row);
      }
      container.removeAttribute("zia-folder-holding");
      container.style.removeProperty("display");
      // (and after Zen's own second look, taken while this was running)
      settleShutFolder(folder, container, start);
    };
    const running = { anims, cleanup };
    folderAnims.set(container, running);
    grow.finished.then(
      () => {
        if (folderAnims.get(container) !== running) {
          return;
        }
        folderAnims.delete(container);
        for (const anim of anims) {
          anim.cancel();
        }
        cleanup();
      },
      () => {}
    );
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

  function addFolderBounce() {
    const folders = window.gZenFolders;
    if (!folders) {
      return;
    }
    folders._dontAnimateFolder = true;
    for (const name of ["animateCollapse", "animateExpand", "animateSelect", "animateUnload", "animateUnloadAll"]) {
      const original = folders[name];
      if (typeof original !== "function" || original.__zia) {
        continue;
      }
      const wrapped = function (group, ...rest) {
        let scene = null;
        try {
          scene = isFolder(group) ? captureFolder(group) : null;
        } catch (err) {
          noteError(`folders: capture (${name})`, err);
        }
        let result;
        try {
          result = original.call(this, group, ...rest);
        } catch (err) {
          if (scene) {
            releaseFolder(scene);
          }
          throw err;
        }
        if (scene) {
          const play = () => {
            try {
              playFolder(scene);
            } catch (err) {
              releaseFolder(scene);
              noteError(`folders: play (${name})`, err);
            }
          };
          Promise.resolve(result).then(play, play);
        }
        return result;
      };
      wrapped.__zia = true;
      folders[name] = wrapped;
    }
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

  // A closed folder showing its open tab keeps the name of any folder in it
  // holding that tab (chrome.css). Zen may clear its own marks for which
  // tab it shows as it lets go of it, so Zia marks them itself.
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
    new MutationObserver((records) => {
      for (const { target, oldValue } of records) {
        if (!isFolder(target)) {
          continue;
        }
        if (target.hasAttribute("has-active")) {
          if (target.hasAttribute("collapsed")) {
            mark(target);
          }
          continue;
        }
        // (opening, the names stay while it does: gone at once, the tab
        // under one jumped up and back down)
        if (!target.hasAttribute("zia-revealing")) {
          unmark(target);
        }
      }
    }).observe(tabs, { subtree: true, attributes: true, attributeFilter: ["has-active"], attributeOldValue: true });
    window.addEventListener(
      "TabGroupExpand",
      (event) => {
        const folder = event.target;
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
