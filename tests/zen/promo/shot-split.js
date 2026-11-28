// uses: film.js
// uses: promo/set.js
// 7 Split: a tab dragged onto the page, the drop cards rising either side, the split landing,
// each side in its own colour.
const set = await dressSet();
gBrowser.selectedTab = set.tabs[0];
await realWait(1500);
const source = set.tabs[1];
const panels = gBrowser.tabpanels.getBoundingClientRect();
const cues = {};
pointTo(spot(source, 0.3).x, spot(source).y);
cues[0.15] = async () => { dragFrom(source); };
let t = glide(cues, 0.2, { x: panels.left + panels.width * 0.55, y: panels.top + panels.height * 0.5 }, 0.55);
t = glide(cues, t + 0.15, { x: panels.left + panels.width * 0.82, y: panels.top + panels.height * 0.52 }, 0.45);
cues[t + 0.5] = async () => { dropHere(); await realWait(300); };
await film("7-split", t + 2.4, cues);
done({ checks: {} });
