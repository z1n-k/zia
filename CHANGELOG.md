# Changelog

Every release of Zia, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Dragging the open tab back out of a collapsed folder no longer makes it
  vanish as soon as it leaves the folder (it was cut off by the folder's
  own edge), so it's easy to see where it goes.
- Dropping a tab into a collapsed folder no longer makes it blink out and
  drop in from a row above: it stays where it landed, and the folder keeps
  its hover box until the pointer leaves.
- A dropped tab no longer jolts (down a step, back up, then down again)
  before gliding into place: Firefox's end of the drag let it go for a
  frame, and it's now held where it was let go until the glide starts.
- A tab dropped into a folder no longer steps left and slides back as it
  lands: the narrower look it has over the folder now goes before the
  glide, which starts from where its background showed.

## [2.59.3] — 2026-09-26

### Fixed

- The pin (Add to Essentials) in a tab's hover card turns a split into a
  split essential, instead of pinning one of its tabs and leaving the other
  without its title; Zen's own **Add to Essentials** is hidden for tabs in a
  split, where it did the same.

- An essential dragged back into the tab list lands where it's dropped
  (pinned, if that's above the separator), instead of vanishing for a
  moment and turning up at the end of the list below the separator.

- The PDF viewer's ⋮ menu shows its items at full width again, instead of
  squeezing each into a narrow strip with its words wrapped one or two to a
  line.

## [2.59.2] — 2026-09-26

### Fixed

- With **Last essential fills its row** on, the essentials no longer squeeze
  some tiles into slivers on top of each other at some sidebar widths (and
  the tabs no longer reach out to meet them): Zia counted the columns the
  stretched tile itself added as real ones, and stretched it further.

## [2.59.1] — 2026-09-26

### Fixed

- Tabs no longer reach out past the sidebar to touch the page (seen on
  Linux after selecting a tab): Zia lines tabs up with the essentials, and
  measured other spaces' essentials too, some of them shifted aside.

- The tab list can't be scrolled sideways, which could shift the tabs over
  against the page and cut the essentials off at both sides.

- The glow of the active tab is no longer cut off when it's the last tab
  in the list: Firefox's inner scroll box ended at the last row and cut off
  whatever went past it.

- Zen's "Clear" button beside the separator fades out as soon as you
  leave the sidebar, as quickly as it fades in, instead of lingering.

### Changed

- Zia no longer writes notes to the Browser Console as it works (only
  real problems, at the debug level), and some unused code and styles are
  gone.

## [2.59.0] — 2026-09-26

### Added

- Split essentials (experimental): keep a split of two sites as one
  essential, as Dia can. Drag a two-site split onto the essentials, or
  right-click one of its tabs and choose **Add Split to Essentials**. The
  tile shows both sites in upright halves; clicking it opens the split, at
  the half you clicked, and while it's open the tile takes the colour of
  the half you're in, as does its hover card. Drag it back to the tab list
  (or remove it from the essentials) and it's an ordinary split again. Zen
  can't hold a split among its essentials yet, so the split is kept as two
  ordinary tabs hidden from the tab list.

### Changed

- Zia's download is about a third of the size (1.9 MB down to 0.64 MB):
  the folder icons ship as one compact file, from which Zia makes its icon
  pack in your profile the first time it starts. Icons you've already
  picked keep working.

- The × in a split pane's own address bar closes that pane's tab, as in
  Dia, instead of taking it out of the split into a tab of its own.

### Fixed

- With a split essential kept, tabs can be dragged into closed folders
  again (the split's hidden tabs got in the way).

- A split's two sites sit in the same boxes while it's dragged onto the
  essentials as once it lands, instead of snapping into place.

- An open folder shuts the moment you start dragging it, and is dragged
  and dropped as a closed folder, instead of jumbling the rows below it.

- A dragged folder lands exactly where it's shown, as a row of its own:
  it no longer drops inside the folder under the pointer, and it's easy to
  take right to the top of the list.

- A split dragged into or out of a folder narrows and widens to fit, as a
  tab does.

- No blue block flashes on a split as it's dragged or dropped (the split's
  own label, or Zen's drop-to-split marker).

- A tab dragged up to the last folder before the separator behaves as it
  does with the other folders: the space opened for it takes it into the
  folder (its top half) or into the gap after the folder, above the
  separator (its bottom half).

- The suggestion to paste a copied link no longer shows the search
  engine's name in a chip beside it.

- The tab you're dragging keeps its ×.

- A dragged essential no longer stretches into a band across the whole
  window as it's let go.

- Dragging a split essential back to the tab list no longer sometimes
  leaves a stray tab behind that can't be closed.

- A dragged essential glides into its new place when you let go, instead
  of jumping there, following the tiles as they slide into their new order,
  at the same speed as a dropped tab or folder.

- A tab, split or folder you've just dropped keeps its × and − until the
  pointer leaves it, instead of them blinking out.

- A split dragged over the essentials already shows the colour it will
  have as an essential, instead of looking inactive until it's let go.

- A dragged folder no longer vanishes for a moment as it lands.

- A dragged essential stays a tile while it's dragged along the last row
  of the essentials, instead of flickering into a wide list row.

- A split can be dragged across the separator, among the pinned tabs and
  folders, like a single tab.

- A split pane's toolbar buttons can always be clicked; the invisible box
  around Zen's little move-and-expand handle sometimes sat over them.

- Folder and space icons show again. Since 2.58.0 they could go missing,
  because Zen draws them before Zia had pointed Firefox at its icons.

## [2.58.1] — 2026-09-26

### Changed

- Windows: minimise, maximise and close dim when hovered, now that they've
  no coloured block behind them.

## [2.58.0] — 2026-09-26

### Changed

- Installing and updating Zia is quick again: its 6,000-odd icons come as
  one file instead of thousands, which Sine took up to a minute to unpack
  on some computers, freezing Zen meanwhile. Zia copies the icon file into
  your Zen profile the first time and reads icons from it; folders and
  spaces using one of Zia's icons move over to it by themselves.

- Dimming asleep tabs is off by default (and switched off once for anyone
  who had it on from when it was on by default); turn on **Asleep
  (unloaded) tabs, essentials and folders look dimmed** in Zia's settings.

- Windows: minimise, maximise and close have no coloured block behind them
  on hover; the icon brightens, and close's cross turns red.

### Fixed

- The address bar's copy link button is as faint as the site settings
  icon beside it again, still following the toolbar's colour.

- The last tab in the list has its whole glow; it was cut off at the
  bottom on macOS and Linux.

- Windows: the space's name shows again at the top of the sidebar when it
  slides out in compact mode.

- On dark sites the toolbar's buttons are white, as in Dia, instead of a
  mid grey, so back and forward are easy to see even when there's nowhere
  to go.

- The glance card on an essential springs out once, instead of playing
  its animation twice as the glance opens.

- The toolbar catches up with pages that recolour their header a few
  seconds after loading (GitHub's goes from grey to black).

## [2.57.0] — 2026-09-25

### Changed

- A page glanced at from an essential shows as a small card fanned out from
  behind the essential's icon, springing out of it as the glance opens and
  sucked back in as it closes, instead of a tile hanging off the corner.
  It stays empty while the page loads, then the site's icon fades and grows
  in.

## [2.56.2] — 2026-09-25

### Fixed

- The open tab in a collapsed folder has its whole glow again; it was cut
  off by the folder's edge.

- The address bar's copy link (paperclip) button follows the toolbar's
  colour like the icons beside it; it stayed white on light sites.

## [2.56.1] — 2026-09-25

### Fixed

- Windows: with the sidebar hidden (compact mode), the minimise, maximise
  and close buttons are back top right where they belong, instead of in
  the sidebar, and stay there while the sidebar slides out.

## [2.56.0] — 2026-09-25

### Changed

- Back and forward are easier to see when there's nowhere to go: their
  dimmed look is lighter, closer to Dia's.

- The toolbar stays readable on strong site colours. On a vivid mid colour
  like a bright red, its text, buttons and bookmarks are full white and the
  end of the address is much less faint; on bright colours white can't be
  read on (a vivid green, say), the text turns dark.

- Tab groups from Advanced Tab Groups wear their own colour, like Zia's
  folders (gradient colours use their first colour).

### Fixed

- Windows: folder colours are less vivid, at rest and on hover, closer to
  how they look on macOS. macOS is unchanged.

- A collapsed folder with an open tab showing no longer lets you point at
  its hidden tabs: the space just below the open tab brought up the
  folder's last tab's card, and clicking there opened it.

- Windows: tabs have the same rounded corners hovered as selected.

- Windows: the page's corners match Windows 11's own window corners.

- Windows: the download button's hover square is an even square.

- Windows: the address bar's hover with no tab open is a light see-through
  wash instead of a solid grey block.

- Windows: the minimise, maximise and close buttons show again with the
  sidebar hidden (compact mode); Zia was hiding them.

- Windows: the space's icon sits level with its name.

- Split view no longer puts a solid grey tray behind pages when
  transparent pages are switched on (Transparent Zen and similar).

## [2.55.0] — 2026-09-25

### Changed

- Back and forward fade to their dim look when there's nowhere left to go,
  instead of snapping to it (a click that uses up the history settles
  straight into it after the slide), and their hover square fades too.

- The address bar pop-up is now see-through by default, with the page
  blurred behind it, like the compact sidebar and the hover cards. Turn
  off **Address bar pop-up is slightly see-through** in Zia's settings for
  a solid one.

## [2.54.0] — 2026-09-25

### Added

- **See-through hover cards.** The tab, folder and essential cards get the
  same frosted look as the compact sidebar and the address bar pop-up:
  slightly see-through, with the page behind them blurred. It's on by
  default; turn off **Hover cards are slightly see-through** in Zia's
  settings for solid cards.

## [2.53.2] — 2026-09-25

### Changed

- Asleep tabs, essentials and folders are dimmed a little less.

### Fixed

- An asleep essential dimmed its icon but not its tile. The tile fades with
  it now.

## [2.53.1] — 2026-09-25

### Added

- **A close button on Zen's toasts.** The little notes that pop up in the
  corner ("Copied" and the like) get a small ✕, so you don't have to wait
  for them to time out (or move the mouse off them first).

### Fixed

- The tile behind a peeked page's icon on its tab (Option-click) was
  stretched wider than tall, its icon off centre. It's a true square now,
  the icon in its middle.

## [2.53.0] — 2026-09-25

### Added

- **PDFs in Dia's viewer look.** Firefox's PDF viewer gets Dia's grey
  toolbar: the document's name on the left; the page ("1 / 2"), zoom
  (− 100% +), fit to page, rotate, the pen and undo/redo in the middle;
  download, print and more on the right. The pen opens a slim second row
  with Firefox's own tools (draw, highlight, text, signature, image and
  comment), and folds it away again. The sidebar is just the pages, in a
  square blue frame for the current one, on Dia's darker grey. Turn off
  **PDFs open in Dia's viewer look** in Zia's settings for Firefox's own.
- **A see-through address bar pop-up, as an option.** Turn on **Address bar
  pop-up is slightly see-through, with the page blurred behind it** (it's
  off by default). It works with the dark, light and site-coloured pop-ups,
  and blurs web pages as well as Zen's own (on macOS that takes drawing the
  page as a layer Zen composites itself, a trick from Floaty UI).

- **A see-through compact mode sidebar.** In compact mode the flyout
  sidebar (and top toolbar) is slightly see-through, with the page blurred
  behind it, websites included. It's on by default; turn off **Compact
  mode's sidebar is slightly see-through** in Zia's settings if it ever
  looks wrong.

- **Asleep tabs look asleep.** A tab or essential that's unloaded (not
  using memory) fades its icon and title to about half, and a folder does
  the same once every tab in it is asleep. The selected tab is always
  awake. It's on by default; turn off **Asleep (unloaded) tabs, essentials
  and folders look dimmed** in Zia's settings to have them look the same.

