# HuggingFace Model Download Guide for Cortex

**Date**: October 4, 2025  
**Purpose**: Complete guide for downloading and preparing HuggingFace models for both online and offline Cortex deployments

---

## 🎯 Overview

This guide provides comprehensive instructions for downloading models from HuggingFace Hub and preparing them for use with Cortex. It covers both **online** (internet-connected) and **offline** (air-gapped) deployment scenarios.

**What you'll learn:**
- ✅ How to install HuggingFace tools on Linux
- ✅ Multiple methods to download models (git clone, huggingface_hub, transformers)
- ✅ Preparing models for offline use
- ✅ Integrating downloaded models with Cortex
- ✅ Troubleshooting common issues

---

## 📋 Prerequisites

### System Requirements
- Linux machine (Ubuntu/Debian/RHEL/CentOS)
- Python 3.8+ installed
- At least 20GB free disk space (for large models)
- Internet connection (for initial downloads)

### Required Tools
```bash
# Essential tools
sudo apt-get update
sudo apt-get install -y git curl wget

# Git LFS for large files
sudo apt-get install -y git-lfs
git lfs install

# Python packages
pip install --upgrade pip
pip install huggingface_hub transformers torch
```

**Verify installation:**
```bash
git --version          # Should show Git 2.0+
git lfs version        # Should show Git LFS version
python3 --version      # Should show Python 3.8+
pip list | grep huggingface  # Should show huggingface_hub
```

---

## 🚀 Method 1: Git Clone (Recommended for Complete Models)

**Best for**: Complete model repositories, offline preparation, air-gapped environments

### Step 1: Find Your Model

1. **Browse HuggingFace Hub**: https://huggingface.co/models
2. **Search for your model** (e.g., "meta-llama/Llama-3-8B-Instruct")
3. **Note the repository URL**: `https://huggingface.co/meta-llama/Llama-3-8B-Instruct`

### Step 2: Clone the Repository

```bash
# Basic clone (public models)
git clone https://huggingface.co/meta-llama/Llama-3-8B-Instruct

# For gated models (requires authentication)
git clone https://huggingface.co/meta-llama/Llama-3-8B-Instruct
# You'll be prompted for HuggingFace username and token
```

### Step 3: Verify Download

```bash
cd Llama-3-8B-Instruct
ls -la

# Expected files for a complete model:
# ├── config.json              # Model configuration
# ├── pytorch_model.bin        # PyTorch weights (or model-*.safetensors)
# ├── tokenizer.json           # Tokenizer files
# ├── tokenizer_config.json
# ├── special_tokens_map.json
# └── README.md                # Model documentation
```

### Step 4: Prepare for Cortex

```bash
# Move to Cortex models directory
sudo mkdir -p /var/cortex/models
sudo mv Llama-3-8B-Instruct /var/cortex/models/

# Set proper permissions
sudo chown -R $USER:$USER /var/cortex/models/Llama-3-8B-Instruct
chmod -R 755 /var/cortex/models/Llama-3-8B-Instruct
```

**Result**: Model ready for Cortex offline mode!

---

## 🐍 Method 2: Python huggingface_hub (Recommended for Selective Downloads)

**Best for**: Downloading specific files, automated scripts, CI/CD pipelines

### Step 1: Install huggingface_hub

```bash
pip install huggingface_hub
```

### Step 2: Download Complete Model

```python
#!/usr/bin/env python3
"""
Download a complete HuggingFace model for Cortex offline use
"""

from huggingface_hub import snapshot_download
import os

def download_model_for_cortex(repo_id, local_dir):
    """
    Download a complete HuggingFace model for offline Cortex use
    
    Args:
        repo_id (str): HuggingFace model ID (e.g., "meta-llama/Llama-3-8B-Instruct")
        local_dir (str): Local directory to save the model
    """
    
    print(f"Downloading {repo_id} to {local_dir}...")
    
    # Download complete model repository
    snapshot_download(
        repo_id=repo_id,
        local_dir=local_dir,
        local_dir_use_symlinks=False,  # Copy files instead of symlinks
        resume_download=True,          # Resume interrupted downloads
    )
    
    print(f"✅ Model downloaded successfully to {local_dir}")
    
    # Verify essential files
    essential_files = [
        "config.json",
        "tokenizer.json", 
        "tokenizer_config.json"
    ]
    
    for file in essential_files:
        file_path = os.path.join(local_dir, file)
        if os.path.exists(file_path):
            print(f"✅ Found {file}")
        else:
            print(f"⚠️  Missing {file}")

# Example usage
if __name__ == "__main__":
    # Download Llama 3 8B Instruct
    download_model_for_cortex(
        repo_id="meta-llama/Llama-3-8B-Instruct",
        local_dir="/var/cortex/models/Llama-3-8B-Instruct"
    )
```

