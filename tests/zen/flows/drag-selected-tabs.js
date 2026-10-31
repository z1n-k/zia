// Two selected tabs dragged together down the list: they travel as one and land side by side
const [a, b, c, d] = await addTabs(["A", "B", "C", "D"]);
gBrowser.selectedTab = a;
gBrowser.addToMultiSelectedTabs(b);
await wait(600);
const from = centre(a);
const to = d.getBoundingClientRect();
const seen = await drag(a, path(from, { x: from.x, y: Math.round(to.top + to.height * 0.75) }, 12));
const order = listOrder();
done({
  order,
  seen,
  checks: { "A and B stay together": Math.abs(order.indexOf("A") - order.indexOf("B")) === 1 },
  ziaErrors: ziaErrors(),
});
