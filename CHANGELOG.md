# Changelog

Every release of Zia, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.96.14] — 2026-10-06

### Fixed

- Essentials, folders and the Library's tiles on a Zen that can't draw
  squircles (seen on Windows): their corners came out oversized and round,
  and the fine shine round them showed only along the straight sides. There
  the corners are now round at their usual size, with the shine round the
  whole edge, and the music player's progress ring follows suit.

## [2.96.13] — 2026-10-06

### Changed

- The music player in Zia's own shapes and icons: the card a squircle like
  Zia's other cards (its glow and the cards stacked behind it too), with
  the essentials' fine shine round it (the glass edge, with glass on); the
  artwork a squircle tile like an essential's, its progress ring the same
  squircle round it, starting from the top in the middle; its buttons
  Zia's squircle buttons, in Zia's icons (play, pause, back, forward,
  picture-in-picture, close).

## [2.96.12] — 2026-10-06

### Changed

- Folders' fine shine is Dia's rows': measured off Dia's folder rows, lit
  along the top and bottom only, softer, fading out round each corner to
  about half, with the short ends unlit (Zia's shone evenly all round, as
  an essential's does; Dia's essentials do, its rows don't).

### Fixed

- The Library's media tiles' shine follows their squircle all the way
  round, as the essentials' does (it thickened into each corner).

## [2.96.11] — 2026-10-06

### Changed

- The fine shine round the essentials, folders and the Library's tiles is
  Dia's: as bright down the sides as along the top and bottom, a touch
  softer overall, and fading much further into the corners (measured off
  Dia's essentials: the corner about half the sides').

### Fixed

- The card of pages from swiping back or forward has the hover cards'
  spacing, rows and edge: rows as far in from the edge, the same gap
  between them, a tab's height, corner, text and hover, and its hairline
  following its corners (the glass edge, with glass on).

## [2.96.10] — 2026-10-06

### Changed

- Every icon in the toolbar (reload, back and forward, the sidebar button,
  the menu, extensions) is the same colour as the address, as in Dia,
  rather than Zen's softer shade.

## [2.96.9] — 2026-10-06

### Fixed

- Extension icons in the toolbar really are reload's shade now: Zen draws
  toolbar icons in each button's own text colour, a little softened, and
  the extensions' text colour had stayed plain white while the other
  buttons took the site's ink.

## [2.96.8] — 2026-10-06

### Fixed

- Icons you've given an extension are the same shade as reload and the
  sidebar button too, as the other extension icons are since 2.96.6 (they
  were still brighter, in the address's colour).

## [2.96.7] — 2026-10-06

### Fixed

- The numbers on essentials (and on tabs with the sidebar collapsed) sit in
  the same squircle key as on tabs: their corner had been left short, so
  they came out nearly square.
- The mute button on a folder's hover card is a squircle too, as the
  close and unload buttons beside it are.

## [2.96.6] — 2026-10-06

### Changed

- The sidebar's bottom buttons (the Library, the spaces' dots, the tab
  list's arrow) have no tile behind them, hovered, pressed or open: only
  their icons brighten.

### Fixed

- Extension icons in the toolbar are the same shade as reload, back and
  the sidebar button beside them (they were brighter).

## [2.96.5] — 2026-10-06

### Fixed

- A folder's paper no longer snaps a touch as it settles after the folder
  closes: it stays drawn the same way from start to end (and the box's
  pile with it).

## [2.96.4] — 2026-10-06

### Fixed

- Folders have Dia's shape at last: a later rule kept their corners round,
  so they came out as a big round corner with the shine missing at each
  one. Now, fitted off Dia's folder row, only a touch squarer than a circle
  (superellipse(1.3)) over a 13.8px corner, the shine following it.

### Changed

- The space's name sits in Dia's pill: a squircle (superellipse(1.5)) over
  a 14px corner, fitted off Dia's, where Zia's was a round 10px.

## [2.96.3] — 2026-10-06

### Changed

- Folders take Dia's row shape: measured off Dia's folder and tab rows, a
  softer squircle than its essentials' (superellipse(1.5)) over a corner
  of about 14px. Their fine shine follows it all the way round.
- The essentials' squircle corner is Dia's 18px.

### Fixed

- The Library's Clear has the same fine shine as Filter and the
  essentials, with glass off.

## [2.96.2] — 2026-10-06

### Fixed

- Every essential has Dia's squircle, not only the chosen one: a leftover
  rule held the others at the old, shorter corner.
- With glass off, the essentials' and the Library's edge is the fine shine
  they had before glass, brightest along the middle of each side and
  fading into the corners, now following the squircle all the way round.

## [2.96.1] — 2026-10-06

### Fixed

- With glass off, the essentials' and the Library's corners are clean:
  their fine shine is drawn as a hairline that follows the squircle,
  rather than a ring whose inside stayed square, which thickened into a
  point at each corner.
- The chosen essential keeps the same squircle as the others: the colour
  round it was cut to a round corner, so it came out rounder.

## [2.96.0] — 2026-10-06

### Added

- Glass is now an option, off by default: "Glass" under Look. Off, Zia
  looks as it did before glass came in: the fine shine round the
  essentials and the Library's buttons, a hairline round the hover cards,
  the old edges on the selected essential's tile, a glance's card, the
  split cards and the find bar, and no light where you press. On, it's the
  macOS Tahoe glass edge and press light, as in 2.94 and since.

### Changed

- Zia's squircles are Dia's: fitted to the edge of Dia's essentials pixel
  by pixel, a true squircle (superellipse(1.93)) whose corner eases in
  half as far again along each side, cutting in as deep at the middle as
  before. On the essentials, cards, pop-ups, the Library and the small
  buttons; toolbar icon buttons keep the softer curve.

## [2.95.20] — 2026-10-05

### Changed

- A folder given an icon shows the icon by itself, in the folder's place;
  to wear it on the front of the glass folder instead, right-click the
  folder and choose Show Icon on Folder. A folder without an icon is the
  plain folder, as before.

## [2.95.19] — 2026-10-05

### Changed

- A folder's own icon, on the front of its folder, has no shadow.

## [2.95.18] — 2026-10-05

### Fixed

- The Library's rows end as a tab does: their buttons are a tab's close
  button's size, as far in from the row's end as from its top and bottom
  (they sat further in, and were larger).

## [2.95.17] — 2026-10-05

### Fixed

- The sidebar's text size option takes effect: it's now read straight off
  the option, as soon as it's changed, rather than through Zia's script.
- With Firefox's tab hover previews on, Zen's and Firefox's own pages
  (settings, about:config and the like) get a picture in their hover card
  too, as web pages do (#292). (After updating Zia, restart Zen once so its
  new script loads.)

## [2.95.16] — 2026-10-05

### Fixed

- A folder's hover card sits level with the folder again: its first tab
  lines up with the folder's row, centre to centre, so a folder of one tab
  has its card centred on it, as a tab's is.

## [2.95.15] — 2026-10-05

### Changed

- The address bar option now reads as the others do: "Zia's address bar
  (off: Zen's own)", on by default. Anyone who'd turned Zen's on keeps it
  (#302).

### Fixed

- With Zen's single toolbar (the address bar in the sidebar), the address
  bar lines up with the sidebar's edges and the essentials under it: the
  toolbar's own spacing pushed it in.
- With Zen's own address bar, the address keeps Zen's softer colour.

## [2.95.14] — 2026-10-05

### Fixed

- The download's flight eases more gently, a little longer, at no more
  than one and a half times its average speed: mid-flight it crossed
  over 100px between frames, and read as jumpy.

## [2.95.13] — 2026-10-05

### Fixed

- The download's trailing glow and the bloom where it lands are back as
  they were (2.95.12 flattened them); the row itself stays free of the
  blur that made the flight stutter.

## [2.95.12] — 2026-10-05

### Fixed

- The download's flight is smooth: it moved in uneven jumps, as its
  fading blur and the light's blending were drawn frame by frame
  alongside everything a download starts. Now it only moves and fades,
  which the graphics card does.

## [2.95.11] — 2026-10-05

### Added

- "Zen's own address bar, as it looks without Zia" (off by default):
  the address bar and its pop-up as Zen draws them, with the rest of Zia
  kept, the toolbar's colours and buttons among it (#302).

## [2.95.10] — 2026-10-05

### Fixed

- Firefox's "What should Zen do with this file?" box opens in the middle
  of the page, every time: it opened wherever the system put it, often
  top left.
- Saving from that box sends the download's flight to the Library from
  where the box was: there was none, as the box, not the browser, was in
  front when the download began.

## [2.95.9] — 2026-10-05

### Added

- The welcome tour shows a download flying to the Library, in the tour
  for newcomers and in this update's tour of what's new.

## [2.95.8] — 2026-10-05

### Fixed

- Cmd/Ctrl+Z after closing several tabs at once (selected with Shift)
  brings them all back: only some came back, and not always the same
  ones, as Zen closes them a moment apart.

## [2.95.7] — 2026-10-05

### Fixed

- The flying download's name keeps the tails of its letters (g, p, y):
  they were cut off.

## [2.95.6] — 2026-10-05

### Fixed

- The download's flight leans smoothly: one lean that builds through the
  turn and eases off across the sweep, where it flipped side to side as
  it rose. Its path is finer too.
- After AI renaming, the Library button's badge shows the same file
  picture as the card: Zen drew it from the file's old name, gone once
  renamed, and fell back to a plain icon.
- The file's picture on the card, the Library button and the downloads
  list has Zia's squircle corners.

## [2.95.5] — 2026-10-05

### Added

- "Text size in the sidebar" (Default, Small, Smaller or Large), for a
  narrow sidebar where long tab names were cut short.
- With Firefox's tab hover previews on (browser.tabs.hoverPreview.enabled),
  a tab's hover card shows a picture of the page above its name, as
  Firefox's own preview does, for a loaded page you're not on.

### Fixed

- The compact sidebar keeps its rounded corners on Windows with the page
  edge to edge: it took the page's corners, which that squares off.
- The toolbar's buttons and extension icons are always in the same ink
  as the address: extension icons came out fainter, and on dark sites
  the buttons were whiter than the address.

## [2.95.4] — 2026-10-05

### Removed

- 2.95.3's tracking of the pointer inside pages for the download's
  flight, which didn't work: the flight starts above where you last
  clicked, as before, until it's done properly.

## [2.95.3] — 2026-10-05

### Changed

- The download's flight swoops as Dia's does: from just above the
  pointer it drops away from the Library button, rounds the turn and
  sweeps off in a long curve to it, slow through the turn and fast
  across the sweep, tilting with the curve.

### Fixed

- The flight starts above the pointer when you click inside a page too:
  the browser window never saw those clicks, so it started where the
  last click outside the page had been.

## [2.95.2] — 2026-10-05

### Fixed

- The download's flight starts above where the pointer is when the
  download begins: after Save Image As, it started back where the menu
  had been.
- Its light is a faint glow trailing the row along its own path, rather
  than a bright band from start to finish that moved on its own; the
  bloom where it lands is softer too.

## [2.95.1] — 2026-10-05

### Changed

- The download's flight to the Library button moves as Dia's does: it
  starts centred just above where you clicked, winds up for a moment,
  drifting back and tilting, then is flung along a shallow curve,
  levelling out and fading as it lands; the window dims while it flies,
  with a beam of light to the button and a bloom where it lands. In
  light mode the row is white and the dim a light grey.

## [2.95.0] — 2026-10-05

### Added

- A download flies to the Library button as a row, as in Dia: a small
  glass row with the file's icon and name pops up where you clicked,
  then arcs off to the Library button, shrinking as it goes, and the
  button gives a nudge as it lands. In place of Zen's circle; Zen's own
  switch for that animation turns it off.

## [2.94.13] — 2026-10-05

### Changed

- Tab numbers are quieter: a fainter outline round each number, and the
  numbers a touch dimmer.

## [2.94.12] — 2026-10-05

### Fixed

- Pointing at the Library button dismisses AI renaming's card, rather
  than hiding it under the downloads for it to come back after.

## [2.94.11] — 2026-10-05

### Fixed

- AI renaming's card is solid, in the space's colour: it was see-through
  over the music card, and could stay grey whatever the space, where
  Zia misread a space's mixed colour (which the music card's colour
  comes from too).
- The download badge flying from the Library button keeps the list's
  icon size on Zen 1.23 too: 2.94.10's fix only took on newer Zen.

## [2.94.10] — 2026-10-05

### Changed

- AI renaming's card takes the space's colour, as the music card does,
  rather than a fixed grey that looked off on a coloured space.

### Fixed

- The download badge flying from the Library button to the newest
  download stays the list's icon size, rather than growing to twice its
  size over the name and snapping small as it landed.

## [2.94.9] — 2026-10-05

### Fixed

- The Library's search and buttons start level with the traffic lights,
  as far from the top as in the sidebar (they sat 5px higher).

## [2.94.8] — 2026-10-05

### Fixed

- With "Toolbar in the site's colour" off, the toolbar takes Zen's own
  colour, the sidebar's, as the option says, rather than Zia's
  near-black; the page is then a card with all four corners round
  (#271).

## [2.94.7] — 2026-10-05

### Changed

- Folders are no longer glass: a hovered folder's box has the soft
  shine border it had before, with round corners, and no light where
  it's pressed.

### Fixed

- AI renaming's "Renamed from" card shows again on newer Zen, which
  left it empty, so it never appeared (the file was still renamed).

## [2.94.6] — 2026-10-05

### Changed

- The tab and folder hover cards' glass has faint light sides, as the
  find bar's does, rather than dark ones.

### Fixed

- A page glanced at from an essential no longer sometimes shows a thin
  line of colour down the left of its card.
- The Library's Filter and Clear buttons look square; they were a touch
  taller than wide.

## [2.94.5] — 2026-10-05

### Changed

- The glass on the tile inside a selected essential, and on the glance
  card, is softer: its light top and bottom a touch dimmer, its dark
  sides a touch lighter.
- The Library's traffic lights, search and buttons sit as far down from
  the top as the sidebar's traffic lights do (they were 5px higher).

### Removed

- The blue outline round the Library button while AI renaming names a
  download.

## [2.94.4] — 2026-10-05

### Changed

- A page glanced at from an essential shows as a small card of Zia's
  glass, like the essential it sits on.
- The edge of the glass tile inside a selected essential is a touch
  dimmer.

## [2.94.3] — 2026-10-05

### Changed

- The glass tile inside a selected essential has a slightly thicker
  edge, so it no longer gets lost against the essential's colour.

## [2.94.2] — 2026-10-05

### Changed

- The glass edge's light lines along the top and bottom are a touch
  sharper.

## [2.94.1] — 2026-10-05

### Fixed

- The find bar's close button is the same grey as its arrows, brighter on
  hover, rather than white beside them.
- The folders' boxes and the find bar have a faint light line down their
  sides in place of the dark ones, which were lost against a dark sidebar
  or page.

## [2.94.0] — 2026-10-05

### Added

- Liquid glass is Zia's look: a glass edge (a soft light grey hairline
  along the top and bottom glowing into the fill, and a dark one down the
  sides) replaces Zia's old shine and outlines on essentials (the chosen
  one's inner tile too, keeping its colour), folders as you hover or press
  them, the tab and folder cards, the split cards, the address pop-up, the
  find bar, the sidebar as it flies out in compact mode, and the Library's
  buttons and section tile. Pressing an essential, a folder, a Library
  button or one of the Library's sections (the chosen one too, just for
  the shine) lights it up under the pointer: the light snaps on, follows
  the pointer while it's held, and fades once let go.
- The welcome tour shows the liquid glass and downloads that name
  themselves, and anyone updating sees the two of them as what's new.
- Zia's settings are tidier: in eight sections (Look, Tabs and
  essentials, Sidebar and folders, Address bar and new tabs, Page, Media,
  Rename downloads with AI, Welcome tour) with shorter names, and a
  setting that only matters with another one (the AI service's key and
  model, the hover cards' blur, the tab numbers' colour, where
  picture-in-picture tucks) shows only while that one's on: 45 to start
  with rather than 77. The window buttons' settings only show on Windows
  and Linux. Sine showed every such setting until the one it hangs on was
  changed; Zia now shows and hides them as the page opens.
- The glass folders and the archive box are a touch smaller.
- Show where links go: an option (off to start with) that brings back the
  status bar at the foot of the page as you hover a link, as a small pill
  of Zia's glass ([#270](https://github.com/z1n-k/zia/issues/270)).
- A squircle corner, as Dia's (only a touch squarer than a circle), one
  shape for everything with the glass edge and every small icon button
  (the workspaces' icons, toolbar and sidebar buttons, close and unload
  buttons, tab number keys, the cards' buttons, even the blank icon of a
  tab without its own), at the sizes their round corners had. Tab rows,
  the page and menus keep their round corners.
- Rename finished downloads with AI: [Tidy Downloads](https://github.com/Vertex-Mods/Zen-Tidy-Downloads)
  by Bxthesda and Zylaah is part of Zia, with their permission. As a
  download finishes, an AI service gives it a clearer name, shown in a
  card above the Library button with an Undo. Off until you turn on
  **Rename finished downloads with AI** in settings and add a key for
  Mistral, OpenAI, Anthropic, Google, OpenRouter or any OpenAI-compatible
  endpoint, or use Ollama on your own machine. Remove Tidy Downloads if
  you have it as its own mod; Zia's copy uses the same settings. Its code
  is slimmed for Zia (about 4,800 lines to 1,300, leftovers of an older
  download pile gone). While a file's being renamed, only a glowing
  outline shows round the Library button; once it has its new name, a
  small glass pop-up in Zia's look floats above the sidebar's foot,
  moving nothing, out of the way while the Library is open; in compact
  mode a toast says it, with an Undo. Downloads from private
  windows are never sent to an AI service. The card has Zia's glass edge.
  The AI is told the page's address too (stock photo sites describe the
  picture there), and is sent a small copy of a downloaded picture, so it
  can name it by what it shows (a model that can't see pictures is asked
  again without it).

### Fixed

- The small picture of the last download on the Library button clears
  itself a few seconds after the download finishes, rather than staying
  until the button is next hovered (a download under way keeps its ring).
- The last downloads fan out above the Library button again, as tab rows,
  and the Library button shows the picture of the latest one again: 2.92.0
  and 2.93.4 hid them by mistake.
- An essential's hover card meets the tile's corner again, rather than
  sitting a little to the left of it under the new squircle corners.
- Shapes meant to be squircles drawn as circles: the tab number keys, the
  hover cards' buttons and the Glance buttons lost to the rule that rounds
  every other corner. The tab close button is now the same squircle as the
  unload button beside it.

## [2.93.4] — 2026-10-04

### Removed

- The last downloads no longer fan out above the Library button as one
  finishes or as you hover it; they're in the Library's Downloads.

## [2.93.3] — 2026-10-04

### Fixed

- Spaces with no icon, dots at the foot of the sidebar, sit close
  together again, as before 2.93.1; a dot beside a space with an icon
  still keeps a little room from it.

## [2.93.2] — 2026-10-04

### Fixed

- On Windows, the page keeps its gap down the right again: 2.92.0 ran it
  to the window's right edge for the scrollbar's sake, which looked like
  the page had lost its right border.

### Changed

- The Library's sliding section tile, Filter and Clear, and Media's tiles
  have the essentials' fine edge, brightest along the middle of each side
  and fading into the corners, rather than an even line all round.

## [2.93.1] — 2026-10-04

### Fixed

- A space with no icon, a dot at the foot of the sidebar, is spaced like
  the spaces beside it, rather than squashed against the one before.
- The space beside the one shown really no longer peeks in at the
  sidebar's edge on Windows: 2.93.0 hid it, but its folders' names set
  themselves visible again, so the coloured slivers stayed. It's faded out
  whole while it rests to one side.
- No more "XML Parsing Error: syntax error" in the Browser Console for
  each space with an icon: two of Zia's functions shared a name, so the
  space icons went through the one meant for your own extension icons'
  files, which tried to read the icon as text.

### Changed

- Folder icons, and the box they turn into, are a touch smaller.
- The Library's empty-list notes ("No boosts yet" and the like) are at
  the tabs' text size.

## [2.93.0] — 2026-10-04

### Fixed

- The space beside the one shown no longer peeks in at the sidebar's edge:
  its coloured folders showed as thin coloured slivers down the side (seen
  on Windows).

### Added

- A Clear button in the Library's History too, the eraser beside the
  filter, as in Downloads. It opens Firefox's own Clear browsing data and
  cookies dialog, to choose what goes.
- In the Library's Media, a tile catches the light: it leans towards the
  cursor, its fine edge lights up nearest it, and its picture lifts, its
  soft layered shadow falling the other way. It springs back as you leave,
  and stays still for anyone whose system asks for less motion.
- The Library's chosen section is lit by one tile that slides along the
  column to the section you choose, with Zia's spring, rather than one
  going out and another coming on.

### Changed

- The Library's search fields, and the filters' buttons, are at the tabs'
  text size.
- The Library's sections are back in Zen's own animated icons, drawn at
  18px, a little further apart, with more room between each icon and its
  name.

## [2.92.0] — 2026-10-04

### Fixed

- On Windows, compact mode's sidebar has the same corners as the page
  card, rather than far rounder ones: Zen sizes them for its squarer
  Windows curve, which Zia draws as a circle.

### Added

- Zen's Library (Zen 1.23) is drawn like the rest of Zia, kept in Zen's
  layout: its sections are essentials-style tiles, the chosen one lit;
  history, downloads and boosts are tab rows with Zia's hover; the search
  field and filters are Zia's tiles; pictures and boost icons sit on
  essential-shaped tiles; download progress is Zia's loading blue; and it
  follows light spaces and light mode.
- The last downloads that fan out above the Library button are tab rows:
  a tab's height and hover, the file's icon at a favicon's size, and its
  size or state beside the name. Zen's were half as tall again as a tab.
- A Clear button in the Library's Downloads, an eraser beside the
  filter. It empties the list as Firefox's Clear Downloads does: the files
  stay on disk, and a download still under way stays in the list.
- The Library's row buttons use Zia's icons: forget and reopen in
  History, cancel and retry in Downloads. So does the icon picker's remove
  button, shown while an icon is chosen.
- In the Library, rows highlight as tabs do, snapping on and off; the
  sections' column is narrower, with the others' icons as faint as their
  names and no fill on the chosen one; Filter and Clear are icon buttons,
  so the search field keeps its room; and the footer has no Donate.
- The list beside the Library's sections runs to the Library's edge (it
  stopped short, leaving a gap at the right).
- The Library's rows, and the downloads above its button, have the tabs'
  own padding before the icon and gap after it, measured off a tab, with
  each icon at a favicon's size.
- A setting, **Zen's own Library look**, off by default, to keep Zen's
  Library as Zen draws it.
- The Library button at the foot of the sidebar is as faint as the tab
  list's arrow beside it, at full strength while hovered, and no longer
  keeps a small picture of the last download on it.

### Changed

- On Windows, the page meets the window's right edge, so its scrollbar is
  at the edge: a flick of the mouse to the right of the screen, in a
  full-size window, lands on it. Not with the tabs on the right, a panel
  open on the right, or a split.

## [2.91.5] — 2026-10-04

### Fixed

- Light mode (a light space, or no space colour in light mode):
  - The tab and folder hover cards are light cards with dark text.
  - The find in page bar is light.
  - The address bar pop-up is light, whatever the websites' own
    appearance setting.
  - Sound bars on playing tabs and the music card are dark, rather than
    white on the white selected tab.
  - The icon picker's search text, its placeholder and the Outline and
    Solid switch are dark on the light panel.
  - The find in page bar's close button is the same grey as its arrows.
  - The address bar pop-up's site and result icons are dark.
  - The toolbar no longer flashes black while a site loads.
  - An open folder is a shade darker, and its selected tab stays a white
    card rather than fading into it.
- The space name is less washed out by the space colour, in light and
  dark mode.

## [2.91.4] — 2026-10-04

### Fixed

- Picture-in-picture's buttons, shrunk to just their icons in a small
  window, have their icons centred rather than a little to the left.
- With more than one screen, picture-in-picture tucks into every side
  that has no other screen beyond it. Where Windows scales the display,
  the screens were measured in mixed units: only the left side was
  offered, and with a second screen on the left the tuck button was gone
  altogether.
- Kick streams get their music card again, reading LIVE. Since Zen's
  update, a card was dropped as it was made if the stream didn't say
  where it was up to, which Kick's live player doesn't; and Kick's player
  then gives a few seconds' position at a time, which showed as a
  progress line looping round every three seconds.
- Switching spaces, the tabs no longer slide in under the essentials.
  Zen keeps every space's tabs clear of the essentials, but a space made
  since Zen started wasn't always given that room (seen on Windows); Zia
  gives it to every space.

## [2.91.3] — 2026-10-04

### Fixed

- In a split, each pane's corners (and the focused pane's outline) sit
  evenly inside the frame round them. On Windows they were rounder or
  tighter than the page's corners, which take the window's.

