import pandas as pd
import csv

# futurepedia = pd.read_csv("tool_datasets/futurepedia_tools_UPDATED.csv")
# saas_ai = pd.read_csv("tool_datasets/saasai_ai_tools_FINAL.csv")
# insidr_ai = pd.read_csv("tool_datasets/insidr_ai_tools_UPDATED.csv")

# futurepedia["Source"] = "futurepedia"
# saas_ai["Source"] = "saas_ai"
# insidr_ai["Source"] = "insidr_ai"

# combined_df = pd.concat([futurepedia, saas_ai, insidr_ai], ignore_index=True)
# combined_df = combined_df.drop_duplicates(subset=["Tool Page URL"])
# # combined_df = combined_df.drop([" ", "Source URL", "Unnamed: 0"], axis=1)

# combined_df.to_csv("tool_datasets/AI_tool_master_list.csv")

df = pd.read_csv("tool_datasets/AI_tool_master_list.csv")
combined_df = df.drop(["ID", "Source URL", "Unnamed: 0"], axis=1)
combined_df.to_csv("tool_datasets/AI_tool_master_list_FINAL.csv")
