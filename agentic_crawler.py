from browser_use import Agent
from langchain_openai import ChatOpenAI
import pandas as pd
from dotenv import load_dotenv
from flask import Flask, jsonify
import threading
import time

app = Flask(__name__)

class AI_Tool_Surveyor():
    def __init__(self) -> None:
        self.df = pd.DataFrame(columns=["Service Name", "Domain", "Source Category", "Source URL", "Service Type", "Service Category"])
        self.index = 1  # Start at the first tool
        self.total_tools = 3643
        self.tools_per_page = 12
        self.website = "https://www.aixploria.com/en/category/last-ai-en/page/1/"
        self.agent = None  # Will be initialized dynamically
        load_dotenv()
        self.create_new_agent()
    
    def create_new_agent(self):
        if not self.df.empty:
            self.index = len(self.df) + 1  # Resume from the last index
        page_number = (self.index - 1) // self.tools_per_page + 1
        self.website = f"https://www.aixploria.com/en/category/last-ai-en/page/{page_number}"
        self.agent = Agent(
            task=f"""
            You are an AI tool surveyor. For each AI tool, you are looking to extract 6 data categories. The 6 categories are:
            1. Service Name (i.e. “3D LHM (Alibaba)”)
            2. Domain of the service (i.e. for “https://www.aixploria.com/en/portia-labs-ai-agents/“ the domain would be “portialabs.ai”)
            3. Source Category (i.e. Web or Github)
            4. Source URL (i.e. “https://www.aixploria.com/en/portia-labs-ai-agents/“)
            5. Service Type (i.e. Tool, Service, or Platform)
            6. Service Category (i.e. audio, video, etc.)

            To find out the 6 categories for each AI tool, you will follow these steps:
            1. Navigate to {self.website}. 
            2. Each tool is identified by the name in a little box with a number next to it. Scroll down if necessary, and click on tool number {self.index}. If the number you are looking for is not on the current page, use the left and right arrows next to the numbers or click on the page number you need in order to get to that page. 
            3. Note down the current URL you are at. That will be the “Source URL”. Remember this URL, you will use it in a few steps. 
            4. Note down the Service Name, that will be the “Service Name”. Remember this data, you will use it in a few steps.
            5. If possible, infer the “Service Type” and “Service Category” from the data available to you on the webpage. Remember your inferences. You will use them in a few steps. If you cannot infer the  “Service Type” and “Service Category” from the data available to you on the webpage, please do so in the next step.
            6. Navigate to the “Visit Site” button and click it. It will take you to the source of the AI tool. 
            7. Note down the current URL you are at. That will be the “Domain of the service”. Remember this URL, you will use it in a few steps. 
            8. If you have not inferred the “Service Type” and “Service Category”, do so now using the data available to you on the webpage. Infer the “Source Category” from the data available to you on the webpage. Remember your inferences. You will use them in a few steps. 
            9. In this step you will build a URL and type it into the current browser window, and then visit that URL. Do NOT leave any part of the URL blank, fill in every part. The URL domain will be http://localhost:5000/update/<Service_Name>/<Domain>/<Source_Category>/<Source_URL>/<Service_Type>/<Service_Category>
            10. Return back to {self.website}. Complete steps 3-7, for the next tool that you have not yet surveyed. If you have surveyed all the tools available on the current page, move to the next page and start with the first tool on that page. If there are no more tools to survey, the task is complete.
            """,
            llm=ChatOpenAI(model="gpt-4o"),
        )
    
    def run(self):
        while self.index < self.total_tools:
            print(f"Starting agent at tool {self.index}")
            self.agent.run()
            print("Restarting agent...")
            self.create_new_agent()

    def update_dataframe(self, service_name, domain, source_category, source_url, service_type, service_category):
        new_entry = pd.DataFrame([{ 
            "Service Name": service_name, 
            "Domain": domain, 
            "Source Category": source_category, 
            "Source URL": source_url, 
            "Service Type": service_type, 
            "Service Category": service_category
        }])
        self.df = pd.concat([self.df, new_entry], ignore_index=True)
        print("Updated DataFrame:", self.df.tail(5))  # Print the last few entries

@app.route('/update/<service_name>/<domain>/<source_category>/<source_url>/<service_type>/<service_category>', methods=['GET'])
def receive_data(service_name, domain, source_category, source_url, service_type, service_category):
    try:
        survey_agent.update_dataframe(service_name, domain, source_category, source_url, service_type, service_category)
        return jsonify({"message": "Data received and DataFrame updated"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

survey_agent = AI_Tool_Surveyor()

def run_agent():
    survey_agent.run()

def run_server():
    app.run(port=5000, debug=True, use_reloader=False)

if __name__ == "__main__":
    server_thread = threading.Thread(target=run_server)
    agent_thread = threading.Thread(target=run_agent)
    
    server_thread.start()
    agent_thread.start()
    
    server_thread.join()
    agent_thread.join()
