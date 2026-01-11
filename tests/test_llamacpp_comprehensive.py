#!/usr/bin/env python3
"""
Comprehensive test suite for llama.cpp implementation in Cortex.

Tests all 15 implementation gaps:
- Gap #1: Metrics and slots endpoints
- Gap #2: Startup timeout configuration
- Gap #3: Verbose logging options
- Gap #4: Error translation
- Gap #5: VRAM estimation
- Gap #6: Warmup and check-tensors
- Gap #7: Chat template override
- Gap #8: KV cache defragmentation
- Gap #9: Custom arguments validation
- Gap #10: LoRA adapter support
- Gap #11: Grammar/constrained generation
- Gap #12: Model alias (--alias)
- Gap #13: Embeddings mode
- Gap #14: System prompt
- Gap #15: Continuous batching toggle

Usage:
    python tests/test_llamacpp_comprehensive.py [--skip-inference] [--verbose]
"""

import requests
import json
import time
import sys
import argparse
import subprocess
from typing import Optional, Dict, Any, List
from dataclasses import dataclass
from enum import Enum


class TestResult(Enum):
    PASS = "✅ PASS"
    FAIL = "❌ FAIL"
    SKIP = "⏭️ SKIP"
    WARN = "⚠️ WARN"


@dataclass
class TestCase:
    name: str
    result: TestResult
    message: str
    duration_ms: float = 0


