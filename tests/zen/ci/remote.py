#!/usr/bin/env python3
"""Runs Zia's real-Zen flows on one of GitHub's Macs, so no Zen is needed on this Mac.

    tests/zen/ci/remote.py <checkout> [--show] [--record] <flow…>

<checkout> is the Zia to test, as it is now, saved or not (a release worktree, or ~/Sites/zia).
The harness and these scripts are taken from the cleanup branch as committed. ZIA_PREFS, ZIA_OFF
and ZEN_TAG (a Zen release, the latest by default) are passed on from the environment.

A commit is made without touching any working copy (its own index), pushed as zen-test/<name>,
and the "Zen tests" workflow (ci/zen-tests.yml) runs it. The results land in
~/Library/Caches/zia-test/ci/<name>/ (run.txt, latest-*.json, captures/) and the branch is
deleted. Exits 1 if the run itself failed.
"""

import os
import shlex
import subprocess
import sys
import tempfile
import time

REPO = os.path.expanduser("~/Sites/zia")
HARNESS_REF = "cleanup"
OUT = os.path.expanduser("~/Library/Caches/zia-test/ci")
PASSED_ON = ("ZIA_PREFS", "ZIA_OFF", "ZIA_ATG", "ZIA_FLOW_TIMEOUT", "ZEN_TAG")


def git(*args, cwd=REPO, env=None, input=None):
    return subprocess.run(["git", *args], cwd=cwd, env=env, input=input, check=True,
                          capture_output=True, text=True).stdout.strip()


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    checkout = os.path.abspath(os.path.expanduser(sys.argv[1]))
    args = [a for a in sys.argv[2:] if a.startswith("--")]
    flows = [a for a in sys.argv[2:] if not a.startswith("--")]
    name = time.strftime("%Y%m%d-%H%M%S") + "-" + (flows[0] if flows else "all")[:30]
    branch = f"zen-test/{name}"

    index = tempfile.NamedTemporaryFile(delete=False).name
    env = dict(os.environ, GIT_INDEX_FILE=index)
    try:
        # the checkout as it is now, saved or not, without its own copy of the harness
        git("read-tree", "HEAD", cwd=checkout, env=env)
        git("add", "-A", ".", cwd=checkout, env=env)
        git("rm", "-r", "-q", "--cached", "--ignore-unmatch", "tests/zen", ".zen-test",
            ".github/workflows/zen-tests.yml", cwd=checkout, env=env)
        git("read-tree", f"--prefix=tests/zen/", f"{HARNESS_REF}:tests/zen", cwd=checkout, env=env)
        workflow = git("rev-parse", f"{HARNESS_REF}:tests/zen/ci/zen-tests.yml")
        settings = [f"FLOWS={shlex.quote(' '.join(flows))}", f"ARGS={shlex.quote(' '.join(args))}"]
        settings += [f"{key}={shlex.quote(os.environ[key])}" for key in PASSED_ON if os.environ.get(key)]
        config = git("hash-object", "-w", "--stdin", input="\n".join(settings) + "\n")
        for blob, path in ((workflow, ".github/workflows/zen-tests.yml"), (config, ".zen-test")):
            git("update-index", "--add", "--cacheinfo", f"100644,{blob},{path}", cwd=checkout, env=env)
        tree = git("write-tree", cwd=checkout, env=env)
        commit = git("commit-tree", tree, "-p", git("rev-parse", "HEAD", cwd=checkout),
                     "-m", f"Zen test: {' '.join(flows) or 'all flows'}", cwd=checkout)
    finally:
        os.remove(index)

    git("push", "-q", "origin", f"{commit}:refs/heads/{branch}")
    print(f"pushed {branch}", flush=True)
    try:
        run_id = None
        for _ in range(60):
            run_id = subprocess.run(
                ["gh", "run", "list", "--branch", branch, "--workflow", "Zen tests", "--limit", "1",
                 "--json", "databaseId", "-q", ".[0].databaseId"],
                cwd=REPO, capture_output=True, text=True).stdout.strip()
            if run_id:
                break
            time.sleep(5)
        if not run_id:
            sys.exit("the Zen tests run never started")
        print(f"run {run_id}: https://github.com/z1n-k/zia/actions/runs/{run_id}", flush=True)
        watched = subprocess.run(["gh", "run", "watch", run_id, "--interval", "20", "--exit-status"],
                                 cwd=REPO, capture_output=True, text=True)
        dest = os.path.join(OUT, name)
        os.makedirs(dest, exist_ok=True)
        subprocess.run(["gh", "run", "download", run_id, "-n", "zen-test", "-D", dest], cwd=REPO)
        report = os.path.join(dest, "run.txt")
        if os.path.exists(report):
            print(open(report).read())
        else:
            print(subprocess.run(["gh", "run", "view", run_id, "--log-failed"], cwd=REPO,
                                 capture_output=True, text=True).stdout[-6000:])
        print(f"results: {dest}")
        sys.exit(0 if watched.returncode == 0 else 1)
    finally:
        subprocess.run(["git", "push", "-q", "origin", "--delete", branch], cwd=REPO,
                       capture_output=True)


if __name__ == "__main__":
    main()
