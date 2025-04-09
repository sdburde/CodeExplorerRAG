from threading import Thread
import re

from tornado.websocket import WebSocketHandler
from tornado.web import Application, RequestHandler
from tornado.ioloop import IOLoop
import msgpack


class StreamHandler(WebSocketHandler):

    def check_origin(self, origin):
        if re.match(f"http://localhost(:\d+)?", origin):
            return True
        elif origin in ["https://ai.v3nity.com"]:
            return True
        else:
            print(f"CORS {origin}")

    def initialize(self, ioloop, clients, open_callback=None, message_callback=None):
        self.ioloop = ioloop
        self.clients = clients
        self.open_callback = open_callback
        self.message_callback = message_callback

    def serialise_and_write_message(self, x):
        x = msgpack.dumps(x)
        try:
            self.write_message(x, binary=True)
        except:
            pass

    def send(self, x):
        self.ioloop.add_callback(self.serialise_and_write_message, x)

    def open(self):
        self.clients.add(self)
        print(f"WebSocket {hex(id(self))} open. {len(self.clients)} clients")
        self.ioloop.call_later(100, self.close)  # Timeout
        if self.open_callback:
            self.open_callback(self)

    def on_close(self):
        self.clients.discard(self)
        print(f"WebSocket {hex(id(self))} close. {len(self.clients)} clients")

    def on_message(self, message):
        if self.message_callback:
            self.message_callback(self, msgpack.loads(message))


DEVICE_NAME_PATH = "/storage/device_name"


class NameHandler(RequestHandler):
    def get(self):
        try:
            with open(DEVICE_NAME_PATH) as f:
                data = f.read().strip()
                print(f"GET {DEVICE_NAME_PATH} -> {data}")
                self.write(data)
        except FileNotFoundError:
            pass

    def put(self):
        data = self.request.body.decode().strip()
        with open(DEVICE_NAME_PATH, "w") as f:
            f.write(data)
        print(f"PUT {DEVICE_NAME_PATH} <- {data}")


def start_server(port=80, **kwargs):
    ioloop = IOLoop.current()
    Application([
        (r"/stream", StreamHandler, dict(ioloop=ioloop, **kwargs)),
        (r"/name", NameHandler),
    ]).listen(port)
    ioloop.start()


class Server:

    def __init__(self, **kwargs):
        self.clients = set()
        thread = Thread(target=start_server, daemon=True,
                        kwargs=dict(clients=self.clients, **kwargs))
        thread.start()

    def broadcast(self, message):
        # NOTE: size may change during broadcast
        [client.send(message) for client in list(self.clients)]


def broadcast_tegrastats_routine(server):
    import subprocess
    p = subprocess.Popen("tegrastats", stdout=subprocess.PIPE)
    while True:
        line = p.stdout.readline().decode().strip()
        if line:
            tj = float(line.split("tj@")[1].split("C")[0])
            vdd_in = float(line.split("VDD_IN ")[1].split("mW")[0]) / 1000
            message = dict(tegrastats=dict(tj=tj, vdd_in=vdd_in))
            server.broadcast(message)


def broadcast_tegrastats(server):
    thread = Thread(target=broadcast_tegrastats_routine, args=(server,),
                    daemon=True)
    thread.start()
    return thread
