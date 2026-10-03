  // Smoother motion (Settings → Sine Mods → Zia → Features, on by default):
  // a swipe between spaces glides from one trackpad update to the next
  // (zia.css) rather than jumping, and pages scroll with Firefox's smoother
  // easing, closer to Chrome's and macOS's own: it eases out as a flick
  // does, where Firefox's usual one stops short. Firefox's easing is a
  // setting of its own (general.smoothScroll.msdPhysics.enabled); Zia only
  // turns it on if it hadn't been set, and turns it back off with the
  // option only if it was Zia that turned it on.
  const SMOOTH_PREF = "zia.motion.smooth";
  const SCROLL_PHYSICS_PREF = "general.smoothScroll.msdPhysics.enabled";
  const SCROLL_PHYSICS_OURS = "zia.motion.smooth-scroll-set";

  function watchSmoothMotion() {
    const apply = () => {
      try {
        const on = Services.prefs.getBoolPref(SMOOTH_PREF, true);
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

