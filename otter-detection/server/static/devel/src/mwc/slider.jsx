"use strict"

import "@material/mwc-slider"

import React, { useRef, useState, useEffect } from "react"

export function Slider({ value, setValue, disabled, ...props }) {
    const ref = useRef()

    let last_time = useRef(new Date())
    let last_value = useRef(null)

    function triggerInput() {
        if (disabled)
            return
        const value = ref.current.value
        if (value != last_value.current && !isNaN(value)) {
            setValue(value)
            last_value.current = value
        }
    }

    useEffect(_ => {
        const slider = ref.current
        slider.addEventListener("pointerup", _ => triggerInput())
        // NOTE: Needed else initial slider knob and progress indicator may misalign
        new ResizeObserver(_ => slider.layout()).observe(slider)
    }, [])

    return <mwc-slider ref={ref} value={value}
        {...disabled && { disabled: true }}
        {...props}
        onInput={_ => {
            const now = new Date()
            if (now - last_time.current > 500) {
                triggerInput()
                last_time.current = now
            }
        }}

    ></mwc-slider>
}