## [2.91.2] — 2026-10-04

### Fixed

- A deleted folder brought back with Reopen Closed Tab (Cmd/Ctrl+Shift+T,
  or Cmd/Ctrl+Z) comes back as a folder again, with its name, icon and
  colour: it collapses and animates like any other, rather than staying
  open for good, and the local model no longer tries to name it afresh.

## [2.91.1] — 2026-10-04

### Fixed

- With New Tab at the top of the tabs, dragging an essential back into
  the list no longer opens a space above New Tab, where a tab can't go;
  the space opens under it, where the tab lands, as it does for a tab.

## [2.91.0] — 2026-10-04

### Changed

- A folder's hover card (the card listing its tabs) keeps its tabs as
  far in from its edges, all round, as a tab's icon sits in from the
  tab's edge in the sidebar.

### Fixed

- Clicking the address bar now always selects the whole address. Now
  and then it selected only the start ("youtub"), because the text
  moved under the pointer as the bar opened while the button was still
  down.
- The address bar pop-up's last row has the same gap below it as at the
  sides again, with the list scrolling or not, rather than the extra
  space at the bottom since Zen's update. The pop-up ends under the last
  row that fits whole, and the list scrolls on from there.

## [2.90.4] — 2026-10-04

### Fixed

- Showing the sidebar again by clicking (leaving compact mode), it no
  longer slides in a little high and drops into place as it settles.