### Changed

- A new folder mostly of one site gets that site's own icon when there is
  one (YouTube's, GitHub's, Reddit's…), rather than one guessed from its
  tabs' titles, which for a folder of videos or repositories could be
  anything.

### Fixed

- Zia's helper inside web pages was blocked by newer Firefox, which only
  lets such helpers into a website's process when they're marked as safe
  there. It's marked now, so the toolbar's colour follows the page as you
  scroll again, and PDFs get their Dia look.
- A page peeked at with Option-click sat on its tab in a dark, blurred box.
  It's a soft light tile now, without the selected tab's glow or edge.
- The copy link button on a split pane's bar was an empty square until it
  was first clicked. It pointed at an icon that went when Zia moved to
  Tabler's icons; it's the paperclip from the start now.

## [2.52.0] — 2026-09-25

### Added

- **Volume and mute in picture-in-picture.** With Dia-style controls, the
  bottom left now has a speaker (click to mute), a thin volume line and
  the time, fading in with the other controls. In a very small window only
  the speaker shows; live streams still show no time.

## [2.51.0] — 2026-09-25

### Changed

- Back and forward squeeze a little less on hover, and reload's arrowhead
  draws back a little more slowly.
- A folder's hover colour (and its edge) comes and goes at once instead of
  fading, also while a dragged tab passes over it.

### Fixed

- The buttons at the bottom of the sidebar (and the tab list chevron) turn
  fully white while clicked or while their menu is open, as meant. 2.50.0
  had them stay at their hover brightness instead. Resting and hovered,
  they're unchanged.
- A site's address with nothing after it showed a trailing "/" for a moment
  (youtube.com/) before it went, and kept it while autofill was completing
  what you typed. It's never shown now.

### Removed

- The bookmark button on tab hover cards.

## [2.50.0] — 2026-09-25

### Changed

- **Back, forward and reload move like Dia's.** Hover back or forward and
  the chevron squeezes; click and it slides out the way it points while a
  fresh one slides in behind it. When a page starts loading, the reload
  arrow spins as it shrinks away and the stop cross grows out of a small
  plus; when it's done, the cross turns back into a plus as it shrinks and
  the arrow spins back in. Hovering reload draws its arrowhead back a
  little round the circle.

### Fixed

- The buttons at the bottom of the sidebar (and the tab list chevron)
  turned bright white when clicked or while their menu was open. They now
  stay at their hover brightness.

## [2.49.0] — 2026-09-25

### Added

- **The address bar's pop-up can take the toolbar's colour.** Turn on
  **Address bar pop-up takes the toolbar's colour as it opens** (it's off
  by default). Clicking the address bar then opens the pop-up in the same
  colour as the site-coloured toolbar, with dark text on light sites and
  light text on dark ones. The colour is taken once, as the pop-up opens,
  and kept until it closes, so scrolling the page underneath doesn't change
  it. With the toolbar in the theme's colour, or Zen's own pop-up, nothing
  changes.

