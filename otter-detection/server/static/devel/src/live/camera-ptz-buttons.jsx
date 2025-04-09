"use strict"

import React, { useState, useEffect, useRef } from "react"
import "@material/mwc-button"

import { CameraRenameButton } from "./camera-rename-button"

export function Button({ icon, disabled, ...props }) {
    return <mwc-button outlined
        {...disabled && { disabled: true }}
        {...props} // NOTE: onClick can be overriden
    ><a className="material-icons">{icon}</a></mwc-button>
}

export function CameraPTZButtons({ ws, device_number, disabled, ptzLocked, setPTZLocked }) {
    const [ptz, setPTZ] = useState({ pan: 0, tilt: 0, zoom: 0 })

    useEffect(_ => {
        ws.current?.send(ptz)
    }, [ptz.pan, ptz.tilt, ptz.zoom])

    const ptz_button_props = {
        ws, disabled: ptzLocked || disabled,
        onPointerUp: _ => setPTZ({ pan: 0, tilt: 0, zoom: 0 }),
        onPointerLeave: _ => setPTZ({ pan: 0, tilt: 0, zoom: 0 }),
    }

    return <>
        <Button disabled={disabled} onClick={_ => setPTZLocked(!ptzLocked)} icon={ptzLocked ? "lock" : "lock_open"}></Button>
        <Button {...ptz_button_props} onPointerDown={_ => setPTZ(x => ({ ...x, pan: -60 }))} icon="arrow_back"></Button>
        <Button {...ptz_button_props} onPointerDown={_ => setPTZ(x => ({ ...x, pan: +60 }))} icon="arrow_forward"></Button>
        <Button {...ptz_button_props} onPointerDown={_ => setPTZ(x => ({ ...x, tilt: +60 }))} icon="arrow_upward"></Button>
        <Button {...ptz_button_props} onPointerDown={_ => setPTZ(x => ({ ...x, tilt: -60 }))} icon="arrow_downward"></Button>
        <Button {...ptz_button_props} onPointerDown={_ => setPTZ(x => ({ ...x, zoom: +10 }))} icon="zoom_in"></Button>
        <Button {...ptz_button_props} onPointerDown={_ => setPTZ(x => ({ ...x, zoom: -10 }))} icon="zoom_out"></Button>
        <CameraRenameButton disabled={disabled || ptzLocked} device_number={device_number}></CameraRenameButton>
    </>
}