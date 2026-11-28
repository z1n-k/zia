// uses: film.js
// uses: promo/set.js
// 1 Colour: the toolbar takes each site's colour, tab to tab; back, forward and reload; a load.
const set = await dressSet();
const order = [set.tabs[0], set.tabs[1], set.essentials[0], set.folderTabs[0], set.tabs[3], set.essentials[1]];
for (const tab of order) {
  gBrowser.selectedTab = tab;
  await realWait(2000);
}
gBrowser.selectedTab = order[0];
await realWait(2000);
pointTo(spot(order[0]).x, spot(order[0]).y + 60);

// tab to tab, the pointer choosing each
let cues = {};
let t = 0.3;
for (const tab of order.slice(1)) {
  t = glide(cues, t, spot(tab, 0.35), 0.28);
  cues[t] = async () => { click(); await realWait(200); };
  t += 0.5;
}
await film("1-colour", t + 0.3, cues);

// back, forward, reload, the page loading (the thinking orb with Ultra)
const page = set.tabs[3];
gBrowser.selectedTab = page;
await realWait(1500);
const back = document.getElementById("back-button");
const reload = document.getElementById("reload-button");
cues = {};
pointTo(spot(back).x + 80, spot(back).y + 40);
t = glide(cues, 0.2, spot(back), 0.3);
t = glide(cues, t + 0.35, spot(document.getElementById("forward-button")), 0.25);
t = glide(cues, t + 0.35, spot(reload), 0.25);
cues[t + 0.3] = async () => { click(); };
await film("1-nav", t + 2.2, cues);
done({ checks: {} });
