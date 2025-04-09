"use strict"

import { decode, encode } from "./assets/msgpack.2.8.0.min.js"
import { drawDetections, drawText } from "./draw.js"
import { setupPTZ } from "./ptz.js"

let ws
let bg_context, fg_context

setupPTZ(ptz => ws.send(encode(ptz)))

const h264_decoder = new VideoDecoder({
    output: frame => {
        try {
            if (!bg_context) {
                bg_context = BACKGROUND_CANVAS.getContext("2d")
                fg_context = FOREGROUND_CANVAS.getContext("2d")
                BACKGROUND_CANVAS.width = frame.codedWidth
                BACKGROUND_CANVAS.height = frame.codedHeight
                FOREGROUND_CANVAS.width = frame.codedWidth
                FOREGROUND_CANVAS.height = frame.codedHeight
            }
            bg_context.drawImage(frame, 0, 0, frame.codedWidth, frame.codedHeight)
        }
        catch (e) { console.warn(e) }
        frame.close()
    },
    error: error => console.warn(error),
})

h264_decoder.configure({ codec: "avc1.42000a", optimizeForLatency: true })

const h264_buffer = []
// NOTE: Use setTimeout. setInterval will not trigger when out of focus
function drawFrame() {
    const t = new Date()
    if (h264_buffer.length) {
        const data = h264_buffer.shift().h264
        const chunk = new EncodedVideoChunk({ type: "key", timestamp: 0, data: data })
        try { h264_decoder.decode(chunk) } catch (e) { }
    }
    const elapsed = new Date() - t
    setTimeout(drawFrame, 1000 / 30 - elapsed)
}
drawFrame()

export function showSnackbar(text) {
    const snackbar = document.querySelector("mwc-snackbar")
    snackbar.labelText = text
    snackbar.show()
}

function toDurationString(seconds) { // to DD:HH:MM:SS.fff
    const days = Math.round(seconds / 24 / 3600)
    let stamp = `${new Date(seconds * 1e3).toISOString().slice(11, 22)}`
    return days > 0 ? `${days}d ${stamp}` : stamp
}

async function onWebSocketMessage(e) {
    const message = decode(e.data)

    if (message.message)
        showSnackbar(message.message)

    if (message.tegrastats) {
        const { tj, vdd_in } = message.tegrastats
        STATS_TEMPERATURE.innerHTML = `${vdd_in.toFixed(1)} W at ${tj.toFixed(1)}&deg;C`
    }

    if (message.config)
        applySetting(message.config)

    if (message.h264) {
        h264_buffer.push(message)
        while (h264_buffer.length > 10) // leaky
            h264_buffer.shift()
    }

    if (message.detections) {
        if (fg_context) {
            drawDetections(fg_context, message.detections)
            drawText(fg_context, toDurationString(message.pts), 8, 8, {
                color: "#fff", background: "#0008", family: "Inconsolata",
                height: 32, baseline: "top", align: "right",
            })
        }
    }
}

function connectWebSocket() {
    showSnackbar("Connecting...")
    ws = new WebSocket(`ws://${location.host}${location.pathname}api/stream`)
    ws.binaryType = "arraybuffer"
    ws.addEventListener("open", _ => showSnackbar("Connected"))
    ws.addEventListener("close", _ => showSnackbar("Disconnected"))
    ws.addEventListener("message", onWebSocketMessage)
}

async function main() {
    connectWebSocket()
}

main()

OVERLAY_TOGGLE?.addEventListener("click", _ => {
    if (OVERLAY_TOGGLE.on)
        FOREGROUND_CANVAS.classList.remove("hidden")
    else
        FOREGROUND_CANVAS.classList.add("hidden")
})

const drawer = document.querySelector("mwc-drawer")
const drawer_button = drawer.querySelector("[slot=navigationIcon]")
drawer.parentNode.addEventListener("MDCTopAppBar:nav", _ => drawer.open = !drawer.open)
window.addEventListener("resize", _ => {
    const title_bar = document.querySelector("mwc-top-app-bar [slot=title]")
    if (window.innerWidth > 640 && window.innerWidth > window.innerHeight) {
        // large landscape
        drawer.removeAttribute("type")
        drawer_button.classList.add("hidden")
        title_bar.classList.add("hidden")
    }
    else {
        drawer.setAttribute("type", "modal")
        drawer_button.classList.remove("hidden")
        title_bar.classList.remove("hidden")
    }
})
window.dispatchEvent(new Event("resize"))

