FROM nvcr.io/nvidia/l4t-jetpack:r35.4.1

RUN apt-get update && apt-get install --yes python3-pip
RUN apt-get update && apt-get install --yes python3-gst-1.0
RUN pip3 install numpy==1.23.5
RUN pip3 install tqdm
RUN pip3 install pycuda

RUN apt-get update && apt-get install --yes git
RUN git clone --depth 1 https://github.com/WongKinYiu/yolov7
RUN pip3 install opencv-python pandas requests pyyaml matplotlib seaborn scipy onnx
RUN pip3 install torch==1.10.1 torchvision==0.11.2
RUN pip3 install tornado msgpack
RUN apt-get update && apt-get install --yes ffmpeg
RUN pip3 install psutil
RUN pip3 install epevermodbus

RUN cp /usr/src/tensorrt/bin/trtexec /usr/local/bin/
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 TZ=GMT-8