  // A page glanced at from an essential: a small card springs out from behind its
  // icon (CSS) and, as Zen takes the tab away at once, a stand-in is sucked back in.
  // Used elsewhere: suckInEssentialGlances.
  const ESSENTIAL_GLANCE_SUCK_MS = 220;
  const ESSENTIAL_GLANCE_OUT_MS = 400;
  // (the stand-in fades over the end of its suck)
  const ESSENTIAL_GLANCE_FADE_MS = 100;
  const sprungGlances = new WeakSet();

  // Out: once per glance. Zen restyles the tab more than once as it opens
  // it, which would replay a CSS animation, so it's played from here.
  function springOutGlance(tab) {
    if (sprungGlances.has(tab) || !tab.hasAttribute("zen-glance-tab") ||
        !tab.parentElement?.closest(".tabbrowser-tab[zen-essential]")) {
      return;
    }
    sprungGlances.add(tab);
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
      { duration: ESSENTIAL_GLANCE_OUT_MS, easing: "cubic-bezier(0.3, 1.4, 0.5, 1)" }
    );
  }

  function suckInGlance(event) {
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
      { duration: ESSENTIAL_GLANCE_SUCK_MS, easing, fill: "forwards" }
    );
    ghost
      .animate([{ opacity: 1 }, { opacity: 0 }], { duration: ESSENTIAL_GLANCE_FADE_MS, delay: ESSENTIAL_GLANCE_SUCK_MS - ESSENTIAL_GLANCE_FADE_MS, fill: "forwards" })
      .finished.catch(() => {})
      .then(() => ghost.remove());
  }

  function suckInEssentialGlances() {
    new MutationObserver((records) => {
      for (const record of records) {
        springOutGlance(record.target);
      }
    }).observe(gBrowser.tabContainer, { subtree: true, attributes: true, attributeFilter: ["zen-glance-tab"] });
    // any glance already open when Zia starts just shows
    for (const tab of gBrowser.tabContainer.querySelectorAll(".tabbrowser-tab[zen-glance-tab]")) {
      sprungGlances.add(tab);
      tab.setAttribute("zia-glance-shown", "true");
    }

    gBrowser.tabContainer.addEventListener("GlanceClose", suckInGlance);
  }
