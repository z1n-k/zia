// The first of three essentials dragged past the other two: the tiles shift aside, and it
// lands last
const tiles = await addTabs(["E1", "E2", "E3"]);
for (const tab of tiles) {
  gZenPinnedTabManager.addToEssentials(tab);
}
await until(() => tiles.every((tab) => tab.hasAttribute("zen-essential")));
await atRest();
const from = centre(named("E1"));
const to = named("E3").getBoundingClientRect();
const seen = await drag(named("E1"), path(from, { x: Math.round(to.right - 4), y: Math.round(to.top + to.height / 2) }, 12), { landed: () => essentials().indexOf("E1") > essentials().indexOf("E3") });
done({
  essentials: essentials(),
  seen,
  checks: { "E1 moved past E3": essentials().indexOf("E1") > essentials().indexOf("E3") },
  ziaErrors: ziaErrors(),
});