## [2.90.3] — 2026-10-04

### Fixed

- In a split, the sidebar button at the start of each pane's toolbar
  shows and hides the sidebar again.

## [2.90.2] — 2026-10-04

### Changed

- In Settings → Sine Mods → Zia, the loading bar option reads "colour"
  and "(off: Zia blue)" like the rest, and the Multiview icon's choices
  match the tab numbers' ("The space's colour").
- The readme's settings table follows the order of the settings
  themselves, and its list of Zen settings Zia changes is complete:
  Zen's tab drop on the page, Zen's acrylic look, picture-in-picture's
  improved controls and the address bar's `https://` trimming are listed
  with the rest.

### Removed

- Leftover code, a style and two icons nothing used any more, so the
  download is a little smaller. Nothing looks or works differently.

## [2.90.1] — 2026-10-03

### Fixed

- With Cmd/Ctrl+T set to leave the address bar ready to type in, the
  search page's address no longer appears in it as the page loads, so
  there's nothing to delete before typing.
- An empty folder's dashed "Drag tabs here" box no longer shows its edge
  under the folder's name as the folder closes.

## [2.90.0] — 2026-10-03

### Changed

- Light mode with no space colour gets the light look light spaces have
  (dark text, white cards), rather than white text on the pale window.

### Fixed

