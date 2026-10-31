// A split pair dragged down the list as one row: the rows part for it, and it lands whole
const [a, b, c, d] = await addTabs(["A", "B", "C", "D"]);
gZenViewSplitter.splitTabs([a, b]);
await wait(1500);
const group = a.group;
const from = centre(group.querySelector(".tabbrowser-tab"));
const to = d.getBoundingClientRect();
const seen = await drag(a, path(from, { x: from.x, y: Math.round(to.top + to.height * 0.75) }, 12));
done({
  list: gBrowser.visibleTabs.filter((tab) => !tab.pinned).map((tab) => (tab.group?.hasAttribute("split-view-group") ? `[${nameOf(tab)}]` : nameOf(tab))),
  seen,
  checks: { "A and B are still split": !!a.group?.hasAttribute("split-view-group") && a.group === b.group },
  ziaErrors: ziaErrors(),
});
