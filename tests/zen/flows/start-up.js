// Zia starting: what it marks on the window, the elements it adds, and no errors
await wait(500);
const root = document.documentElement;
done({
  marks: [...root.attributes].map((a) => a.name).filter((n) => n.startsWith("zia")).sort(),
  added: [...document.querySelectorAll("[id^='zia-']")].map((el) => el.id).sort(),
  styleVars: [...root.style].filter((p) => p.startsWith("--zia")).sort(),
  // (what the run's on: a change here explains other differences)
  zen: Services.appinfo.version,
  sine: JSON.parse(await IOUtils.readUTF8(PathUtils.join(PathUtils.profileDir, "chrome", "JS", "engine.json"))).version,
  checks: { "Zia loaded": !!window.__ziaLoaded },
  ziaErrors: ziaErrors(),
});
