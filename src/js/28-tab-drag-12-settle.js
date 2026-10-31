  // The drag ending: settle, a switch of space followed or handed to Zen.

  let droppedFrom = null;
  let isRealDrop = false;
  let pendingFinish = false;
  let heldFolder = null;
  let repinLanding = null;
  let refitLanding = null;
  let finishNow = null;
  let refitHeld = null;
  let heldPinned = null;
  let dragGen = 0;
  let releaseHeld = null;
  const releaseToZen = (event) => {
    const tab = drag.split || drag.tab;
    dragImage.zen = true;
    try {
      const image = gBrowser.tabContainer.tabDragAndDrop?.originalDragImageArgs;
      if (image?.length) {
        event.dataTransfer?.updateDragImage(...image);
      }
    } catch (err) {
      noteError("tab dragging: Zen's picture back", err);
    }
    hideThumb(true);
    clearMoved();
    if (drag.folder) {
      unmorphFolder(drag.folder);
    }
    easeOutWidth(tab);
    makeRoom(null);
    clearProxy();
    endDrag();
    document.documentElement.removeAttribute("zia-dragging-tab");
  };
  // A tab (or a split) goes with the drag instead: moved into the space now showing, and
  // dragged on there as before, under the pointer and inside the sidebar until pulled out to
  // the page. Handed to Zen, its loose picture went anywhere, over the split's panes too.
  // (A folder, a tab in one, or several at once: still handed to Zen.)
  const followIntoSpace = (event) => {
    const { tab, folder, companions } = drag;
    const space = window.gZenWorkspaces?.activeWorkspace;
    const group = tab?.group;
    if (folder || companions || !tab?.isConnected || (group && !group.hasAttribute?.("split-view-group")) || !space) {
      releaseToZen(event);
      return;
    }
    hideThumb(true);
    clearMoved();
    easeOutWidth(drag.split || tab);
    makeRoom(null);
    clearProxy();
    endDrag();
    try {
      window.gZenWorkspaces.moveTabsToWorkspace([tab], space);
    } catch (err) {
      noteError("tab dragging: follow into space", err);
      document.documentElement.removeAttribute("zia-dragging-tab");
      return;
    }
    begin(tab, event);
    if (drag) {
      // (measured from the tab's new place, at the end of the list: under the pointer now)
      const box = (drag.moving || tab).getBoundingClientRect();
      drag.clientY = box.top + box.height / 2;
      drag.screenY = 0;
    }
  };

  const settle = () => {
    const droppedTab = drag?.tab || essentialDropped || null;
    if (drag?.moving && !drag.essentials && !drag.away && droppedFrom === null && isRealDrop) {
      const from = drag.moving.getBoundingClientRect();
      // (and where its background showed: a tab over a folder is drawn
      // narrower, indented like the folder's tabs)
      const bg = drag.bg?.isConnected ? drag.bg : null;
      const bgBox = bg?.getBoundingClientRect();
      droppedFrom = { node: drag.moving, top: from.top, left: from.left, tab: drag.tab, bg, bgLeft: bgBox?.left, bgWidth: bgBox?.width };
    }
    essentialDropped = null;
    // (a folder let go is moved a step later: its folders keep their look till then)
    const folderLanding = !!drag?.folder && pendingFinish;
    if (drag?.folder) {
      const dropped = drag.folder;
      // (a landing one goes just before its glide, which measures it)
      setTimeout(() => {
        if (!dropped.hasAttribute("zia-landing")) {
          unmorphFolder(dropped);
        }
      }, 0);
    }
    if (drag?.bg) {
      setTimeout(() => requestAnimationFrame(() => easeOutWidth(droppedTab)), 0);
    }
    endDrag();
    document.documentElement.removeAttribute("zia-dragging-tab");
    // The tabs folded into the dragged one unfold where they've landed, growing out under
    // it: shown again at once, they showed back where they'd been for a frame and then
    // jumped across as the drop placed them a step later
    const folded = [...document.querySelectorAll("[zia-drag-companion]")];
    if (folded.length) {
      setTimeout(() => {
        for (const tab of folded) {
          tab.removeAttribute("zia-drag-companion");
        }
        for (const tab of folded) {
          if (!tab.isConnected) {
            continue;
          }
          const height = tab.getBoundingClientRect().height;
          if (height > 0) {
            tab.animate(
              [
                { height: "0px", minHeight: "0px", opacity: 0, overflow: "clip" },
                { height: `${height}px`, minHeight: `${height}px`, opacity: 1, overflow: "clip" },
              ],
              { duration: 180, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }
            );
          }
        }
      }, 0);
    }
    for (const tab of document.querySelectorAll("[zia-drag-count]")) {
      tab.removeAttribute("zia-drag-count");
    }
    setFlag("zia-drag-over-essentials", false);
    muteZenHaptics(false);
    reclip();
    document.querySelectorAll("[zia-drop-slot]").forEach((folder) => folder.removeAttribute("zia-drop-slot"));
    if (document.querySelector("[zia-left]")) {
      // (until the mouse moves, when Firefox works out what's hovered)
      window.addEventListener("mousemove", () => document.querySelectorAll("[zia-left]").forEach((folder) => folder.removeAttribute("zia-left")), { once: true, capture: true });
    }
    unlend();
    document.querySelectorAll("[zia-into-empty]").forEach((tab) => {
      tab.removeAttribute("zia-into-empty");
      tab.style.removeProperty("--zia-slot-border");
    });
    // (cleared at once, the folder it left wrapped it again, or the one it went into shut
    // to its name, for a frame before it moved)
    if (folderLanding) {
      setTimeout(clearFolderPaint, 0);
    } else {
      clearFolderPaint();
    }
    clearProxy();
    hideThumb(true);
    document.querySelectorAll("[zia-drag-away]").forEach((node) => node.removeAttribute("zia-drag-away"));
    makeRoom(null);
    holdSplitSlot(false);
    document.querySelectorAll("[zia-sep-open]").forEach((node) => node.removeAttribute("zia-sep-open"));

    if (dragCore.raf) {
      cancelAnimationFrame(dragCore.raf);
      dragCore.raf = 0;
    }
    blockAnimUntil = Date.now() + 400;
    const dnd = gBrowser.tabContainer.tabDragAndDrop;
    if (dnd) {
      dnd._dontAnimateTabMove = true;
      if (!dnd.handle_drop_transition?.ziaNeutered) {
        const skip = function () {
          this._dontAnimateTabMove = true;
        };
        skip.ziaNeutered = true;
        dnd.handle_drop_transition = skip;
      }
    }
    const strip = document.getElementById("tabbrowser-tabs");

    const landing = droppedFrom;
    droppedFrom = null;
    strip?.setAttribute("zia-settling", "true");
    const locked = new Set(dragCore.moved);
    clearMoved();
    for (const node of locked) {
      node.style.removeProperty("transform");
      node.setAttribute("zia-drop-lock", "true");
    }
    if (landing?.node?.isConnected) {
      const node = landing.node;
      holdFolderHover(node);

      node.setAttribute("zia-landing", "true");
      const held = node.getBoundingClientRect();
      node.style.setProperty("transform", `translate(${landing.left - held.left}px, ${landing.top - held.top}px)`, "important");
      // Firefox clears every tab's transform as its drag ends, so the tab painted a frame at
      // its new spot before the glide: it's pinned where let go each frame until the drop moves it
      const pin = () => {
        if (!node.isConnected) {
          return;
        }
        node.style.removeProperty("transform");
        const at = node.getBoundingClientRect();
        node.style.setProperty("transform", `translate(${landing.left - at.left}px, ${landing.top - at.top}px)`, "important");
      };
      repinLanding = pin;
      refitLanding = landing.bg ? () => settleDroppedWidth(landing.tab, landing.bgWidth) : null;
      const glideIn = () => {
        if (pendingFinish) {
          pin();
          requestAnimationFrame(glideIn);
          return;
        }
        repinLanding = null;
        refitLanding = null;
        refitHeld?.();
        node.style.removeProperty("transform");
        // the narrower look goes before the glide, which then starts the background where it
        // showed (in a folder, it stepped left as the glide began and slid back)
        if (landing.bg) {
          settleDroppedWidth(landing.tab, landing.bgWidth);
        }
        unmorphFolder(node);
        const to = node.getBoundingClientRect();
        const dy = landing.top - to.top;
        const dx = landing.bg?.isConnected ? landing.bgLeft - landing.bg.getBoundingClientRect().left : landing.left - to.left;
        if (!node.isConnected || node.hasAttribute("zen-essential") || (Math.abs(dy) < 2 && Math.abs(dx) < 2) || !to.height) {
          // kept a moment, past Firefox's own drop animation (see chrome.css)
          setTimeout(() => node.removeAttribute("zia-landing"), gBrowser.isTab(node) ? 0 : 400);
          return;
        }
        const glide = node.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }], {
          duration: LAND_MS,
          easing: LAND_EASE,
        });
        glide.id = "zia-land";
        const end = () => setTimeout(() => node.removeAttribute("zia-landing"), gBrowser.isTab(node) ? 0 : 250);
        glide.finished.then(end, end);
      };
      requestAnimationFrame(glideIn);
    }
    // A new drag started within the settling time is left alone: the wipe undid the offsets
    // Zen gives the other essentials to open a gap
    const gen = dragGen;
    const unlock = () => {
      strip?.removeAttribute("zia-settling");
      for (const node of locked) {
        node.style.removeProperty("top");
        node.removeAttribute("zia-drop-lock");
      }
    };
    const wipe = () => {
      if (gen !== dragGen) {
        unlock();
        return;
      }
      strip?.querySelectorAll(".tabbrowser-tab, .tab-group-label-container, tab-group, zen-folder").forEach((node) => {
        const appearing = node === droppedTab && !node.group;
        for (const anim of node.getAnimations()) {
          if (anim.id === "zia-land") {
            continue;
          }
          if (movesOnly(anim) || appearing) {
            anim.cancel();
          }
        }
        if (node.style.transform && !node.hasAttribute("zia-landing")) {
          node.style.transform = "";
        }

        // Firefox hides what's dragged until its own drop animation ends: for a folder, a part
        // inside it, so the whole folder vanished for a moment after landing
        if (node.style.visibility === "hidden" && (locked.has(node) || node === droppedTab || droppedTab?.contains?.(node))) {
          node.style.visibility = "";
        }
      });
      if (Date.now() < blockAnimUntil) {
        requestAnimationFrame(wipe);
      } else {
        unlock();
      }
    };
    clearTimeout(lockTimer);
    wipe();
    // the drop's own placing, now its landing is set up
    if (finishNow) {
      const run = finishNow;
      finishNow = null;
      run();
    }
    holdLent();
  };

  // A drag that ends where this window can't see (another window, the desktop, its tab
  // closed) never sends dragend, leaving every tab's x hidden until a restart. No mouse
  // moves arrive during a drag, so a move with no button held means it's over: tidy up.
  let lastTidy = 0;

  // its listeners and hooks, added by moveTabsLikeDia (28-tab-dragging.js) in order
  function watchSettle() {
    window.addEventListener("drop", () => (isRealDrop = true), true);
    window.addEventListener("dragstart", () => (isRealDrop = false), true);
    // Held over a space's icon, Zen switches to that space mid-drag, and the rest of the drag
    // is Zen's: Zia's moved rows were the space it left, hidden now, and it went on steering the
    // drop by them (fixDrop), so the tab landed back in that space, pinned there (#488). Zen
    // announces no switch (ZenWorkspacesUIUpdate only comes at start-up), so it's seen as the
    // drag goes on, and Zia lets go: its rows put back and its steering stopped, Zen's drop
    // left as it is. (Not settle(): that turns Zen's drop off, and in 2.113.0 the tab went
    // back where it was.)
    window.addEventListener(
      "dragover",
      (event) => {
        if (drag && drag.space !== window.gZenWorkspaces?.activeWorkspace) {
          followIntoSpace(event);
        }
      },
      true
    );
    window.addEventListener("drop", settle, true);
    window.addEventListener("dragstart", () => {
      // (and what the last drop kept showing: dragged straight back into
      // the essentials, a tab kept its x on the tile)
      releaseHeld?.();
      dragGen++;
      blockAnimUntil = 0;
    }, true);
    window.addEventListener("dragend", () => {
      settle();
      setTimeout(settle, 0);
    });
    window.addEventListener(
      "mousemove",
      (event) => {
        if (event.buttons || event.timeStamp - lastTidy < 500) {
          return;
        }
        lastTidy = event.timeStamp;
        if (drag || document.documentElement.hasAttribute("zia-dragging-tab")) {
          settle();
        }
        const strip = document.getElementById("tabbrowser-tabs");
        if (strip?.hasAttribute("zia-settling") && Date.now() > blockAnimUntil + 1000) {
          strip.removeAttribute("zia-settling");
        }
        for (const tab of document.querySelectorAll(".tabbrowser-tab[zia-essential-dragged]")) {
          if (!essentialDrag) {
            tab.removeAttribute("zia-essential-dragged");
            tab.style.visibility = "";
          }
        }
      },
      true
    );
  }

