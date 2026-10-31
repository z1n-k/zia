// A tab dragged from the list onto a folder's tabs: it joins the folder
await addTabs(["A", "B", "X", "Y"]);
const folder = gZenFolders.createFolder([named("X"), named("Y")], { label: "F", renameFolder: false });
await wait(1200);
const from = centre(named("A"));
const to = centre(named("Y"));
const seen = await drag(named("A"), path(from, to, 14));
done({
  pinned: pinnedOrder(),
  list: listOrder(),
  inFolder: folder.tabs.map(nameOf),
  seen,
  checks: { "A is in F": named("A").group === folder },
  ziaErrors: ziaErrors(),
});
