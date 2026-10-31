// A tab dragged from the list onto a folder's tabs: it joins the folder
await addTabs(["A", "B", "X", "Y"]);
const folder = gZenFolders.createFolder([named("X"), named("Y")], { label: "F", renameFolder: false });
await until(() => folder.tabs.includes(named("X")) && folder.tabs.includes(named("Y")));
await atRest();
const from = centre(named("A"));
const to = centre(named("Y"));
const seen = await drag(named("A"), path(from, to, 14), { landed: () => named("A").group === folder });
done({
  pinned: pinnedOrder(),
  list: listOrder(),
  inFolder: folder.tabs.map(nameOf),
  seen,
  checks: { "A is in F": named("A").group === folder },
  ziaErrors: ziaErrors(),
});
