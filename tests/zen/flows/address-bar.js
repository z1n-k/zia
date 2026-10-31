// The address bar on a website: its closed title, the click that opens it (the whole address
// selected, the opened bar lined up with the closed text), and typing, with the pop-up's rows
// lined up with the typed text (as far as they go in the sidebar, Zen's single toolbar here)
// and its bottom fitted to the last row
Services.prefs.setBoolPref("browser.search.suggest.enabled", false);
Services.prefs.setBoolPref("browser.urlbar.suggest.trending", false);
const base = serve({
  "/page": "<title>Lavender Fields</title><body>Page",
  "/other": "<title>Lavender Notes</title><body>Other",
});
gBrowser.selectedTab = gBrowser.addTab(`${base}/other`, { triggeringPrincipal: SYSTEM });
await wait(1200);
gBrowser.selectedBrowser.loadURI(Services.io.newURI(`${base}/page`), { triggeringPrincipal: SYSTEM });
await wait(2000);
const urlbar = document.getElementById("urlbar");
const input = gURLBar.inputField;
const px = (box) => [box.left, box.top, box.width, box.height].map(Math.round);
const closed = {
  title: unported(document.getElementById("zia-url-title")?.textContent),
  plain: unported(document.getElementById("zia-url-plain")?.textContent),
  hasTitle: urlbar.getAttribute("zia-has-title"),
  value: unported(gURLBar.value),
  bar: px(urlbar.getBoundingClientRect()),
};

EU.synthesizeMouseAtCenter(input, {}, window);
await wait(800);
const style = (el, name) => el.style.getPropertyValue(name);
const opened = {
  focused: gURLBar.focused,
  open: urlbar.hasAttribute("breakout-extend"),
  value: unported(input.value),
  selection: [input.selectionStart, input.selectionEnd, input.value.length],
  bar: px(urlbar.getBoundingClientRect()),
  width: style(urlbar, "--urlbar-width"),
  offset: style(document.documentElement, "--zia-urlbar-open-offset"),
  offsetX: style(document.documentElement, "--zia-urlbar-open-offset-x"),
};

EU.sendString("lavender", window);
await wait(1500);
const rows = [...urlbar.querySelectorAll(".urlbarView-row")].filter((row) => row.getBoundingClientRect().height > 0);
const barIcon = document.getElementById("identity-icon")?.getBoundingClientRect();
const first = rows[0];
const firstIcon = first?.querySelector(".urlbarView-favicon, .urlbarView-type-icon")?.getBoundingClientRect();
const firstTitle = first?.querySelector(".urlbarView-title")?.getBoundingClientRect();
const textLeft = input.getBoundingClientRect().left + (parseFloat(getComputedStyle(input).paddingInlineStart) || 0);
const background = urlbar.querySelector(".urlbar-background").getBoundingClientRect();
const lastRow = rows.at(-1)?.getBoundingClientRect();
const typed = {
  value: unported(input.value),
  rows: rows.map((row) => `${row.getAttribute("type")}: ${unported(row.querySelector(".urlbarView-title")?.textContent)}`),
  bar: px(urlbar.getBoundingClientRect()),
  iconStart: style(urlbar, "--zia-pop-icon-start"),
  textGap: style(urlbar, "--zia-pop-text-gap"),
  bottomTrim: style(urlbar, "--zia-pop-bottom-trim"),
  reachBottom: style(urlbar, "--zia-pop-reach-bottom"),
  scrolls: document.documentElement.hasAttribute("zia-pop-scrolls"),
  // (how far the first row's icon and title sit from the bar's icon and the typed text)
  iconOff: barIcon && firstIcon ? Math.round(firstIcon.left - barIcon.left) : null,
  textOff: firstTitle ? Math.round(firstTitle.left - textLeft) : null,
  bottomGap: lastRow ? Math.round(background.bottom - lastRow.bottom) : null,
};
EU.synthesizeKey("KEY_Escape", {}, window);
EU.synthesizeKey("KEY_Escape", {}, window);
await wait(300);
gBrowser.selectedBrowser.focus();
await wait(800);
done({
  closed,
  opened,
  typed,
  after: { focused: gURLBar.focused, open: urlbar.hasAttribute("breakout-extend"), value: unported(gURLBar.value) },
  checks: {
    "the closed bar shows the site and title": closed.title === "localhost / Lavender Fields",
    "the click selects the whole address": opened.selection[0] === 0 && opened.selection[1] === opened.selection[2] && opened.selection[2] > 0,
    "the pop-up lists the pages": rows.length >= 2,
    "its bottom is fitted to the last row": typed.bottomGap === 8,
  },
  ziaErrors: ziaErrors(),
});
