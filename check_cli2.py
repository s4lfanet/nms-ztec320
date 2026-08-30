#!/usr/bin/env python3
"""Raw Telnet to ZTE OLT to check distance for multiple ONUs."""
import socket, time

ip = '172.16.88.2'
port = 23
user = 'salfanet'
pwd = 'seven789'

def telnet_cmd(ip, port, user, pwd, commands, timeout=10):
    sock = socket.create_connection((ip, port), timeout=timeout)
    sock.settimeout(timeout)
    buf = b''
    
    def read_until(expected, t=timeout):
        nonlocal buf
        end = time.time() + t
        while time.time() < end:
            try:
                data = sock.recv(4096)
                if not data: break
                cleaned = bytearray()
                i = 0
                while i < len(data):
                    if data[i] == 255:  # IAC
                        i += 3
                    else:
                        cleaned.append(data[i])
                        i += 1
                buf += cleaned
                if expected in buf:
                    result = buf
                    buf = b''
                    return result.decode('utf-8', errors='replace')
            except socket.timeout:
                break
        result = buf
        buf = b''
        return result.decode('utf-8', errors='replace')
    
    read_until(b'Username:', t=5)
    sock.sendall(f'{user}\r\n'.encode())
    read_until(b'Password:', t=5)
    sock.sendall(f'{pwd}\r\n'.encode())
    read_until(b'#', t=5)
    
    # Disable pagination
    sock.sendall(b'terminal no pause\r\n')
    read_until(b'#', t=5)
    
    for cmd in commands:
        sock.sendall(f'{cmd}\r\n'.encode())
        out = read_until(b'#', t=15)
        # Extract ONU Distance line
        for line in out.split('\n'):
            line = line.strip()
            if 'ONU Distance' in line:
                print(f"  {cmd.split()[-1]:25s} → {line}")
    
    sock.close()

try:
    telnet_cmd(ip, port, user, pwd, [
        'show gpon onu detail-info gpon-onu_1/1/1:1',
        'show gpon onu detail-info gpon-onu_1/1/1:2',
        'show gpon onu detail-info gpon-onu_1/1/1:3',
        'show gpon onu detail-info gpon-onu_1/1/1:4',
        'show gpon onu detail-info gpon-onu_1/1/1:5',
        'show gpon onu detail-info gpon-onu_1/1/2:1',
        'show gpon onu detail-info gpon-onu_1/1/2:2',
        'show gpon onu detail-info gpon-onu_1/1/3:1',
    ])
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
