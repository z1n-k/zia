// A folder's name row clicked three times, shut, open, shut: Zia's spring each way
await addTabs(["A", "X", "Y", "Z"]);
const folder = gZenFolders.createFolder([named("X"), named("Y"), named("Z")], { label: "F", renameFolder: false });
gBrowser.selectedTab = named("A");
await until(() => ["X", "Y", "Z"].every((name) => folder.tabs.includes(named(name))));
await atRest();
const row = folder.querySelector(".tab-group-label-container");
const collapsed = [];
const click = async () => {
  EU.synthesizeMouseAtCenter(row, {}, window);
  await wait(100);
};
// (each click once the last one's spring has come to rest)
const closing = await animationsDuring(click);
collapsed.push(folder.collapsed);
await atRest();
const opening = await animationsDuring(click);
collapsed.push(folder.collapsed);
await atRest();
await animationsDuring(click);
collapsed.push(folder.collapsed);
await atRest();
done({
  collapsed,
  closing,
  opening,
  checks: { "each click turns it over": collapsed.join() === "true,false,true", "it springs both ways": closing.length > 0 && opening.length > 0 },
  ziaErrors: ziaErrors(),
});
