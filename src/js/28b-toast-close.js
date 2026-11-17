  // Zen's toasts (the little notes up in the corner, like "Copied") go away
  // on a timer that stops while the mouse is over them. Zia gives each one
  // a small ✕ to close it straight away, with the same fade Zen uses.
  function addToastCloseButtons() {
    const container = document.getElementById("zen-toast-container");
    if (!container) {
      return;
    }
    const close = (toast) => {
      toast.animate(
        [
          { opacity: 1, scale: 1 },
          { opacity: 0, scale: 0.5 },
        ],
        { duration: 200, easing: "ease-in", fill: "forwards" }
      ).finished.then(() => {
        toast.remove();
        if (!container.children.length) {
          container.setAttribute("hidden", "true");
        }
      });
    };
    const addTo = (toast) => {
      if (!toast.classList?.contains("zen-toast") || toast.querySelector(".zia-toast-close")) {
        return;
      }
      const button = document.createElementNS(XHTML_NS, "button");
      button.className = "zia-toast-close";
      button.title = "Close";
      button.setAttribute("aria-label", "Close");
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        close(toast);
      });
      toast.append(button);
    };
    for (const toast of container.children) {
      addTo(toast);
    }
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          addTo(node);
        }
      }
      // (once it's laid out: Zen shows the container as the toast goes in)
      requestAnimationFrame(() => placeToasts(container));
    }).observe(container, { childList: true });
  }

  // Zen puts its toasts a few pixels from the top of the page. Where the
  // toolbar stays across the top over that corner (Windows' single toolbar
  // keeps a row there for the extensions and window buttons), the toast
  // came up underneath it, cut off; it sits just below the toolbar instead.
  const TOAST_TOOLBAR_GAP = 6;
  const TOAST_HEIGHT = 48; // (about a toast's height)
  function placeToasts(container) {
    container.style.removeProperty("margin-top");
    const bar = document.getElementById("nav-bar")?.getBoundingClientRect();
    // (the container has no size: the toasts hang from its corner, where they
    // land once they've slid in; measured mid-slide they're elsewhere)
    const corner = container.getBoundingClientRect();
    if (!bar?.height || !container.children.length) {
      return;
    }
    const across = bar.left <= corner.left && bar.right >= corner.left;
    if (across && bar.top < corner.top + TOAST_HEIGHT && bar.bottom + TOAST_TOOLBAR_GAP > corner.top) {
      container.style.setProperty("margin-top", `${Math.ceil(bar.bottom + TOAST_TOOLBAR_GAP - corner.top)}px`);
    }
  }
