"use strict"

import React from "react"

import "@material/mwc-icon"
import "@material/mwc-icon-button"

export function Icon({ children, ...props }) {
    return (<mwc-icon {...props}>{children}</mwc-icon>)
}

export function IconButton({ children, ...props }) {
    return <mwc-icon-button icon={children} {...props}></mwc-icon-button>
}

export function CroppedIcon({ size = 32, rotate = 0, color = "black", children, style, ...props }) {
    // Render
    const computed_style = window.getComputedStyle(document.body)
    color = computed_style.getPropertyValue(color) || color
    const canvas = document.createElement("canvas")
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext("2d", { willReadFrequently: true })
    context.font = `${size}px Material Icons`
    context.fillStyle = color
    context.textBaseline = "top"
    context.translate(size / 2, size / 2)
    context.rotate(rotate / 180 * Math.PI)
    context.fillText(children, -size / 2, -size / 2)
    // Crop
    const data = context.getImageData(0, 0, size, size).data
    let top = size, bottom = 0, left = size, right = 0
    for (let i = 0; i < size; ++i) {
        for (let j = 0; j < size; ++j) {
            if (data[(i * size + j) * 4 + 3] > 0) {
                if (i < top) top = i
                if (i > bottom) bottom = i
                if (j < left) left = j
                if (j > right) right = j
            }
        }
    }
    const cw = right - left + 1
    const ch = bottom - top + 1
    const cropped = context.getImageData(left, top, cw, ch)
    canvas.width = cw
    canvas.height = ch
    context.putImageData(cropped, 0, 0)
    // Serialise
    return <img src={canvas.toDataURL()}
        style={{ height: "100%", ...style }} {...props}></img>
}

export function BatteryIcon({ soc, color }) {
    soc /= 100 // Normalise
    let name = "battery_0_bar"
    if (soc == 1)
        name = "battery_full"
    else if (soc > 6 / 7)
        name = "battery_6_bar"
    else if (soc > 5 / 7)
        name = "battery_5_bar"
    else if (soc > 4 / 7)
        name = "battery_4_bar"
    else if (soc > 3 / 7)
        name = "battery_3_bar"
    else if (soc > 2 / 7)
        name = "battery_2_bar"
    else if (soc > 1 / 7)
        name = "battery_1_bar"
    return <CroppedIcon rotate={90} color={color}>{name}</ CroppedIcon>
}
