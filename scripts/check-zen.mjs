// Zen-update early warning: every Zen name Zia relies on (its gZen* objects and their members,
// zen-* attributes, ids, classes and elements, --zen-* variables) looked for in a Zen release's
// source, and every Firefox CSS variable it uses looked for in the Firefox that release is built
// on (Zen 1.24 came with Firefox 159, which renamed --urlbarView-* and --input-text-*). Given two
// releases, it lists what Zia uses that the older has and the newer doesn't: renamed or removed,
// so Zia follows before users hit it.
//
//   node scripts/check-zen.mjs 1.24b              what Zia uses that 1.24b doesn't have
//   node scripts/check-zen.mjs 1.23.4b 1.24b      what 1.24b dropped that Zia uses
//   node scripts/check-zen.mjs --zia=v2.112.6 1.23.4b 1.24b   the same for an older Zia
//
// Sources are fetched (Zen's with `gh`, Firefox's interface folders with a sparse git clone) and
// kept in ~/Library/Caches/zia-test/zen-src.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const CACHE = path.join(os.homedir(), "Library/Caches/zia-test/zen-src");
const SOURCE_FILES = /\.(m?js|css|inc|xhtml|html|ftl|patch|json|yaml)$/;
// (everything of Zia's that Zen or Firefox reads: the built script and styles, and the sheets
// and scripts loaded beside them)
const ZIA_FILES = ["zia.uc.js", "chrome.css", "zia-sidebar.css", "zia-pdf.css", "zia-pip.css", "zia-pip.js", "zia-screenshots.css"];
const FIREFOX_FOLDERS = ["browser/themes", "toolkit/themes", "toolkit/content/widgets", "browser/base/content", "browser/components/urlbar", "browser/components/tabbrowser"];

