"use strict"

export class H264Decoder {
    constructor(callback) {
        const frames = this.frames = []
        const args = this.args = []
        function renderFrame() {
            if (frames.length && args.length) {
                const frame = frames.shift()
                callback(frame, ...args.shift())
                frame.close()
            }
            // 120 FPS if >100 frames in queue
            // 60 FPS if >10 frames in queue
            // 30 FPS otherwise
            const fps = frames.length > 100 ? 120 : frames.length > 10 ? 60 : 30
            setTimeout(renderFrame, 1000 / fps)
        }
        renderFrame()
        this.decoder = new VideoDecoder({
            output: frame => frames.push(frame),
            error: x => console.warn(x),
        })
        this.decoder.configure({
            codec: "avc1.42000a",
            optimizeForLatency: true,
        })
    }
    async decode(video_chunk, ...args) {
        const decoder = this.decoder
        try {
            this.args.push(args)
            decoder.decode(new EncodedVideoChunk({
                type: "key",
                timestamp: 0, // Timestamp and duration are useless (microsec)
                data: video_chunk,
            }))
        }
        catch (x) { }
    }
}