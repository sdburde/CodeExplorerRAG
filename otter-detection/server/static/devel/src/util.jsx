"use strict"

import { useState } from "react"

import { queryInflux } from "./influx"

export const color_names = [ // D3 Category10
    "dodgerblue", "darkorange", "limegreen", "crimson", "mediumpurple",
    "sienna", "hotpink", "gray", "olivedrab", "lighseagreen",
]

function toFixed2(x, n) {
    if (x.toFixed(n).length >= 4)
        return x.toFixed(0)
    else
        return x.toFixed(n)
}

export function toSizeString(x) {
    if (x > 1e12)
        return `${toFixed2(x / 1e12, 1)} T`
    if (x > 1e9)
        return `${toFixed2(x / 1e9, 1)} G`
    if (x > 1e6)
        return `${toFixed2(x / 1e6, 1)} M`
    if (x > 1e3)
        return `${toFixed2(x / 1e3, 1)} k`
    return x
}

export function toDateString(x) {
    const date = new Date(x)
    return date.toLocaleString("en-US", {
        month: "short", day: "numeric", hour12: false,
        hour: "numeric", minute: "numeric", // second: "numeric",
    })
}

function singularOrPlural(prefix, suffix) {
    if (prefix > 1)
        return `${prefix}${suffix}s`
    return `${prefix}${suffix}`
}

export function toDurationString(x) {
    if (x > 24 * 60 * 60)
        return singularOrPlural(Math.round(x / 24 / 60 / 60), " day")
    if (x > 60 * 60)
        return singularOrPlural(Math.round(x / 60 / 60), " hour")
    if (x > 60)
        return singularOrPlural(Math.round(x / 60), " min")
    return singularOrPlural(Math.round(x), " sec")
}


export function toHHMMSSff(seconds) { // to DD:HH:MM:SS.ff
    const days = Math.round(seconds / 24 / 3600)
    let stamp = `${new Date(seconds * 1e3).toISOString().slice(11, 22)}`
    return days > 0 ? `${days}d ${stamp}` : stamp
}


function getHashParameters() {
    const parameters = {}
    window.location.hash.slice(1).split("&").forEach(kv => {
        let [k, v] = kv.split("=")
        if (!isNaN(v))
            v = +v
        if (k.length)
            parameters[k] = v
    })
    return parameters
}
function setHashParameter(k, v) {
    const parameters = getHashParameters()
    v = v?.toString?.()
    if (v == undefined || v == "")
        delete parameters[k]
    else
        parameters[k] = v
    const hash = Object.entries(parameters).map(([k, v]) => `${k}=${v}`).join("&")
    window.location.hash = `#${hash}`
}

export function useState2(key, value) {
    const params = getHashParameters()
    value = key in params ? params[key] : value
    const [getter, setter] = useState(value)
    return [getter, v => {
        setHashParameter(key, v)
        setter(v)
    }]
}

export async function getDeviceName(device_number, { verbose = false } = {}) {
    const fallback = `Device ${device_number}`
    // Query from edge for latest device name
    const subdir = location.pathname.split("/")[1]
    const url = `${location.origin}/${subdir}/${device_number}/api/name`
    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(3000) })
        if (response.status == 200) {
            const device_name = (await response.text()).trim()
            if (verbose)
                return `${fallback} (${device_name})`
            else
                return device_name
        }
    } catch (error) { console.warn(error) }

    // If edge API fails, query from monitoring server (edge is probably dead)
    const data = await queryInflux(`
        SELECT LAST(device_name) AS device_name
        FROM cag_otter
        WHERE device = 'otterbox${device_number}' AND TIME > NOW() - 30d
    `)
    const device_name = data?.[0]?.[0].device_name
    if (device_name)
        if (verbose)
            return `${fallback} (${device_name})`
        else
            return device_name
    // Fallback
    return fallback
}

export function getDeviceRoot(device_number) {
    const subdir = location.pathname.split("/")[1]
    return `${location.host}/${subdir}/${device_number}`
}
