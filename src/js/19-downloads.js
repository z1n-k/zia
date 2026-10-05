  function addDownloadProgress() {
    const button = document.getElementById("downloads-button");
    const commons = window.DownloadsCommon;
    if (!button || !commons?.getData) {
      return;
    }

    const NS = "http://www.w3.org/2000/svg";
    const ring = document.createElementNS(NS, "svg");
    ring.id = "zia-download-ring";
    ring.setAttribute("viewBox", "0 0 100 100");
    const track = document.createElementNS(NS, "circle");
    const arc = document.createElementNS(NS, "circle");

    const RADIUS = 46;
    const STROKE = 7;
    for (const circle of [track, arc]) {
      circle.setAttribute("cx", "50");
      circle.setAttribute("cy", "50");
      circle.setAttribute("r", `${RADIUS}`);
      circle.setAttribute("fill", "none");
      circle.setAttribute("stroke-width", `${STROKE}`);
      ring.appendChild(circle);
    }
    track.setAttribute("class", "zia-download-ring-track");
    arc.setAttribute("class", "zia-download-ring-arc");
    arc.setAttribute("stroke-linecap", "round");

    arc.setAttribute("transform", "rotate(-90 50 50)");
    const circumference = 2 * Math.PI * RADIUS;
    arc.setAttribute("stroke-dasharray", `${circumference}`);
    arc.setAttribute("stroke-dashoffset", `${circumference}`);
    button.appendChild(ring);

    function draw(fraction) {
      arc.setAttribute("stroke-dashoffset", `${circumference * (1 - fraction)}`);
    }

    function update(downloads) {
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
        draw(0);
        return;
      }
      button.setAttribute("zia-downloading", "true");
      draw(Math.min(1, done / total));
    }

    const data = commons.getData(window);
    const seen = new Set();
    const view = {
      onDownloadAdded(download) {
        seen.add(download);
        update(seen);
      },
      onDownloadChanged(download) {
        seen.add(download);
        update(seen);
      },
      onDownloadRemoved(download) {
        seen.delete(download);
        update(seen);
      },
    };
    data.addView(view);
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
  let downloadFlightOn = false;
  const FLIGHT_POP_MS = 120;
  const FLIGHT_WINDUP_MS = 380;
  const FLIGHT_LAUNCH_MS = 420;
  const FLIGHT_SETTLE_MS = 320;

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

  function flyDownloadRow(download, start) {
    const target = flightTarget();
    if (!target) {
      return;
    }
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

    row.style.left = `${p0.x}px`;
    row.style.top = `${p0.y}px`;
    const total = FLIGHT_POP_MS + FLIGHT_WINDUP_MS + FLIGHT_LAUNCH_MS;
    const o = (ms) => ms / total;
    const frames = [
      { offset: 0, transform: at(start.clientX, start.clientY, 0, 0.45), opacity: 0, filter: "blur(0px)" },
      { offset: o(FLIGHT_POP_MS), transform: at(p0.x, p0.y, 0, 1), opacity: 1, filter: "blur(0px)" },
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
      const u = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
      const here = point(u);
      const tilt = lean * smooth(0, 0.35, t) * (1 - smooth(0.45, 0.9, t));
      frames.push({
        offset: o(FLIGHT_POP_MS + flightMs * t),
        transform: at(here.x, here.y, tilt.toFixed(2), (1 - 0.65 * smooth(0.45, 1, u)).toFixed(4)),
        opacity: (1 - smooth(0.7, 1, u)).toFixed(4),
        filter: `blur(${(smooth(0.6, 1, u) * 2).toFixed(2)}px)`,
      });
    }
    const flight = row.animate(frames, { duration: total, easing: "linear", fill: "forwards" });

    // the dim: in as it winds up, out once it's landed
    const settle = total + FLIGHT_SETTLE_MS;
    const so = (ms) => ms / settle;
    dim.animate(
      [
        { opacity: 0, easing: "ease-in-out" },
        { opacity: 1, offset: so(FLIGHT_POP_MS + FLIGHT_WINDUP_MS) },
        { opacity: 1, offset: so(total), easing: "ease-out" },
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
      { duration: total, delay: 40, easing: "linear", fill: "forwards" }
    );

    // the bloom where it lands
    Object.assign(bloom.style, { left: `${target.x}px`, top: `${target.y}px` });
    bloom.animate(
      [
        { opacity: 0, scale: 0.4 },
        { opacity: 0, scale: 0.4, offset: so(FLIGHT_POP_MS + FLIGHT_WINDUP_MS + FLIGHT_LAUNCH_MS * 0.5) },
        { opacity: 1, scale: 1, offset: so(total) },
        { opacity: 0, scale: 1.3 },
      ],
      { duration: settle, easing: "linear", fill: "forwards" }
    );

    setTimeout(() => {
      target.button.animate(
        [{ transform: "scale(1)" }, { transform: "scale(1.18)", offset: 0.4 }, { transform: "scale(1)" }],
        { duration: 360, easing: "cubic-bezier(0.3, 1.4, 0.5, 1)" }
      );
    }, total - 40);
    setTimeout(() => stage.remove(), settle + 40);
    flight.finished.catch(() => stage.remove());
  }

  function flyDownloadRows() {
    const Downloads = window.Downloads;
    if (!Downloads?.getList) {
      return;
    }
    Downloads.getList(Downloads.ALL)
      .then((list) => {
        downloadFlightOn = true;
        list.addView({
          onDownloadAdded(download) {
            try {
              // (only one just started, here, and not those listed on startup)
              const fresh = !download.succeeded && Date.now() - (download.startTime?.getTime?.() ?? 0) < 5000;
              const start = window.gZenUIManager?._lastClickPosition;
              if (
                !fresh ||
                !start ||
                !Services.prefs.getBoolPref("zen.downloads.download-animation", true) ||
                Services.focus.activeWindow !== window ||
                matchMedia("(prefers-reduced-motion: reduce)").matches
              ) {
                return;
              }
              flyDownloadRow(download, start);
            } catch (err) {
              noteError("downloads: flight", err);
            }
          },
        });
      })
      .catch((err) => noteError("downloads: flight list", err));
  }
