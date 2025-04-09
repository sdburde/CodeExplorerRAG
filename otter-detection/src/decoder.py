import numpy
import gi

gi.require_version("Gst", "1.0")
from gi.repository import Gst  # noqa
Gst.init(None)
# Gst.debug_set_default_threshold(Gst.DebugLevel.WARNING)


def raw_sample_cb(appsink, key, callback):
    sample = appsink.emit("pull-sample")
    pts = sample.get_buffer().pts * 1e-9
    array = sample_to_array(sample)
    callback(dict(pts=pts, array=array))
    return Gst.FlowReturn.OK


def h264_sample_cb(appsink, callback):
    sample = appsink.emit("pull-sample")
    buffer = sample.get_buffer()
    pts = buffer.pts * 1e-9
    data = buffer.extract_dup(0, buffer.get_size())
    callback(dict(pts=pts, h264=data))
    return Gst.FlowReturn.OK


def sample_to_array(sample):
    buffer = sample.get_buffer()
    caps = sample.get_caps().get_structure(0)
    w = caps.get_value("width")
    h = caps.get_value("height")
    c = buffer.get_size() // w // h
    success, map_info = buffer.map(Gst.MapFlags.READ)
    array = numpy.ndarray((h, w, c), numpy.uint8, map_info.data)
    # BGRx to BGR. Note: VIC need BGRx instead of BGR
    array = array[:, :, :3]
    buffer.unmap(map_info)
    return array


def connect(pipeline, name, *args, **kwargs):
    pipeline.get_by_name(name).connect("new-sample", *args, **kwargs)


def decode_video(src, h264_callback, raw_callback,
                 width=640, height=640, framerate=10, bitrate_kbps=2048):
    if src.startswith("rtsp:"):
        src_element = "rtspsrc latency=0"
    else:
        src_element = "filesrc"
    launch = f"""
        {src_element} location="{src}" 
        ! parsebin ! nvv4l2decoder ! tee name=t
        t. ! queue 
        ! nvvidconv interpolation-method=5-Tap
        ! video/x-raw(memory:NVMM),height=[1,540],pixel-aspect-ratio=1/1
        ! nvv4l2h264enc control-rate=variable_bitrate insert-sps-pps=1 
        bitrate={bitrate_kbps*1024} idrinterval=100
        ! appsink name=appsink_h264 emit-signals=1
        t. ! queue 
        ! videorate ! video/x-raw(memory:NVMM),framerate={framerate}/1
        ! nvvidconv interpolation-method=5-Tap
        ! video/x-raw,width={width},height={height},format=RGBA
        ! appsink name=appsink_infer emit-signals=1
    """
    launch = " ".join(launch.split())
    print(launch)
    pipeline = Gst.parse_launch(launch)
    # Reset context states
    connect(pipeline, "appsink_h264", h264_sample_cb, h264_callback)
    connect(pipeline, "appsink_infer", raw_sample_cb, "array", raw_callback)
    pipeline.set_state(Gst.State.PLAYING)
    message_types = Gst.MessageType.ERROR | Gst.MessageType.EOS
    bus = pipeline.get_bus()
    try:
        while not bus.timed_pop_filtered(int(0.1 * 1e9), message_types):
            pass
    except KeyboardInterrupt:
        pass
    pipeline.set_state(Gst.State.NULL)
    print("Pipeline end")
