// A tab dragged down the list past three others: they slide up out of its way, and it lands
// where it was let go
await addTabs(["A", "B", "C", "D"]);
const before = listOrder();
const from = centre(named("A"));
const to = named("D").getBoundingClientRect();
const seen = await drag(named("A"), path(from, { x: from.x, y: Math.round(to.top + to.height * 0.75) }), { landed: () => listOrder().indexOf("A") > listOrder().indexOf("D") });
const after = listOrder();
done({
  before,
  after,
  seen,
  checks: { "Zia drove the drag": seen.dragging, "A moved below D": after.indexOf("A") > after.indexOf("D") },
  ziaErrors: ziaErrors(),
});
