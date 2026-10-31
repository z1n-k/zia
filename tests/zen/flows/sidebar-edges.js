// Essentials, a tab in the list and a folder ending in an inner folder, with the sidebar on the
// left and then on the right: the edge fixes Zia measures and sets for them (CSS variables on
// the window, and on a folder whose last row is a folder, its box's bottom brought to the inner
// box's bottom plus the gap between them). Each is read after a tab's chosen once everything has
// settled, as Zia measures again then. (The folder's own value is a pixel or so either way from
// run to run, with Zia unchanged, so what's kept is whether it's set and where its box ends.)
const [e1, e2, a, b, x, y, z] = await addTabs(["E1", "E2", "A", "B", "X", "Y", "Z"]);
gZenPinnedTabManager.addToEssentials(e1);
gZenPinnedTabManager.addToEssentials(e2);
const outer = gZenFolders.createFolder([x, y], { label: "F", renameFolder: false });
const inner = gZenFolders.createFolder([z], { label: "G", renameFolder: false, insertAfter: y });
gBrowser.selectedTab = a;
const root = document.documentElement;
// whether Zia set the folder's bottom, and if so whether its box now ends the gap below the inner one's
const bottom = (folder) => {
  if (!folder.style.getPropertyValue("--zia-folder-bottom-extra")) {
    return { set: false };
  }
  const last = [...folder.querySelector(":scope > .tab-group-container").children].filter((el) => el.getBoundingClientRect().height > 0).at(-1);
  const boxBottom = (el) => el.getBoundingClientRect().bottom - (parseFloat(getComputedStyle(el, "::before").bottom) || 0);
  const gap = parseFloat(getComputedStyle(folder).getPropertyValue("--zia-folder-inner-gap")) || 5;
  return { set: true, lastIsFolder: last?.localName === "zen-folder", endsTheGapBelow: Math.abs(boxBottom(folder) - boxBottom(last) - gap) <= 0.5 };
};
const settled = async () => {
  await wait(2500);
  gBrowser.selectedTab = b;
  await wait(300);
  gBrowser.selectedTab = a;
  await wait(1000);
  return {
    side: root.hasAttribute("zen-right-side") ? "right" : "left",
    sidebarLeft: round(document.getElementById("navigator-toolbox").getBoundingClientRect().left),
    window: Object.fromEntries([...root.style].filter((name) => /^--zia-(tab|folder)-(right|left)-fix$/.test(name)).sort().map((name) => [name, root.style.getPropertyValue(name)])),
    folders: Object.fromEntries([outer, inner].map((folder) => [folder.label, bottom(folder)])),
  };
};
const left = await settled();
Services.prefs.setBoolPref("zen.tabs.vertical.right-side", true);
const right = await settled();
Services.prefs.setBoolPref("zen.tabs.vertical.right-side", false);
const leftAgain = await settled();
done({
  innerInOuter: inner.parentElement?.closest("zen-folder") === outer,
  left,
  right,
  leftAgain,
  checks: {
    "the sidebar changes side": left.side === "left" && right.side === "right" && right.sidebarLeft > left.sidebarLeft,
    "the tab and folder edges are measured": Object.keys(left.window).length === 3 && Object.keys(right.window).length === 3,
    "left again is as before": JSON.stringify(left) === JSON.stringify(leftAgain),
    "the folder ending in a folder has its bottom set": [left, right, leftAgain].every((seen) => seen.folders.F.set && seen.folders.F.lastIsFolder),
    "its box ends the gap below the inner one's": [left, right, leftAgain].every((seen) => seen.folders.F.endsTheGapBelow),
  },
  ziaErrors: ziaErrors(),
});
