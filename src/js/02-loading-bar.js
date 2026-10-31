  // The address bar's loading line: an estimate that creeps toward 90% while a page loads,
  // overtaken by the real progress when there is some, then run out to the end and faded.
  // Used elsewhere: startLoader, reportRealProgress, finishLoader, cancelLoader.
  const LOADER_HIDE_MS = 150;
  const LOADER_ESTIMATE_MS = 250;

  const loader = {
    shown: 0,
    target: 0,
    active: false,
    finishing: false,
    estimateTimer: null,
    hideTimer: null,
    frame: null,
  };

  function urlbarElement() {
    return gURLBar.textbox || document.getElementById("urlbar");
  }

  function drawProgress() {
    urlbarElement()?.style.setProperty("--zia-load-progress", loader.shown.toFixed(4));
  }

  function animateLoader() {
    loader.frame = null;
    const diff = loader.target - loader.shown;
    const next = loader.shown + (Math.abs(diff) < 0.001 ? diff : diff * (loader.finishing ? 0.3 : 0.12));
    loader.shown = Math.max(loader.shown, next);
    drawProgress();
    if (loader.finishing && loader.shown >= 0.999) {
      loader.finishing = false;
      loader.hideTimer = setTimeout(() => setFlag("zia-loading", false), LOADER_HIDE_MS);
      return;
    }
    if (loader.active || loader.finishing) {
      loader.frame = requestAnimationFrame(animateLoader);
    }
  }

  function runLoader() {
    if (!loader.frame) {
      loader.frame = requestAnimationFrame(animateLoader);
    }
  }

  function stopLoaderTimers() {
    clearInterval(loader.estimateTimer);
    clearTimeout(loader.hideTimer);
    loader.estimateTimer = null;
    loader.hideTimer = null;
  }

  function startLoader(from = 0.02, fresh = false) {
    const stillShowing = loader.active || loader.finishing || root.hasAttribute("zia-loading");
    stopLoaderTimers();
    loader.active = true;
    loader.finishing = false;
    if (fresh || !stillShowing) {
      loader.shown = from;
      loader.target = Math.max(from, 0.25);
      drawProgress();
    } else {
      loader.target = Math.max(loader.target, loader.shown, from);
    }
    setFlag("zia-loading", true);
    loader.estimateTimer = setInterval(() => {
      if (loader.target < 0.9) {
        loader.target += (0.9 - loader.target) * 0.06;
      }
    }, LOADER_ESTIMATE_MS);
    runLoader();
  }

  function reportRealProgress(fraction) {
    if (loader.active && fraction > loader.target) {
      loader.target = Math.min(0.95, fraction);
    }
  }

  function finishLoader() {
    if (!loader.active) {
      return;
    }
    stopLoaderTimers();
    loader.active = false;
    loader.finishing = true;
    loader.target = 1;
    runLoader();
  }

  function cancelLoader() {
    stopLoaderTimers();
    loader.active = false;
    loader.finishing = false;
    setFlag("zia-loading", false);
  }

