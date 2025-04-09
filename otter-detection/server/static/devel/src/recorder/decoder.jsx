"use strict"

import { useEffect, useRef, useImperativeHandle } from "react"

export function VideoDecoder2({ ref, onFirstFrame, onFrame, fps = 25 }) {

    const frames_ref = useRef([])
    const metadata_ref = useRef([])
    const decoder_ref = useRef()
    const timer_ref = useRef()
    const has_first_frame_ref = useRef(false)

    function tick() {

        const frames = frames_ref.current
        const metadata = metadata_ref.current
        // Discard overflow
        const maxsize = fps
        while (frames.length > maxsize)
            frames.shift().close()
        while (metadata.length > maxsize)
            metadata.shift()

        if (frames.length) {
            const frame = frames.shift()
            try {
                let meta
                if (metadata.length && metadata[0].timestamp <= frame.timestamp)
                    meta = metadata.shift().metadata
                if (!has_first_frame_ref.current) {
                    onFirstFrame?.(frame, meta)
                    has_first_frame_ref.current = true
                }
                onFrame?.(frame, meta)
                // console.log(chunks.length, metadata.length)
            }
            catch (e) { console.warn(e) }
            frame.close()
        }
    }

    useEffect(_ => {
        const frames = frames_ref.current
        const metadata = metadata_ref.current
        const decoder = decoder_ref.current = new VideoDecoder({
            output: frame => frames.push(frame),
            error: error => console.warn(error),
        })
        const timer = timer_ref.current = setInterval(tick, 1000 / fps * 0.9)
        return _ => {
            console.log("Decoder close")
            decoder.close()
            while (frames.length) frames.shift().close()
            metadata.length = 0
            clearInterval(timer)
        }
    }, [])

    function decode(t, data) {
        const decoder = decoder_ref.current
        if (decoder?.state == "unconfigured") {
            const codec = parseCodecString(data)
            if (codec) {
                console.log("Decoder configure", codec)
                decoder.configure({ codec: codec, optimizeForLatency: true })
            }
        }
        if (decoder.state == "configured") {
            t = Math.round(t * 1e6)
            const chunk = new EncodedVideoChunk({ type: "key", timestamp: t, data })
            try { decoder.decode(chunk) }
            catch (error) { console.warn(error) }
        }
    }

    function push_metadata(t, x) {
        t = Math.round(t * 1e6)
        metadata_ref.current.push({ timestamp: t, metadata: x })
    }

    useImperativeHandle(ref, _ => ({ decode, push_metadata }))

    return null
}


function parseCodecString(data) {
    const NALU_PREFIX = String.fromCharCode(0x00, 0x00, 0x01)
    let decoded = ""
    const s = 1000
    for (let i = 0; i < data.length; i += s)
        decoded += String.fromCharCode(...data.slice(i, i + s))
    const nalus = decoded.split(NALU_PREFIX)
    const sps = nalus.filter(x => (x.charCodeAt(0) & 0x1f) == 7) // SPS
    if (sps.length)
        return `avc1.${Array.from(sps[0].slice(1, 4)).map(x => x.charCodeAt(0).toString(16).padStart(2, 0)).join("")}`
}
