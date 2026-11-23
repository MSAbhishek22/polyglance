"""PolyGlance browser QA — drives the local build in Chromium through the
fleet relay proxy (VM Chromium cannot reach the egress proxy directly).
Every control is used the way a person uses it: real clicks, real keys.
Writes screenshots + qa_results.json into this folder. Exits 1 on failure.
"""
import json
import os
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RELAY = os.path.join(os.path.expanduser("~"), "workspace/hackathons/data-sprint-2/demo-video/relay_proxy.py")
PORT = 5173
URL = f"http://127.0.0.1:{PORT}/"

results = []
errors = []


def check(name, ok, detail=""):
    results.append({"check": name, "pass": bool(ok), "detail": detail})
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""), flush=True)
    return ok


def main():
    relay = subprocess.Popen([sys.executable, RELAY], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    server = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1"],
                              cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.5)
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(args=["--no-sandbox"])
            ctx = browser.new_context(
                viewport={"width": 1280, "height": 950},
                proxy={"server": "http://127.0.0.1:8899", "bypass": "127.0.0.1,localhost"},
                ignore_https_errors=True,
            )
            page = ctx.new_page()
            page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
            page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
            page.on("dialog", lambda d: d.accept())

            page.goto(URL, wait_until="load", timeout=45000)

            # 1. Live data arrives and the glance screen fills with real markets
            page.wait_for_function(
                "() => document.getElementById('simStatus').textContent.includes('Live odds loaded')",
                timeout=30000,
            )
            lines = page.locator(".g2-line").all_text_contents()
            check("glance shows live markets", len(lines) >= 4, f"{len(lines)} lines")
            check("ticker shows a real market", "%" in page.locator("#tickerText").inner_text())
            check("outcome stats filled", page.locator("#statMarkets").inner_text().strip() not in ("—", ""))
            page.screenshot(path=os.path.join(HERE, "sim-glance.png"))

            # 2. Scroll moves the cursor
            sel_before = page.locator(".g2-line.selected").inner_text()
            page.click("#btnDown")
            page.wait_for_timeout(250)
            sel_after = page.locator(".g2-line.selected").inner_text()
            check("scroll moves selection", sel_before != sel_after)

            # 3. Tap opens the detail screen
            page.click("#btnTap")
            page.wait_for_timeout(250)
            check("tap opens detail", page.locator("#g2Header").inner_text().strip() == "MARKET")
            page.screenshot(path=os.path.join(HERE, "sim-detail.png"))

            # 4. Voice chip: watch this
            page.click('.vchip[data-cmd="watch this"]')
            page.wait_for_timeout(250)
            check("watch chip adds to watchlist", "Watching 1" in page.locator("#sessionInfo").inner_text())

            # 5. Voice chip: bet ten on yes -> confirm screen, then Tap confirms
            page.click('.vchip[data-cmd="bet ten on yes"]')
            page.wait_for_timeout(250)
            check("bet chip opens confirm screen", "PAPER BET" in page.locator("#g2Header").inner_text())
            page.screenshot(path=os.path.join(HERE, "sim-bet.png"))
            page.click("#btnTap")
            page.wait_for_timeout(250)
            check("confirm lands on positions", page.locator("#g2Header").inner_text().startswith("POSITIONS"))
            check("position recorded", "Positions 1" in page.locator("#sessionInfo").inner_text())
            page.screenshot(path=os.path.join(HERE, "sim-positions.png"))

            # 6. Back chip returns to glance; keyboard works too
            page.click('.vchip[data-cmd="back"]')
            page.wait_for_timeout(250)
            check("back returns to glance", "POLYGLANCE" in page.locator("#g2Header").inner_text())
            page.keyboard.press("ArrowDown")
            page.keyboard.press("Enter")
            page.wait_for_timeout(250)
            check("keyboard opens detail", page.locator("#g2Header").inner_text().strip() == "MARKET")
            page.keyboard.press("Backspace")
            page.wait_for_timeout(250)
            check("keyboard back works", "POLYGLANCE" in page.locator("#g2Header").inner_text())

            # 7. Low motion toggle flips both ways
            page.click("#motionToggle")
            check("motion toggle on", page.locator("#motionToggle").get_attribute("aria-pressed") == "true")
            page.click("#motionToggle")
            check("motion toggle off", page.locator("#motionToggle").get_attribute("aria-pressed") == "false")

            # 8. Mic button is honest about availability (never a dead control)
            mic_disabled = page.locator("#btnMic").is_disabled()
            mic_text = page.locator("#btnMic").inner_text()
            check("mic control is live or clearly labelled", mic_disabled or "Speak" in mic_text, mic_text)

            # 9. Refresh button re-fetches
            page.click("#btnRefresh")
            page.wait_for_function(
                "() => document.getElementById('simStatus').textContent.includes('Live odds loaded')",
                timeout=30000,
            )
            check("manual refresh works", True)

            # 10. Reset clears the session (dialog auto-accepted above)
            page.click("#btnReset")
            page.wait_for_timeout(300)
            info = page.locator("#sessionInfo").inner_text()
            check("reset clears session", "Watching 0" in info and "Positions 0" in info, info)

            # 11. Mode chip is honest: no Even host in this browser
            check("mode chip says simulator", "simulator" in page.locator("#modeChip").inner_text().lower())

            page.screenshot(path=os.path.join(HERE, "full-page.png"), full_page=True)
            browser.close()
    finally:
        relay.terminate()
        server.terminate()

    check("no page or console errors", not errors, "; ".join(errors[:3]))
    out = {"passed": sum(1 for r in results if r["pass"]), "total": len(results), "results": results}
    with open(os.path.join(HERE, "qa_results.json"), "w") as f:
        json.dump(out, f, indent=2)
    print(f"\n{out['passed']}/{out['total']} checks passed")
    sys.exit(0 if out["passed"] == out["total"] else 1)


if __name__ == "__main__":
    main()
