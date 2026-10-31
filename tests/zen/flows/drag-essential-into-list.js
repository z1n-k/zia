// An essential dragged down out of the tiles into the list: room opens for it among the tabs,
// and it lands there as a plain tab
const [e, a, b] = await addTabs(["E", "A", "B"]);
gZenPinnedTabManager.addToEssentials(e);
await wait(1200);
const from = centre(e);
const to = a.getBoundingClientRect();
const seen = await drag(e, path(from, { x: from.x, y: Math.round(to.top + to.height * 0.75) }, 16));
done({
  essentials: essentials(),
  list: listOrder(),
  seen,
  checks: { "E is no longer an essential": !named("E").hasAttribute("zen-essential"), "E is in the list": listOrder().includes("E") },
  ziaErrors: ziaErrors(),
});
