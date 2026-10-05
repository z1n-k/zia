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
  const FLIGHT_WINDUP_MS = 300;
  const FLIGHT_LAUNCH_MS = 340;
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
    // (centred just above the pointer, as in Dia)
    const p0 = keep(start.clientX, start.clientY - height * 0.9);
    const dx = target.x - p0.x;
    const dy = target.y - p0.y;
    const distance = Math.hypot(dx, dy) || 1;
    const ux = dx / distance;
    const uy = dy / distance;
    // the wind-up: back away from the button up or down, a little towards
    // it sideways, tilting the way it'll be thrown
    const wind = keep(p0.x + ux * 18, p0.y - Math.sign(uy || 1) * 34);
    const tilt = -Math.sign(dx * dy || 1) * 6;
    const at = (x, y, rotate, scale) => `translate(${x - p0.x}px, ${y - p0.y}px) translate(-50%, -50%) rotate(${rotate}deg) scale(${scale})`;

    row.style.left = `${p0.x}px`;
    row.style.top = `${p0.y}px`;
    const total = FLIGHT_POP_MS + FLIGHT_WINDUP_MS + FLIGHT_LAUNCH_MS;
    const o = (ms) => ms / total;
    // the flight itself: a shallow curve, bowing away from straight a
    // touch, fastest at first and easing into the button
    const frames = [
      { offset: 0, transform: at(start.clientX, start.clientY, 0, 0.45), opacity: 0, filter: "blur(0px)" },
      { offset: o(FLIGHT_POP_MS), transform: at(p0.x, p0.y, 0, 1), opacity: 1, filter: "blur(0px)", easing: "cubic-bezier(0.35, 0, 0.25, 1)" },
      { offset: o(FLIGHT_POP_MS + FLIGHT_WINDUP_MS * 0.4), transform: at(p0.x + (wind.x - p0.x) * 0.5, p0.y + (wind.y - p0.y) * 0.5, tilt * 0.45, 1.03), opacity: 1, filter: "blur(0px)" },
      { offset: o(FLIGHT_POP_MS + FLIGHT_WINDUP_MS), transform: at(wind.x, wind.y, tilt, 1.04), opacity: 1, filter: "blur(0px)", easing: "cubic-bezier(0.3, 0, 0.2, 1)" },
    ];
    const bow = Math.min(60, distance * 0.12);
    const STEPS = 10;
    for (let i = 1; i <= STEPS; i++) {
      const t = i / STEPS;
      const e = 1 - (1 - t) ** 2.4;
      const sideways = bow * Math.sin(Math.PI * e);
      const x = wind.x + (target.x - wind.x) * e - uy * sideways * Math.sign(tilt);
      const y = wind.y + (target.y - wind.y) * e + ux * sideways * Math.sign(tilt);
      frames.push({
        offset: o(FLIGHT_POP_MS + FLIGHT_WINDUP_MS + FLIGHT_LAUNCH_MS * t),
        transform: at(x, y, tilt * (1 - e), 1.04 - 0.66 * e),
        opacity: t < 0.55 ? 1 : Math.max(0, 1 - (t - 0.55) / 0.45),
        filter: `blur(${(Math.max(0, t - 0.45) * 4).toFixed(2)}px)`,
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

  let lastPointer = null;

  function flyDownloadRows() {
    const Downloads = window.Downloads;
    if (!Downloads?.getList) {
      return;
    }
    // (over the page too: the browser window sees the pointer move before
    // the page does)
    const track = (event) => {
      lastPointer = { clientX: event.clientX, clientY: event.clientY };
    };
    for (const type of ["mousemove", "mousedown", "mouseup"]) {
      document.addEventListener(type, track, { capture: true, passive: true });
    }
    Downloads.getList(Downloads.ALL)
      .then((list) => {
        downloadFlightOn = true;
        list.addView({
          onDownloadAdded(download) {
            try {
              // (only one just started, here, and not those listed on startup)
              const fresh = !download.succeeded && Date.now() - (download.startTime?.getTime?.() ?? 0) < 5000;
              // where the pointer is now (a save dialog in between, the
              // last click was the menu's, back where the menu was)
              const start = lastPointer || window.gZenUIManager?._lastClickPosition;
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