### Changed

- **Copying a link pops the paperclip into a tick.** In the address bar,
  on a tab's hover card and on a split pane's bar, the paperclip shrinks,
  tilts and fades, then the tick springs in, running a touch past full
  size. After a moment the tick pops back into the paperclip. It used to
  swap in a single frame.
- **The reload button is Dia's.** A slightly bigger circle, with no tail
  on the arrow: just the arrowhead sitting on top of the circle, a little
  right of centre, and the gap running from it round to three o'clock.

### Fixed

- A folder with a selected tab inside it didn't bounce when it opened or
  closed. Zen moves that kind of folder differently, shrinking its other
  tabs away (or growing them back) rather than sliding the folder shut, and
  Zia's spring only knew the slide. Those tabs now move with the same
  spring, and the folder stretches a couple of pixels past where it lands
  opening, or pulls up past it closing, then settles.

## [2.48.0] — 2026-09-25

### Added

- **The toolbar's colour checks itself.** Every few seconds, while the tab is
  showing and the page has settled, Zia reads the top of the page again. If
  two readings in a row agree with each other but not with the toolbar,
  the toolbar changes to match and the colour remembered for that site is
  corrected. This catches pages that change after loading (a banner
  closing, a header recolouring itself) and pages whose very top edge is a
  thin line of another colour. It also checks when the window comes back
  into view or is resized.
- **Folder names and icons from a local model are back, as an option.**
  Turn on **Name new folders and choose their icons with a local model** in
  Zia's settings (it's off by default, because the first use downloads a
  model of about 25MB). A new folder with a default name and no icon gets a
  name and a Tabler icon chosen from its tabs, on your machine. See the
  README for turning on Firefox's local AI runtime first.

### Fixed

- Tabs' close buttons could vanish until Zen restarted. They're hidden while
  a tab is dragged, and a drag that ended somewhere the window couldn't see
  (dropped in another window or on the desktop, or its tab moved or closed
  mid-drag) never cleared that. Zia now tidies up as soon as the mouse moves
  with no button held.
- The bottom edge of a folder's box flickered as the folder's spring
  settled. The spring moved it by fractions of a pixel, where the box's
  one-pixel outline fades out for a frame. The motion now lands on a whole
  screen pixel every step.

## [2.47.0] — 2026-09-24

### Added

- **Tuck picture-in-picture into the bottom and the bottom corners.** They
  join the left and right sides. Throw the window at one, and a throw that
  lands near a bottom corner is pulled into it. Tucked in a corner, a small
  frosted square shows instead of a strip. (No top spots: macOS won't move a
  window up past the top of the screen.)
- **Pick where it tucks.** A small arrow beside the tuck button opens a map
  of the screen with its five spots, and can make one the default, which
  the tuck button then uses. The default is also in Zia's settings as
  **Picture-in-picture tucks into**.
- Drag a tucked strip along its side to move it; near the bottom of a side
  it snaps into the corner, and dragged out of a corner along an edge it
  becomes that side again.

### Fixed

- With more than one screen, picture-in-picture no longer tucks into an
  edge two screens share, where it just showed on the other screen. Those
  spots are greyed out in the picker, and a throw across that edge moves
  the window to the other screen as normal.

## [2.46.0] — 2026-09-24

### Changed

