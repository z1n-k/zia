// Tabs closed together come back together with Cmd/Ctrl+Z, into the folder they were in; and a
// tab added to the essentials from its menu springs in
const [a, b, c, d] = await addTabs(["A", "B", "C", "D"]);
const folder = gZenFolders.createFolder([c, d], { label: "F", renameFolder: false });
await wait(800);
gBrowser.selectedTab = a;
await wait(300);
gBrowser.removeTabs([b, c, d]);
await wait(1200);
const closed = { list: listOrder(), folder: folder.isConnected };
const accel = AppConstants.platform === "macosx" ? { metaKey: true } : { ctrlKey: true };
EU.synthesizeKey("z", accel, window);
await wait(2500);
const back = {
  list: listOrder(),
  // (sorted: SessionStore brings them back in either order)
  all: gBrowser.tabs.map(nameOf).sort(),
  folders: [...document.querySelectorAll("zen-folder")].map((f) => `${f.label}: ${f.tabs.filter((t) => !t.hasAttribute("zen-empty-tab")).map(nameOf).sort().join(",")}`),
};
// from the tab's menu (no tab handed in), the essential springs in
TabContextMenu.contextTab = a;
let springs = null;
const watch = (event) => {
  const tile = event.target.querySelector(".tab-stack") || event.target;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      springs = tile.getAnimations().map((anim) => anim.effect.getTiming().duration);
    })
  );
};
window.addEventListener("TabAddedToEssentials", watch);
gZenPinnedTabManager.addToEssentials();
await wait(1200);
window.removeEventListener("TabAddedToEssentials", watch);
done({
  closed,
  back,
  springs,
  essentials: essentials(),
  checks: {
    "they closed": !closed.list.includes("B"),
    "they all came back": ["B", "C", "D"].every((name) => back.all.includes(name)),
    "the folder came back": back.folders.some((f) => f.startsWith("F:") && f.includes("C") && f.includes("D")),
    "the essential sprang in": Array.isArray(springs) && springs.includes(820),
  },
  // (Zen 1.24 has no window.undoCloseTab any more: Zia notes it and SessionStore's own
  // reopening, one close at a time, brings them back)
  ziaErrors: ziaErrors().filter((text) => !text.includes("window.undoCloseTab is not a function")),
});
