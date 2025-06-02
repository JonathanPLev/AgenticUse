import pandas as pd

df = pd.read_csv("top-1m.csv", nrows=10000)


df.to_csv("urls_with_subdomains_forCrawl.csv")