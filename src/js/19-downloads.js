  // Downloads: a ring on the downloads button showing how far they've got, Zen's first
  // download flight waiting for that button to show, Zia's own flight of a row to the Library
  // button, and Firefox's "what should Zen do with this file?" box centred on the page.
  // Used elsewhere: addDownloadProgress, flyFirstDownloadToButton, watchDownloadDialog,
  // flyDownloadRows.
  const DOWNLOAD_RING_RADIUS = 46;
  const DOWNLOAD_RING_STROKE = 7;
  const FLIGHT_POP_MS = 120;
  const FLIGHT_WINDUP_MS = 420;
  const FLIGHT_LAUNCH_MS = 560;
  const FLIGHT_SETTLE_MS = 320;
  // (the whole flight: the pop, the wind-up and the launch)
  const FLIGHT_MS = FLIGHT_POP_MS + FLIGHT_WINDUP_MS + FLIGHT_LAUNCH_MS;
  // (the glow trails the row by this much, the button's nudge starts this much before it
  // lands, and the stage goes this much after it's settled)
  const FLIGHT_BEAM_LAG_MS = 40;
  const FLIGHT_NUDGE_EARLY_MS = 40;
  const FLIGHT_CLEAR_LATE_MS = 40;
  const FLIGHT_NUDGE_MS = 360;
  // (a download only just started, and a save from that box only just made)
  const DOWNLOAD_FRESH_MS = 5000;
  const DIALOG_SAVE_FRESH_MS = 2000;
  let downloadFlightOn = false;
  let savedFromDialog = null;

  // The ring: a track and an arc over it, drawn round from the top
  function makeDownloadRing() {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.id = "zia-download-ring";
    svg.setAttribute("viewBox", "0 0 100 100");
    const track = document.createElementNS(NS, "circle");
    const arc = document.createElementNS(NS, "circle");
    for (const circle of [track, arc]) {
      circle.setAttribute("cx", "50");
      circle.setAttribute("cy", "50");
      circle.setAttribute("r", `${DOWNLOAD_RING_RADIUS}`);
      circle.setAttribute("fill", "none");
      circle.setAttribute("stroke-width", `${DOWNLOAD_RING_STROKE}`);
      svg.appendChild(circle);
    }
    track.setAttribute("class", "zia-download-ring-track");
    arc.setAttribute("class", "zia-download-ring-arc");
    arc.setAttribute("stroke-linecap", "round");
    arc.setAttribute("transform", "rotate(-90 50 50)");
    const circumference = 2 * Math.PI * DOWNLOAD_RING_RADIUS;
    arc.setAttribute("stroke-dasharray", `${circumference}`);
    arc.setAttribute("stroke-dashoffset", `${circumference}`);
    return { svg, arc, circumference };
  }

  function drawDownloadRing(ring, fraction) {
    ring.arc.setAttribute("stroke-dashoffset", `${ring.circumference * (1 - fraction)}`);
  }

  function showDownloadProgress(button, ring, downloads) {
    let done = 0;
    let total = 0;
    let running = false;
    for (const download of downloads) {
      if (download.succeeded || download.canceled || download.error) {
        continue;
      }
      if (download.hasProgress && download.totalBytes > 0) {
        done += download.currentBytes || 0;
        total += download.totalBytes;
      }
      running = true;
    }
    if (!running || total <= 0) {
      button.removeAttribute("zia-downloading");
      drawDownloadRing(ring, 0);
      return;
    }
    button.setAttribute("zia-downloading", "true");
    drawDownloadRing(ring, Math.min(1, done / total));
  }

  function addDownloadProgress() {
    const button = document.getElementById("downloads-button");
    const commons = window.DownloadsCommon;
    if (!button || !commons?.getData) {
      return;
    }
    const ring = makeDownloadRing();
    button.appendChild(ring.svg);

    const seen = new Set();
    const keep = (download) => {
      seen.add(download);
      showDownloadProgress(button, ring, seen);
    };
    commons.getData(window).addView({
      onDownloadAdded: keep,
      onDownloadChanged: keep,
      onDownloadRemoved(download) {
        seen.delete(download);
        showDownloadProgress(button, ring, seen);
      },
    });
  }

  // With the downloads button hidden until there's a download (Firefox's
  // "auto-hide"), the first download's arc flew to the corner and dropped
  // a square there: Zen looks for the button before Firefox has shown it.
  // The button is shown first, and the arc waits a frame for it to land.
  function flyFirstDownloadToButton() {
    customElements.whenDefined("zen-download-animation").then(() => {
      const proto = customElements.get("zen-download-animation")?.prototype;
      const original = proto?.initializeAnimation;
      if (typeof original !== "function" || original.__zia) {
        return;
      }
      const patched = async function (...args) {
        // (Zia's own flight, a row with the file's icon and name, flyDownloadRows)
        if (downloadFlightOn && flightTarget()) {
          return undefined;
        }
        const button = document.getElementById("downloads-button");
        if (button?.hidden) {
          try {
            window.DownloadsButton?.unhide?.();
          } catch (err) {
            noteError("downloads: unhide", err);
          }
          button.hidden = false;
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        }
        return original.apply(this, args);
      };
      patched.__zia = true;
      proto.initializeAnimation = patched;
    }, () => {});
  }

  // ---------- A download flies to the Library button as a row, as in Dia
  // Zen sends a plain circle from where you clicked to the Library button.
  // In its place, as Dia does it (measured frame by frame): a small row
  // with the file's icon and name pops up just under where you clicked,
  // winds up for a moment (drifting away from the Library button and
  // tilting a few degrees, as a thing about to be thrown), then is flung
  // along a shallow curve to the button, levelling out, shrinking and
  // fading as it gets there; the button gives a nudge as it lands. While
  // it flies the window dims, a faint glow trailing the row and a soft
  // bloom where it lands. Zen's own switch for its
  // animation turns this off too.
  function flightTarget() {
    for (const id of ["zen-library-button", "downloads-button"]) {
      const button = document.getElementById(id);
      const box = button?.getBoundingClientRect();
      if (box && box.width > 0 && box.height > 0 && box.right > 0 && box.left < window.innerWidth && box.bottom > 0 && box.top < window.innerHeight) {
        return { button, x: box.left + box.width / 2, y: box.top + box.height / 2 };
      }
    }
    return null;
  }

  function flightName(download) {
    const path = download.target?.path;
    if (path) {
      return PathUtils.filename(path);
    }
    try {
      return decodeURIComponent(new URL(download.source?.url || "").pathname.split("/").pop()) || "Download";
    } catch (err) {
      return "Download";
    }
  }

  function flightPart(className, parent) {
    const node = document.createElementNS(XHTML_NS, "div");
    node.className = className;
    parent?.appendChild(node);
    return node;
  }

  // The stage the flight plays on: the dim, the glow, the bloom, and the row with the file's
  // icon and name
  function makeFlightStage(download) {
    document.getElementById("zia-download-flight")?.remove();
    const stage = flightPart("");
    stage.id = "zia-download-flight";
    const dim = flightPart("zia-df-dim", stage);
    const beam = flightPart("zia-df-beam", stage);
    const bloom = flightPart("zia-df-bloom", stage);
    const row = flightPart("zia-df-row", stage);
    const name = flightName(download);
    const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
    const icon = document.createElementNS(XHTML_NS, "img");
    icon.className = "zia-df-icon";
    icon.src = `moz-icon://${ext || ".bin"}?size=16`;
    const label = document.createElementNS(XHTML_NS, "span");
    label.className = "zia-df-name";
    label.textContent = name;
    row.append(icon, label);
    root.appendChild(stage);
    return { stage, dim, beam, bloom, row };
  }

  function flightPath(start, target, row) {
    const { width, height } = row.getBoundingClientRect();
    const keep = (x, y) => ({
      x: Math.min(window.innerWidth - width / 2 - 8, Math.max(width / 2 + 8, x)),
      y: Math.min(window.innerHeight - height / 2 - 8, Math.max(height / 2 + 8, y)),
    });
    // (centred just above where you last clicked)
    const p0 = keep(start.clientX, start.clientY - height * 0.9);
    const dx = target.x - p0.x;
    const dy = target.y - p0.y;
    const distance = Math.hypot(dx, dy) || 1;
    // The path, as Dia's: one swoop. It drops straight away from the
    // button (down when the button's above, up when it's below), rounds
    // the turn, then sweeps off in a long curve to the button: a cubic
    // curve whose first handle points straight away and whose second sits
    // out level with it, a little way towards the button.
    const away = -Math.sign(dy || -1);
    const drop = Math.min(120, Math.max(60, distance * 0.16));
    const c1 = { x: p0.x, y: p0.y + away * drop };
    const c2 = { x: p0.x + dx * 0.42, y: p0.y + away * drop * 1.1 };
    const bez = (u, a, b, c, d) => (1 - u) ** 3 * a + 3 * (1 - u) ** 2 * u * b + 3 * (1 - u) * u ** 2 * c + u ** 3 * d;
    const point = (u) => ({ x: bez(u, p0.x, c1.x, c2.x, target.x), y: bez(u, p0.y, c1.y, c2.y, target.y) });
    const at = (x, y, rotate, scale) => `translate(${x - p0.x}px, ${y - p0.y}px) translate(-50%, -50%) rotate(${rotate}deg) scale(${scale})`;
    return { p0, dx, dy, point, at };
  }

  function flightFrames(start, path) {
    const { p0, dx, dy, point, at } = path;
    const o = (ms) => ms / FLIGHT_MS;
    const frames = [
      { offset: 0, transform: at(start.clientX, start.clientY, 0, 0.45), opacity: 0 },
      { offset: o(FLIGHT_POP_MS), transform: at(p0.x, p0.y, 0, 1), opacity: 1 },
    ];
    // along the path: slow through the turn, then fast, easing in at the
    // end. It leans one way the whole flight, as Dia's does (anticlockwise
    // flying up and left; mirrored for the button below or to the right):
    // the lean builds smoothly through the turn and eases off across the
    // sweep. (Following the path's own slope, it flipped side to side
    // where the path ran straight up.)
    const lean = -Math.sign(dx * dy || 1) * 7;
    const smooth = (a, b, x) => {
      const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
      return k * k * (3 - 2 * k);
    };
    const STEPS = 48;
    const flightMs = FLIGHT_WINDUP_MS + FLIGHT_LAUNCH_MS;
    for (let i = 1; i <= STEPS; i++) {
      const t = i / STEPS;
      // (a gentle ease, its top speed only about one and a half times its
      // average: a steeper one crossed 100px between frames mid-flight,
      // and read as jumpy)
      const u = 0.5 - 0.5 * Math.cos(Math.PI * t);
      const here = point(u);
      const tilt = lean * smooth(0, 0.35, t) * (1 - smooth(0.45, 0.9, t));
      frames.push({
        offset: o(FLIGHT_POP_MS + flightMs * t),
        transform: at(here.x, here.y, tilt.toFixed(2), (1 - 0.65 * smooth(0.45, 1, u)).toFixed(4)),
        opacity: (1 - smooth(0.7, 1, u)).toFixed(4),
      });
    }
    return frames;
  }

  // The dim, the glow trailing the row and the bloom where it lands
  function lightFlight({ dim, beam, bloom, row }, frames, target) {
    // the dim: in as it winds up, out once it's landed
    const settle = FLIGHT_MS + FLIGHT_SETTLE_MS;
    const so = (ms) => ms / settle;
    dim.animate(
      [
        { opacity: 0, easing: "ease-in-out" },
        { opacity: 1, offset: so(FLIGHT_POP_MS + FLIGHT_WINDUP_MS) },
        { opacity: 1, offset: so(FLIGHT_MS), easing: "ease-out" },
        { opacity: 0 },
      ],
      { duration: settle, easing: "linear", fill: "forwards" }
    );

    // the light: a faint glow trailing just behind the row along its own
    // path, as in Dia, only a breath brighter than the dim
    beam.style.left = row.style.left;
    beam.style.top = row.style.top;
    beam.animate(
      frames.map((frame, i) => ({
        offset: frame.offset,
        transform: frame.transform.replace(/scale\(([\d.]+)\)/, (_, n) => `scale(${(Number(n) * 1.6).toFixed(3)})`),
        opacity: i < 3 ? 0 : frame.opacity,
      })),
      { duration: FLIGHT_MS, delay: FLIGHT_BEAM_LAG_MS, easing: "linear", fill: "forwards" }
    );

    // the bloom where it lands
    Object.assign(bloom.style, { left: `${target.x}px`, top: `${target.y}px` });
    bloom.animate(
      [
        { opacity: 0, scale: 0.4 },
        { opacity: 0, scale: 0.4, offset: so(FLIGHT_POP_MS + FLIGHT_WINDUP_MS + FLIGHT_LAUNCH_MS * 0.5) },
        { opacity: 1, scale: 1, offset: so(FLIGHT_MS) },
        { opacity: 0, scale: 1.3 },
      ],
      { duration: settle, easing: "linear", fill: "forwards" }
    );
  }

  function flyDownloadRow(download, start) {
    const target = flightTarget();
    if (!target) {
      return;
    }
    const parts = makeFlightStage(download);
    const { stage, row } = parts;
    const path = flightPath(start, target, row);
    row.style.left = `${path.p0.x}px`;
    row.style.top = `${path.p0.y}px`;
    const frames = flightFrames(start, path);
    // (only movement and fading, which Firefox runs on the graphics card:
    // with a blur in it too, it ran frame by frame alongside everything
    // else a download starts, and stuttered)
    const flight = row.animate(frames, { duration: FLIGHT_MS, easing: "linear", fill: "forwards" });
    lightFlight(parts, frames, target);

    // (not kept: a newer flight takes this stage away itself, and this one's nudge still lands)
    setTimeout(() => {
      target.button.animate(
        [{ transform: "scale(1)" }, { transform: "scale(1.18)", offset: 0.4 }, { transform: "scale(1)" }],
        { duration: FLIGHT_NUDGE_MS, easing: "cubic-bezier(0.3, 1.4, 0.5, 1)" }
      );
    }, FLIGHT_MS - FLIGHT_NUDGE_EARLY_MS);
    setTimeout(() => stage.remove(), FLIGHT_MS + FLIGHT_SETTLE_MS + FLIGHT_CLEAR_LATE_MS);
    flight.finished.catch(() => stage.remove());
  }

  // Firefox's "What should Zen do with this file?" box opened wherever the
  // system put it, top left of the screen: it's centred on the page of the
  // window it's for, every time, and saving from it sends the download's
  // flight from there.
  const DOWNLOAD_DIALOG = "chrome://mozapps/content/downloads/unknownContentType.xhtml";

  function pageBoxOnScreen() {
    const page = document.getElementById("tabbrowser-tabpanels")?.getBoundingClientRect();
    if (!page || !page.width) {
      return null;
    }
    return { left: window.mozInnerScreenX + page.left, top: window.mozInnerScreenY + page.top, width: page.width, height: page.height, client: page };
  }

  function centreDownloadDialog(dialog) {
    // (only the window it's for: the front browser window)
    if (Services.wm.getMostRecentWindow("navigator:browser") !== window) {
      return;
    }
    const place = () => {
      const page = pageBoxOnScreen();
      if (!page || dialog.closed) {
        return;
      }
      dialog.moveTo(
        Math.round(page.left + (page.width - dialog.outerWidth) / 2),
        Math.round(page.top + (page.height - dialog.outerHeight) / 2)
      );
    };
    place();
    // (once it's sized itself to what it shows)
    dialog.requestAnimationFrame(() => dialog.requestAnimationFrame(place));
    dialog.document.addEventListener("dialogaccept", () => {
      const page = pageBoxOnScreen();
      if (page) {
        savedFromDialog = { clientX: page.client.left + page.client.width / 2, clientY: page.client.top + page.client.height / 2, at: Date.now() };
      }
    });
  }

  function watchDownloadDialog() {
    const observer = {
      observe(subject, topic) {
        if (topic !== "domwindowopened") {
          return;
        }
        subject.addEventListener(
          "load",
          () => {
            if (subject.location?.href === DOWNLOAD_DIALOG) {
              try {
                centreDownloadDialog(subject);
              } catch (err) {
                noteError("downloads: centre dialog", err);
              }
            }
          },
          { once: true }
        );
      },
    };
    Services.ww.registerNotification(observer);
    window.addEventListener("unload", () => Services.ww.unregisterNotification(observer), { once: true });
  }

  function flyNewDownload(download) {
    try {
      // (only one just started, here, and not those listed on startup)
      const fresh = !download.succeeded && Date.now() - (download.startTime?.getTime?.() ?? 0) < DOWNLOAD_FRESH_MS;
      // (from where Firefox's "what should Zen do with this file?"
      // box was, if that's where it was saved from, 2s ago at most)
      const fromDialog = savedFromDialog && Date.now() - savedFromDialog.at < DIALOG_SAVE_FRESH_MS ? savedFromDialog : null;
      savedFromDialog = null;
      const start = fromDialog || window.gZenUIManager?._lastClickPosition;
      if (
        !fresh ||
        !start ||
        !Services.prefs.getBoolPref("zen.downloads.download-animation", true) ||
        // (this window, the front one, or the one that box came from)
        (Services.focus.activeWindow !== window && !fromDialog) ||
        matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        return;
      }
      flyDownloadRow(download, start);
    } catch (err) {
      noteError("downloads: flight", err);
    }
  }

  function flyDownloadRows() {
    const Downloads = window.Downloads;
    if (!Downloads?.getList) {
      return;
    }
    Downloads.getList(Downloads.ALL)
      .then((list) => {
        downloadFlightOn = true;
        list.addView({ onDownloadAdded: flyNewDownload });
      })
      .catch((err) => noteError("downloads: flight list", err));
  }
