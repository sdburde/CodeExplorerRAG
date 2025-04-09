"use strict"

import { decode } from "../assets/msgpack.2.8.0.min.js"
import { setupDrawer, showDialog, showSnackbar, fixTextFieldPadding } from "./mwc2.js"
import {
    toSizeString, download, toTimestamp, toDateTimeLocal,
    fromDateTimeLocal, toDurationString, drawText, createListItem,
} from "./util.js"

let ws

const canvas = VIDEO_CANVAS
let context
let starting_seek_position = false
let video_position

const decoder = new VideoDecoder({
    output: frame => {
        try { renderFrame(frame, dencoded_queue.shift()) } catch { }
        frame.close()
    },
    error: x => console.warn(x),
})
decoder.configure({
    codec: "avc1.42000a",
    optimizeForLatency: true,
})
const message_queue = []
const dencoded_queue = [] // NOTE: message_queue is leaky, decoded_queue is not
function decodeFrame() {
    const t = new Date()
    if (message_queue.length) {
        const message = message_queue.shift()
        dencoded_queue.push(message)
        decoder.decode(new EncodedVideoChunk({
            type: "key", timestamp: 0, data: message.data
        }))
    }
    const elapsed = new Date() - t
    setTimeout(decodeFrame, 1000 / 30 - elapsed)
}
decodeFrame()

function renderFrame(frame, message) {
    if (!context) {
        context = canvas.getContext("2d")
        canvas.width = frame.codedWidth
        canvas.height = frame.codedHeight
    }
    const short_side = Math.min(canvas.width, canvas.height)
    const text_height = short_side * 0.04
    context.drawImage(
        frame,
        0, 0, frame.displayWidth, frame.displayHeight,
        0, 0, canvas.width, canvas.height,
    )
    const position = message.pts
    let duration = message.duration
    // NOTE: Fix time offset
    if (message.start != null)
        duration -= message.start
    drawText(context, `${toTimestamp(position)} / ${toTimestamp(duration)}`, {
        x: text_height / 4, y: text_height / 4,
        height: text_height, color: "#fff", background: "#0008",
        align: "right", baseline: "top",
    })
    if (VIDEO_SLIDER.disabled && VIDEO_SLIDER.max != duration) {
        VIDEO_SLIDER.min = 0
        VIDEO_SLIDER.max = duration
        VIDEO_SLIDER.layout()
        VIDEO_SLIDER.disabled = false
        VIDEO_SLIDER.value = VIDEO_SLIDER.min

        CROP_START_BUTTON.value = 0
        if (starting_seek_position != false) {
            seek(starting_seek_position)
            starting_seek_position = false
        }
    }
    // NOTE: Only allow auto slider update when change is near-continuous
    // When large change is applied by human, dont update
    video_position = position
    if (VIDEO_SLIDER.value < 1 || Math.abs(position - VIDEO_SLIDER.value) < 30)
        VIDEO_SLIDER.value = position
}

async function seek(x) {
    x = Math.max(VIDEO_SLIDER.min, Math.min(x, VIDEO_SLIDER.max)) // Clip
    send({ seek: x })
}

function send(x = null) {
    const serialised = JSON.stringify(x)
    if (x != null)
        console.log("Send", serialised)
    return ws.send(serialised)
}

VIDEO_LIST.addEventListener("selected", e => {

    if (ws)
        ws.close()

    const index = e.detail.index
    if (index < 0) // Deselect
        return

    PLAY_BUTTON.on = true // Set playing
    const entry = VIDEO_LIST.selected.data

    const url = new URL(location)
    if (!url.pathname.endsWith("/"))
        url.pathname += "/"
    url.pathname += "api/ws"
    url.protocol = url.protocol.startsWith("https:") ? "wss:" : "ws:"

    ws = new WebSocket(url)
    ws.binaryType = "arraybuffer"
    ws.addEventListener("open", _ => {
        send({ path: entry.path, height: 720, bitrate: 2048, play: true })
    })
    ws.addEventListener("error", _ => showSnackbar("Connection error"))

    // NOTE: Auto jump to live if first video
    let jump_to_live = index == 0
    ws.addEventListener("message", e => {
        const message = decode(e.data)
        if (jump_to_live) {
            send({ seek: message.duration })
            jump_to_live = false // Jumped
        }
        while (message_queue.length > 10) // Leaky
            message_queue.shift()
        message_queue.push(message)
    })

    VIDEO_LIST.closest("mwc-drawer").open = false
    VIDEO_SLIDER.disabled = true
})

