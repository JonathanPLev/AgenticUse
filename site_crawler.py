import csv, json, time, random
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.desired_capabilities import DesiredCapabilities

# ─── Configuration ─────────────────────────────────────────────
INPUT_CSV   = "test_URLs.csv"
OUT_DIR     = Path("logs_selenium_stealth")
OUT_DIR.mkdir(exist_ok=True)
MAX_SCROLLS = 100                      # max scroll iterations

# rotate through realistic desktop user-agents
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)"
    " Chrome/114.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/605.1.15 (KHTML, like Gecko)"
    " Version/16.5 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko)"
    " Chrome/115.0.0.0 Safari/537.36",
]

# stealth JS to inject before any page script runs
STEALTH_JS = r"""
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
Object.defineProperty(navigator, 'languages',   { get: () => ['en-US','en'] });
Object.defineProperty(navigator, 'plugins',     { get: () => [1,2,3,4,5] });
const getParam = WebGLRenderingContext.prototype.getParameter;
WebGLRenderingContext.prototype.getParameter = function(p) {
    if (p === 37445) return 'Intel Inc.';
    if (p === 37446) return 'Intel Iris OpenGL Engine';
    return getParam.call(this, p);
};
"""

# for capturing js functions

INSTRUMENT_JS = r"""
(() => {
  window._jsCalls = [];
  // helper to wrap methods
  function wrap(obj, methodName) {
    const orig = obj[methodName];
    if (!orig) return;
    obj[methodName] = function(...args) {
      // record the call
      window._jsCalls.push({ fn: methodName, args });
      // also log to console so your console.json picks it up
      console.log('JS_CALL', methodName, args);
      return orig.apply(this, args);
    };
  }
  // wrap fetch
  wrap(window, 'fetch');
  // wrap XHR open & send
  wrap(XMLHttpRequest.prototype, 'open');
  wrap(XMLHttpRequest.prototype, 'send');
})();
"""

def human_scroll(driver, max_scrolls=MAX_SCROLLS):
    """
    Repeatedly scroll all the way to the bottom, up to max_scrolls times,
    breaking only once the viewport bottom >= total scrollHeight.
    """
    for i in range(max_scrolls):
        # pick a human‐like scroll delta
        delta = random.randint(200, 800)
        driver.execute_script("window.scrollBy(0, arguments[0]);", delta)
        
        # wait a bit for lazy‐loaded content
        time.sleep(random.uniform(0.5, 1.5))
        
        # measure where the viewport bottom sits
        position     = driver.execute_script(
            "return window.pageYOffset + window.innerHeight;"
        )
        total_height = driver.execute_script(
            "return document.body.scrollHeight;"
        )
        
        # debug print (optional)
        print(f"    scroll #{i+1}: +{delta}px → {position:.0f}/{total_height:.0f}")
        
        # only stop once you've genuinely hit the end
        if position >= total_height:
            print(f"    ↳ reached bottom after {i+1} scrolls")
            break

def normalize_url(u: str) -> str:
    if not u.startswith(("http://", "https://")):
        return "https://" + u
    return u


def crawl(url: str, idx: int):
    # prepare per-site output folder
    url = normalize_url(url)
    safe = url.replace("://","_").replace("/","_")
    out  = OUT_DIR / f"{idx:04d}_{safe}"
    out.mkdir(exist_ok=True)

    # pick UA and viewport
    ua = random.choice(USER_AGENTS)
    w, h = random.choice([1200,1366,1440,1600]), random.choice([700,800,900,1000])

    # enable performance & browser logs
    caps = DesiredCapabilities.CHROME.copy()
    caps["goog:loggingPrefs"] = {"performance":"ALL", "browser":"ALL"}

    opts = Options()
    opts.headless = False
    opts.add_argument(f"--user-agent={ua}")
    opts.add_argument(f"--window-size={w},{h}")
    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-infobars")
    opts.add_argument("--incognito")

    opts.set_capability("goog:loggingPrefs",
    {
        "performance": "ALL",
        "browser": "ALL"
    })

    driver = webdriver.Chrome(service=Service(), options=opts)

    # inject stealth script
    driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {"source": STEALTH_JS})
    driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {"source": INSTRUMENT_JS})

    # navigate + human-like wait/scroll
    driver.get(url)
    time.sleep(random.uniform(1.0,3.0))
    human_scroll(driver)
    dwell = random.uniform(5, 10)   # anywhere from 20s to 45s
    print(f"  → waiting {dwell:.1f}s to let ads/iframes load…")
    time.sleep(dwell)

    # collect logs
    perf = driver.get_log("performance")
    brow = driver.get_log("browser")


    # parse network events
    requests, responses = [], []
    for entry in perf:
        msg = json.loads(entry["message"])["message"]
        m, p = msg.get("method"), msg.get("params", {})
        if m == "Network.requestWillBeSent":
            req = {"url": p["request"]["url"], "method": p["request"]["method"], "headers": p["request"].get("headers",{})}
            if "postData" in p["request"]:
                req["postData"] = p["request"]["postData"]
            requests.append(req)
        elif m == "Network.responseReceived":
            res = {"url": p["response"]["url"], "status": p["response"]["status"], "headers": p["response"].get("headers",{})}
            responses.append(res)

    # parse console logs
    console_logs = [{"level": e["level"], "message": e["message"]} for e in brow]
    js_calls = driver.execute_script("return window._jsCalls || []")


    # write out JSON
    (out/"requests.json").write_text(json.dumps(requests, indent=2))
    (out/"responses.json").write_text(json.dumps(responses, indent=2))
    (out/"console.json").write_text(json.dumps(console_logs, indent=2))
    (out/"js_calls.json").write_text(json.dumps(js_calls,     indent=2))

    driver.quit()

if __name__ == "__main__":
    with open(INPUT_CSV) as f:
        reader = csv.reader(f)
        for idx, row in enumerate(reader, start=1):
            # adjust here if your CSV has multiple columns (e.g. index,name)
            url = row[1]
            try:
                print(f"[{idx:04d}] crawling {url} …")
                crawl(url, idx)
            except Exception as e:
                print(f"  ✖ error on {url}: {e}")