// The Zen names in Zia's built script and styles, each with where it's first used
function ziaNames(ref) {
  const names = new Map();
  const firefox = new Map();
  const note = (name, where) => names.has(name) || names.set(name, where);
  const scan = (file, patterns) => {
    let text = "";
    try {
      text = ref
        ? execFileSync("git", ["-C", ROOT, "show", `${ref}:${file}`], { encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] })
        : fs.readFileSync(path.join(ROOT, file), "utf8");
    } catch (err) {
      return; // (not in that release of Zia)
    }
    text.split("\n").forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) {
        return;
      }
      for (const pattern of patterns) {
        for (const match of line.matchAll(pattern)) {
          note(match[1], `${file}:${i + 1}`);
        }
      }
      // (Firefox's own variables: any custom property that isn't Zia's or Zen's)
      for (const match of line.matchAll(/(--(?!zia-|zen-)[a-zA-Z][\w-]*)/g)) {
        firefox.has(match[1]) || firefox.set(match[1], `${file}:${i + 1}`);
      }
    });
  };
  const names_ = [
    /\b(gZen[A-Za-z]+)\b/g,
    /\bgZen[A-Za-z]+\??\.(#?[A-Za-z_]\w*)/g,
    /(--zen-[\w-]+)/g,
    /(?<!zia\.[\w.-]*)[#.[](zen-[a-z0-9-]+)/g,
    /["'`](zen-[a-z0-9-]+)["'`]/g,
    /(?:^|[\s,(>+~])(zen-[a-z0-9-]+)(?=[\s,:.[#>+~{)])/g,
  ];
  for (const file of ZIA_FILES) {
    scan(file, names_);
  }
  return { zen: names, firefox };
}

function readTree(dir, parts) {
  const text = [];
  const walk = (folder) => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const full = path.join(folder, entry.name);
      if (entry.isDirectory() && entry.name !== ".git") {
        walk(full);
      } else if (entry.isFile() && SOURCE_FILES.test(entry.name)) {
        text.push(fs.readFileSync(full, "utf8"));
      }
    }
  };
  for (const part of parts) {
    if (fs.existsSync(path.join(dir, part))) {
      walk(path.join(dir, part));
    }
  }
  return text.join("\n");
}

// The Firefox a Zen release is built on (its surfer.json), its interface folders only
function firefoxOf(tag) {
  const version = JSON.parse(fs.readFileSync(path.join(CACHE, tag, "surfer.json"), "utf8")).version.version;
  const dir = path.join(CACHE, `firefox-${version}`);
  if (!fs.existsSync(dir)) {
    const branch = `FIREFOX_${version.replace(/\./g, "_")}_RELEASE`;
    execFileSync("git", ["clone", "-q", "--depth", "1", "--filter=blob:none", "--sparse", "--branch", branch, "https://github.com/mozilla-firefox/firefox", dir], { stdio: "ignore" });
    execFileSync("git", ["-C", dir, "sparse-checkout", "set", ...FIREFOX_FOLDERS], { stdio: "ignore" });
  }
  return readTree(dir, FIREFOX_FOLDERS);
}

function release(tag) {
  const dir = path.join(CACHE, tag);
  if (!fs.existsSync(path.join(dir, "src"))) {
    fs.mkdirSync(dir, { recursive: true });
    const tarball = path.join(CACHE, `${tag}.tar.gz`);
    fs.writeFileSync(tarball, execFileSync("gh", ["api", `repos/zen-browser/desktop/tarball/${tag}`], { maxBuffer: 1 << 30 }));
    execFileSync("tar", ["-xzf", tarball, "-C", dir, "--strip-components=1"]);
    fs.rmSync(tarball);
  }
  return readTree(dir, ["src", "prefs", "locales/en-US"]);
}

// (names kept on purpose for older releases, each with why: reported apart, never a failure;
// from the same Zia release as the names)
function keptList() {
  try {
    return ref
      ? execFileSync("git", ["-C", ROOT, "show", `${ref}:scripts/check-zen-kept.txt`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      : fs.readFileSync(path.join(ROOT, "scripts/check-zen-kept.txt"), "utf8");
  } catch (err) {
    return "";
  }
}
const ref = process.argv.find((arg) => arg.startsWith("--zia="))?.slice("--zia=".length);
const KEPT = new Map(
  keptList().split("\n")
    .filter((line) => line.trim() && !line.startsWith("#"))
    .map((line) => [line.split(/\s+/)[0], line.trim().slice(line.split(/\s+/)[0].length).trim()])
);

const escape = (name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const has = (source, name) => new RegExp(`(^|[^\\w-])${escape(name)}($|[^\\w-])`).test(source);

const tags = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
if (!tags.length || tags.length > 2) {
  console.error("Usage: node scripts/check-zen.mjs [older-release] <release>");
  process.exit(2);
}
const names = ziaNames(ref);
let found = 0;
const report = (kind, used, sources) => {
  const newer = sources.at(-1);
  const missing = [...used].filter(([name]) => !has(newer, name) && (sources.length === 1 || has(sources[0], name)));
  const dropped = missing.filter(([name]) => !KEPT.has(name));
  for (const [name, where] of dropped) {
    console.log(`${kind.padEnd(8)} ${name.padEnd(48)} ${where}`);
  }
  for (const [name] of missing.filter(([name]) => KEPT.has(name))) {
    console.log(`kept     ${name.padEnd(48)} ${KEPT.get(name)}`);
  }
  const what = tags.length === 1 ? `not in ${tags[0]}` : `in ${tags[0]} but not ${tags[1]}`;
  console.log(`${dropped.length} of the ${used.size} ${kind} names Zia uses are ${what}.`);
  found += dropped.length;
};
const zen = tags.map(release);
report("Zen", names.zen, zen);
// (one release alone: a Firefox variable that isn't there may be one Zia defines itself, so
// only a comparison of two says something was dropped)
if (tags.length === 2) {
  report("Firefox", names.firefox, tags.map(firefoxOf));
}
process.exit(found ? 1 : 0);