- Hiding a space's pinned tabs and folders, the line above its other tabs
  no longer slides away with them and snaps back a moment later, pushing
  the tabs down, and the line and the tabs bounce together.

## [2.89.0] — 2026-10-03

### Changed

- A tab without its own icon shows just a translucent square, without
  Zen's logo in it.
- Hiding or showing a space's pinned tabs and folders by clicking its
  name springs like a folder opening and closing: the tabs below go a
  little past and settle back (with folders' gentle spring on, Settings
  → Sine Mods → Zia → Folders).
- Zen's donate button is gone from the note Zen shows after an update.
- A white folder's icon has no shadow behind it; coloured folders keep
  theirs.

### Fixed

- Reload has its hover square again on Zen 1.23, like back and forward.
- Zen 1.23 turned its "acrylic" look on for everyone, drawing the
  sidebar part see-through under Zia's own, so it came out far too
  transparent (and the compact sidebar and address bar pop-up changed
  too). Zia switches it back off once, for anyone who hadn't chosen it
  themselves; it takes from the next start. (It's
  zen.theme.acrylic-elements in about:config, to turn back on.)

## [2.88.0] — 2026-10-03

### Added

- A folder given an icon of its own keeps the glass folder (and the
  archive box past three tabs), wearing its icon on the glass front; it
  tips with the front as the folder opens, white with a soft shadow so it
  reads on any tint. Emoji icons keep their colours. The glass folder is
  a touch larger for it. To show a folder's icon alone instead, as
  before, right-click it and choose Show Icon Only.

## [2.87.4] — 2026-10-03

### Fixed

- The glass folder sat a little high on its row; it's centred again.

## [2.87.3] — 2026-10-03

### Changed

- The glass folder and the archive box are a touch narrower, still the
  same width as each other, and each edge is bowed out slightly, a
  squircle's, so their lines aren't ruler-straight; the corners are as
  they were.

### Fixed

- A folder inside another showed its parent's state, not its own: in an
  open folder it looked open even when shut, so opening and closing it
  didn't animate, and it took the parent's sheets, or its archive box.
  Each folder's icon now follows only its own folder.

- Closing a folder ended in a snap, its glass icon's bright bottom edge
  suddenly sharpening as the front landed: Firefox drew the front one way
  while it tipped and another once it was shut. It's drawn the same way
  throughout now, so it closes smoothly; the archive box's lid too.

## [2.87.2] — 2026-10-03

### Changed

- The archive box is the glass folder's width, so the icon stays the same
  size when a folder passes three tabs.

## [2.87.1] — 2026-10-03

### Fixed

- Light spaces: the music card was a grey wash with white writing, the
  essentials faint white tiles, the buttons on tabs (close, unload) white,
  and an open folder's box and the fine edges round tabs and folders
  white on cream, so they all but disappeared; so did the glass folder in
  the space's pale colour, and the arrow in an empty folder's "Drag tabs
  here". The music card is now a white card in the dark ink, the
  essentials firmer white tiles with a fine dark edge, the tab buttons a
  soft dark (as the folders' close mark), the folder box and edges a
  faint shade of black, the glass folder and box a deeper tint with a
  fine dark edge, and the arrow dark.

## [2.87.0] — 2026-10-03

### Added

- A folder of more than three tabs becomes a glass archive box: the
  folder shrinks and blurs away and the box grows into focus. For each tab
  added its lid opens, a sheet drops into the pile and the lid shuts; for
  each one taken out a sheet rises back out. The pile shows up to eight;
  past that a sheet still goes in or out each time. The lid stays open
  while the folder is, and back at three it turns into the folder again.
  Closed, both sit centred on the folder's row.

### Changed

- The swipe card (the round arrow, and the list of pages it opens into)
  is drawn like the tab and folder hover cards: their background, their
  hairline edge rather than a thicker outline, their corners, and
  see-through with them when they are.


## [2.86.2] — 2026-10-03

### Fixed

- Windows: the page's corners came out too sharp after 2.85.0 matched
  them to the window's. They're Zen's own corners there now, worked out
  from the window's, which sit evenly inside it. Thanks to KRY.

## [2.86.1] — 2026-10-03

### Fixed

- PDF viewer: the ⋮ menu was still PDF.js's own, a square grey box with a
  caret and tall rows (taller still with the pen's row open). It's Zia's
  dark rounded panel now, with rounded rows, a quieter icon beside each,
  and the chosen cursor, scrolling and spread in Zia blue. The pen tools'
  pop-ups get the same panel.

## [2.86.0] — 2026-10-03

### Added

- Optional: the space's name above the tabs, where Zen puts it, rather
  than up at the top of the sidebar beside the window buttons (Settings →
  Sine Mods → Zia → Sidebar, off by default). Thanks to $loth.

## [2.85.2] — 2026-10-03

### Fixed

- The copy link button (the paperclip shown when you hover over the address
  bar) could go missing for good: Zia puts it beside Zen's site settings
  button and gave up if Zen hadn't added that button yet when Zia started,
  as could happen just after installing Zia. Zia now waits for it, and if
  the paperclip still isn't there, Zen's own copy button stays instead of
  being hidden. Thanks to $loth.

## [2.85.1] — 2026-10-03

### Fixed

- Updates: Sine could go on offering an older Zia, or none at all, as the
  date Zia gives Sine for its last update hadn't moved since 2.72. It
  moves with every release now.
- The tap as the swipe arrow opens into its card of pages didn't play on
  macOS, which only plays one while the trackpad's own events are being
  handled; it plays with the swipe now.

## [2.85.0] — 2026-10-03

### Added

- Swiping back or forward with two fingers shows Dia's round arrow,
  sliding in from the page's edge, level with its middle, in place of
  Firefox's, with a tap on the trackpad as it comes fully in. Hold the
  swipe and it opens, with another tap, into a card of the pages it goes
  through, the next one first; it stays when you let go, to click the
  page you want, and a click anywhere round it (or Escape) closes it. A
  quick swipe goes back a page as before (Settings → Sine Mods → Zia →
  Page, on by default).
- Optional: hide the glow around the selected tab, keeping its highlight
  (Settings → Sine Mods → Zia → Tabs, off by default).
- Optional: two essentials to a row, however wide the sidebar, so it can
  be made narrower (Settings → Sine Mods → Zia → Tabs, off by default).
- Optional: the page edge to edge, with no gap, rounded corners or shadow
  around it (Settings → Sine Mods → Zia → Page, off by default). Zen's
  own `zen.theme.content-element-separation` set to 0 now does the same,
  where before Zia kept its gap.

### Changed

- Windows: the page's corners match the window's own. Windows 11's
  corner is 8px and the page sits a few pixels inside it, so the page's
  8px corners looked rounder than the window round them; they're the
  window's curve less that gap now, the two sitting evenly together.
- While a glance is open, the toolbar steps back: clear on the window's
  own background, in the sidebar's ink, rather than in the glanced site's
  colour across the whole window. The page behind it is a quieter card
  (8px corners, no shadow) and the glance a rounder one (16px). Thanks to
  meteulku for the design.

### Fixed

- Zen 1.23: the buttons along the sidebar's foot (the library, the tab
  list) came out bigger; they're the toolbar's 16px again, set by Zia so a
  Zen update can't change them.
- Light spaces (a pale space colour, or light mode): the sidebar was
  drawn for dark spaces only, white text and white-tinted surfaces on a
  cream sidebar. Its text is dark there now, with the selected tab and
  essential white cards, and the tab numbers, folder names, space name,
  separator and space dots to match.
- Zen 1.23: the address bar pop-up's rows were taller and further apart
  (Zen gave each a least height and a clear border); they're Zia's size
  again.
- Zen 1.23: the floating music notes Zen added over playing tabs and the
  media card are hidden; Zia's sound bars already show what's playing.
- Zen 1.23: switching spaces could cut off the selected tab's glow again,
  as Zen now marks the sidebar rather than the window while it switches.
- Windows: a click in the top-right corner of a full-size window, just
  past the close button, landed in the gap beside the page and did
  nothing. Close's click area now reaches the screen's right edge and the
  corner above it, as in Windows and Dia.
- A video gone full screen inside the window (rather than taking over the
  screen) kept the page's rounded corners, with grey showing behind them.
  Zia now notices any page going full screen and shows it square, black
  and edge to edge.
- With Zen's single toolbar (the address bar in the sidebar), a dark strip
  ran across the top of the page: the bar there holds only the window
  buttons, but Zia drew it as a toolbar in the site's colour, with a line
  under it and the page's top corners squared off below. The bar is left
  clear and the page is the rounded card, all four corners round.

## [2.84.3] — 2026-10-02

### Changed

- Tab number keys have no fill at all, just their outline, and their
  corners are a little less round.

## [2.84.2] — 2026-10-02

### Changed

- Tab numbers are outlined squircle keys in the system's own font, like
  the shortcuts in Zen's pop-ups, rather than filled keys in a monospace
  one. A single digit's key is always square (two digits widen it), and
  the digits sit exactly in its middle.
- Letting go of Cmd/Ctrl, the tab numbers slide back off to the right the
  way they came in, rather than vanishing.

## [2.84.1] — 2026-10-02

### Changed

- The welcome tour for a new install shows everything the update card
  does too: glass folders, a glance kept in its tab, and Bookmarks and
  History beside your tabs.

## [2.84.0] — 2026-10-02

### Added

- Optional: hide the space's name at the top of the sidebar, keeping its
  icon, so a long name no longer widens the sidebar as you switch spaces
  (Settings → Sine Mods → Zia → Tabs, off by default).

## [2.83.2] — 2026-10-02

### Changed

- The folder icon's sheets stack from left to right: one sits in the
  middle, a second slides in behind it on the right and pushes it
  left, a third goes in behind those two. The back one is a little
  dimmer, so it reads as further back.

### Fixed

- With folder naming by the local model on, a folder still called *New
  Folder* was renamed after restarting the browser (or bringing it back
  with Cmd+Z): Zen announces restored folders as if they were new. Only
  folders you make now get named.
- A tab dropped into a folder put down its sheet in the two-sheet spot,
  which then jumped wider: while Zen drops a tab in, the folder holds an
  extra child for a moment, and it was counted. The sheets are counted
  once the folder has settled, and move between spots smoothly.

## [2.83.1] — 2026-10-02

### Changed

- The glass folder icon's corners are a little rounder, front and back.
- An opening folder's front tips further open, so it reads clearly as
  open, falling a touch past and settling back up. The spring was meant
  to be there all along, but a more specific rule kept every part of the
  icon easing plainly.

## [2.83.0] — 2026-10-02

### Added

- The welcome card comes back once after this update, with what's new
  since it last showed: glass folders, a glance's picture kept in its tab,
  Bookmarks and History beside your tabs, and the toolbar in each site's
  own ink. As before, it can be switched off after updates in settings,
  and **Show what's new in this version again** brings it back (Show the
  welcome tour again still shows the full tour).

