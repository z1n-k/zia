// The address centred in the toolbar (zia.urlbar.center-text): closed, its text shifts to the
// toolbar's middle; opened, it stays where it was; with the pop-up's text from the left, it
// doesn't shift once opened; and off, it doesn't shift at all
// (in the toolbar above the page: Zen's single toolbar keeps the address in the sidebar)
Services.prefs.setBoolPref("zen.view.use-single-toolbar", false);
await wait(1500);
const [a] = await addTabs(["A"]);
gBrowser.selectedTab = a;
await wait(800);
const urlbar = gURLBar.textbox || document.getElementById("urlbar");
const shift = () => urlbar.style.getPropertyValue("--zia-center-shift") || "none";
const open = async () => {
  EU.synthesizeMouseAtCenter(gURLBar.inputField, {}, window);
  await wait(700);
  return { open: urlbar.hasAttribute("breakout-extend"), shift: shift() };
};
const close = async () => {
  EU.synthesizeKey("KEY_Escape", {}, window);
  EU.synthesizeKey("KEY_Escape", {}, window);
  gBrowser.selectedBrowser.focus();
  await wait(700);
};
const off = shift();
Services.prefs.setBoolPref("zia.urlbar.center-text", true);
await wait(600);
const closed = shift();
const opened = await open();
await close();
const closedAgain = shift();
Services.prefs.setBoolPref("zia.urlbar.center-text.pop-up-left", true);
await wait(400);
const fromLeft = await open();
await close();
Services.prefs.clearUserPref("zia.urlbar.center-text.pop-up-left");
Services.prefs.clearUserPref("zia.urlbar.center-text");
await wait(600);
const offAgain = shift();
Services.prefs.clearUserPref("zen.view.use-single-toolbar");
await wait(800);
done({
  off,
  closed,
  opened,
  closedAgain,
  fromLeft,
  offAgain,
  checks: {
    "closed, the text shifts to the middle": closed !== "none",
    "opened, the bar opens": opened.open,
    "it shifts again once closed": closedAgain === closed,
    "off, nothing shifts": offAgain === "none",
  },
  ziaErrors: ziaErrors(),
});