### Step 3: Run the Download Script

```bash
# Make script executable
chmod +x download_model.py

# Run the download
python3 download_model.py
```

### Step 4: Download Specific Files Only

```python
#!/usr/bin/env python3
"""
Download specific files from a HuggingFace model
Useful for large models where you only need certain files
"""

from huggingface_hub import hf_hub_download
import os

def download_specific_files(repo_id, local_dir):
    """
    Download only essential files for a model
    """
    
    # Essential files for most models
    files_to_download = [
        "config.json",
        "tokenizer.json",
        "tokenizer_config.json", 
        "special_tokens_map.json",
        "vocab.json"  # For some tokenizers
    ]
    
    # Check for model weights (PyTorch or SafeTensors)
    try:
        # Try PyTorch format first
        hf_hub_download(
            repo_id=repo_id,
            filename="pytorch_model.bin",
            local_dir=local_dir
        )
        print("✅ Downloaded pytorch_model.bin")
    except:
        # Try SafeTensors format
        try:
            # List files to find SafeTensors files
            from huggingface_hub import list_repo_files
            files = list_repo_files(repo_id)
            safetensors_files = [f for f in files if f.endswith('.safetensors')]
            
            for file in safetensors_files:
                hf_hub_download(
                    repo_id=repo_id,
                    filename=file,
                    local_dir=local_dir
                )
                print(f"✅ Downloaded {file}")
        except Exception as e:
            print(f"❌ Could not download model weights: {e}")
    
    # Download other essential files
    for filename in files_to_download:
        try:
            hf_hub_download(
                repo_id=repo_id,
                filename=filename,
                local_dir=local_dir
            )
            print(f"✅ Downloaded {filename}")
        except Exception as e:
            print(f"⚠️  Could not download {filename}: {e}")

# Example usage
if __name__ == "__main__":
    download_specific_files(
        repo_id="meta-llama/Llama-3-8B-Instruct",
        local_dir="/var/cortex/models/Llama-3-8B-Instruct"
    )
```

---

## 🔧 Method 3: Transformers Library (For Testing)

**Best for**: Testing model compatibility, quick validation

### Step 1: Download and Test Model

```python
#!/usr/bin/env python3
"""
Download and test a HuggingFace model using transformers
"""

from transformers import AutoTokenizer, AutoModelForCausalLM
import torch

def download_and_test_model(model_name, save_path):
    """
    Download model using transformers and save for offline use
    """
    
    print(f"Downloading {model_name}...")
    
    # Download tokenizer
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    
    # Download model (this will cache it)
    model = AutoModelForCausalLM.from_pretrained(
        model_name,
        torch_dtype=torch.float16,  # Use half precision to save memory
        device_map="auto"           # Automatically distribute across GPUs
    )
    
    print("✅ Model downloaded and loaded successfully")
    
    # Test the model
    test_prompt = "Hello, how are you?"
    inputs = tokenizer(test_prompt, return_tensors="pt")
    
    with torch.no_grad():
        outputs = model.generate(
            inputs.input_ids,
            max_length=50,
            do_sample=True,
            temperature=0.7
        )
    
    response = tokenizer.decode(outputs[0], skip_special_tokens=True)
    print(f"Test response: {response}")
    
    # Save for offline use
    print(f"Saving model to {save_path}...")
    model.save_pretrained(save_path)
    tokenizer.save_pretrained(save_path)
    
    print("✅ Model saved for offline use")

# Example usage
if __name__ == "__main__":
    download_and_test_model(
        model_name="meta-llama/Llama-3-8B-Instruct",
        save_path="/var/cortex/models/Llama-3-8B-Instruct"
    )
```

