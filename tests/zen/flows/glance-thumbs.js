// A page glanced at from a tab: Zia draws a small picture of it on the tab, cut off where the tab
// ends; closing the glance sinks the picture back into the tab. With the setting off, the styles'
// mark says so.
const [a] = await addTabs(["A"]);
gBrowser.selectedTab = a;
await until(() => a.linkedBrowser.docShellIsActive);
await atRest();
const glanceUrl = "data:text/html,<title>Peek</title><body style='background:red'>Peek";
gZenGlanceManager.openGlance({ url: glanceUrl, clientX: 400, clientY: 300, width: 10, height: 10, triggeringPrincipal: SYSTEM });
const glanceTab = () => gBrowser.tabs.find((tab) => tab.hasAttribute("zen-glance-tab"));
// (its picture taken, and taken again a few times as the page comes in, up to a second and a
// half after it opens: read once that's held still a while)
await until(() => glanceTab()?.getAttribute("zia-glance-thumb") === "true" && glanceTab().querySelector(":scope > .tab-stack > .zia-glance-thumb"));
const glance = glanceTab();
const open = await steady(() => {
  const canvas = glance?.querySelector(":scope > .tab-stack > .zia-glance-thumb");
  return {
    on: nameOf(glance?.parentElement?.closest(".tabbrowser-tab")),
    thumb: glance?.getAttribute("zia-glance-thumb"),
    canvas: canvas ? [canvas.width, canvas.height] : null,
    cuts: glance ? Object.fromEntries([...glance.style].filter((name) => name.startsWith("--zia-glance-cut")).sort().map((name) => [name, glance.style.getPropertyValue(name)])) : null,
  };
}, { quiet: 1000 });
// (the sinking picture read as it's put in: it's gone once it has sunk)
let closing = null;
const watcher = new MutationObserver(() => {
  const exit = document.querySelector(".zia-glance-thumb-exit");
  if (exit && !closing) {
    closing = {
      exitOn: nameOf(exit.closest(".tabbrowser-tab")),
      copy: [...exit.querySelectorAll("*")].map((el) => el.className),
    };
  }
});
watcher.observe(document.documentElement, { childList: true, subtree: true });
gZenGlanceManager.closeGlance();
await until(() => closing);
await until(() => !glanceTab() && !document.querySelector(".zia-glance-thumb-exit"));
await atRest();
watcher.disconnect();
const closed = {
  glances: gBrowser.tabs.filter((tab) => tab.hasAttribute("zen-glance-tab")).length,
  exits: document.querySelectorAll(".zia-glance-thumb-exit").length,
  tabs: listOrder(),
};
const flags = [document.documentElement.hasAttribute("zia-glance-thumb-off")];
Services.prefs.setBoolPref("zia.glance.thumbnail", false);
await until(() => document.documentElement.hasAttribute("zia-glance-thumb-off"));
flags.push(document.documentElement.hasAttribute("zia-glance-thumb-off"));
Services.prefs.clearUserPref("zia.glance.thumbnail");
await until(() => !document.documentElement.hasAttribute("zia-glance-thumb-off"));
flags.push(document.documentElement.hasAttribute("zia-glance-thumb-off"));
done({
  open,
  closing,
  closed,
  flags,
  checks: {
    "the glance shows its picture": open.thumb === "true" && !!open.canvas,
    "it sinks into its tab on close": closing.exitOn === "A",
    "and is gone after": closed.glances === 0 && closed.exits === 0,
    "the setting marks the window": flags.join() === "false,true,false",
  },
  ziaErrors: ziaErrors(),
});