function updateStatus(message) {
    const disk_usage = message.disk_usage
    const disk_ratio = disk_usage.used / disk_usage.total
    const disk_total_gb = disk_usage.total / 1024 / 1024 / 1024
    DISK_STATUS_BAR.setAttribute("progress", disk_ratio)
    DISK_STATUS_TEXT.innerHTML = `${Math.round(disk_ratio * 100)}% of ${disk_total_gb.toFixed(1)} GB storage used`

    const entries = message.list
    VIDEO_LIST.items.forEach(x => VIDEO_LIST.removeChild(x))
    entries.sort((a, b) => b.path.localeCompare(a.path))
    entries.forEach(entry => VIDEO_LIST.appendChild(createListItem(entry, VIDEO_ITEM_TEMPLATE)))

    const stamps = entries.map(entry => {
        const parts = entry.path.split("/")
        const date_string = parts[parts.length - 1].split("_")[0]
        const date = new Date(
            +date_string.slice(0, 4),
            +date_string.slice(4, 6) - 1, // Month
            +date_string.slice(6, 8),
            +date_string.slice(9, 11),
            +date_string.slice(11, 13),
            +date_string.slice(13, 15),
        )
        entry.date = date
        return date
    })
    stamps.sort((a, b) => +a - +b)
    FILTER_DATE_START.value = toDateTimeLocal(stamps[0])
    FILTER_DATE_END.value = toDateTimeLocal(+stamps[stamps.length - 1] + 60 * 1e3)
}

function filterVideoList() {
    const tokens = SEARCH_TEXTFIELD.value.split(" ").filter(x => x).map(x => x.toLowerCase())
    const no_token = tokens.length == 0
    const date_start = fromDateTimeLocal(FILTER_DATE_START.value)
    const date_end = fromDateTimeLocal(FILTER_DATE_END.value)
    VIDEO_LIST.items.forEach(item => {
        const data = item.data
        const text_hit = no_token || tokens.every(x => data.keywords.includes(x))
        const date_hit = data.date >= date_start && data.date <= date_end
        if (text_hit && date_hit)
            item.style.display = "flex"
        else
            item.style.display = "none"
    })
}

