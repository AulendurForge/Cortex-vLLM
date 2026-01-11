#!/bin/bash
# Run sequential stress test as admin

echo "Starting Sequential Stress Test for 120B Model"
echo "=============================================="
echo "This will run 1000 sequential requests with comprehensive essay prompts"
echo "Results will be saved to ~/Desktop/"
echo ""

# Check if running as root/admin
if [ "$EUID" -ne 0 ]; then
    echo "⚠️  Warning: Not running as root. Consider running with sudo for admin privileges."
    echo ""
fi

# Create output directory
mkdir -p ~/Desktop

# Run the stress test
python3 /home/mage/repos/Cortex/sequential_stress_test.py

echo ""
echo "Stress test completed!"
echo "Check ~/Desktop/ for results"