- The split view drop cards spring. Drag a tab onto one and it grows a touch
  past its bigger size before settling; drag it off and it shrinks a touch
  past its smaller size before settling. The icon and label inside spring
  with it.

## [2.45.0] — 2026-09-24

### Changed

- **Throw picture-in-picture at the side to tuck it.** The blue "Let go to
  tuck away" edge is gone. Let go of the window with about a third of it
  past the left or right side of the screen, or flick it quickly at a side,
  and it springs the rest of the way into its tucked strip. The video frosts
  over as it goes past the side, fully frosted where it would tuck, and
  clears again the same way as you pull it back out.

### Fixed

- Live streams in picture-in-picture no longer show a progress line or time.
  Firefox only hid them for video with no length at all, and most live
  streams report one that keeps growing. Zia now counts a stream as live
  the same way Zen's own music player does.

## [2.44.0] — 2026-09-24

### Changed

- **Tucked picture-in-picture comes out by hand and stays out.** Hold the
  strip and drag it away from the side to pull the video out under the
  pointer; let go and it settles fully on the screen. Clicking the strip
  still brings it out. Either way it no longer tucks itself away again when
  the pointer leaves, which covered the video with its controls. The tuck
  button puts it back.
- The media stack opens without the spring, which made the top card bounce.
  It still springs as it closes, and a single card still springs as it
  opens.

### Fixed

- The copy-link button in the address bar uses the same Tabler paperclip as
  the hover cards.
- A music player card can no longer be dragged out of the sidebar. Dragging
  one took it away from Zen's media player, which then stayed broken until
  Zen restarted.

## [2.43.1] — 2026-09-24

### Fixed

- In compact mode, pointing at a tab or folder hover card no longer hides the
  sidebar. It stays open while the pointer is on the card, and hides as usual
  a moment after the pointer leaves both.

## [2.43.0] — 2026-09-24

### Changed

- **Folders open and close with a spring.** The folder slides open or shut,
  runs a couple of pixels past and settles back, instead of Zen's even slide
  followed by a separate 1px nudge of the folder's box. Closing, whatever is
  below the folder bounces up very slightly. The bounce is the same size
  whatever the folder's size. The setting is now called **Folders open and
  close with a gentle spring**.
- The music player opens on hover with the same kind of spring, and its
  buttons and progress bar spring in with it.
- The sidebar no longer shows a scrollbar anywhere. It still scrolls.

## [2.42.0] — 2026-09-24

### Changed

- **New icons: Tabler.** The icon picker now has the 5,166
  [Tabler](https://tabler.io/icons) icons in place of Phosphor's 1,512. A switch at the top of the picker shows
  them as outline or solid (about a thousand have a solid version), and Zia
  remembers which you chose. Search now looks at each icon's tags as well as
  its name, so *money* also finds cash, coins and wallets, and results load as
  you scroll, so the picker opens quickly.
- Folders and spaces that already use a Phosphor icon switch to the closest
  Tabler icon on their own.
- The icons on hover cards and the copy-link button are Tabler's too.

### Removed

- Folder names and icons from a local model. Zia no longer names new folders
  or picks their icons, and the setting is gone. The icon names it cached in
  your profile are deleted.

## [2.41.0] — 2026-09-24

### Added

- **Empty folders say so.** Zia lets you make a folder before it has any
  tabs, so an open empty folder shows a dashed, tab-sized **Drag tabs here**
  slot where the first tab will go. A folder emptied by moving its last tab
  out collapses. While you drag a tab into an empty folder, open or
  collapsed, the tab carries the slot's dashes. The slot is outlined in the
  folder's colour (a soft white for white and uncoloured folders). It's sized
  from a real tab, so a tab dragged in takes its place exactly, without the
  folder growing.
  It shrinks away smoothly when the folder collapses, and moves with the
  folder when other tabs are dragged past.

### Fixed

- A coloured folder keeps its colour while a tab is dragged into it, instead
  of turning to the plain hover colour.
- A folder's colour fades to its hover colour and back instead of snapping,
  so dropping a tab in or dragging one out no longer flashes.
- The gap below an open folder is the same as the gap between two tabs; it
  was thinner.

## [2.40.1] — 2026-09-24

### Fixed

- Zen's haptic feedback could stay switched off for good. Zia mutes it for
  the length of a tab drag, and a drag that didn't finish cleanly (Zen quit
  mid-drag, a cancelled drop) left it muted, even after a restart. Zia now
  puts it back shortly after the pointer is released, or on the next launch
  at the latest, and undoes its own change instead of saving a new value.
- Zia's drag taps no longer switch Zen's haptics on if you'd turned them off.
- If haptics were left switched off by the old version, this version switches
  them back on once, the first time it runs. Turning them off again
  afterwards is respected.
- Dragging an essential one place along now taps as it passes the
  neighbouring tile, and taps again if you change your mind and move it
  back, either way. It only tapped from the second tile on, and not at all
  going back.

## [2.40.0] — 2026-09-24

### Changed

- Multiview reads as part of the browser: the address bar shows
  **Multiview · 3** instead of `z1n-k.github.io / Multiview · 3`, and so do
  split panes and the tab's hover card. Clicking into the address bar to
  type still shows the page's real address.

## [2.39.3] — 2026-09-24

### Changed

- Errors Zia works around are no longer swallowed silently. Each is logged
  once, at debug level, in the Browser Console (labelled with the feature,
  e.g. `[Zia] multiview: multiviewPosition`), so problems can be tracked
  down. Nothing changes in how Zia behaves.

## [2.39.2] — 2026-09-24

### Changed

- The source is split into per-feature parts in `src/js` and `src/css`, and
  `zia.uc.js` and `chrome.css` are built from them with `scripts/build.sh`.
  The built files are the same as before apart from a note at the top, so
  nothing changes in the browser.
- The download Sine installs no longer includes the source parts, the build
  script or the Multiview page, which lives on GitHub Pages.

## [2.39.1] — 2026-09-24

### Changed

- Stronger blur behind a tucked picture-in-picture's strip (16px, up from
  8px), for a more frosted look.

