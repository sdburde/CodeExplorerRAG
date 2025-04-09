#!/usr/bin/python3

from datetime import datetime
from os.path import exists, splitext, basename
from os import remove, makedirs, sync
from shutil import move
from glob import glob
from time import sleep
import subprocess
from threading import Thread

from psutil import disk_usage

import gi
gi.require_version("Gst", "1.0")
from gi.repository import Gst  # noqa

Gst.init(None)
Gst.debug_set_default_threshold(Gst.DebugLevel.WARNING)


LOCATION = "rtsp://admin:asdf1234@192.168.1.64/Streaming/Channels/101"
FOLDER_NAME = "camera"
MAX_GB = 2


class USBMounter:
    def __init__(self, path):
        self.path = path

    def __enter__(self):
        device_paths = sorted([*glob("/dev/disk/by-id/usb*-part1"),
                               *glob("/dev/disk/by-id/ata*-part1")])
        if not device_paths:
            raise RuntimeError("No USB disk connected")
        device_path = device_paths[0]
        makedirs(self.path, exist_ok=True)
        subprocess.run(["umount", self.path], capture_output=True)
        subprocess.run(["mount", device_path, self.path], check=True)
        print(f"Mounted {device_path} -> {self.path}")
        return self

    def __exit__(self, *args):
        sync()  # Flush write cache for safety remove
        subprocess.run(["umount", self.path])
        print(f"Unmounted {self.path}")


def ffmpeg(*args):
    args = [str(x) for x in args]
    return subprocess.run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *args])


def run_async(f, *args, delay=0):
    def routine():
        sleep(delay)
        f(*args)
    thread = Thread(target=routine)
    thread.start()
    return thread


def generate_thumbnail(path):
    jpg_path = f"{splitext(path)[0]}.jpg"
    if not exists(jpg_path):
        print(f"Generating thumbnail {jpg_path}")
        return ffmpeg("-i", path, "-vf", "scale=-1:128", "-ss", 1,
                      "-vframes", 1, jpg_path)


def remux_videos(video_root):
    for mkv_path in glob(f"{video_root}/*.mkv"):
        path_noext = splitext(mkv_path)[0]
        mp4_path = f"{path_noext}.mp4"
        print(f"Converting {mkv_path} to MP4 BMFF")
        ffmpeg("-i", mkv_path, "-c", "copy", mp4_path)
        remove(mkv_path)


def cleanup(video_root):
    min_free_gb = MAX_GB * 2  # Double max possible video size just to be safe
    min_free = min_free_gb * 1024 * 1024 * 1024
    while True:
        disk_free = disk_usage(video_root).free
        if disk_free > min_free:
            break
        paths = glob(f"{video_root}/*")
        if not paths:
            print(f"Trying to cleanup but folder is empty")
            return
        path = min(paths)
        disk_free_mb = int(disk_free / 1024 / 1024)
        print(f"Insufficient disk space {disk_free_mb} MiB. Remove {path}")
        remove(path)


def do_housekeeping(video_root):
    print(f"Doing housekeeping for {video_root}")
    cleanup(video_root)
    remux_videos(video_root)
    # NOTE: Only generate thumbnail for MP4. Let others handle MKV thumbnail
    [generate_thumbnail(i) for i in glob(f"{video_root}/*.mp4")]


def transfer_to_external(internal_root, external_root, mount_root):
    try:
        with USBMounter(mount_root):
            do_housekeeping(external_root)
            for src in [*glob(f"{internal_root}/*.mp4"),
                        *glob(f"{internal_root}/*.jpg")]:
                dst = f"{external_root}/{basename(src)}"
                print(f"Move {src} -> {dst}")
                move(src, dst)
    except RuntimeError:
        print(f"Unable to mount. Cowardly give up. Retrying in next iteration")


def format_location_callback(sink, fragment_id,
                             internal_root, external_root, mount_root):
    # NOTE: Internal disk housekeeping need to be synchronouse to avoid
    #       messing up (remuxing) newly generated MKV
    do_housekeeping(internal_root)
    run_async(transfer_to_external, internal_root, external_root, mount_root)
    if not exists(internal_root):
        print(f"Create directories before writing {internal_root}")
        makedirs(internal_root)
    stamp = datetime.now().strftime("%Y%m%dT%H%M%SZ")
    location = f"{internal_root}/{stamp}_{fragment_id:08d}.mkv"
    print(f"Writing {location}")
    run_async(generate_thumbnail, location, delay=60)
    return location


def main():

    mount_root = "/mnt/usb"
    internal_root = f"/videos/{FOLDER_NAME}"
    external_root = f"{mount_root}/{FOLDER_NAME}"

    do_housekeeping(internal_root)
    try:
        with USBMounter(mount_root):
            do_housekeeping(external_root)
    except RuntimeError:
        print(f"Unable to mount. Cowardly give up. Retrying in next iteration")

    # NOTE: Use MKV for streamability, but remux to ISOBMFF for compatibility afterwards
    launch = f"""
        rtspsrc location={LOCATION}
        ! parsebin
        ! h265parse
        ! splitmuxsink name=splitmuxsink 
        muxer-factory=matroskamux async-finalize=1
        muxer-properties="properties,streamable=1"
        max-size-bytes={int(MAX_GB * 1024 * 1024 * 1024)} 
    """

    launch = " ".join(launch.split())
    print(launch)
    pipeline = Gst.parse_launch(launch)
    pipeline.get_by_name("splitmuxsink").connect(
        "format-location", format_location_callback,
        internal_root, external_root, mount_root)

    bus = pipeline.get_bus()
    pipeline.set_state(Gst.State.PLAYING)
    print("Pipeline PLAYING")
    while not bus.timed_pop_filtered(1e9, Gst.MessageType.EOS | Gst.MessageType.ERROR):
        pass
    pipeline.set_state(Gst.State.NULL)
    print("Pipeline NULL")


if __name__ == "__main__":
    main()
    print("Pipeline is not supposed to end. Anyway, sleep abit before ending")
