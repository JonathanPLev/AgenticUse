import os
import csv
import json
import time
from openai import OpenAI
from typing import Union
import os
from pydantic import BaseModel, Field, HttpUrl
from typing import List
from dotenv import load_dotenv
from typing import TypedDict
import re
from pathlib import Path
load_dotenv()


class Response(BaseModel):
    endpoints: List[str]
    patterns:  List[str]
    functions: List[str]

class APIEndpoint(BaseModel):
    
    name : str
    url : HttpUrl = Field(
        ...,
        pattern=r"^https?://\S+$",
        description="The full API endpoint URL"
    )
    pattern : str = Field(
        ...,
        description="Regular expressions used to identify this endpoint"
    )
class EndpointsResponse(TypedDict):
    endpoints: List[APIEndpoint]

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
from concurrent.futures import ThreadPoolExecutor, as_completed

def process_site(name, domain):


    user_prompt = (
        f"""
        find me all the API links available for this tool/service. Title: {name} Domain: {domain}
        """
    )

    # Make the API request; adjust temperature and max_tokens as needed.

        # system_prompt = "Output can be either an appropriate  URL or NA"
    system_prompt = """
You are an expert at finding API URLs/endpoints and function calls exposed by AI tools, platforms, or services that developers can use to integrate into their websites or apps.

Your task is to extract two types of integration interfaces:
1. **API endpoints**: HTTP-based URLs that a developer can call directly (e.g., REST endpoints).
2. **Function calls**: Common function names from client libraries (in Python, JS, etc.) that wrap these APIs (e.g., `client.responses.create` or `openai.ChatCompletion.create`).

If a developer wants to integrate an AI tool, what are the external API endpoints and internal client-side function names they can use?

---

### Example 1:
**Title**: ChatGPT  
**Domain**: chatgpt.com  

**endpoints**:
- https://api.openai.com/v1/chat/completions  
- https://api.openai.com/v1/models  
- https://api.openai.com/v1/fine-tunes  
- https://api.openai.com/v1/files  
- https://api.openai.com/v1/audio/  
- https://api.openai.com/v1/moderations  
- https://api.openai.com/v1/responses  
- https://api.openai.com/v1/embeddings  
- https://api.openai.com/v1/images/generations  

**function_calls**:
- openai.ChatCompletion.create  
- openai.Image.create  
- openai.Audio.transcribe  
- client.responses.create  

**regex_patterns**:
- api.openai.com/  
- chatgpt.com/  
- openai\\.[a-zA-Z]+\\.[a-zA-Z_]+  
- client\\.[a-zA-Z_]+\\.[a-zA-Z_]+

---

### Example 2:  
**Title**: Creatify  
**Domain**: creatify.ai  

**endpoints**:
- https://api.creatify.ai/api/link_to_videos/  
- https://api.creatify.ai/api/link_to_videos/{id}/  
- https://api.creatify.ai/api/link_to_videos/history/  
- https://api.creatify.ai/api/link_to_videos/preview/  
- https://api.creatify.ai/api/link_to_videos/{id}/render/  
- https://api.creatify.ai/api/link_to_videos/previews/async/  
- https://api.creatify.ai/api/link_to_videos/{list_id}/render/  
- https://api.creatify.ai/api/links/  
- https://api.creatify.ai/api/links/{id}/  
- https://api.creatify.ai/api/links/link_with_params/  
- https://api.creatify.ai/api/lipsyncs/  
- https://api.creatify.ai/api/lipsyncs/multi_avatar/  
- https://api.creatify.ai/api/lipsyncs/{id}/  
- https://api.creatify.ai/api/lipsyncs/preview/  
- https://api.creatify.ai/api/lipsyncs/{id}/render/  
- https://api.creatify.ai/api/lipsyncs_v2/  
- https://api.creatify.ai/api/lipsyncs_v2/{id}/  
- https://api.creatify.ai/api/lipsyncs_v2/preview/  
- https://api.creatify.ai/api/lipsyncs_v2/{id}/render/  
- https://api.creatify.ai/api/ai_scripts/  
- https://api.creatify.ai/api/ai_scripts/{id}/  
- https://api.creatify.ai/api/text-to-speech/  
- https://api.creatify.ai/api/text-to-speech/{id}/  
- https://api.creatify.ai/api/ai_shorts/  
- https://api.creatify.ai/api/ai_shorts/preview/  
- https://api.creatify.ai/api/ai_shorts/{id}/render/  
- https://api.creatify.ai/api/ai_shorts/{id}/  
- https://api.creatify.ai/api/ai_editing/  
- https://api.creatify.ai/api/ai_editing/preview/  
- https://api.creatify.ai/api/ai_editing/{id}/render/  
- https://api.creatify.ai/api/ai_editing/{id}/  
- https://api.creatify.ai/api/custom-templates/  
- https://api.creatify.ai/api/custom-templates/preview/  
- https://api.creatify.ai/api/custom-templates/{id}/render/  
- https://api.creatify.ai/api/custom-templates/{id}/  
- https://api.creatify.ai/api/personas/  
- https://api.creatify.ai/api/personas/{id}/  
- https://api.creatify.ai/api/dyoas/  
- https://api.creatify.ai/api/dyoas/{id}/  
- https://api.creatify.ai/api/dyoas/{id}/submit/  
- https://api.creatify.ai/api/voices/  
- https://api.creatify.ai/api/voices/?page={page}  
- https://api.creatify.ai/api/musics/categories/  
- https://api.creatify.ai/api/musics/  
- https://api.creatify.ai/api/workspace/credits/  

**function_calls**:
- creatify.link_to_videos.create  
- creatify.lipsyncs.preview  
- creatify.text_to_speech.generate  
- creatify.custom_templates.render  

**regex_patterns**:
- api.creatify.ai/  
- creatify\\.[a-zA-Z_]+\\.[a-zA-Z_]+

---

Return **only** valid JSON in this format:
{
  "endpoints": ["https://...", ...],
  "functions": ["...", ...],
  "patterns": ["...", ...]
}
"""

    
    # response = client.chat.completions.create(
    #     model="o3-mini-2025-01-31", # "gpt-3.5-turbo"
    #     messages=[
    #         {"role": "system", "content": system_prompt},
    #         {"role": "user", "content": user_prompt}
    #     ],
    #     # temperature=0.7, # remove temperature for o3 mini
    #     # max_tokens=50,
    #     response_format=Response
    # )
    
    resp: ParsedChatCompletion[Response] = client.beta.chat.completions.parse(
            model="gpt-4o-mini-2024-07-18", # "gpt-3.5-turbo" "o3-mini"
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0,
            # max_tokens=50,
            response_format=Response
        )
    raw: Response = resp.choices[0].message.parsed

    endpoints = raw.endpoints   # List[str]
    patterns  = raw.patterns    # List[str]
    functions = raw.functions

    print("URLs:", endpoints)
    print("Regex patterns:", patterns)

    return endpoints, patterns, functions

def main():

    # Adjust max_workers based on your rate limits and desired concurrency
        # Map each hospital row to a future
    tools = [
        ("Runway", "runwayml.com/"),
        # ("AnotherTool", "anothertool.com"),
    ]
    filename = 'AIinWeb.csv'
    file_exists = os.path.exists(filename)
    fieldnames = ['Service Name', 'Domain', 'API URL', 'Function Calls']
    with open(filename, mode='a', newline='') as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames, quotechar='"', quoting=csv.QUOTE_MINIMAL)
        if not file_exists:
            writer.writeheader()
        for name, domain in tools:
            endpoints, patterns, functions = process_site(name, domain)
            writer.writerow({
                'Service Name': name,
                'Domain': ' '.join(patterns),
                'API URL': ' '.join(endpoints),
                'Function Calls': ' '.join(functions)
            })

        

if __name__ == "__main__":
    main()


