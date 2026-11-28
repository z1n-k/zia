// uses: film.js
// uses: promo/set.js
// 2 Address bar: the pop-up opening, an address typed, the site's icon in place of the magnifier.
const set = await dressSet();
gBrowser.selectedTab = set.tabs[0];
await realWait(1500);
const cues = {};
cues[0.3] = async () => { EU.synthesizeKey("l", { accelKey: true }, window); await realWait(150); };
let t = 0.9;
for (const ch of "github.com/z1n-k/zia") {
  cues[t] = async () => { EU.sendString(ch, window); await realWait(60); };
  t += 0.055;
}
cues[t + 1.3] = async () => { EU.synthesizeKey("KEY_Escape", {}, window); EU.synthesizeKey("KEY_Escape", {}, window); };
await film("2-urlbar", t + 2.0, cues);

// typing a tab that's open: Switch to tab
const cues2 = {};
cues2[0.2] = async () => { EU.synthesizeKey("l", { accelKey: true }, window); await realWait(150); };
t = 0.7;
for (const ch of "aurora") {
  cues2[t] = async () => { EU.sendString(ch, window); await realWait(80); };
  t += 0.07;
}
cues2[t + 1.4] = async () => { EU.synthesizeKey("KEY_Escape", {}, window); EU.synthesizeKey("KEY_Escape", {}, window); };
await film("2-switch", t + 2.0, cues2);
done({ checks: {} });
