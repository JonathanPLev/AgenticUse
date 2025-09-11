from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
import csv
import os

BASE_URL = "https://www.futurepedia.io"

def get_all_category_links(driver, url):
    driver.get(url)
    WebDriverWait(driver, 10).until(
        EC.presence_of_all_elements_located((By.CSS_SELECTOR, "a.text-ice-500[href^='ai-tools/']"))
    )
    anchors = driver.find_elements(By.CSS_SELECTOR, "a.text-ice-500[href^='ai-tools/']")
    category_links = []
    seen_urls = set()

    for anchor in anchors:
        href = anchor.get_attribute("href")
        if href:
            full_url = href.strip("/")
            if full_url not in seen_urls:
                name = anchor.text.strip()
                category_links.append((name, full_url))
                seen_urls.add(full_url)

    return category_links


def get_all_subcategory_links(driver, category_links):
    subcategories = []
    seen_sub_urls = set()

    for category_url in category_links:
        driver.get(category_url[1])
        try:
            WebDriverWait(driver, 10).until(
                EC.presence_of_all_elements_located((By.CSS_SELECTOR, "a.text-ice-500[href]"))
            )
            anchors = driver.find_elements(By.CSS_SELECTOR, "a.text-ice-500[href]")
            for anchor in anchors:
                href = anchor.get_attribute("href")
                if href and href.startswith("https://www.futurepedia.io/ai-tools/"):
                    if href not in seen_sub_urls:
                        name = anchor.text.strip()
                        subcategories.append((name, href, category_url[0], category_url[1]))
                        seen_sub_urls.add(href)
        except Exception as e:
            print(f"Error loading subcategories for {category_url}: {e}")
            continue

    return subcategories



def get_internal_tool_links_from_subcategory(driver, subcat):
    tools = []
    page = 1

    while True:
        url = f"{subcat[1]}?page={page}" if page > 1 else subcat[1]
        print(f"Visiting: {url}")
        driver.get(url)

        try:
            WebDriverWait(driver, 10).until(
                EC.presence_of_all_elements_located((By.CSS_SELECTOR, "a[href^='https://www.futurepedia.io/tool/']"))
            )
        except:
            print(f"No internal tools found on page {page} of {subcat[1]}.")
            break


        anchors = driver.find_elements(By.CSS_SELECTOR, "a[href^='https://www.futurepedia.io/tool/']")
        if not anchors:
            break

        seen_tools = set()
        for anchor in anchors:
            href = anchor.get_attribute("href")
            if href and href not in seen_tools:
                name = anchor.text.strip()
                tools.append((name, href, subcat[2], subcat[3], subcat[0], subcat[1]))
                seen_tools.add(href)


        if len(anchors) < 12:
            break

        page += 1

    return tools



if __name__ == "__main__":
    main_url = 'https://www.futurepedia.io/ai-tools'
    file_path = "futurepedia_tools_UPDATED.csv"
    file_exists = os.path.isfile(file_path)

    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()))
    try:
        with open(file_path, "a", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            if not file_exists:
                writer.writerow(["Tool Page Title", "Tool Page URL", "Category", "Category URL", "Subcategory", "Source Subcategory URL"])

            categories = get_all_category_links(driver, main_url)
            subcategories = get_all_subcategory_links(driver, categories)
            for subcat in subcategories:
                tools = get_internal_tool_links_from_subcategory(driver, subcat)
                for tool in tools:
                    writer.writerow(tool)

    finally:
        driver.quit()
