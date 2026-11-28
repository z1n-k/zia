// uses: film.js
// uses: promo/set.js
// 10 Light (run with ui.systemUsesDarkTheme 0): the toolbar's colour, a hover card, the
// address pop-up, in light.
const set = await dressSet();
const order = [set.tabs[1], set.tabs[0], set.tabs[3], set.essentials[1]];
for (const tab of order) {
  gBrowser.selectedTab = tab;
  await realWait(1800);
}
gBrowser.selectedTab = order[0];
await realWait(1800);
let cues = {};
pointTo(spot(order[0]).x, spot(order[0]).y + 60);
let t = 0.3;
for (const tab of order.slice(1)) {
  t = glide(cues, t, spot(tab, 0.35), 0.28);
  cues[t] = async () => { click(); await realWait(200); };
  t += 0.5;
}
await film("10-colour", t + 0.3, cues);

cues = {};
pointTo(900, 650);
t = glide(cues, 0.2, spot(set.tabs[2], 0.5), 0.35);
cues[t] = async () => { await realWait(700); };
t = glide(cues, t + 0.9, spot(set.tabs[1], 0.5), 0.25);
cues[t] = async () => { await realWait(150); };
await film("10-hover", t + 1.0, cues);

cues = {};
cues[0.2] = async () => { EU.synthesizeKey("l", { accelKey: true }, window); await realWait(150); };
t = 0.7;
for (const ch of "linear.app") {
  cues[t] = async () => { EU.sendString(ch, window); await realWait(60); };
  t += 0.06;
}
cues[t + 1.1] = async () => { EU.synthesizeKey("KEY_Escape", {}, window); EU.synthesizeKey("KEY_Escape", {}, window); };
await film("10-urlbar", t + 1.6, cues);
done({ checks: {} });
