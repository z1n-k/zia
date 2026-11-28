// Zia Settings searched and a switch flipped: typing narrows the list to the matching rows (and
// their sections), clicking a row's switch writes its setting and the switch follows, Esc first
// clears the search, then closes the page.
PanelUI.show();
// (the menu is built as it first opens, the page once its list of settings has loaded)
(await until(() => PanelUI.panel.state === "open" && document.getElementById("zia-settings-menu-button"))).doCommand();
const page = await until(() => document.getElementById("zia-settings")?.querySelector(".zia-set-row") && document.getElementById("zia-settings"));
const search = page.querySelector(".zia-set-search input");
// (it focuses its search as it opens)
await until(() => document.activeElement === search);
const visible = () => ({
  sections: [...page.querySelectorAll(".zia-set-section")].filter((el) => !el.hidden).map((el) => el.querySelector(".zia-set-section-title").textContent),
  nav: [...page.querySelectorAll(".zia-set-nav-item")].filter((el) => !el.hidden).map((el) => el.textContent),
  rows: [...page.querySelectorAll(".zia-set-row")].filter((el) => !el.hidden).map((el) => `${el.querySelector(".zia-set-label").firstChild.textContent}${el.classList.contains("off") ? " (off)" : ""}`),
  empty: page.querySelector(".zia-set-list").classList.contains("empty"),
});
const focused = document.activeElement === search;
const all = visible().rows.length;
search.focus();
EU.sendString("sound bars", window);
const searched = await until(() => visible().rows.length < all && visible());
const row = [...page.querySelectorAll(".zia-set-row")].find((el) => el.querySelector(".zia-set-label").firstChild.textContent === "Sound bars");
const toggle = row.querySelector(".zia-set-switch");
const before = { pref: Services.prefs.getBoolPref("zia.tabs.sound-bars", true), checked: toggle.getAttribute("aria-checked") };
EU.synthesizeMouseAtCenter(toggle, {}, window);
// (the switch, and the rows that hang on it, follow on the next frame)
await until(() => toggle.getAttribute("aria-checked") !== before.checked);
const after = await steady(() => ({ pref: Services.prefs.getBoolPref("zia.tabs.sound-bars", true), checked: toggle.getAttribute("aria-checked"), rows: visible().rows }));
search.select();
EU.sendString("qqqzzzq", window);
const nothing = await until(() => visible().empty && visible());
EU.synthesizeKey("KEY_Escape", {}, window);
// (Esc clears it at once)
await until(() => search.value === "");
const cleared = { query: search.value, rows: visible().rows.length, open: page.isConnected && !page.hasAttribute("closing") };
EU.synthesizeKey("KEY_Escape", {}, window);
await until(() => !page.isConnected);
done({
  focused,
  all,
  searched,
  before,
  after,
  nothing,
  cleared,
  closed: !page.isConnected,
  checks: {
    "the search starts focused": focused,
    "typing narrows the list": searched.rows.includes("Sound bars") && searched.rows.length < all && searched.sections.length >= 1,
    "the switch writes its setting": before.pref !== after.pref && after.checked === String(after.pref),
    "no match says so": nothing.empty && nothing.rows.length === 0,
    "Esc clears the search first": cleared.query === "" && cleared.rows > searched.rows.length && cleared.open,
    "then closes the page": !page.isConnected,
  },
  ziaErrors: ziaErrors(),
});
