
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
    }).observe(container, { childList: true });
  }
