"""Zia's tests in the real Zen: each flow in flows/ runs in a fresh copy of a throwaway
profile, with Zia loaded from this working copy, and what it saw is compared with
baseline.json (what an unchanged Zia sees).

    tests/zen/run.sh                 every flow, compared with the baseline
    tests/zen/run.sh drag-within     only flows whose names contain "drag-within"
    tests/zen/run.sh --record        write what's seen as the new baseline
    tests/zen/run.sh --show          a visible window instead of a hidden one

The baseline holds exact pixels and timings, as Zia's motion is what it tests: after a Zen or
Sine update (start-up.js records both), check the differences and re-record.
"""

import difflib
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time

from marionette import Zen

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.expanduser("~/Library/Caches/zia-test")
TEMPLATE = os.path.join(ROOT, "template")
PROFILES = os.path.join(ROOT, "profiles")
BASELINE = os.path.join(HERE, "baseline.json")
LATEST = os.path.join(ROOT, "latest.json")
EVENT_UTILS = os.path.join(ROOT, "EventUtils.js")
# (pinned, and checked, so the helpers never change under the tests)
EVENT_UTILS_URL = "https://raw.githubusercontent.com/mozilla-firefox/firefox/8b0aa3525257ad862f6f6c88c1d48e8c774f96c7/testing/mochitest/tests/SimpleTest/EventUtils.js"
EVENT_UTILS_SHA256 = "66253e8b4c4af5f1d7c5d880d257fb25ebda642ef72de9c36b87eda54030274a"


def event_utils():
    # Firefox's test helpers, fetched once and kept
    if not os.path.exists(EVENT_UTILS):
        subprocess.run(["curl", "-fsSL", EVENT_UTILS_URL, "-o", EVENT_UTILS], check=True)
    data = open(EVENT_UTILS, "rb").read()
    if hashlib.sha256(data).hexdigest() != EVENT_UTILS_SHA256:
        os.remove(EVENT_UTILS)
        raise SystemExit("EventUtils.js didn't match its checksum; run again to fetch it afresh")
    return data.decode()


def run_flow(name, helpers, utils, headless):
    # (a profile of its own: one Zen still closing down never shares it with the next)
    profile = os.path.join(PROFILES, name)
    shutil.rmtree(profile, ignore_errors=True)
    shutil.copytree(TEMPLATE, profile, symlinks=True)
    body = open(os.path.join(HERE, "flows", name + ".js")).read()
    script = "\n".join([
        helpers,
        "(async () => {",
        "  try {",
        "    await ready();",
        body,
        "  } catch (e) {",
        "    done({ error: String(e), stack: String(e.stack).split('\\n').slice(0, 4) });",
        "  }",
        "})();",
    ])
    zen = Zen(profile, headless=headless)
    try:
        return zen.run(script, utils, timeout=90)
    finally:
        zen.quit()


def main(args):
    record = "--record" in args
    headless = "--show" not in args
    only = [a for a in args if not a.startswith("--")]
    subprocess.run([os.path.join(HERE, "make-profile.sh"), TEMPLATE], check=True, stdout=subprocess.DEVNULL)
    helpers = open(os.path.join(HERE, "helpers.js")).read()
    utils = event_utils()
    flows = sorted(f[:-3] for f in os.listdir(os.path.join(HERE, "flows")) if f.endswith(".js"))
    flows = [f for f in flows if not only or any(o in f for o in only)]
    baseline = json.load(open(BASELINE)) if os.path.exists(BASELINE) else {}
    results, failed = {}, []
    started = time.time()
    for name in flows:
        t = time.time()
        retried = False
        for attempt in range(3):
            try:
                seen = run_flow(name, helpers, utils, headless)
            except (OSError, RuntimeError, subprocess.SubprocessError) as err:  # Zen didn't start, or the flow timed out
                seen = {"error": str(err)}
            # (once in a while Zen's own session start fails in a fresh profile and nothing else
            # loads, before any of Zia's code runs: that start, and only that, is tried again in a
            # fresh profile, up to three starts in all)
            if attempt < 2 and isinstance(seen, dict) and "Zia didn't load" in str(seen.get("error", "")):
                retried = seen["error"]
                continue
            break
        results[name] = seen
        if not isinstance(seen, dict):
            seen = {"error": f"the flow ended with {seen!r}, not its result"}
        problems = []
        if "error" in seen:
            problems.append("error: " + json.dumps(seen["error"]))
        elif seen.get("ziaErrors"):
            problems.append("Zia logged errors: " + json.dumps(seen["ziaErrors"]))
        for check, ok in (seen.get("checks") or {}).items():
            if not ok:
                problems.append("check failed: " + check)
        if not record and name in baseline and baseline[name] != seen:
            want = json.dumps(baseline[name], indent=1, sort_keys=True).splitlines()
            got = json.dumps(seen, indent=1, sort_keys=True).splitlines()
            problems.append("differs from baseline:\n      " + "\n      ".join(difflib.unified_diff(want, got, "baseline", "now", lineterm="", n=1)))
        elif not record and name not in baseline:
            problems.append("no baseline yet (run with --record on an unchanged Zia)")
        # (only what an unchanged Zia sees, working, becomes the baseline)
        if record and problems:
            problems.append("not recorded")
        status = "FAIL" if problems else "pass"
        print(f"{status}  {name}  ({time.time() - t:.0f}s)" + ("  (Zia didn't load at the first start; tried again)" if retried else ""))
        if retried:
            print("      first start: " + retried)
        for problem in problems:
            print("      " + problem)
        if problems:
            failed.append(name)
    json.dump(results, open(LATEST, "w"), indent=1, sort_keys=True)
    if record:
        baseline.update({name: seen for name, seen in results.items() if name not in failed})
        json.dump(baseline, open(BASELINE, "w"), indent=1, sort_keys=True)
        print(f"Recorded {len(results)} flows in {os.path.relpath(BASELINE)}")
    shutil.rmtree(PROFILES, ignore_errors=True)
    print(f"{len(flows) - len(failed)}/{len(flows)} passed in {time.time() - started:.0f}s")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
