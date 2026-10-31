  // The toolbar's own buttons in motion: back and forward, reload and stop.
  // Used elsewhere: animateNavButtons, springReloadHover.

  const NAV_SLIDE_MS = 420;
  const RELOAD_MORPH_MS = 450;
  // (once the grow-in from stop is over: a little past its morph)
  const RELOAD_GROWN_MS = 470;
  const RELOAD_HOVER_CUT = 20;
  const RELOAD_HOVER_MS = 380;

  // Restarts a CSS animation keyed on an attribute, then clears it.
  function replayAttribute(el, name, ms, value = "true") {
    el.removeAttribute(name);
    el.getBoundingClientRect();
    el.setAttribute(name, value);
    clearTimeout(el.ziaReplayTimers?.[name]);
    el.ziaReplayTimers = { ...el.ziaReplayTimers, [name]: setTimeout(() => el.removeAttribute(name), ms) };
  }

  // Back and forward slide through when clicked; reload and stop turn into
  // each other as a page starts and finishes loading (the motion itself is
  // in the CSS, keyed on these attributes).
  function animateNavButtons() {
    for (const id of ["back-button", "forward-button"]) {
      const button = document.getElementById(id);
      button?.addEventListener(
        "click",
        (event) => {
          if (event.button === 0 && !button.hasAttribute("disabled")) {
            replayAttribute(button, "zia-slide", NAV_SLIDE_MS);
          }
        },
        true
      );
    }
    const reload = document.getElementById("reload-button");
    const container = document.getElementById("stop-reload-button");
    if (!reload || !container) {
      return;
    }
    let showingStop = reload.hasAttribute("displaystop");
    new MutationObserver(() => {
      const now = reload.hasAttribute("displaystop");
      if (now === showingStop) {
        return;
      }
      showingStop = now;
      replayAttribute(container, "zia-morph", RELOAD_MORPH_MS, now ? "to-stop" : "to-reload");
      // Reload's hover look (its arrowhead drawn back) isn't kept while
      // stop's showing: coming back, reload grew in whole and then snapped
      // to that look. It springs into it once it's in, if still hovered.
      if (now) {
        reload.ziaReloadCut?.(0, true);
      } else {
        // (once the grow-in has let go of it: its animation holds the
        // arrowhead's turn until then, and eased in under it, it jumped
        // to wherever the ease had got to as the animation ended. Not cancelled, as it
        // checks it's still wanted)
        setTimeout(() => {
          if (!reload.hasAttribute("displaystop") && !container.hasAttribute("zia-morph") && container.matches(":hover")) {
            reload.ziaReloadCut?.(RELOAD_HOVER_CUT);
          }
        }, RELOAD_GROWN_MS);
      }
    }).observe(reload, { attributes: true, attributeFilter: ["displaystop"] });
  }

  // Reload on hover: the arrowhead draws back 20 degrees round the circle
  // and the arc shortens with it, on Zia's spring. The CSS reads the angle
  // from --zia-reload-cut, eased here frame by frame.

  function springReloadHover() {
    const button = document.getElementById("reload-button");
    if (!button) {
      return;
    }
    const ease = cubicBezier(0.3, 1.35, 0.5, 1);
    let cut = 0;
    let frame = 0;
    const setCut = (value) => {
      cut = value;
      button.style.setProperty("--zia-reload-cut", `${cut}deg`);
    };
    const go = (target, instant = false) => {
      cancelAnimationFrame(frame);
      if (instant || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setCut(target);
        return;
      }
      const from = cut;
      const start = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - start) / RELOAD_HOVER_MS);
        setCut(from + (target - from) * ease(t));
        if (t < 1) {
          frame = requestAnimationFrame(step);
        }
      };
      frame = requestAnimationFrame(step);
    };
    button.addEventListener("mouseenter", () => {
      // (not while it's coming back in from stop: that springs it after)
      if (!button.parentElement?.hasAttribute("zia-morph")) {
        go(RELOAD_HOVER_CUT);
      }
    });
    button.addEventListener("mouseleave", () => go(0));
    button.ziaReloadCut = go;
  }
