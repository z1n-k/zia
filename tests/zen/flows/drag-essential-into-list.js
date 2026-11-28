// An essential dragged down out of the tiles into the list: room opens for it among the tabs,
// and it lands there as a plain tab
const [e, a, b] = await addTabs(["E", "A", "B"]);
gZenPinnedTabManager.addToEssentials(e);
await until(() => e.hasAttribute("zen-essential"));
await atRest();
const from = centre(e);
const to = a.getBoundingClientRect();
// (Zen takes it out of the essentials in its own time, and Zia places it once it has)
const seen = await drag(e, path(from, { x: from.x, y: Math.round(to.top + to.height * 0.75) }, 16), { landed: () => !named("E").hasAttribute("zen-essential") && listOrder().includes("E") });
done({
  essentials: essentials(),
  list: listOrder(),
  seen,
  checks: { "E is no longer an essential": !named("E").hasAttribute("zen-essential"), "E is in the list": listOrder().includes("E") },
  ziaErrors: ziaErrors(),
});
