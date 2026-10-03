  // A page that's gone full screen (a YouTube video, say) is shown square
  // and edge to edge. Zen and Zia only count the window as full screen when
  // it takes over the screen; when a video goes full screen inside the
  // window instead, the page kept its rounded card, and the video's corners
  // were rounded off with grey behind them.
  function watchPageFullscreen() {
    const update = () => setFlag("zia-page-fullscreen", !!document.fullscreenElement);
    const soon = () => requestAnimationFrame(update);
    window.addEventListener("MozDOMFullscreen:Entered", soon);
    window.addEventListener("MozDOMFullscreen:Exited", soon);
    document.addEventListener("fullscreenchange", soon);
    update();
  }

  // The page's corners (Settings): Zia's, following the window's own corner
  // (its radius less the gap round the page, so the page sits evenly inside
  // the window's curve), small, or square
  const PAGE_CORNERS_PREF = "zia.page.corners";
  const PAGE_CORNERS = ["window", "small", "square"];

  function watchPageCorners() {
    const show = () => {
      const value = Services.prefs.getStringPref(PAGE_CORNERS_PREF, "zia");
      if (PAGE_CORNERS.includes(value)) {
        root.setAttribute("zia-page-corners", value);
      } else {
        root.removeAttribute("zia-page-corners");
      }
    };
    show();
    Services.prefs.addObserver(PAGE_CORNERS_PREF, show);
    window.addEventListener("unload", () => Services.prefs.removeObserver(PAGE_CORNERS_PREF, show));
  }
