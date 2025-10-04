## RAID setup guide (Dell PERC + Ubuntu)

### Goal
Create one large virtual disk from the four front-bay drives using the Dell PERC controller, then make that space available to Ubuntu (either by extending root or mounting separately).

### Enter the storage configuration
- Newer PowerEdge (14G/15G+):
  - Press F2 at boot → System Setup → Device Settings → select your PERC (e.g., "PERC H740P") → Configuration Management.
- Classic PERC BIOS:
  - Press Ctrl+R at boot to enter the PERC BIOS Configuration Utility.
- iDRAC (no reboot):
  - Open iDRAC in a browser → Storage → Controllers → your PERC → Create Virtual Disk.

Use any of the above paths to create the array.

### Create one unified Virtual Disk (RAID10 recommended)
1) Select "Create Virtual Disk" (Create VD).
2) Select only the four front-bay data drives.
   - Do NOT include the BOSS (M.2) module that hosts the OS.
3) Choose RAID level:
   - RAID10: best reliability and performance (recommended).
   - RAID5: more capacity, slower writes; single‑disk fault tolerance.
4) Size: all available capacity.
5) Stripe size: 256 KB (good for large file workloads/models).
6) Read policy: Read Ahead or Adaptive Read Ahead.
7) Write policy:
   - Write Back (if BBU/CacheVault present), otherwise Write Through.
8) Initialization: choose Fast Init. Background Initialization (BGI) can run while the OS is online.
9) Confirm and create; wait for VD to report Optimal (BGI may continue in the background).
10) Save/exit and reboot if you used BIOS (iDRAC changes do not require OS reboot).

### Back in Ubuntu: make the capacity available
Decide whether to extend the whole system (grow `/`) or mount a separate filesystem.

First, identify the new device (typically `/dev/sdb`):
```bash
lsblk
sudo lsscsi -g || true
```

#### Option A: Extend the root filesystem (LVM, online)
Your current LVM is `VG=ubuntu-vg`, `LV=ubuntu-lv`.

```bash
# 1) Initialize the new disk as a PV (adjust /dev/sdb if different)
sudo pvcreate /dev/sdb

# 2) Add it to the existing volume group
sudo vgextend ubuntu-vg /dev/sdb

# 3) Extend root LV and the filesystem in one step
sudo lvextend -r -l +100%FREE /dev/ubuntu-vg/ubuntu-lv

# 4) Verify
df -h /
sudo vgs
sudo lvs
```

#### Option B: Mount as a separate filesystem (e.g., /var/cortex/models)
```bash
# Partition (optional) and format
sudo parted /dev/sdb --script mklabel gpt
sudo parted /dev/sdb --script mkpart primary 0% 100%
sudo mkfs.ext4 /dev/sdb1

# Create mount point and persist via fstab
sudo mkdir -p /var/cortex/models
blkid /dev/sdb1   # copy the UUID from output
echo 'UUID=REPLACE_WITH_UUID  /var/cortex/models  ext4  defaults  0  2' | sudo tee -a /etc/fstab
sudo mount -a
```

### Notes and pitfalls
- Do not include the OS BOSS module in the VD; select only the four front-bay drives.
- Many PERCs don’t support true JBOD; if you ever need per‑disk presentation, create single‑disk RAID0 VDs and combine them with LVM in Linux.
- BGI can take hours on large arrays; performance is usable during BGI but may be reduced.


