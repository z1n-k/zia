"""Zia's tests in the real Zen: each flow in flows/ runs in a fresh copy of a throwaway
profile, with Zia loaded from this working copy, and what it saw is compared with
baseline/<flow>.json (what an unchanged Zia sees).

    tests/zen/run.sh                 every flow, compared with the baseline
    tests/zen/run.sh drag-within     only flows whose names contain "drag-within"
    tests/zen/run.sh --record        write what's seen as the new baseline
    tests/zen/run.sh --show          a visible window instead of a hidden one
    tests/zen/run.sh --jobs=1        one Zen at a time (three by default)

The baseline holds exact pixels and timings, as Zia's motion is what it tests: after a Zen or
Sine update (start-up.js records both), check the differences and re-record.
"""

import concurrent.futures
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
# (each run in a folder of its own, so two runs, say from two checkouts, never meet)
RUN = os.path.join(ROOT, "runs", str(os.getpid()))
TEMPLATE = os.path.join(RUN, "template")
PROFILES = os.path.join(RUN, "profiles")
BASELINE = os.path.join(HERE, "baseline")  # one file per flow, beside its flows/<flow>.js
# (what this checkout's last run saw: each checkout keeps its own)
LATEST = os.path.join(ROOT, "latest-" + hashlib.sha1(HERE.encode()).hexdigest()[:8] + ".json")
JOBS = 3
EVENT_UTILS = os.path.join(ROOT, "EventUtils.js")
# (pinned, and checked, so the helpers never change under the tests)
EVENT_UTILS_URL = "https://raw.githubusercontent.com/mozilla-firefox/firefox/8b0aa3525257ad862f6f6c88c1d48e8c774f96c7/testing/mochitest/tests/SimpleTest/EventUtils.js"
EVENT_UTILS_SHA256 = "66253e8b4c4af5f1d7c5d880d257fb25ebda642ef72de9c36b87eda54030274a"


def warm_template(headless):
    # A cold profile compiles Sine's modules on start, and on a busy Mac the window can open
    # before Sine is listening for it, so Zia never loads. One start of a copy fills a start-up
    # cache, and only that cache (and the build stamp it's valid for) goes into the template.
    warm = os.path.join(RUN, "warm")
    shutil.copytree(TEMPLATE, warm, symlinks=True)
    zen = Zen(warm, headless=headless)
    try:
        zen.run("const done = arguments[arguments.length - 1]; "
                "(async () => { for (let i = 0; i < 120 && !window.__ziaLoaded; i++) "
                "await new Promise((r) => setTimeout(r, 250)); done(!!window.__ziaLoaded); })();")
    finally:
        zen.quit()
    for name in ("startupCache", "compatibility.ini"):
        source = os.path.join(warm, name)
        if os.path.isdir(source):
            shutil.copytree(source, os.path.join(TEMPLATE, name))
        elif os.path.exists(source):
            shutil.copy(source, TEMPLATE)
    shutil.rmtree(warm, ignore_errors=True)


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


def attempt_flow(name, helpers, utils, headless):
    """Runs one flow; returns what it saw and, if Zia didn't load at the first start, why."""
    retried = None
    for attempt in range(3):
        try:
            seen = run_flow(name, helpers, utils, headless)
        except (OSError, RuntimeError, subprocess.SubprocessError) as err:  # Zen didn't start, or the flow timed out
            seen = {"error": str(err)}
        # (a start where Sine never loaded, before any of Zia's code runs, and only that, is tried
        # again in a fresh profile, up to three starts in all; the warmed template makes it rare)
        if attempt < 2 and isinstance(seen, dict) and "Zia didn't load" in str(seen.get("error", "")):
            retried = seen["error"]
            continue
        break
    if not isinstance(seen, dict):
        seen = {"error": f"the flow ended with {seen!r}, not its result"}
    return seen, retried


def problems_with(name, seen, baseline, record):
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
    return problems


def main(args):
    record = "--record" in args
    headless = "--show" not in args
    jobs = next((int(a.split("=")[1]) for a in args if a.startswith("--jobs=")), JOBS)
    only = [a for a in args if not a.startswith("--")]
    subprocess.run([os.path.join(HERE, "make-profile.sh"), TEMPLATE], check=True, stdout=subprocess.DEVNULL)
    warm_template(headless)
    helpers = open(os.path.join(HERE, "helpers.js")).read()
    utils = event_utils()
    flows = sorted(f[:-3] for f in os.listdir(os.path.join(HERE, "flows")) if f.endswith(".js"))
    flows = [f for f in flows if not only or any(o in f for o in only)]
    baseline = {f[:-5]: json.load(open(os.path.join(BASELINE, f))) for f in os.listdir(BASELINE) if f.endswith(".json")}
    results, failed = {}, []
    started = time.time()

    def run(name):
        t = time.time()
        seen, retried = attempt_flow(name, helpers, utils, headless)
        return name, seen, retried, time.time() - t

    # (a few Zens at once, each with its own profile and port)
    with concurrent.futures.ThreadPoolExecutor(max_workers=jobs) as pool:
        for name, seen, retried, seconds in pool.map(run, flows):
            results[name] = seen
            problems = problems_with(name, seen, baseline, record)
            print(f"{'FAIL' if problems else 'pass'}  {name}  ({seconds:.0f}s)" + ("  (Zia didn't load at the first start; tried again)" if retried else ""), flush=True)
            if retried:
                print("      first start: " + retried)
            for problem in problems:
                print("      " + problem)
            if problems:
                failed.append(name)
    json.dump(results, open(LATEST, "w"), indent=1, sort_keys=True)
    if record:
        kept = {name: seen for name, seen in results.items() if name not in failed}
        for name, seen in kept.items():
            with open(os.path.join(BASELINE, name + ".json"), "w") as out:
                json.dump(seen, out, indent=1, sort_keys=True)
                out.write("\n")
        print(f"Recorded {len(kept)} flows in {os.path.relpath(BASELINE)}/")
    shutil.rmtree(RUN, ignore_errors=True)
    print(f"{len(flows) - len(failed)}/{len(flows)} passed in {time.time() - started:.0f}s")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
