// A whole folder dragged by its name above a pinned tab: the rows part for it, and it lands
// there with its tabs inside
const [p, x, y] = await addTabs(["P", "X", "Y"]);
gBrowser.pinTab(p);
const folder = gZenFolders.createFolder([x, y], { label: "F", renameFolder: false });
await wait(1200);
const row = folder.querySelector(".tab-group-label-container");
const from = centre(row);
const to = p.getBoundingClientRect();
const seen = await drag(row, path(from, { x: from.x, y: Math.round(to.top + 4) }, 12));
const pinnedRows = [...gZenWorkspaces.activeWorkspaceElement.pinnedTabsContainer.children].map((node) => (node === folder ? "F" : nameOf(node))).filter((name) => name && name !== "?" && name !== "(empty)");
done({
  pinnedRows,
  inFolder: folder.tabs.map(nameOf),
  seen,
  checks: { "F moved above P": pinnedRows.indexOf("F") < pinnedRows.indexOf("P"), "F keeps its tabs": folder.tabs.includes(x) && folder.tabs.includes(y) },
  ziaErrors: ziaErrors(),
});
