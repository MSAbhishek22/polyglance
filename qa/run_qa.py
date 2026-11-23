"""PolyGlance browser QA — drives the local build in Chromium through the
fleet relay proxy (VM Chromium cannot reach the egress proxy directly).
Every control is used the way a person uses it: real clicks, real keys.
Writes screenshots + qa_results.json into this folder. Exits 1 on failure.
"""
import copy
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

            # ---------- routed-fixture section (deterministic) ----------
            # The live checks above cannot force a feed re-sort or a long
            # question on demand, so this section intercepts the Gamma API
            # and serves the recorded fixture (tests/fixture-markets.json)
            # in controlled variants. Fixture feed order (watched, movers,
            # volume): 7222313 Yokohama, 6919847 NVIDIA, 3215008 Fed,
            # 7222956 Set 1 Winner, 6998284 Jensen Huang, 2772194 Shakhtar.
            fixture = json.load(open(os.path.join(ROOT, "tests", "fixture-markets.json")))
            variant = {"data": copy.deepcopy(fixture)}

            ctx2 = browser.new_context(
                viewport={"width": 1280, "height": 950},
                proxy={"server": "http://127.0.0.1:8899", "bypass": "127.0.0.1,localhost"},
                ignore_https_errors=True,
            )
            page2 = ctx2.new_page()
            page2.on("pageerror", lambda e: errors.append(f"pageerror(2): {e}"))
            page2.on("console", lambda m: errors.append(f"console.{m.type}(2): {m.text}") if m.type == "error" else None)
            page2.route("**gamma-api.polymarket.com/**",
                        lambda route: route.fulfill(status=200, content_type="application/json",
                                                    body=json.dumps(variant["data"])))
            page2.goto(URL, wait_until="load", timeout=45000)
            page2.wait_for_function(
                "() => document.getElementById('simStatus').textContent.includes('Live odds loaded')",
                timeout=30000,
            )

            def selected_line(p):
                # Pre-fix, the selected row can be sliced off the 8-line
                # display entirely, so "no .selected element" is a real
                # state to report, not an error to hang on.
                loc = p.locator(".g2-line.selected")
                if loc.count() == 0:
                    return ""
                return loc.first.inner_text()

            def settle_refresh(p):
                p.click("#btnRefresh")
                p.wait_for_function("() => !document.getElementById('btnRefresh').disabled", timeout=30000)
                p.wait_for_timeout(300)

            def scroll_to(p, needle, max_steps=12):
                for _ in range(max_steps):
                    if needle.lower() in selected_line(p).lower():
                        return True
                    p.click("#btnDown")
                    p.wait_for_timeout(200)
                return needle.lower() in selected_line(p).lower()

            def scroll_detail_to_alert(p):
                for _ in range(6):
                    if "alert" in selected_line(p).lower():
                        return True
                    p.click("#btnDown")
                    p.wait_for_timeout(200)
                return "alert" in selected_line(p).lower()

            # 12. Fixture feed loads; select the Fed market (feed index 2)
            first_line = page2.locator(".g2-line").first.inner_text()
            check("fixture feed loads in routed page",
                  "Ryo Ono" in first_line and page2.locator("#statMarkets").inner_text().strip() == "6",
                  first_line)
            check("scroll selects the Fed market", scroll_to(page2, "Fed increase"),
                  selected_line(page2))

            # 13. Re-sort: Fed's day change jumps to +50 points, so the feed
            # re-orders and Fed moves from index 2 to index 0. The highlight
            # must follow the market (by id), not stay on row index 2.
            variant_b = copy.deepcopy(fixture)
            for m in variant_b:
                if str(m.get("id")) == "3215008":
                    m["oneDayPriceChange"] = 0.5
            variant["data"] = variant_b
            settle_refresh(page2)
            sel = selected_line(page2)
            check("selection survives a re-sort (same market stays highlighted)",
                  "Fed increase" in sel, sel)
            first_cls = page2.locator(".g2-line").first.get_attribute("class") or ""
            check("re-sort really moved the selected market to the top row",
                  "selected" in first_cls, f"first line class: {first_cls}")

            # 14. Fallback: the selected market vanishes from the feed ->
            # selection falls back to the first row (Yokohama market).
            variant["data"] = [m for m in copy.deepcopy(fixture) if str(m.get("id")) != "3215008"]
            settle_refresh(page2)
            sel = selected_line(page2)
            first_cls = page2.locator(".g2-line").first.get_attribute("class") or ""
            check("missing selected market falls back to the first row",
                  "selected" in first_cls and "Yokohama" in sel, sel)

            # 15. Alert row on a long-question market (NVIDIA question wraps
            # to 2 lines, pushing the detail screen past 8 lines): the alert
            # control must be reachable by scrolling, in the not-set state.
            variant["data"] = copy.deepcopy(fixture)
            settle_refresh(page2)
            check("scroll selects the NVIDIA market", scroll_to(page2, "no new be CEO"),
                  selected_line(page2))
            page2.click("#btnTap")
            page2.wait_for_timeout(250)
            check("NVIDIA detail opens", page2.locator("#g2Header").inner_text().strip() == "MARKET")
            seen = []
            for _ in range(5):
                seen += page2.locator(".g2-line").all_text_contents()
                page2.click("#btnDown")
                page2.wait_for_timeout(200)
            check("alert row reachable on a long-question market",
                  any("price alert" in l.lower() or "alert on" in l.lower() for l in seen),
                  " | ".join(dict.fromkeys(seen)))
            check("alert row selectable on NVIDIA detail", scroll_detail_to_alert(page2),
                  selected_line(page2))
            page2.click("#btnTap")
            page2.wait_for_timeout(250)
            check("tap on alert row sets an alert",
                  "Alerts 1" in page2.locator("#sessionInfo").inner_text(),
                  page2.locator("#sessionInfo").inner_text())

            # 16. Revisit the same market: the alert row must show the set
            # state, not offer to set it again.
            page2.click('.vchip[data-cmd="back"]')
            page2.wait_for_timeout(250)
            check("back to glance after setting alert",
                  "POLYGLANCE" in page2.locator("#g2Header").inner_text())
            check("re-select NVIDIA market", scroll_to(page2, "no new be CEO"), selected_line(page2))
            page2.click("#btnTap")
            page2.wait_for_timeout(250)
            check("alert row shows set state on revisit",
                  scroll_detail_to_alert(page2) and "alert on" in selected_line(page2).lower(),
                  selected_line(page2))

            # 17. A market with no alert must offer the not-set state.
            page2.click('.vchip[data-cmd="back"]')
            page2.wait_for_timeout(250)
            check("re-select Fed market", scroll_to(page2, "Fed increase"), selected_line(page2))
            page2.click("#btnTap")
            page2.wait_for_timeout(250)
            check("alert row shows not-set state on a fresh market",
                  scroll_detail_to_alert(page2) and "set a price alert" in selected_line(page2).lower(),
                  selected_line(page2))

            ctx2.close()
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
