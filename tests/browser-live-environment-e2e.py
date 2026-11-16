"""Explicit B1 smoke test against the published production and development Pages."""
import hashlib
import json
import os
import platform
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright


ENVIRONMENTS = (
    {
        "name": "production",
        "pages_url": "https://ak-sekine.github.io/heibon-mahjong/",
        "worker_url": "https://heibon-mahjong-online.ak-sekine.workers.dev",
        "title": "Heibon Mahjong",
        "release_path": "site/release.json",
    },
    {
        "name": "development",
        "pages_url": "https://ak-sekine.github.io/heibon-mahjong/dev/",
        "worker_url": "https://heibon-mahjong-online-dev.ak-sekine.workers.dev",
        "title": "Heibon Mahjong DEV",
        "release_path": "site/dev/release.json",
    },
)
RESOURCE_TYPES = {"document", "script", "stylesheet", "image", "font"}


class LiveE2EFailure(RuntimeError):
    pass


def require(condition, code):
    if not condition:
        raise LiveE2EFailure(code)


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def write_report(report):
    path = Path(os.environ["LIVE_E2E_REPORT"])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main():
    browser_name = os.environ.get("HEIBON_BROWSER", "chromium")
    require(browser_name in {"chromium", "webkit"}, "unsupported-browser")
    snapshot_root = Path(os.environ["SNAPSHOT_ROOT"])
    report = {
        "schemaVersion": 1,
        "phase": "B1",
        "outcome": "NOT_STARTED",
        "runId": os.environ.get("GITHUB_RUN_ID"),
        "attempt": os.environ.get("GITHUB_RUN_ATTEMPT"),
        "sourceSha": os.environ.get("GITHUB_SHA"),
        "snapshotSha": os.environ.get("SNAPSHOT_SHA"),
        "browser": browser_name,
        "python": platform.python_version(),
        "environments": [],
    }
    stage = "snapshot-metadata"

    try:
        state_path = snapshot_root / "state.json"
        state = json.loads(state_path.read_text(encoding="utf-8"))
        require(state.get("pending", "missing") is None, "snapshot-pending-not-null")
        current = state.get("current", {})
        snapshot_site = snapshot_root / "site"

        with sync_playwright() as playwright:
            browser = getattr(playwright, browser_name).launch()
            report["browserVersion"] = browser.version
            try:
                request = playwright.request.new_context(timeout=20_000)
                try:
                    snapshot_environments_path = snapshot_site / "environments.json"
                    snapshot_environments_bytes = snapshot_environments_path.read_bytes()
                    response = request.get(ENVIRONMENTS[0]["pages_url"] + "environments.json")
                    require(response.status == 200, "public-environments-json-status")
                    require(response.url == ENVIRONMENTS[0]["pages_url"] + "environments.json", "public-environments-json-redirect")
                    public_environments_bytes = response.body()
                    require(
                        sha256(public_environments_bytes) == sha256(snapshot_environments_bytes),
                        "public-environments-json-hash-mismatch",
                    )
                    public_environments = json.loads(public_environments_bytes)
                    require(public_environments == current, "public-environments-json-state-mismatch")

                    expected_releases = {}
                    for environment in ENVIRONMENTS:
                        key = environment["name"]
                        state_release = current.get(key)
                        release_path = snapshot_site / environment["release_path"].removeprefix("site/")
                        release_bytes = release_path.read_bytes()
                        release = json.loads(release_bytes)
                        require(state_release is not None, f"snapshot-release-missing-{key}")
                        require(release.get("environment") == key, f"snapshot-release-environment-{key}")
                        require(release.get("workerUrl") == environment["worker_url"], f"snapshot-worker-url-{key}")
                        require(release.get("workerUrl") == state_release.get("workerUrl"), f"snapshot-state-worker-url-{key}")
                        require(release.get("sha") == state_release.get("sha"), f"snapshot-source-sha-{key}")
                        require(release.get("digest") == state_release.get("digest"), f"snapshot-release-digest-{key}")
                        expected_releases[key] = (release, release_bytes)

                        live_release_response = request.get(environment["pages_url"] + "release.json")
                        require(live_release_response.status == 200, f"public-release-status-{key}")
                        require(live_release_response.url == environment["pages_url"] + "release.json", f"public-release-redirect-{key}")
                        require(
                            sha256(live_release_response.body()) == sha256(release_bytes),
                            f"public-release-hash-mismatch-{key}",
                        )

                    request.dispose()
                except Exception:
                    request.dispose()
                    raise

                for environment in ENVIRONMENTS:
                    key = environment["name"]
                    stage = f"page-load-{key}"
                    page_report = {
                        "environment": key,
                        "pagesUrl": environment["pages_url"],
                        "configuredWorkerUrl": environment["worker_url"],
                        "releaseSha": expected_releases[key][0]["sha"],
                        "releaseDigest": expected_releases[key][0]["digest"],
                        "entryStatus": None,
                        "title": None,
                        "criticalResourceFailures": [],
                        "blockedExternalHosts": [],
                        "consoleErrorCount": 0,
                        "pageErrorCount": 0,
                        "cpuGameStarted": False,
                        "discardCount": 0,
                    }
                    context = browser.new_context(
                        viewport={"width": 1280, "height": 900},
                        service_workers="allow",
                    )
                    page = context.new_page()
                    console_errors = []
                    page_errors = []

                    def on_response(response):
                        request_info = response.request
                        if request_info.resource_type in RESOURCE_TYPES and response.status >= 400:
                            if not response.url.endswith("/favicon.ico"):
                                page_report["criticalResourceFailures"].append(
                                    {"resourceType": request_info.resource_type, "status": response.status}
                                )

                    page.on("response", on_response)
                    page.on("console", lambda message: console_errors.append(1) if message.type == "error" else None)
                    page.on("pageerror", lambda error: page_errors.append(type(error).__name__))

                    allowed_hosts = {
                        urlsplit(environment["pages_url"]).hostname,
                        urlsplit(environment["worker_url"]).hostname,
                    }

                    def restrict_hosts(route):
                        parsed = urlsplit(route.request.url)
                        if parsed.scheme not in {"https", "wss"} or parsed.hostname not in allowed_hosts:
                            page_report["blockedExternalHosts"].append(parsed.hostname or "invalid-url")
                            route.abort("blockedbyclient")
                            return
                        route.continue_()

                    page.route("**/*", restrict_hosts)

                    response = page.goto(environment["pages_url"], wait_until="networkidle", timeout=30_000)
                    require(response is not None, f"entry-response-missing-{key}")
                    page_report["entryStatus"] = response.status
                    page_report["title"] = page.title()
                    require(response.status == 200, f"entry-status-{key}")
                    require(page.url == environment["pages_url"], f"entry-url-redirect-{key}")
                    require(page_report["title"] == environment["title"], f"page-title-{key}")
                    page.locator("#app-idle").wait_for(state="visible", timeout=15_000)
                    require(page.locator("#main-menu-toggle").is_visible(), f"main-menu-missing-{key}")
                    require(not page_report["criticalResourceFailures"], f"critical-resource-failure-{key}")

                    stage = f"cpu-start-{key}"
                    page.locator("#main-menu-toggle").click()
                    page.locator("#new-game").click()
                    require(page.locator("#new-game-dialog").evaluate("dialog => dialog.open"), f"new-game-dialog-not-open-{key}")
                    page.locator("#confirm-new-game").click()
                    page.locator("#local-table").wait_for(state="visible", timeout=15_000)
                    page.wait_for_function(
                        "document.body.dataset.gameMode === 'offline' && document.querySelectorAll('#player-hand button:enabled').length >= 13",
                        timeout=20_000,
                    )
                    page_report["cpuGameStarted"] = True
                    river = page.locator('.river[data-player-id="0"] svg')
                    before_discard = river.count()
                    page.locator("#player-hand button:enabled").first.click()
                    page.wait_for_function("!document.querySelector('#discard').disabled", timeout=5_000)
                    page.locator("#discard").click()
                    page.wait_for_function(
                        "before => document.querySelectorAll('.river[data-player-id=\"0\"] svg').length > before",
                        arg=before_discard,
                        timeout=10_000,
                    )
                    page_report["discardCount"] = river.count() - before_discard
                    require(page_report["discardCount"] == 1, f"cpu-discard-not-recorded-{key}")

                    page_report["consoleErrorCount"] = len(console_errors)
                    page_report["pageErrorCount"] = len(page_errors)
                    require(not page_report["blockedExternalHosts"], f"external-host-request-{key}")
                    require(not console_errors, f"console-errors-{key}")
                    require(not page_errors, f"page-errors-{key}")
                    report["environments"].append(page_report)
                    context.close()

                report["outcome"] = "SUCCESS"
                return report
            finally:
                browser.close()
    except Exception as error:
        report["outcome"] = "FAILURE"
        report["failure"] = {"stage": stage, "type": type(error).__name__}
        write_report(report)
        print(json.dumps(report, ensure_ascii=False, sort_keys=True), flush=True)
        raise SystemExit(f"live public Pages B1 failed at {stage}: {type(error).__name__}") from None

    finally:
        if report["outcome"] == "SUCCESS":
            write_report(report)
            print(json.dumps(report, ensure_ascii=False, sort_keys=True), flush=True)


if __name__ == "__main__":
    main()
