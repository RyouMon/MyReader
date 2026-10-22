"""Local, isolated DAV transport for real UI tests; no product database writes."""
import sys
from cheroot import wsgi
from wsgidav.wsgidav_app import WsgiDAVApp

root, port = sys.argv[1:]
app = WsgiDAVApp({
    "provider_mapping": {"/": root},
    "simple_dc": {"user_mapping": {"*": {"maestro": {"password": "fixture-webdav-key"}}}},
    "http_authenticator": {"accept_basic": True, "accept_digest": False, "default_to_digest": False},
    "verbose": 1,
})
server = wsgi.Server(("127.0.0.1", int(port)), app)
try:
    print(f"Starting WebDAV fixture on http://127.0.0.1:{port}", flush=True)
    server.start()
finally:
    server.stop()
