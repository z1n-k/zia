// A page glanced at from an essential: the glance's tab springs out from the essential (played
// from Zia, once). Closing it would suck a stand-in back in, but Zen 1.24 has moved the glance
// out of the essential by the time it says it's closed, so none shows (recorded as it is).
const [a, b] = await addTabs(["A", "B"]);
gZenPinnedTabManager.addToEssentials(b);
await until(() => b.hasAttribute("zen-essential"));
await atRest();
gBrowser.selectedTab = b;
await until(() => b.linkedBrowser.docShellIsActive);
await atRest();
let seenGhost = null;
const watcher = new MutationObserver(() => {
  const ghost = document.querySelector(".zia-glance-ghost");
  if (ghost && !seenGhost) {
    seenGhost = { in: ghost.parentElement.className, icon: ghost.firstElementChild?.className, animations: ghost.getAnimations().map((animation) => animation.effect.getTiming().duration) };
  }
});
watcher.observe(gBrowser.tabContainer, { childList: true, subtree: true });
const glanceTab = () => gBrowser.tabs.find((tab) => tab.hasAttribute("zen-glance-tab"));
// (watched from when the glance's tab is in, which Zen makes as it opens)
const springs = await animationsDuring(async () => {
  gZenGlanceManager.openGlance({ url: "data:text/html,<title>Peek</title>Peek", clientX: 400, clientY: 300, width: 10, height: 10, triggeringPrincipal: SYSTEM });
  await until(glanceTab);
}, 1500);
await until(() => glanceTab()?.getAttribute("zia-glance-shown"));
const glance = glanceTab();
const open = {
  on: nameOf(glance?.parentElement?.closest(".tabbrowser-tab")),
  shown: glance?.getAttribute("zia-glance-shown"),
  // (Zia's spring, the one that turns: Zen's own on the tab come and go with its timing; and
  // without the tab's name, which is its address or its title by then)
  springs: springs.filter((line) => line.startsWith("tab:") && line.includes("rotate:")).map((line) => line.replace(/^tab:\S+ /, "tab ")),
};
gZenGlanceManager.closeGlance({ onTabClose: true });
await until(() => !glanceTab() && !document.querySelector(".zia-glance-ghost"));
await atRest();
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
