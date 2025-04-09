"use strict"

import React, { useState, useEffect, useRef } from "react"

import { Dialog } from "../mwc/dialog"
import { Button } from "./camera-ptz-buttons"

export function OverlayButton({ disabled, enableOverlay, setEnableOverlay }) {
    return <Button disabled={disabled} icon={enableOverlay ? "layers" : "layers_clear"}
        onClick={e => { setEnableOverlay(!enableOverlay) }}></Button>
}

export function CameraVisitButton({ device_number }) {

    const [openVisitDialog, setOpenVisitDialog] = useState(false)

    return <>
        <Button icon="open_in_new"
            onClick={e => { setOpenVisitDialog(true) }}></Button>

        <Dialog
            heading={`Visit device? `}
            open={openVisitDialog}
            setOpen={setOpenVisitDialog}
            onClick={_ => {
                const subdir = location.pathname.split("/")[1]
                const url = `${location.origin}/${subdir}/${device_number}/`
                window.open(url, "_blank")
            }}
        >
            {"This will open a new tab"}
        </Dialog>
    </>
}