### Fixed

- On a site with a thin strip of another colour along its top edge, the
  toolbar kept flicking between the strip's colour and the page's, even
  with nothing moving. Every reading of the site's colour now looks at the
  same band at the top of the page, so they no longer disagree.

## [2.82.3] — 2026-10-02

### Fixed

- On Windows, the minimise, maximise and close buttons lost their icons in
  v2.81.2: the wider click area above them took the place Firefox draws
  the icons in.

## [2.82.2] — 2026-10-02

### Changed

- The folder icon of a folder left white (the default) is a touch
  brighter.

## [2.82.1] — 2026-10-02

### Changed

- A tab whose site is waiting to play (autoplay blocked) showed Zen's
  music note in a plain black badge. It's now a small play button in the
  same round badge as Zia's sound bars, and a click still plays it.

## [2.82.0] — 2026-10-02

### Added

- Folders without an icon of their own show a glass folder in their
  colour (or the space's) instead of Zia's rings, holding a sheet of paper
  for each tab or folder in it, up to three: an empty folder is just the
  folder. It opens and closes with the folder, the sheets fanning out, and
  a tab dropped in drops a sheet in with it; dragged out, its sheet lifts
  out and away.
- Optional: Cmd/Ctrl+T can leave the address bar ready to type in, with
  your search engine's page behind it, instead of the page's own search
  box (Settings → Sine Mods → Zia → New tabs).

### Changed

- The toolbar's text and buttons take the site's own colour, as in Dia:
  on a cream page they're a soft brown, on a white one a soft grey, the
  buttons (and the icons you've given extensions) the same ink as the
  address.
- The find bar is as tall as the address bar, and a touch see-through
  with the page blurred behind it.

### Fixed

- Find in page (Cmd/Ctrl+F) opened with your last search still in it (on
  macOS, from the system's shared find clipboard): it opens empty now, as
  in Dia. Text selected on the page still fills it in.
- With the address bar's text centred, the floating address bar in the
  middle of the window was centred too: only the toolbar's is now.
- An empty folder's "Drag tabs here" slot shrank while a glance was open:
  it was sized from the glance's small picture.
- A new, empty folder (New Folder) briefly showed a loading placeholder
  and got a plain folder icon, with naming folders by a local model on:
  Zen's hidden placeholder tab counted as a tab to name it by.

## [2.81.2] — 2026-10-01

### Fixed

- Windows: flicking the mouse to the top of the screen missed minimise,
  maximise and close, landing in the gap above the page's card instead.
  Their click area now reaches the window's top edge, as in Windows
  itself; they look just the same.

## [2.81.1] — 2026-10-01

### Fixed

- Dragging a tab onto the essentials did nothing: it no longer turned into
  a tile on the way, and didn't become an essential when dropped. The
  dragged tab's section was raised over the essentials (so their icons
  didn't show through it), which hid them from Zen, and with separate
  essentials per container Zia looked for them in an empty box.

## [2.81.0] — 2026-10-01

### Added

- Glance's picture on a tab sinks back into the tab when the glance is
  opened as a tab of its own, closed, or opened into a split, instead of
  vanishing and covering the site's icon. Thanks to
  [Zylaah](https://github.com/Zylaah).

## [2.80.4] — 2026-10-01

### Fixed

- The Bookmarks, History and Synced Tabs panel's close button was still
  white: it takes the downloads button's light grey now, copied from it.

## [2.80.3] — 2026-10-01

### Changed

- The Bookmarks, History and Synced Tabs panel's close button is the light
  grey of the toolbar's icons, like the downloads button.
- README: Bookmarks and History comes after Split view.

### Fixed

- The downloads button beside the space's name had more room below its
  icon than above, in its hover background, and sat a little lower than
  the toolbar's icons beside it: it's a square, the icon in its middle, a touch
  smaller, level with the toolbar's icons (the toolbar is a pixel taller
  for it), as in Dia.

## [2.80.2] — 2026-10-01

### Fixed

- The Bookmarks, History and Synced Tabs panel on the same side as the tab
  sidebar ran straight into it: a hairline, like the sidebar's separator,
  parts them now, the window's full height, with the same gap on both
  sides of it, and the panel slides in and out from under the page
  rather than across the tabs. Opposite sides are unchanged.

## [2.80.1] — 2026-10-01

### Fixed

- With an extension open in the sidebar panel (Bitwarden and the like),
  the compact sidebar, hover cards and address pop-up lost their blur on
  macOS. The panel is drawn the way the page is for them, so they blur
  again.

## [2.80.0] — 2026-10-01

### Added

- An option to keep the sound bars moving even when the system asks for
  less motion (macOS's Reduce motion, Windows' Animation effects off), off
  by default. The README explains reduced motion on each system, and how
  to let Zen animate without changing the system's setting.

### Fixed

- The floating address bar with nothing listed under it had its address
  and icon 5px below the middle: the bar was drawn 10px shorter than the
  row it holds. It's as tall as its row now.

## [2.79.1] — 2026-10-01

### Fixed

- With "New tabs open your default search engine's page" off, a new tab
  page set by an extension (Yet another speed dial and the like) is left
  alone: Zia had reset it to an empty page. Zia now only undoes the page
  it set itself, and puts an extension's back if it had replaced it.
  Splitting a tab by dropping it on itself opens that page too.

## [2.79.0] — 2026-10-01

### Added

- The Bookmarks, History and Synced Tabs panel slides in from the
  window's edge as it opens, the page giving way to it, and back out as it
  closes, with Zen's own spring, exactly as the tab sidebar does.

### Fixed

- The floating address bar with nothing to list under it (history, top
  sites and suggestions all off) looks like the pop-up it is, in its
  colour, corners and shadow, with its text centred, rather than a flat
  box with the address sitting low.
- Collapsing or opening the sidebar no longer flashes a black strip at the
  page's edge while the site catches up with its new width: the strip is
  the site's own colour. (Dia shows it too.)

## [2.78.3] — 2026-10-01

### Fixed

- Bookmarks and History rows could open with their icon at the very edge
  and a wide gap before the name, if a tab was hovered as the panel opened.

## [2.78.2] — 2026-10-01

### Fixed

- With asleep tabs dimmed, collapsing a folder hides a folder inside it
  again: the dimming had kept the inner folder showing.

## [2.78.1] — 2026-10-01

### Fixed

- The Bookmarks, History and Synced Tabs panel can no longer be dragged
  wider than the tab sidebar can.

## [2.78.0] — 2026-10-01

### Added

- Firefox's Bookmarks, History and Synced Tabs panels (Cmd+B,
  Cmd+Shift+H, or View > Sidebar) are a second sidebar: beside the page,
  full height on the window's own background like the tabs, and no wider
  than the tab sidebar may be. Their rows are measured off your tabs
  (text, colours, height, gaps, padding, folder indent), with highlights
  shaped like the space name's and long titles fading as a tab's do. The
  title sits level with the space's name in its colour, with Zia's close
  button; Zia's solid icons replace Firefox's, and the search field gets a
  soft fill and a faint focus line. Its look and its place beside the page
  can each be switched off in settings.

## [2.77.4] — 2026-10-01

### Fixed

- A folder (or tab) dragged up over the essentials stays on top of them,
  instead of their icons showing through it.

## [2.77.3] — 2026-10-01

### Fixed

- Searching bookmarks, history or tabs from the address bar: the text and
  icons sit in the middle of the bar, not lower down with less room below.
- Tab numbers go away as soon as another shortcut is pressed with Cmd (or
  Ctrl), such as Cmd+W to close tabs, instead of staying up after Cmd is
  let go.

## [2.77.2] — 2026-10-01

### Changed

- A glance's picture on a tab no longer tilts as it drops back from its
  bounce: it tips into place on the way up only. The small bounces after
  the big one are slower, so it settles more naturally.

## [2.77.1] — 2026-10-01

### Changed

- A glance's picture on a tab rises out of the tab as the glance opens,
  overshoots, tips back on the way down and settles after two small bounces,
  as in Dia.

## [2.77.0] — 2026-10-01

### Added

- A glance on a normal tab shows as a small picture of the page, tipped at an
  angle and cut off by the tab's bottom edge as in Dia, instead of an icon.
  Hovering the tab tips it a little further and brings its close button
  over it: the first click closes the glance, the next closes the tab. It
  can be switched off in settings.

## [2.76.0] — 2026-09-30

### Added

- A welcome tour: a short card with moving pictures of what Zia does, shown
  once when you first install it, and after updates that bring something
  worth showing. Step through it, close it, or see it again from settings.

### Changed

- Tab hover card: the pin and paperclip icons are the same size, as in Dia
  (the paperclip was drawn larger than the pin).

## [2.75.0] — 2026-09-30

### Changed

- Numbered tabs: typing a number now lights its key up, in Zia blue or your
  space's colour (a new setting), and the tab is only chosen when you let
  go of Cmd/Ctrl, so a single digit never loads a tab by accident. Past
  nine, type the digits in turn at any pace (Cmd + 1 + 2, then let go, for
  tab 12). Pressing another key, or letting go with nothing typed, changes
  nothing.

## [2.74.3] — 2026-09-30

### Changed

- A folder's hover card spaces its tabs as the sidebar does (4px apart).

## [2.74.2] — 2026-09-30

### Changed

- Essentials are 1px shorter (41px), as in Dia.

## [2.74.1] — 2026-09-30

### Changed

- Tab numbers are set in a monospaced font, like keys, and a little smaller.

## [2.74.0] — 2026-09-30

### Added

- Numbered tabs, one of the simplest and most useful features yet. Hold
  Cmd (Ctrl on Windows and Linux) and every tab and essential shows its
  number; press the number to jump straight there. They only show while
  you hold the key, so there's no extra clutter the rest of the time. It's
  on by default and can be turned off in settings.
- Tabs past 9 are reachable too: keep holding Cmd and type the digits in
  turn. Cmd + 1 + 2 goes to tab 1, then on to tab 12, so single digits
  stay instant.

## [2.73.1] — 2026-09-30

### Fixed

- On black and near-black sites (GitHub) the address is white again, and
  the grey after it lighter, as in Dia: only the pure black ones got white
  text, the rest a dim grey.

## [2.73.0] — 2026-09-30

### Added

- Your own SVG icons for folders and spaces, as for extensions: right-click
  a folder or space, then Change icon → Choose an SVG…. It takes the
  sidebar's colour, like Zia's own icons, or keeps its own colours. The
  same menu opens the icon picker, or takes the icon off.

### Fixed

- The toolbar no longer flashes white on sites that show a white splash
  before their dark page (Discord): a reading unlike the site's remembered
  colour is only believed when a second, a moment later, agrees.

## [2.72.23] — 2026-09-30

### Changed

- Tabs, folders and the rows in folder cards are 1px shorter (34px), as in Dia.

## [2.72.22] — 2026-09-30

### Changed

- A folder's hover card: its selected tab stays dark too, with the same thin
  edge as in the sidebar.

## [2.72.21] — 2026-09-30

### Changed

- The selected tab stays dark inside a folder, as in Dia, rather than turning
  grey on the folder's lighter box.

## [2.72.20] — 2026-09-30

### Changed

- Tab hover card: its buttons' icons are drawn with thinner lines, as in Dia,
  and split is a wider box.
- The selected tab, as in Dia: its background a touch lighter, and its edge
  an even thin line all the way round instead of bright corners.

## [2.72.19] — 2026-09-30

### Changed

- Windows: minimise, maximise and close light up on hover as Windows and Dia
  do, red behind close, the close button in the window's corner (thanks to
  Zylaah). The old dimming is a setting: **Windows window buttons just dim
  on hover**.

## [2.72.18] — 2026-09-30

### Changed

- Address bar: the **Switch to tab** tag is in regular weight, not medium.

## [2.72.17] — 2026-09-30

### Fixed

- A folder's card with more than ten tabs shows exactly ten, without a
  sliver of the eleventh under them.

## [2.72.16] — 2026-09-30

### Added

- Setting: **A coloured folder's card takes the folder's colour** (off by
  default), the card of tabs shown on hovering a closed folder.

## [2.72.15] — 2026-09-30

### Added

- Setting: **Address bar text is centred** (off by default).

### Fixed

- Dragging a folder onto the page doesn't bring up the split cards: a folder
  can't be split (the tabs in one still can).
- Dragging an essential onto the page: it turns into its page's picture, as
  a tab does, and back into its tile coming back.

## [2.72.14] — 2026-09-30

### Fixed

- Dropping a folder into a closed folder: it stays closed, without opening
  to show all its tabs (the dropped folder missing from them for a frame).
- The fine edge round essentials, folders and cards shows on 1x screens
  (most Windows ones): at half a pixel it rounded to nothing there.

## [2.72.13] — 2026-09-29

### Fixed

- Spaces: with the pinned tabs tucked away, choosing another tab shuts them
  as smoothly as the shown tab's "-" does (its folder's name went first,
  the tab lingered, then it all snapped shut).

