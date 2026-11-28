// A tab dragged onto the open tab's page, held there: Zen splits the view, the two side by side
const [a, b] = await addTabs(["A", "B"]);
gBrowser.selectedTab = b;
await until(() => b.linkedBrowser.docShellIsActive);
await atRest();
const panels = document.getElementById("tabbrowser-tabpanels").getBoundingClientRect();
const from = centre(a);
const to = { x: Math.round(panels.right - panels.width * 0.2), y: Math.round(panels.top + panels.height / 2) };
const points = [...path(from, to, 10), ...Array(15).fill(to)];
const seen = await drag(a, points, { landed: () => a.group?.hasAttribute("split-view-group") });
const group = a.group?.hasAttribute("split-view-group") ? a.group : null;
done({
  split: group ? group.tabs.map(nameOf) : null,
  seen: { dragging: seen.dragging },
  checks: { "A is split with the open tab B": !!group && group.tabs.length === 2 && group.tabs.includes(b) },
  ziaErrors: ziaErrors(),
});
