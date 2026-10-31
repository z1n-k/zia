// The space's name clicked to tuck the pinned tabs away and back, twice over: with the open
// tab in the list below, the pinned tabs slide shut on Zia's spring; with it in a closed
// folder among them, the tabs below and the line under the pinned tabs move together (2.113.5)
const [a, x, y, p] = await addTabs(["A", "X", "Y", "P"]);
gBrowser.pinTab(p);
const folder = gZenFolders.createFolder([x, y], { label: "F", renameFolder: false });
await wait(1000);
const name = document.querySelector(".zen-current-workspace-indicator");
const space = gZenWorkspaces.activeWorkspaceElement;
const click = async () => {
  EU.synthesizeMouseAtCenter(name, {}, window);
  await wait(100);
};
const run = async () => {
  const closing = await animationsDuring(click);
  const tucked = space.hasAttribute("collapsedpinnedtabs");
  await wait(400);
  const opening = await animationsDuring(click);
  return { closing, tucked, back: !space.hasAttribute("collapsedpinnedtabs"), opening };
};
gBrowser.selectedTab = a;
await wait(800);
const openTabBelow = await run();
gBrowser.selectedTab = x;
await wait(500);
folder.collapsed = true;
await wait(1000);
const openTabInFolder = await run();
const line = (list) => list.some((anim) => anim.includes("pinned-tabs-container-separator"));
done({
  openTabBelow,
  openTabInFolder,
  checks: {
    "they tuck away and back": openTabBelow.tucked && openTabBelow.back && openTabInFolder.tucked && openTabInFolder.back,
    "they spring with the open tab below": openTabBelow.closing.some((anim) => anim.startsWith("div.zen-tab-group-start marginTop") && anim.endsWith(" 420")),
    "the line bounces with the open tab in a folder": line(openTabInFolder.closing),
  },
  ziaErrors: ziaErrors(),
});
