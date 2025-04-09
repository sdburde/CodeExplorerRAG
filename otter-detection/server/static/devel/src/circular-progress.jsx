"use strict"

import React, { useState, useEffect, useRef } from "react"

import "@material/mwc-circular-progress"

export function CircularProgress({
    color = "#888",
    background = "transparent", text,
    style,
}) {
    return <div style={{
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        fontFamily: "Roboto, Arial, sans-serif",
        background: background,
        ...style,
    }}>
        <mwc-circular-progress indeterminate
            style={{ "--mdc-theme-primary": color }}></mwc-circular-progress>
        {text && <div style={{ color: color }}>{text}</div>}
    </div>
}