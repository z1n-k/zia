// Essentials, a tab in the list and a folder ending in an inner folder, with the sidebar on the
// left and then on the right: the edge fixes Zia measures and sets for them (CSS variables on
// the window, and on a folder whose last row is a folder, its box's bottom brought to the inner
// box's bottom plus the gap between them). Each is read after a tab's chosen once everything has
// settled, as Zia measures again then. (The folder's own value comes out differently from run to
// run with Zia unchanged, and isn't set at all where the box already ends in the right place, as
// it can on a busy Mac, so what's kept is where its box ends.)
const [e1, e2, a, b, x, y, z] = await addTabs(["E1", "E2", "A", "B", "X", "Y", "Z"]);
gZenPinnedTabManager.addToEssentials(e1);
gZenPinnedTabManager.addToEssentials(e2);
const outer = gZenFolders.createFolder([x, y], { label: "F", renameFolder: false });
const inner = gZenFolders.createFolder([z], { label: "G", renameFolder: false, insertAfter: y });
gBrowser.selectedTab = a;
const root = document.documentElement;
// whether the folder ends in a folder, and if so whether its box ends the gap below the inner one's
const bottom = (folder) => {
  const last = [...folder.querySelector(":scope > .tab-group-container").children].filter((el) => el.getBoundingClientRect().height > 0).at(-1);
  if (last?.localName !== "zen-folder") {
    return { lastIsFolder: false };
  }
  const boxBottom = (el) => el.getBoundingClientRect().bottom - (parseFloat(getComputedStyle(el, "::before").bottom) || 0);
  const gap = parseFloat(getComputedStyle(folder).getPropertyValue("--zia-folder-inner-gap")) || 5;
  return { lastIsFolder: true, endsTheGapBelow: Math.abs(boxBottom(folder) - boxBottom(last) - gap) <= 0.5 };
};
const settled = async (side) => {
  // (on its side, and everything at rest, then a tab chosen and back, and Zia's measures done:
  // it measures a frame after, and again every tenth of a second while anything still moves)
  await until(() => root.hasAttribute("zen-right-side") === (side === "right"));
  await atRest();
  gBrowser.selectedTab = b;
  await atRest();
  gBrowser.selectedTab = a;
  await atRest();
  return steady(() => ({
    side: root.hasAttribute("zen-right-side") ? "right" : "left",
    sidebarLeft: round(document.getElementById("navigator-toolbox").getBoundingClientRect().left),
    window: Object.fromEntries([...root.style].filter((name) => /^--zia-(tab|folder)-(right|left)-fix$/.test(name)).sort().map((name) => [name, root.style.getPropertyValue(name)])),
    folders: Object.fromEntries([outer, inner].map((folder) => [folder.label, bottom(folder)])),
  }), { quiet: 500 });
};
const left = await settled("left");
Services.prefs.setBoolPref("zen.tabs.vertical.right-side", true);
const right = await settled("right");
Services.prefs.setBoolPref("zen.tabs.vertical.right-side", false);
const leftAgain = await settled("left");
done({
  innerInOuter: inner.parentElement?.closest("zen-folder") === outer,
  left,
  right,
  leftAgain,
  checks: {
    "the sidebar changes side": left.side === "left" && right.side === "right" && right.sidebarLeft > left.sidebarLeft,
    "the tab and folder edges are measured": Object.keys(left.window).length === 3 && Object.keys(right.window).length === 3,
    "left again is as before": JSON.stringify(left) === JSON.stringify(leftAgain),
    "the outer folder ends in the inner one": [left, right, leftAgain].every((seen) => seen.folders.F.lastIsFolder),
    "its box ends the gap below the inner one's": [left, right, leftAgain].every((seen) => seen.folders.F.endsTheGapBelow),
  },
  ziaErrors: ziaErrors(),
});
