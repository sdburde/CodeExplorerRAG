from os.path import exists
from threading import Thread
from queue import Queue

import numpy
import tensorrt
import pycuda.driver as cuda


def infer_routine(engine_path, queue):
    """ GPU dedicated thread """
    cuda.init()
    cuda.Device(0).make_context()

    with open(engine_path, "rb") as f:
        logger = tensorrt.Logger(tensorrt.Logger.WARNING)
        runtime = tensorrt.Runtime(logger)
        engine = runtime.deserialize_cuda_engine(f.read())
    inputs, outputs, bindings = [], [], []
    for binding in engine:
        shape = engine.get_tensor_shape(binding)
        size = tensorrt.volume(shape)
        dtype = tensorrt.nptype(engine.get_tensor_dtype(binding))
        host = cuda.pagelocked_empty(size, dtype)
        device = cuda.mem_alloc(host.nbytes)
        bindings.append(int(device))
        mode = engine.get_tensor_mode(binding)
        in_out = inputs if mode == tensorrt.TensorIOMode.INPUT else outputs
        in_out.append({"host": host, "device": device, "shape": shape})
    # NOTE: Assume (3, 80, 80, 57) (15, 8400), take (15, 8400)
    in0 = min(inputs, key=lambda x: len(x["shape"]))
    engine_context = engine.create_execution_context()
    stream = cuda.Stream()
    while True:
        image, callback, args, kwargs = queue.get()
        in0["host"][:] = image
        cuda.memcpy_htod_async(in0["device"], in0["host"], stream)
        engine_context.execute_async_v2(bindings, stream.handle)
        for out in outputs:
            cuda.memcpy_dtoh_async(out["host"], out["device"], stream)
        stream.synchronize()
        tensors = [x["host"].reshape(x["shape"]).copy().squeeze()
                   for x in outputs]
        callback(tensors, *args, **kwargs)


def get_input_shape(engine_path):
    runtime = tensorrt.Runtime(tensorrt.Logger(tensorrt.Logger.WARNING))
    with open(engine_path, "rb") as f:
        engine = runtime.deserialize_cuda_engine(f.read())
    for binding in engine:
        if engine.get_tensor_mode(binding) == tensorrt.TensorIOMode.INPUT:
            yield engine.get_tensor_shape(binding)


class Engine:

    def __init__(self, engine_path):
        if not exists(engine_path):
            raise FileNotFoundError(engine_path)
        self.input_shapes = list(get_input_shape(engine_path))
        self.queue = Queue(maxsize=1)
        Thread(target=infer_routine,
               args=(engine_path, self.queue), daemon=True).start()

    def __call__(self, image, callback, *args, **kwargs):
        if self.queue.full():
            return
        image = image.astype(numpy.float32) / 255
        image = numpy.transpose(image, (2, 0, 1))
        image = image.ravel()
        self.queue.put((image, callback, args, kwargs))
