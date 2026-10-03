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
