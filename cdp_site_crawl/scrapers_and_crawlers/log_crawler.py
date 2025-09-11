import os
import re
import json
import argparse
from collections import defaultdict

def load_list(file_path):
    """
    Read a “dictionary” file (domains.txt or functions.txt), one entry per line.
    - Strips whitespace.
    - Ignores blank/comment lines (lines beginning with '#').
    - Returns a list of escaped strings to be used in a regex literal match.
    """
    entries = []
    with open(file_path, 'r', encoding='utf-8') as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith('#'):
                continue
            # Escape special chars so, e.g., "completions.create" → "completions\.create"
            entries.append(re.escape(line))
    return entries

def compile_pattern(escaped_list):
    """
    Given a list of already re.escape()’d strings, build one combined regex:
      r"\b(item1|item2|item3)\b"
    That will match ANY of the items as a “whole word.” Using \b ensures we don't
    accidentally pick up substrings of longer tokens. Case‐insensitive by default.
    """
    if not escaped_list:
        return None
    alternation = "|".join(escaped_list)
    pattern = rf"\b({alternation})\b"
    return re.compile(pattern, flags=re.IGNORECASE)

def scan_log_file(path, domain_pattern, function_pattern, domains_found, functions_found):
    """
    Open one .log file in streaming mode. For each line:
      - run domain_pattern.finditer(...) → add each match.group(1) to domains_found
      - run function_pattern.finditer(...) → add each match.group(1) to functions_found
    """
    try:
        with open(path, 'r', encoding='utf-8', errors='ignore') as f:
            for raw_line in f:
                if domain_pattern:
                    for dm in domain_pattern.finditer(raw_line):
                        domains_found.add(dm.group(1))
                if function_pattern:
                    for fm in function_pattern.finditer(raw_line):
                        functions_found.add(fm.group(1))
    except Exception as e:
        # Skip files we can’t open/read for any reason
        print(f"  [WARNING] Could not read {path!r}: {e}")

def find_log_files(root_dir, extensions=('.log',)):
    """
    Walk only one level down (non‐recursive within each site‐folder) to find *.log files.
    """
    for entry in os.listdir(root_dir):
        full = os.path.join(root_dir, entry)
        if os.path.isfile(full) and entry.lower().endswith(extensions):
            yield full

def main(domains_txt, functions_txt, root_folder, output_json):
    # 1) Load & compile both patterns
    domains_list = load_list(domains_txt)
    functions_list = load_list(functions_txt)

    domain_pattern = compile_pattern(domains_list) if domains_list else None
    function_pattern = compile_pattern(functions_list) if functions_list else None

    if (domains_list and not domain_pattern) or (functions_list and not function_pattern):
        print("Error: failed to compile one of the regex patterns. Exiting.")
        return

    results = {}  # final: {site_name: {"domains": [...], "functions": [...]}, ...}

    # 2) For each subfolder under root_folder (each is treated as a “site”)
    for entry in os.listdir(root_folder):
        site_dir = os.path.join(root_folder, entry)
        if not os.path.isdir(site_dir):
            continue  # skip anything that isn’t a folder at this level

        site_name = entry
        matched_domains = set()
        matched_functions = set()

        # 3) Scan all .log files directly inside this subfolder
        for log_file in find_log_files(site_dir, extensions=('.log',)):
            scan_log_file(
                path=log_file,
                domain_pattern=domain_pattern,
                function_pattern=function_pattern,
                domains_found=matched_domains,
                functions_found=matched_functions
            )

        # 4) If either domains or functions was found, add to results
        #    Even if one list is empty, we still emit the other as an empty list
        if matched_domains or matched_functions:
            results[site_name] = {
                "domains":  sorted(matched_domains),
                "functions": sorted(matched_functions)
            }

    # 5) Write out JSON
    with open(output_json, 'w', encoding='utf-8') as out_f:
        json.dump(results, out_f, indent=2)

    print(f"\nDone. Wrote summary to {output_json!r}.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Scan each site‐folder’s .log files and report which API domains and SDK functions appear."
    )
    parser.add_argument(
        "domains_txt",
        help="Path to domains.txt (one API domain per line, e.g. api.openai.com)."
    )
    parser.add_argument(
        "functions_txt",
        help="Path to functions.txt (one function‐name per line, e.g. completions.create)."
    )
    parser.add_argument(
        "root_folder",
        help="Root directory containing subfolders (one per site). Each subfolder holds .log files."
    )
    parser.add_argument(
        "--output", "-o",
        default="site_domain_usage.json",
        help="Path for the JSON output (default: site_domain_usage.json)."
    )
    args = parser.parse_args()

    main(args.domains_txt, args.functions_txt, args.root_folder, args.output)
