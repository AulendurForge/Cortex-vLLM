#!/usr/bin/env python3
"""
Test script to validate offline model paths and container startup.
Usage: python3 scripts/test_offline_models.py [model_id] [model_id2] ...
"""

import sys
import os
import requests
import json
import time
import signal
from typing import List, Dict, Optional
from requests.adapters import HTTPAdapter
from requests.packages.urllib3.util.retry import Retry

# Add parent directory to path for imports if needed
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# Configuration
GATEWAY_URL = os.environ.get("CORTEX_GATEWAY_URL", "http://localhost:8084")
ADMIN_USER = os.environ.get("ADMIN_USER", "admin")
ADMIN_PASS = os.environ.get("ADMIN_PASS", "admin")

# Colors
class Colors:
    RED = '\033[0;31m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    BLUE = '\033[0;34m'
    NC = '\033[0m'  # No Color

class CortexTester:
    def __init__(self, gateway_url: str, username: str, password: str, timeout: int = 300):
        self.gateway_url = gateway_url.rstrip('/')
        self.timeout = timeout  # Default 5 minutes for model startup
        self.session = requests.Session()
        
        # Configure retries and timeouts
        retry_strategy = Retry(
            total=3,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)
        
        self.login(username, password)
    
    def login(self, username: str, password: str) -> bool:
        """Login and establish session."""
        print(f"{Colors.YELLOW}Logging in as {username}...{Colors.NC}")
        try:
            resp = self.session.post(
                f"{self.gateway_url}/auth/login",
                json={"username": username, "password": password}
            )
            if resp.status_code == 200 and resp.json().get("status") == "ok":
                print(f"{Colors.GREEN}✓ Login successful{Colors.NC}\n")
                return True
            else:
                print(f"{Colors.RED}✗ Login failed: {resp.text}{Colors.NC}\n")
                return False
        except Exception as e:
            print(f"{Colors.RED}✗ Login error: {e}{Colors.NC}\n")
            return False
    
    def get_model(self, model_id: int) -> Optional[Dict]:
        """Get model details by filtering the list."""
        try:
            resp = self.session.get(
                f"{self.gateway_url}/admin/models",
                timeout=10
            )
            if resp.status_code == 200:
                models = resp.json()
                # Find model by ID
                for model in models:
                    if model.get("id") == model_id:
                        return model
                return None
            return None
        except requests.exceptions.Timeout:
            print(f"{Colors.RED}Timeout fetching model {model_id}{Colors.NC}")
            return None
        except Exception as e:
            print(f"{Colors.RED}Error fetching model {model_id}: {e}{Colors.NC}")
            return None
    
    def list_models(self) -> List[Dict]:
        """List all models."""
        try:
            resp = self.session.get(f"{self.gateway_url}/admin/models")
            if resp.status_code == 200:
                return resp.json()
            return []
        except Exception as e:
            print(f"{Colors.RED}Error listing models: {e}{Colors.NC}")
            return []
    
    def start_model(self, model_id: int) -> Dict:
        """Start a model."""
        try:
            # Start request should complete quickly (just creates container)
            resp = self.session.post(
                f"{self.gateway_url}/admin/models/{model_id}/start",
                timeout=30  # 30 seconds for container creation
            )
            return {
                "status_code": resp.status_code,
                "data": resp.json() if resp.status_code < 500 else {"detail": resp.text}
            }
        except requests.exceptions.Timeout:
            return {
                "status_code": 504,
                "data": {"error": "Request timeout - container creation took too long"}
            }
        except Exception as e:
            return {"status_code": 500, "data": {"error": str(e)}}
    
    def stop_model(self, model_id: int) -> bool:
        """Stop a model."""
        try:
            resp = self.session.post(f"{self.gateway_url}/admin/models/{model_id}/stop")
            return resp.status_code == 200
        except Exception:
            return False
    
    def get_logs(self, model_id: int, diagnose: bool = True) -> Dict:
        """Get model container logs."""
        try:
            url = f"{self.gateway_url}/admin/models/{model_id}/logs"
            if diagnose:
                url += "?diagnose=true"
            resp = self.session.get(url, timeout=30)
            if resp.status_code == 200:
                if diagnose:
                    return resp.json()
                else:
                    return {"logs": resp.text}
            return {}
        except requests.exceptions.Timeout:
            return {"error": "Timeout fetching logs"}
        except Exception as e:
            return {"error": str(e)}
    
    def check_readiness(self, model_id: int) -> Dict:
        """Check model readiness."""
        try:
            resp = self.session.get(
                f"{self.gateway_url}/admin/models/{model_id}/readiness",
                timeout=10
            )
            if resp.status_code == 200:
                return resp.json()
            return {}
        except requests.exceptions.Timeout:
            return {"error": "Timeout checking readiness"}
        except Exception as e:
            return {"error": str(e)}
    
    def test_model(self, model_id: int) -> bool:
        """Test a single model's path validation and startup."""
        print(f"{Colors.BLUE}--- Testing Model ID: {model_id} ---{Colors.NC}")
        
        # Get model details
        model = self.get_model(model_id)
        if not model:
            print(f"{Colors.RED}✗ Failed to fetch model{Colors.NC}\n")
            return False
        
        model_name = model.get("name", "Unknown")
        local_path = model.get("local_path")
        engine_type = model.get("engine_type", "vllm")
        state = model.get("state", "unknown")
        
        print(f"  Name: {model_name}")
        print(f"  Local Path: {local_path or '<none>'}")
        print(f"  Engine: {engine_type}")
        print(f"  Current State: {state}")
        
        # Skip if no local_path (online model)
        if not local_path:
            print(f"{Colors.YELLOW}  ⚠ Model has no local_path (online model) - skipping{Colors.NC}\n")
            return True
        
        # Test 1: Attempt to start (triggers path validation)
        print(f"\n{Colors.YELLOW}Test 1: Attempting to start model (path validation)...{Colors.NC}")
        
        # Stop if running
        if state == "running":
            print("  Stopping model first...")
            self.stop_model(model_id)
            time.sleep(2)
        
        # Attempt start
        start_result = self.start_model(model_id)
        
        if start_result["status_code"] == 200:
            result_data = start_result["data"]
            if result_data.get("status") == "running":
                print(f"{Colors.GREEN}  ✓ Model started successfully{Colors.NC}")
                
                # Wait and verify still running (with timeout)
                print(f"{Colors.YELLOW}  Waiting for model to initialize (max {self.timeout}s)...{Colors.NC}")
                max_wait = self.timeout
                wait_interval = 5
                waited = 0
                new_state = "unknown"
                
                while waited < max_wait:
                    time.sleep(wait_interval)
                    waited += wait_interval
                    model = self.get_model(model_id)
                    if model:
                        new_state = model.get("state", "unknown")
                        if new_state == "running":
                            print(f"{Colors.GREEN}  ✓ Model is running (verified after {waited}s){Colors.NC}")
                            break
                        elif new_state == "failed":
                            print(f"{Colors.RED}  ✗ Model failed during initialization{Colors.NC}")
                            break
                    if waited % 30 == 0:  # Print progress every 30 seconds
                        print(f"    Still waiting... ({waited}s/{max_wait}s)")
                
                if waited >= max_wait and new_state != "running":
                    print(f"{Colors.YELLOW}  ⚠ Timeout waiting for model initialization{Colors.NC}")
                
                if new_state == "running":
                    print(f"{Colors.GREEN}  ✓ Model is running (verified){Colors.NC}")
                    
                    # Test 2: Check logs
                    print(f"\n{Colors.YELLOW}Test 2: Checking container logs...{Colors.NC}")
                    logs_data = self.get_logs(model_id, diagnose=True)
                    
                    if "logs" in logs_data:
                        log_content = logs_data.get("logs", "")
                        if any(keyword in log_content.lower() for keyword in ["error", "failed", "exception"]):
                            print(f"{Colors.RED}  ✗ Logs contain errors:{Colors.NC}")
                            error_lines = [line for line in log_content.split('\n') 
                                         if any(kw in line.lower() for kw in ["error", "failed", "exception"])]
                            for line in error_lines[:5]:
                                print(f"    {line}")
                        else:
                            print(f"{Colors.GREEN}  ✓ No errors in logs{Colors.NC}")
                    
                    # Check diagnosis if available
                    if "diagnosis" in logs_data and logs_data["diagnosis"]:
                        diag = logs_data["diagnosis"]
                        if diag.get("detected"):
                            print(f"{Colors.YELLOW}  ⚠ Diagnosis: {diag.get('title', 'Unknown issue')}{Colors.NC}")
                    
                    # Test 3: Check readiness
                    print(f"\n{Colors.YELLOW}Test 3: Checking model readiness...{Colors.NC}")
                    readiness = self.check_readiness(model_id)
                    readiness_status = readiness.get("status", "unknown")
                    
                    if readiness_status == "ready":
                        print(f"{Colors.GREEN}  ✓ Model is ready to serve requests{Colors.NC}")
                    else:
                        print(f"{Colors.YELLOW}  ⚠ Model readiness: {readiness_status}{Colors.NC}")
                        if readiness.get("detail"):
                            print(f"    Detail: {readiness['detail']}")
                    
                    # Stop model
                    print(f"\n{Colors.YELLOW}Stopping model...{Colors.NC}")
                    if self.stop_model(model_id):
                        print(f"{Colors.GREEN}  ✓ Model stopped{Colors.NC}")
                    
                    print()
                    return True
                else:
                    print(f"{Colors.RED}  ✗ Model failed after start (state: {new_state}){Colors.NC}")
                    logs_data = self.get_logs(model_id, diagnose=True)
                    if "logs" in logs_data:
                        print(f"\n{Colors.YELLOW}Container logs (last 20 lines):{Colors.NC}")
                        log_lines = logs_data["logs"].split('\n')
                        for line in log_lines[-20:]:
                            print(f"  {line}")
                    print()
                    return False
            
            elif result_data.get("status") == "failed":
                print(f"{Colors.RED}  ✗ Model start failed{Colors.NC}")
                if "error" in result_data:
                    print(f"    Error: {result_data['error']}")
                print()
                return False
        
        elif start_result["status_code"] == 400:
            # Path validation error
            detail = start_result["data"].get("detail", "")
            print(f"{Colors.RED}  ✗ Path validation failed:{Colors.NC}")
            print(f"    {detail}")
            print(f"\n{Colors.YELLOW}  This indicates the model path does not exist or is invalid.{Colors.NC}")
            print(f"{Colors.YELLOW}  Check:{Colors.NC}")
            print(f"    - Path exists in models directory")
            print(f"    - CORTEX_MODELS_DIR configuration")
            print(f"    - Model files are in expected location")
            print()
            return False
        
        else:
            # Other error
            detail = start_result["data"].get("detail", start_result["data"].get("error", "Unknown error"))
            print(f"{Colors.RED}  ✗ Start failed (HTTP {start_result['status_code']}):{Colors.NC}")
            print(f"    {detail}")
            
            # Get logs for diagnosis
            logs_data = self.get_logs(model_id, diagnose=True)
            if "diagnosis" in logs_data and logs_data["diagnosis"]:
                diag = logs_data["diagnosis"]
                print(f"\n{Colors.YELLOW}Diagnosis:{Colors.NC}")
                print(f"  Title: {diag.get('title', 'Unknown')}")
                print(f"  Message: {diag.get('message', '')}")
                if diag.get("fixes"):
                    print(f"  Suggested fixes:")
                    for fix in diag.get("fixes", []):
                        print(f"    - {fix}")
            print()
            return False
    
    def list_offline_models(self):
        """List all models with local_path."""
        print(f"{Colors.BLUE}--- Listing All Offline Models ---{Colors.NC}\n")
        
        models = self.list_models()
        offline_models = []
        
        for model in models:
            if model.get("local_path"):
                offline_models.append(model)
                print(f"  {Colors.GREEN}ID: {model['id']}{Colors.NC} - {model.get('name', 'Unknown')} ({model.get('local_path')})")
        
        print()
        return offline_models

def main():
    """Main test execution."""
    print(f"{Colors.BLUE}=== Cortex Offline Model Validation Test ==={Colors.NC}\n")
    
    tester = CortexTester(GATEWAY_URL, ADMIN_USER, ADMIN_PASS)
    
    # Get model IDs from command line or list all
    if len(sys.argv) > 1:
        model_ids = [int(arg) for arg in sys.argv[1:]]
        results = []
        for model_id in model_ids:
            success = tester.test_model(model_id)
            results.append((model_id, success))
        
        # Summary
        print(f"{Colors.BLUE}=== Test Summary ==={Colors.NC}")
        for model_id, success in results:
            status = f"{Colors.GREEN}PASS{Colors.NC}" if success else f"{Colors.RED}FAIL{Colors.NC}"
            print(f"  Model {model_id}: {status}")
        
        # Exit code
        all_passed = all(success for _, success in results)
        sys.exit(0 if all_passed else 1)
    else:
        # List models
        offline_models = tester.list_offline_models()
        if offline_models:
            print(f"{Colors.YELLOW}No model IDs provided.{Colors.NC}")
            print(f"Usage: {sys.argv[0]} [model_id] [model_id2] ...")
            print(f"\nExample: {sys.argv[0]} {' '.join(str(m['id']) for m in offline_models[:3])}")
        else:
            print(f"{Colors.YELLOW}No offline models found.{Colors.NC}")

if __name__ == "__main__":
    main()

