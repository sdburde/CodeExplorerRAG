"use strict"

import React, { useRef, useState, useEffect } from "react"

export const Menu = ({ icon, children, style, value, setValue, ...props }) => {
    const button_ref = useRef()
    const menu_ref = useRef()
    const [label, setLabel] = useState()

    function setValueAndLabel(item) {
        const label = item?.innerHTML
        const value = item?.value?.length ? item.value : label
        console.log("Set menu value", value)
        setValue(value)
        setLabel(label)
    }

    useEffect(_ => {
        const menu = menu_ref.current
        const button = button_ref.current
        menu.anchor = button
        // NOTE: Use querySelectorAll instead of .items as sometimes it is empty during initialisation
        const items = menu.querySelectorAll("mwc-list-item")
        menu.addEventListener("selected", e =>
            setValueAndLabel(items[e.detail.index]))
        setValueAndLabel(items[0])
    }, [])

    return <div style={{ position: "relative" }}>
        <mwc-button ref={button_ref} label={label} style={{ ...style }}
            {...icon && { icon }} {...props}
            onClick={_ => menu_ref.current.open = true}
        ></mwc-button>
        <mwc-menu ref={menu_ref}>{children}</mwc-menu>
    </div >
}