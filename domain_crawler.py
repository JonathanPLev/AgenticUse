import pandas as pd
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.support.ui import WebDriverWait
import time

def crawl_domain(driver, url, toolName):
    title, link = None, None  # Default values

    try:
        driver.get(url)
        if "futurepedia" in url:
            try:
                article = driver.find_element(By.XPATH, "//a[contains(@class, 'hover:no-underline')]")
                anchor = driver.find_element(By.XPATH, "//h1[contains(@class, 'text-darkBlue')]")
                title = anchor.text.strip()
                link = article.get_attribute("href")
            except Exception as e:
                print(f"Skipping one article due to error: {e}")

        elif "saasai" in url:
            try:
                article = WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.XPATH, "//a[contains(@class, 'brxe-button')]"))
                )
                buttons = driver.find_elements(By.XPATH, "//a[contains(@class, 'brxe-button')]")
                article = next(
                    (b for b in buttons if b.get_attribute("href") and not b.get_attribute("href").startswith("https://saasaitools.com")),
                    None
                )
                if article:
                    link = article.get_attribute("href")
                else:
                    link = None

                anchor = driver.find_element(By.XPATH, "//h1[contains(@class, 'brxe-heading')]")
                title = anchor.text.strip()
                
            except Exception as e:
                print(f"Skipping one article due to error: {e}")
                title, link = None, None

        elif "insidr" in url:
            try:
                time.sleep(2)
                link = driver.current_url
                title = toolName
            except Exception as e:
                print(f"Skipping one article due to error: {e}")

    except Exception as e:
        print(f"Error loading URL {url}: {e}")

    return title, link

    


def main():
    # Load the CSV
    df = pd.read_csv("tool_datasets/AI_tool_master_list_FINAL.csv")

    # Set up WebDriver
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()))
    wait = WebDriverWait(driver, 10)

    # Prepare lists to store results
    titles = []
    links = []

    # Iterate over the rows in the DataFrame
    for _, row in df.iterrows():
        # Ensure that you pass the correct URL (from the current row)
        url = row["Tool Page URL"]
        toolName = row["Tool Name"]
        title, link = crawl_domain(driver, url, toolName)

        # Append results to the lists
        titles.append(title)
        links.append(link)
        time.sleep(3)

    # Add the results to the DataFrame
    df["Tool Name"] = titles
    df["Domain"] = links

    # Save the updated DataFrame to a new CSV
    df.to_csv("tool_datasets/FINAL_LIST.csv", index=False)

    # Close the driver
    driver.quit()


if __name__ == "__main__":
    main()
