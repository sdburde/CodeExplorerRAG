"use strict"

export function drawText(context, text, x, y, {
    height = 16, color = "red", background,
    align = "left", baseline = "top", family = "sans-serif", weight = 800,
} = {}) {
    context.font = `${weight} ${height}px ${family}`
    context.textAlign = align
    context.textBaseline = baseline
    const padx = height * 0.2
    const pady = height * 0.1
    if (background) {
        context.fillStyle = background
        const width = context.measureText(text).width
        const bx = align == "right" ? context.canvas.width - x - width - padx * 2 : x
        const by = baseline == "bottom" ? context.canvas.height - y - height - pady * 2 : y
        context.fillRect(bx, by, width + padx * 2, height + pady * 2)
    }
    const tx = align == "right" ? context.canvas.width - x - padx * 2 : x
    const ty = baseline == "bottom" ? context.canvas.height - y - pady * 2 : y
    context.fillStyle = color
    context.fillText(text, tx + padx, ty + pady)
}

export function drawDetections(context, detections) {
    // console.log(frame)
    context.save()
    const iw = context.canvas.width
    const ih = context.canvas.height
    context.clearRect(0, 0, iw, ih)
    const short_side = Math.min(iw, ih)
    const line_width = short_side * 0.01
    context.lineWidth = line_width
    const pad = 4
    detections.forEach(detection => {
        // const ratio = Math.max(0, detection.confidence - 0.5) * 2
        const alpha = 0.2 + detection.confidence * 0.5
        // console.log(detection)
        let [xn, yn, wn, hn] = detection.box
        let [x, y, w, h] = [xn * iw, yn * ih, wn * iw, hn * ih]
        let [x0, y0] = [x - w / 2, y - h / 2]
        const color = detection.positive == null ? `rgba(255,255,255,${alpha})` : `rgba(0,255,0,${alpha})`
        context.strokeStyle = color
        context.beginPath()
        context.rect(x0 - pad, y0 - pad, w + 2 * pad, h + 2 * pad)
        context.stroke()
        // if (true) {
        //     const track = detection.track
        //     const confidence = detection.confidence
        //     context.save()
        //     context.font = "16px Roboto, Arial"
        //     context.textBaseline = "bottom"
        //     context.textAlign = "left"
        //     context.lineWidth = 3
        //     context.strokeStyle = "black"
        //     context.fillStyle = "white"
        //     const text = `${Math.round(confidence * 100)} ${detection.speed?.toFixed(3)}`
        //     context.strokeText(text, x0, y0)
        //     context.fillText(text, x0, y0)
        //     context.restore()
        // }
    })
    context.restore()
}
