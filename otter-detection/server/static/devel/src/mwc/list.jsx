"use strict"

import React, { useEffect, useRef } from "react"

import "@material/mwc-list"

export const List = ({ children, ...props }) => {
    return (<mwc-list {...props} >{children}</mwc-list>)
}

export const ListItem = ({ graphic, primary, secondary, meta, disabled, activated, style, ...props }) => {
    const disabled_opacity = 0.38
    return (
        <mwc-list-item
            {...secondary && { "twoline": true }}
            {...meta && { "hasMeta": true }}
            {...graphic && { "graphic": "avatar" }}
            {...activated && { activated: true }}
            disabled={disabled}
            style={{
                ...disabled && { "--mdc-ripple-color": "#0008" },
                ...style,
            }}
            {...props}
        >
            {graphic && <span slot="graphic" style={{
                display: "flex",
                ...(activated && !disabled) && { color: "var(--mdc-theme-primary)" },
                ...disabled && { opacity: disabled_opacity },
            }}>{graphic}</span>}
            <span>{primary}</span>
            {secondary && <span slot="secondary" style={{}}>{secondary}</span>}
            {meta && <span slot="meta">{meta}</span>}
        </mwc-list-item>
    )
}

export const Divider = ({ ...props }) => {
    return (
        <li divider={""} {...props} role="separator"></li>
    )
}