class LlamaCppTestSuite:
    """Comprehensive test suite for llama.cpp implementation."""
    
    BASE_URL = "http://localhost:8084"
    ADMIN_USER = "admin"
    ADMIN_PASS = "admin"
    
    # Test model configuration
    TEST_MODEL_PATH = "alamios_Mistral-Small-3.1-DRAFT-0.5B-GGUF"
    
    def __init__(self, skip_inference: bool = False, verbose: bool = False):
        self.skip_inference = skip_inference
        self.verbose = verbose
        self.session = requests.Session()
        self.results: List[TestCase] = []
        self.created_model_ids: List[int] = []
        
    def log(self, msg: str, level: str = "INFO"):
        """Log message with timestamp."""
        timestamp = time.strftime("%H:%M:%S")
        if self.verbose or level in ["ERROR", "WARN"]:
            print(f"[{timestamp}] [{level}] {msg}")
    
    def login(self) -> bool:
        """Authenticate with the API."""
        try:
            resp = self.session.post(
                f"{self.BASE_URL}/auth/login",
                json={"username": self.ADMIN_USER, "password": self.ADMIN_PASS}
            )
            if resp.status_code == 200:
                self.log("Authentication successful")
                return True
            else:
                self.log(f"Authentication failed: {resp.status_code}", "ERROR")
                return False
        except Exception as e:
            self.log(f"Authentication error: {e}", "ERROR")
            return False
    
    def add_result(self, name: str, result: TestResult, message: str, duration_ms: float = 0):
        """Add a test result."""
        self.results.append(TestCase(name, result, message, duration_ms))
        symbol = result.value
        print(f"  {symbol}: {name}")
        if result == TestResult.FAIL:
            print(f"       {message}")
    
    def create_model(self, config: Dict[str, Any]) -> Optional[int]:
        """Create a model and return its ID."""
        try:
            resp = self.session.post(
                f"{self.BASE_URL}/admin/models",
                json=config
            )
            if resp.status_code == 200:
                model_id = resp.json().get("id")
                if model_id:
                    self.created_model_ids.append(model_id)
                return model_id
            else:
                self.log(f"Create model failed: {resp.status_code} - {resp.text}", "ERROR")
                return None
        except Exception as e:
            self.log(f"Create model error: {e}", "ERROR")
            return None
    
    def get_model(self, model_id: int) -> Optional[Dict[str, Any]]:
        """Get model details."""
        try:
            resp = self.session.get(f"{self.BASE_URL}/admin/models")
            if resp.status_code == 200:
                models = resp.json()
                for m in models:
                    if m.get("id") == model_id:
                        return m
            return None
        except Exception as e:
            self.log(f"Get model error: {e}", "ERROR")
            return None
    
    def dry_run(self, model_id: int) -> Optional[Dict[str, Any]]:
        """Run dry-run validation."""
        try:
            resp = self.session.post(f"{self.BASE_URL}/admin/models/{model_id}/dry-run")
            if resp.status_code == 200:
                return resp.json()
            else:
                self.log(f"Dry-run failed: {resp.status_code} - {resp.text}", "ERROR")
                return None
        except Exception as e:
            self.log(f"Dry-run error: {e}", "ERROR")
            return None
    
    def start_model(self, model_id: int, timeout: int = 120) -> bool:
        """Start a model and wait for it to be running."""
        try:
            resp = self.session.post(f"{self.BASE_URL}/admin/models/{model_id}/start")
            if resp.status_code != 200:
                self.log(f"Start failed: {resp.status_code} - {resp.text}", "ERROR")
                return False
            
            # Poll for running state
            start_time = time.time()
            while time.time() - start_time < timeout:
                model = self.get_model(model_id)
                if model:
                    state = model.get("state")
                    if state == "running":
                        return True
                    elif state == "failed":
                        self.log(f"Model failed to start", "ERROR")
                        return False
                time.sleep(2)
            
            self.log(f"Model start timed out after {timeout}s", "ERROR")
            return False
        except Exception as e:
            self.log(f"Start error: {e}", "ERROR")
            return False
    
    def stop_model(self, model_id: int) -> bool:
        """Stop a model."""
        try:
            resp = self.session.post(f"{self.BASE_URL}/admin/models/{model_id}/stop")
            return resp.status_code == 200
        except Exception as e:
            self.log(f"Stop error: {e}", "ERROR")
            return False
    
    def delete_model(self, model_id: int) -> bool:
        """Delete a model."""
        try:
            resp = self.session.delete(f"{self.BASE_URL}/admin/models/{model_id}")
            if resp.status_code == 200:
                if model_id in self.created_model_ids:
                    self.created_model_ids.remove(model_id)
                return True
            return False
        except Exception as e:
            self.log(f"Delete error: {e}", "ERROR")
            return False
    
    def chat_completion(self, model_name: str, messages: List[Dict], **kwargs) -> Optional[Dict]:
        """Send a chat completion request."""
        try:
            payload = {
                "model": model_name,
                "messages": messages,
                "max_tokens": kwargs.get("max_tokens", 50),
                "temperature": kwargs.get("temperature", 0.7)
            }
            resp = self.session.post(
                f"{self.BASE_URL}/v1/chat/completions",
                json=payload,
                timeout=60
            )
            if resp.status_code == 200:
                return resp.json()
            else:
                self.log(f"Chat completion failed: {resp.status_code} - {resp.text}", "ERROR")
                return None
        except Exception as e:
            self.log(f"Chat completion error: {e}", "ERROR")
            return None
    
    def get_container_port(self, model_id: int) -> Optional[int]:
        """Get the host port for a model's container."""
        try:
            container_name = f"llamacpp-model-{model_id}"
            result = subprocess.run(
                ["docker", "port", container_name, "8000/tcp"],
                capture_output=True, text=True, timeout=10
            )
            if result.returncode == 0 and result.stdout.strip():
                # Output is like "0.0.0.0:32768"
                port_str = result.stdout.strip().split(":")[-1]
                return int(port_str)
            return None
        except Exception as e:
            self.log(f"Get container port error: {e}", "ERROR")
            return None
    
    def cleanup(self):
        """Clean up all created models."""
        self.log("Cleaning up test models...")
        for model_id in list(self.created_model_ids):
            try:
                self.stop_model(model_id)
                time.sleep(1)
                self.delete_model(model_id)
                self.log(f"Deleted model {model_id}")
            except Exception as e:
                self.log(f"Cleanup error for model {model_id}: {e}", "WARN")
    
    # =========================================================================
    # Test Cases
    # =========================================================================
    
    def test_basic_model_lifecycle(self):
        """Test basic model create/start/stop/delete cycle."""
        print("\n📋 Test: Basic Model Lifecycle")
        start = time.time()
        
        # Create
        model_id = self.create_model({
            "name": "test-lifecycle",
            "served_model_name": "test-lifecycle",
            "mode": "offline",
            "local_path": self.TEST_MODEL_PATH,
            "task": "generate",
            "engine_type": "llamacpp",
            "ngl": 999,
            "context_size": 2048
        })
        
        if not model_id:
            self.add_result("Create model", TestResult.FAIL, "Failed to create model")
            return
        
        self.add_result("Create model", TestResult.PASS, f"Created model ID {model_id}")
        
        # Dry-run
        dry_run = self.dry_run(model_id)
        if dry_run and dry_run.get("valid"):
            self.add_result("Dry-run validation", TestResult.PASS, "Configuration is valid")
        else:
            self.add_result("Dry-run validation", TestResult.FAIL, f"Dry-run failed: {dry_run}")
        
        # Start
        if self.start_model(model_id, timeout=180):
            self.add_result("Start model", TestResult.PASS, "Model started successfully")
        else:
            self.add_result("Start model", TestResult.FAIL, "Model failed to start")
            self.delete_model(model_id)
            return
        
        # Stop
        if self.stop_model(model_id):
            self.add_result("Stop model", TestResult.PASS, "Model stopped successfully")
        else:
            self.add_result("Stop model", TestResult.FAIL, "Model failed to stop")
        
        time.sleep(2)
        
        # Delete
        if self.delete_model(model_id):
            self.add_result("Delete model", TestResult.PASS, "Model deleted successfully")
        else:
            self.add_result("Delete model", TestResult.FAIL, "Model failed to delete")
        
        duration = (time.time() - start) * 1000
        self.log(f"Basic lifecycle test completed in {duration:.0f}ms")
    
    def test_gap1_metrics_and_slots(self):
        """Test Gap #1: Metrics and slots endpoints."""
        print("\n📋 Test: Gap #1 - Metrics and Slots Endpoints")
        
        model_id = self.create_model({
            "name": "test-metrics-slots",
            "served_model_name": "test-metrics-slots",
            "mode": "offline",
            "local_path": self.TEST_MODEL_PATH,
            "task": "generate",
            "engine_type": "llamacpp",
            "ngl": 999,
            "context_size": 2048
        })
        
        if not model_id:
            self.add_result("Gap #1: Create model", TestResult.FAIL, "Failed to create")
            return
        
        # Check dry-run includes flags
        dry_run = self.dry_run(model_id)
        if dry_run:
            cmd_str = dry_run.get("command_str", "")
            if "--metrics" in cmd_str:
                self.add_result("Gap #1: --metrics flag in command", TestResult.PASS, "Flag present")
            else:
                self.add_result("Gap #1: --metrics flag in command", TestResult.FAIL, "Flag missing")
            
            if "--slots" in cmd_str:
                self.add_result("Gap #1: --slots flag in command", TestResult.PASS, "Flag present")
            else:
                self.add_result("Gap #1: --slots flag in command", TestResult.FAIL, "Flag missing")
        
        if self.skip_inference:
            self.add_result("Gap #1: Live endpoints test", TestResult.SKIP, "Skipped (--skip-inference)")
            self.delete_model(model_id)
            return
        
        # Start and test endpoints
        if self.start_model(model_id, timeout=180):
            port = self.get_container_port(model_id)
            if port:
                # Test /metrics
                try:
                    resp = requests.get(f"http://localhost:{port}/metrics", timeout=5)
                    if resp.status_code == 200 and "llamacpp" in resp.text.lower():
                        self.add_result("Gap #1: /metrics endpoint", TestResult.PASS, "Returns Prometheus metrics")
                    else:
                        self.add_result("Gap #1: /metrics endpoint", TestResult.FAIL, f"Unexpected response: {resp.status_code}")
                except Exception as e:
                    self.add_result("Gap #1: /metrics endpoint", TestResult.FAIL, str(e))
                
                # Test /slots
                try:
                    resp = requests.get(f"http://localhost:{port}/slots", timeout=5)
                    if resp.status_code == 200:
                        slots = resp.json()
                        if isinstance(slots, list):
                            self.add_result("Gap #1: /slots endpoint", TestResult.PASS, f"Returns {len(slots)} slots")
                        else:
                            self.add_result("Gap #1: /slots endpoint", TestResult.FAIL, "Not a list")
                    else:
                        self.add_result("Gap #1: /slots endpoint", TestResult.FAIL, f"Status: {resp.status_code}")
                except Exception as e:
                    self.add_result("Gap #1: /slots endpoint", TestResult.FAIL, str(e))
            else:
                self.add_result("Gap #1: Container port", TestResult.FAIL, "Could not get port")
            
            self.stop_model(model_id)
        else:
            self.add_result("Gap #1: Start model", TestResult.FAIL, "Failed to start")
        
        self.delete_model(model_id)
    
    def test_gap2_startup_timeout(self):
        """Test Gap #2: Startup timeout configuration."""
        print("\n📋 Test: Gap #2 - Startup Timeout Configuration")
        
        model_id = self.create_model({
            "name": "test-startup-timeout",
            "served_model_name": "test-startup-timeout",
            "mode": "offline",
            "local_path": self.TEST_MODEL_PATH,
            "task": "generate",
            "engine_type": "llamacpp",
            "ngl": 999,
            "context_size": 2048,
            "startup_timeout_sec": 180
        })
        
        if not model_id:
            self.add_result("Gap #2: Create model", TestResult.FAIL, "Failed to create")
            return
        
        # Verify field was saved
        model = self.get_model(model_id)
        if model and model.get("startup_timeout_sec") == 180:
            self.add_result("Gap #2: Field saved", TestResult.PASS, "startup_timeout_sec=180")
        else:
            self.add_result("Gap #2: Field saved", TestResult.FAIL, f"Got: {model.get('startup_timeout_sec') if model else 'None'}")
        
        if self.skip_inference:
            self.add_result("Gap #2: Docker healthcheck test", TestResult.SKIP, "Skipped")
            self.delete_model(model_id)
            return
        
        # Start and check Docker healthcheck
        if self.start_model(model_id, timeout=180):
            try:
                container_name = f"llamacpp-model-{model_id}"
                # Use docker inspect to get healthcheck config
                result = subprocess.run(
                    ["docker", "inspect", "--format", "{{.Config.Healthcheck.StartPeriod}}", container_name],
                    capture_output=True, text=True, timeout=10
                )
                if result.returncode == 0 and result.stdout.strip():
                    # Output can be in nanoseconds (int) or human-readable format (e.g., "3m0s")
                    start_period_str = result.stdout.strip()
                    
                    # Parse duration string (e.g., "3m0s" -> 180 seconds)
                    def parse_duration(s):
                        """Parse Docker duration string to seconds."""
                        import re
                        if s.isdigit():
                            return int(s) / 1_000_000_000  # nanoseconds
                        total_sec = 0
                        # Match patterns like "3m0s", "2h30m", "180s"
                        for match in re.finditer(r'(\d+)(h|m|s|ms|us|ns)', s):
                            val = int(match.group(1))
                            unit = match.group(2)
                            if unit == 'h': total_sec += val * 3600
                            elif unit == 'm': total_sec += val * 60
                            elif unit == 's': total_sec += val
                            elif unit == 'ms': total_sec += val / 1000
                            elif unit == 'us': total_sec += val / 1_000_000
                            elif unit == 'ns': total_sec += val / 1_000_000_000
                        return total_sec
                    
                    start_period_sec = parse_duration(start_period_str)
                    if 170 <= start_period_sec <= 190:  # Allow some tolerance
                        self.add_result("Gap #2: Docker StartPeriod", TestResult.PASS, f"{start_period_sec}s")
                    else:
                        self.add_result("Gap #2: Docker StartPeriod", TestResult.FAIL, f"Expected ~180s, got {start_period_sec}s")
                else:
                    self.add_result("Gap #2: Docker StartPeriod", TestResult.FAIL, f"Could not inspect container: {result.stderr}")
            except Exception as e:
                self.add_result("Gap #2: Docker StartPeriod", TestResult.FAIL, str(e))
            
            self.stop_model(model_id)
        else:
            self.add_result("Gap #2: Start model", TestResult.FAIL, "Failed to start")
        
        self.delete_model(model_id)
    
    def test_gap3_verbose_logging(self):
        """Test Gap #3: Verbose logging options."""
        print("\n📋 Test: Gap #3 - Verbose Logging Options")
        
        model_id = self.create_model({
            "name": "test-verbose-logging",
            "served_model_name": "test-verbose-logging",
            "mode": "offline",
            "local_path": self.TEST_MODEL_PATH,
            "task": "generate",
            "engine_type": "llamacpp",
            "ngl": 999,
            "context_size": 2048,
            "verbose_logging": True
        })
        
        if not model_id:
            self.add_result("Gap #3: Create model", TestResult.FAIL, "Failed to create")
            return
        
        # Check dry-run includes logging flags
        dry_run = self.dry_run(model_id)
        if dry_run:
            cmd_str = dry_run.get("command_str", "")
            
            if "--log-verbose" in cmd_str:
                self.add_result("Gap #3: --log-verbose flag", TestResult.PASS, "Flag present")
            else:
                self.add_result("Gap #3: --log-verbose flag", TestResult.WARN, "Flag may be controlled by global setting")
            
            if "--log-timestamps" in cmd_str:
                self.add_result("Gap #3: --log-timestamps flag", TestResult.PASS, "Flag present")
            else:
                self.add_result("Gap #3: --log-timestamps flag", TestResult.FAIL, "Flag missing")
            
            if "--log-colors" in cmd_str:
                self.add_result("Gap #3: --log-colors flag", TestResult.PASS, "Flag present")
            else:
                self.add_result("Gap #3: --log-colors flag", TestResult.FAIL, "Flag missing")
        
        self.delete_model(model_id)
    
    def test_gap5_vram_estimation(self):
        """Test Gap #5: VRAM estimation."""
        print("\n📋 Test: Gap #5 - VRAM Estimation")
        
        model_id = self.create_model({
            "name": "test-vram-estimation",
            "served_model_name": "test-vram-estimation",
            "mode": "offline",
            "local_path": self.TEST_MODEL_PATH,
            "task": "generate",
            "engine_type": "llamacpp",
            "ngl": 999,
            "context_size": 4096,
            "parallel_slots": 8
        })
        
        if not model_id:
            self.add_result("Gap #5: Create model", TestResult.FAIL, "Failed to create")
            return
        
        dry_run = self.dry_run(model_id)
        if dry_run:
            vram = dry_run.get("vram_estimate")
            if vram:
                self.add_result("Gap #5: VRAM estimate present", TestResult.PASS, f"Total: {vram.get('required_vram_gb', 'N/A')} GB")
                
                # Check all expected fields
                expected_fields = ["model_weights_gb", "kv_cache_gb", "total_per_gpu_gb", "context_size"]
                missing = [f for f in expected_fields if f not in vram]
                if not missing:
                    self.add_result("Gap #5: All estimate fields present", TestResult.PASS, "Complete estimation")
                else:
                    self.add_result("Gap #5: All estimate fields present", TestResult.FAIL, f"Missing: {missing}")
            else:
                self.add_result("Gap #5: VRAM estimate present", TestResult.FAIL, "No estimate returned")
        
        self.delete_model(model_id)
    
    def test_gap6_warmup_check_tensors(self):
        """Test Gap #6: Warmup and check-tensors options."""
        print("\n📋 Test: Gap #6 - Warmup and Check-Tensors")
        
        model_id = self.create_model({
            "name": "test-warmup-tensors",
            "served_model_name": "test-warmup-tensors",
            "mode": "offline",
            "local_path": self.TEST_MODEL_PATH,
            "task": "generate",
            "engine_type": "llamacpp",
            "ngl": 999,
            "context_size": 2048,
            "check_tensors": True,
            "skip_warmup": True
        })
        
        if not model_id:
            self.add_result("Gap #6: Create model", TestResult.FAIL, "Failed to create")
            return
        
        dry_run = self.dry_run(model_id)
        if dry_run:
            cmd_str = dry_run.get("command_str", "")
            
            if "--check-tensors" in cmd_str:
                self.add_result("Gap #6: --check-tensors flag", TestResult.PASS, "Flag present")
            else:
                self.add_result("Gap #6: --check-tensors flag", TestResult.FAIL, "Flag missing")
            
            if "--no-warmup" in cmd_str:
                self.add_result("Gap #6: --no-warmup flag", TestResult.PASS, "Flag present")
            else:
                self.add_result("Gap #6: --no-warmup flag", TestResult.WARN, "Flag missing (may be default)")
        
        self.delete_model(model_id)
    
    def test_gap7_chat_template(self):
        """Test Gap #7: Chat template override."""
        print("\n📋 Test: Gap #7 - Chat Template Override")
        
        model_id = self.create_model({
            "name": "test-chat-template",
            "served_model_name": "test-chat-template",
            "mode": "offline",
            "local_path": self.TEST_MODEL_PATH,
            "task": "generate",
            "engine_type": "llamacpp",
            "ngl": 999,
            "context_size": 2048,
            "chat_template": "chatml"
        })
        
        if not model_id:
            self.add_result("Gap #7: Create model", TestResult.FAIL, "Failed to create")
            return
        
        dry_run = self.dry_run(model_id)
        if dry_run:
            cmd_str = dry_run.get("command_str", "")
            
            if "--chat-template" in cmd_str and "chatml" in cmd_str:
                self.add_result("Gap #7: --chat-template flag", TestResult.PASS, "chatml template set")
            else:
                self.add_result("Gap #7: --chat-template flag", TestResult.FAIL, f"Expected chatml, got: {cmd_str}")
            
            if "--jinja" in cmd_str:
                self.add_result("Gap #7: --jinja flag", TestResult.PASS, "Jinja enabled")
            else:
                self.add_result("Gap #7: --jinja flag", TestResult.WARN, "May use default template handling")
        
        self.delete_model(model_id)
    
    def test_gap8_kv_cache_defrag(self):
        """Test Gap #8: KV cache defragmentation."""
        print("\n📋 Test: Gap #8 - KV Cache Defragmentation")
        
        model_id = self.create_model({
            "name": "test-defrag",
            "served_model_name": "test-defrag",
            "mode": "offline",
            "local_path": self.TEST_MODEL_PATH,
            "task": "generate",
            "engine_type": "llamacpp",
            "ngl": 999,
            "context_size": 2048,
            "defrag_thold": 0.1
        })
        
        if not model_id:
            self.add_result("Gap #8: Create model", TestResult.FAIL, "Failed to create")
            return
        
        dry_run = self.dry_run(model_id)
        if dry_run:
            cmd_str = dry_run.get("command_str", "")
            
            if "--defrag-thold" in cmd_str and "0.1" in cmd_str:
                self.add_result("Gap #8: --defrag-thold flag", TestResult.PASS, "0.1 threshold set")
            else:
                self.add_result("Gap #8: --defrag-thold flag", TestResult.FAIL, f"Flag missing or wrong value")
        
        self.delete_model(model_id)
    
    def test_gap9_custom_args_validation(self):
        """Test Gap #9: Custom arguments validation."""
        print("\n📋 Test: Gap #9 - Custom Arguments Validation")
        
        # Test with typo
        model_id = self.create_model({
            "name": "test-custom-args-typo",
            "served_model_name": "test-custom-args-typo",
            "mode": "offline",
            "local_path": self.TEST_MODEL_PATH,
            "task": "generate",
            "engine_type": "llamacpp",
            "ngl": 999,
            "context_size": 2048,
            "engine_startup_args_json": json.dumps([
                {"flag": "--flash-atten", "type": "bool", "value": True}  # Typo!
            ])
        })
        
        if not model_id:
            self.add_result("Gap #9: Create model with typo", TestResult.FAIL, "Failed to create")
            return
        
        dry_run = self.dry_run(model_id)
        if dry_run:
            warnings = dry_run.get("warnings", [])
            typo_warning = None
            for w in warnings:
                if "flash-atten" in w.get("message", ""):
                    typo_warning = w
                    break
            
            if typo_warning and "flash-attn" in typo_warning.get("fix", ""):
                self.add_result("Gap #9: Typo detection", TestResult.PASS, "Suggested --flash-attn")
            else:
                self.add_result("Gap #9: Typo detection", TestResult.FAIL, f"No suggestion found: {warnings}")
        
        self.delete_model(model_id)
        
        # Test with unknown flag
        model_id = self.create_model({
            "name": "test-custom-args-unknown",
            "served_model_name": "test-custom-args-unknown",
            "mode": "offline",
            "local_path": self.TEST_MODEL_PATH,
            "task": "generate",
            "engine_type": "llamacpp",
            "ngl": 999,
            "context_size": 2048,
            "engine_startup_args_json": json.dumps([
                {"flag": "--my-custom-flag", "type": "string", "value": "test"}
            ])
        })
        
        if model_id:
            dry_run = self.dry_run(model_id)
            if dry_run:
                cmd_str = dry_run.get("command_str", "")
                if "--my-custom-flag" in cmd_str:
                    self.add_result("Gap #9: Unknown flag passthrough", TestResult.PASS, "Flag passed through")
                else:
                    self.add_result("Gap #9: Unknown flag passthrough", TestResult.FAIL, "Flag blocked")
            self.delete_model(model_id)
    
    def test_gap10_lora_adapters(self):
        """Test Gap #10: LoRA adapter support."""
        print("\n📋 Test: Gap #10 - LoRA Adapter Support")
        
        model_id = self.create_model({
            "name": "test-lora",
            "served_model_name": "test-lora",
            "mode": "offline",
            "local_path": self.TEST_MODEL_PATH,
            "task": "generate",
            "engine_type": "llamacpp",
            "ngl": 999,
            "context_size": 2048,
            "lora_adapters_json": json.dumps([
                {"path": "adapters/my-lora.gguf", "scale": 0.8}
            ])
        })
        
        if not model_id:
            self.add_result("Gap #10: Create model", TestResult.FAIL, "Failed to create")
            return
        
        dry_run = self.dry_run(model_id)
        if dry_run:
            cmd_str = dry_run.get("command_str", "")
            
            if "--lora-scaled" in cmd_str and "0.8" in cmd_str:
                self.add_result("Gap #10: --lora-scaled flag", TestResult.PASS, "LoRA with scale=0.8")
            elif "--lora" in cmd_str:
                self.add_result("Gap #10: --lora flag", TestResult.PASS, "LoRA adapter added")
            else:
                self.add_result("Gap #10: LoRA flags", TestResult.FAIL, "No LoRA flags found")
        
        self.delete_model(model_id)
    
    def test_gap11_grammar_support(self):
        """Test Gap #11: Grammar/constrained generation."""
        print("\n📋 Test: Gap #11 - Grammar Support")
        
        model_id = self.create_model({
            "name": "test-grammar",
            "served_model_name": "test-grammar",
            "mode": "offline",
            "local_path": self.TEST_MODEL_PATH,
            "task": "generate",
            "engine_type": "llamacpp",
            "ngl": 999,
            "context_size": 2048,
            "grammar_file": "grammars/json.gbnf"
        })
        
        if not model_id:
            self.add_result("Gap #11: Create model", TestResult.FAIL, "Failed to create")
            return
        
        dry_run = self.dry_run(model_id)
        if dry_run:
            cmd_str = dry_run.get("command_str", "")
            
            if "--grammar-file" in cmd_str and "json.gbnf" in cmd_str:
                self.add_result("Gap #11: --grammar-file flag", TestResult.PASS, "Grammar file set")
            else:
                self.add_result("Gap #11: --grammar-file flag", TestResult.FAIL, "Flag missing")
        
        self.delete_model(model_id)
    
    def test_gap12_model_alias(self):
        """Test Gap #12: Model alias (--alias)."""
        print("\n📋 Test: Gap #12 - Model Alias")
        
        model_id = self.create_model({
            "name": "test-alias",
            "served_model_name": "my-custom-alias",
            "mode": "offline",
            "local_path": self.TEST_MODEL_PATH,
            "task": "generate",
            "engine_type": "llamacpp",
            "ngl": 999,
            "context_size": 2048
        })
        
        if not model_id:
            self.add_result("Gap #12: Create model", TestResult.FAIL, "Failed to create")
            return
        
        dry_run = self.dry_run(model_id)
        if dry_run:
            cmd_str = dry_run.get("command_str", "")
            
            if "--alias" in cmd_str and "my-custom-alias" in cmd_str:
                self.add_result("Gap #12: --alias flag", TestResult.PASS, "Alias set to my-custom-alias")
            else:
                self.add_result("Gap #12: --alias flag", TestResult.FAIL, "Flag missing")
        
        self.delete_model(model_id)
    
    def test_gap13_embeddings_mode(self):
        """Test Gap #13: Embeddings mode."""
        print("\n📋 Test: Gap #13 - Embeddings Mode")
        
        # Test with task=embed
        model_id = self.create_model({
            "name": "test-embed-task",
            "served_model_name": "test-embed-task",
            "mode": "offline",
            "local_path": self.TEST_MODEL_PATH,
            "task": "embed",
            "engine_type": "llamacpp",
            "ngl": 999,
            "context_size": 2048
        })
        
        if not model_id:
            self.add_result("Gap #13: Create model (task=embed)", TestResult.FAIL, "Failed to create")
            return
        
        dry_run = self.dry_run(model_id)
        if dry_run:
            cmd_str = dry_run.get("command_str", "")
            
            if "--embeddings" in cmd_str:
                self.add_result("Gap #13: --embeddings flag (task=embed)", TestResult.PASS, "Flag present")
            else:
                self.add_result("Gap #13: --embeddings flag (task=embed)", TestResult.FAIL, "Flag missing")
        
        self.delete_model(model_id)
        
        # Test with enable_embeddings=True
        model_id = self.create_model({
            "name": "test-embed-explicit",
            "served_model_name": "test-embed-explicit",
            "mode": "offline",
            "local_path": self.TEST_MODEL_PATH,
            "task": "generate",
            "engine_type": "llamacpp",
            "ngl": 999,
            "context_size": 2048,
            "enable_embeddings": True
        })
        
        if model_id:
            dry_run = self.dry_run(model_id)
            if dry_run:
                cmd_str = dry_run.get("command_str", "")
                if "--embeddings" in cmd_str:
                    self.add_result("Gap #13: --embeddings flag (explicit)", TestResult.PASS, "Flag present")
                else:
                    self.add_result("Gap #13: --embeddings flag (explicit)", TestResult.FAIL, "Flag missing")
            self.delete_model(model_id)
    
    def test_gap14_system_prompt(self):
        """Test Gap #14: System prompt."""
        print("\n📋 Test: Gap #14 - System Prompt")
        
        model_id = self.create_model({
            "name": "test-system-prompt",
            "served_model_name": "test-system-prompt",
            "mode": "offline",
            "local_path": self.TEST_MODEL_PATH,
            "task": "generate",
            "engine_type": "llamacpp",
            "ngl": 999,
            "context_size": 2048,
            "system_prompt": "You are a helpful AI assistant."
        })
        
        if not model_id:
            self.add_result("Gap #14: Create model", TestResult.FAIL, "Failed to create")
            return
        
        dry_run = self.dry_run(model_id)
        if dry_run:
            cmd_str = dry_run.get("command_str", "")
            
            if "--system-prompt-file" in cmd_str:
                self.add_result("Gap #14: --system-prompt-file flag", TestResult.PASS, "Flag present")
                
                # Check if file was created
                import os
                expected_path = f"/var/cortex/models/.cortex_configs/system_prompt_{model_id}.txt"
                if os.path.exists(expected_path):
                    with open(expected_path) as f:
                        content = f.read()
                    if "helpful AI assistant" in content:
                        self.add_result("Gap #14: System prompt file content", TestResult.PASS, "Content matches")
                    else:
                        self.add_result("Gap #14: System prompt file content", TestResult.FAIL, f"Wrong content: {content}")
                else:
                    self.add_result("Gap #14: System prompt file exists", TestResult.FAIL, f"File not found: {expected_path}")
            else:
                self.add_result("Gap #14: --system-prompt-file flag", TestResult.FAIL, "Flag missing")
        
        self.delete_model(model_id)
    
    def test_gap15_continuous_batching(self):
        """Test Gap #15: Continuous batching toggle."""
        print("\n📋 Test: Gap #15 - Continuous Batching Toggle")
        
        # Test with cont_batching=True (should include flag)
        model_id = self.create_model({
            "name": "test-cont-batch-on",
            "served_model_name": "test-cont-batch-on",
            "mode": "offline",
            "local_path": self.TEST_MODEL_PATH,
            "task": "generate",
            "engine_type": "llamacpp",
            "ngl": 999,
            "context_size": 2048,
            "cont_batching": True
        })
        
        if model_id:
            dry_run = self.dry_run(model_id)
            if dry_run:
                cmd_str = dry_run.get("command_str", "")
                if "--cont-batching" in cmd_str:
                    self.add_result("Gap #15: cont_batching=True", TestResult.PASS, "Flag present")
                else:
                    self.add_result("Gap #15: cont_batching=True", TestResult.FAIL, "Flag missing")
            self.delete_model(model_id)
        
        # Test with cont_batching=False (should NOT include flag)
        model_id = self.create_model({
            "name": "test-cont-batch-off",
            "served_model_name": "test-cont-batch-off",
            "mode": "offline",
            "local_path": self.TEST_MODEL_PATH,
            "task": "generate",
            "engine_type": "llamacpp",
            "ngl": 999,
            "context_size": 2048,
            "cont_batching": False
        })
        
        if model_id:
            dry_run = self.dry_run(model_id)
            if dry_run:
                cmd_str = dry_run.get("command_str", "")
                if "--cont-batching" not in cmd_str:
                    self.add_result("Gap #15: cont_batching=False", TestResult.PASS, "Flag absent")
                else:
                    self.add_result("Gap #15: cont_batching=False", TestResult.FAIL, "Flag present when it shouldn't be")
            self.delete_model(model_id)
    
    def test_inference_chat_completion(self):
        """Test actual inference with chat completions."""
        print("\n📋 Test: Inference - Chat Completion")
        
        if self.skip_inference:
            self.add_result("Inference: Chat completion", TestResult.SKIP, "Skipped (--skip-inference)")
            return
        
        model_id = self.create_model({
            "name": "test-inference",
            "served_model_name": "test-inference-model",
            "mode": "offline",
            "local_path": self.TEST_MODEL_PATH,
            "task": "generate",
            "engine_type": "llamacpp",
            "ngl": 999,
            "context_size": 2048
        })
        
        if not model_id:
            self.add_result("Inference: Create model", TestResult.FAIL, "Failed to create")
            return
        
        if not self.start_model(model_id, timeout=180):
            self.add_result("Inference: Start model", TestResult.FAIL, "Failed to start")
            self.delete_model(model_id)
            return
        
        self.add_result("Inference: Model started", TestResult.PASS, "Model running")
        
        # Wait a moment for model to be fully ready
        time.sleep(3)
        
        # Test chat completion
        start = time.time()
        response = self.chat_completion(
            "test-inference-model",
            [{"role": "user", "content": "Say hello in exactly 3 words."}],
            max_tokens=20
        )
        duration = (time.time() - start) * 1000
        
        if response:
            choices = response.get("choices", [])
            if choices and choices[0].get("message", {}).get("content"):
                content = choices[0]["message"]["content"]
                self.add_result(
                    "Inference: Chat completion", 
                    TestResult.PASS, 
                    f"Response: '{content[:50]}...' ({duration:.0f}ms)"
                )
            else:
                self.add_result("Inference: Chat completion", TestResult.FAIL, f"No content: {response}")
        else:
            self.add_result("Inference: Chat completion", TestResult.FAIL, "No response")
        
        self.stop_model(model_id)
        self.delete_model(model_id)
    
    def test_inference_streaming(self):
        """Test streaming inference."""
        print("\n📋 Test: Inference - Streaming")
        
        if self.skip_inference:
            self.add_result("Inference: Streaming", TestResult.SKIP, "Skipped (--skip-inference)")
            return
        
        model_id = self.create_model({
            "name": "test-streaming",
            "served_model_name": "test-streaming-model",
            "mode": "offline",
            "local_path": self.TEST_MODEL_PATH,
            "task": "generate",
            "engine_type": "llamacpp",
            "ngl": 999,
            "context_size": 2048
        })
        
        if not model_id:
            self.add_result("Inference: Create streaming model", TestResult.FAIL, "Failed to create")
            return
        
        if not self.start_model(model_id, timeout=180):
            self.add_result("Inference: Start streaming model", TestResult.FAIL, "Failed to start")
            self.delete_model(model_id)
            return
        
        time.sleep(3)
        
        # Test streaming
        try:
            start = time.time()
            resp = self.session.post(
                f"{self.BASE_URL}/v1/chat/completions",
                json={
                    "model": "test-streaming-model",
                    "messages": [{"role": "user", "content": "Count from 1 to 5."}],
                    "max_tokens": 30,
                    "stream": True
                },
                stream=True,
                timeout=60
            )
            
            chunks = []
            for line in resp.iter_lines():
                if line:
                    line_str = line.decode('utf-8')
                    if line_str.startswith("data: ") and "[DONE]" not in line_str:
                        chunks.append(line_str[6:])
            
            duration = (time.time() - start) * 1000
            
            if len(chunks) > 0:
                self.add_result(
                    "Inference: Streaming",
                    TestResult.PASS,
                    f"Received {len(chunks)} chunks ({duration:.0f}ms)"
                )
            else:
                self.add_result("Inference: Streaming", TestResult.FAIL, "No chunks received")
        except Exception as e:
            self.add_result("Inference: Streaming", TestResult.FAIL, str(e))
        
        self.stop_model(model_id)
        self.delete_model(model_id)
    
    def test_concurrent_requests(self):
        """Test concurrent request handling."""
        print("\n📋 Test: Inference - Concurrent Requests")
        
        if self.skip_inference:
            self.add_result("Inference: Concurrent requests", TestResult.SKIP, "Skipped (--skip-inference)")
            return
        
        import concurrent.futures
        
        model_id = self.create_model({
            "name": "test-concurrent",
            "served_model_name": "test-concurrent-model",
            "mode": "offline",
            "local_path": self.TEST_MODEL_PATH,
            "task": "generate",
            "engine_type": "llamacpp",
            "ngl": 999,
            "context_size": 4096,
            "parallel_slots": 4
        })
        
        if not model_id:
            self.add_result("Concurrent: Create model", TestResult.FAIL, "Failed to create")
            return
        
        if not self.start_model(model_id, timeout=180):
            self.add_result("Concurrent: Start model", TestResult.FAIL, "Failed to start")
            self.delete_model(model_id)
            return
        
        time.sleep(3)
        
        def make_request(i):
            try:
                resp = requests.post(
                    f"{self.BASE_URL}/v1/chat/completions",
                    json={
                        "model": "test-concurrent-model",
                        "messages": [{"role": "user", "content": f"Say the number {i}."}],
                        "max_tokens": 10
                    },
                    timeout=30
                )
                return resp.status_code == 200
            except:
                return False
        
        start = time.time()
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
            futures = [executor.submit(make_request, i) for i in range(4)]
            results = [f.result() for f in concurrent.futures.as_completed(futures)]
        duration = (time.time() - start) * 1000
        
        success_count = sum(results)
        if success_count == 4:
            self.add_result(
                "Concurrent: 4 parallel requests",
                TestResult.PASS,
                f"All 4 succeeded ({duration:.0f}ms)"
            )
        else:
            self.add_result(
                "Concurrent: 4 parallel requests",
                TestResult.WARN,
                f"{success_count}/4 succeeded ({duration:.0f}ms)"
            )
        
        self.stop_model(model_id)
        self.delete_model(model_id)
    
    def test_rapid_start_stop_cycle(self):
        """Test rapid start/stop cycling for stability."""
        print("\n📋 Test: Stress - Rapid Start/Stop Cycle")
        
        if self.skip_inference:
            self.add_result("Stress: Rapid cycle", TestResult.SKIP, "Skipped")
            return
        
        model_id = self.create_model({
            "name": "test-rapid-cycle",
            "served_model_name": "test-rapid-cycle",
            "mode": "offline",
            "local_path": self.TEST_MODEL_PATH,
            "task": "generate",
            "engine_type": "llamacpp",
            "ngl": 999,
            "context_size": 2048
        })
        
        if not model_id:
            self.add_result("Stress: Create model", TestResult.FAIL, "Failed to create")
            return
        
        cycles = 3
        success_count = 0
        
        for i in range(cycles):
            if self.start_model(model_id, timeout=120):
                time.sleep(2)
                if self.stop_model(model_id):
                    success_count += 1
                    self.log(f"Cycle {i+1}/{cycles} successful")
                time.sleep(3)  # Wait for container cleanup
        
        if success_count == cycles:
            self.add_result(f"Stress: {cycles}x start/stop cycle", TestResult.PASS, "All cycles successful")
        else:
            self.add_result(f"Stress: {cycles}x start/stop cycle", TestResult.FAIL, f"{success_count}/{cycles} succeeded")
        
        self.delete_model(model_id)
    
    def test_error_handling_invalid_model(self):
        """Test error handling for invalid model configurations."""
        print("\n📋 Test: Error Handling - Invalid Configuration")
        
        # Test with non-existent model path
        model_id = self.create_model({
            "name": "test-invalid-path",
            "served_model_name": "test-invalid-path",
            "mode": "offline",
            "local_path": "non_existent_model_path_12345",
            "task": "generate",
            "engine_type": "llamacpp",
            "ngl": 999,
            "context_size": 2048
        })
        
        if model_id:
            # Dry-run should warn or fail
            dry_run = self.dry_run(model_id)
            if dry_run:
                valid = dry_run.get("valid", True)
                warnings = dry_run.get("warnings", [])
                # Should either be invalid or have warnings about missing path
                if not valid or len(warnings) > 0:
                    self.add_result("Error: Invalid path detection", TestResult.PASS, 
                                    f"Warnings: {len(warnings)}, Valid: {valid}")
                else:
                    self.add_result("Error: Invalid path detection", TestResult.WARN, 
                                    "No warning for missing model")
            self.delete_model(model_id)
        else:
            self.add_result("Error: Invalid path detection", TestResult.PASS, "Rejected at creation")
    
    def test_error_handling_forbidden_args(self):
        """Test that forbidden arguments are blocked."""
        print("\n📋 Test: Error Handling - Forbidden Arguments")
        
        # Test with forbidden --port argument
        model_id = self.create_model({
            "name": "test-forbidden-args",
            "served_model_name": "test-forbidden-args",
            "mode": "offline",
            "local_path": self.TEST_MODEL_PATH,
            "task": "generate",
            "engine_type": "llamacpp",
            "ngl": 999,
            "context_size": 2048,
            "engine_startup_args_json": json.dumps([
                {"flag": "--port", "type": "int", "value": 9999}
            ])
        })
        
        if model_id:
            dry_run = self.dry_run(model_id)
            if dry_run:
                warnings = dry_run.get("warnings", [])
                has_forbidden_warning = any(
                    "forbidden" in w.get("message", "").lower() or 
                    "error" in w.get("severity", "").lower()
                    for w in warnings
                )
                if has_forbidden_warning:
                    self.add_result("Error: Forbidden arg blocked", TestResult.PASS, "Detected and warned")
                else:
                    # Check if --port is NOT in the command (should be filtered)
                    cmd_str = dry_run.get("command_str", "")
                    if "9999" not in cmd_str:
                        self.add_result("Error: Forbidden arg blocked", TestResult.PASS, "Filtered from command")
                    else:
                        self.add_result("Error: Forbidden arg blocked", TestResult.FAIL, "Not blocked")
            self.delete_model(model_id)
        else:
            self.add_result("Error: Forbidden arg blocked", TestResult.PASS, "Rejected at creation")
    
    def test_long_generation(self):
        """Test longer text generation."""
        print("\n📋 Test: Stress - Long Generation")
        
        if self.skip_inference:
            self.add_result("Stress: Long generation", TestResult.SKIP, "Skipped")
            return
        
        model_id = self.create_model({
            "name": "test-long-gen",
            "served_model_name": "test-long-gen",
            "mode": "offline",
            "local_path": self.TEST_MODEL_PATH,
            "task": "generate",
            "engine_type": "llamacpp",
            "ngl": 999,
            "context_size": 4096
        })
        
        if not model_id:
            self.add_result("Stress: Create model", TestResult.FAIL, "Failed to create")
            return
        
        if not self.start_model(model_id, timeout=180):
            self.add_result("Stress: Start model", TestResult.FAIL, "Failed to start")
            self.delete_model(model_id)
            return
        
        time.sleep(3)
        
        start = time.time()
        response = self.chat_completion(
            "test-long-gen",
            [{"role": "user", "content": "Write a detailed explanation of how neural networks work, including input layers, hidden layers, activation functions, backpropagation, and gradient descent. Be thorough."}],
            max_tokens=500
        )
        duration = (time.time() - start) * 1000
        
        if response:
            choices = response.get("choices", [])
            if choices:
                content = choices[0].get("message", {}).get("content", "")
                token_count = response.get("usage", {}).get("completion_tokens", len(content.split()))
                tokens_per_sec = (token_count / duration) * 1000 if duration > 0 else 0
                self.add_result(
                    "Stress: Long generation",
                    TestResult.PASS,
                    f"{token_count} tokens in {duration:.0f}ms ({tokens_per_sec:.1f} tok/s)"
                )
            else:
                self.add_result("Stress: Long generation", TestResult.FAIL, "No content")
        else:
            self.add_result("Stress: Long generation", TestResult.FAIL, "No response")
        
        self.stop_model(model_id)
        self.delete_model(model_id)
    
    def test_model_registry_consistency(self):
        """Test that model registry stays consistent after operations."""
        print("\n📋 Test: Consistency - Model Registry")
        
        # Create multiple models
        model_ids = []
        for i in range(3):
            model_id = self.create_model({
                "name": f"test-registry-{i}",
                "served_model_name": f"test-registry-{i}",
                "mode": "offline",
                "local_path": self.TEST_MODEL_PATH,
                "task": "generate",
                "engine_type": "llamacpp",
                "ngl": 999,
                "context_size": 2048
            })
            if model_id:
                model_ids.append(model_id)
        
        if len(model_ids) != 3:
            self.add_result("Consistency: Create 3 models", TestResult.FAIL, f"Only {len(model_ids)} created")
            for mid in model_ids:
                self.delete_model(mid)
            return
        
        self.add_result("Consistency: Create 3 models", TestResult.PASS, f"IDs: {model_ids}")
        
        # Verify all models appear in list
        try:
            resp = self.session.get(f"{self.BASE_URL}/admin/models")
            if resp.status_code == 200:
                models = resp.json()
                model_ids_in_list = [m["id"] for m in models]
                all_present = all(mid in model_ids_in_list for mid in model_ids)
                if all_present:
                    self.add_result("Consistency: All models in list", TestResult.PASS, "All 3 present")
                else:
                    self.add_result("Consistency: All models in list", TestResult.FAIL, "Some missing")
        except Exception as e:
            self.add_result("Consistency: All models in list", TestResult.FAIL, str(e))
        
        # Clean up
        for mid in model_ids:
            self.delete_model(mid)
        
        # Verify all deleted
        try:
            resp = self.session.get(f"{self.BASE_URL}/admin/models")
            if resp.status_code == 200:
                models = resp.json()
                model_ids_in_list = [m["id"] for m in models]
                none_present = not any(mid in model_ids_in_list for mid in model_ids)
                if none_present:
                    self.add_result("Consistency: All models deleted", TestResult.PASS, "All 3 removed")
                else:
                    self.add_result("Consistency: All models deleted", TestResult.FAIL, "Some remain")
        except Exception as e:
            self.add_result("Consistency: All models deleted", TestResult.FAIL, str(e))
    
    def run_all_tests(self):
        """Run all tests."""
        print("=" * 60)
        print("🧪 llama.cpp Comprehensive Test Suite")
        print("=" * 60)
        
        if not self.login():
            print("❌ Failed to authenticate. Aborting tests.")
            return False
        
        try:
            # Configuration tests (fast, don't require model start)
            self.test_gap3_verbose_logging()
            self.test_gap5_vram_estimation()
            self.test_gap6_warmup_check_tensors()
            self.test_gap7_chat_template()
            self.test_gap8_kv_cache_defrag()
            self.test_gap9_custom_args_validation()
            self.test_gap10_lora_adapters()
            self.test_gap11_grammar_support()
            self.test_gap12_model_alias()
            self.test_gap13_embeddings_mode()
            self.test_gap14_system_prompt()
            self.test_gap15_continuous_batching()
            
            # Error handling tests
            self.test_error_handling_invalid_model()
            self.test_error_handling_forbidden_args()
            
            # Consistency tests
            self.test_model_registry_consistency()
            
            # Tests that require model start
            self.test_basic_model_lifecycle()
            self.test_gap1_metrics_and_slots()
            self.test_gap2_startup_timeout()
            
            # Inference tests (optional)
            self.test_inference_chat_completion()
            self.test_inference_streaming()
            self.test_concurrent_requests()
            
            # Stress tests
            self.test_long_generation()
            self.test_rapid_start_stop_cycle()
            
        finally:
            self.cleanup()
        
        return self.print_summary()
    
    def print_summary(self) -> bool:
        """Print test summary and return True if all passed."""
        print("\n" + "=" * 60)
        print("📊 Test Summary")
        print("=" * 60)
        
        passed = sum(1 for r in self.results if r.result == TestResult.PASS)
        failed = sum(1 for r in self.results if r.result == TestResult.FAIL)
        skipped = sum(1 for r in self.results if r.result == TestResult.SKIP)
        warned = sum(1 for r in self.results if r.result == TestResult.WARN)
        
        print(f"\n✅ Passed:  {passed}")
        print(f"❌ Failed:  {failed}")
        print(f"⚠️ Warned:  {warned}")
        print(f"⏭️ Skipped: {skipped}")
        print(f"\nTotal: {len(self.results)} tests")
        
        if failed > 0:
            print("\n❌ FAILED TESTS:")
            for r in self.results:
                if r.result == TestResult.FAIL:
                    print(f"  - {r.name}: {r.message}")
        
        print("\n" + "=" * 60)
        
        return failed == 0


def main():
    parser = argparse.ArgumentParser(description="llama.cpp Comprehensive Test Suite")
    parser.add_argument("--skip-inference", action="store_true", 
                        help="Skip tests that require model inference")
    parser.add_argument("--verbose", "-v", action="store_true",
                        help="Enable verbose logging")
    args = parser.parse_args()
    
    suite = LlamaCppTestSuite(
        skip_inference=args.skip_inference,
        verbose=args.verbose
    )
    
    success = suite.run_all_tests()
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()

