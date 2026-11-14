"""Run the real pinned ZenML runtime against a local fixture, without publishing."""
import json
import os
import tempfile
import threading
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

with tempfile.TemporaryDirectory(prefix='social-zenml-qa-') as directory:
    root = Path(directory)
    secret = 'qa-token-' + uuid.uuid4().hex
    lease = str(uuid.uuid4())
    token_file = root / 'token'
    token_file.write_text(secret)
    os.environ.update(ZENML_ANALYTICS_OPT_IN='false', ZENML_CONFIG_PATH=str(root/'config'),
                      SOCIAL_WORKER_TOKEN_FILE=str(token_file), SOCIAL_JOB_LEASE=lease)
    received = []
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass
        def do_POST(self):
            assert self.path == '/execute'
            assert self.headers['Authorization'] == 'Bearer ' + secret
            body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            assert body['lease'] == lease
            uuid.UUID(body['zenmlRunId'])
            received.append(body)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'jobId':body['id'],'zenmlRunId':body['zenmlRunId'],
                                         'status':'completed','inputHash':'a'*64,'resultHash':'b'*64}).encode())
    server = HTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    os.environ['SOCIAL_BACKEND'] = 'http://127.0.0.1:' + str(server.server_port)
    import pipelines
    from zenml.client import Client
    client = Client()
    try:
        for name in pipelines.PIPELINES:
            getattr(pipelines, name)(intent_id=str(uuid.uuid4()), input_hash='a'*64)
        # Same intent still runs twice: caching must not suppress the API guard.
        fixed = str(uuid.uuid4())
        for _ in range(2):
            pipelines.social_content_intake(intent_id=fixed, input_hash='a'*64)
        assert len(received) == 10
        assert len({r['zenmlRunId'] for r in received}) == 10
        for file in root.rglob('*'):
            if file.is_file() and file != token_file:
                data = file.read_bytes()
                assert secret.encode() not in data, 'Worker credential persisted in runtime files'
                assert lease.encode() not in data, 'Lease persisted in runtime files'
        print('All eight real ZenML pipelines executed; cache disabled; no worker token or lease persisted.')
    finally:
        server.shutdown()