## [2.39.0] — 2026-09-24

### Changed

- A tucked picture-in-picture's strip takes on your space's colour and
  fades to the new one when you switch spaces. It's see-through, over the
  video blurred behind it like frosted glass; the blur clears as the video
  comes back out.

## [2.38.1] — 2026-09-24

### Fixed

- Hovering a tucked picture-in-picture no longer shows a slice of video
  beside the strip while it nudges out. The strip is now always wide enough
  to cover the nudge.
- The strip's arrow stays by its inner edge and moves out with the video
  when you hover, instead of drifting right, and no longer brightens.

## [2.38.0] — 2026-09-24

### Added

- Drag the strip of a tucked picture-in-picture up or down to move it along
  the side of the screen. It stays tucked wherever you leave it; a click
  without dragging still brings it out.

### Fixed

- Bringing a tucked picture-in-picture back out no longer flashes a thin
  slice of video at the edge of the screen. The strip now stays over the
  window's edge and fades as it slides in.

## [2.37.0] — 2026-09-24

### Changed

- Tucked picture-in-picture no longer springs out when the pointer passes
  over its strip. Hovering nudges it out a little to show it's there;
  click the strip to bring the video all the way back.

## [2.36.1] — 2026-09-24

### Added

- Multiview layouts, from each tile's hover bar:
  - With two videos, a button puts them **side by side** or **stacked**.
  - **Make this one bigger** turns a tile into the main one, with the
    others in a row below it, or in a column beside it on a wide window.
    Press it again to go back to the grid.
  Tiles glide into their new places without the videos reloading, and the
  layout you pick is remembered.

## [2.36.0] — 2026-09-24

### Added

- The Multiview tab's grid icon fills one square per video, in Zia's blue or,
  with **Multiview tab icon colour** set to **Space colour**, the space's own
  colour.

### Changed

- Multiview holds up to four videos. With four in it, the right-click item
  becomes **Replace in Multiview**, listing the four; pick one and the new
  video takes its place while the others keep playing.
- Multiview tiles show the video's title (or the stream's) instead of only
  the site's name.

## [2.35.0] — 2026-09-24

### Added

- **Multiview.** Right-click a video, a video's page or its tab and choose
  **Add to Multiview**. The first one opens a Multiview tab and later ones
  join it, in a grid that re-tiles itself to fill the tab as videos come and
  go. Hover a tile to drag it somewhere else, give it the sound (only one
  plays sound at a time), open it on its site or remove it. Videos carry on
  from where they were, and live streams join live.
  Works with YouTube, Twitch (live, videos and clips), Kick, Vimeo,
  Dailymotion and plain video files. Sites with copy protection (Netflix,
  sports services) can't be added. The Multiview page is hosted on the
  repo's GitHub Pages, because YouTube and Twitch only play embedded videos
  on a real web address; the list of videos stays in the page's address and
  is sent nowhere.

## [2.34.0] — 2026-09-24

### Added

- **Dia-style picture-in-picture.** At rest it's just the video. On hover the
  video dims and shows **Back to Tab** and **Close** pills at the top, the
  site's name in the middle, big 15-second back / play-pause / 15-second
  forward buttons in the centre, and a thin progress line along the bottom.
  Turn it off in the settings to get Firefox's own controls back.
- **Tuck picture-in-picture away.** Press the new tuck button beside Close,
  or drag the window against the left or right side of the screen (a blue
  edge says "Let go to tuck away"), and it slides off, leaving a thin strip
  with an arrow pointing back out. Point at the strip to peek the video back
  out; it tucks away again when you move off it. Press **Keep it out** (the
  same button) or drag it away from the edge to leave it out.
- The music player always shows its picture-in-picture button when you hover
  it. Zen only showed it when a page had exactly one video, so never on
  YouTube.

### Fixed

- Typing an address no longer flashes between the site's icon and the
  magnifying glass; the icon changes once, when it's found.
- Results in the address pop-up show the site's icon when it's saved under
  the other form of the address (youtube.com vs www.youtube.com), instead of
  a blank globe.

## [2.33.4] — 2026-09-24

### Fixed

- Scrolled results in the address pop-up are cut off exactly at its bottom
  edge, and scrolled to the end, the last result has the same gap below it
  as at the sides. (2.33.2 and 2.33.3 cut them off a few pixels short.)

## [2.33.2] — 2026-09-24

### Fixed

- The address pop-up is 2px taller when its list scrolls, giving the last
  row a touch more room at the bottom.
- Scrolled results no longer show through below the bottom edge of the
  address pop-up.

## [2.33.0] — 2026-09-24

### Added

- **Address bar position** in the settings: Top (the default) or Bottom. At
  the bottom, the toolbar sits under the page, the page's rounded corners
  move to the top, and the address pop-up opens upwards from the bar. In
  split view each pane's toolbar moves to the bottom of its pane, and in
  compact mode the hidden toolbar slides in from the bottom edge. Zen's
  single-toolbar layout keeps the address bar in the sidebar.

### Fixed

- The address pop-up is another 4px shorter when its list scrolls, so the
  space below the last row matches the space at its sides.

## [2.32.0] — 2026-09-24

### Added

- New options in the settings:
  - **Toolbar takes the colour of the site** (on). Off keeps the toolbar in
    the theme's colour.
  - **Zia's rounded page corners** (on). Off uses Zen's own.
  - **Split view drop cards** (on). Off gives tab drops on the page back to
    Zen's own split.
  - **The last essential stretches across the rest of its row** (off).

### Changed

- Cmd/Ctrl+Z after closing a folder, a split or several tabs brings the whole
  lot back, as Firefox's own "reopen closed tab" does, instead of one tab at a
  time. Tabs from a split go back into the split, and tabs from a deleted
  folder go back into a folder with its old name.

### Security

- A Space's SVG icon is only loaded from the browser's or a mod's own files
  (`chrome:` and `resource:`), and anything in it that could run or load
  something (scripts, event handlers, outside links) is removed before it
  goes into the sidebar.

## [2.31.2] — 2026-09-24

### Changed

