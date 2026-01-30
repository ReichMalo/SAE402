#!/usr/bin/env python3
import http.server
import ssl
import socket
import os

def get_local_ip():
    """Get the local IP address of the machine"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        return local_ip
    except Exception:
        return "127.0.0.1"

# Change to parent directory to serve from root
os.chdir('..')

server_address = ('0.0.0.0', 8443)
httpd = http.server.HTTPServer(server_address, http.server.SimpleHTTPRequestHandler)

# Load SSL certificates
context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
try:
    context.load_cert_chain('cert.pem', 'key.pem')
    httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
    
    local_ip = get_local_ip()
    print(f'Server running on https://0.0.0.0:8443')
    print(f'Access from this computer: https://localhost:8443/CANNON/')
    print(f'Access from Quest 3 (on same network): https://{local_ip}:8443/CANNON/')
    print('Press Ctrl+C to stop')
    httpd.serve_forever()
except FileNotFoundError:
    print("Error: cert.pem or key.pem not found!")
    print("Make sure you're running this from the SAE402 directory")
    print("Certificates should be in SAE402/cert.pem and SAE402/key.pem")
except Exception as e:
    print(f"Error: {e}")
