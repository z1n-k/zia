// The welcome tour, shown again from settings (zia.welcome.again): its overlay opens over
// the window with the tour page, and closes once the page says it's done
Services.prefs.setBoolPref("zia.welcome.again", true);
// (open, shown, and its page loaded, which the "done" mark below goes on)
const overlay = await until(() => document.getElementById("zia-welcome")?.hasAttribute("shown") && document.getElementById("zia-welcome"));
const frame = overlay.querySelector("iframe");
await until(() => frame.contentDocument?.readyState === "complete" && frame.contentDocument.documentURI.startsWith("chrome://"));
const shown = {
  overlay: !!overlay,
  popover: overlay?.getAttribute("popover"),
  open: !!overlay?.matches(":popover-open"),
  shown: !!overlay?.hasAttribute("shown"),
  src: frame?.getAttribute("src"),
  title: frame?.getAttribute("title"),
  prefTurnedOff: !Services.prefs.getBoolPref("zia.welcome.again", false),
};
// (the page's "done", as its mark on its own document)
// (looked for every quarter second; closing, it fades a moment, then goes)
frame?.contentDocument?.documentElement?.setAttribute("data-zia-welcome", JSON.stringify({ action: "done" }));
await until(() => overlay.hasAttribute("closing"));
const closing = !!overlay?.hasAttribute("closing");
await until(() => !document.getElementById("zia-welcome"));
done({
  shown,
  closing,
  closed: !document.getElementById("zia-welcome"),
  checks: { "the tour opened": shown.open && !!shown.src, "the setting turned itself off": shown.prefTurnedOff, "it closed": !document.getElementById("zia-welcome") },
  ziaErrors: ziaErrors(),
});
