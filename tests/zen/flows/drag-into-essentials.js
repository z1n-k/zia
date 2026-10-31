// A tab dragged up into the essentials: it becomes one
await addTabs(["A", "B"]);
const box = document.querySelector("#zen-essentials .zen-essentials-container, .zen-essentials-container");
const area = box.getBoundingClientRect();
const from = centre(named("A"));
const to = { x: Math.round(area.left + Math.max(area.width, 40) / 2), y: Math.round(area.top + Math.max(area.height, 20) / 2) };
const seen = await drag(named("A"), path(from, to, 16));
done({
  essentials: essentials(),
  list: listOrder(),
  seen,
  checks: { "A is an essential": named("A").hasAttribute("zen-essential") },
  ziaErrors: ziaErrors(),
});