- The sound bars are back to four bars, shrinking to four dots when muted.
- Sound bars on tabs are white. The tint option (off by default) now also
  colours them with the site's artwork or favicon; essentials stay white.
- The tint option's glow on the selected tab is now mostly the usual white
  glow with only a hint of the favicon's colours.

### Fixed

- Opening the address bar pop-up no longer nudges the address text for a
  moment; it stays where it was.
- The pop-up is 4px shorter when its list scrolls, so the space below the
  last row matches the space at its sides.

## [2.31.0] — 2026-09-24

### Added

- New options in the settings:
  - **Sound bars on playing tabs** (on). Off brings back Zen's speaker.
  - **Selected tab glows faintly in its favicon's colours** (off). The glow
    blends up to three of the favicon's colours, and a split glows in each
    side's. Icons with no colour keep the white glow.
  - **Dia-style address bar pop-up** (on). Off gives you Zen's own.
  - **Cmd/Ctrl+T and + New Tab open a real tab** (on). Off gives Cmd/Ctrl+T
    back to Zen's floating address bar, which Zia had no way to return to.

### Changed

- Zen's speaker on playing tabs is replaced by three sound bars in the
  artwork's colours, in the same spot, which shrink to three dots when
  muted. Click them to mute or unmute. Until the artwork's colours are
  known, a tab's bars use its favicon's colours.
- Essentials and the music player use the same three bars, in place of the
  four. On essentials they stay white.

 — 2026-09-24

### Fixed

- A tab dropped onto the essentials no longer bounces as it lands. The new
  essential's grow-in animation sometimes started under the tab gliding into
  place, which then took the half-grown size and squashed flat for a moment
  before snapping back.

## [2.30.3] — 2026-09-24

### Fixed

- Pinned tabs that can't be unloaded, such as Settings, show ✕ to close them
  instead of a "−" that did nothing, in the sidebar and in the folder card.

## [2.30.2] — 2026-09-24

### Added

- A tab dragged out over the page, to make a split, turns into a thumbnail
  of its page, and back into the tab when it returns to the sidebar.

### Changed

- A dropped tab or folder glides from where it was let go into its place,
  as in Dia, instead of snapping.

### Fixed

- A tab or folder dragged past the bottom of the list no longer vanishes
  just under the last tab, or under the essentials' background.
- A tab dragged into a folder narrows to exactly a folder tab's width; it
  only narrowed on the left.
- + New Tab moves down to make room when an essential is dragged into the
  list above it.
- An essential dragged off as a tab has a tab's usual gap between its icon
  and name.
- No flash after dropping a tab or an essential. Zen hid whatever was
  dropped until the (invisible) drag picture had slid into place; it now
  stays in view, a tab's ✕ or "−" no longer blinks under the pointer, and an
  essential dragged back into the list no longer fades in from nothing.
- Quick drags onto and off the essentials no longer leave a copy of the tab
  stuck over the essentials, or the new essential missing for a while.
- The bottom tab has its glow again (only the top row goes without, next to
  the essentials).

## [2.30.1] — 2026-09-24

### Added

- An essential dragged over the tab list makes room like any tab: the rows
  below where it would go slide down a row, and it drops into that gap,
  pinned or not by which side of the separator it lands.

### Fixed

- Dragging an essential gives the same single tap per step as dragging a
  tab, instead of Zen's burst of taps.

## [2.30.0] — 2026-09-24

Everything since 2.29.0. The 2.29.1 through 2.29.44 versions were local test
builds and were never published; what they changed is folded in here as it
finally stands.

### Added

- **Copy link.** A paperclip in the address bar, just left of site settings,
  in each split pane's toolbar, and on hover cards. It copies the page's
  address, shows a tick for a moment, and only appears on web pages.
- **Essentials back to tabs.** Dragging an essential off the essentials turns
  it back into a tab, and back into a tile over the essentials.
- Trackpad taps that follow what you see: one per row a dragged tab passes,
  and one each time the essentials make room somewhere new. Zen's own taps,
  which came in bursts during a drag, are switched off for its length.

### Changed

- Hover cards grow in only when none is showing, swap straight over when you
  move to another tab, folder or essential, and shrink out when they go. They
  stay up while the pointer is on them and go when it leaves. Copy link and
  Bookmark keep the card up.
- Hover cards have an even hairline edge all round, as in Dia, with no
  shadow, and the grey address on them is a size bigger.
- The folder card keeps working like the sidebar: closing or unloading tabs
  from it keeps it open, its "−" turns into ✕ once a tab is unloaded, its
  buttons sit where a tab's do, and its "+ New Tab" matches the sidebar's.
- The selected tab has no glow as the very first or last row, including a
  new tab at the bottom.
- No icon in the address bar shrinks when clicked.

### Fixed

- A dragged essential can be dropped at the end of the essentials, and the
  tile a dragged tab turns into is exactly the size of the others.
- An essential with its hover card up can be clicked all over.
- Resizing the sidebar no longer shows a dark bar up its edge.
- No lone "/" while a page is loading.

## [2.29.0] — 2026-09-23

Everything since 2.28.0. The 2.28.1 through 2.28.37 versions were local test
builds and were never published; what they changed is folded in here as it
finally stands.

### Added

- **The first essential by dragging.** With no essentials in a space, dragging
  a tab above the list opens a row and makes it the first one. Zen's dashed
  "Add to Essentials" box no longer appears.

### Changed

- **Dragging onto the essentials.** The tile a tab turns into is the real
  essential, favicon glow and rim included, at exactly the size of the tiles
  beside it, drawn over everything so it's never cut off at the sidebar's
  edge. Over a full row, the tiles make room properly: the last one moves
  down to a new row, lined up with the rest.
- Coloured folders use Dia's strengths: a deeper tint at rest that brightens
  on hover, and a name that pales as the folder is hovered.
- On a space with its own colour, the selected result in the address bar is
  lightly tinted by it.
- The reload icon matches Dia's more closely, and the address bar's hover box
  on dark pages is a touch lighter.
- The selected tab has no glow when it's the very first or last row.
- A scrolling list of results leaves the panel 4px shorter.

