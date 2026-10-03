  // Smoother motion (Settings → Sine Mods → Zia → Features, experimental,
  // off by default):
  // a swipe between spaces moves at the display's own rate (smoothSpaceSwipe,
  // below), and pages scroll with Firefox's smoother
  // easing, closer to Chrome's and macOS's own: it eases out as a flick
  // does, where Firefox's usual one stops short. Firefox's easing is a
  // setting of its own (general.smoothScroll.msdPhysics.enabled); Zia only
  // turns it on if it hadn't been set, and turns it back off with the
  // option only if it was Zia that turned it on.
  const SMOOTH_PREF = "zia.motion.smooth";
  const SCROLL_PHYSICS_PREF = "general.smoothScroll.msdPhysics.enabled";
  const SCROLL_PHYSICS_OURS = "zia.motion.smooth-scroll-set";

  // Swiping between spaces: Zen places the spaces, the essentials and the
  // space colour's fade (all from one call, _organizeWorkspaceStripLocations)
  // as each trackpad update comes, about 60 a second, so on a faster display
  // each place showed for two frames or more: a slow swipe moved in tiny
  // steps. While the fingers are down, each update instead becomes the end
  // of a short glide from where the strip is shown, as long as the updates
  // are apart, and every frame Zen places everything at that glide's point:
  // the strip moves evenly at the display's own rate, one update behind.
  // Once the fingers lift, Zen's own slide takes it from where it got to.
  function smoothSpaceSwipe() {
    const spaces = window.gZenWorkspaces;
    const place = spaces?._organizeWorkspaceStripLocations;
    if (typeof place !== "function") {
      // (Zen's spaces may not be set up yet this early)
      smoothSpaceSwipe.tries = (smoothSpaceSwipe.tries || 0) + 1;
      if (smoothSpaceSwipe.tries < 20) {
        setTimeout(smoothSpaceSwipe, 500);
      }
      return;
    }
    if (place.ziaSmooth) {
      return;
    }
    let space = null;
    let from = 0;
    let to = 0;
    let shown = 0;
    let at = 0;
    let gap = 16;
    let frame = 0;
    const swiping = () => !!spaces._swipeManager?.isGestureActive && !spaces._animatingChange;
    const step = (now) => {
      frame = 0;
      if (!swiping() || !space) {
        return;
      }
      const t = Math.min(1, Math.max(0, (now - at) / gap));
      shown = from + (to - from) * t;
      place.call(spaces, space, true, shown);
      if (t < 1) {
        frame = requestAnimationFrame(step);
      }
    };
    const smooth = function (workspace, justMove = false, offsetPixels = 0, ...rest) {
      if (!justMove || !swiping() || !Services.prefs.getBoolPref(SMOOTH_PREF, false)) {
        cancelAnimationFrame(frame);
        frame = 0;
        space = null;
        shown = to = offsetPixels || 0;
        return place.call(this, workspace, justMove, offsetPixels, ...rest);
      }
      const now = performance.now();
      // (the time between updates, steadied: the glide lasts one of them)
      if (space) {
        gap = gap * 0.6 + Math.min(40, Math.max(6, now - at)) * 0.4;
      }
      space = workspace;
      from = shown;
      to = offsetPixels || 0;
      at = now;
      if (!frame) {
        frame = requestAnimationFrame(step);
      }
      return undefined;
    };
    smooth.ziaSmooth = true;
    spaces._organizeWorkspaceStripLocations = smooth;
  }

  function watchSmoothMotion() {
    smoothSpaceSwipe();
    const apply = () => {
      try {
        const on = Services.prefs.getBoolPref(SMOOTH_PREF, false);
        const ours = Services.prefs.getBoolPref(SCROLL_PHYSICS_OURS, false);
        if (on && !ours && !Services.prefs.prefHasUserValue(SCROLL_PHYSICS_PREF)) {
          Services.prefs.setBoolPref(SCROLL_PHYSICS_PREF, true);
          Services.prefs.setBoolPref(SCROLL_PHYSICS_OURS, true);
        } else if (!on && ours) {
          Services.prefs.clearUserPref(SCROLL_PHYSICS_PREF);
          Services.prefs.setBoolPref(SCROLL_PHYSICS_OURS, false);
        }
      } catch (err) {
        noteError("smooth motion", err);
      }
    };
    apply();
    Services.prefs.addObserver(SMOOTH_PREF, apply);
    window.addEventListener("unload", () => Services.prefs.removeObserver(SMOOTH_PREF, apply), { once: true });
  }

