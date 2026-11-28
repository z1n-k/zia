// uses: film.js
// 4 Folders, macro (run at devPixelsPerPx 5): one folder's glass icon filling, a sheet for each
// tab, then past three turning into the glass archive box. The folder's row alone is captured.
await stage();
const tabs = await addTabs(["Notion", "Framer", "Raycast", "Arc", "Anthropic", "Linear"]);
const folder = gZenFolders.createFolder([tabs[0]], { label: "Reading", renameFolder: false });
await realWait(1200);
folder.collapsed = true;
await realWait(1200);
const row = folder.querySelector(".tab-group-label-container") || folder;
const r = row.getBoundingClientRect();
const area = { x: Math.max(0, r.left - 6), y: Math.max(0, r.top - 10), width: Math.round(Math.min(r.width + 12, 230)), height: Math.round(r.height + 20) };
const cues = {};
tabs.slice(1, 5).forEach((tab, i) => (cues[0.5 + i * 0.75] = async () => { folder.addTabs([tab]); folder.collapsed = true; await realWait(150); }));
await film("4-archive", 0.5 + 4 * 0.75 + 0.9, cues, area);
done({ area, checks: {} });
