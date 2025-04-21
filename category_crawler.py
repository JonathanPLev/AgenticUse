from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
import time
import csv
import os

def get_all_category_links(url):
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()))
    try:
        driver.get(url)

        # Wait for the category blocks to appear
        WebDriverWait(driver, 10).until(
            EC.presence_of_all_elements_located((By.CSS_SELECTOR, "a[target='_blank'][href*='/category/']"))
        )

        anchors = driver.find_elements(By.CSS_SELECTOR, "a[target='_blank'][href*='/category/']")
        category_links = []

        for anchor in anchors:
            href = anchor.get_attribute("href")
            if href and href.startswith("https://www.aixploria.com/en/category/"):
                if href not in category_links:
                    category_links.append(href)

        return category_links
    finally:
        driver.quit()


if __name__ == "__main__":
    with open("aixploria_categories.csv", "r", newline="", encoding="utf-8") as f1:
        for category_url in f1["Category URL"]:
            links = get_all_category_links(category_url)

            print(f"Found {len(links)} categories.")
            for link in links:
                print(link)

            # Optional: write to CSV
            with open("aixploria_categories.csv", "w", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow(["Category URL"])
                for link in links:
                    writer.writerow([link])