### Fixed

- Dragging a tab no longer shows another space's essentials, and a tab
  dragged into a folder no longer gets squeezed to a sliver.
- The separator moves out of the way in every space, by exactly one row, with
  + New Tab staying in view. With no normal tabs left, it shows again while
  you drag, so a pinned tab can go back down.
- A long folder card scrolls without cutting off its edge, and its
  "+ New Tab" keeps a collapsed folder collapsed.
- The icon beside a typed address finds sites whose favicon is kept under
  their www. address (twitch.tv and others) instead of showing the globe.
- The + New Tab button has exactly a tab's corners.
- In the address bar's results, the part of an address that matches what
  you typed stays grey.

## [2.28.0] — 2026-09-23

Everything since 2.27.0. The 2.27.1 through 2.27.51 versions were local test
builds and were never published; what they changed is folded in here as it
finally stands.

### Added

- **Tab dragging, like Dia's.** The tab itself follows the pointer and the
  rows it passes slide aside; there's no ghost tab and no drop line, and a
  dropped tab doesn't slide into place. Dragged over a folder, the folder
  opens up by a row to take it, and the tab narrows to a folder tab's width;
  dropped into a collapsed folder, the folder stays collapsed and shows the
  tab under its header. Just below a folder, the upper half of the gap drops
  into it and the lower half next to it, so the space between two folders
  is reachable. Tabs cross the separator in either direction, a split drags
  as one row, and over the essentials a tab turns into the tile it will
  become.
- **Folder cards.** Hovering a collapsed folder lists the tabs inside it,
  each with its icon and name. The speaker mutes and unmutes, hovering a row
  shows ✕ to close the tab or "−" to unload a pinned one, the tab you're on
  is dark, and "+ New Tab" opens a tab in that folder. It replaces Zen's
  folder search popup while hover cards are on; the option in Sine is now
  "Tab and folder hover cards".

### Changed

- Hover cards for internal pages, such as Settings, show the page's name and
  the action buttons; only a new tab keeps the title-only card. The tab
  you're on offers Add to Split too, splitting with the tab you used before.
- An essential's hover card sits right at the tile's corner.
- The back and forward arrows are the height of the sidebar button beside
  them, and the reload icon has Dia's shape.
- Clicking away from the address bar puts the page's address back instead of
  leaving half-typed text in it.
- Tabs have the New Tab button's corner shape, and the active tab inside a
  folder has the same dark background and glow as any active tab.
- A Dia or Zen icon set on a space shows beside its name, in the name's
  colour.

### Fixed

- Clicking the address bar no longer puts `https://` or `www.` back, selects
  the whole address even while the page loads, and typing no longer loses a
  letter when Firefox fills in an address starting with "www.".
- A loading tab's address no longer shows bright white before dimming.
- Hover cards no longer have a thin black line round them, and Add to Split
  shows its full icon.
- A coloured folder's name keeps its tint when the folder is open.
- Hovering a collapsed folder no longer lights up a hidden tab under its
  header, and the active tab's glow isn't cut off inside one.

## [2.27.0] — 2026-09-23

Everything since 2.23.0. The 2.23.1 through 2.26.x versions were local test
builds and were never published; what they changed is folded in here as it
finally stands.

### Added

- **Tab hover cards, like Dia's.** Hovering a tab shows a card with its title
  and address after 0.6s, growing in from 70%. It carries add to Essentials,
  bookmark, and add to split, and a pinned tab or an essential shows unpin
  where the pin would be. Essentials is hidden when the tab is already one,
  split is hidden for the tab you're on, and a new tab or internal page shows
  just its title. Zia draws the card itself. There's an option to turn the
  cards off in Sine's settings for Zia, on by default, and switching it takes
  effect straight away.
- **Extensions in split view, like Dia.** In a split, your pinned extension
  buttons sit in the focused pane's toolbar, just left of its own buttons, and
  move with the focus. They're Firefox's own buttons, moved rather than
  copied, so badges, popups and clicks work as usual, and they go back to the
  main toolbar when the split ends.

### Changed

- **Address bar ink follows the page, like Dia.** On a dark page such as
  YouTube or Duelbits, the domain, path and toolbar icons are a dull grey
  rather than white. A literally black page stays white. The hover highlight
  darkens the bar, or lightens it when the bar is black.
- **The address never shows `https://`, `http://`, or a leading `www.`**,
  including once the bar is open. `www.twitch.tv/xqc` shows as `twitch.tv/xqc`.
- **Split view spacing like Dia's:** 10px between panes, a frame round them,
  on a slightly darker backdrop.
- **The hover card's border matches the essentials':** 1px and a little
  dimmer, brightest along the sides, soft at the corners. The card grows in a
  little more slowly.
- **Tab names, folder names and address bar text are 0.1px smaller.** They
  share one size, so they all moved together.

### Fixed

- An essential's hover card sits just off the tile's bottom-right corner, the
  way Dia's does, instead of covering the tile. A clear patch at that corner
  still lets the pointer move onto the card. With the sidebar on the right it
  hangs off the bottom-left.
- The hover card's action buttons show their icons.
- The dragged tab's image is just the tab, without the active tab's glow
  around it or any of Zia's motion on it.
- Swiping between spaces no longer lets the sliding tabs run past the sidebar
  and over the page.
- The space name highlights over its whole width, and only when the pointer is
  actually over it. The first letters were missed, and empty space beside the
  name was lighting it up.
- The unload (–) button on a folder's header is the same dimmed colour as the
  × next to it.
- Pinned extension buttons no longer fade their background in and out. The
  hover is instant.

## [2.23.0] — 2026-09-22

Everything since 2.13.0, including four community pull requests. The 2.22.x
versions were local test builds and were never published; what they changed
is folded in here as it finally stands.

### Added

- **Folder colours.** Right-click a folder and choose **Folder Color**. The
  eight colours are sampled from Dia's palette. A coloured folder sits at a
  light wash of its colour and comes up to the full colour on hover, and its
  name takes a tint of the same colour. **White** returns a folder to the
  default. Colours are kept across restarts.
