# Updating NVIDIA Drivers for vLLM and llama.cpp

## Why Update NVIDIA Drivers?

Cortex uses Docker containers for running vLLM and llama.cpp inference engines. These containers include CUDA libraries that require compatible NVIDIA drivers on the host system.

### Common Issues Without Updated Drivers

1. **Container Startup Failures**: Containers fail to start with errors like:
   ```
   nvidia-container-cli: requirement error: unsatisfied condition: cuda>=12.9
   ```

2. **GPU Access Denied**: Containers cannot access GPUs even though they're available

3. **Performance Degradation**: Older drivers may not support newer CUDA features used by vLLM/llama.cpp

4. **Compatibility Issues**: vLLM and llama.cpp Docker images are built with specific CUDA versions that require matching driver versions

## Understanding CUDA and Driver Compatibility

### How It Works

- **CUDA Version in Container**: vLLM/llama.cpp Docker images are built with specific CUDA versions (e.g., CUDA 12.9)
- **Host Driver Requirement**: The host NVIDIA driver must support the CUDA version used in the container
- **Backward Compatibility**: Newer drivers support older CUDA versions, but older drivers cannot support newer CUDA versions

### Current Requirements

**For CUDA 12.9+ (used by latest vLLM/llama.cpp images)**:
- **Linux**: NVIDIA driver **575.51.03** or newer
- **Windows**: NVIDIA driver **576.02** or newer

**For CUDA 12.8**:
- **Linux**: NVIDIA driver **525.60.13** or newer
- **Windows**: NVIDIA driver **528.33** or newer

> **Note**: Always check the specific CUDA version required by your vLLM/llama.cpp Docker images. Newer images may require CUDA 12.9+, while older images may work with CUDA 12.8.

## Checking Your Current Driver Version

### On Linux

```bash
# Check driver version
nvidia-smi

# Or get just the version number
nvidia-smi --query-gpu=driver_version --format=csv,noheader

# Check maximum CUDA version supported
nvidia-smi --query-gpu=cuda_version --format=csv,noheader
```

### Understanding the Output

- **Driver Version**: The installed NVIDIA driver version (e.g., `570.195.03`)
- **CUDA Version**: The maximum CUDA version your driver supports (e.g., `12.8`)

If your driver supports CUDA 12.8 but the container requires CUDA 12.9+, you need to update.

## Updating NVIDIA Drivers on Linux

### Method 1: Package Manager (Recommended)

#### Ubuntu/Debian

```bash
# 1. Check available driver versions
ubuntu-drivers list

# 2. Add NVIDIA PPA for latest drivers (optional, for newer versions)
sudo add-apt-repository ppa:graphics-drivers/ppa
sudo apt update

# 3. Check what versions are available
apt-cache search nvidia-driver | grep "^nvidia-driver-[0-9]"

# 4. Install driver 575 or newer (replace with your preferred version)
sudo apt install nvidia-driver-575

# Or install the "open" version (for open-source kernel modules)
sudo apt install nvidia-driver-575-open

# 5. Reboot system
sudo reboot
```

#### RHEL/CentOS/Rocky Linux

```bash
# 1. Enable EPEL repository
sudo dnf install epel-release

# 2. Install NVIDIA driver (version 575 or newer)
sudo dnf install nvidia-driver-575

# 3. Reboot system
sudo reboot
```

#### Fedora

```bash
# 1. Install NVIDIA driver from RPM Fusion
sudo dnf install https://download1.rpmfusion.org/free/fedora/rpmfusion-free-release-$(rpm -E %fedora).noarch.rpm
sudo dnf install https://download1.rpmfusion.org/nonfree/fedora/rpmfusion-nonfree-release-$(rpm -E %fedora).noarch.rpm

# 2. Install NVIDIA driver
sudo dnf install nvidia-driver-575

# 3. Reboot system
sudo reboot
```

#### Arch Linux

```bash
# 1. Install NVIDIA driver
sudo pacman -S nvidia

# Or for open-source kernel modules
sudo pacman -S nvidia-open

# 2. Reboot system
sudo reboot
```

### Method 2: Direct Download from NVIDIA

If your distribution doesn't have driver 575+ in repositories:

```bash
# 1. Download driver from NVIDIA website
# Visit: https://www.nvidia.com/Download/index.aspx
# Select: Your GPU model, Linux 64-bit, Latest version

# 2. Stop services using GPU
sudo systemctl stop docker  # If Docker is running

# 3. Install prerequisites
sudo apt install build-essential dkms  # Ubuntu/Debian
# OR
sudo dnf install gcc kernel-devel kernel-headers dkms  # RHEL/Fedora

# 4. Make installer executable
chmod +x NVIDIA-Linux-x86_64-*.run

# 5. Run installer
sudo ./NVIDIA-Linux-x86_64-*.run

# Follow prompts:
# - Accept license
# - Install 32-bit compatibility libraries? (Yes)
# - Run nvidia-xconfig? (Yes)

# 6. Reboot
sudo reboot
```

## Verifying Driver Installation

After rebooting:

```bash
# Check driver version (should show 575.x or higher)
nvidia-smi

# Verify CUDA version support (should show 12.9 or higher)
nvidia-smi --query-gpu=cuda_version --format=csv,noheader

# Test GPU access in Docker
docker run --rm --gpus all nvidia/cuda:12.9.0-base-ubuntu22.04 nvidia-smi
```

## After Driver Update

### 1. Restart Docker (if using GPU)

```bash
sudo systemctl restart docker
```

### 2. Restart Cortex

```bash
cd /path/to/Cortex-vLLM
make restart
# OR
docker compose restart
```

### 3. Test Model Startup

```bash
# Use the test script to verify models can start
python3 scripts/test_offline_models.py <model_id>
```

## Troubleshooting

### Driver Installation Fails

**Symptoms**: Installation errors, system won't boot

**Solutions**:
1. **Boot into recovery mode**:
   - Hold Shift during boot (Ubuntu/Debian)
   - Select "Advanced options" → "Recovery mode"
   - Drop to root shell
   - Remove problematic driver: `apt remove nvidia-driver-*` or `dnf remove nvidia-driver-*`
   - Reboot normally

2. **Check kernel compatibility**:
   ```bash
   uname -r
   # Ensure kernel version is compatible with driver
   ```

3. **Remove conflicting packages**:
   ```bash
   # Ubuntu/Debian
   dpkg -l | grep nvidia
   sudo apt remove --purge nvidia-*
   sudo apt autoremove
   
   # RHEL/Fedora
   rpm -qa | grep nvidia
   sudo dnf remove nvidia-*
   ```

### CUDA Version Still Shows Old Version

**Symptom**: `nvidia-smi` shows CUDA 12.8 after updating to driver 575+

**Explanation**: This is normal! `nvidia-smi` shows the **maximum CUDA version your driver supports**, not what's installed. Docker containers will use CUDA 12.9 from the container image.

**Verification**: Test with Docker:
```bash
docker run --rm --gpus all nvidia/cuda:12.9.0-base-ubuntu22.04 nvidia-smi
```

### Container Still Fails After Driver Update

**Check**:
1. Driver version: `nvidia-smi` should show 575.x or higher
2. Docker GPU access: `docker run --rm --gpus all nvidia/cuda:12.9.0-base-ubuntu22.04 nvidia-smi`
3. Container logs: `docker logs <container-name>`

**Common causes**:
- Docker not restarted after driver update
- NVIDIA Container Toolkit not installed/updated
- Driver not properly loaded (check `lsmod | grep nvidia`)

### Rollback to Previous Driver

If the new driver causes issues:

```bash
# Ubuntu/Debian
sudo apt remove nvidia-driver-575
sudo apt install nvidia-driver-570  # or your previous version
sudo reboot

# RHEL/Fedora
sudo dnf remove nvidia-driver-575
sudo dnf install nvidia-driver-570  # or your previous version
sudo reboot
```

## GPU Compatibility Notes

### vLLM Requirements

- **Compute Capability**: 7.0 or higher (V100, T4, RTX 20xx/30xx/40xx, A100, L4, H100, etc.)
- **CUDA**: 11.8+ (latest images use CUDA 12.9+)
- **Driver**: Must support the CUDA version in the vLLM Docker image

### llama.cpp Requirements

- **CUDA Support**: Requires CUDA-enabled build (server-cuda image)
- **Driver**: Must support CUDA version in llama.cpp Docker image
- **GPU Layers**: Can run on CPU (ngl=0) but GPU acceleration requires compatible driver

## Best Practices

1. **Check Before Updating**: Always verify current driver version first
2. **Backup Important Data**: While driver updates are generally safe, backup critical data
3. **Update During Maintenance**: Driver updates require reboot - plan accordingly
4. **Keep Old Installer**: Save the old driver installer in case rollback is needed
5. **Test After Update**: Always test container startup after driver updates
6. **Monitor Logs**: Check container logs if startup fails after driver update

## Additional Resources

- **NVIDIA Driver Downloads**: https://www.nvidia.com/Download/index.aspx
- **CUDA Toolkit Archive**: https://developer.nvidia.com/cuda-toolkit-archive
- **CUDA Release Notes**: https://docs.nvidia.com/cuda/cuda-toolkit-release-notes/
- **vLLM GPU Installation**: https://docs.vllm.ai/en/latest/getting_started/installation/gpu.html
- **llama.cpp CUDA Support**: https://github.com/ggerganov/llama.cpp

## Quick Reference

| CUDA Version | Minimum Driver (Linux) | Minimum Driver (Windows) |
|--------------|------------------------|---------------------------|
| 12.9+        | 575.51.03              | 576.02                    |
| 12.8         | 525.60.13              | 528.33                    |
| 12.7         | 525.60.13              | 528.33                    |
| 12.6         | 525.60.13              | 528.33                    |

> **Note**: Always check the specific requirements for your vLLM/llama.cpp Docker image version. Newer images may require CUDA 12.9+, while older images may work with CUDA 12.8.
