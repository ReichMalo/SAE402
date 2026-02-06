#!/usr/bin/env python3
import http.server
import ssl
import socket

def get_local_ip():
    """Get the local IP address of the machine"""
    try:
        # Create a socket and connect to an external address
        # This doesn't actually send data, just determines the local IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        return local_ip
    except Exception:
        return "127.0.0.1"

server_address = ('0.0.0.0', 8443)
httpd = http.server.HTTPServer(server_address, http.server.SimpleHTTPRequestHandler)

context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.load_cert_chain('cert.pem', 'key.pem')
httpd.socket = context.wrap_socket(httpd.socket, server_side=True)

local_ip = get_local_ip()
print(f'Server running on https://0.0.0.0:8443')
print(f'Access from Quest 3: https://{local_ip}:8443/')
print('Press Ctrl+C to stop')
httpd.serve_forever()
