// Zia's rows in Sine's settings (about:preferences) shown only with the setting they belong to,
// read again as those settings change
const tab = gBrowser.addTab("about:preferences#sineMods", { triggeringPrincipal: SYSTEM });
gBrowser.selectedTab = tab;
await wait(5000);
const doc = tab.linkedBrowser.contentDocument;
const ROWS = ["zia-tab-numbers-always", "zia-tab-numbers-color", "zia-sidebar-hide-space-name", "zia-compact-toolbar-over-page", "zia-urlbar-center-text-pop-up-left"];
const shown = () => Object.fromEntries(ROWS.map((id) => [id, doc.getElementById(id)?.style.display ?? "missing"]));
const before = shown();
Services.prefs.setBoolPref("zia.features.tab-numbers", false);
Services.prefs.setBoolPref("zia.sidebar.space-name-in-list", true);
// (rows are checked as the page changes)
doc.getElementById("sineModsList").append(doc.createElement("div"));
await wait(500);
const changed = shown();
Services.prefs.clearUserPref("zia.features.tab-numbers");
Services.prefs.clearUserPref("zia.sidebar.space-name-in-list");
doc.getElementById("sineModsList").lastElementChild.remove();
await wait(500);
const back = shown();
done({
  before,
  changed,
  back,
  checks: {
    "the rows are there": Object.values(before).every((value) => value !== "missing"),
    "they follow their settings": changed["zia-tab-numbers-always"] !== before["zia-tab-numbers-always"],
    "and come back": JSON.stringify(back) === JSON.stringify(before),
  },
  ziaErrors: ziaErrors(),
});
