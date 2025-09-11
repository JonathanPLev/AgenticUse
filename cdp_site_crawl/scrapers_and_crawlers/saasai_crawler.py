from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
import time
import csv
import os

def scrape_saasai_tools(home_url="https://saasaitools.com/"):
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()))
    wait = WebDriverWait(driver, 10)
    try:
        driver.get(home_url)

        while True:
            try:
                load_more = wait.until(EC.element_to_be_clickable((By.CLASS_NAME, "wpgb-load-more")))
                print("Clicking Load More...")
                driver.execute_script("arguments[0].click();", load_more)
                time.sleep(2)
            except:
                print("No more 'Load More' button or timeout")
                break

        # Get all tool article blocks
        articles = driver.find_elements(By.CSS_SELECTOR, "article.landing__listing-card")
        tools = []

        for article in articles:
            try:
                # Get the anchor with tool name and link inside the <h4>
                title_anchor = article.find_element(By.CSS_SELECTOR, "h4.landing__listing-title a")
                tool_name = title_anchor.text.strip()
                tool_url = title_anchor.get_attribute("href").strip()
                tools.append((tool_name, tool_url))
            except Exception as e:
                print(f"Skipping one article due to error: {e}")

        print(f"Collected {len(tools)} tools")
        return tools

    finally:
        driver.quit()


if __name__ == "__main__":
    urls = scrape_saasai_tools()
    file_name = "saasai_ai_tools_UPDATED.csv"
    file_exists = os.path.isfile(file_name)
    with open(file_name, "a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow(["Source URL"])  # Updated header
        for url in urls:
            writer.writerow([url])