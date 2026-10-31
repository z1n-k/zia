  // Zia's drag joined to Zen's: listeners, Zen's tab animations held off, clipping lifted,
  // folders held open.

  let lockTimer = 0;
  let blockAnimUntil = 0;
  const MOVEMENT = new Set(["transform", "translate"]);
  const movesOnly = (anim) => {
    try {
      const frames = anim.effect?.getKeyframes?.() || [];
      const props = new Set();
      for (const frame of frames) {
        for (const key of Object.keys(frame)) {
          if (!["offset", "computedOffset", "easing", "composite"].includes(key)) {
            props.add(key);
          }
        }
      }
      return props.size > 0 && [...props].every((prop) => MOVEMENT.has(prop));
    } catch (err) {
      return false;
    }
  };

  const unclipped = [];
  const unclipAround = (node) => {
    const stop = document.getElementById("navigator-toolbox");
    const remember = (el, props) => {
      unclipped.push([el, props.map((prop) => [prop, el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)])]);
    };
    const lift = (el) => {
      const style = getComputedStyle(el);
      const clips =
        ["hidden", "auto", "scroll", "clip"].includes(style.overflowY) || /paint|strict|content/.test(style.contain);
      const scrolls = el.scrollTop > 0 || el.scrollHeight > el.clientHeight + 1;
      if (!clips || scrolls) {
        return;
      }
      const props = ["overflow", "overflow-x", "overflow-y", "contain"];
      remember(el, props);
      for (const prop of props) {
        el.style.setProperty(prop, prop === "contain" ? "none" : "visible", "important");
      }
    };
    let el = node?.parentNode;
    while (el && el !== stop && el !== document.documentElement) {
      if (el.nodeType === 1) {
        lift(el);
        const inner = el.shadowRoot?.querySelector?.('[part~="scrollbox"]');
        if (inner) {
          lift(inner);
        }
      }
      el = el.parentNode || el.host;
    }
  };
  const reclip = () => {
    while (unclipped.length) {
      const [el, props] = unclipped.pop();
      for (const [prop, value, priority] of props) {
        if (value) {
          el.style.setProperty(prop, value, priority);
        } else {
          el.style.removeProperty(prop);
        }
      }
    }
  };

  // What's just dropped keeps its hover look (box, x): the drag's look ends a frame before
  // the browser sees the pointer still over it, and Firefox forgets what's hovered until the
  // pointer next moves (Zen shows x and - only on hover), so what showed is noted and kept
  let shownAtDrop = { row: null, buttons: [] };

  const holdFolderHover = (folder) => {
    const held = [folder];
    // a tab dropped into a folder: the folder keeps its hover box too
    if (heldFolder?.isConnected && !held.includes(heldFolder)) {
      held.push(heldFolder);
    }
    heldFolder = null;
    if (shownAtDrop.row && shownAtDrop.row !== folder && shownAtDrop.row.isConnected) {
      held.push(shownAtDrop.row);
    }
    let buttons = shownAtDrop.buttons.filter((button) => button.isConnected);
    shownAtDrop = { row: null, buttons: [] };
    // The dragged tab lets the pointer through, so its own button wasn't noted: dropped into
    // a folder it showed nothing until the browser found the pointer on it (a split: both
    // its tabs' x, as it shows both while hovered)
    const dropSplit = gBrowser.isTab(folder) && folder.group?.hasAttribute?.("split-view-group") ? folder.group : null;
    if (gBrowser.isTab(folder) && !buttons.some((button) => (dropSplit || folder).contains(button))) {
      for (const tab of dropSplit ? [...dropSplit.querySelectorAll(".tabbrowser-tab")] : [folder]) {
        const own = tab.querySelector(tab.pinned ? ".tab-reset-button" : ".tab-close-button");
        if (own) {
          buttons.push(own);
        }
      }
    }
    for (const node of held) {
      node.setAttribute("zia-hover-held", "true");
    }
    for (const button of buttons) {
      button.setAttribute("zia-held-shown", "true");
    }
    // A tab dropped into a folder is pinned there and shows a - where it had an x (the other
    // way pulled out): swapped as soon as it's let go, not when the pointer next moved
    refitHeld = (pinned) => {
      buttons = buttons.map((button) => {
        const tab = button.closest(".tabbrowser-tab");
        const want = pinned ?? tab?.pinned;
        tab?.toggleAttribute("zia-held-pinned", !!want && !tab.pinned);
        const kind = want ? ".tab-reset-button" : ".tab-close-button";
        const right = tab?.isConnected && !button.matches(kind) ? tab.querySelector(kind) : null;
        if (!right) {
          return button;
        }
        button.removeAttribute("zia-held-shown");
        right.setAttribute("zia-held-shown", "true");
        return right;
      });
    };
    if (heldPinned != null) {
      refitHeld(heldPinned);
    }
    heldPinned = null;
    let timer = 0;
    // Over a node by where the pointer is, not :hover: Zen tidies a folder just after a drop
    // and Firefox forgets the hover, so a move then let go and the folder's box flashed
    const over = (node, event) => {
      if (node.matches(":hover")) {
        return true;
      }
      if (!event?.clientX && !event?.clientY) {
        return false;
      }
      const box = node.getBoundingClientRect();
      return event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
    };
    const check = (event) => {
      if (!held.some((node) => node.isConnected && over(node, event))) {
        release();
        return;
      }
      // a button is held only while the pointer is on its own tab (on to the next tab in the
      // same folder, both showed their -)
      buttons = buttons.filter((button) => {
        const tab = button.closest(".tabbrowser-tab");
        // (a split's x's are held while it's hovered, either tab)
        const host = tab?.closest("tab-group[split-view-group]") || tab;
        if (host && over(host, event)) {
          return true;
        }
        button.removeAttribute("zia-held-shown");
        tab?.removeAttribute("zia-held-pinned");
        if (tab && held.includes(tab)) {
          tab.removeAttribute("zia-hover-held");
        }
        return false;
      });
    };
    const release = () => {
      if (releaseHeld === release) {
        releaseHeld = null;
      }
      refitHeld = null;
      for (const node of held) {
        node.removeAttribute("zia-hover-held");
      }
      for (const button of buttons) {
        button.removeAttribute("zia-held-shown");
        button.closest(".tabbrowser-tab")?.removeAttribute("zia-held-pinned");
      }
      window.removeEventListener("mousemove", check, true);
      clearTimeout(timer);
    };
    window.addEventListener("mousemove", check, true);
    timer = setTimeout(release, 4000);
    releaseHeld?.();
    releaseHeld = release;
  };


  // its listeners and hooks, added by moveTabsLikeDia (28-tab-dragging.js) in order
  function watchZenHooks() {
    window.addEventListener("dragover", onOver, true);
    document.getElementById("tabbrowser-tabs")?.addEventListener("dragover", onOver, true);
    window.addEventListener("dragover", fixDrop);
    // Firefox moves the dragged tab too, after Zia, and stops it at the last tab: under the
    // list its move won, two of the tab showing. Zia's move is put back after Firefox's go.
    window.addEventListener("dragover", () => {
      const moving = drag?.moving;
      if (!moving?.isConnected || drag.away || drag.essentials || drag.splitEssential) {
        return;
      }
      if (moving.style.getPropertyPriority("transform") !== "important") {
        place(moving, lastDy, true);
      }
    });

    window.addEventListener(
      "drop",
      (event) => {
        const tab = drag?.tab;
        heldFolder = null;
        heldPinned = null;

        if (tab && drag.splitEssential) {
          event.preventDefault();
          event.stopPropagation();
          let essential = null;
          // (it goes where the cell was opened for it)
          const before = splitSlot?.isConnected ? splitSlot.nextElementSibling : null;
          try {
            essential = addSplitToEssentials(tab);
            if (essential && before?.hasAttribute?.("zen-essential") && before !== essential) {
              gBrowser.moveTabBefore(essential, before);
            }
          } catch (err) {
            console.error("[Zia] Could not make a split essential:", err);
          }
          if (essential) {
            // hidden where it lands until the tile flying to it gets there
            essential.setAttribute("zia-to-essential", "true");
            landProxy(essential);
          } else {
            hideProxy();
          }
          return;
        }
        if (tab && !drag.essentials && !drag.folder && !drag.split) {
          const point = pointerOf(event);
          const over = event.target;
          if (
            over?.closest?.("#zen-essentials, .zen-essentials-container") ||
            inBox(document.getElementById("zen-essentials"), point) ||
            inBox(window.gZenWorkspaces?.getCurrentEssentialsContainer?.(), point)
          ) {
            drag.essentials = true;
            drag.target = null;
          }
        }
        if (tab && drag.essentials) {
          if (drag.noTiles) {
            setTimeout(() => {
              try {
                window.gZenPinnedTabManager?.addToEssentials?.(tab);
              } catch (err) {
                console.error("[Zia] Could not add the first essential:", err);
              }
            }, 0);
          }
          landProxy(tab);
        } else if (drag?.folder && !drag.away && drag.target) {
          const folder = drag.folder;
          const target = drag.target;
          // Into a closed folder Zia puts it there, Zen's drop not run: that opened the folder,
          // the dropped one missing for a frame, and left it open. Into an empty one too: Zen
          // moved it back out under the folder after Zia had put it in, and the folder, emptied,
          // shut over the gap
          if (target.folder && (isCollapsed(target.folder) || target.folder.hasAttribute("zia-empty")) && target.folder !== folder && !folder.contains(target.folder)) {
            event.preventDefault();
            event.stopPropagation();
          }
          // (the folder it goes into keeps its hover box too, as for a tab:
          // it went blank until the pointer next moved)
          heldFolder = target.folder || null;
          pendingFinish = true;
          setTimeout(() => {
            try {
              finishFolderDrop(folder, target);
              // (held where it was let go in the same step, as a tab is: a frame showed it at its
              // new place still shifted by the drag, up and back down)
              repinLanding?.();
            } catch (err) {
              console.error("[Zia] Folder drop failed:", err);
            }
            pendingFinish = false;
          }, 0);
        } else if (tab && !drag.folder && !drag.away && drag.target?.hand) {
          const target = drag.target;
          // Zia places it, Zen's drop not run: told to drop it where it was, Zen still took a tab
          // in a closed folder out of it for a frame (its favicon flashing left of where it lands).
          // Several selected go with it (finishDrop), in the order they're in now.
          const party = tab.multiselected
            ? gBrowser.selectedTabs.filter((t) => t.isConnected && !t.hasAttribute("zen-essential") && !t.group?.hasAttribute?.("split-view-group"))
            : null;
          event.preventDefault();
          event.stopPropagation();
          heldFolder = target.folder || null;
          heldPinned = !target.below;
          pendingFinish = true;
          // Put in place as the drop settles, in the same step (see settle): a moment later, the
          // room made for it in a folder had closed and it showed outside, full width, for a frame
          const run = () => {
            try {
              finishDrop(tab, target, party);
              // (its width put right as it moves: the row's new width showed
              // first otherwise, 14px narrower)
              refitLanding?.();
              repinLanding?.();
              refitHeld?.();
            } catch (err) {
              console.error("[Zia] Tab drop failed:", err);
            }
            pendingFinish = false;
          };
          finishNow = run;
          setTimeout(() => {
            if (finishNow === run) {
              finishNow = null;
              run();
            }
          }, 0);
        }
        const dnd = gBrowser.tabContainer.tabDragAndDrop;
        if (dnd) {
          dnd._dontAnimateTabMove = true;
        }
      },
      true
    );
    const ui = window.gZenUIManager;
    if (ui?.elementAnimate && !ui.elementAnimate.ziaTabLock) {
      const originalAnimate = ui.elementAnimate.bind(ui);
      const wrappedAnimate = function (ele, ...args) {
        if (Date.now() < blockAnimUntil && ele?.closest?.("#tabbrowser-tabs")) {
          ele.style.removeProperty("transform");
          return Promise.resolve();
        }
        return originalAnimate(ele, ...args);
      };
      wrappedAnimate.ziaTabLock = true;
      ui.elementAnimate = wrappedAnimate;
    }
    window.addEventListener("drop", (event) => {
      shownAtDrop = { row: null, buttons: [] };
      const point = pointerOf(event);
      const row = document.elementsFromPoint(point.x, point.y)
        .map((el) => el.closest?.(".tabbrowser-tab:not([zia-essential-proxy]), zen-folder, tab-group"))
        .find(Boolean);
      if (!row) {
        return;
      }
      // a split shows the x of both its tabs while it's hovered
      const split = row.closest?.("tab-group[split-view-group]");
      const rows = split ? [...split.querySelectorAll(".tabbrowser-tab")] : [row];
      const buttons = rows.flatMap((one) => [...one.querySelectorAll(".tab-close-button, .tab-reset-button")]).filter((button) => {
        if (!rows.includes(button.closest(".tabbrowser-tab, zen-folder, tab-group"))) {
          return false;
        }
        const box = button.getBoundingClientRect();
        return box.width > 0 && getComputedStyle(button).display !== "none";
      });
      shownAtDrop = { row: row.closest(".tabbrowser-tab") || null, buttons };
    }, true);
  }

