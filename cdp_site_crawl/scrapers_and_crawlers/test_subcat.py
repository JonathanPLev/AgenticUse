from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager

def get_all_subcategory_links(driver, category_links):
    subcategory_links = []

    for category_url in category_links:
        driver.get(category_url)
        try:
            WebDriverWait(driver, 10).until(
                EC.presence_of_all_elements_located((By.CSS_SELECTOR, "a.text-ice-500[href]"))
            )
            anchors = driver.find_elements(By.CSS_SELECTOR, "a.text-ice-500[href]")
            for anchor in anchors:
                href = anchor.get_attribute("href")
                if href and href.startswith("https://www.futurepedia.io/ai-tools/"):
                    if href not in subcategory_links:
                        subcategory_links.append(href)
        except Exception as e:
            print(f"Error loading subcategories for {category_url}: {e}")
            continue

    return subcategory_links


# === Test it ===
if __name__ == "__main__":
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()))
    try:
        test_category = ["https://www.futurepedia.io/ai-tools/productivity"]
        sub_links = get_all_subcategory_links(driver, test_category)
        print("\nSubcategory links found:")
        for link in sub_links:
            print(link)
    finally:
        driver.quit()
