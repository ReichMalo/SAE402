#!/usr/bin/env python3
import http.server
import ssl
import socket
import os
import sys

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

# Ensure we serve files from the VR directory (directory of this script)
base_dir = os.path.dirname(os.path.abspath(__file__))
try:
    os.chdir(base_dir)
except Exception:
    pass

server_address = ('0.0.0.0', 8443)
httpd = http.server.HTTPServer(server_address, http.server.SimpleHTTPRequestHandler)

# Load SSL certificates from the VR directory
context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
cert_path = os.path.join(base_dir, 'cert.pem')
key_path = os.path.join(base_dir, 'key.pem')
try:
    context.load_cert_chain(cert_path, key_path)
    httpd.socket = context.wrap_socket(httpd.socket, server_side=True)

    local_ip = get_local_ip()
    print(f'Serving directory: {base_dir}')
    print(f'Server running on https://0.0.0.0:8443')
    print(f'Access from this computer: https://localhost:8443')
    print(f'Access from other device on network: https://{local_ip}:8443')
    print('Press Ctrl+C to stop')
    httpd.serve_forever()
except FileNotFoundError:
    print("Error: cert.pem or key.pem not found in VR directory!")
    print(f"Expected cert at: {cert_path}")
    print(f"Expected key at: {key_path}")
    print("Make sure the certificate files exist in the VR folder or adjust the paths.")
except Exception as e:
    print(f"Error: {e}")
