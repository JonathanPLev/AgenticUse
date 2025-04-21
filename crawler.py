from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
import time
import csv
import os

def get_all_tool_links_from_category(driver, category_url):
    tool_links = []
    page = 1

    while True:
        url = f"{category_url}page/{page}/" if page > 1 else category_url
        print(f"Visiting: {url}")
        driver.get(url)

        try:
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.CLASS_NAME, "dark-title"))
            )
        except:
            print(f"No tools found on page {page}. Stopping.")
            break

        # Extract all tool links on the current page
        anchors = driver.find_elements(By.CLASS_NAME, "dark-title")
        if not anchors:
            break

        for anchor in anchors:
            href = anchor.get_attribute("href")
            if href:
                tool_links.append(href)

        # Check if there is a next page by seeing if the current page has exactly 12 tools
        if len(anchors) < 12:
            break

        page += 1

    return tool_links


def get_source_url_from_tool_page(driver, tool_url):
    driver.get(tool_url)
    try:
        # Wait for the main button to appear
        button = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.ID, "specialButton"))
        )
        return button.get_attribute("href")
    except:
        print(f"Could not get source URL for {tool_url}")
        return None


def scrape_category(category_url):
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()))
    try:
        tool_pages = get_all_tool_links_from_category(driver, category_url)
        print(f"Found {len(tool_pages)} tools in category.")
        return tool_pages
    finally:
        driver.quit()

if __name__ == "__main__":
    file_exists = os.path.isfile("aixploria_ai_tools.csv")
    with open("aixploria_ai_tools.csv", "a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow(["Tool Page URL", "Category URL"])  # Updated header

        with open("aixploria_categories.csv", "r", newline="", encoding="utf-8") as f1:
            reader = csv.DictReader(f1)
            for row in reader:
                category = row["Category URL"]
                try:
                    source_urls = scrape_category(category)
                    for tool_page in source_urls:
                        writer.writerow([tool_page, category])  # Write both
                except Exception as e:
                    print(f"Error scraping {category}: {e}")