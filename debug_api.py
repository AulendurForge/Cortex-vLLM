#!/usr/bin/env python3
"""
Debug script to test API connectivity and response formats
"""

import asyncio
import aiohttp
import json
import time

# Configuration
API_URL = "http://10.1.10.241:8084/v1/chat/completions"
API_KEY = "M9GQhfQ3lhSA0t2DbsKYmCabNGspaDKWyZpZcUZH"
MODEL_NAME = "huihui-gpt-oss-120b-bf16-abliterated"

# Headers
HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

async def test_streaming_request():
    """Test streaming request"""
    print("Testing streaming request...")
    
    payload = {
        "model": MODEL_NAME,
        "messages": [{"role": "user", "content": "Say hello"}],
        "temperature": 0.7,
        "max_tokens": 50,
        "stream": True
    }
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(API_URL, headers=HEADERS, json=payload) as response:
                print(f"Status: {response.status}")
                print(f"Headers: {dict(response.headers)}")
                
                if response.status == 200:
                    print("Streaming response:")
                    async for line in response.content:
                        if line:
                            print(f"Chunk: {line.decode('utf-8').strip()}")
                else:
                    error_text = await response.text()
                    print(f"Error: {error_text}")
                    
    except Exception as e:
        print(f"Exception: {e}")

async def test_non_streaming_request():
    """Test non-streaming request"""
    print("\nTesting non-streaming request...")
    
    payload = {
        "model": MODEL_NAME,
        "messages": [{"role": "user", "content": "Say hello"}],
        "temperature": 0.7,
        "max_tokens": 50,
        "stream": False
    }
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(API_URL, headers=HEADERS, json=payload) as response:
                print(f"Status: {response.status}")
                print(f"Headers: {dict(response.headers)}")
                
                if response.status == 200:
                    response_data = await response.json()
                    print(f"Response: {json.dumps(response_data, indent=2)}")
                else:
                    error_text = await response.text()
                    print(f"Error: {error_text}")
                    
    except Exception as e:
        print(f"Exception: {e}")

async def test_health():
    """Test health endpoint"""
    print("Testing health endpoint...")
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get("http://10.1.10.241:8084/health") as response:
                print(f"Health Status: {response.status}")
                health_data = await response.json()
                print(f"Health Response: {health_data}")
                
    except Exception as e:
        print(f"Health Exception: {e}")

async def test_models():
    """Test models endpoint"""
    print("\nTesting models endpoint...")
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get("http://10.1.10.241:8084/v1/models", headers=HEADERS) as response:
                print(f"Models Status: {response.status}")
                models_data = await response.json()
                print(f"Models Response: {json.dumps(models_data, indent=2)}")
                
    except Exception as e:
        print(f"Models Exception: {e}")

async def main():
    """Main function"""
    print("=" * 50)
    print("API DEBUG SCRIPT")
    print("=" * 50)
    
    await test_health()
    await test_models()
    await test_streaming_request()
    await test_non_streaming_request()

if __name__ == "__main__":
    asyncio.run(main())
