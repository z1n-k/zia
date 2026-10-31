// A page glanced at from an essential: the glance's tab springs out from the essential (played
// from Zia, once). Closing it would suck a stand-in back in, but Zen 1.24 has moved the glance
// out of the essential by the time it says it's closed, so none shows (recorded as it is).
const [a, b] = await addTabs(["A", "B"]);
gZenPinnedTabManager.addToEssentials(b);
await wait(800);
gBrowser.selectedTab = b;
await wait(800);
let seenGhost = null;
const watcher = new MutationObserver(() => {
  const ghost = document.querySelector(".zia-glance-ghost");
  if (ghost && !seenGhost) {
    seenGhost = { in: ghost.parentElement.className, icon: ghost.firstElementChild?.className, animations: ghost.getAnimations().map((animation) => animation.effect.getTiming().duration) };
  }
});
watcher.observe(gBrowser.tabContainer, { childList: true, subtree: true });
const springs = await animationsDuring(() => {
  gZenGlanceManager.openGlance({ url: "data:text/html,<title>Peek</title>Peek", clientX: 400, clientY: 300, width: 10, height: 10, triggeringPrincipal: SYSTEM });
}, 1500);
const glance = gBrowser.tabs.find((tab) => tab.hasAttribute("zen-glance-tab"));
const open = { on: nameOf(glance?.parentElement?.closest(".tabbrowser-tab")), shown: glance?.getAttribute("zia-glance-shown"), springs: springs.filter((line) => line.startsWith("tab:")) };
gZenGlanceManager.closeGlance({ onTabClose: true });
await wait(1500);
watcher.disconnect();
const closed = { glances: gBrowser.tabs.filter((tab) => tab.hasAttribute("zen-glance-tab")).length, ghosts: document.querySelectorAll(".zia-glance-ghost").length, ghost: seenGhost };
done({
  open,
  closed,
  checks: {
    "it opens from the essential": open.on === "B" && open.shown === "true",
    "springing out": open.springs.length > 0,
    "closed, it's gone": closed.glances === 0 && closed.ghosts === 0,
  },
  ziaErrors: ziaErrors(),
});
