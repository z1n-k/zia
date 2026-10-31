// Zia's commands in the address bar: typed words find "Keyboard Shortcuts" (each word starting
// a word of its name, so Sync Settings isn't found too), and picking it opens its page; a typed
// hex is answered with its colour, and picking that copies the hex
Services.prefs.setBoolPref("browser.search.suggest.enabled", false);
Services.prefs.setBoolPref("browser.urlbar.suggest.trending", false);
await addTabs(["A"]);
const urlbar = document.getElementById("urlbar");
const shownRows = () => [...urlbar.querySelectorAll(".urlbarView-row")].filter((row) => row.getBoundingClientRect().height > 0);
const describe = (row) => `${row.getAttribute("type") || ""}: ${row.querySelector(".urlbarView-title")?.textContent || row.textContent.trim()}`;
const clipboard = () => {
  try {
    const transfer = Cc["@mozilla.org/widget/transferable;1"].createInstance(Ci.nsITransferable);
    transfer.init(null);
    transfer.addDataFlavor("text/plain");
    Services.clipboard.getData(transfer, Ci.nsIClipboard.kGlobalClipboard, window.browsingContext.currentWindowContext);
    const data = {};
    transfer.getTransferData("text/plain", data);
    return data.value.QueryInterface(Ci.nsISupportsString).data;
  } catch (e) {
    return null;
  }
};

gURLBar.focus();
await until(() => gURLBar.focused);
EU.sendString("keyboard sh", window);
// (the answers in, and no more coming)
await until(() => shownRows().some((row) => row.textContent.includes("Keyboard Shortcuts")));
await atRest();
const shortcuts = await steady(() => shownRows().map(describe), { quiet: 500 });
const tabsBefore = gBrowser.tabs.length;
const commandRow = shownRows().find((row) => row.textContent.includes("Keyboard Shortcuts"));
if (commandRow) {
  EU.synthesizeMouseAtCenter(commandRow, {}, window);
}
await until(() => gBrowser.selectedBrowser.currentURI.spec.startsWith("about:keyboard"));
await atRest();
const opened = { page: gBrowser.selectedBrowser.currentURI.spec, newTab: gBrowser.tabs.length - tabsBefore };

Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper).copyString("before");
gURLBar.focus();
gURLBar.select();
await until(() => gURLBar.focused);
EU.sendString("#336699", window);
const colourOf = (row) => {
  const answer = row ? ["swatch", "output", "forms"].map((name) => row.querySelector(`[name='${name}']`)) : null;
  return answer && { swatch: answer[0].style.backgroundColor, output: answer[1].textContent, forms: answer[2].textContent };
};
const colourRow = () => shownRows().find((row) => row.querySelector("[name='swatch']"));
// (its answer in, filled, at rest and held)
await until(() => colourOf(colourRow())?.output);
await atRest();
const colour = await steady(() => colourOf(colourRow()));
if (colourRow()) {
  EU.synthesizeMouseAtCenter(colourRow(), {}, window);
}
await until(() => clipboard() !== "before");
const copied = clipboard();
done({
  shortcuts,
  opened,
  colour,
  copied,
  checks: {
    "the command is found": shortcuts.some((row) => row.includes("Keyboard Shortcuts")),
    "only commands named so": !shortcuts.some((row) => row.includes("Sync Settings")),
    "picking it opens its page": opened.page === "about:keyboard",
    "the colour is answered": colour?.output === "#336699",
    "picking the colour copies its hex": copied === "#336699",
  },
  ziaErrors: ziaErrors(),
});
