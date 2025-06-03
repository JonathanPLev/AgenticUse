import os
import re
import json
import argparse
from collections import defaultdict

def load_domains(domains_path):
    """
    Read domains.txt (one domain per line), strip whitespace,
    ignore blank lines or lines starting with '#'. Return a list
    of escaped regex patterns (for literal substring matching).
    """
    domains = []
    with open(domains_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            # escape dots so that "." is treated literally
            domains.append(re.escape(line))
    return domains

def compile_pattern(domain_list):
    """
    Given a list of escaped domains, compile a single regex alternation
    e.g. r"(api\.openai\.com|api\.anthropic\.com|...)" that matches any
    of those domains. We use word boundaries (\b) so we don’t accidentally
    match substrings that run together.
    """
    alternation = "|".join(domain_list)
    # \b on either side ensures we match the domain as a “word”
    pattern = rf"\b({alternation})\b"
    return re.compile(pattern, flags=re.IGNORECASE)

def scan_log_file(path, regex_pattern, found_domains_in_folder):
    """
    Open a single .log file, read line by line, and whenever the regex matches,
    add each matched domain to the set found_domains_in_folder.
    """
    try:
        with open(path, 'r', encoding='utf-8', errors='ignore') as f:
            for line in f:
                for match in regex_pattern.finditer(line):
                    found_domains_in_folder.add(match.group(1))
    except Exception as e:
        # In case of permission issues or weird binary data, just skip
        print(f"  [WARNING] could not read {path!r}: {e}")

def main(domains_file, root_folder, output_json):
    # 1) Load and compile the domain‐matching regex
    domains = load_domains(domains_file)
    if not domains:
        print(f"No domains found in {domains_file!r}. Exiting.")
        return

    pattern = compile_pattern(domains)

    # 2) Prepare the final structure: { site_name: [list_of_domains], ... }
    results = {}

    # 3) List every entry under root_folder; treat each SUB‐DIR as a “site”
    for entry in os.listdir(root_folder):
        subpath = os.path.join(root_folder, entry)
        if not os.path.isdir(subpath):
            continue  # skip files at the top level; we only care about subfolders

        site_name = entry
        # Use a set to avoid duplicates
        matched_domains = set()

        # 4) Inside this subfolder, find all *.log files (non‐recursively)
        for fname in os.listdir(subpath):
            if not fname.lower().endswith('.log'):
                continue
            logfile_path = os.path.join(subpath, fname)
            scan_log_file(logfile_path, pattern, matched_domains)

        # 5) Convert set → sorted list (or leave unsorted if order doesn’t matter)
        if matched_domains:
            results[site_name] = sorted(matched_domains)

    # 6) Dump results as JSON
    with open(output_json, 'w', encoding='utf-8') as out_f:
        json.dump(results, out_f, indent=2)

    print(f"\nDone. Wrote domain‐usage summary to {output_json!r}.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Scan a root folder of subfolders (one per site), each containing .log files, "
                    "and produce a JSON mapping site → [AI API domains found]."
    )
    parser.add_argument(
        "domains_txt",
        help="Path to domains.txt (one API domain per line, e.g. api.openai.com)"
    )
    parser.add_argument(
        "root_folder",
        help="Root directory that contains one subfolder per site (each subfolder has .log files)"
    )
    parser.add_argument(
        "--output", "-o",
        default="site_domain_usage.json",
        help="(Optional) Path for the JSON output (default: site_domain_usage.json)"
    )
    args = parser.parse_args()

    main(args.domains_txt, args.root_folder, args.output)