- **Delete a folder from its header.** Hovering a folder's header row shows an
  ×, drawn dimmed like the folder's chevron, that deletes the folder exactly as
  **Delete Folder** in the right-click menu does, including closing its tabs.
- **Advanced Tab Groups support.** Plain tab groups, like the ones
  [Advanced Tab Groups](https://github.com/Vertex-Mods/Advanced-Tab-Groups)
  makes, get the same folder treatment as Zen folders, including suggested
  icons. ([#5](https://github.com/z1n-k/zia/pull/5), by @trashshii007)
- **Light search panel.** The expanded address bar follows Zen's *Website
  appearance* setting and turns light when websites are set to light.
  ([#10](https://github.com/z1n-k/zia/pull/10), by @bsramin)

### Changed

- **Space name and icon are drawn as one element**, built from Zen's
  workspace data, so the hover pill sits evenly around the name whether or not
  the space has an icon.
- **Tab buttons have softer corners.** The close (×) and unload (–) buttons
  use a 6px squircle, the tab's own shape scaled down, and both now share it.
- **The download progress ring is thinner**, about 2px.
- **Essentials are 1px taller.**
- **The blended address bar works on transparent pages.** Colour sampling
  accounts for transparency and the frame behind the page.
  ([#8](https://github.com/z1n-k/zia/pull/8), by @trashshii007)

### Fixed

- Tabs no longer show through the music player. It keeps its translucent look
  at rest and fades to a solid version of the same colour while hovered, when
  it grows over the bottom of the sidebar. The colour is worked out from the
  sidebar's own, so it follows each space's colour.
- Clicking the address bar selects the whole address, not just its first few
  characters.
- With the sidebar on the right, the page has a gap along the window's left
  edge, and the traffic lights sit in the sidebar beside the space name,
  whether the sidebar is showing or slides out.
- The unload (–) button on tabs is the same 22px box as the close (×) button.
- A space's icon no longer disappears when the space name is hovered, and no
  longer needs a click to appear after startup.
- A stray first letter of the space name no longer shows on hover when a
  space has no icon, and the hover pill no longer has extra room on the right.
- The floating address bar keeps its own position and rounded corners.
- Toolbar and address-panel text stays readable under light browser themes.
  ([#10](https://github.com/z1n-k/zia/pull/10), by @bsramin)
- Titlebar controls in compact mode on Windows, and the sidebar's open state in
  compact mode is tracked reliably.
  ([#7](https://github.com/z1n-k/zia/pull/7), by @trashshii007)

## [2.13.0] — 2026-09-19

### Added

- Folder icons and names are suggested by a local model when a folder is
  created with its default name and no icon.

## [2.9.2] — 2026-09-19

### Changed

- Active tab glow on Windows, folder icons, essentials columns, drag highlight,
  new tab panel, space name, unload button and brand label.

## [2.8.3] — 2026-09-18

### Changed

- Essentials fit their columns to the available space instead of using fixed
  breakpoints.

## [2.8.0] — 2026-09-18

### Changed

- Essentials use three columns on a narrow sidebar.

## [2.7.6] — 2026-09-18

### Fixed

- Folder icons centre in their row.

## [2.7.5] — 2026-09-18

### Added

- Author and homepage in `theme.json` for the Sine store.

## [2.7.3] — 2026-09-18

### Fixed

- Windows: the box that clips the active tab's glow is padded, so the glow
  isn't cut off.

## [2.7.2] — 2026-09-18

### Fixed

- Windows: room for the active tab's glow at the bottom of the tab list.

## [2.7.1] — 2026-09-18

### Changed

- Firefox is left to hide the downloads button when there are no downloads.

## [2.7.0] — 2026-09-18

### Added

- Feature toggles for the music player, find bar, icon picker and undo close.

## [2.6.0] — 2026-09-18

First tracked release.

[2.27.12]: https://github.com/z1n-k/zia/compare/v2.27.11...v2.27.12
[2.27.11]: https://github.com/z1n-k/zia/compare/v2.27.10...v2.27.11
[2.27.10]: https://github.com/z1n-k/zia/compare/v2.27.9...v2.27.10
[2.27.9]: https://github.com/z1n-k/zia/compare/v2.27.8...v2.27.9
[2.27.8]: https://github.com/z1n-k/zia/compare/v2.27.7...v2.27.8
[2.27.7]: https://github.com/z1n-k/zia/compare/v2.27.6...v2.27.7
[2.27.6]: https://github.com/z1n-k/zia/compare/v2.27.5...v2.27.6
[2.27.5]: https://github.com/z1n-k/zia/compare/v2.27.4...v2.27.5
[2.27.4]: https://github.com/z1n-k/zia/compare/v2.27.3...v2.27.4
[2.27.3]: https://github.com/z1n-k/zia/compare/v2.27.2...v2.27.3
[2.27.2]: https://github.com/z1n-k/zia/compare/v2.27.1...v2.27.2
[2.27.1]: https://github.com/z1n-k/zia/compare/v2.27.0...v2.27.1
[2.27.0]: https://github.com/z1n-k/zia/compare/v2.23.0...v2.27.0
[2.23.0]: https://github.com/z1n-k/zia/compare/df4a06f...v2.23.0
[2.13.0]: https://github.com/z1n-k/zia/commit/df4a06f
[2.9.2]: https://github.com/z1n-k/zia/commit/92b50b8
[2.8.3]: https://github.com/z1n-k/zia/commit/1eb4259
[2.8.0]: https://github.com/z1n-k/zia/commit/20829bc
[2.7.6]: https://github.com/z1n-k/zia/commit/1c2d623
[2.7.5]: https://github.com/z1n-k/zia/commit/dd3465c
[2.7.3]: https://github.com/z1n-k/zia/commit/3f3a3bc
[2.7.2]: https://github.com/z1n-k/zia/commit/40284ea
[2.7.1]: https://github.com/z1n-k/zia/commit/b5d8b8c
[2.7.0]: https://github.com/z1n-k/zia/commit/86effde
[2.6.0]: https://github.com/z1n-k/zia/commit/cfde8c0
