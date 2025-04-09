#!/usr/bin/python3

import msgpack
import gi
from tornado.ioloop import IOLoop
from tornado.web import Application, RequestHandler
from tornado.websocket import WebSocketHandler
from tornado.escape import json_encode, json_decode

from psutil import disk_usage

import subprocess
import re
from os import remove
from os.path import getsize, basename, splitext, getsize, isfile, exists
from glob import glob
import asyncio
import concurrent.futures

from recorder import USBMounter

gi.require_version("Gst", "1.0")
from gi.repository import Gst  # noqa

Gst.init(None)

CAMERA_NAME = "camera"
MOUNT_PATH = "/mnt/usb"
INTERNAL_ROOT = f"/videos/{CAMERA_NAME}"
EXTERNAL_ROOT = f"{MOUNT_PATH}/{CAMERA_NAME}"


class Context:
    pass


def external_or_internal_path(path):
    external_path = f"{EXTERNAL_ROOT}/{path}"
    internal_path = f"{INTERNAL_ROOT}/{path}"
    if exists(external_path):
        return external_path
    if exists(internal_path):
        return internal_path
    print(f"Not exists in both internal and external roots: {path}")


async def to_thread(f, *args, **kwargs):
    ioloop = asyncio.get_running_loop()
    with concurrent.futures.ThreadPoolExecutor() as pool:
        return await ioloop.run_in_executor(pool, f, *args, **kwargs)


def run(cmd, *args, **kwargs):
    return subprocess.run(" ".join(cmd.split()), shell=True, *args, **kwargs)


def pass_cb(sink, appsrc, signal):
    appsrc.emit("push-sample", sink.emit(signal))
    return Gst.FlowReturn.OK


def to_time_string(seconds):
    days, seconds = divmod(seconds, 24 * 3600)
    hours, seconds = divmod(seconds, 3600)
    minutes, seconds = divmod(seconds, 60)
    time_string = f"{seconds:05.2f}"
    if minutes:
        time_string = f"{minutes:02.0f}:{time_string}"
    if hours:
        time_string = f"{hours:02.0f}:{time_string}"
    if days:
        time_string = f"{days:.0f}:{time_string}"
    return time_string


def get_video_list_and_disk_usage():
    paths = glob(f"{EXTERNAL_ROOT}/*.m??")
    paths_by_basename = {basename(x): x for x in paths}
    for x in glob(f"{INTERNAL_ROOT}/*.m??"):
        bname = basename(x)
        if bname not in paths_by_basename:
            paths_by_basename[bname] = x
    # Sort by basename
    paths = sorted(list(paths_by_basename.items()), key=lambda x: x[0])
    video_list = [dict(path=bname, size=getsize(p)) for bname, p in paths]
    usage = disk_usage(EXTERNAL_ROOT)
    return dict(
        list=video_list,
        disk_usage=dict(total=usage.total, used=usage.used),
    )


IOLOOP = IOLoop.current()


def parse_launch(launch):
    launch = " ".join(launch.split())
    print(launch)
    return Gst.parse_launch(launch)


