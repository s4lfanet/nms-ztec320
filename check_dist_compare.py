#!/usr/bin/env python3
"""Compare SNMP distance vs CLI distance simultaneously."""
import socket, time, subprocess, re

ip = '172.16.88.2'
port = 23
user = 'salfanet'
pwd = 'seven789'

# 1. Get SNMP distance values
print("=== SNMP Distance (OID .14) ===")
snmp_out = subprocess.check_output(
    ['snmpwalk', '-v2c', '-c', 'public', ip, '1.3.6.1.4.1.3902.1012.3.50.12.1.1.14'],
    stderr=subprocess.STDOUT, timeout=30
).decode()

snmp_dist = {}
for line in snmp_out.strip().split('\n'):
    # Parse: iso.3.6.1.4.1.3902.1012.3.50.12.1.1.14.268501248.1.1 = INTEGER: 16045
    m = re.search(r'\.(\d+)\.(\d+)\.(\d+)\s*=\s*INTEGER:\s*(\d+)', line)
    if m:
        pon_index = int(m.group(1))
        onu_slot = int(m.group(2))
        raw_val = int(m.group(4))
        snmp_dist[(pon_index, onu_slot)] = raw_val

print(f"  Got {len(snmp_dist)} SNMP distance entries")

# 2. Get CLI distance for first few ONUs on port 1/1/1 (ponIndex=268501248)
print("\n=== CLI Distance comparison ===")
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

# Check ONUs 1-8 on port 1/1/1
for onu_id in range(1, 9):
    cmd = f'show gpon onu detail-info gpon-onu_1/1/1:{onu_id}'
    sock.sendall(f'{cmd}\r\n'.encode())
    out = read_until(b'#', t=15)
    
    cli_dist = None
    for line in out.split('\n'):
        if 'ONU Distance' in line:
            dm = re.search(r'(\d+)', line.split(':')[1] if ':' in line else line)
            if dm: cli_dist = int(dm.group(1))
    
    snmp_raw = snmp_dist.get((268501248, onu_id))
    if snmp_raw and cli_dist:
        ratio = snmp_raw / cli_dist if cli_dist else 0
        decoded_112 = int(snmp_raw * 0.112)
        print(f"  ONU {onu_id}: SNMP_raw={snmp_raw:6d}  CLI={cli_dist:4d}m  ratio={ratio:.2f}  decode(0.112)={decoded_112}m  {'MISMATCH' if decoded_112 != cli_dist else 'OK'}")
    elif snmp_raw:
        print(f"  ONU {onu_id}: SNMP_raw={snmp_raw:6d}  CLI=N/A (offline?)")
    elif cli_dist:
        print(f"  ONU {onu_id}: SNMP_raw=N/A  CLI={cli_dist}m")

sock.close()
