# Zia

**Zen Browser, rebuilt with a Dia-inspired finish.**

Zia is a [Sine](https://github.com/CosmoCreeper/Sine) mod that reworks Zen from the frame in. The page sits in a rounded card, the toolbar takes on the colour of whatever site you're on, and the sidebar, address bar, PDFs, media and picture-in-picture are all redesigned to match. It takes its cues from [Dia](https://www.diabrowser.com) and then keeps going: the music player, Multiview and picture-in-picture tucking are Zia's own, and Dia has nothing like them.

![Status](https://img.shields.io/badge/status-beta-yellow)
![Platform](https://img.shields.io/badge/tested%20on-macOS%20%C2%B7%20Windows%20%C2%B7%20Linux-informational)
![Licence](https://img.shields.io/badge/licence-MIT-blue)

What's new in each release: [CHANGELOG.md](CHANGELOG.md).

> **Beta.** Tested on macOS, Windows and Linux in dark mode, with the **Sidebar and Top Toolbar** layout. Light mode and Zen's other layouts get less testing, so if something looks off there, [open an issue](https://github.com/z1n-k/zia/issues) with a screenshot.

**At a glance**

- [A site-coloured toolbar](#the-page-and-the-toolbar) in one rounded card with the page, always readable, with Dia's back, forward and reload animations
- [Dia's address bar pop-up](#the-address-bar), at the top or the bottom
- [Dia's PDF viewer look](#pdf-view)
- [Picture-in-picture](#picture-in-picture) with Dia's controls, that you can throw off the edge of the screen to tuck away
- [Multiview](#multiview): a tab that grids up to four videos and live streams
- [A redesigned sidebar](#the-sidebar): essential tiles, coloured folders, Dia-style tab dragging, hover cards, Glance and 5,166 icons
- [Glass](#glass): the compact sidebar, hover cards and address bar pop-up frosted over the page
- [Split view](#split-view) with drop cards and a toolbar per pane
- [A music player card](#music) and sound bars on playing tabs
- [Folders that name themselves](#folder-names-and-icons-from-a-local-model), with a model that runs on your machine
- [Nearly everything can be switched off](#options)

---

![Zia](https://github.com/user-attachments/assets/998f92b8-74ea-4bac-8131-6ab4a9993ab7)

Split view: drag a tab over the page and drop cards rise on either side, growing and turning blue as you near the edge.

![Dragging a tab into a split](https://github.com/user-attachments/assets/50fed722-962c-4af6-9979-18800ae01a50)

Let go and both sites sit side by side, each with its own toolbar, address and controls:

![Two sites in split view](https://github.com/user-attachments/assets/5318d0ce-d6b3-4adb-aef9-56ffbed72ae9)

The toolbar takes on the colour of the site underneath, light or dark:

![The toolbar on a light page](<https://raw.githubusercontent.com/z1n-k/zia/readme-images/toolbar-light.webp>)

![The toolbar on a dark page](<https://raw.githubusercontent.com/z1n-k/zia/readme-images/toolbar-dark.webp>)

A space's colour carries through the whole sidebar:

![A coloured space](https://github.com/user-attachments/assets/2b8748a4-d7fc-4ef0-a5b3-41ab3243e83b)

---

## Install

Zia is a JavaScript mod, so Sine needs permission to load scripts from outside its marketplace.

1. Install [Sine](https://github.com/CosmoCreeper/Sine).
2. In Zen: **Settings → Sine Mods**, open Sine's settings, turn on **installing JS from unofficial sources**.
3. Paste this into the box under the marketplace:

   ```
   z1n-k/zia
   ```

4. Restart Zen when Sine asks. If the mod doesn't load, open `about:support` and click **Clear startup cache**.

**Set Look and Feel → Sidebar and Top Toolbar**, and use dark mode.

Updates come through Sine like any other mod. The first start after installing takes a moment longer while Zia sets up its icons; after that it's instant.

Other mods may conflict, and Zia won't be adjusted around them. If something looks off, turn your other mods off and add them back one at a time.

### Workspace icons

Workspace and folder icons do a lot of the work in the Dia look, so they're worth five minutes.

▶ **[Zia: setting up workspace icons](https://vimeo.com/1228144298)**

---

## What it does

### The page and the toolbar

The page and toolbar sit together in one rounded card. The toolbar picks up the colour of the site underneath and follows it as you scroll. Its text and buttons always stay readable: dark on light sites, white on dark ones, and full white with nothing left faint on strong colours like a bright red. Colours are remembered per site, so pages open already in their colour instead of fading into it. Every few seconds Zia checks the colour against the page again, and if the page has changed (a header that recolours itself after loading) or the first reading was off, the toolbar corrects itself. While a page loads, a glow runs along the address bar. The address itself reads as `domain / title`, and hovering it shows the full URL.

Back, forward and reload move the way Dia's do. Hovering back or forward squeezes the arrow; click and it slides away while a fresh one slides in. Hover reload and its arrowhead draws back round the circle; start a load and it spins into a stop cross, which turns back into the arrow when the page is done. With nowhere to go, back and forward fade to a dimmed look rather than snapping to it.

<!-- image: back/forward/reload animations (short GIF or video) -->

### The address bar

The address pop-up follows Dia's shape: short rows with room around them, one size and weight of text throughout, and none of Firefox's chips, row menus or extra engine bars. What you type lines up exactly with the results underneath. It can take on the toolbar's colour as it opens, so it reads as the same bar growing. As you type an address, the site's own icon takes the place of the magnifying glass. A paperclip beside site settings copies the page's link and pops into a tick. The whole bar can also move to the **bottom**, under the page, with the pop-up opening upwards, in a single page or a split.

### PDF view

PDFs open in Dia's viewer look: a grey toolbar with the document's name on the left, the page and zoom in the middle beside fit to page, rotate and undo/redo, and download, print and more on the right. The pen opens a second row with Firefox's tools (draw, highlight, text, signature, image and comment). The sidebar is just the pages, the current one framed in blue.

![A PDF in Zia's Dia-style viewer](<https://raw.githubusercontent.com/z1n-k/zia/readme-images/pdf-view.webp>)

### Picture-in-picture

Picture-in-picture looks like Dia's. At rest it's just the video, with nothing laid over it. Hover it and the video dims to show **Back to Tab** and **Close** at the top with the site between them, big 15-second skip and play/pause buttons in the middle, a speaker, volume line and the time in the bottom left, and a thin progress line along the bottom.

![Picture-in-picture with its controls](<https://raw.githubusercontent.com/z1n-k/zia/readme-images/pip-controls.webp>)

When you need the screen back, tuck it away, into the left or right side, the bottom, or a bottom corner of the screen. Throw the window at one: let go with a good part of it off the edge, or flick it, and it springs the rest of the way off, leaving a slim frosted strip (or a small frosted corner). The video frosts over as it goes, and a throw that lands near a corner is pulled into the corner. The tuck button beside Close tucks into your default spot, and the small arrow beside it opens a map of the screen to pick one, or make it the default. With more than one screen, the edges your screens share are skipped, so it never hides onto another screen. Hover the strip and the video peeks out a little; click it, or hold it and drag it out, and the video comes back and stays out until you tuck it again. Drag the strip along its side to move it, and near the bottom of a side it snaps into the corner. (There are no top spots: macOS won't move a window up past the top of the screen.)

<img src="https://raw.githubusercontent.com/z1n-k/zia/readme-images/pip-tucked.png" alt="Picture-in-picture tucked into the side of the screen" width="180">

### Multiview

Multiview turns a tab into a wall of videos. Right-click any video, a video's page or its tab and choose **Add to Multiview**:

<img src="https://raw.githubusercontent.com/z1n-k/zia/readme-images/multiview-menu.webp" alt="Add to Multiview in a video's right-click menu" width="360">

The first video opens the Multiview tab and up to three more join it; after that the item becomes **Replace in Multiview**, so you pick which one the new video replaces. The grid re-tiles itself to fill the tab, always at the biggest size that fits, as videos come and go. It's made for following several live streams at once. The tab's grid icon fills a square for each video, in Zia's blue or your space's colour.

![Multiview with sport, scenery and two live streams](<https://raw.githubusercontent.com/z1n-k/zia/readme-images/multiview-wall.webp>)

Hover a tile to drag it to a new spot, make it the big one with the others in a row beneath, give it the sound (one tile plays at a time, marked with a white ring), open it on its site or remove it. With two videos, one button puts them side by side or stacked. Videos pick up from where you were, and live streams join live.

![A Multiview tile on hover](<https://raw.githubusercontent.com/z1n-k/zia/readme-images/multiview-tile.webp>)

Multiview works with **YouTube, Twitch** (live, videos and clips), **Kick, Vimeo, Dailymotion** and plain video files. Sites with copy protection, such as Netflix or sports services, can't be added. The Multiview page is hosted on this repo's [GitHub Pages](https://z1n-k.github.io/zia/multiview/), because YouTube and Twitch only play embedded videos on a real web address. Your list of videos lives in the page's own address, so it survives a restart, and it's never sent anywhere.

### The sidebar

Essentials sit as tiles, four to a row, or six when the sidebar is wide.

[Glance](https://docs.zen-browser.app/user-manual/glance), Zen's link preview (Alt-click a link, or Option-click on macOS), gets a look of its own. From an essential, a small card with the site's icon springs out from behind the essential's own, and is sucked back in when you close the glance. From a tab, the glanced site sits as a small square tile at the tab's end.

**Split essentials** (experimental): keep a split of two sites as one essential, the way Dia can. Drag a two-site split onto the essentials, or right-click one of its tabs and choose **Add Split to Essentials**. The tile shows both sites in halves of their own; click it and the split opens, at whichever half you clicked. While it's open the tile takes the colour of the half you're in, and so does its hover card; drag it back to the tab list and it's an ordinary split again. Zen can't hold a split among its essentials yet, so Zia keeps the split as two ordinary tabs hidden from the tab list.

<!-- image: a split essential, open -->

<p>
  <img src="https://raw.githubusercontent.com/z1n-k/zia/readme-images/glance-essential.png" alt="A glance card fanned out from an essential" width="360">
  <img src="https://raw.githubusercontent.com/z1n-k/zia/readme-images/glance-tab.png" alt="A glance tile at the end of a tab" width="360">
</p>

Folders get hover boxes, a gentle spring when they open and close, icon or emoji covers, an × to delete them, and a colour of their own from the right-click menu that tints the whole folder:

![A tinted empty folder with its Drag tabs here slot](<https://raw.githubusercontent.com/z1n-k/zia/readme-images/folder-empty.png>)

Spaces with a colour of their own carry it through the whole sidebar. An empty folder shows a dashed *Drag tabs here* slot until its first tab arrives. Plain tab groups, like the ones [Advanced Tab Groups](https://github.com/Vertex-Mods/Advanced-Tab-Groups) makes, get the same folder treatment. Downloads sit next to the space name with a progress ring around them.

Tabs drag the way they do in Dia. The tab itself follows the pointer while the rows it passes slide aside, a folder opens up by a row to make room, and over the essentials a tab turns into the tile it's about to become. Drag an essential back off and it's a tab again. Hovering a tab shows a card with its title, address and a few actions (pin as an essential, split, copy the link); hovering a collapsed folder lists what's inside. A collapsed folder with an open tab shows just that tab, glow and all.

If you'd like asleep tabs to stand out, they can be dimmed (tabs, essentials, and folders whose tabs are all asleep). Zen's pop-up notices get a close button, so they don't have to be waited out.

Cmd/Ctrl+Z reopens what you just closed for ten seconds afterwards. That includes whole folders, splits and groups of tabs: a split comes back as a split, and a deleted folder comes back with its name.

![Essentials and folders in the sidebar](https://github.com/user-attachments/assets/0c439e9d-651e-414c-8b85-d5bc8308aef4)

Covers come from an icon picker Zia adds as a third tab beside Zen's own: 5,166 [Tabler](https://tabler.io/icons) icons, in outline or, for about a thousand of them, solid. Switch between the two at the top of the picker. The search knows each icon's tags as well as its name, so *money* finds cash, coins and wallets. Zen's emojis are still there if you'd rather use one.

<img src="https://raw.githubusercontent.com/z1n-k/zia/readme-images/icon-picker.png" alt="The icon picker with Tabler icons in solid style" width="474">

### Glass

Three things float over the page, and all three are frosted glass: slightly see-through, with whatever's behind them blurred and its colours showing through. Each can be switched back to solid in the options.

**Compact mode's sidebar**, as it slides out over the page:

![The compact sidebar as frosted glass over a photo](<https://raw.githubusercontent.com/z1n-k/zia/readme-images/glass-compact-sidebar.webp>)

**The tab and folder hover cards:**

<img src="https://raw.githubusercontent.com/z1n-k/zia/readme-images/glass-hover-card.png" alt="A tab's hover card as frosted glass" width="520">

**The address bar pop-up:**

![The address bar pop-up as frosted glass over a photo](<https://raw.githubusercontent.com/z1n-k/zia/readme-images/glass-address-pop-up.webp>)

### Split view

Each pane in a split gets its own toolbar, address and controls, with even spacing and a frame around the pair. Your pinned extensions sit in the focused pane's toolbar and move with the focus. Drag a tab over the page and drop cards rise on either side, growing and turning blue as you near the edge; let go and the split is made.

### Music

Playing music brings up a card with the track's artwork and a soft glow in its colours. It handles live streams as well as ordinary videos. Playing tabs get sound bars instead of Zen's speaker, and so do essentials. The bars turn to dots when muted and toggle the sound when clicked.

![The music player card](https://github.com/user-attachments/assets/5b4e2542-61a9-4fd6-b2ee-7fb58970ef5b)

### Folder names and icons from a local model

Make a folder and Zia can name it and choose its icon for you, with a model that
runs on your machine. Three tabs from Levi's, Gucci and Louis Vuitton become a
folder called **Clothing** with a clothing icon; PayPal, Stripe and Cash App
become **Financial**. A folder that's mostly one site gets that site's own logo,
so a folder of YouTube videos gets the YouTube icon. Nothing is sent anywhere.

It's **off by default**, because the first use downloads a model (about 25MB).
To turn it on:

1. Open `about:config` and set **`browser.ml.enable`** to `true`. This is
   Firefox's local AI runtime, which Zen ships but leaves switched off.
2. Restart Zen.
3. In **Settings → Sine Mods → Zia**, turn on **Name new folders and choose
   their icons with a local model**.

The first folder you make takes a little while as the model downloads and the
5,166 icon names are read once. After that it's immediate, and the icon names
are cached in your profile.

It only ever fills in a folder that has no icon and still has its default name,
so anything you've named or chosen yourself is left alone. Groups made with
Advanced Tab Groups get the same treatment, with the icon saved through that mod.

---

## Options

**Settings → Sine Mods → Zia**

Almost every part of Zia can be switched on or off on its own. The settings are grouped the same way here as on the settings page.

| Setting | Default |
| --- | --- |
| **Features** | |
| Music player card | on |
| Find in page bar | on |
| Icon picker (5,166 Tabler icons, outline and solid) | on |
| Undo a closed tab with Cmd/Ctrl+Z | on |
| Tab and folder hover cards | on |
| Hover cards are slightly see-through, with what's behind them blurred | on |
| Name new folders and choose their icons with a local model ([see above](#folder-names-and-icons-from-a-local-model)) | off |
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
| PDFs open in Dia's viewer look (off: Firefox's own) | on |
| **Address bar** | |
| Dia-style address bar pop-up (off: Zen's own) | on |
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
| Dia-style picture-in-picture controls (off: Firefox's own) | on |
| Tuck picture-in-picture into the side of the screen | on |
| Picture-in-picture tucks into (the nearest side, a side, the bottom or a bottom corner) | the nearest side |
| **Multiview** | |
| **Add to Multiview** on videos and tabs | on |
| Multiview tab icon colour: Zia blue or the space's colour | Zia blue |

More features become switchable with each release. The styling toggles apply straight away; the ones that change behaviour need a restart.

<details>
<summary><b>Zen settings Zia changes</b></summary>

Changed at the default level only. If you've set either yourself in `about:config`, your choice is kept.

- `zen.widget.mac.mono-window-controls` → off, for native macOS window buttons
- `zen.urlbar.replace-newtab` → off, so **+ New Tab** and Cmd+T open a real new tab. Turn off **Cmd/Ctrl+T and + New Tab open a real tab** to get Zen's floating address bar back.

</details>

## Known gaps

- Light mode and Zen's layouts other than **Sidebar and Top Toolbar** are less polished
- Split essentials are experimental: Zen doesn't support them itself yet, so Zia works around it

---

## Source layout

`zia.uc.js` and `chrome.css` are built from per-feature parts, so each feature can be read and changed on its own:

- `src/js/`: the script, one file per feature (address bar, sidebar edges, split panes, picture-in-picture, Multiview, tab dragging and so on)
- `src/css/`: the styles, in the order they apply

Edit the parts, then run `scripts/build.sh` to rebuild both files. `scripts/build.sh --check` (also run on every push) fails if the built files and the parts ever disagree. The parts, the build script and the Multiview page aren't part of what Sine installs.

## About the name and the look

Zia is an independent, unofficial project. It isn't affiliated with, endorsed by, or connected to Dia or The Browser Company, and it contains none of their code or assets. It's a Zen Browser theme built by eye, taking design inspiration from a browser I liked the look of.

## Credits

Icons are [Tabler Icons](https://tabler.io/icons), MIT licensed; their licence is in `icons/tabler-LICENSE`. They're recoloured to follow Zen's icon colour and otherwise unchanged (`scripts/tabler-icons.py` makes them from the npm package). They ship as one compact file, `icons/tabler-bundle.js`, from which Zia makes a zip in your Zen profile (`zia-icons`, once per icon update) and reads the icons, so installing and updating Zia doesn't unpack thousands of files and the download stays small.

The bleeding corners technique was inspired by [Bleeding Corners Fix](https://github.com/rsiebertdev/zen-themes/tree/main/bleeding-corners-fix) by rsiebertdev. Zia uses its own implementation, matched to its card shape.

## Licence

[MIT](LICENSE).
