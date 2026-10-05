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
  // In its place a small glass row, the file's icon and name, pops up where
  // you clicked with a little wobble, then arcs off to the Library button,
  // shrinking and tilting with the curve, and the button gives a nudge as
  // it lands. Zen's own switch for its animation turns this off too.
  let downloadFlightOn = false;
  const FLIGHT_MS = 720;
  const FLIGHT_POP_MS = 260;

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

  function flyDownloadRow(download, start) {
    const target = flightTarget();
    if (!target) {
      return;
    }
    const name = flightName(download);
    const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
    const row = document.createElementNS(XHTML_NS, "div");
    row.id = "zia-download-flight";
    const icon = document.createElementNS(XHTML_NS, "img");
    icon.className = "zia-df-icon";
    icon.src = `moz-icon://${ext || ".bin"}?size=16`;
    const label = document.createElementNS(XHTML_NS, "span");
    label.className = "zia-df-name";
    label.textContent = name;
    row.append(icon, label);
    document.getElementById("zia-download-flight")?.remove();
    root.appendChild(row);

    const { width, height } = row.getBoundingClientRect();
    // (the row's middle sits just above where you clicked, kept on screen)
    const x0 = Math.min(window.innerWidth - width / 2 - 8, Math.max(width / 2 + 8, start.clientX));
    const y0 = Math.min(window.innerHeight - height / 2 - 8, Math.max(height / 2 + 8, start.clientY - 18));
    const dx = target.x - x0;
    const dy = target.y - y0;
    // an arc up and over, as a thrown thing goes, as high as there's room
    const lift = Math.min(160, Math.hypot(dx, dy) * 0.32, Math.max(0, Math.min(y0, target.y) - 16));
    const at = (t) => {
      const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      return { x: dx * e, y: dy * e - lift * 4 * e * (1 - e), e };
    };
    const frames = [];
    const STEPS = 24;
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS;
      const { x, y, e } = at(t);
      const ahead = at(Math.min(1, t + 0.04));
      // tilting into the curve, its leading end up as it climbs and down as
      // it falls, a few degrees at most (whichever way it's flying)
      const vx = ahead.x - x;
      const climb = (Math.atan2(ahead.y - y, Math.abs(vx) || 0.001) * 180) / Math.PI;
      const tilt = Math.max(-10, Math.min(10, climb * 0.25)) * (vx < 0 ? -1 : 1);
      frames.push({
        offset: t,
        transform: `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${tilt}deg) scale(${1 - 0.78 * e})`,
        opacity: t < 0.85 ? 1 : 1 - (t - 0.85) / 0.15,
      });
    }

    row.style.left = `${x0}px`;
    row.style.top = `${y0}px`;
    const pop = row.animate(
      [
        { transform: "translate(-50%, -50%) rotate(-5deg) scale(0.6)", opacity: 0 },
        { transform: "translate(-50%, -50%) rotate(3deg) scale(1.06)", opacity: 1, offset: 0.6 },
        { transform: "translate(-50%, -50%) rotate(0deg) scale(1)", opacity: 1 },
      ],
      { duration: FLIGHT_POP_MS, easing: "cubic-bezier(0.2, 0.9, 0.3, 1)", fill: "forwards" }
    );
    pop.finished
      .then(() => row.animate(frames, { duration: FLIGHT_MS, delay: 140, easing: "linear", fill: "forwards" }).finished)
      .then(() => {
        row.remove();
        target.button.animate(
          [{ transform: "scale(1)" }, { transform: "scale(1.18)", offset: 0.4 }, { transform: "scale(1)" }],
          { duration: 360, easing: "cubic-bezier(0.3, 1.4, 0.5, 1)" }
        );
      })
      .catch(() => row.remove());
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
