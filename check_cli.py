#!/usr/bin/env python3
"""Raw Telnet to ZTE OLT to check distance format."""
import socket, time, sys

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
                # Strip IAC bytes
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
    
    # Login
    read_until(b'Username:', t=5)
    sock.sendall(f'{user}\r\n'.encode())
    read_until(b'Password:', t=5)
    sock.sendall(f'{pwd}\r\n'.encode())
    read_until(b'#', t=5)
    
    results = []
    for cmd in commands:
        sock.sendall(f'{cmd}\r\n'.encode())
        out = read_until(b'#', t=15)
        results.append(out)
        print(f"=== {cmd} ===")
        print(out[:2000])
        print()
    
    sock.close()
    return results

try:
    telnet_cmd(ip, port, user, pwd, [
        'show gpon onu detail-info gpon-onu_1/1/1:2',
    ])
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
