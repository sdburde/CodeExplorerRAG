"use strict"

import React, { useState, useEffect, useRef } from "react"

export function GridContainer({ style, children }) {
    const ref = useRef()

    function resize() {
        const container = ref.current
        const n = container.children.length
        const aspect_ratio = container.offsetWidth / container.offsetHeight
        // 1x6 9x96
        // 2x3 18x48
        // 3x2 27x32
        // 6x1 54x16
        // NOTE: Height is increased to cater for padding and vertical-scrollbar
        if (aspect_ratio < 16 / 54) // 0.29
            setLayout(6, 1)
        else if (aspect_ratio < 32 / 27) // 1.18
            setLayout(3, 2)
        else if (aspect_ratio < 48 / 18) // 2.67
            setLayout(2, 3)
        else
            setLayout(1, 6)
    }

    function setLayout(row, height) {
        const container = ref.current
        container.style.gridTemplateRows = `repeat(${row}, auto)`
        container.style.gridTemplateColumns = `repeat(${height}, auto)`
    }

    useEffect(_ => {
        const observer = new ResizeObserver(_ => resize())
        observer.observe(ref.current)
        return _ => observer.disconnect()
    }, [])

    return <div ref={ref} style={{
        gap: "8px",
        // NOTE: Needed for accurate offsetWidth offsetHeight during resize
        overflow: "hidden",
        display: "grid",
        // NOTE: Hidden during grid view to force children maxWidth and maxHeight
        alignContent: "start", // Grid vertical alignment
        ...style,
    }}>
        {children}
    </div >
}

// gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, calc(56.25vh)), 1fr))",