## [2.72.12] — 2026-09-29

### Fixed

- Spaces: with the pinned tabs tucked away, the separator travels up to its
  place once the tab shown among them is unloaded or another tab is chosen
  (it shot up out of sight and snapped back, or stayed gone).

## [2.72.11] — 2026-09-29

### Fixed

- Dragging a tab: now and then the folders above it all jumped up out of its
  way as it was barely moved (the tabs' order was read from a count that
  can lag a moment behind a move).

## [2.72.10] — 2026-09-29

### Fixed

- Folders: tucking the workspace's folders away (clicking its name) leaves no
  gaps above or below the one still showing.
- Spaces: with the pinned tabs tucked away, choosing a tab outside them
  tucks away the one that was open among them too (it stayed showing).
- Folders: a folder inside another that's open opens along with it, its tabs
  sliding in, not snapping in afterwards.

## [2.72.9] — 2026-09-29

### Fixed

- Folders: an empty folder's drop box shows at once as it opens and fades as
  it closes, as its tabs would (it was the wrong way round).

## [2.72.8] — 2026-09-29

### Fixed

- Folders: a closed folder showing its open tab keeps its padding below the
  tab again; the extra room under the folder's name goes instead. Open
  folders get the same tighter gap under their name.
- Folders: the tabs in one no longer drop a few pixels as it closes.
- Dragging a tab over the essentials: it taps as the tiles move aside for
  it, as a split does, not for every tile crossed.
- Dragging a tab back out of the essentials: it turns back into its row as
  it grows, as a split does, not a tile stretched to a row's width first.
- Dragging a tab out of a folder: the folder loses its highlight at once
  (it lingered after the drop), and its box closes all the way as the tab
  leaves.