---

## 🔒 Authentication for Gated Models

Many models (like Llama 3) require authentication to download.

### Step 1: Get HuggingFace Token

1. **Create HuggingFace account**: https://huggingface.co/join
2. **Request access** to the model you want
3. **Generate token**: https://huggingface.co/settings/tokens
4. **Copy the token** (starts with `hf_`)

### Step 2: Authenticate

**Option A: Environment Variable**
```bash
export HUGGINGFACE_HUB_TOKEN="hf_your_token_here"
```

**Option B: Login Command**
```bash
huggingface-cli login
# Enter your token when prompted
```

**Option C: Python Script**
```python
from huggingface_hub import login
login("hf_your_token_here")
```

### Step 3: Verify Access

```python
from huggingface_hub import list_models

# This should work for gated models you have access to
models = list_models(filter="meta-llama")
print(f"Found {len(models)} accessible models")
```

---

## 📦 Preparing Models for Offline Use

### Step 1: Download on Internet-Connected Machine

```bash
# Create download script
cat > download_for_offline.sh << 'EOF'
#!/bin/bash

# Set your HuggingFace token
export HUGGINGFACE_HUB_TOKEN="hf_your_token_here"

# Create models directory
mkdir -p ./offline_models

# Download models you need
python3 -c "
from huggingface_hub import snapshot_download
import os

models_to_download = [
    'meta-llama/Llama-3-8B-Instruct',
    'mistralai/Mistral-7B-Instruct-v0.1',
    'microsoft/DialoGPT-medium'
]

for model_id in models_to_download:
    print(f'Downloading {model_id}...')
    local_dir = f'./offline_models/{model_id.replace(\"/\", \"_\")}'
    snapshot_download(
        repo_id=model_id,
        local_dir=local_dir,
        local_dir_use_symlinks=False
    )
    print(f'✅ Downloaded {model_id}')
"
EOF

chmod +x download_for_offline.sh
./download_for_offline.sh
```

### Step 2: Transfer to Offline Machine

```bash
# Option A: USB Drive
cp -r offline_models /media/usb/

# Option B: Network transfer (if available)
rsync -avz offline_models/ user@offline-machine:/var/cortex/models/

# Option C: Archive and transfer
tar -czf models.tar.gz offline_models/
# Transfer models.tar.gz to offline machine
tar -xzf models.tar.gz -C /var/cortex/models/
```

### Step 3: Configure Offline Environment

```bash
# Set offline mode environment variables
echo 'export HF_HUB_OFFLINE=1' >> ~/.bashrc
echo 'export TRANSFORMERS_OFFLINE=1' >> ~/.bashrc
source ~/.bashrc

# Verify offline mode
python3 -c "
import os
print('HF_HUB_OFFLINE:', os.getenv('HF_HUB_OFFLINE'))
print('TRANSFORMERS_OFFLINE:', os.getenv('TRANSFORMERS_OFFLINE'))
"
```

---

## 🎯 Integrating with Cortex

### Step 1: Add Model to Cortex

**Via Admin UI:**
1. **Login** to Cortex Admin UI
2. **Navigate** to Models page
3. **Click** "Add Model"
4. **Configure**:
   - **Engine**: vLLM (for HF models)
   - **Mode**: Offline
   - **Local Path**: `Llama-3-8B-Instruct` (relative to `/var/cortex/models`)
   - **Served Model Name**: `llama-3-8b-instruct`
   - **Task**: Generate

**Via API:**
```bash
curl -X POST http://localhost:8084/admin/models \
  -H 'Content-Type: application/json' \
  -b cookies.txt \
  -d '{
    "name": "Llama 3 8B Instruct",
    "served_model_name": "llama-3-8b-instruct", 
    "engine_type": "vllm",
    "mode": "offline",
    "local_path": "Llama-3-8B-Instruct",
    "task": "generate",
    "dtype": "auto",
    "tp_size": 1,
    "gpu_memory_utilization": 0.9
  }'
```

