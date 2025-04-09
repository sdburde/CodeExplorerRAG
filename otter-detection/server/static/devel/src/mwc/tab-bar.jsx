"use strict"

import React, { useState, useEffect, useRef } from "react"

import "@material/mwc-tab-bar"
import { waitForShadowRoot } from "./drawer"

// NOTE: Mouse only events. Touch events already works
function enableMouseScroll(tab_bar) {
    const scroller = tab_bar
        .shadowRoot.querySelector("mwc-tab-scroller")
        .shadowRoot.querySelector(".mdc-tab-scroller__scroll-area")
    // Mouse drag scroll
    let context = null
    tab_bar.addEventListener("mousedown", e => {
        context = { mx: e.clientX, sx: scroller.scrollLeft }
    })
    addEventListener("mousemove", e => {
        if (context)
            scroller.scrollLeft = context.sx + context.mx - e.clientX
    })
    addEventListener("mouseup", _ => context = null)
    addEventListener("mouseleave", _ => context = null)
    // Mouse wheel scroll
    const delta_max = 64
    tab_bar.addEventListener("wheel", e => {
        let delta = e.deltaY
        delta = Math.min(delta, +delta_max)
        delta = Math.max(delta, -delta_max)
        scroller.scrollLeft += delta
    })
}

export function TabBar({ children, tab, setValue, color, ...style }) {
    const ref = useRef()
    useEffect(_ => {
        (async _ => {
            const tab_bar = ref.current
            const tabs = Array.from(tab_bar.querySelectorAll("mwc-tab"))
            tab_bar.addEventListener("MDCTabBar:activated", e => {
                setValue(tabs[e.detail.index].dataset.value)
            })
            tab_bar.activeIndex = tabs.map(x => x.dataset.value).indexOf(tab)
            tabs.forEach(async tab => {
                await waitForShadowRoot(tab)
                const underline = tab.shadowRoot?.querySelector("mwc-tab-indicator")
                    .shadowRoot.querySelector(".mdc-tab-indicator__content--underline")
                underline.style.borderTopWidth = "4px"
                underline.style.borderColor = "#fff8"
            })
            await waitForShadowRoot(tab_bar)
            enableMouseScroll(tab_bar)
        })()
    }, [])
    return <mwc-tab-bar ref={ref} slot="actionItems" style={{
        // Overflow hidden is required for horizontal scrolling to work on small display
        overflow: "hidden",
        "--mdc-tab-height": "64px",
        ...color && {
            "--mdc-tab-color-default": color,
            "--mdc-tab-text-label-color-default": color,
            "--mdc-theme-primary": color,
        },
        ...style,
    }}>
        {children}
    </mwc-tab-bar>
}

export function Tab({ label, iconOnly, ...props }) {
    return <mwc-tab
        label={iconOnly ? "" : label}
        data-value={label} {...props}
    ></mwc-tab>
}