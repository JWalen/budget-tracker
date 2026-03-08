# NVIDIA GPU Setup for Budget Tracker AI

Your GTX 1050 Ti has been detected! Follow these steps to enable GPU acceleration for AI features.

## Installation Steps

### 1. Run the setup script
```bash
sudo bash setup-gpu.sh
```

This will:
- Install NVIDIA driver 580 (recommended for GTX 1050 Ti)
- Install NVIDIA Container Toolkit
- Configure Docker to use GPU
- Restart Docker service

### 2. Reboot your system
```bash
sudo reboot
```
**This is REQUIRED for the GPU drivers to load properly!**

### 3. After reboot, verify GPU is working
```bash
# Check GPU is detected
nvidia-smi

# Test Docker can access GPU
docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi
```

You should see your GTX 1050 Ti listed with memory and utilization stats.

### 4. Restart Budget Tracker with GPU support
```bash
cd /home/jwalen/docker/budget-tracker
docker compose down
docker compose up -d
```

### 5. Verify Ollama is using GPU
```bash
# Check Ollama container logs
docker logs budget-ollama

# You should see messages about NVIDIA/CUDA being detected
```

### 6. Enable AI features in the admin panel
1. Go to https://budget.walen.com/admin
2. Click "AI Configuration" tab
3. Toggle "Enable AI Features" to ON
4. Select your preferred model (mistral is default, good for GTX 1050 Ti)
5. Click "Save Settings"

## Performance Notes

Your GTX 1050 Ti has 4GB VRAM. Recommended models:
- **mistral** (default) - 4GB VRAM, good all-around performance
- **llama3.2:1b** - 1GB VRAM, faster responses, less accurate
- **phi3** - 2.3GB VRAM, good balance

Avoid larger models like llama3:70b (they won't fit in 4GB VRAM).

## Troubleshooting

### If nvidia-smi shows "No devices were found"
- Make sure you rebooted after installing drivers
- Check if GPU is properly passed through to the VM (if running in virtualization)

### If Docker can't access GPU
```bash
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

### If Ollama container fails to start
Check logs:
```bash
docker logs budget-ollama
```

Common issue: GPU not properly configured. Re-run setup script.

## What Gets Accelerated?

With GPU enabled:
- AI spending insights (faster analysis)
- Natural language transaction queries (instant responses)
- Budget recommendations (real-time)
- Bill optimization suggestions (faster processing)
- Anomaly detection (continuous monitoring)

Without GPU, these features still work but may be slower (CPU-only mode).
