"use strict"

import React, { useState, useEffect, useRef } from "react"

import { Icon } from "../mwc/icon"

import { WebSocket2 } from "./websocket"
import { VideoDecoder2 } from "./decoder"
import { drawDetections, drawText, setDimension } from "./canvas"
import { CircularProgress } from "../circular-progress"
import { toHHMMSSff } from "../util"

const DISCONNECTED = "Disconnected"
const CONNECTING = "Connecting"
const DECODING = "Decoding"
const STREAMING = "Streaming"

export function WebSocketVideoPlayer({
    ws_ref, // optional
    url,
    videoPath, // optional
    onFirstFrame,
    onFrame,
    showOverlay,
    verbose,
    extraText,
    style,
    ...props
}) {

    const [videoState, setVideoState] = useState(DISCONNECTED)
    const [urlAndPayload, setUrlAndPayload] = useState({})
    const [decoderKey, setDecoderKey] = useState()

    const fg_fast_ref = useRef()
    const fg_slow_ref = useRef()
    const bg_ref = useRef()

    const decoder_ref = useRef()
    ws_ref = ws_ref || useRef()

    useEffect(_ => {
        if (!url)
            return
        // NOTE: Unique key is added as identical payload and URL may happen
        //       during quick interaction and prevent old WebSocket from cleanedup
        const x = { url, key: +new Date() }
        if (videoPath)
            x.payload = { path: videoPath, height: 720, bitrate: 2048 }
        setUrlAndPayload(x)
        setDecoderKey(+new Date())
        setVideoState(CONNECTING)
    }, [url, videoPath])

    const canvas_style = { width: "100%", position: "absolute" }
    const overlay_style = { position: "absolute", height: "100%", width: "100%" }
    const overlay_icon_color = "#ccc"
    const overlay_background_color = "#0008"

    return <div {...props} style={{
        height: "100%",
        aspectRatio: "16 / 9",
        border: "1px solid #0004",
        // NOTE: Need border-box if not 1px border may disappear
        boxSizing: "border-box",
        position: "relative",
        background: "#888",
        ...style,
    }}>
        <WebSocket2
            ref={ws_ref}
            urlAndPayload={urlAndPayload}
            onOpen={_ => setVideoState(DECODING)}
            onMessage={message => {
                const decoder = decoder_ref.current
                if ("data" in message || "h264" in message)
                    decoder?.decode(message.pts, message.data || message.h264)
                if ("pts" in message || "duration" in message || "detections" in message)
                    decoder?.push_metadata(message.pts, message)
            }}
            onClose={_ => setVideoState(DISCONNECTED)}
        ></WebSocket2>
        <VideoDecoder2
            ref={decoder_ref}
            key={decoderKey} // NOTE: Key for reset alongside WebSocket
            onFirstFrame={async (frame, metadata) => {
                const fg_fast_canvas = fg_fast_ref.current
                const fg_slow_canvas = fg_slow_ref.current
                const bg_canvas = bg_ref.current
                setVideoState(STREAMING)
                setDimension(fg_fast_canvas, frame)
                setDimension(fg_slow_canvas, frame)
                setDimension(bg_canvas, frame)
                bg_canvas.context = bg_canvas.getContext("bitmaprenderer")
                fg_fast_canvas.context = fg_fast_canvas.getContext("2d")
                fg_slow_canvas.context = fg_slow_canvas.getContext("2d")
                // User
                onFirstFrame?.(frame, metadata)
            }}
            onFrame={async (frame, metadata) => {
                // console.log(frame, metadata)
                const fg_fast_canvas = fg_fast_ref.current
                const fg_slow_canvas = fg_slow_ref.current
                const bg_canvas = bg_ref.current
                // NOTE: Using bitmaprenderer context for 2x efficiency.
                //       2d context uses 90% CPU on throttled i5-8250U,
                //       bitmaprenderer context uses 50% only 
                const image_bitmap = await createImageBitmap(frame)
                bg_canvas.context.transferFromImageBitmap(image_bitmap)

                const iw = bg_canvas.width
                const ih = bg_canvas.height
                const text_params = {
                    height: ih * 0.04, font: "Inconsolata, Arial, sans-serif",
                    background: "#0008", color: "#fffc",
                }
                if (metadata?.detections || extraText) {
                    fg_slow_canvas.context.clearRect(0, 0, iw, ih)
                    if (metadata?.detections)
                        drawDetections(fg_slow_canvas.context, metadata.detections)
                    if (extraText)
                        drawText(fg_slow_canvas.context, extraText, 8, 8, {
                            ...text_params, baseline: "bottom", align: "right",
                        })
                }

                if (metadata?.pts) {
                    fg_fast_canvas.context.clearRect(0, 0, iw, ih)
                    let text = `${toHHMMSSff(metadata.pts)}`
                    if (metadata.duration)
                        text += `/${toHHMMSSff(metadata.duration)}`
                    drawText(fg_fast_canvas.context, text, 8, 8, {
                        ...text_params, align: "right"
                    })
                }

                onFrame?.(frame, metadata)
            }}
        ></VideoDecoder2>
        <canvas ref={bg_ref} style={canvas_style}></canvas>
        <canvas ref={fg_fast_ref} style={{ ...canvas_style, ...!showOverlay && { display: "none" } }}></canvas>
        <canvas ref={fg_slow_ref} style={{ ...canvas_style, ...!showOverlay && { display: "none" } }}></canvas>
        {
            videoState == DISCONNECTED ?
                <div style={{
                    ...overlay_style,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: overlay_icon_color,
                    background: overlay_background_color,
                    "--mdc-icon-size": "3rem",
                }}>
                    <Icon>videocam_off</Icon>
                </div> :
                videoState != STREAMING ?
                    <CircularProgress
                        color={overlay_icon_color} background={overlay_background_color}
                        style={{ height: "100%", ...canvas_style }}
                        text={verbose && videoState}
                    >
                    </CircularProgress> : null
        }
    </div >
}