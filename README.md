<!--
  Images live on the readme-images branch; docs/readme-images.md lists every
  slot with its size and what it shows. Slots still waiting for their final
  image are marked IMAGE: drop the file in with that name and swap the
  comment for the image.
-->

<div align="center">

<!-- IMAGE logo.svg: the Zia mark, about 96px tall, readable on dark and light -->

# Zia

**Zen Browser, rebuilt with a Dia-inspired finish.**

A [Sine](https://github.com/CosmoCreeper/Sine) mod that redesigns Zen from the frame in:<br>
the page, the toolbar, the sidebar, the address bar, PDFs, media and picture-in-picture.

![Status](https://img.shields.io/badge/status-beta-yellow)
![Platform](https://img.shields.io/badge/tested%20on-macOS%20%C2%B7%20Windows%20%C2%B7%20Linux-informational)
![Licence](https://img.shields.io/badge/licence-MIT-blue)

[Install](#install) · [Features](#features) · [Options](#options) · [Changelog](CHANGELOG.md)

</div>

<!-- IMAGE hero.webp (1600×1000): replaces the image below -->
![Zia](https://raw.githubusercontent.com/z1n-k/zia/readme-images/hero.webp)

> [!NOTE]
> **Beta.** Tested on macOS, Windows and Linux in dark mode with the **Sidebar and Top Toolbar** layout. Light mode and Zen's other layouts get less testing: if something looks off, [open an issue](https://github.com/z1n-k/zia/issues) with a screenshot.

## Install

1. Install [Sine](https://github.com/CosmoCreeper/Sine).
2. In Zen, go to **Settings → Sine Mods**, open Sine's settings and turn on **installing JS from unofficial sources** (Zia is a JavaScript mod).
3. Paste `z1n-k/zia` into the box under the marketplace.
4. Restart Zen when Sine asks. If Zia doesn't load, open `about:support` and click **Clear startup cache**.

Then set **Look and Feel → Sidebar and Top Toolbar** and use dark mode. Updates arrive through Sine; the first start after one takes a moment while Zia sets up its icons.

**Worth five minutes:** workspace and folder icons carry much of the look. ▶ [Setting up workspace icons](https://vimeo.com/1228144298)

<details>
<summary>Using other mods too</summary>

Other mods may conflict, and Zia won't be adjusted around them. If something looks off, turn your other mods off and add them back one at a time.

</details>

## Features

| | |
| --- | --- |
| 🎨 [**Site-coloured toolbar**](#the-page-and-the-toolbar) | One rounded card with the page, always readable, animated navigation |
| 🔎 [**Address bar**](#the-address-bar) | A pared-back pop-up, at the top or the bottom |
| 🗂️ [**Sidebar**](#the-sidebar) | Essential tiles, coloured folders, smooth dragging, hover cards, 5,166 icons or your own SVGs |
| 🧊 [**Glass**](#glass) | Compact sidebar, hover cards and address pop-up frosted over the page |
| ⬛ [**Split view**](#split-view) | Drop cards to make a split, a toolbar for each pane |
| 🎵 [**Music**](#music) | A player card with the artwork's glow, sound bars on playing tabs |
| 🖼️ [**Picture-in-picture**](#picture-in-picture) | New controls, and throw it off the screen's edge to tuck it away |
| 📺 [**Multiview**](#multiview) | One tab that grids up to four videos or live streams |
| 📄 [**PDF viewer**](#pdf-view) | A cleaner toolbar and page sidebar |
| ✨ [**Smart folders**](#folder-names-and-icons) | Folders named and given icons by a model on your machine |

Nearly all of it can be [switched off](#options).

### The page and the toolbar

The page and toolbar share one rounded card, and the toolbar takes the colour of the site you're on, light or dark, and stays readable on it.

<p>
  <img src="https://raw.githubusercontent.com/z1n-k/zia/readme-images/toolbar-light.webp" alt="The toolbar on a light page" width="49%">
  <img src="https://raw.githubusercontent.com/z1n-k/zia/readme-images/toolbar-dark.webp" alt="The toolbar on a dark page" width="49%">
</p>

<!-- IMAGE nav-buttons.gif (800×200, ~4s loop): back, forward and reload animating -->

<details>
<summary>More</summary>

- The colour follows the page as you scroll. Text and buttons stay readable: dark on light sites, white on dark ones, and full white with nothing faint on strong colours like a bright red.
- Colours are remembered per site, so pages open already in their colour. Every few seconds Zia checks again, so a header that recolours itself after loading, or a first reading that was off, is corrected.
- While a page loads, a glow runs along the address bar. The address reads as `domain / title`; hover it for the full URL.
- Right-click an extension's button and choose **Change icon** to give it an SVG of your own or one of Zia's icons, tinted to match the toolbar (or kept in its own colours). Zia warns you if the extension changes its own icon, since a custom one hides that.
- Back and forward squeeze on hover and slide away when clicked as a fresh arrow slides in. Hover reload and its arrowhead draws back round the circle; a load spins it into a stop cross that turns back into the arrow when the page is done. With nowhere to go, back and forward fade to dim rather than snapping.

</details>

### The address bar

Short rows, one size of text, and none of Firefox's chips, row menus or extra engine bars.

<!-- IMAGE address-bar.webp (1600×900): the pop-up open, typing an address -->

<details>
<summary>More</summary>

- What you type lines up exactly with the results underneath.
- It can take the toolbar's colour as it opens, so it reads as the same bar growing.
- As you type an address, the site's own icon replaces the magnifying glass.
- Suggestions for tabs you already have open are marked **Switch to tab**.
- Optionally, the bar shows just the page's title, in the site's colour, until you click it.
- A paperclip beside site settings copies the page's link and pops into a tick.
- The whole bar can move to the **bottom**, under the page, opening upwards, in a single page or a split.
- Optionally, its text sits centred instead of starting from the left.

</details>

### The sidebar

Essentials sit as tiles, four to a row (six when the sidebar is wide). A space's colour carries through the whole sidebar, and folders get colours, covers and a gentle spring.

<p>
  <img src="https://github.com/user-attachments/assets/0c439e9d-651e-414c-8b85-d5bc8308aef4" alt="Essentials and folders in the sidebar" width="49%">
  <img src="https://github.com/user-attachments/assets/2b8748a4-d7fc-4ef0-a5b3-41ab3243e83b" alt="A coloured space carried through the sidebar" width="49%">
</p>

<!-- IMAGE tab-drag.gif (600×900, ~5s): a tab dragged into a folder, then onto the essentials, where it becomes a tile -->

<details>
<summary>Tabs and dragging</summary>

- The dragged tab follows the pointer while the rows it passes slide aside; a folder opens up by a row to make room.
- Over the essentials a tab turns into the tile it's about to become; drag an essential back off and it's a tab again.
- Hovering a tab shows a card with its title, address and a few actions (pin as an essential, split, copy the link). Hovering a collapsed folder lists what's inside.
- A collapsed folder with an open tab shows just that tab, glow and all. Collapse a whole space by clicking its name and a folder holding the open tab keeps its name above it.
- Tabs you're not on are a little dimmer, as in Dia, and go white once selected.
- Dragging gives a haptic tap on a trackpad as rows move, as you cross the separator, and as you go into or out of a folder.
- **Cmd/Ctrl+Z** reopens what you just closed, for ten seconds: whole folders, splits and groups of tabs come back as they were, a deleted folder with its name.
- Asleep tabs can be dimmed (tabs, essentials, and folders whose tabs are all asleep).
- Zen's pop-up notices get a close button, so they don't have to be waited out.
- Downloads sit next to the space name with a progress ring.

</details>

<details>
<summary>Numbered tabs</summary>

Hold **Cmd** (**Ctrl** on Windows and Linux) and every tab and essential shows its number. Type a number and its key lights up, in Zia blue or your space's colour; let go and you're there, so nothing loads by accident. They only show while you hold the key, so there's nothing extra the rest of the time. Tabs past nine are reachable too: keep holding and type the digits in turn, so **Cmd+1+2** then letting go takes you to tab 12. They can show all the time instead, or be switched off.

<img src="https://raw.githubusercontent.com/z1n-k/zia/readme-images/tab-numbers.webp" alt="Holding Cmd: each essential and tab shows its number" width="300">

</details>

<details>
<summary>Folders</summary>

- Hover boxes, icon or emoji covers, and an × to delete them.
- They open and close as in Dia: the tabs stay where they are while the folder opens over them, and fade out in place as it closes, with a gentle spring (or without).
- A colour of their own from the right-click menu that tints the whole folder, or, if you prefer, only when it's hovered or open. Optionally, the card of tabs shown on hovering a closed folder takes its colour too.
- An empty folder shows a dashed *Drag tabs here* slot until its first tab arrives.
- Plain tab groups, like the ones [Advanced Tab Groups](https://github.com/Vertex-Mods/Advanced-Tab-Groups) makes, get the same treatment.

<img src="https://raw.githubusercontent.com/z1n-k/zia/readme-images/folder-empty.png" alt="A tinted empty folder with its Drag tabs here slot" width="360">

</details>

<details>
<summary>Icons: 5,166 of them, or your own</summary>

Covers come from an icon picker Zia adds beside Zen's own: 5,166 [Tabler](https://tabler.io/icons) icons, in outline or (for about a thousand) solid. The search knows each icon's tags, so *money* finds cash, coins and wallets. Zen's emojis are still there. Right-click a folder or space and choose **Change icon → Choose an SVG…** to give it an icon of your own, tinted to match the sidebar like the rest (or kept in its own colours).

<img src="https://raw.githubusercontent.com/z1n-k/zia/readme-images/icon-picker.png" alt="The icon picker with Tabler icons in solid style" width="474">

</details>

<details>
<summary>Glance</summary>

[Glance](https://docs.zen-browser.app/user-manual/glance), Zen's link preview (Alt-click a link, or Option-click on macOS), gets its own look. From an essential, a small card springs out from behind it and is sucked back in when you close the glance; from a tab, a small picture of the glanced page bounces up out of the tab and sits tipped at its end, tucked under its edge, as in Dia. Hover the tab and the picture tips further and dims under the close button, which closes the glance first, then the tab. The picture can be switched off in settings.

<p>
  <img src="https://raw.githubusercontent.com/z1n-k/zia/readme-images/glance-essential.png" alt="A glance card fanned out from an essential" width="49%">
  <img src="https://raw.githubusercontent.com/z1n-k/zia/readme-images/glance-tab-picture.png" alt="A tipped picture of a glanced page at the end of a tab" width="49%">
</p>

</details>

<details>
<summary>Split essentials (experimental)</summary>

Keep a split of two sites as one essential: drag a two-site split onto the essentials, or right-click one of its tabs and choose **Add Split to Essentials**. The tile shows both sites; click it and the split opens at the half you clicked. While it's open the tile (and its hover card) takes the colour of the half you're in. Drag it back to the tab list and it's an ordinary split again. Zen can't hold a split among its essentials yet, so Zia keeps it as two tabs hidden from the tab list.

<!-- IMAGE split-essential.webp (800×500): a split essential tile beside ordinary ones -->

</details>

### Bookmarks and History

Firefox's Bookmarks, History and Synced Tabs panels become a second sidebar on the other side of the page, full height on the window's own background. They're measured off your tabs, so the text, rows, spacing and highlights are the tabs' own, and the title takes your space's colour. Open them with **Cmd+B** (Bookmarks), **Cmd+Shift+H** (History), or **View > Sidebar**, and drag the gap beside the page to resize.

![The Bookmarks panel as a second sidebar beside the page](https://raw.githubusercontent.com/z1n-k/zia/readme-images/sidebar-panels.webp)

### Glass

The compact sidebar, the hover cards and the address pop-up are frosted glass: slightly see-through, with the page blurred behind them. Each can be switched back to solid.

![The compact sidebar as frosted glass over a photo](<https://raw.githubusercontent.com/z1n-k/zia/readme-images/glass-compact-sidebar.webp>)

![The address bar pop-up as frosted glass over a photo](<https://raw.githubusercontent.com/z1n-k/zia/readme-images/glass-address-pop-up.webp>)

<details>
<summary>The hover cards</summary>

<img src="https://raw.githubusercontent.com/z1n-k/zia/readme-images/glass-hover-card.png" alt="A tab's hover card as frosted glass" width="520">

</details>

### Split view

Drag a tab over the page and drop cards rise on either side, growing and turning blue as you near the edge. Let go and each site gets its own toolbar, address and controls.

![Dragging a tab into a split](https://github.com/user-attachments/assets/50fed722-962c-4af6-9979-18800ae01a50)

![Two sites in split view, each with its own toolbar and address](https://github.com/user-attachments/assets/5318d0ce-d6b3-4adb-aef9-56ffbed72ae9)

<details>
<summary>More</summary>

- Even spacing and a frame around the pair.
- Your pinned extensions sit in the focused pane's toolbar and move with the focus.

</details>

### Music

Playing music brings up a card with the track's artwork and a soft glow in its colours, for live streams as well as ordinary videos. Playing tabs and essentials get sound bars instead of Zen's speaker: dots when muted, and a click toggles the sound.

![The music player card](https://github.com/user-attachments/assets/5b4e2542-61a9-4fd6-b2ee-7fb58970ef5b)

### Picture-in-picture

Just the video at rest; hover for the controls. Need the screen back? Throw the window off an edge and it tucks away into a slim frosted strip.

<p>
  <img src="https://raw.githubusercontent.com/z1n-k/zia/readme-images/pip-controls.webp" alt="Picture-in-picture with its controls" width="72%">
  <img src="https://raw.githubusercontent.com/z1n-k/zia/readme-images/pip-tucked.png" alt="Picture-in-picture tucked into the side of the screen" width="22%">
</p>

<!-- IMAGE pip-tuck.gif (1200×700, ~5s): the window thrown at the edge, tucking, then pulled back out -->

<details>
<summary>More</summary>

- **Controls:** Back to Tab, Minimise (away, still playing in its tab) and Close at the top with the site between them; big 15-second skip and play/pause buttons in the middle; speaker, volume line and time in the bottom left; a thin progress line along the bottom.
- **Tucking:** tuck into the left or right side, the bottom, or a bottom corner. Let go with a good part of the window off the edge, or flick it, and it springs the rest of the way, leaving a slim frosted strip (or a small frosted corner). A throw near a corner is pulled into it.
- The tuck button beside Close uses your default spot; right-click it for a map of the screen to pick one or change the default.
- The music card stays in the sidebar while its video plays in picture-in-picture, and the window has rounded corners on Windows 11 too.
- With more than one screen, edges your screens share are skipped, so it never hides onto another screen.
- Hover the strip and the video peeks out; click it, or drag it out, and it stays out until you tuck it again. Drag the strip along its side to move it; near the bottom it snaps into the corner.
- There are no top spots: macOS won't move a window up past the top of the screen.

</details>

### Multiview

Right-click any video, a video's page or its tab and choose **Add to Multiview**: up to four videos share one tab, re-tiling to the biggest size that fits. Made for following several live streams at once.

![Multiview with sport, scenery and two live streams](<https://raw.githubusercontent.com/z1n-k/zia/readme-images/multiview-wall.webp>)

<details>
<summary>More</summary>

- After four, the item becomes **Replace in Multiview**, so you pick which video the new one replaces.
- Hover a tile to drag it to a new spot, make it the big one with the rest in a row beneath, give it the sound (one tile plays at a time, marked with a white ring), open it on its site or remove it. With two videos, one button puts them side by side or stacked.
- Videos pick up where you were; live streams join live.
- The tab's grid icon fills a square for each video, in Zia's blue or your space's colour.
- Works with **YouTube, Twitch** (live, videos and clips), **Kick, Vimeo, Dailymotion** and plain video files. Copy-protected sites (Netflix, sports services) can't be added.
- The page is hosted on this repo's [GitHub Pages](https://z1n-k.github.io/zia/multiview/), because YouTube and Twitch only play embeds on a real web address. Your list lives in the page's own address, so it survives a restart and is never sent anywhere.

<p>
  <img src="https://raw.githubusercontent.com/z1n-k/zia/readme-images/multiview-menu.webp" alt="Add to Multiview in a video's right-click menu" width="49%">
  <img src="https://raw.githubusercontent.com/z1n-k/zia/readme-images/multiview-tile.webp" alt="A Multiview tile on hover" width="49%">
</p>

</details>

### PDF view

A grey toolbar with the document's name on the left, page and zoom in the middle, and download and print on the right. The sidebar is just the pages.

![A PDF in Zia's viewer](<https://raw.githubusercontent.com/z1n-k/zia/readme-images/pdf-view.webp>)

<details>
<summary>More</summary>

- Beside page and zoom: fit to page, rotate and undo/redo; more on the right.
- The pen opens a second row with Firefox's tools: draw, highlight, text, signature, image and comment.
- The current page is framed in blue in the sidebar.

</details>

### Folder names and icons

Make a folder and Zia can name it and pick its icon with a model that runs on your machine: Levi's, Gucci and Louis Vuitton become **Clothing**; PayPal, Stripe and Cash App become **Financial**. A folder that's mostly one site gets that site's logo. Nothing is sent anywhere.

<!-- IMAGE folder-naming.gif (600×400, ~4s): three tabs grouped, the name and icon filling in -->

<details>
<summary>Turn it on (off by default)</summary>

The first use downloads a model (about 25MB).

1. Open `about:config` and set **`browser.ml.enable`** to `true` (Firefox's local AI runtime, which Zen ships switched off).
2. Restart Zen.
3. In **Settings → Sine Mods → Zia**, turn on **Name new folders and choose their icons with a local model**.

The first folder takes a little while as the model downloads and the icon names are read once; after that it's immediate, and the icon names are cached in your profile. It only fills in a folder that has no icon and still has its default name, so anything you've named or chosen is left alone. Groups made with Advanced Tab Groups get the same treatment, with the icon saved through that mod.

</details>

## Options

**Settings → Sine Mods → Zia.** Almost every part of Zia can be switched on or off on its own. Styling changes apply straight away; the ones that change behaviour need a restart.

<details>
<summary>All settings and their defaults</summary>

| Setting | Default |
| --- | --- |
| **Features** | |
| Music player card | on |
| Music player card stays when you send its video to picture-in-picture | on |
| Music player shows a YouTube channel's picture instead of the video's thumbnail | off |
| Find in page bar | on |
| Icon picker (5,166 Tabler icons, outline and solid) | on |
| Undo a closed tab with Cmd/Ctrl+Z | on |
| Hold Cmd/Ctrl to show each tab's number, and go to it by number | on |
| Tab numbers show all the time | off |
| Colour of the tab number you type: Zia blue or the space's colour | Zia blue |
| A glance shows on its tab as a small picture of the page, as in Dia | on |
| Bookmarks, History and Synced Tabs panels in Zia's look | on |
| Bookmarks, History and Synced Tabs panels beside the page, full height, as a second sidebar | on |
| Show the welcome tour after updates that bring something new | on |
| Show the welcome tour again (turns itself back off) | off |
| Tab and folder hover cards | on |
| Hover cards are slightly see-through, with what's behind them blurred | on |
| Name new folders and choose their icons with a local model ([see above](#folder-names-and-icons)) | off |
| **Tabs** | |
| Sound bars on playing tabs (off: Zen's speaker) | on |
| Sound bars always move, even when your system asks for less motion | off |
| Tint the selected tab's glow and the sound bars with the site's colours | off |
| Essentials are Zia's narrower tiles (off: Zen's own widths) | on |
| The last essential stretches across the rest of its row | off |
| Split essentials (experimental): drag a two-site split onto the essentials | on |
| Asleep (unloaded) tabs, essentials and folders look dimmed | off |
| Compact mode's sidebar is slightly see-through, with the page blurred behind it | on |
| Compact mode hides the top toolbar while the sidebar is out (off: it stays, cut away under the sidebar) | off |
| **Page** | |
| Toolbar takes the colour of the site (off: the theme's colour) | on |
| Zia's rounded page corners (off: Zen's own) | on |
| Split view drop cards when dragging a tab onto the page (off: Zen's own) | on |
| PDFs open in Zia's viewer look (off: Firefox's own) | on |
| Hide the window buttons (minimise, maximise, close) on Windows and Linux | off |
| Windows window buttons just dim on hover (off: Windows' own blocks, red behind close, as in Dia) | off |
| **Address bar** | |
| Zia's address bar pop-up (off: Zen's own) | on |
| Address bar pop-up takes the toolbar's colour as it opens (needs the site-coloured toolbar) | off |
| Address bar pop-up is slightly see-through, with the page blurred behind it | on |
| Address bar shows only the page's title, in the domain's colour, until clicked | off |
| Address bar text is centred | off |
| Address bar position: top or bottom (not with Zen's single toolbar) | top |
| **New tabs** | |
| Cmd/Ctrl+T and **+ New Tab** open a real tab (off: Zen's floating address bar) | on |
| New tabs open your default search engine's page (off: Zen's new tab page, or an extension's if you use one) | on |
| **Folders** | |
| Folders open and close with a gentle spring | on |
| Coloured folders only show their colour when hovered or open | off |
| A coloured folder's card (its tabs, shown on hover) takes the folder's colour | off |
| **Loading bar** | |
| Use Zen's accent colour for the loading bar (off: Zia blue) | off |
| **Picture-in-picture** | |
| Zia's picture-in-picture controls (off: Firefox's own) | on |
| Push picture-in-picture against the side of the screen to tuck it away | on |
| Picture-in-picture tucks into (the nearest side, a side, the bottom or a bottom corner) | the nearest side |
| **Multiview** | |
| **Add to Multiview** on videos and tabs | on |
| Multiview tab icon colour: Zia blue or the space's colour | Zia blue |

</details>

<details>
<summary>Zen settings Zia changes</summary>

Only at the default level: if you've set either yourself in `about:config`, your choice is kept.

- `zen.widget.mac.mono-window-controls` → off, for native macOS window buttons.
- `zen.urlbar.replace-newtab` → off, so **+ New Tab** and Cmd+T open a real tab. Turn off **Cmd/Ctrl+T and + New Tab open a real tab** to get Zen's floating address bar back.

</details>

## Known gaps

- Light mode and Zen's layouts other than **Sidebar and Top Toolbar** are less polished.
- Split essentials are experimental: Zen doesn't support them itself yet, so Zia works around it.
- If your system is set to reduce motion, Zia keeps still too: the sound bars stop moving, and slides, springs and other animations are skipped or cut short. See below to turn it back on for Zen alone.

<details>
<summary>Animations or sound bars not moving? Reduced motion</summary>

Zia follows your system's reduced-motion setting, which is often switched on for speed rather than comfort:

- **macOS:** System Settings → Accessibility → Display → **Reduce motion**.
- **Windows 11:** Settings → Accessibility → Visual effects → **Animation effects** (off means reduced). On Windows 10: Settings → Ease of Access → Display → **Show animations in Windows**.
- **Linux (GNOME):** Settings → Accessibility → **Reduce Animation**, or `gsettings set org.gnome.desktop.interface enable-animations true` to turn animations back on. Other desktops: the "animations" setting in their appearance or accessibility settings, which most pass on to apps.

To keep your system as it is but let Zen animate, open `about:config`, add a **Number** setting named `ui.prefersReducedMotion` and set it to `0` (or `1` to always reduce motion in Zen). Restart Zen. Just the sound bars: turn on **Sound bars always move** in Zia's settings.

</details>

<details>
<summary>For developers: how the source is laid out</summary>

`zia.uc.js` and `chrome.css` are built from per-feature parts, so each feature can be read and changed on its own:

- `src/js/`: the script, one file per feature (address bar, sidebar edges, split panes, picture-in-picture, Multiview, tab dragging and so on).
- `src/css/`: the styles, in the order they apply.

Edit the parts, then run `scripts/build.sh` to rebuild both files. `scripts/build.sh --check` (also run on every push) fails if the built files and the parts disagree. The parts, the build script and the Multiview page aren't part of what Sine installs.

The icons ship as one compact file, `icons/tabler-bundle.js`, from which Zia makes a zip in your Zen profile (`zia-icons`, once per icon update) and reads the icons from, so installing and updating doesn't unpack thousands of files and the download stays small. `scripts/tabler-icons.py` makes it from the npm package.

</details>

## Credits

- Icons: [Tabler Icons](https://tabler.io/icons) (MIT, licence in `icons/tabler-LICENSE`), recoloured to follow Zen's icon colour and otherwise unchanged.
- The bleeding-corners technique was inspired by [Bleeding Corners Fix](https://github.com/rsiebertdev/zen-themes/tree/main/bleeding-corners-fix) by rsiebertdev; Zia uses its own implementation, matched to its card shape.

Zia is an independent, unofficial project. It isn't affiliated with or endorsed by any other browser or its makers, and contains no code or assets from one. It's a Zen Browser theme, designed and built from scratch.

**Licence:** [MIT](LICENSE)
