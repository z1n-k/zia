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
![Zia](https://github.com/user-attachments/assets/998f92b8-74ea-4bac-8131-6ab4a9993ab7)

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
| 🗂️ [**Sidebar**](#the-sidebar) | Essential tiles, coloured folders, smooth dragging, hover cards, 5,166 icons |
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
- A paperclip beside site settings copies the page's link and pops into a tick.
- The whole bar can move to the **bottom**, under the page, opening upwards, in a single page or a split.

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
- A collapsed folder with an open tab shows just that tab, glow and all.
- **Cmd/Ctrl+Z** reopens what you just closed, for ten seconds: whole folders, splits and groups of tabs come back as they were, a deleted folder with its name.
- Asleep tabs can be dimmed (tabs, essentials, and folders whose tabs are all asleep).
- Zen's pop-up notices get a close button, so they don't have to be waited out.
- Downloads sit next to the space name with a progress ring.

</details>

<details>
<summary>Folders</summary>

- Hover boxes, a gentle spring when they open and close, icon or emoji covers, and an × to delete them.
- A colour of their own from the right-click menu that tints the whole folder.
- An empty folder shows a dashed *Drag tabs here* slot until its first tab arrives.
- Plain tab groups, like the ones [Advanced Tab Groups](https://github.com/Vertex-Mods/Advanced-Tab-Groups) makes, get the same treatment.

<img src="https://raw.githubusercontent.com/z1n-k/zia/readme-images/folder-empty.png" alt="A tinted empty folder with its Drag tabs here slot" width="360">

</details>

<details>
<summary>Icons: 5,166 of them</summary>

Covers come from an icon picker Zia adds beside Zen's own: 5,166 [Tabler](https://tabler.io/icons) icons, in outline or (for about a thousand) solid. The search knows each icon's tags, so *money* finds cash, coins and wallets. Zen's emojis are still there.

<img src="https://raw.githubusercontent.com/z1n-k/zia/readme-images/icon-picker.png" alt="The icon picker with Tabler icons in solid style" width="474">

</details>

<details>
<summary>Glance</summary>

[Glance](https://docs.zen-browser.app/user-manual/glance), Zen's link preview (Alt-click a link, or Option-click on macOS), gets its own look. From an essential, a small card springs out from behind it and is sucked back in when you close the glance; from a tab, the glanced site sits as a small tile at the tab's end.

<p>
  <img src="https://raw.githubusercontent.com/z1n-k/zia/readme-images/glance-essential.png" alt="A glance card fanned out from an essential" width="49%">
  <img src="https://raw.githubusercontent.com/z1n-k/zia/readme-images/glance-tab.png" alt="A glance tile at the end of a tab" width="49%">
</p>

</details>

<details>
<summary>Split essentials (experimental)</summary>

Keep a split of two sites as one essential: drag a two-site split onto the essentials, or right-click one of its tabs and choose **Add Split to Essentials**. The tile shows both sites; click it and the split opens at the half you clicked. While it's open the tile (and its hover card) takes the colour of the half you're in. Drag it back to the tab list and it's an ordinary split again. Zen can't hold a split among its essentials yet, so Zia keeps it as two tabs hidden from the tab list.

<!-- IMAGE split-essential.webp (800×500): a split essential tile beside ordinary ones -->

</details>

### Glass

The compact sidebar, the hover cards and the address pop-up are frosted glass: slightly see-through, with the page blurred behind them. Each can be switched back to solid.

![The compact sidebar as frosted glass over a photo](<https://raw.githubusercontent.com/z1n-k/zia/readme-images/glass-compact-sidebar.webp>)

<p>
  <img src="https://raw.githubusercontent.com/z1n-k/zia/readme-images/glass-hover-card.png" alt="A tab's hover card as frosted glass" width="38%">
  <img src="https://raw.githubusercontent.com/z1n-k/zia/readme-images/glass-address-pop-up.webp" alt="The address bar pop-up as frosted glass over a photo" width="60%">
</p>

### Split view

Drag a tab over the page and drop cards rise on either side, growing and turning blue as you near the edge. Let go and each site gets its own toolbar, address and controls.

![Dragging a tab into a split](https://github.com/user-attachments/assets/50fed722-962c-4af6-9979-18800ae01a50)

<details>
<summary>More</summary>

- Even spacing and a frame around the pair.
- Your pinned extensions sit in the focused pane's toolbar and move with the focus.

![Two sites in split view](https://github.com/user-attachments/assets/5318d0ce-d6b3-4adb-aef9-56ffbed72ae9)

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

- **Controls:** Back to Tab and Close at the top with the site between them; big 15-second skip and play/pause buttons in the middle; speaker, volume line and time in the bottom left; a thin progress line along the bottom.
- **Tucking:** tuck into the left or right side, the bottom, or a bottom corner. Let go with a good part of the window off the edge, or flick it, and it springs the rest of the way, leaving a slim frosted strip (or a small frosted corner). A throw near a corner is pulled into it.
- The tuck button beside Close uses your default spot; the arrow beside it opens a map of the screen to pick one or change the default.
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
| Find in page bar | on |
| Icon picker (5,166 Tabler icons, outline and solid) | on |
| Undo a closed tab with Cmd/Ctrl+Z | on |
| Tab and folder hover cards | on |
| Hover cards are slightly see-through, with what's behind them blurred | on |
| Name new folders and choose their icons with a local model ([see above](#folder-names-and-icons)) | off |
| **Tabs** | |
| Sound bars on playing tabs (off: Zen's speaker) | on |
| Tint the selected tab's glow and the sound bars with the site's colours | off |
| The last essential stretches across the rest of its row | off |
| Split essentials (experimental): drag a two-site split onto the essentials | on |
| Asleep (unloaded) tabs, essentials and folders look dimmed | off |
| Compact mode's sidebar is slightly see-through, with the page blurred behind it | on |
| **Page** | |
| Toolbar takes the colour of the site (off: the theme's colour) | on |
| Zia's rounded page corners (off: Zen's own) | on |
| Split view drop cards when dragging a tab onto the page (off: Zen's own) | on |
| PDFs open in Zia's viewer look (off: Firefox's own) | on |
| **Address bar** | |
| Zia's address bar pop-up (off: Zen's own) | on |
| Address bar pop-up takes the toolbar's colour as it opens (needs the site-coloured toolbar) | off |
| Address bar pop-up is slightly see-through, with the page blurred behind it | on |
| Address bar position: top or bottom (not with Zen's single toolbar) | top |
| **New tabs** | |
| Cmd/Ctrl+T and **+ New Tab** open a real tab (off: Zen's floating address bar) | on |
| New tabs open your default search engine's page | on |
| **Folders** | |
| Folders open and close with a gentle spring | on |
| **Loading bar** | |
| Use Zen's accent colour for the loading bar (off: Zia blue) | off |
| **Picture-in-picture** | |
| Zia's picture-in-picture controls (off: Firefox's own) | on |
| Tuck picture-in-picture into the side of the screen | on |
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
