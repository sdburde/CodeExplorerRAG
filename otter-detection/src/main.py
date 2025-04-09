from decoder import decode_video
from time import sleep
from infer import get_input_shape, Engine
from yolo import decode_yolo
from server import Server, broadcast_tegrastats
from hikvision import ptz, start_time_sync_loop
from analyse import DetectionAnalyser

start_time_sync_loop()

engine_path = "/engines/20250301_best_1280x704_int8.engine"
# engine_path = "/engines/20250207_best_1280x704_int8.engine"
# engine_path = "/engines/yolov7-w6_960_int8.engine"
(_, _, input_height, input_width), *_ = get_input_shape(engine_path)
detection_engine = Engine(engine_path)


def client_message_callback(client, message):
    if "pan" in message or "tilt" in message or "zoom" in message:
        try:
            ptz(**message)
        except:
            client.send(dict(message="Unable to control camera"))


def infer_output_callback(tensors, frame, analyser):
    detections = decode_yolo(tensors[0], [
        dict(index=0, name="otter", confidence=0.01, nms=0.5)
    ])
    analyser(detections, frame=frame["array"], pts=frame["pts"])
    server.broadcast(dict(pts=frame["pts"],
                          detections=analyser.get_detections()))


def start_infer(location):
    analyser = DetectionAnalyser()
    decode_video(
        location,
        h264_callback=server.broadcast,
        raw_callback=lambda frame: detection_engine(
            frame["array"],
            # Others are passed for post-processing
            infer_output_callback, frame, analyser,
        ),
        width=input_width,
        height=input_height,
        framerate=10,
    )


def loop_videos():
    from glob import glob
    from random import shuffle, seed
    seed(0)
    while True:
        # "/storage/videos/site1_tp/20240210T145301Z_00000086_4261_0028.mp4"
        # mp4_paths = glob("/storage/videos/site3_tp/20241216T110546.mp4")
        # mp4_paths = glob("/storage/videos/site3_tp/*.mp4")
        # mp4_paths = glob(
        #     "/storage/videos/site1_tp/20240210T145301Z_00000086_4261_0028.mp4")
        # mp4_paths = glob(
        #     "/storage/videos/*/20241231T075709Z_00000000_0572_0132.mp4")
        mp4_paths = glob(
            "/storage/videos/*/20241231T085523Z_00000000_0810_0072.mp4")
        if not mp4_paths:
            print(f"No MP4 videos to loop")
        shuffle(mp4_paths)
        for mp4_path in mp4_paths:
            start_infer(mp4_path)
            sleep(1)
        sleep(1)


server = Server(message_callback=client_message_callback)
broadcast_tegrastats(server)


def main():

    # loop_videos()
    start_infer("rtsp://admin:asdf1234@192.168.1.64/streaming/channels/101")


if __name__ == "__main__":
    main()