- Dragging a tab out of a folder: everything moves by a whole tab's height
  (it was measured from the folder's name, now a little closer), so nothing
  below snaps down on the drop.
- Dragging a tab out of a folder: it widens back to a full tab at once, as
  it narrowed going in.
- Essentials: a row of fewer than would fit fills the sidebar, and the tiles
  no longer jump as the sidebar widens.
- Essentials: they close up behind one dragged out, and a tab dragged over
  them no longer flips between a tile and a row.
- Dragging a tab out of a folder: the folder eases shut to its closed height,
  without opening a little first or the folders below snapping.

## [2.72.7] — 2026-09-29

### Changed

- Back to the latest: 2.72.6's return to 2.71.5 is undone, and the fixes
  made since 2.72.5 are in.

### Fixed

- Splits: they go into closed and empty folders, show both halves in a closed
  folder, stay put dropped at the top, lose their glow at the top like a tab,
  don't bring up the split cards, morph to and from the essentials, and open
  a cell among the essentials where the pointer is (the tiles sliding aside).
- Dropping tabs: no flash, jump or width jolt as a row lands in a folder or
  out of one; no full-width sliver between folders inside another; a closed
  folder whose tab is dragged out goes to its closed height, without a bounce.
- Essentials dragged into the list can go into folders; no phantom copy
  over the essentials; New Tab closes up with the list.
- Empty folders slide open; reload eases into its hover look after loading;
  closing one of a split's tabs doesn't jump.

## [2.72.6] — 2026-09-29

### Changed

- Back to 2.71.5: everything since (Zia animating folders itself and its
  undoing, the separator and gap changes to tab dragging, the split outline
  over empty folders, and the tab list's scrollbar fix) is taken out.

## [2.72.5] — 2026-09-29

### Fixed

- A split dragged over an empty folder now wears the dashed outline, round
  its box (2.72.4 put it on its tabs, which a split draws no background
  for, so it never showed).

## [2.72.4] — 2026-09-29

### Fixed

- A split dragged over an empty folder wears the folder's dashed outline,
  as a single tab does (its tabs were left plain).

## [2.72.3] — 2026-09-29

### Changed

- Folders are back to how they were in 2.71.5: Zen animates them, with
  Zia's adjustments on top. Zia animating folders itself (2.72.0) is gone,
  and with it the glitches it brought (nested folders showing a tab
  flashing and bouncing as they opened or shut, an empty folder snapping
  open, split tabs no longer dragging into folders). The drag and
  scrollbar fixes from 2.72.0 and 2.72.1 stay.

## [2.72.2] — 2026-09-29

### Fixed

- A folder opened and shut again quickly shuts properly, instead of its
  bottom tabs staying on show under it until it was next opened.

## [2.72.1] — 2026-09-29

### Fixed

- A tab dropped into an empty closed folder keeps the folder shut, showing
  the tab, instead of the folder flashing open (Zen opens a folder whose
  only tab is the open one).

## [2.72.0] — 2026-09-29

### Changed

- Folders are animated by Zia alone. Zen's own folder animations are
  switched off, so Zen goes straight to each new layout (opening, closing,
  showing just the open tab, letting go of it, unloading), and Zia
  animates from what was on screen to it, the same way every time. The
  many fixes for Zen's animations going stale when a folder was clicked
  again part way, or for Zen writing its own values back after Zia's, are
  gone with them.

### Fixed

- Dragging a tab up past the separator, it lands in the gap below the last
  folder first, then goes in still sitting in the space made for it: it
  counted as past the separator at the same point it went in, so it went
  straight in.
- Dragging a tab back down out of the last folder, it leaves once its
  bottom meets the folder's, and past the separator again at the point it
  crossed it, so no empty space shows above it.
- No scrollbar shows down the tab list (Zen gives each space's list its own,
  which the stylesheet didn't reach).

## [2.71.5] — 2026-09-29

### Fixed

- The buttons on tab cards (pin, split, copy link), in split view panes
  and in Glance no longer show brighter spots where an icon's strokes
  overlap.
- Dragging a tab past a closed folder showing its open tab, the folder
  moves aside as one: the tab it shows no longer came apart from its name,
  and the tabs it hides no longer showed (one appeared as "Revert").
- A tab can be dropped at the top of a closed folder showing its open tab,
  between the folder's name and that tab, which moves down to make room.
- Opening a tab no longer leaves the tabs' right edge out of line with the
  pinned tiles above until the sidebar is resized.
- Just after dropping a tab, the tab you hover shows its x straight away,
  a tab dropped into a folder no longer shows its x and its - at once,
  and moving on to the next tab in the folder, the dropped one's - goes
  (both showed one).

## [2.71.4] — 2026-09-29

### Fixed

- A YouTube live stream in the music player shows LIVE, as Twitch and Kick
  do, instead of a progress line that jumped about.

## [2.71.3] — 2026-09-28

### Fixed

- The + and "New Tab" line up with the icons and names of the tabs above
  (they sat a pixel and a half to the left).

## [2.71.2] — 2026-09-28

### Fixed

- The music player's time no longer cuts off for something an hour or
  longer (-1:54:45 lost its last digit).

## [2.71.1] — 2026-09-28

### Changed

- The music player showing YouTube channel pictures is now off by
  default; the setting turns it on.

## [2.71.0] — 2026-09-28

### Added

- The music player shows a YouTube channel's picture instead of the
  video's thumbnail. On by default; a setting turns it off.

### Fixed

- Picture-in-picture shows the video's site again on newer versions of
  Zen, which moved the part of Firefox it's read from.
- Picture-in-picture with Dia's look no longer shows a dark bar and a
  play button in the top left corner when something else styles
  Firefox's control bar as a floating pill.

## [2.70.13] — 2026-09-28

### Fixed

- Opening a folder that showed just its open tab, its other tabs fade in
  as it opens, instead of staying invisible and all showing at once at
  the end.

## [2.70.12] — 2026-09-28

### Fixed

- Dragging a tab up into the last folder above the separator, it goes in
  sooner, rather than sitting below the folder for a stretch first.

## [2.70.11] — 2026-09-28

### Fixed

- Opening a closed folder showing a tab from a folder inside it, the
  inner folder's name stays put as it opens, instead of going at once so
  the tab jumped up and back down.

## [2.70.10] — 2026-09-28

### Fixed

- Opening a folder that showed just its open tab, its other tabs fade in
  as they grow back, instead of a strip of each showing for a moment.
- Clicking the name of a closed folder kept inside a closed folder opens
  it as well as the folder round it (it only opened the outer one).
- A closed folder showing its selected tab no longer leaves a gap under
  it when a folder inside it is open (the fix in 2.70.9 lost out to
  another rule).
- Selecting a tab elsewhere while a closed folder shows a tab from a
  folder inside it, that tab and the inner folder's name fade and the
  folder shrinks shut, instead of vanishing at once.

## [2.70.9] — 2026-09-28

### Fixed

- A closed folder showing its selected tab no longer leaves a gap under
  the tab when a folder inside it is open: the inner folder's other tabs
  and room shrink away with the rest.
- Clicking the name of a folder kept inside a closed folder opens both,
  instead of seeming to do nothing, and the tabs the closed folder hides
  fade as they go rather than leaving an empty gap for a moment.
- Selecting a tab elsewhere, a closed folder still showing its last tab
  keeps the inner folder's name above it.
- Opening or shutting a folder holding the open tab no longer cuts off
  that tab's glow for a moment, and its other tabs no longer show piled up
  as they grow back.

## [2.70.8] — 2026-09-28

### Fixed

- Clicking an empty folder open and shut quickly, it springs smoothly
  every time, instead of moving in jumps or sometimes not bouncing.
- Clicking a folder open and shut quickly no longer sometimes leaves it
  shut with an empty gap under its name.
- Opening a folder again while it's still closing, its tabs no longer
  slide down from above: it grows back open over them.
- In a closed folder showing its selected tab, a folder inside it that's
  hidden no longer leaves a thin line that can be hovered, and an empty
  one's "Drag tabs here" box shrinks away smoothly with the rest.

## [2.70.7] — 2026-09-28

### Fixed

- A Kick stream in the music player shows the streamer's picture, as Twitch
  does, instead of Kick's icon.
- Picking a tab from a closed folder's list no longer pops the folder open
  empty and shrinks it back (2.70.5).
- An empty folder inside a closed folder, with a tab selected in the outer
  one, no longer leaves its "Drag tabs here" box showing.
- A closed folder showing a selected tab that sits in a folder inside it
  keeps that inner folder's name above the tab, as it is open, instead of
  a bare box round the tab.
- Unloading a closed folder showing its selected tab, its tabs no longer
  flash up piled on one row as it shuts.
- When the front music player goes away, the one behind shows as it moves
  up, instead of an almost empty card for a moment.

## [2.70.6] — 2026-09-28

### Fixed

- With the downloads button hidden until there's a download, the first
  download flies to the button as it appears, instead of dropping a square
  in the bottom corner.

## [2.70.5] — 2026-09-28

### Fixed

- Opening a folder again while it's still closing, it grows back smoothly
  from where it had got to instead of snapping open.
- Clicking a folder open and shut quickly, it no longer sometimes snaps or
  slides its tabs up: Zia now reads which way the folder is going from the
  folder itself, since Zen's own start and end points go stale mid-way.
- An empty folder's "Drag tabs here" box stays put while the folder opens
  and closes, fading out like the tabs do, instead of shrinking and sliding.

## [2.70.4] — 2026-09-28

### Fixed

- Opening and closing a folder quickly over and over no longer leaves it
  open with its tabs invisible.

## [2.70.3] — 2026-09-28

### Fixed

- "+ New Tab" in the sidebar is the same size as the tabs' names (it was a
  little bigger).

## [2.70.2] — 2026-09-28

### Fixed

- Dragging a tab into the last folder above the separator, it sits in the
  space the folder makes for it, instead of over the folder's name.

## [2.70.1] — 2026-09-28

### Fixed

- A new, empty folder is no longer given a suggested icon (it only ever
  had its default name to go by).
- Renaming a tab or folder, the text stays the size it is in the list.
- The address bar's "Switch to tab" tag no longer slips off the end of a
  row with a long title (a sliver of it showed at the edge).
- "Switch to tab:" in the address itself is the same size as the address.

## [2.70.0] — 2026-09-28

### Added

- An option for coloured folders to show their colour only when hovered or
  open ("Coloured folders only show their colour when hovered or open", off
  by default): closed, they're just their coloured name.

## [2.69.5] — 2026-09-28

### Fixed

- On vivid site colours a little on the dark side (a strong red, say), the
  address is white and the rest of it after the slash stays readable,
  instead of a soft grey that all but vanished.

## [2.69.4] — 2026-09-28

### Fixed

- With the folder spring off, an empty folder opens in one smooth motion:
  its "Drag tabs here" slot now keeps Zen's own timing, where it paused for
  a moment part way (thanks Bxthesda).
- With the folder spring off, folders still open over their tabs and fade
  them out in place as in Dia (the setting only turns off the bounce);
  they had gone back to Zen's slide.

## [2.69.3] — 2026-09-28

### Fixed

- With the folder spring turned off, an empty folder's "Drag tabs here"
  slot (as on a Live Folder with nothing in it) no longer springs open and
  shut (thanks Bxthesda).

## [2.69.2] — 2026-09-28

### Fixed

- A collapsed space no longer shows a thin bright line above the folder it
  keeps (the squashed edges of the coloured folders it hides).

## [2.69.1] — 2026-09-28

### Changed

- Collapsing a space (clicking its name) with a tab open inside a folder
  keeps that folder's name showing above the tab, instead of leaving the
  tab on its own (thanks Bxthesda).

## [2.69.0] — 2026-09-28

### Changed

- Opening or closing a folder, its tabs stay in place, as in Dia, instead
  of sliding down from under the folder's name: the folder opens over
  them, and closing, they fade out where they are.
- Tabs you're not on are a little dimmer (in folders and splits too),
  going white once selected, as in Dia.

### Fixed

- Dragging a tab, folder or split into or out of a folder (open or
  closed), or across the separator, now gives a haptic tap, like the other
  moments in a drag.
- Dragging a tab up past the separator opens a space below the last
  folder, instead of dropping it straight into that folder.

## [2.68.0] — 2026-09-28

### Added

- Open tabs are marked in the address bar's suggestions: a small "Switch to
  tab" tag at the end of the row.

### Changed

- The page's outline against the sidebar is lighter.
- Corners are round throughout (except Zen's menus and panels), which
  fixes squarer corners on Windows (thanks Zylaah).

### Fixed

- Picture-in-picture: pulling a tucked window out keeps going once it's
  fully on the screen, instead of stopping at the edge until you let go,
  and can be tucked away again in the same drag.
- With a long tab list, an empty band no longer sits between the tabs and
  the media cards (room kept for the last tab's glow, now inside the list).
- The address bar let you type "twitch.tv" but not the "/" after it (the
  autofilled slash that Zia hides took the typed one with it).

## [2.67.11] — 2026-09-27

### Fixed

- The icon picker's bin button puts an extension's own icon back, and
  shows after picking one of Zia's icons too, not only Zen's (and straight
  away for an extension that already has a custom icon).

## [2.67.10] — 2026-09-27

### Fixed

- Picking an extension's icon from the icon picker changes it again: each
  icon clicked goes straight on the button, with the picker left open.

## [2.67.9] — 2026-09-27

### Fixed

- Picking one of Zia's icons (for an extension, folder or space) could be
  followed by Zen handing on a broken icon address, which replaced the
  one picked when the picker stays open.

## [2.67.8] — 2026-09-27

### Fixed

- Picking an extension's icon from the icon picker: the picker really
  stays open now as you click through icons (each is shown on the button
  as you go and saved when the picker closes), also when the extension was
  right-clicked in the extensions menu.

## [2.67.7] — 2026-09-27

### Fixed

- Sine could say Zia was up to date while an older version was installed,
  after several releases close together. Zia now tells Sine when each
  release was made, so an update always brings the files that match.

## [2.67.6] — 2026-09-27

### Fixed

- Picking an extension's icon from the icon picker: the Zen tab can be
  gone back to after opening the Zia tab, and the picker stays open so you
  can click through icons, each one tried on the button straight away.

## [2.67.5] — 2026-09-27

### Fixed

- The reload icon is back to how it was before 2.67.3: the changes to where
  its line meets the arrowhead made it misbehave.

## [2.67.4] — 2026-09-27

### Fixed

- The reload icon's line meets its arrowhead again with no gap, at rest
  and on hover, and still without a brighter spot where they join.

## [2.67.3] — 2026-09-27

### Fixed

- The sidebar icon no longer shows brighter spots where its divider meets
  the outline (it's drawn as one line now, so nothing overlaps), and
  its lines are a touch thinner, closer to Dia's.
- The reload icon no longer shows a brighter spot where its line meets the
  arrowhead.

## [2.67.2] — 2026-09-27

### Fixed

- The sidebar and menu (···) buttons are the same shade as back, forward
  and reload, instead of a little brighter or darker.

## [2.67.1] — 2026-09-27

### Fixed

- Custom extension icons are the same colour as the back, forward and
  reload icons, instead of a shade darker.

## [2.67.0] — 2026-09-27

### Added

- A setting to give essentials back Zen's own widths: turn off "Essentials
  are Zia's narrower tiles". Zia's tiles stay the default.

## [2.66.0] — 2026-09-27

### Added

- Extensions can have icons of your own: right-click an extension's button
  (in the toolbar or the extensions menu) and choose Change icon, then pick
  an SVG from your computer or one of Zia's icons. SVGs take the toolbar's
  colour like Zia's own icons, unless you tick Keep the SVG's own colours.
  Scripts, links and anything embedded are stripped from them first.
  Extensions that change their own icon (on or off, or per site) are noted,
  and Zia asks before covering that up. Reset puts the original back.

### Fixed

- Picture-in-picture: on live streams the sound controls now move down to
  the bottom on sites where they stayed up, since Zia now
  also goes by Firefox hiding the progress line.

## [2.65.1] — 2026-09-27

### Changed

- Picture-in-picture has rounded corners on Windows 11 too, as on macOS.
- Picture-in-picture: on a live stream (no progress line), the sound
  controls sit down at the bottom instead of floating above the gap.

## [2.65.0] — 2026-09-27

### Added

- Picture-in-picture has a Minimise button beside Close: it puts the window
  away and the video keeps playing in its tab (Close still stops it).

### Changed

- Picture-in-picture: where the window tucks is chosen by right-clicking
  the tuck button, instead of from the small arrow that sat beside it.

## [2.64.0] — 2026-09-27

### Changed

- Zen's glance buttons (close, open as a tab, split) are in Zia's look:
  one dark card like the hover cards, with Zia's icons.

## [2.63.0] — 2026-09-26

### Added

- The music player card stays when its video goes picture-in-picture (from
  the card's own button or anywhere else), still showing and controlling
  it: a setting, on by default (off: the card goes away, as before).

## [2.62.0] — 2026-09-26

### Added

- A setting to hide the window buttons (minimise, maximise, close) on
  Windows and Linux, for anyone who uses the keyboard for those (off by
  default).
- A setting for the address bar to show only the page's title, in the
  domain's colour, until it's clicked (off by default).

## [2.61.4] — 2026-09-26

### Fixed

- The first essential dragged back into the list after a restart can be
  closed again (and so can the window): the tile Zia draws during the drag
  stayed in the browser's list of tabs after it was removed, and closing
  failed trying to switch to it.

## [2.61.3] — 2026-09-26

### Fixed

- An essential dragged back into the list no longer leaves a duplicate row
  where it was dropped, showing when the tab is hovered and gone at the next
  click: Zen took the tile Zia draws during the drag for a real tab, and put
  it back in the list after the drop.

## [2.61.2] — 2026-09-26

### Fixed

- The music player's picture has rounded corners on Windows too, as on
  macOS, instead of showing square.
- Folders can be dragged into folders again, landing where the drag shows
  them (as deep as Zen allows); dragged anywhere else, a folder still never
  ends up inside one by accident.
- A folder dragged over a folder narrows to the width of the folders inside
  it, as a tab does.

## [2.61.1] — 2026-09-26

### Fixed

- A tucked picture-in-picture stays tucked when its video changes (the next
  track in a playlist), keeping its size and taking the new video's shape,
  instead of popping back out at Firefox's default size.
- A tab dragged below New Tab no longer shows twice (the tab stopped at the
  end of the list, its drag picture going on with the pointer): it follows
  the pointer the whole way.

## [2.61.0] — 2026-09-26

### Added

- A setting to hide compact mode's top toolbar while the sidebar is out, as
  before 2.60.0 (off by default).

## [2.60.0] — 2026-09-26

### Changed

- Compact mode: the top toolbar (address, back, forward, reload and the rest)
  stays up while the sidebar is out, instead of hiding. It's cut away only
  where the sidebar covers it, following it as it slides, so the address
  never shows through the sidebar.

## [2.59.6] — 2026-09-26

### Fixed

- A split dragged up into the essentials opens a space for its tile, a new
  row when the last one is full, as a tab does.

## [2.59.5] — 2026-09-26

### Fixed

- An essential dragged back into the tab list keeps its × (or −) on as it
  lands under the pointer, instead of it flashing in once the pointer moves.
- Dragged straight back up into the essentials, it no longer keeps that ×
  on its tile for a moment.
- An essential dragged down again straight after it was dropped no longer
  gets stuck at the top of the sidebar instead of following the pointer.
- An essential dragged into the list over its last tab (or the New Tab
  button) makes a whole tab's room above New Tab, not half.

## [2.59.4] — 2026-09-26

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
- A tab dropped into a folder (or pulled out of one) no longer flashes an
  × before its − (or the other way round): it swaps the moment it's let go.
- Dropping an essential no longer throws an error in the Browser Console
  (and skips the end of the drop's tidy-up).
- Dragging an essential again straight after dropping one now opens a gap
  for it among the others: the first drop's tidy-up was still running and
  kept undoing it.

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
