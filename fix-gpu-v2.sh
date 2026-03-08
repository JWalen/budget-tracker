#!/bin/bash
# Fix corrupted NVIDIA Container Toolkit sources and rebuild driver

set -e

echo "=========================================="
echo "NVIDIA GPU Driver Fix (v2)"
echo "=========================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "Please run with sudo: sudo bash fix-gpu-v2.sh"
    exit 1
fi

echo "Current kernel: $(uname -r)"
echo ""

echo "Step 1: Removing corrupted NVIDIA Container Toolkit sources..."
rm -f /etc/apt/sources.list.d/nvidia-container-toolkit.list

echo ""
echo "Step 2: Installing DKMS..."
apt update
apt install -y dkms

echo ""
echo "Step 3: Rebuilding NVIDIA kernel modules for current kernel..."
apt install -y linux-headers-$(uname -r)
apt install -y --reinstall nvidia-dkms-580

echo ""
echo "Step 4: Re-adding NVIDIA Container Toolkit repository..."
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | \
    sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
    tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

echo ""
echo "Step 5: Installing NVIDIA Container Toolkit..."
apt update
apt install -y nvidia-container-toolkit

echo ""
echo "Step 6: Configuring Docker..."
nvidia-ctk runtime configure --runtime=docker
systemctl restart docker

echo ""
echo "Step 7: Loading NVIDIA kernel modules..."
modprobe nvidia
modprobe nvidia_uvm

echo ""
echo "=========================================="
echo "Fix Complete!"
echo "=========================================="
echo ""
echo "Testing GPU access..."
nvidia-smi

echo ""
echo "If you see GPU information above, you're all set!"
echo ""
echo "Next steps:"
echo "  cd /home/jwalen/docker/budget-tracker"
echo "  rm docker-compose.override.yml"
echo "  docker compose down && docker compose up -d"
echo ""
