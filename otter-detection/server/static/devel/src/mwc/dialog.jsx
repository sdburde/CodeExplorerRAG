import React, { useState, useRef, useEffect } from "react"

import "@material/mwc-dialog"
import "@material/mwc-button"

export function Dialog({ children, onClick, open, setOpen, style, ...props }) {
    const ref = useRef()
    useEffect(_ => ref.current.addEventListener("closed", _ => setOpen(false)), [])
    return <mwc-dialog
        ref={ref} open={open}
        // NOTE: Position absolute is needed if parent is flexbox to prevent
        //       awkward gaps between dialog elements taking up no space
        style={{ position: "absolute", ...style }}
        {...props}
    >
        {children}
        <mwc-button
            unelevated
            slot="primaryAction"
            onClick={async _ => {
                if (await onClick?.() != false)
                    setOpen(false)
            }}
        >Confirm</mwc-button>
        <mwc-button dialogAction="cancel" slot="secondaryAction">Dismiss</mwc-button>
    </mwc-dialog>
}
