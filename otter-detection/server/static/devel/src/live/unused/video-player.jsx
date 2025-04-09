"use strict"

import React, { useState, useEffect, useRef } from "react"
import { decode } from "@msgpack/msgpack"

import { Snackbar } from "../mwc/snackbar"
import { Icon } from "../mwc/icon"

import { CircularProgress } from "../circular-progress"
import { drawDetections, drawText } from "./draw"
import { CameraControl } from "./camera-control"
import { getDeviceName } from "../util"

function toDurationString(seconds) { // to DD:HH:MM:SS.fff
    const days = Math.round(seconds / 24 / 3600)
    let stamp = `${new Date(seconds * 1e3).toISOString().slice(11, 22)}`
    return days > 0 ? `${days}d ${stamp}` : stamp
}

export function VideoPlayer({ device_number, framerate = 30, ptz, overlay, ...props }) {

    function cleanup() {
        console.log(`Close WebSocket ${device_number}`)
        ws?.close()
        video_decoder?.close()
        h264_buffer.length = 0
    }

    function setupVideoDecoder() {
        const video_decoder = new VideoDecoder({
            output: async frame => {
                if (!has_decoded_frame) {
                    setOverlayMessage()
                    has_decoded_frame = true
                }
                const bg_canvas = bg_ref.current
                const fg_canvas = fg_ref.current
                try {
                    if (!bg_canvas.context) {
                        bg_canvas.context = bg_canvas.getContext("bitmaprenderer")
                        fg_canvas.context = fg_canvas.getContext("2d")
                        bg_canvas.width = frame.codedWidth
                        bg_canvas.height = frame.codedHeight
                        fg_canvas.width = frame.codedWidth
                        fg_canvas.height = frame.codedHeight
                    }
                    const image_bitmap = await createImageBitmap(frame)
                    bg_canvas.context.transferFromImageBitmap(image_bitmap)
                }
                catch (e) {
                    console.warn(e)
                    cleanup()
                }
                frame.close()
            },
            error: error => console.warn(error),
        })
        video_decoder.configure({ codec: "avc1.42000a", optimizeForLatency: true })
        return video_decoder
    }

    function onWebSocketMessage(e) {
        const message = decode(e.data)

        if (message.message) {
            setSnackbarMessage(message.message)
            setOpenSnackbar(true)
        }

        if (message.h264) {
            h264_buffer.push(message.h264)
            while (h264_buffer.length > 10) { // leaky
                h264_buffer.shift()
                // console.log("Overflow")
            }
        }

        if (message.detections) {
            const fg_context = fg_ref.current?.context
            if (fg_context) {
                const ih = fg_context.canvas.height
                const text_height = ih * 0.04
                drawDetections(fg_context, message.detections)
                drawText(fg_context, toDurationString(message.pts), 8, 8, {
                    color: "#fff", background: "#0008", family: "Inconsolata",
                    height: text_height, baseline: "top", align: "right",
                })
                // NOTE: Bottom left may show PTZ values
                drawText(fg_context, deviceName, 8, 8, {
                    color: "#fff", background: "#0008", family: "Inconsolata",
                    height: text_height, baseline: "bottom", align: "right",
                })
            }
        }
    }

    function handleDisconnect() {
        setDisconnected(true)
        setCanReconnect(false)
        // Reconnection cooldown
        setTimeout(_ => setCanReconnect(true), 1000)
    }

    async function connectWebSocket() {
        setDisconnected(false)
        setOverlayMessage(`Connecting`)
        has_decoded_frame = false
        const subdir = location.pathname.split("/")[1]
        const ws_root = `${location.host}/${subdir}/${device_number}`
        let ws_url = `wss://${ws_root}/api/stream`
        if (device_number == 1)
            ws_url = `wss://${ws_root}/api`
        // NOTE: Checking before connecting to prevent WS stuck in CONNECTING 
        // causing other WS to stuck as well
        let response
        try {
            response = await fetch(
                `https://${ws_root}/`, { signal: AbortSignal.timeout(10000) })
        }
        catch {
            handleDisconnect()
        }
        // Expects 400 Bad request: Can "Upgrade" only to "WebSocket"
        if (response.status == 200) {
            ws = new WebSocket(ws_url)
            ws.binaryType = "arraybuffer"
            ws.addEventListener("open", _ => {
                setOverlayMessage("Decoding")
                console.log(`Connected ${deviceName}`)
            })
            ws.addEventListener("close", _ => {
                handleDisconnect()
                console.log(`${deviceName} is disconnected`)
            })
            ws.addEventListener("message", onWebSocketMessage)
            setWebSocket(ws)
        }
        else {
            handleDisconnect()
        }
    }

    let ws
    let has_decoded_frame
    const fg_ref = useRef()
    const bg_ref = useRef()

    const [overlayMessage, setOverlayMessage] = useState()
    const [disconnected, setDisconnected] = useState(false)
    // const [reconnecting, setReconnecting] = useState(false)
    const [canReconnect, setCanReconnect] = useState(true)
    const [hovered, setHovered] = useState(false)
    const [webSocket, setWebSocket] = useState()
    const [deviceName, setDeviceName] = useState()

    const [openSnackbar, setOpenSnackbar] = useState(false)
    const [snackbarMessage, setSnackbarMessage] = useState()

    let video_decoder = setupVideoDecoder()

    const h264_buffer = []
    function drawFrame() {
        const t = new Date()
        if (h264_buffer.length) {
            const data = h264_buffer.shift()
            const chunk = new EncodedVideoChunk({ type: "key", timestamp: 0, data: data })
            try { video_decoder.decode(chunk) } catch (e) { }
        }
        const elapsed = new Date() - t
        setTimeout(drawFrame, 1000 / framerate - elapsed)
    }
    drawFrame()

    useEffect(_ => {
        if (hovered && disconnected && canReconnect) {
            setCanReconnect(false) // Prevent others rapid hover events 
            setDisconnected(false) // Show spinner
            // Timeout 1s before actual reconnection
            setTimeout(_ => connectWebSocket(), 1000)
        }
    }, [hovered, disconnected, canReconnect])

    useEffect(_ => {
        if (deviceName)
            connectWebSocket()
    }, [deviceName])

    useEffect(_ => {
        (async _ => setDeviceName(await getDeviceName(device_number)))()
        return _ => cleanup(ws)
    }, [])

    const overlay_icon_color = "#fffc"
    const overlay_background_color = "#0008"
    return <div
        onMouseLeave={_ => setHovered(false)}
        onMouseOver={_ => setHovered(true)}
        style={{
            display: "contents",
            flexDirection: "column",
            gap: "8px",
            width: "100%",
        }}
    >
        {ptz && <CameraControl ws={webSocket} device_number={device_number}></CameraControl>}
        <div {...props} style={{
            border: "1px solid #0004",
            position: "relative",
            width: "100%",
            aspectRatio: "16 / 9",
            boxSizing: "border-box",
            cursor: "pointer",
            maxWidth: "1280px",
            maxHeight: "720px",
            overflow: "hidden",
            background: "#888",
        }} >
            <canvas ref={bg_ref} style={{ width: "100%", position: "absolute" }}></canvas>
            <canvas ref={fg_ref} style={{
                width: "100%", position: "absolute",
                display: overlay ? "initial" : "none",
            }}></canvas>
            {disconnected ?
                <div style={{
                    position: "absolute",
                    height: "100%",
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: overlay_icon_color,
                    background: overlay_background_color,
                    "--mdc-icon-size": "64px",
                }}>
                    <Icon>videocam_off</Icon>
                </div>
                : overlayMessage ?
                    <CircularProgress
                        style={{ position: "absolute", height: "100%" }}
                        color={overlay_icon_color}
                        background={overlay_background_color}
                        text={overlayMessage}
                    ></CircularProgress>
                    : null
            }

        </div>
        <Snackbar
            open={openSnackbar}
            setOpen={setOpenSnackbar}
            label={snackbarMessage}
        ></Snackbar>
    </div >
}