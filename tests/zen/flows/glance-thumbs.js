// A page glanced at from a tab: Zia draws a small picture of it on the tab, cut off where the tab
// ends; closing the glance sinks the picture back into the tab. With the setting off, the styles'
// mark says so.
const [a] = await addTabs(["A"]);
gBrowser.selectedTab = a;
await wait(500);
const glanceUrl = "data:text/html,<title>Peek</title><body style='background:red'>Peek";
gZenGlanceManager.openGlance({ url: glanceUrl, clientX: 400, clientY: 300, width: 10, height: 10, triggeringPrincipal: SYSTEM });
await wait(2500);
const glance = gBrowser.tabs.find((tab) => tab.hasAttribute("zen-glance-tab"));
const canvas = glance?.querySelector(":scope > .tab-stack > .zia-glance-thumb");
const open = {
  on: nameOf(glance?.parentElement?.closest(".tabbrowser-tab")),
  thumb: glance?.getAttribute("zia-glance-thumb"),
  canvas: canvas ? [canvas.width, canvas.height] : null,
  cuts: glance ? Object.fromEntries([...glance.style].filter((name) => name.startsWith("--zia-glance-cut")).sort().map((name) => [name, glance.style.getPropertyValue(name)])) : null,
};
gZenGlanceManager.closeGlance();
await wait(100);
const exit = document.querySelector(".zia-glance-thumb-exit");
const closing = {
  exitOn: nameOf(exit?.closest(".tabbrowser-tab")),
  copy: exit ? [...exit.querySelectorAll("*")].map((el) => el.className) : null,
};
await wait(2000);
const closed = {
  glances: gBrowser.tabs.filter((tab) => tab.hasAttribute("zen-glance-tab")).length,
  exits: document.querySelectorAll(".zia-glance-thumb-exit").length,
  tabs: listOrder(),
};
const flags = [document.documentElement.hasAttribute("zia-glance-thumb-off")];
Services.prefs.setBoolPref("zia.glance.thumbnail", false);
await wait(200);
flags.push(document.documentElement.hasAttribute("zia-glance-thumb-off"));
Services.prefs.clearUserPref("zia.glance.thumbnail");
await wait(200);
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
