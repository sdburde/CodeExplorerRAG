"use strict"

export function toTimestamp(seconds, ms = true) { // to DD:HH:MM:SS.ff
    const days = Math.round(seconds / 24 / 3600)
    let stamp = `${new Date(seconds * 1e3).toISOString().slice(11, ms ? 22 : 19)}`
    return days > 0 ? `${days}:${stamp}` : stamp
}

export function toSizeString(size, decimal = 0) {
    if (size > 1024 * 1024 * 1024)
        return `${(size / 1024 / 1024 / 1024).toFixed(decimal)} GB`
    else if (size > 1024 * 1024)
        return `${(size / 1024 / 1024).toFixed(decimal)} MB`
    else if (size > 1024)
        return `${(size / 1024).toFixed(decimal)} kB`
    else
        return `${Math.round(size)} byte`
}

export function download(url, path) {
    const a = document.createElement("a")
    a.href = url
    a.download = path || url.split("/").slice(-1)[0]
    a.click()
}

export function toDateTimeLocal(x) {
    x = new Date(x)
    return [
        `${x.getFullYear()}-`,
        `${(x.getMonth() + 1).toString().padStart(2, 0)}-`,
        `${x.getDate().toString().padStart(2, 0)}T`,
        `${x.getHours().toString().padStart(2, 0)}:`,
        `${x.getMinutes().toString().padStart(2, 0)}`,
    ].join("")
}

export function fromDateTimeLocal(x) {
    return new Date(
        x.slice(0, 4), x.slice(5, 7) - 1, x.slice(8, 10),
        x.slice(11, 13), x.slice(14, 16), x.slice(17, 19),
    )
}

function divmod(x, y) { return [Math.floor(x / y), x % y] }

export function toDurationString(x, limit) {
    if (x instanceof Date)
        x = +x * 1e-3
    let parts = []
    if (x > (3600 * 24)) {
        let [days, r] = divmod(x, (3600 * 24))
        parts.push(`${days} day`)
        x = r
    }
    if (x > 3600) {
        let [hours, r] = divmod(x, 3600)
        parts.push(`${hours} hr`)
        x = r
    }
    if (x > 60) {
        let [minutes, r] = divmod(x, 60)
        parts.push(`${minutes} min`)
        x = r
    }
    if (x > 0)
        parts.push(`${Math.round(x)} sec`)
    if (limit)
        parts = parts.slice(0, limit)
    return parts.join(" ")
}

export function drawText(context, text, {
    x = 0, y = 0, height = 16, color = "red", background,
    align = "left", baseline = "top"
}) {
    context.font = `${height}px Roboto`
    context.textAlign = align
    context.textBaseline = baseline
    let padx = 0
    let pady = 0
    if (background) {
        padx = height * 0.2
        pady = height * 0.1
        context.fillStyle = background
        const bw = context.measureText(text).width + 2 * padx
        const bh = height + 2 * pady
        const bx = align == "right" ? context.canvas.width - x - bw : x
        const by = baseline == "bottom" ? context.canvas.height - y - height : y
        context.fillRect(bx, by, bw, bh)
    }
    const tx = align == "right" ? context.canvas.width - x - padx : x + padx
    const ty = baseline == "bottom" ? context.canvas.height - y - pady : y + pady
    context.fillStyle = color
    context.fillText(text, tx, ty)
}

export function createListItem(entry, template) {

    const list_item = template.content.firstElementChild.cloneNode(true)
    const path_parts = entry.path.split("/")
    const basename = path_parts[path_parts.length - 1]
    let [t, index] = basename.split("_", 2)
    index = +index?.split(".")[0] + 1 // No use probably
    t = new Date(
        t.slice(0, 4), t.slice(4, 6) - 1, t.slice(6, 8),
        t.slice(9, 11), t.slice(11, 13), t.slice(13, 15),
    )
    const timestring = t.toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        weekday: "short",
        hour12: false,
    })
    const camera_name = path_parts.slice(0, -1).filter(x => x).join("/")
    list_item.title = entry.path
    let secondary = `${toSizeString(entry.size)} / ${camera_name}`
    list_item.querySelector("[name=title]").innerHTML = timestring
    list_item.querySelector("[slot=secondary]").innerHTML = secondary

    const img = list_item.querySelector("img[slot=graphic]")
    // Reconstruct JPG URL for lazy loading
    const url_parts = location.pathname.split("/").filter(x => x)
    url_parts.push("videos", ...entry.path.split("/").filter(x => x))
    const url = `/${url_parts.join("/")}`
    img.src = `${url.slice(0, url.lastIndexOf("."))}.jpg`

    entry.url = url
    entry.timestring = timestring
    entry.keywords = `${timestring} ${entry.path}`.toLowerCase()
    entry.name = entry.path.split("/")[0]
    list_item.data = entry

    return list_item
}
