// Essentials, a tab in the list and a folder ending in an inner folder, with the sidebar on the
// left and then on the right: the edge fixes Zia measures and sets for them (CSS variables on
// the window and on each folder)
const [e1, e2, a, x, y, z] = await addTabs(["E1", "E2", "A", "X", "Y", "Z"]);
gZenPinnedTabManager.addToEssentials(e1);
gZenPinnedTabManager.addToEssentials(e2);
const outer = gZenFolders.createFolder([x, y], { label: "F", renameFolder: false });
const inner = gZenFolders.createFolder([z], { label: "G", renameFolder: false, insertAfter: y });
gBrowser.selectedTab = a;
await wait(3000);
const root = document.documentElement;
const fixes = () => ({
  side: root.hasAttribute("zen-right-side") ? "right" : "left",
  sidebarLeft: round(document.getElementById("navigator-toolbox").getBoundingClientRect().left),
  window: Object.fromEntries([...root.style].filter((name) => /^--zia-(tab|folder)-(right|left)-fix$/.test(name)).sort().map((name) => [name, root.style.getPropertyValue(name)])),
  folders: Object.fromEntries([outer, inner].map((folder) => [folder.label, folder.style.getPropertyValue("--zia-folder-bottom-extra") || null])),
});
const left = fixes();
Services.prefs.setBoolPref("zen.tabs.vertical.right-side", true);
await wait(3000);
const right = fixes();
Services.prefs.setBoolPref("zen.tabs.vertical.right-side", false);
await wait(3000);
const leftAgain = fixes();
done({
  innerInOuter: inner.parentElement?.closest("zen-folder") === outer,
  left,
  right,
  leftAgain,
  checks: {
    "the sidebar changes side": left.side === "left" && right.side === "right" && right.sidebarLeft > left.sidebarLeft,
    "the tab and folder edges are measured": Object.keys(left.window).length === 3 && Object.keys(right.window).length === 3,
    "left again is as before": JSON.stringify(left) === JSON.stringify(leftAgain),
  },
  ziaErrors: ziaErrors(),
});
