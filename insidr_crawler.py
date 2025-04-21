from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
from selenium.common.exceptions import TimeoutException, NoSuchElementException
import time
import csv
import os

# returns (category_name, category_url)
def get_all_category_links(driver, url):
    driver.get(url)
    # Wait until at least one category filter link is visible on the page.
    WebDriverWait(driver, 10).until(
        EC.presence_of_all_elements_located((By.CSS_SELECTOR, ".aitools-button-group > a.aitools-category-filter"))
    )
    # Find all anchor elements that have the category filter class.
    anchors = driver.find_elements(By.CSS_SELECTOR, ".aitools-button-group > a.aitools-category-filter")
    category_links = []

    for anchor in anchors:
        href = anchor.get_attribute("href")
        category_name = anchor.text.strip()
        if href and (category_name, href) not in category_links:
            category_links.append((category_name, href))
    print(category_links)
                
    return category_links


# Returns list of tool links (tool_name, tool_url, category_name, category_url)
def get_all_tool_links_from_category(driver, category):
    tool_links = []
    page = 1  # Initialize page counter

    while True:
        # Construct URL based on page number
        url = f"{category[1]}/page/{page}/" if page > 1 else category[1]
        print(f"Visiting: {url}")
        driver.get(url)

        try:
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.CLASS_NAME, "aitools-visit-link"))
            )
        except TimeoutException:
            print(f"No tools found on page {page}. Stopping.")
            break
        
        # Extract all tool cards on the current page
        tool_cards = driver.find_elements(By.CLASS_NAME, "aitools-item")
        # If no cards are present, break out of the loop to avoid infinite loop.
        if not tool_cards:
            break

        for card in tool_cards:
            try:
                anchor = card.find_element(By.CLASS_NAME, "aitools-visit-link")
                href = anchor.get_attribute("href")
            except NoSuchElementException:
                href = None
            try:
                title = card.find_element(By.CLASS_NAME, "aitools-tool-title").text.strip()
            except NoSuchElementException:
                title = None
            
            if href and title:
                tool_links.append((title, href, category[0], category[1]))
        print(tool_cards)
        # Optional: if fewer than expected tools per page, exit pagination
        if len(tool_cards) < 10:  # Adjust threshold as needed
            break

        page += 1

    return tool_links


def scrape_category(category):
    # Create a new driver for each category and ensure proper cleanup.
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()))
    try:
        tool_pages = get_all_tool_links_from_category(driver, category)
        print(f"Found {len(tool_pages)} tools in category: {category[0]}")
        return tool_pages
    finally:
        driver.quit()


if __name__ == "__main__":
    Base_URL = 'https://www.insidr.ai/ai-tools/'
    file_exists = os.path.isfile("insidr_ai_tools.csv")
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()))

    try:
        categories = get_all_category_links(driver, Base_URL)
    finally:
        driver.quit()

    all_tool_links = []  # Accumulate tool links from all categories

    for category in categories:
        tool_links = scrape_category(category)
        all_tool_links.extend(tool_links)

    with open("insidr_ai_tools.csv", "a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow(["Tool Name", "Tool Page URL", "Category", "Category URL"])  # Updated header
        for tool in all_tool_links:
            writer.writerow(tool)
