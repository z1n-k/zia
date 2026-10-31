// A folder's tab dragged down into the list: it leaves the folder
await addTabs(["A", "B", "X", "Y"]);
const folder = gZenFolders.createFolder([named("X"), named("Y")], { label: "F", renameFolder: false });
await wait(1200);
const from = centre(named("X"));
const to = named("B").getBoundingClientRect();
const seen = await drag(named("X"), path(from, { x: from.x, y: Math.round(to.top + to.height * 0.75) }, 14));
done({
  pinned: pinnedOrder(),
  list: listOrder(),
  inFolder: folder.tabs.map(nameOf),
  seen,
  checks: { "X left F": named("X").group !== folder, "X is in the list": listOrder().includes("X") },
  ziaErrors: ziaErrors(),
});
