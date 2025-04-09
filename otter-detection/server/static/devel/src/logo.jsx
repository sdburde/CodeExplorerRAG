"use strict"

import React from "react"

export function LeftAndRightLogo({ left, right }) {
    return <div style={{
        height: "2em",
        display: "flex",
        gap: "12px",
        alignItems: "center",
    }}>
        <img src={left} style={{ height: "100%" }}></img>
        <div style={{ // Vertical bar
            width: 2, height: "150%",
            background: "linear-gradient(to bottom, #0000, #0004, #0004, #0000)",
        }}></div>
        <img src={right} style={{ height: "100%" }}></img>
    </div>
}

export function WhiteLogo({ url, shadowColor = "#0000" }) {
    return <img src={url} style={{
        height: "1.5em",
        filter: `contrast(0) brightness(10) drop-shadow(0 0 8px ${shadowColor})`,
    }}></img>
}