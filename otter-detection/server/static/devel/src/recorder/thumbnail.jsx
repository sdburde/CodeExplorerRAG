"use strict"

import React, { useState, useEffect, useRef } from "react"

import { toSizeString } from "../util"

export function Thumbnail({ size, date, img_src, isLive, data, style, ...props }) {
    // console.log(x)
    const ref = useRef()
    let size_string = toSizeString(size)
    size_string = `${size_string}B`
    const date_string = date.toLocaleString("en-US", {
        month: "short", day: "numeric",
        hour12: false, hour: "numeric", minute: "numeric",
    })
    const overlay_styles = {
        position: "absolute",
        background: "#0008",
        padding: "1 6",
        borderRadius: "8px",
    }
    return <div ref={ref} {...props} style={{
        position: "relative",
        cursor: "pointer",
        fontFamily: "Roboto",
        fontSize: "small",
        color: "white",
        height: "100%",
        aspectRatio: "16/9",
        boxSizing: "border-box",
        ...style,
    }}
    >
        <img
            src={img_src}
            loading="lazy"
            style={{ width: "100%", height: "100%", background: "#888" }}
        ></img>
        <div style={{ ...overlay_styles, bottom: 2, right: 2 }}>{size_string + (isLive ? "+" : "")}</div>
        <div style={{ ...overlay_styles, top: 2, left: 2 }}>{date_string}</div>
    </div >
}