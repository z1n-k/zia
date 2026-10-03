  // Smoother motion (Settings → Sine Mods → Zia → Features, experimental,
  // off by default):
  // a swipe between spaces moves as one (smoothSpaceSwipe, below) rather
  // than in jumps, and pages scroll with Firefox's smoother
  // easing, closer to Chrome's and macOS's own: it eases out as a flick
  // does, where Firefox's usual one stops short. Firefox's easing is a
  // setting of its own (general.smoothScroll.msdPhysics.enabled); Zia only
  // turns it on if it hadn't been set, and turns it back off with the
  // option only if it was Zia that turned it on.
  const SMOOTH_PREF = "zia.motion.smooth";
  const SCROLL_PHYSICS_PREF = "general.smoothScroll.msdPhysics.enabled";
  const SCROLL_PHYSICS_OURS = "zia.motion.smooth-scroll-set";

  // Swiping between spaces: Zen moves the spaces, the essentials and the
  // space colour's fade straight to each trackpad update as it comes, from
  // one call (_organizeWorkspaceStripLocations), so they moved in jumps, at
  // whatever pace the updates came. While the fingers are down, that call
  // is taken over: each update only sets where the strip is heading, and
  // every frame the strip eases a little of the way there and Zen places
  // everything from that one value, so the spaces, the essentials and the
  // colour move together, at the display's pace. Once the fingers lift,
  // Zen's own slide takes it from wherever it got to.
  const SWIPE_EASE_MS = 45;

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
    let target = 0;
    let shown = 0;
    let space = null;
    let frame = 0;
    let last = 0;
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };
    const swiping = () => !!spaces._swipeManager?.isGestureActive && !spaces._animatingChange && !spaces.isChangingWorkspace;
    const step = (now) => {
      frame = 0;
      if (!swiping() || !space) {
        return;
      }
      const dt = Math.min(64, now - (last || now - 16));
      last = now;
      shown += (target - shown) * (1 - Math.exp(-dt / SWIPE_EASE_MS));
      if (Math.abs(target - shown) < 0.3) {
        shown = target;
      }
      place.call(spaces, space, true, shown);
      if (shown !== target) {
        frame = requestAnimationFrame(step);
      }
    };
    const smooth = function (workspace, justMove = false, offsetPixels = 0, ...rest) {
      let on = false;
      try {
        on = Services.prefs.getBoolPref(SMOOTH_PREF, false);
      } catch (err) {
        on = false;
      }
      if (!on || !justMove || !swiping()) {
        stop();
        shown = target = offsetPixels || 0;
        last = 0;
        return place.call(this, workspace, justMove, offsetPixels, ...rest);
      }
      // (another space, or back across the middle: from where it's shown)
      space = workspace;
      target = offsetPixels || 0;
      if (!frame) {
        last = 0;
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

