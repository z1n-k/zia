  // A page glanced at from an essential shows as a small card fanned out from
  // behind the essential's icon (zia-essential-glance in chrome.css). It
  // springs out from the icon in CSS; closing, Zen takes the glance's tab away
  // at once, so a stand-in card is drawn in its place and sucked back into the
  // icon.
  function suckInEssentialGlances() {
    const SUCK_MS = 220;
    const OUT_MS = 400;
    const sprung = new WeakSet();

    // Out: once per glance. Zen restyles the tab more than once as it opens
    // it, which would replay a CSS animation, so it's played from here.
    const springOut = (tab) => {
      if (sprung.has(tab) || !tab.hasAttribute("zen-glance-tab") ||
          !tab.parentElement?.closest(".tabbrowser-tab[zen-essential]")) {
        return;
      }
      sprung.add(tab);
      tab.setAttribute("zia-glance-shown", "true");
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }
      tab.animate(
        [
          { translate: "-26px 0", scale: 0.12, rotate: "0deg", opacity: 0 },
          { opacity: 1, offset: 0.2 },
          { translate: "0 0", scale: 1, rotate: "6deg", opacity: 1 },
        ],
        { duration: OUT_MS, easing: "cubic-bezier(0.3, 1.4, 0.5, 1)" }
      );
    };
    new MutationObserver((records) => {
      for (const record of records) {
        springOut(record.target);
      }
    }).observe(gBrowser.tabContainer, { subtree: true, attributes: true, attributeFilter: ["zen-glance-tab"] });
    // any glance already open when Zia starts just shows
    for (const tab of gBrowser.tabContainer.querySelectorAll(".tabbrowser-tab[zen-glance-tab]")) {
      sprung.add(tab);
      tab.setAttribute("zia-glance-shown", "true");
    }

    gBrowser.tabContainer.addEventListener("GlanceClose", (event) => {
      const glanceTab = event.target;
      const content = glanceTab?.parentElement;
      const essential = content?.closest(".tabbrowser-tab[zen-essential]");
      if (!essential || !content.classList.contains("tab-content")) {
        return;
      }
      glanceTab.style.visibility = "hidden";
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }
      const ghost = document.createXULElement("hbox");
      ghost.className = "zia-glance-ghost";
      const icon = document.createXULElement("image");
      icon.className = "zia-glance-ghost-icon";
      const src = glanceTab.querySelector(".tab-icon-image")?.getAttribute("src");
      if (src) {
        icon.setAttribute("src", src);
      }
      ghost.append(icon);
      content.append(ghost);
      const easing = "cubic-bezier(0.55, 0, 0.8, 0.2)";
      ghost.animate(
        [
          { translate: "0 0", scale: 1, rotate: "6deg" },
          { translate: "-26px 0", scale: 0.12, rotate: "0deg" },
        ],
        { duration: SUCK_MS, easing, fill: "forwards" }
      );
      ghost
        .animate([{ opacity: 1 }, { opacity: 0 }], { duration: 100, delay: SUCK_MS - 100, fill: "forwards" })
        .finished.catch(() => {})
        .then(() => ghost.remove());
    });
  }

