#!/usr/bin/env python3
"""Compare SNMP vs CLI with serial number verification."""
import socket, time, subprocess, re

ip = '172.16.88.2'
port = 23
user = 'salfanet'
pwd = 'seven789'

# 1. Get SNMP serial + distance
snmp_serial_out = subprocess.check_output(
    ['snmpwalk', '-v2c', '-c', 'public', ip, '1.3.6.1.4.1.3902.1012.3.28.1.1.5'],
    stderr=subprocess.STDOUT, timeout=30
).decode()
snmp_dist_out = subprocess.check_output(
    ['snmpwalk', '-v2c', '-c', 'public', ip, '1.3.6.1.4.1.3902.1012.3.50.12.1.1.14'],
    stderr=subprocess.STDOUT, timeout=30
).decode()

# Parse serial: .ponIndex.cfgId = Hex-STRING
snmp_sn = {}
for line in snmp_serial_out.strip().split('\n'):
    m = re.search(r'\.(\d+)\.(\d+)\s*=\s*Hex-STRING:\s*(.+)', line)
    if m:
        pon_index = int(m.group(1))
        cfg_id = int(m.group(2))
        hex_str = m.group(3).strip().replace(' ', '')
        try:
            sn = bytes.fromhex(hex_str).decode('ascii', errors='replace')
            snmp_sn[(pon_index, cfg_id)] = sn
        except:
            pass

# Parse distance: .ponIndex.onuSlot.onuId = INTEGER
snmp_dist = {}
for line in snmp_dist_out.strip().split('\n'):
    m = re.search(r'\.(\d+)\.(\d+)\.(\d+)\s*=\s*INTEGER:\s*(\d+)', line)
    if m:
        pon_index = int(m.group(1))
        onu_slot = int(m.group(2))
        raw_val = int(m.group(4))
        snmp_dist[(pon_index, onu_slot)] = raw_val

# 2. Get CLI serial + distance for ONUs on port 1/1/1
sock = socket.create_connection((ip, port), timeout=10)
sock.settimeout(10)
buf = b''

def read_until(expected, t=10):
    global buf
    end = time.time() + t
    while time.time() < end:
        try:
            data = sock.recv(4096)
            if not data: break
            cleaned = bytearray()
            i = 0
            while i < len(data):
                if data[i] == 255: i += 3
                else: cleaned.append(data[i]); i += 1
            buf += cleaned
            if expected in buf:
                result = buf; buf = b''
                return result.decode('utf-8', errors='replace')
        except socket.timeout: break
    result = buf; buf = b''
    return result.decode('utf-8', errors='replace')

read_until(b'Username:', t=5)
sock.sendall(f'{user}\r\n'.encode())
read_until(b'Password:', t=5)
sock.sendall(f'{pwd}\r\n'.encode())
read_until(b'#', t=5)
sock.sendall(b'terminal no pause\r\n')
read_until(b'#', t=5)

pon_index = 268501248  # port 1/1/1

print(f"{'ONU':>4} {'SN (SNMP)':20s} {'SN (CLI)':20s} {'SNMP_raw':>8} {'CLI_dist':>8} {'ratio':>8}")
print("-" * 80)

for onu_id in range(1, 13):
    cmd = f'show gpon onu detail-info gpon-onu_1/1/1:{onu_id}'
    sock.sendall(f'{cmd}\r\n'.encode())
    out = read_until(b'#', t=15)
    
    cli_dist = None
    cli_sn = None
    for line in out.split('\n'):
        ls = line.strip()
        if 'ONU Distance' in line:
            dm = re.search(r'(\d+)', line.split(':')[1] if ':' in line else line)
            if dm: cli_dist = int(dm.group(1))
        if 'Serial number' in line:
            parts = line.split(':', 1)
            if len(parts) > 1:
                cli_sn = parts[1].strip()
    
    snmp_sn_val = snmp_sn.get((pon_index, onu_id), 'N/A')
    snmp_raw = snmp_dist.get((pon_index, onu_id))
    
    match = '✓' if snmp_sn_val == cli_sn else '✗'
    ratio = f"{snmp_raw/cli_dist:.2f}" if snmp_raw and cli_dist else 'N/A'
    print(f"{onu_id:>4} {snmp_sn_val:20s} {cli_sn or 'N/A':20s} {snmp_raw or 0:>8} {cli_dist or 0:>7}m {ratio:>8} {match}")

sock.close()
