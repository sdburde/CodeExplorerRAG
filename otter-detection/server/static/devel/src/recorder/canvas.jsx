"use strict"

export function setDimension(canvas, frame) {
    canvas.width = frame.codedWidth
    canvas.height = frame.codedHeight
}

export function drawText(context, text, x, y, {
    height = 16, color = "red", background,
    align = "left", baseline = "top", font = "sans-serif", weight = 800,
} = {}) {
    context.save()
    context.font = `${weight} ${height}px ${font}`
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
    context.restore()
}

export function drawDetections(context, detections) {
    // console.log(frame)
    const iw = context.canvas.width
    const ih = context.canvas.height
    const short_side = Math.min(iw, ih)
    const line_width = short_side * 0.01
    const pad = 4
    context.save()
    // context.clearRect(0, 0, iw, ih)
    context.lineWidth = line_width
    detections.forEach(detection => {
        const alpha = 0.2 + detection.confidence * 0.5
        const [xn, yn, wn, hn] = detection.box
        const [x, y, w, h] = [xn * iw, yn * ih, wn * iw, hn * ih]
        const [x0, y0] = [x - w / 2, y - h / 2]
        const color = detection.positive == null ? `rgba(255,255,255,${alpha})` : `rgba(0,255,0,${alpha})`
        context.strokeStyle = color
        context.beginPath()
        context.rect(x0 - pad, y0 - pad, w + 2 * pad, h + 2 * pad)
        context.stroke()
    })
    context.restore()
}
