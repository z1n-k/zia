#!/usr/bin/env python3
"""Builds Zia's stand-ins for Zen's icons, from Zen's own icon rules.

    scripts/zen-icons.py <zen>/src/browser/themes/shared/zen-icons/icons.css

Zen draws its icons from chrome://browser/skin/zen-icons/, placed by
icons.css. This keeps every rule there that sets one of those icons (its
selectors and any @media or nesting around it, and nothing else), points
each at the Tabler icon scripts/zen-icons-map.json names for it ("f:" for
the filled style), and writes them to src/css/00b-zen-icons.css, all of it
off with "Zen's own icons" (zia.icons.zen-look). The Tabler icons used are
written to icons/zen/, as Zen tints its own: with context-fill. An icon the
map leaves out (the Library's) stays Zen's.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_CSS = ROOT / "src" / "css" / "00b-zen-icons.css"
OUT_DIR = ROOT / "icons" / "zen"
URL_ROOT = "chrome://sine/content/zia/icons/zen/"


def bundle():
    text = (ROOT / "icons" / "tabler-bundle.js").read_text()
    data = json.loads(text[text.index("{"):text.rindex("}") + 1])
    return data["head"], data["icons"]


def strip_comments(css):
    return re.sub(r"/\*.*?\*/", "", css, flags=re.S)


def parse(css, i=0):
    """Returns (items, i): items are ("decl", text) or ("block", prelude, items)."""
    items, buf = [], ""
    while i < len(css):
        ch = css[i]
        if ch in "\"'":
            end = css.index(ch, i + 1)
            buf += css[i:end + 1]
            i = end + 1
            continue
        if ch == "{":
            inner, i = parse(css, i + 1)
            items.append(("block", buf.strip(), inner))
            buf = ""
            continue
        if ch == "}":
            if buf.strip():
                items.append(("decl", buf.strip()))
            return items, i + 1
        if ch == ";":
            if buf.strip():
                items.append(("decl", buf.strip()))
            buf = ""
            i += 1
            continue
        buf += ch
        i += 1
    return items, i


URL = re.compile(r'url\("([^":]+\.svg)"\)')
# parts left as Zen draws them: the boost editor and the theme (colour)
# picker, which stay Zen's
LEAVE = re.compile(r"zen-boost|gradient-generator|theme-picker|zap")


def split_selectors(prelude):
    """The selectors in a list, split at its top-level commas only."""
    parts, depth, cur = [], 0, ""
    for ch in prelude:
        if ch in "([":
            depth += 1
        elif ch in ")]":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append(cur.strip())
            cur = ""
        else:
            cur += ch
    parts.append(cur.strip())
    return [p for p in parts if p]


def keep(items, mapping, used):
    out = []
    for item in items:
        if item[0] == "decl":
            decl = item[1]
            names = URL.findall(decl)
            if not names or any(n[:-4] not in mapping for n in names):
                continue
            for n in names:
                target = mapping[n[:-4]]
                style, name = ("filled", target[2:]) if target.startswith("f:") else ("outline", target)
                file = f"{name}{'-filled' if style == 'filled' else ''}.svg"
                used[file] = (style, name)
                decl = decl.replace(f'url("{n}")', f'url("{URL_ROOT}{file}")')
            if "!important" not in decl:
                decl += " !important"
            out.append(("decl", decl))
        else:
            prelude = item[1]
            if not prelude.startswith("@"):
                selectors = [p for p in split_selectors(prelude) if not LEAVE.search(p)]
                if not selectors:
                    continue
                prelude = ", ".join(selectors)
            inner = keep(item[2], mapping, used)
            if inner:
                out.append(("block", prelude, inner))
    return out


def render(items, depth):
    pad = "  " * depth
    lines = []
    for item in items:
        if item[0] == "decl":
            lines.append(f"{pad}{item[1]};")
        else:
            prelude = item[1] if item[1].startswith("@") else f",\n{pad}".join(split_selectors(item[1]))
            lines.append(f"{pad}{prelude} {{")
            lines.extend(render(item[2], depth + 1))
            lines.append(f"{pad}}}")
            if depth == 1:
                lines.append("")
    return lines


def main(icons_css):
    mapping = json.loads((ROOT / "scripts" / "zen-icons-map.json").read_text())
    head, icons = bundle()
    tree, _ = parse(strip_comments(Path(icons_css).read_text()))
    used = {}
    kept = keep(tree, mapping, used)
    body = render(kept, 1)
    css = [
        "/* Zia's icons for Zen's own, everywhere one shows while browsing (the",
        "   toolbar, Customize Toolbar, the site panel and its settings, menus,",
        "   the sidebar): Tabler's, as Zia's picker and buttons use, each picked",
        "   to match the shape of Zen's. Made from Zen's icons.css by",
        "   scripts/zen-icons.py; Zia's own buttons' icons, later, win over these.",
        "   All of it off with \"Zen's own icons\" (zia.icons.zen-look). */",
        "@media not -moz-pref(\"zia.icons.zen-look\") {",
        *[line.rstrip() for line in body],
        "}",
        "",
    ]
    OUT_CSS.write_text(re.sub(r"\n{3,}", "\n\n", "\n".join(css)))
    OUT_DIR.mkdir(exist_ok=True)
    for old in OUT_DIR.glob("*.svg"):
        if old.name not in used:
            old.unlink()
    for file, (style, name) in sorted(used.items()):
        (OUT_DIR / file).write_text(f"{head[style]}{icons[style][name]}</svg>\n")
    print(f"{len(used)} icons, {OUT_CSS.relative_to(ROOT)}")


if __name__ == "__main__":
    main(sys.argv[1])
