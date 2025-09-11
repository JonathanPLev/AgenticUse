import pandas as pd
import ast

df = pd.read_csv("tool_datasets/saasai_ai_tools_UPDATED.csv")
df[["Tool_Name", "Tool Page URL"]] = df["Source URL"].apply(lambda x: pd.Series(ast.literal_eval(x)))
df.drop("Source URL", axis=1)
df.to_csv("tool_datasets/saasai_ai_tools_FINAL.csv")
