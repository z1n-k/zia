// Two tabs split side by side: each pane gets Zia's own toolbar (buttons, the address as host
// and title, the window's buttons on the top-right one), which follows its page as it goes
// somewhere else; closing one of the two takes the toolbars away.
const [a, b] = await addTabs(["A", "B"]);
gBrowser.selectedTab = a;
await wait(500);
gZenViewSplitter.splitTabs([a, b], "vsep", 0);
await wait(1500);
const root = document.documentElement;
const bars = () =>
  [...gBrowser.tabpanels.querySelectorAll(".zia-pane-bar")].map((bar) => ({
    parts: [...bar.children].map((el) => el.className),
    marks: [...bar.attributes].map((attr) => attr.name).filter((name) => name !== "style").sort(),
    colour: bar.style.getPropertyValue("--zia-pane-bg"),
    host: bar.querySelector(".zia-pane-host").textContent,
    rest: bar.querySelector(".zia-pane-rest").textContent,
    box: ["left", "top", "width", "height"].map((side) => Math.round(bar.getBoundingClientRect()[side])),
    buttons: [...bar.querySelectorAll("button")].map((button) => `${button.title}${button.disabled ? " (off)" : ""}`),
    reloadIcon: bar.querySelector(".zia-pane-reload img").getAttribute("src").split("/").pop(),
  }));
const vars = () =>
  Object.fromEntries([...root.style].filter((name) => /^--zia-(pane-url|split-buttons)/.test(name)).sort().map((name) => [name, root.style.getPropertyValue(name)]));
const split = { flag: root.getAttribute("zia-split"), bars: bars(), vars: vars() };

a.linkedBrowser.loadURI(Services.io.newURI("data:text/html,<title>Next</title>Next"), { triggeringPrincipal: SYSTEM });
await wait(1500);
const moved = bars()[0];

gBrowser.removeTab(b);
await wait(1500);
const closed = { flag: root.getAttribute("zia-split"), bars: bars().length };
done({
  split,
  moved,
  closed,
  checks: {
    "each pane has its toolbar": split.bars.length === 2 && split.flag === "true",
    "the left one is first": split.bars[0].marks.includes("first"),
    "it follows its page": moved.rest === " / Next" && !moved.buttons[1].endsWith("(off)"),
    "closing one takes them away": closed.bars === 0 && !closed.flag,
  },
  ziaErrors: ziaErrors(),
});
