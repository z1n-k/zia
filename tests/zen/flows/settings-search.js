// Zia Settings searched and a switch flipped: typing narrows the list to the matching rows (and
// their sections), clicking a row's switch writes its setting and the switch follows, Esc first
// clears the search, then closes the page.
PanelUI.show();
await wait(1000);
document.getElementById("zia-settings-menu-button").doCommand();
await wait(1200);
const page = document.getElementById("zia-settings");
const search = page.querySelector(".zia-set-search input");
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
await wait(300);
const searched = visible();
const row = [...page.querySelectorAll(".zia-set-row")].find((el) => el.querySelector(".zia-set-label").firstChild.textContent === "Sound bars");
const toggle = row.querySelector(".zia-set-switch");
const before = { pref: Services.prefs.getBoolPref("zia.tabs.sound-bars", true), checked: toggle.getAttribute("aria-checked") };
EU.synthesizeMouseAtCenter(toggle, {}, window);
await wait(300);
const after = { pref: Services.prefs.getBoolPref("zia.tabs.sound-bars", true), checked: toggle.getAttribute("aria-checked"), rows: visible().rows };
search.select();
EU.sendString("qqqzzzq", window);
await wait(300);
const nothing = visible();
EU.synthesizeKey("KEY_Escape", {}, window);
await wait(300);
const cleared = { query: search.value, rows: visible().rows.length, open: page.isConnected && !page.hasAttribute("closing") };
EU.synthesizeKey("KEY_Escape", {}, window);
await wait(800);
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