class PipelineHandler(WebSocketHandler):

    def check_origin(self, x):
        if x.startswith("http://localhost:"):
            return True
        return re.match(r"^https://\S+.v3nity.com$", x)

    def open(self):
        print("open")
        self.pipeline = None
        self.pipeline2 = None
        self.duration = None
        self.start = None

    def on_close(self):
        print("close")
        self.cleanup()

    def cleanup(self):
        if self.pipeline:
            self.pipeline.set_state(Gst.State.NULL)
        if self.pipeline2:
            self.pipeline2.set_state(Gst.State.NULL)

    def seek(self, position):
        # Flush transcoding pipeline
        sink_pad = self.pipeline2.get_by_name("appsink").get_static_pad("sink")
        sink_pad.send_event(Gst.Event.new_flush_start())
        self.pipeline.seek_simple(
            Gst.Format.TIME, Gst.SeekFlags.FLUSH | Gst.SeekFlags.KEY_UNIT,
            int(position * 1e9),
        )
        sink_pad.send_event(Gst.Event.new_flush_stop(False))

    def on_message(self, message):

        # message = json_decode(message)
        message = msgpack.loads(message)
        if message is None:  # Keep alive ping
            return

        path = message.get("path")
        if path:

            height = int(message.get("height", 540))
            bitrate_kbps = int(message.get("bitrate", 2048))

            self.cleanup()
            self.location = location = external_or_internal_path(path)
            assert isfile(location), f"{location} is not a file"
            assert not self.pipeline and not self.pipeline2, f"Pipeline must be inactive"
            self.pipeline = p1 = parse_launch(f"""
                filesrc location={location}
                ! parsebin
                ! appsink sync=1 emit-signals=1 name=appsink
            """)
            # NOTE: Transcoding pipeline, not for manipulation
            # NOTE: Need separate else nvv4l2h264enc will not generate back seek frames
            bitrate = bitrate_kbps * 1024
            self.pipeline2 = p2 = parse_launch(f"""
                appsrc name=appsrc
                ! nvv4l2decoder disable-dpb=1
                ! nvvidconv interpolation-method=5-Tap
                ! video/x-raw(memory:NVMM),height=[1,{height}],pixel-aspect-ratio=1/1
                ! nvv4l2h264enc control-rate=variable_bitrate insert-sps-pps=1 idrinterval=100
                bitrate={bitrate} peak-bitrate={bitrate * 2}
                ! appsink sync=0 emit-signals=1 name=appsink      
            """)
            appsink = p1.get_by_name("appsink")
            appsrc = p2.get_by_name("appsrc")
            appsink.connect("new-sample", pass_cb, appsrc, "pull-sample")
            appsink.connect("new-preroll", pass_cb, appsrc, "pull-preroll")
            p2.get_by_name("appsink").connect(
                "new-sample", self.appsink_callback)
            p2.set_state(Gst.State.PLAYING)
            p1.set_state(Gst.State.PAUSED)

        if self.pipeline:
            play = message.get("play", False)
            pause = message.get("pause", False)
            seek = message.get("seek", None)
            step = message.get("step", None)

            if play:
                print("PLAY")
                self.pipeline.set_state(Gst.State.PLAYING)

            if pause:
                print("PAUSE")
                self.pipeline.set_state(Gst.State.PAUSED)

            if seek is not None:
                self.seek(seek)

            if step is not None:
                ret, pos = self.pipeline.query_position(Gst.Format.TIME)
                if ret:
                    self.seek(pos * 1e-9 + float(step))

    def write_message_callback(self, message):
        self.write_message(msgpack.dumps(message), binary=True)

    # NOTE: WRONG DURATION MANAGEMENT

    def appsink_callback(self, sink):

        sample = sink.emit("pull-sample")
        buffer = sample.get_buffer()
        data = buffer.extract_dup(0, buffer.get_size())

        # NOTE: PTS in playback context, not transcoding context
        # Try to get playback video duration
        if self.duration is None:
            retval, d = self.pipeline.query_duration(Gst.Format.TIME)
            if retval:
                self.duration = d * 1e-9
                print(f"Obtained video duration {self.duration:.3f}s")
            try:
                cmd = f"""
                    ffprobe -loglevel error {self.location}
                    -show_entries format=start_time -of csv=p=0
                """
                cmd = " ".join(cmd.split())
                pipe = run(cmd, stdout=subprocess.PIPE)
                self.start = float(pipe.stdout)
                print(f"Obtained video start time {self.start:.3f}s")
            except Exception as e:
                print(e)
        message = dict(
            data=data,
            pts=self.pipeline.query_position(Gst.Format.TIME)[-1] * 1e-9,
            duration=self.duration,
            start=self.start,
        )
        IOLOOP.add_callback(self.write_message_callback, message)
        return Gst.FlowReturn.OK


class VideoHandler(RequestHandler):
    async def get(self):
        self.write(json_encode(get_video_list_and_disk_usage()))

    async def post(self):
        message = json_decode(self.request.body)
        path = message.get("path")
        start = message.get("start")
        duration = message.get("duration")
        path_basename, ext = splitext(basename(path))
        src_path = external_or_internal_path(path)
        # NOTE: Output extension is overriden to MP4 regardless of input ext
        dst_basename = f"{path_basename}_{start:04.0f}_{duration:04.0f}.mp4"
        dst_path = f"/tmp/{dst_basename}"
        command = f"""
            ffmpeg -hide_banner -loglevel error 
            -i {src_path} -ss {start} -t {duration} -c copy {dst_path}
        """
        command = " ".join(command.split())
        print(command)
        pipe = await asyncio.create_subprocess_shell(command)
        await pipe.communicate()
        assert pipe.returncode in [0], pipe.returncode

        self.set_header("Content-Type", "application/octet-stream")
        self.set_header("Content-Disposition",
                        f'attachment; filename="{dst_basename}"')

        chunk_kb = 128
        with open(dst_path, "rb") as file:
            while True:
                chunk = file.read(chunk_kb * 1024)
                if not chunk:
                    break
                self.write(chunk)
                await self.flush()
        self.finish()
        remove(dst_path)
        print(f"Deleted {dst_path}")

    async def delete(self):
        # NOTE: reconstruct path for security
        path = "/".join(self.request.body.decode().split("/")[-2:])
        path = external_or_internal_path(path)
        assert isfile(path), f"{path} is not a file"
        glob_pattern = f"{splitext(path)[0]}.*"  # NOTE: include JPG or others
        for i in glob(glob_pattern):
            print(f"Removing {i}")
            remove(i)
        self.write(json_encode(get_video_list_and_disk_usage()))


class ThumbnailHandler(RequestHandler):
    def get(self, x):
        # NOTE: Thumbnail JPG can be either on external or internal disk
        with open(external_or_internal_path(x), "rb") as f:
            self.write(f.read())


class VideoDownloadHandler(RequestHandler):
    async def get(self, x):
        path = external_or_internal_path(x)
        print(f"Download {path}")
        self.set_header("Content-Type", "application/octet-stream")
        self.set_header("Content-Disposition",
                        f'attachment; filename="{basename(path)}"')
        chunk_kb = 128
        with open(path, "rb") as file:
            while True:
                chunk = file.read(chunk_kb * 1024)
                if not chunk:
                    break
                self.write(chunk)
                await self.flush()
        self.finish()


def main():

    with USBMounter(MOUNT_PATH):
        Application([
            (r"/ws", PipelineHandler),
            (r"/video", VideoHandler),
            (r"/(.*\.jpg)", ThumbnailHandler),
            (r"/(.*\.m..)", VideoDownloadHandler),
        ], websocket_max_message_size=128 * 1024 * 1024,  # MiB
        ).listen(80)
        IOLOOP.start()


if __name__ == "__main__":
    main()
