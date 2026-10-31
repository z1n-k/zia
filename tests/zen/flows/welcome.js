// The welcome tour, shown again from settings (zia.welcome.again): its overlay opens over
// the window with the tour page, and closes once the page says it's done
Services.prefs.setBoolPref("zia.welcome.again", true);
await wait(1200);
const overlay = document.getElementById("zia-welcome");
const frame = overlay?.querySelector("iframe");
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
frame?.contentDocument?.documentElement?.setAttribute("data-zia-welcome", JSON.stringify({ action: "done" }));
await wait(400);
const closing = !!overlay?.hasAttribute("closing");
await wait(600);
done({
  shown,
  closing,
  closed: !document.getElementById("zia-welcome"),
  checks: { "the tour opened": shown.open && !!shown.src, "the setting turned itself off": shown.prefTurnedOff, "it closed": !document.getElementById("zia-welcome") },
  ziaErrors: ziaErrors(),
});
