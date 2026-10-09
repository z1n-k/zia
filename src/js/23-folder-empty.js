  // Zia lets you make a folder before it has any tabs (Dia doesn't), so an
  // empty one says so: open, it shows a dashed "Drag tabs here" slot, which
  // steps aside for a tab dragged into it (chrome.css).
  // Zen keeps a hidden placeholder tab in every empty folder, so a folder
  // counts as empty when that's all it holds.
  function isEmptyFolder(folder) {
    const container = folder.querySelector(":scope > .tab-group-container");
    if (!container) {
      return false;
    }
    return ![...container.children].some(
      (child) =>
        child.localName === "zen-folder" ||
        // (a split in it too: it kept its slot, showing under the split)
        child.localName === "tab-group" ||
        (child.classList.contains("tabbrowser-tab") && !child.hasAttribute("zen-empty-tab"))
    );
  }

  // The slot is sized from a real tab in the sidebar (its background, the gaps
  // around it and how far it's inset in a folder), so it's exactly where the
  // first tab will sit, and a tab dragged in replaces it without anything
  // moving. Measured from a tab inside an open folder when there is one.
  const FOLDER_SLOT_INSET = { start: 14, end: 5 };
  const rootPx = (name, fallback) => parseFloat(getComputedStyle(root).getPropertyValue(name)) || fallback;
  let slotSize = "";
  function measureFolderSlot() {
    // (not a glance: its tab sits inside the one it came from, drawn as a
    // small picture, and the slot shrank to that while a glance was open)
    const visible = (tab) =>
      tab.getBoundingClientRect().height > 8 &&
      !tab.hasAttribute("zen-empty-tab") &&
      !tab.hasAttribute("zen-glance-tab") &&
      !tab.parentElement?.closest(".tabbrowser-tab");
    const inFolder = [...document.querySelectorAll("zen-folder:not([collapsed]) > .tab-group-container > .tabbrowser-tab")].find(visible);
    const tab =
      inFolder || [...document.querySelectorAll("#tabbrowser-tabs .tabbrowser-tab:not([zen-essential])")].find(visible);
    const bg = tab?.querySelector(":scope > .tab-stack > .tab-background");
    if (!tab || !bg) {
      return;
    }
    const t = tab.getBoundingClientRect();
    const b = bg.getBoundingClientRect();
    const style = getComputedStyle(tab);
    const top = (parseFloat(style.marginTop) || 0) + (b.top - t.top);
    const bottom = (parseFloat(style.marginBottom) || 0) + (t.bottom - b.bottom);
    let start;
    let end;
    if (inFolder) {
      const box = tab.parentElement.getBoundingClientRect();
      start = b.left - box.left;
      end = box.right - b.right;
    } else {
      start = FOLDER_SLOT_INSET.start + (b.left - t.left);
      end = FOLDER_SLOT_INSET.end + (t.right - b.right);
    }
    // Same gap on the right as at the bottom, inside an open empty folder's box
    const probe = document.querySelector("zen-folder[zia-empty]:not([collapsed])");
    const container = probe?.querySelector(":scope > .tab-group-container");
    if (probe && container) {
      const box = getComputedStyle(probe, "::before");
      const folderBox = probe.getBoundingClientRect();
      const inner = container.getBoundingClientRect();
      const boxRight = folderBox.right - (parseFloat(box.right) || 0);
      const boxBottom = folderBox.bottom - (parseFloat(box.bottom) || 0);
      // (the list's own padding below the slot is part of that gap)
      const gap = boxBottom - (inner.bottom - (parseFloat(getComputedStyle(container).paddingBottom) || 0) - bottom);
      if (gap > 0 && gap < 20) {
        end = inner.right - (boxRight - gap);
      }
    }
    const values = [top, bottom, start, end, b.height].map((n) => `${Math.round(n * 2) / 2}px`);
    if (values.join(" ") === slotSize) {
      return;
    }
    slotSize = values.join(" ");
    ["mt", "mb", "ms", "me", "h"].forEach((name, i) => root.style.setProperty(`--zia-slot-${name}`, values[i]));
  }

  // The slot's dashes, drawn to its size so they're even all the way round
  // at any sidebar width: two dashes centred on each corner, and on each
  // side as many as fit, spread evenly between the corners' (each set on a
  // whole screen pixel, so none blurs). Firefox's own dashes, spread to fit
  // each side, fell between pixels and greyed; a fixed pattern drawn round
  // the box came back to its start uneven.
  const SLOT_DASH = 3;
  const SLOT_GAP = 3;
  function slotDashesPath(width, height, radius, dpr) {
    const snap = (n) => Math.round(n * dpr) / dpr;
    const c = radius - 0.5;
    const arc = (Math.PI / 2) * c;
    // the corner's two dashes, centred on its arc, a gap between them
    const cornerPad = (arc - 2 * SLOT_DASH - SLOT_GAP) / 2;
    const parts = [];
    const corner = (cx, cy, from) => {
      for (const start of [cornerPad, cornerPad + SLOT_DASH + SLOT_GAP]) {
        const a1 = from + (start / arc) * (Math.PI / 2);
        const a2 = from + ((start + SLOT_DASH) / arc) * (Math.PI / 2);
        const x1 = cx + c * Math.cos(a1);
        const y1 = cy + c * Math.sin(a1);
        const x2 = cx + c * Math.cos(a2);
        const y2 = cy + c * Math.sin(a2);
        parts.push(`M${x1.toFixed(2)} ${y1.toFixed(2)}A${c} ${c} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`);
      }
    };
    // a side from its start to its end, along x or y at a fixed other
    const side = (from, to, fixed, horizontal) => {
      const length = to - from;
      // the gap at each end makes up a whole gap with the corner's pad
      const end = Math.max(0, SLOT_GAP - cornerPad);
      const n = Math.max(1, Math.round((length - 2 * end + SLOT_GAP) / (SLOT_DASH + SLOT_GAP)));
      const gap = n > 1 ? (length - 2 * end - n * SLOT_DASH) / (n - 1) : 0;
      for (let i = 0; i < n; i++) {
        const a = n > 1 ? snap(from + end + i * (SLOT_DASH + gap)) : snap(from + (length - SLOT_DASH) / 2);
        const b = a + SLOT_DASH;
        parts.push(horizontal ? `M${a} ${fixed}H${b}` : `M${fixed} ${a}V${b}`);
      }
    };
    const right = width - 0.5;
    const bottom = height - 0.5;
    corner(radius, radius, Math.PI);
    side(radius, width - radius, 0.5, true);
    corner(width - radius, radius, -Math.PI / 2);
    side(radius, height - radius, right, false);
    corner(width - radius, height - radius, 0);
    side(radius, width - radius, bottom, true);
    corner(radius, height - radius, Math.PI / 2);
    side(radius, height - radius, 0.5, false);
    return parts.join("");
  }

  function slotDashesImage(width, height, radius, dpr) {
    const svg =
      `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' viewBox='0 0 ${width} ${height}' preserveAspectRatio='none'>` +
      `<path d='${slotDashesPath(width, height, radius, dpr)}' fill='none' stroke='context-stroke' stroke-width='1'/></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }

  // The slot shows its dashes from a canvas of its folder's (-moz-element),
  // redrawn to size at every step of a sidebar resize: a canvas shows its
  // new drawing at once, where a new picture blanked while it loaded, and
  // the last one stretched while it waited. The canvases sit off screen.
  let slotCanvasHolder = null;
  let slotCanvasCount = 0;
  const slotCanvases = new Set();

  function drawSlotCanvas(folder, container, width, height, radius, dpr) {
    let canvas = folder.ziaSlotCanvas;
    if (!canvas) {
      if (!slotCanvasHolder) {
        slotCanvasHolder = document.createElementNS(XHTML_NS, "div");
        slotCanvasHolder.id = "zia-slot-canvases";
        slotCanvasHolder.setAttribute("aria-hidden", "true");
        slotCanvasHolder.style.cssText = "position: fixed; top: 0; left: -10000px; pointer-events: none;";
        (document.body || document.documentElement).appendChild(slotCanvasHolder);
      }
      canvas = document.createElementNS(XHTML_NS, "canvas");
      canvas.id = `zia-slot-dashes-${++slotCanvasCount}`;
      canvas.style.display = "block";
      slotCanvasHolder.appendChild(canvas);
      canvas.ziaFolder = folder;
      folder.ziaSlotCanvas = canvas;
      slotCanvases.add(canvas);
      folder.style.setProperty("--zia-slot-dashes-live", `-moz-element(#${canvas.id})`);
    }
    const color = getComputedStyle(container, "::after").stroke;
    const key = `${width}x${height}@${dpr}:${color}`;
    if (canvas.ziaKey === key) {
      return;
    }
    canvas.ziaKey = key;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const context = canvas.getContext("2d");
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    context.lineWidth = 1;
    // (a colour the canvas can't read leaves the stand-in)
    context.strokeStyle = "rgba(255, 255, 255, 0.13)";
    if (color && color !== "none") {
      context.strokeStyle = color;
    }
    context.stroke(new Path2D(slotDashesPath(width, height, radius, dpr)));
  }

  function dropGoneSlotCanvases() {
    for (const canvas of slotCanvases) {
      if (!canvas.ziaFolder.isConnected) {
        canvas.remove();
        slotCanvases.delete(canvas);
      }
    }
  }

  // Each empty folder's slot gets its own (a folder inside another is
  // narrower); the page's keeps the latest, for a tab dragged in from
  // outside any folder. The slot's canvas is redrawn at once; the picture
  // a dragged tab wears is drawn afresh once the width has held still for
  // a moment, swapped in only once it's ready: drawn at every step, each
  // new one blanked the dashes while it loaded.
  const SLOT_DASHES_SETTLE_MS = 200;
  let lastSlotDashes = "";
  let slotDashesTimer = 0;
  function drawSlotDashes() {
    clearTimeout(slotDashesTimer);
    drawSlotDashesNow(true);
    // (a slot not drawn yet, a folder just made or opened, is drawn at once)
    if ([...document.querySelectorAll("zen-folder[zia-empty]")].some((folder) => !folder.ziaSlotDashes)) {
      drawSlotDashesNow();
      return;
    }
    slotDashesTimer = setTimeout(() => drawSlotDashesNow(), SLOT_DASHES_SETTLE_MS);
  }

  function useSlotDashes(target, image) {
    const url = image.slice(5, -2);
    const picture = new Image();
    picture.src = url;
    picture.decode().catch(() => {}).then(() => target.style.setProperty("--zia-slot-dashes-image", image));
  }

  function drawSlotDashesNow(canvasOnly = false) {
    dropGoneSlotCanvases();
    const height = rootPx("--zia-slot-h", 35);
    const inset = rootPx("--zia-slot-ms", 16) + rootPx("--zia-slot-me", 7);
    const radius = rootPx("--zia-tab-radius", 9.5);
    const dpr = window.devicePixelRatio || 1;
    for (const folder of document.querySelectorAll("zen-folder[zia-empty]")) {
      const container = folder.querySelector(":scope > .tab-group-container");
      const style = container && getComputedStyle(container);
      const box = container?.getBoundingClientRect();
      const width = box
        ? Math.round((box.width - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0) - inset) * dpr) / dpr
        : 0;
      if (width < 2 * radius + 2 * SLOT_DASH || height < 2 * radius) {
        continue;
      }
      drawSlotCanvas(folder, container, width, height, radius, dpr);
      if (canvasOnly) {
        continue;
      }
      const key = `${width}x${height}@${dpr}`;
      if (folder.ziaSlotDashes !== key) {
        folder.ziaSlotDashes = key;
        const image = slotDashesImage(width, height, radius, dpr);
        useSlotDashes(folder, image);
        if (!folder.parentElement?.closest("zen-folder") && image !== lastSlotDashes) {
          lastSlotDashes = image;
          useSlotDashes(root, image);
        }
      }
    }
  }

  // A folder emptied by moving its last tab out collapses; an open empty
  // folder (new, or opened by hand) shows the slot.
  const wasEmpty = new WeakMap();

  function markEmptyFolders() {
    let open = false;
    for (const folder of document.querySelectorAll("zen-folder")) {
      const empty = isEmptyFolder(folder);
      folder.toggleAttribute("zia-empty", empty);
      if (empty && wasEmpty.get(folder) === false && !folder.hasAttribute("collapsed")) {
        try {
          folder.collapsed = true;
        } catch (err) {
          noteError("folder empty: collapse", err);
        }
      }
      wasEmpty.set(folder, empty);
      open ||= empty && !folder.hasAttribute("collapsed");
    }
    if (open) {
      measureFolderSlot();
      drawSlotDashes();
    }
  }

  function watchEmptyFolders() {
    const tabs = document.getElementById("tabbrowser-tabs");
    if (!tabs) {
      return;
    }
    let frame = 0;
    const schedule = () => {
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          markEmptyFolders();
        });
      }
    };
    new MutationObserver(schedule).observe(tabs, { childList: true, subtree: true });
    // (the slot's canvas takes its dashes' colour: redrawn when a folder's
    // colour changes, or the space turns light or dark)
    new MutationObserver(schedule).observe(tabs, { subtree: true, attributes: true, attributeFilter: ["zia-folder-color"] });
    new MutationObserver(schedule).observe(root, { attributes: true, attributeFilter: ["zia-light"] });
    // An empty folder opens by sliding its slot down into view, as a folder
    // does its tabs. Emptied (its last tab dragged out) and shut, Zen had
    // measured it with no slot showing, so it was only 4px up out of view
    // and opened with a snap. It's put a slot's height up before Zen opens it.
    window.addEventListener(
      "TabGroupExpand",
      (event) => {
        const folder = event.target;
        if (folder?.localName !== "zen-folder" || !folder.hasAttribute("zia-empty")) {
          return;
        }
        const start = folder.groupStartElement;
        if (!start) {
          return;
        }
        const room = rootPx("--zia-slot-h", 35) + rootPx("--zia-slot-mt", 2) + rootPx("--zia-slot-mb", 2);
        if ((parseFloat(getComputedStyle(start).marginTop) || 0) > -room) {
          start.style.marginTop = `${-(room + 4)}px`;
        }
      },
      true
    );
    for (const type of ["TabGroupCreate", "TabGrouped", "TabUngrouped", "TabClose", "TabMove", "TabGroupExpand"]) {
      gBrowser.tabContainer.addEventListener(type, schedule);
    }
    window.addEventListener("ZenWorkspacesUIUpdate", schedule);
    // The sidebar's width changes a tab's size
    new ResizeObserver(schedule).observe(tabs);
    schedule();
  }

