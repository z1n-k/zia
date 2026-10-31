// A tab dragged over the open page: Zia's two drop cards come up, the one nearer the pointer
// lit and pulled towards it, with a picture of the dragged page following the pointer. Let go
// off the cards, they go.
const [a, b] = await addTabs(["A", "B"]);
gBrowser.selectedTab = b;
await until(() => b.linkedBrowser.docShellIsActive);
await atRest();
const panels = document.getElementById("tabbrowser-tabpanels").getBoundingClientRect();
const from = centre(a);
const to = { x: Math.round(panels.left + panels.width * 0.15), y: Math.round(panels.top + panels.height / 2) };
const points = [...path(from, to, 10), ...Array(5).fill(to)];
const steps = [];
await drag(a, points, {
  drop: false,
  during: async (i) => {
    const overlay = document.getElementById("zia-split-drop");
    const picture = document.getElementById("zia-split-drag-picture");
    steps.push({
      step: i,
      overlay: overlay ? [...overlay.attributes].map((attr) => attr.name).filter((name) => !["id", "style"].includes(name)).sort().join(" ") : null,
      zones: overlay ? [...overlay.querySelectorAll(".zia-split-zone")].map((zone) => `${zone.getAttribute("side")}${zone.hasAttribute("active") ? " active" : ""} ${zone.style.getPropertyValue("--zia-zone-tx") || "-"} ${zone.style.getPropertyValue("--zia-zone-ty") || "-"}`) : null,
      picture: picture ? `${picture.hasAttribute("following") ? "following" : "still"} ${picture.style.width}x${picture.style.height} at ${picture.style.translate}` : null,
    });
  },
});
const after = { open: document.getElementById("zia-split-drop")?.hasAttribute("open"), following: document.getElementById("zia-split-drag-picture")?.hasAttribute("following"), list: listOrder() };
done({
  steps,
  after,
  checks: {
    "the cards come up": steps.some((step) => step.overlay?.includes("open")),
    "the left one is lit": steps.at(-1).zones?.[0].includes("active"),
    "the picture follows": steps.at(-1).picture?.startsWith("following"),
    "they go after": !after.open && !after.following,
  },
  ziaErrors: ziaErrors(),
});
