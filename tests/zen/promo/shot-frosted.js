// uses: film.js
// uses: promo/set.js
// 6 Frosted: compact mode's sidebar over a photo, frosted; Tahoe glass on the essentials.
const set = await dressSet();
gBrowser.selectedTab = set.tabs[1];
await realWait(1500);
gZenCompactModeManager.toggle();
await realWait(1800);
let cues = {};
pointTo(700, 400);
cues[0.3] = async () => { gZenCompactModeManager.toggleSidebar(); await realWait(100); };
cues[1.9] = async () => { gZenCompactModeManager.toggleSidebar(); await realWait(100); };
await film("6-compact", 3.0, cues);
gZenCompactModeManager.toggle();
await realWait(1800);
// Tahoe glass: the essentials edged in light, a hover lighting one up
Services.prefs.setBoolPref("zia.glass", true);
await realWait(1500);
const tiles = set.essentials;
cues = {};
pointTo(spot(tiles[0]).x, spot(tiles[0]).y + 200);
let t = 0.2;
for (const tile of tiles) {
  t = glide(cues, t, spot(tile), 0.25);
  t += 0.15;
}
await film("6-glass", t + 0.6, cues, { x: 0, y: 0, width: Math.round(document.getElementById("navigator-toolbox").getBoundingClientRect().right + 4), height: 360 });
Services.prefs.clearUserPref("zia.glass");
done({ checks: {} });