### Step 2: Start the Model

**Via Admin UI:**
1. **Find** your model in the list
2. **Click** "Start" button
3. **Monitor** logs for successful startup

**Via API:**
```bash
# Get model ID first
MODEL_ID=$(curl -s http://localhost:8084/admin/models -b cookies.txt | jq -r '.[] | select(.name=="Llama 3 8B Instruct") | .id')

# Start the model
curl -X POST http://localhost:8084/admin/models/$MODEL_ID/start \
  -b cookies.txt
```

### Step 3: Test the Model

```bash
# Test with a simple request
curl -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:8084/v1/chat/completions \
  -d '{
    "model": "llama-3-8b-instruct",
    "messages": [{"role": "user", "content": "Hello!"}],
    "max_tokens": 50
  }'
```

---

## 🔍 Troubleshooting

### Common Issues and Solutions

#### Issue 1: "Repository not found" or "Access denied"

**Cause**: Model is gated or requires authentication

**Solution**:
```bash
# Ensure you're authenticated
huggingface-cli login

# Or set token
export HUGGINGFACE_HUB_TOKEN="hf_your_token_here"

# Verify access
python3 -c "
from huggingface_hub import list_repo_files
files = list_repo_files('meta-llama/Llama-3-8B-Instruct')
print('Access confirmed, found', len(files), 'files')
"
```

#### Issue 2: "Out of disk space"

**Cause**: Large models require significant storage

**Solution**:
```bash
# Check available space
df -h

# Clean up HuggingFace cache
rm -rf ~/.cache/huggingface/hub/models--*

# Use selective download for large models
python3 -c "
from huggingface_hub import hf_hub_download
# Download only essential files
files = ['config.json', 'tokenizer.json', 'tokenizer_config.json']
for file in files:
    hf_hub_download('model-name', file, local_dir='./model')
"
```

#### Issue 3: "Git LFS not installed"

**Cause**: Large files require Git LFS

**Solution**:
```bash
# Install Git LFS
sudo apt-get install git-lfs
git lfs install

# Verify installation
git lfs version

# Re-clone the repository
rm -rf model-directory
git clone https://huggingface.co/model-name
```

#### Issue 4: "Model files missing" in Cortex

**Cause**: Incorrect directory structure or permissions

**Solution**:
```bash
# Check directory structure
ls -la /var/cortex/models/Llama-3-8B-Instruct/

# Should contain:
# config.json
# pytorch_model.bin (or model-*.safetensors)
# tokenizer.json
# tokenizer_config.json

# Fix permissions if needed
sudo chown -R $USER:$USER /var/cortex/models/
chmod -R 755 /var/cortex/models/
```

#### Issue 5: "CUDA out of memory" when testing

**Cause**: Model too large for available GPU memory

**Solution**:
```python
# Use CPU for testing
from transformers import AutoModelForCausalLM
import torch

model = AutoModelForCausalLM.from_pretrained(
    "model-name",
    torch_dtype=torch.float16,
    device_map="cpu"  # Force CPU usage
)

# Or use smaller model for testing
model = AutoModelForCausalLM.from_pretrained(
    "microsoft/DialoGPT-small"  # Much smaller model
)
```

---

## 📊 Model Size Reference

### Common Model Sizes

| Model | Size (GB) | Format | Use Case |
|-------|-----------|--------|----------|
| **Small Models** | | | |
| microsoft/DialoGPT-small | 0.5 | PyTorch | Testing, development |
| distilbert-base-uncased | 0.3 | PyTorch | Text classification |
| **Medium Models** | | | |
| microsoft/DialoGPT-medium | 1.5 | PyTorch | Chat, development |
| meta-llama/Llama-3-8B-Instruct | 16 | SafeTensors | Production chat |
| mistralai/Mistral-7B-Instruct-v0.1 | 14 | SafeTensors | Production chat |
| **Large Models** | | | |
| meta-llama/Llama-3-70B-Instruct | 140 | SafeTensors | High-quality chat |
| microsoft/DialoGPT-large | 3.0 | PyTorch | Advanced chat |

### Storage Requirements

