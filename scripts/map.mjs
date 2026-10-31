// docs/MAP.md, made from the code: every part of zia.uc.js and chrome.css with what its first
// comment says it owns, what other parts use from it, the Zen and Firefox methods it replaces
// (patchMethod, patchDefined) and the settings it reads. Run it after changing src/; CI runs it
// with --check and fails if the map is out of date.
//
//   node scripts/map.mjs            write docs/MAP.md
//   node scripts/map.mjs --check    fail if docs/MAP.md isn't what the code says
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = path.join(ROOT, "docs", "MAP.md");

// the first comment block, as plain text (its "Used elsewhere" part taken apart)
function header(source) {
  const lines = [];
  // (00-core.js opens the build with a line saying it's built: its own comment comes next)
  for (const line of source.split("\n").filter((l) => !l.startsWith("// Zia: built from src/js"))) {
    const text = line.trim();
    if (!text && !lines.length) {
      continue;
    }
    if (text.startsWith("//")) {
      lines.push(text.replace(/^\/\/\s?/, ""));
    } else if (text.startsWith("/*") || (lines.length && lines.at(-1) !== null && /^\*/.test(text))) {
      lines.push(text.replace(/^\/\*+\s?|\s?\*+\/$|^\*\s?/g, ""));
      if (text.endsWith("*/")) {
        break;
      }
    } else {
      break;
    }
  }
  const joined = lines.join(" ").replace(/\s+/g, " ").trim();
  const at = joined.search(/Used elsewhere:/);
  return {
    owns: (at < 0 ? joined : joined.slice(0, at)).trim(),
    used: at < 0 ? "" : joined.slice(at + "Used elsewhere:".length).trim().replace(/\.$/, ""),
  };
}

const unique = (list) => [...new Set(list)].sort();

function jsPart(file) {
  const source = fs.readFileSync(path.join(ROOT, "src/js", file), "utf8");
  const { owns, used } = header(source);
  const patches = unique([...source.matchAll(/patch(?:Method|Defined)\(\s*([\w.$?]+)\s*,\s*"([\w$]+)"/g)].map((m) => `${m[1]}.${m[2]}`));
  const prefs = unique([...source.matchAll(/"((?:zia|zen|browser|sine|ui|layout|extensions)\.[a-z0-9.-]+[a-z0-9])"/g)].map((m) => m[1]));
  return { file, owns, used, patches, prefs };
}

function cssPart(file) {
  return { file, ...header(fs.readFileSync(path.join(ROOT, "src/css", file), "utf8")) };
}

const cell = (text) => (text || "—").replace(/\|/g, "\\|");

function render() {
  const js = fs.readdirSync(path.join(ROOT, "src/js")).filter((f) => f.endsWith(".js")).sort().map(jsPart);
  const css = fs.readdirSync(path.join(ROOT, "src/css")).filter((f) => f.endsWith(".css")).sort().map(cssPart);
  const out = [
    "# Zia's code, part by part",
    "",
    "Made by `node scripts/map.mjs` from the code itself (each part's first comment, its",
    "`patchMethod` calls and the settings it names); don't edit it by hand. `scripts/build.sh`",
    "joins the parts in this order into `zia.uc.js` and `chrome.css`.",
    "",
    `## Script (${js.length} parts, src/js)`,
    "",
    "| Part | What it owns | Used elsewhere | Replaces | Settings |",
    "|------|--------------|----------------|----------|----------|",
    ...js.map((p) => `| \`${p.file}\` | ${cell(p.owns)} | ${cell(p.used)} | ${cell(p.patches.join(", "))} | ${cell(p.prefs.join(", "))} |`),
    "",
    `## Styles (${css.length} parts, src/css)`,
    "",
    "| Part | What it styles |",
    "|------|----------------|",
    ...css.map((p) => `| \`${p.file}\` | ${cell(p.owns)} |`),
    "",
  ];
  return out.join("\n");
}

const text = render();
if (process.argv.includes("--check")) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
  if (current !== text) {
    console.error("docs/MAP.md is out of date: run node scripts/map.mjs");
    process.exit(1);
  }
} else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, text);
  console.log(`Wrote ${path.relative(ROOT, OUT)}`);
}
