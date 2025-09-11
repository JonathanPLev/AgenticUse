from browser_use import Agent, Browser
from langchain_openai import ChatOpenAI
from browser_use.browser.context import BrowserContext
from browser_use.browser.context import BrowserContextConfig
from browser_use import BrowserConfig
import asyncio
import sys
import os
from dotenv import load_dotenv
load_dotenv()

os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "/Users/homefolder/.config/gcloud/application_default_credentials.json"

# Basic configuration
browser_config = BrowserConfig(
    headless=False,
    disable_security=True
)

context_config = BrowserContextConfig(
    wait_for_network_idle_page_load_time=3.0,
    browser_window_size={'width': 1280, 'height': 1100},
    locale='en-US',
    user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.102 Safari/537.36',
    highlight_elements=True,
    viewport_expansion=500,
)

browser = Browser(config=browser_config)
context = BrowserContext(browser=browser, config=context_config)

# Add your custom instructions
extend_system_message = """
            You are an AI tool surveyor. Your job is to get the URLs from the 12 AI tools listed on the page from the dark title button in each tool square. IGNORE the Enso Bot.
           """

# """ 1. Service Name (i.e. “3D LHM (Alibaba)”)
#             2. Domain of the service (i.e. for “https://www.aixploria.com/en/portia-labs-ai-agents/“ the domain would be “portialabs.ai”)
#             3. Source Category (i.e. Web or Github)
#             4. Source URL (i.e. “https://www.aixploria.com/en/portia-labs-ai-agents/“)
#             5. Service Type (i.e. Tool, Service, or Platform)
#             6. Service Category (i.e. audio, video, etc.)

#             To find out the 6 categories for each AI tool, you will follow these steps:
#             1. Navigate to {self.website}. 
#             2. Each tool is identified by the name in a little box with a number next to it. Scroll down if necessary, and click on tool number {self.index}. If the number you are looking for is not on the current page, use the left and right arrows next to the numbers or click on the page number you need in order to get to that page. 
#             3. Note down the current URL you are at. That will be the “Source URL”. Remember this URL, you will use it in a few steps. 
#             4. Note down the Service Name, that will be the “Service Name”. Remember this data, you will use it in a few steps.
#             5. If possible, infer the “Service Type” and “Service Category” from the data available to you on the webpage. Remember your inferences. You will use them in a few steps. If you cannot infer the  “Service Type” and “Service Category” from the data available to you on the webpage, please do so in the next step.
#             6. Navigate to the “Visit Site” button and click it. It will take you to the source of the AI tool. 
#             7. Note down the current URL you are at. That will be the “Domain of the service”. Remember this URL, you will use it in a few steps. 
#             8. If you have not inferred the “Service Type” and “Service Category”, do so now using the data available to you on the webpage. Infer the “Source Category” from the data available to you on the webpage. Remember your inferences. You will use them in a few steps. 
#             9. In this step you will build a URL and type it into the current browser window, and then visit that URL. Do NOT leave any part of the URL blank, fill in every part. The URL domain will be http://localhost:5000/update/<Service_Name>/<Domain>/<Source_Category>/<Source_URL>/<Service_Type>/<Service_Category>
#             10. Return back to {self.website}. Complete steps 3-7, for the next tool that you have not yet surveyed. If you have surveyed all the tools available on the current page, move to the next page and start with the first tool on that page. If there are no more tools to survey, the task is complete.
#             """
# Defining an asynchronous function
async def main(website=None):
    if website is None and len(sys.argv) > 1:
        website = sys.argv[1]
    
    i = 1
    while i < 21:
        # /page/{i}
    # For each AI tool, visit http://localhost:9000/<Service_url>. IGNORE Enso Bot
        agent = Agent(
            task=f"Visit 'https://www.aixploria.com/en/last-ai/page/{i}' and get the URLs from the 12 AI tools listed on the page from their title button at the top of each tool square. IGNORE the enso bot and any URLs that are NOT AI tools. Collect the URLs for all 12 tools FIRST, then put the 12 urls into a comma separated string, and then encode it as a base 64 string. Visit http://localhost:9000/update?service_url=<Service_URL>, and input the base64-encoded string THAT YOU CREATED into 'Service_URL'.",
            llm=ChatOpenAI(model="gpt-4o"),
            browser=browser,  # Browser instance will be reused
            context=context,
            save_conversation_path="./logs/conversation",
            extend_system_message=extend_system_message
        )

        await agent.run()

        # Manually close the browser
        await browser.close()
        i += 1

if __name__ == "__main__":
    website = sys.argv[1] if len(sys.argv) > 1 else None
    # Run the main async function
    asyncio.run(main(website))