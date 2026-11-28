// uses: film.js
// uses: promo/set.js
// 3 Tabs and essentials: hover card, tab numbers, Cmd+Z, a tab dragged onto the essentials.
const set = await dressSet();
gBrowser.selectedTab = set.tabs[0];
await realWait(1500);

// hover cards, tab to tab
let cues = {};
pointTo(150, 700);
let t = glide(cues, 0.2, spot(set.tabs[1], 0.5), 0.35);
cues[t] = async () => { await realWait(700); };
t = glide(cues, t + 0.9, spot(set.tabs[2], 0.5), 0.25);
cues[t] = async () => { await realWait(150); };
t = glide(cues, t + 0.8, spot(set.tabs[3], 0.5), 0.25);
cues[t] = async () => { await realWait(150); };
t = glide(cues, t + 0.8, { x: 900, y: 650 }, 0.35);
await film("3-hover", t + 0.6, cues);

// hold Cmd: numbers; type 5; let go
cues = {};
cues[0.3] = async () => { EU.synthesizeKey("KEY_Meta", { type: "keydown" }, window); await realWait(100); };
cues[1.3] = async () => { EU.synthesizeKey("5", { type: "keydown", metaKey: true }, window); EU.synthesizeKey("5", { type: "keyup", metaKey: true }, window); await realWait(80); };
cues[1.9] = async () => { EU.synthesizeKey("KEY_Meta", { type: "keyup" }, window); await realWait(100); };
await film("3-numbers", 2.6, cues);

// a tab closed, and Cmd+Z brings it back
gBrowser.selectedTab = set.tabs[2];
await realWait(1200);
cues = {};
cues[0.3] = async () => { gBrowser.removeTab(gBrowser.selectedTab); await realWait(100); };
cues[1.2] = async () => { EU.synthesizeKey("z", { accelKey: true }, window); await realWait(150); };
await film("3-undo", 2.4, cues);

// a tab dragged up: the rows slide aside; over the essentials it becomes a tile
// (a tab still open: the one closed above came back as a new tab)
const source = gBrowser.tabs.find((tab) => tab.isConnected && !tab.pinned && !tab.hasAttribute("zen-essential") && !tab.group && tab.label.startsWith("MacBook"));
const essentials = document.querySelector(".zen-essentials-container");
cues = {};
pointTo(spot(source, 0.3).x, spot(source).y);
cues[0.2] = async () => { dragFrom(source); };
t = glide(cues, 0.25, { x: spot(source, 0.3).x, y: spot(set.tabs[0]).y - 6 }, 0.45);
// (into the open slot after the last tile)
const lastTile = [...essentials.querySelectorAll(".tabbrowser-tab[zen-essential]")].pop().getBoundingClientRect();
t = glide(cues, t + 0.25, { x: lastTile.right + lastTile.width * 0.6, y: lastTile.top + lastTile.height / 2 }, 0.5);
cues[t + 0.45] = async () => { dropHere(true, { land: () => source.hasAttribute("zen-essential") || gZenPinnedTabManager.addToEssentials(source) }); await realWait(200); };
await film("3-drag-essential", t + 1.6, cues);
done({ checks: {} });
