// uses: film.js
// Trial: a folder springing open and shut, filmed a frame at a time.
await stage();
const [a, b, x, y, z] = await addTabs(["GitHub", "YouTube", "Figma", "Linear", "Notion"]);
const folder = gZenFolders.createFolder([x, y, z], { label: "Design", renameFolder: false });
gBrowser.selectedTab = a;
await atRest();
folder.collapsed = true;
await until(() => folder.hasAttribute("collapsed"));
await atRest();
await realWait(500);
const frames = await film("folder", 2.2, {
  0.2: () => { folder.collapsed = false; },
  1.2: () => { folder.collapsed = true; },
});
done({ frames, screen: [screen.width, screen.height, devicePixelRatio], checks: {} });