```bash
# Calculate required space
du -sh /var/cortex/models/*

# Example output:
# 16G    /var/cortex/models/Llama-3-8B-Instruct
# 140G   /var/cortex/models/Llama-3-70B-Instruct
# 14G    /var/cortex/models/Mistral-7B-Instruct-v0.1
```

---

## 🚀 Quick Start Examples

### Example 1: Download Llama 3 8B for Testing

```bash
#!/bin/bash
# Quick setup for Llama 3 8B testing

# Install dependencies
sudo apt-get install -y git-lfs
git lfs install
pip install huggingface_hub transformers

# Set up authentication (get token from https://huggingface.co/settings/tokens)
export HUGGINGFACE_HUB_TOKEN="hf_your_token_here"

# Download model
python3 -c "
from huggingface_hub import snapshot_download
snapshot_download(
    repo_id='meta-llama/Llama-3-8B-Instruct',
    local_dir='/var/cortex/models/Llama-3-8B-Instruct',
    local_dir_use_symlinks=False
)
print('✅ Llama 3 8B downloaded successfully')
"

# Add to Cortex
curl -X POST http://localhost:8084/admin/models \
  -H 'Content-Type: application/json' \
  -b cookies.txt \
  -d '{
    "name": "Llama 3 8B",
    "served_model_name": "llama-3-8b",
    "engine_type": "vllm", 
    "mode": "offline",
    "local_path": "Llama-3-8B-Instruct",
    "task": "generate"
  }'

echo "✅ Model added to Cortex. Start it from the Admin UI."
```

### Example 2: Download Multiple Models for Offline Use

```bash
#!/bin/bash
# Download multiple models for offline deployment

MODELS=(
    "meta-llama/Llama-3-8B-Instruct"
    "mistralai/Mistral-7B-Instruct-v0.1" 
    "microsoft/DialoGPT-medium"
)

mkdir -p /var/cortex/models

for model in "${MODELS[@]}"; do
    echo "Downloading $model..."
    python3 -c "
from huggingface_hub import snapshot_download
import os
model_name = '$model'.replace('/', '_')
local_dir = f'/var/cortex/models/{model_name}'
snapshot_download(
    repo_id='$model',
    local_dir=local_dir,
    local_dir_use_symlinks=False
)
print(f'✅ Downloaded {model_name}')
"
done

echo "✅ All models downloaded successfully"
echo "Models available in /var/cortex/models/"
ls -la /var/cortex/models/
```

---

## 📚 Additional Resources

### Official Documentation
- **HuggingFace Hub**: https://huggingface.co/docs/hub/index
- **Transformers Library**: https://huggingface.co/docs/transformers/
- **Git LFS**: https://git-lfs.github.io/

### Cortex Documentation
- **Model Management**: `docs/models/model-management.md`
- **vLLM Engine**: `docs/models/vllm.md`
- **Offline Deployment**: `docs/operations/deployments.md`

### Community Resources
- **HuggingFace Community**: https://discuss.huggingface.co/
- **Model Hub**: https://huggingface.co/models
- **Cortex GitHub**: https://github.com/AulendurForge/Cortex

---

## 🎯 Summary

**For Online Deployments:**
1. ✅ Install `git-lfs` and `huggingface_hub`
2. ✅ Authenticate with HuggingFace token
3. ✅ Use `snapshot_download()` for complete models
4. ✅ Configure Cortex in "Online" mode

**For Offline Deployments:**
1. ✅ Download models on internet-connected machine
2. ✅ Transfer to offline environment
3. ✅ Set `HF_HUB_OFFLINE=1` environment variable
4. ✅ Configure Cortex in "Offline" mode

**Best Practices:**
- ✅ Always verify model files after download
- ✅ Test models before deploying to production
- ✅ Use appropriate model sizes for your hardware
- ✅ Keep backups of downloaded models
- ✅ Monitor disk space for large models

**Next Steps:**
- 📖 Read `docs/models/vllm.md` for vLLM configuration
- 📖 Read `docs/models/model-management.md` for Cortex integration
- 📖 Read `docs/operations/deployments.md` for production deployment

---

**Questions?** Check the troubleshooting section or refer to the Cortex documentation for specific integration details.
