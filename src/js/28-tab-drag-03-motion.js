  // The taps, the pinned tabs' line, and the rows slid out of the dragged tab's way (apply).

  const newTabOnTop = () => Services.prefs.getBoolPref("zen.view.show-newtab-button-top", false);
  const newTabButton = () =>
    window.gZenWorkspaces?.activeWorkspaceElement?.newTabButton ||
    document.querySelector("#tabs-newtab-button, #vertical-tabs-newtab-button");

  let lastTap = 0;
  // Zia's own tap. Only if haptics are on in Zen; while a drag has them
  // muted, they're let through for just this one.
  const tap = () => {
    const muted = hapticsWereOn !== null;
    if (muted ? !hapticsWereOn : !Services.prefs.getBoolPref(HAPTIC_PREF, true)) {
      return;
    }
    const now = Date.now();
    if (now - lastTap < 140) {
      return;
    }
    lastTap = now;
    try {
      if (muted) {
        Services.prefs.setBoolPref(HAPTIC_PREF, true);
      }
      zenHaptic?.();
    } catch (err) {
      noteError("tab dragging: tap", err);
    } finally {
      if (muted) {
        Services.prefs.setBoolPref(HAPTIC_PREF, false);
      }
    }
  };

  const placeSep = (sepDelta) => {
    const sep = currentSeparator();
    if (sep && drag.sepDelta !== sepDelta) {
      drag.sepDelta = sepDelta;
      drag.sepShownY = sepDelta;
      place(sep, sepDelta, false);
      const button = newTabOnTop() ? newTabButton() : null;
      if (button) {
        place(button, sepDelta, false);
      }
    }
  };

  // A dragged folder whose height changed since the list was measured (it shut after
  // the drag began): measured again, or rows moved by the old height and it dropped wrong
  const remeasureFolderDrag = (folder) => {
    const strip = document.getElementById("tabbrowser-tabs");
    // measured where they sit, not partway through sliding back
    strip?.setAttribute("zia-measuring", "true");
    for (const row of drag.rows) {
      if (row.node !== folder && !folder.contains(row.node)) {
        place(row.node, 0, false);
        row.delta = 0;
        row.shownY = 0;
      }
    }
    placeSep(0);
    const kept = folder.style.getPropertyValue("transform");
    const keptPriority = folder.style.getPropertyPriority("transform");
    folder.style.removeProperty("transform");
    // (a real layout read first: the measuring below reads it unflushed)
    folder.getBoundingClientRect();
    const rows = measureRows(null);
    const box = layoutTop(folder);
    folder.style.setProperty("transform", kept, keptPriority);
    strip?.removeAttribute("zia-measuring");
    const mine = rows.find((row) => row.node === folder || folder.contains(row.node));
    const sep = currentSeparator();
    drag.rows = rows;
    drag.origin = box.top;
    drag.height = box.height;
    drag.pitch = box.height;
    drag.index = mine?.index ?? drag.index;
    drag.shifted = new Set();
    drag.sepTop = sep ? sep.getBoundingClientRect().top : null;
  };

  const apply = (dy) => {
    const moving = drag?.moving;
    if (!moving?.isConnected || !drag.rows) {
      return;
    }
    if (drag.folder && !drag.essentials && Math.abs(drag.folder.getBoundingClientRect().height - drag.height) > 3) {
      remeasureFolderDrag(drag.folder);
    }
    const visualMid = drag.origin + dy + drag.height / 2;
    place(moving, dy, true);

    // New Tab at the foot of the list, when the list closes up (only if the
    // row taken out was above it)
    const shiftNewTab = (by) => {
      if (newTabOnTop()) {
        return;
      }
      const button = newTabButton();
      if (!button) {
        return;
      }
      drag.newTabTop ??= button.getBoundingClientRect().top;
      const want = by && drag.origin < drag.newTabTop ? by : 0;
      if ((drag.newTabShift || 0) !== want) {
        drag.newTabShift = want;
        place(button, want, false);
      }
    };
    // over the essentials (a tab or a split): the list closes up behind it
    if (drag.essentials || drag.splitEssential) {
      for (const row of drag.rows) {
        if (notARow(row)) {
          continue;
        }
        const gone = row.index > drag.index;
        if (gone) {
          drag.shifted.add(row.node);
        } else {
          drag.shifted.delete(row.node);
        }
        const delta = gone ? -drag.pitch : 0;
        if ((row.shownY ?? row.delta) !== delta) {
          row.delta = delta;
          row.shownY = delta;
          place(row.node, delta, false);
        }
      }
      if (drag.sepTop != null) {
        placeSep(drag.origin > drag.sepTop ? 0 : -drag.pitch);
      }
      // (New Tab under the list too: it stayed, leaving a gap above it
      // until the drop)
      shiftNewTab(-drag.pitch);
      drag.target = null;
      setDropSlot(null);
      takeEmptySlot();
      paintFolders();
      return;
    }

    shiftNewTab(0);
    let rowsMoved = false;
    for (const row of drag.rows) {
      if (notARow(row)) {
        continue;
      }
      const was = drag.shifted.has(row.node);
      let shift = false;
      // (a closed folder showing a tab moves aside only once the tab is
      // past its name: over the tab it shows, the tab goes in above it)
      if (row.index > drag.index) {
        shift = visualMid > row.top + (row.head || 0) + (was ? -10 : 8);
      } else if (row.index < drag.index) {
        shift = visualMid < row.top + (row.head || row.height) - (was ? -10 : 8);
      }
      if (shift) {
        drag.shifted.add(row.node);
      } else {
        drag.shifted.delete(row.node);
      }
      const delta = shift ? (row.index > drag.index ? -drag.pitch : drag.pitch) : 0;
      if (row.delta === delta) {
        continue;
      }
      row.delta = delta;
      row.shownY = delta;
      place(row.node, delta, false);
      rowsMoved = true;
    }
    if (drag.sepTop != null) {
      const startedBelow = drag.origin > drag.sepTop;
      let sepDelta = 0;
      // Coming up from below, it's over the separator a fifth of the way into the space that
      // opens (halfway, the gap under the last folder came first and it went in still in the
      // space made for it); back down, just past that point with a few pixels' give.
      const upTo = drag.sepTop + drag.pitch * 0.8 + (drag.sepDelta ? 4 : 0);
      if (startedBelow && visualMid < upTo) {
        sepDelta = drag.pitch;
      } else if (!startedBelow && visualMid > drag.sepTop + 2) {
        sepDelta = -drag.pitch;
      }
      // crossing the separator taps like a row moving does
      if (drag.sepDelta !== sepDelta && (drag.sepDelta || sepDelta)) {
        rowsMoved = true;
      }
      placeSep(sepDelta);
    }
    if (rowsMoved) {
      tap();
    }
    updateTarget(visualMid);
    takeEmptySlot();
    paintFolders();
    morphWidth(drag.target?.folder || null);
  };

