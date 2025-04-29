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
        find me all the API links available for this tool. Title: {name} Domain: {domain}
        """
    )

    # Make the API request; adjust temperature and max_tokens as needed.

        # system_prompt = "Output can be either an appropriate  URL or NA"
    system_prompt = """
    You are an expert at finding API URLs/endpoints that are exposed by AI tools for website developers to use in their website.
    If a website developer is looking to integrate an AI tool, platform, service, etc. into their website, what are the URLs that he can use?
    For example, if i was to ask you this prompt for tool Title: ChatGPT. Domain: chatgpt.com, I'd expect a list that looks like this: 
    1. https://api.openai.com/v1/chat/completions 
    2. https://api.openai.com/v1/models 
    3. https://api.openai.com/v1/fine-tunes 
    4. https://api.openai.com/v1/files 
    5. https://api.openai.com/v1/audio/
    6. https://api.openai.com/v1/moderations 
    7. https://api.openai.com/v1/responses
    8. https://api.openai.com/v1/realtime/sessions
    9. https://api.openai.com/v1/embeddings
    10. https://api.openai.com/v1/evals
    11. https://api.openai.com/v1/fine_tuning/jobs
    12. https://api.openai.com/v1/batches
    13. https://api.openai.com/v1/uploads
    14. https://api.openai.com/v1/images/generations
    15. https://api.openai.com/v1/vector_stores
    16. https://api.openai.com/v1/assistants
    17. https://api.openai.com/v1/threads
    Regular expressions: 1. chatgpt.com/ 2. api.openai.com/

    Second example: Title: Creatify Domain: https://creatify.ai
     https://api.creatify.ai/api/link_to_videos/
https://api.creatify.ai/api/link_to_videos/{id}/
https://api.creatify.ai/api/link_to_videos/history/
https://api.creatify.ai/api/link_to_videos/preview/
https://api.creatify.ai/api/link_to_videos/{id}/render/
https://api.creatify.ai/api/link_to_videos/previews/async/
https://api.creatify.ai/api/link_to_videos/{list_id}/render/

https://api.creatify.ai/api/links/
https://api.creatify.ai/api/links/{id}/
https://api.creatify.ai/api/links/link_with_params/

https://api.creatify.ai/api/lipsyncs/
https://api.creatify.ai/api/lipsyncs/multi_avatar/
https://api.creatify.ai/api/lipsyncs/{id}/
https://api.creatify.ai/api/lipsyncs/preview/
https://api.creatify.ai/api/lipsyncs/{id}/render/

https://api.creatify.ai/api/lipsyncs_v2/
https://api.creatify.ai/api/lipsyncs_v2/{id}/
https://api.creatify.ai/api/lipsyncs_v2/preview/
https://api.creatify.ai/api/lipsyncs_v2/{id}/render/

https://api.creatify.ai/api/ai_scripts/
https://api.creatify.ai/api/ai_scripts/{id}/

https://api.creatify.ai/api/text-to-speech/
https://api.creatify.ai/api/text-to-speech/{id}/

https://api.creatify.ai/api/ai_shorts/
https://api.creatify.ai/api/ai_shorts/preview/
https://api.creatify.ai/api/ai_shorts/{id}/render/
https://api.creatify.ai/api/ai_shorts/{id}/
https://api.creatify.ai/api/ai_editing/
https://api.creatify.ai/api/ai_editing/preview/
https://api.creatify.ai/api/ai_editing/{id}/render/
https://api.creatify.ai/api/ai_editing/{id}/
https://api.creatify.ai/api/custom-templates/
https://api.creatify.ai/api/custom-templates/preview/
https://api.creatify.ai/api/custom-templates/{id}/render/
https://api.creatify.ai/api/custom-templates/{id}/
https://api.creatify.ai/api/personas/
https://api.creatify.ai/api/personas/{id}/
https://api.creatify.ai/api/dyoas/
https://api.creatify.ai/api/dyoas/{id}/
https://api.creatify.ai/api/dyoas/{id}/submit/
https://api.creatify.ai/api/voices/
https://api.creatify.ai/api/voices/?page={page}
https://api.creatify.ai/api/musics/categories/
https://api.creatify.ai/api/musics/
https://api.creatify.ai/api/workspace/credits/
Regular expressions: 1. api.creatify.ai/

3rd example: Title: Stammer AI Domain: app.stammer.ai
https://app.stammer.ai/en/chatbot/api/v1/message/
https://app.stammer.ai/en/chatbot/api/v1/create-chatbot/
https://app.stammer.ai/en/chatbot/api/v1/chatbot/{chatbot_uuid}/
https://app.stammer.ai/en/chatbot/api/v1/delete-chatbot/{chatbot_uuid}/
https://app.stammer.ai/en/chatbot/api/v1/qa/
https://app.stammer.ai/en/chatbot/api/website/crawl
https://app.stammer.ai/en/chatbot/api/your_chatbot_uuid/datafile/upload/with-training/
https://app.stammer.ai/en/chatbot/api/v1/conversations/
https://app.stammer.ai/en/chatbot/api/v1/conversation/{conversation_uuid}/
https://app.stammer.ai/en/chatbot/api/v1/conversation/{conversation_uuid}/deactivate/
https://app.stammer.ai/en/api/v1/subaccounts/
https://app.stammer.ai/en/api/v1/subaccounts/retrieve
https://app.stammer.ai/en/api/v1/subaccounts/update
https://app.stammer.ai/en/api/v1/subaccounts/delete
https://app.stammer.ai/en/user/api/v1/me/ 
Regular expressions: 1. app.stammer.ai

    Please output **only** valid JSON with two arrays:
    {
    "endpoints": ["https://…", …],
    "patterns":  ["chatgpt.com/", "api.openai.com/"]
    }
    (no numbering, no extra keys)
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

    print("URLs:", endpoints)
    print("Regex patterns:", patterns)

    return endpoints, patterns

def main():

    # Adjust max_workers based on your rate limits and desired concurrency
        # Map each hospital row to a future
    tools = [
        ("Runway", "runwayml.com"),
        # ("AnotherTool", "anothertool.com"),
    ]
    filename = 'AIinWeb.csv'
    file_exists = os.path.exists(filename)
    fieldnames = ['Service Name', 'Domain', 'API URL']
    with open(filename, mode='a', newline='') as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        if not file_exists:
            writer.writeheader()
        for name, domain in tools:
            endpoints, patterns = process_site(name, domain)
            writer.writerow({
                'Service Name': name,
                'Domain': ' '.join(patterns),
                'API URL': ' '.join(endpoints)
            })

        

if __name__ == "__main__":
    main()


