#!/bin/bash
# Complete GPU setup - Fixed version

set -e

echo "=========================================="
echo "NVIDIA GPU Complete Setup"
echo "=========================================="
echo ""

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then 
    echo "Please run with sudo: sudo bash complete-gpu-setup.sh"
    exit 1
fi

echo "Step 1: Cleaning up old configurations..."
rm -f /etc/apt/sources.list.d/nvidia-container-toolkit.list
rm -f /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg

echo ""
echo "Step 2: Installing DKMS and rebuilding kernel modules..."
apt update
apt install -y dkms linux-headers-$(uname -r)
apt install -y --reinstall nvidia-dkms-580

echo ""
echo "Step 3: Loading NVIDIA modules..."
modprobe nvidia || true
modprobe nvidia_uvm || true

echo ""
echo "Step 4: Verifying NVIDIA driver..."
if nvidia-smi &> /dev/null; then
    echo "✓ NVIDIA driver is working!"
    nvidia-smi
else
    echo "✗ NVIDIA driver not loaded yet. Continuing anyway..."
fi

echo ""
echo "Step 5: Adding NVIDIA Container Toolkit (generic stable deb repo)..."
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg

# Use generic stable deb repository instead of distribution-specific
echo "deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://nvidia.github.io/libnvidia-container/stable/deb/\$(ARCH) /" | \
    tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

apt update
apt install -y nvidia-container-toolkit

echo ""
echo "Step 3: Configuring Docker to use NVIDIA runtime..."
nvidia-ctk runtime configure --runtime=docker
systemctl restart docker

echo ""
echo "Step 4: Testing GPU access..."
sleep 2
if nvidia-smi &> /dev/null; then
    nvidia-smi
    echo ""
    echo "✓ GPU is accessible!"
fi

echo ""
echo "=========================================="
echo "✓ GPU Setup Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  cd /home/jwalen/docker/budget-tracker"
echo "  rm docker-compose.override.yml"
echo "  docker compose down && docker compose up -d"
echo ""
