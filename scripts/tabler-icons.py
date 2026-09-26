#!/usr/bin/env python3
"""Rebuilds Zia's Tabler icons from the @tabler/icons npm package.

    curl -sSL https://registry.npmjs.org/@tabler/icons/-/icons-<version>.tgz | tar xz
    scripts/tabler-icons.py package

Writes icons/tabler.zip ({outline,filled}/*.svg, recoloured with
context-fill so Zen can tint them, and the LICENSE), icons/tabler-pack.js
(the zip's version), icons/tabler-names.js (the picker's search index: each
icon's name, tags and category) and icons/ui/*.svg, the few icons Zia's own
buttons use.

The icons ship as one zip because Sine unpacks a mod file by file: several
thousand of them froze Zen for half a minute on some computers. Zia copies
the zip into the profile and reads icons straight out of it
(resource://zia-tabler/, zia.uc.js).
"""
import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "icons"
# Icons Zia's own buttons use, kept as loose files so they show from the start
UI_ICONS = ["pin", "pinned-off", "layout-columns", "paperclip", "check", "plus", "minus", "x", "volume", "volume-off"]


def clean(svg, style):
    svg = re.sub(r"\s+", " ", svg).strip()
    svg = svg.replace("> <", "><")
    # Tabler's invisible 24x24 box
    svg = re.sub(r'<path stroke="none" d="M0 0h24v24H0z" fill="none" ?/>', "", svg)
    svg = re.sub(r' (width|height|class)="[^"]*"', "", svg)
    svg = svg.replace("currentColor", "context-fill")
    if style == "outline":
        svg = svg.replace('stroke="context-fill"', 'stroke="context-fill" stroke-opacity="context-fill-opacity"', 1)
    else:
        svg = svg.replace('fill="context-fill"', 'fill="context-fill" fill-opacity="context-fill-opacity"', 1)
    return svg.replace(" />", "/>").replace(" >", ">")


def main(package):
    package = Path(package)
    meta = json.loads((package / "icons.json").read_text())
    names = {}
    files = {}
    for style in ("outline", "filled"):
        for src in sorted((package / "icons" / style).glob("*.svg")):
            files[f"{style}/{src.name}"] = clean(src.read_text(), style).encode()
            names.setdefault(src.stem, set()).add(style)
    files["LICENSE"] = (package / "LICENSE").read_bytes()
    (ICONS / "tabler-LICENSE").write_bytes(files["LICENSE"])

    # the same bytes every time for the same icons, so the version only
    # changes when they do
    pack = ICONS / "tabler.zip"
    with zipfile.ZipFile(pack, "w") as z:
        for name in sorted(files):
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            z.writestr(info, files[name], compresslevel=9)
    version = hashlib.sha256(pack.read_bytes()).hexdigest()[:12]
    (ICONS / "tabler-pack.js").write_text(
        "// The Tabler icon pack's version (a hash of icons/tabler.zip). Made by scripts/tabler-icons.py\n"
        f'this.ZiaTablerPack = "{version}";\n'
    )

    (ICONS / "ui").mkdir(exist_ok=True)
    for name in UI_ICONS:
        (ICONS / "ui" / f"{name}.svg").write_bytes(files[f"outline/{name}.svg"])

    rows = []
    for name in sorted(names):
        info = meta.get(name, {})
        words = [str(tag).lower() for tag in info.get("tags", [])]
        if info.get("category"):
            words.append(info["category"].lower())
        words = [w for w in dict.fromkeys(words) if w and w not in name.split("-")]
        flags = ("o" if "outline" in names[name] else "") + ("f" if "filled" in names[name] else "")
        rows.append(f"{name}|{flags}|{' '.join(words)}")
    version = json.loads((package / "package.json").read_text())["version"]
    (ICONS / "tabler-names.js").write_text(
        f"// Tabler Icons {version}: name|styles (o outline, f filled)|search words. Made by scripts/tabler-icons.py\n"
        f"this.ZiaTablerIcons = {json.dumps(rows, separators=(',', ':'))};\n"
    )
    print(f"{sum(1 for r in rows if 'o' in r.split('|')[1])} outline, "
          f"{sum(1 for r in rows if 'f' in r.split('|')[1])} filled")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "package")
