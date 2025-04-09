"use strict"

import React, { useState, useEffect, useRef } from "react"

import { GridContainer } from "./grid-container"
import { WebSocketVideoPlayer } from "../recorder/websocket-video-player"
import { getDeviceName, getDeviceRoot } from "../util"
import { CameraPTZButtons, Button } from "./camera-ptz-buttons"
import { OverlayButton, CameraVisitButton } from "./camera-other-buttons"

function SingleLivePage({ device_number, style }) {

    const ws_ref = useRef()
    const [ptzLocked, setPTZLocked] = useState(true)
    const [webSocketURL, setWebSocketURL] = useState()
    const [controlDisabled, setControlDisabled] = useState(true)
    const [enableOverlay, setEnableOverlay] = useState(true)
    const [deviceName, setDeviceName] = useState()
    const [playerKey, setPlayerKey] = useState()

    useEffect(_ => {
        (async _ => {
            const device_root = getDeviceRoot(device_number)
            let url = `wss://${device_root}/api/stream`
            if (device_number == 1)
                url = `wss://${device_root}/api`
            setDeviceName(await getDeviceName(device_number))
            setWebSocketURL(url)
            setControlDisabled(true)
            setPTZLocked(true)
            setPlayerKey(+new Date())
        })()
    }, [device_number])

    return <div style={{
        // Enforce height constraint to children
        overflow: "hidden",
        maxWidth: 1280,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 8,
        ...style,
    }}>

        <div style={{
            display: "flex", gap: "8px",
            justifyContent: "center", flexWrap: "wrap",
        }}>

            <CameraPTZButtons
                ptzLocked={ptzLocked}
                setPTZLocked={setPTZLocked}
                disabled={controlDisabled}
                ws={ws_ref}
                device_number={device_number}
            >
            </CameraPTZButtons>

            <OverlayButton
                disabled={controlDisabled}
                enableOverlay={enableOverlay}
                setEnableOverlay={setEnableOverlay}
            ></OverlayButton>

            <CameraVisitButton device_number={device_number}></CameraVisitButton>

        </div>

        <div style={{
            aspectRatio: "16 / 9",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
        }}>
            <WebSocketVideoPlayer
                key={playerKey}
                ws_ref={ws_ref}
                url={webSocketURL}
                verbose={true}
                metadata_key="detections"
                onFirstFrame={(frame, metadata) => {
                    setControlDisabled(false)
                }}
                showOverlay={enableOverlay}
                extraText={deviceName}
            ></WebSocketVideoPlayer>

        </div>

    </div>
}

export function LivePage({ device_number, setSelected, style, numDevice = 6 }) {

    const [enableOverlay, setEnableOverlay] = useState(true)
    const [deviceInfo, setDeviceInfo] = useState([])

    useEffect(_ => {
        (async _ => {
            const device_numbers = Array(numDevice).fill().map((_, i) => i + 1)
            const device_info = await Promise.all(device_numbers.map(async x => ({
                device_number: x,
                device_name: await getDeviceName(x)
            })))
            setDeviceInfo(device_info)
        })()
    }, [])

    return device_number == 0 ?
        <div style={{ display: "flex", gap: 8, flexDirection: "column", height: "100%", ...style }}>
            <div style={{ display: "flex", gap: 8, justifyContent: "end" }}>
                <Button icon={enableOverlay ? "layers" : "layers_clear"}
                    onClick={e => { setEnableOverlay(!enableOverlay) }}></Button>
            </div>
            <GridContainer style={{ flex: 1 }}>
                {deviceInfo.map(({ device_number, device_name }, i) => {
                    const device_root = getDeviceRoot(device_number)
                    let ws_url = `wss://${device_root}/api/stream`
                    if (device_number == 1)
                        ws_url = `wss://${device_root}/api`
                    return <WebSocketVideoPlayer
                        key={device_number}
                        url={ws_url}
                        onClick={_ => setSelected(device_number)}
                        style={{ cursor: "pointer" }}
                        showOverlay={enableOverlay}
                        extraText={device_name}
                    ></WebSocketVideoPlayer>
                })}
            </GridContainer>
        </div>
        : <SingleLivePage device_number={device_number} style={style}></SingleLivePage>
}
