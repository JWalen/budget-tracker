#!/bin/bash
# Setup NVIDIA GPU support for Budget Tracker AI features

set -e

echo "=========================================="
echo "NVIDIA GPU Setup for Budget Tracker"
echo "=========================================="
echo ""

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then 
    echo "Please run with sudo: sudo bash setup-gpu.sh"
    exit 1
fi

echo "Step 1: Updating package list..."
apt update

echo ""
echo "Step 2: Installing NVIDIA driver 580..."
apt install -y nvidia-driver-580

echo ""
echo "Step 3: Installing NVIDIA Container Toolkit..."
# Add NVIDIA Container Toolkit repository
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | \
    sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
    tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

apt update
apt install -y nvidia-container-toolkit

echo ""
echo "Step 4: Configuring Docker to use NVIDIA runtime..."
nvidia-ctk runtime configure --runtime=docker
systemctl restart docker

echo ""
echo "=========================================="
echo "Installation Complete!"
echo "=========================================="
echo ""
echo "⚠️  IMPORTANT: You MUST reboot for GPU drivers to load properly"
echo ""
echo "After reboot, verify with:"
echo "  nvidia-smi"
echo "  docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi"
echo ""
echo "Then run: docker compose down && docker compose up -d"
echo ""
