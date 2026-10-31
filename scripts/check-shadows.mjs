// Moving a closure's code out to the top level can change what a name means without any
// error: the name used to reach a local of the same name, and now reaches the top-level one
// (Zia's `root`, say). This lists every such risk between two versions of zia.uc.js: names
// that are both top-level and local in the old version, and each place in the new version
// where one of them reaches the top level from a function that didn't declare it there before.
//
//   node scripts/check-shadows.mjs <old zia.uc.js> <new zia.uc.js>
import fs from "node:fs";
import * as espree from "espree";
import * as eslintScope from "eslint-scope";

function analyse(file) {
  const ast = espree.parse(fs.readFileSync(file, "utf8"), { ecmaVersion: "latest", range: true, loc: true });
  const scopes = eslintScope.analyze(ast, { ecmaVersion: 2024 });
  // the IIFE's scope: the one every src/js part shares
  const top = scopes.scopes.find((scope) => scope.type === "function" && scope.upper?.type === "global");
  const topNames = new Set(top.variables.map((variable) => variable.name));
  const localNames = new Set();
  for (const scope of scopes.scopes) {
    if (scope !== top && scope.type !== "global") {
      for (const variable of scope.variables) {
        if (topNames.has(variable.name) && variable.defs.length) {
          localNames.add(variable.name);
        }
      }
    }
  }
  // each reference to a top-level name, with the outermost function it sits in
  const reaches = [];
  for (const scope of scopes.scopes) {
    for (const ref of scope.references) {
      if (ref.resolved?.scope === top) {
        let owner = scope;
        while (owner.upper && owner.upper !== top) {
          owner = owner.upper;
        }
        const name = owner.block.id?.name || owner.block.parent?.id?.name || "(anonymous)";
        reaches.push({ name: ref.identifier.name, fn: name, line: ref.identifier.loc.start.line });
      }
    }
  }
  return { topNames, localNames, reaches };
}

const [oldFile, newFile] = process.argv.slice(2);
const before = analyse(oldFile);
const after = analyse(newFile);
const risky = before.localNames;
const reachedBefore = new Set(before.reaches.filter((r) => risky.has(r.name)).map((r) => `${r.fn}:${r.name}`));
const suspects = after.reaches.filter((r) => risky.has(r.name) && !reachedBefore.has(`${r.fn}:${r.name}`));
for (const r of suspects) {
  console.log(`${newFile}:${r.line}  ${r.fn} reaches top-level "${r.name}" (also a local name before)`);
}
console.log(`${risky.size} names are both top-level and local; ${suspects.length} new top-level reaches to check by hand`);
