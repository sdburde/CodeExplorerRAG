import React, { useRef, useEffect } from "react"

import "@material/mwc-snackbar"

export function Snackbar({ label, open, setOpen }) {
    const ref = useRef()
    useEffect(_ => {
        ref.current.addEventListener("MDCSnackbar:closed", _ => setOpen(false))
    }, [])
    return <mwc-snackbar
        ref={ref}
        open={open}
        labelText={label}
        style={{ position: "absolute" }}
    >
        <mwc-icon-button icon={"close"} slot={"dismiss"}></mwc-icon-button>
    </mwc-snackbar >
}
