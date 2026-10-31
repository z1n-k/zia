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
await wait(300);
EU.sendString("keyboard sh", window);
await wait(1200);
const shortcuts = shownRows().map(describe);
const tabsBefore = gBrowser.tabs.length;
const commandRow = shownRows().find((row) => row.textContent.includes("Keyboard Shortcuts"));
if (commandRow) {
  EU.synthesizeMouseAtCenter(commandRow, {}, window);
}
await wait(1500);
const opened = { page: gBrowser.selectedBrowser.currentURI.spec, newTab: gBrowser.tabs.length - tabsBefore };

Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper).copyString("before");
gURLBar.focus();
gURLBar.select();
await wait(300);
EU.sendString("#336699", window);
await wait(1200);
const colourRow = shownRows().find((row) => row.querySelector("[name='swatch']"));
const answer = colourRow ? ["swatch", "output", "forms"].map((name) => colourRow.querySelector(`[name='${name}']`)) : null;
const colour = answer && { swatch: answer[0].style.backgroundColor, output: answer[1].textContent, forms: answer[2].textContent };
if (colourRow) {
  EU.synthesizeMouseAtCenter(colourRow, {}, window);
}
await wait(500);
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
