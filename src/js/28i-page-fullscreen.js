  // A page gone full screen inside the window (a YouTube video) is shown square,
  // edge to edge: it kept the page's rounded card, grey behind the video's corners.
  function watchPageFullscreen() {
    const update = () => setFlag("zia-page-fullscreen", !!document.fullscreenElement);
    const soon = () => requestAnimationFrame(update);
    window.addEventListener("MozDOMFullscreen:Entered", soon);
    window.addEventListener("MozDOMFullscreen:Exited", soon);
    document.addEventListener("fullscreenchange", soon);
    update();
  }
