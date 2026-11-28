// uses: film.js
// uses: promo/set.js
// 4 Folders (close-up: run at devPixelsPerPx 2.5, the sidebar alone captured): the default glass folder, every colour, filling up into the archive box, an empty
// folder taking a dragged tab, the spring, an icon from the picker, a tinted hover card.
const set = await dressSet();
gBrowser.selectedTab = set.tabs[0];
const folder = set.folder;
await realWait(1000);
// (the sidebar alone, a little room round it)
const sidebarBox = () => { const r = document.getElementById("navigator-toolbox").getBoundingClientRect(); const top = Math.round(document.getElementById("zen-sidebar-top-buttons").getBoundingClientRect().bottom); return { x: 0, y: top, width: Math.round(r.right + 4), height: Math.round(r.bottom - top) }; };
const SIDE = sidebarBox();

// every colour, the default white first
let cues = {};
const colours = ["white", "blue", "purple", "pink", "red", "orange", "amber", "green", "blue"];
colours.forEach((colour, i) => (cues[0.15 + i * 0.32] = async () => {
  const prefs = JSON.parse(Services.prefs.getStringPref("zia.folder-colors", "{}"));
  prefs[folder.id] = colour;
  Services.prefs.setStringPref("zia.folder-colors", JSON.stringify(prefs));
  folder.setAttribute("zia-folder-color", colour);
  await realWait(60);
}));
await film("4-colours", 0.15 + colours.length * 0.32 + 0.3, cues, SIDE);

// filling up: a new folder, one tab, two, three, then the archive box
const spare = [];
for (const url of ["https://www.notion.com/", "https://www.framer.com/", "https://www.raycast.com/", "https://arc.net/", "https://www.anthropic.com/"]) {
  spare.push(await openSite(url));
}
await loaded(spare, 20000);
// (the Inspiration folder shut, and the new one just under it, in view)
folder.collapsed = true;
const growing = gZenFolders.createFolder([spare[0]], { label: "Reading", renameFolder: false });
await realWait(1500);
growing.collapsed = true;
gBrowser.tabContainer.arrowScrollbox?.scrollbox?.scrollTo?.(0, 0);
await realWait(800);
cues = {};
spare.slice(1).forEach((tab, i) => (cues[0.4 + i * 0.7] = async () => { growing.addTabs([tab]); growing.collapsed = true; await realWait(150); }));
await film("4-filling", 0.4 + 4 * 0.7 + 0.8, cues, SIDE);

// an empty folder, and a tab dragged into it
const empty = gZenFolders.createFolder([set.tabs[3]], { label: "Later", renameFolder: false });
await realWait(600);
gBrowser.removeTab(set.tabs[3], { animate: false });
// (open, so its "Drag tabs here" slot shows)
empty.collapsed = false;
await realWait(1200);
const source = set.tabs[2];
cues = {};
pointTo(spot(source, 0.3).x, spot(source).y);
cues[0.2] = async () => { dragFrom(source); };
const slot = empty.querySelector("[class*=empty], [class*=drag-here]") || empty;
let t = glide(cues, 0.25, spot(slot, 0.5, slot === empty ? 0.75 : 0.5), 0.6);
cues[t + 0.5] = async () => { dropHere(true, { land: () => source.group === empty || empty.addTabs([source]) }); await realWait(200); };
await film("4-empty-drop", t + 1.6, cues, SIDE);

// the spring, open and shut
folder.collapsed = true;
await realWait(1200);
cues = { 0.2: () => { folder.collapsed = false; }, 1.15: () => { folder.collapsed = true; } };
await film("4-spring", 2.0, cues, SIDE);

// an icon from the picker, on the folder's front
cues = {};
cues[0.2] = async () => { gZenFolders.changeFolderUserIcon(folder); await realWait(700); };
cues[0.8] = async () => { document.getElementById("zia-icons-tab")?.doCommand?.(); document.getElementById("zia-icons-tab")?.click(); await realWait(300); };
t = 1.3;
for (const ch of "palette") {
  cues[t] = async () => { EU.sendString(ch, window); await realWait(90); };
  t += 0.08;
}
cues[t + 0.6] = async () => { document.querySelector("#zia-icons-grid .zia-icon-item")?.click(); await realWait(300); };
await film("4-icon", t + 1.6, cues);

// a coloured folder's hover card, in its colour
Services.prefs.setBoolPref("zia.folders.tint-card", true);
const label = folder.querySelector(".tab-group-label-container");
cues = {};
pointTo(900, 500);
t = glide(cues, 0.2, spot(label, 0.4), 0.35);
cues[t] = async () => { await realWait(700); };
await film("4-tinted-card", t + 1.6, cues);
done({ checks: {} });