async function main() {

    document.querySelectorAll("mwc-textfield[type=datetime-local]").forEach(
        x => fixTextFieldPadding(x))

    setupDrawer(document.querySelector("mwc-drawer"))

    updateStatus(await (await fetch("api/video")).json())

    /****************
     * SEARCH VIDEO *
     ****************/
    let search_timer
    SEARCH_TEXTFIELD.addEventListener("keyup", _ => {
        clearTimeout(search_timer)
        search_timer = setTimeout(filterVideoList, 500)
    })
    SEARCH_TEXTFIELD.addEventListener("keydown", e => {
        if (e.key.toLowerCase() == "enter") {
            clearTimeout(search_timer)
            filterVideoList()
        }
    })
    FILTER_DATE_END.addEventListener("input", _ => filterVideoList())
    FILTER_DATE_START.addEventListener("input", _ => filterVideoList())

    /******************
     * DOWNLOAD VIDEO *
     ******************/
    DOWNLOAD_BUTTON.addEventListener("click", _ => {
        const selected = VIDEO_LIST.selected?.data
        if (selected)
            showDialog(
                `Download ${toSizeString(selected.size)} video?`,
                `Cellular data charges may apply to recorder`,
                _ => download(selected.url),
            )
        else
            showSnackbar("Select video to download")
    })

    /****************
     * DELETE VIDEO *
     ****************/
    DELETE_BUTTON.addEventListener("click", _ => {
        const selected = VIDEO_LIST.selected?.data
        if (selected)
            showDialog(
                `Delete ${toSizeString(selected.size)} video?`,
                `Created on ${selected.timestring}`,
                async _ => {
                    try {
                        const response = await fetch(
                            "api/video", { method: "delete", body: selected.path })
                        updateStatus(await response.json())
                        showSnackbar("Deleted")
                    }
                    catch { showSnackbar("Delete failed") }
                }
            )
        else
            showSnackbar("Select video to delete")
    })

    /********************
     * SLIDER DRAG SEEK *
     ********************/

    let slider_seek_timer = null
    VIDEO_SLIDER.addEventListener("input", _ => {
        clearTimeout(slider_seek_timer) // NOTE: Always clear previous first
        slider_seek_timer = setTimeout(_ => {
            clearTimeout(slider_seek_timer)
            seek(VIDEO_SLIDER.value)
        }, 500) // Prevent rapidfire
    })
    VIDEO_SLIDER.addEventListener("pointerup", _ => {
        if (slider_seek_timer == null)
            return
        clearTimeout(slider_seek_timer)
        seek(VIDEO_SLIDER.value)
        slider_seek_timer = null
    })

    /*********************************
     * SLIDER PREVENT UPDATE ON DRAG *
     *********************************/

    PLAY_BUTTON.addEventListener(
        "click",
        e => PLAY_BUTTON.on ? send({ play: true }) : send({ pause: true }))

    setInterval(_ => {
        if (ws && ws.readyState == WebSocket.OPEN)
            send()
    }, 3000) // keepalive ping

    function pause() { // Force pause
        PLAY_BUTTON.on = false
        send({ pause: true })
    }

    // NOTE: Pause to prevent buffer overflow
    document.addEventListener("visibilitychange", _ => {
        if (document.hidden) pause()
    })

    VIDEO_CANVAS.addEventListener("click", _ => PLAY_BUTTON.click())

    /***************
     * BUTTON STEP *
     ***************/

    async function step(x) {
        send({ step: x })
    }

    function enableRapidStep(button, increment) {
        let timer = null
        button.addEventListener("pointerdown", _ => {
            clearInterval(timer)
            // 150 ms interval means hold 1s of (+/- 10s skip) will skip 60s in total
            timer = setInterval(_ => {
                step(increment)
            }, 150)
        })
        function f() {
            if (timer == null)
                return
            clearInterval(timer)
            step(increment)
            timer = null
        }
        button.addEventListener("pointerup", _ => f())
        button.addEventListener("pointerleave", _ => f())
        button.addEventListener("touchend", _ => f())
        button.addEventListener("contextmenu", e => e.preventDefault())
    }

    enableRapidStep(FORWARD_BUTTON, +10)
    enableRapidStep(REWIND_BUTTON, -10)

    CROP_START_BUTTON.addEventListener("click", _ => {
        CROP_START_BUTTON.value = video_position
        CROP_END_BUTTON.disabled = false
        showSnackbar(`Timestamp marked for cropping`)
        // pause()
    })
    CROP_END_BUTTON.addEventListener("click", _ => {
        const start = CROP_START_BUTTON.value
        const duration = video_position - start
        if (duration <= 0) {
            console.log("Invalid crop timestamp", start, duration)
            showSnackbar("Invalid crop timestamp")
            return
        }
        const data = VIDEO_LIST.selected.data
        pause()
        const size = duration / (VIDEO_SLIDER.max - VIDEO_SLIDER.min) * data.size
        // console.log(duration, size)
        showDialog(
            `Crop ${toDurationString(duration, 2)} video?`,
            `Estimated download size is ${toSizeString(size)}`,
            async _ => {
                const response = await fetch("api/video", {
                    method: "post", body: JSON.stringify({
                        path: data.path,
                        start: start,
                        duration: duration,
                    })
                })
                showSnackbar("Downloading file")
                const filename = response.headers.get("Content-Disposition").split('filename="')[1].split('"')[0]
                const url = URL.createObjectURL(await response.blob())
                download(url, filename)
                URL.revokeObjectURL(url)
            },
        )
    })

    VIDEO_LIST.layout()

    const search_string = location.search.slice(1)
    if (search_string.length) {
        try {
            const parameters = Object.fromEntries(search_string.split("&").map(x => x.split("=")))
            const date = new Date(parameters.stamp)
            const index = VIDEO_LIST.items.findIndex((x, i) => {
                const data = x.data
                if (data.name != parameters.name)
                    return false
                if (i == 0) {
                    if (date >= data.date)
                        return true
                } else {
                    if (date >= data.date && date <= VIDEO_LIST.items[i - 1].data.date)
                        return true
                }
            })
            if (index >= 0) {
                const start_date = VIDEO_LIST.items[index].data.date
                VIDEO_LIST.select(index)
                starting_seek_position = (date - start_date) * 1e-3
            }
            else {
                showSnackbar("Requested video not found")
                VIDEO_LIST.select(0)
            }
        }
        catch {
            showSnackbar("Invalid video request")
            VIDEO_LIST.select(0)
        }
    }
    else
        VIDEO_LIST.select(0)

}

main()
