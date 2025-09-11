import pandas as pd
from urllib.parse import urlparse


df = pd.read_csv("top-1m.csv", nrows=10000)

def normalize_url(raw: str, force_www: bool = False) -> str:
    raw = raw.strip()

    # 1. If the user really does need "www." (force_www=True), add it only if missing:
    if force_www and not raw.lower().startswith("www."):
        raw = "www." + raw

    # 2. If it already contains "://" (http or https), leave it alone. Otherwise prepend "https://"
    if "://" not in raw:
        raw = "https://" + raw

    return raw

def is_valid_url(u: str) -> bool:
    parts = urlparse(u)
    # must have a scheme (http/https) and a netloc (hostname)
    return bool(parts.scheme) and bool(parts.netloc)

df["url"] = df["url"].apply(lambda u: normalize_url(u, force_www=False))


df.to_csv("urls_with_subdomains_forCrawl.csv", index=False)