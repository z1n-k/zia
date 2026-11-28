// uses: film.js
// uses: promo/set.js
// 10 Light, close-up (run at devPixelsPerPx 2.5 with ui.systemUsesDarkTheme 0): folders in
// colour and the spring.
const set = await dressSet();
gBrowser.selectedTab = set.tabs[0];
const folder = set.folder;
await realWait(1000);
const r = document.getElementById("navigator-toolbox").getBoundingClientRect();
const top = Math.round(document.getElementById("zen-sidebar-top-buttons").getBoundingClientRect().bottom);
const SIDE = { x: 0, y: top, width: Math.round(r.right + 4), height: Math.round(r.bottom - top) };
let cues = {};
["blue", "pink", "amber", "green", "white", "purple"].forEach((colour, i) => (cues[0.15 + i * 0.32] = async () => {
  const prefs = JSON.parse(Services.prefs.getStringPref("zia.folder-colors", "{}"));
  prefs[folder.id] = colour;
  Services.prefs.setStringPref("zia.folder-colors", JSON.stringify(prefs));
  folder.setAttribute("zia-folder-color", colour);
  await realWait(60);
}));
cues[2.3] = () => { folder.collapsed = true; };
cues[3.2] = () => { folder.collapsed = false; };
await film("10-folders", 4.0, cues, SIDE);
done({ checks: {} });
