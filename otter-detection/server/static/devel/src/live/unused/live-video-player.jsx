"use strict"

import React, { useState, useEffect, useRef } from "react"

export function LivePage({
    selectedDevice
}) {
    <GridContainer isGridView={selectedDevice == 0} style={{
        flex: 1,
        width: "100%",
    }}>
        {deviceData.map((x, i) => {
            return (selectedDevice == 0 || selectedDevice == i + 1) && <VideoPlayer
                key={i}
                ref={x => video_player_refs.current[i] = x}
                device_number={x.device_number}
                ptz={selectedDevice == i + 1}
                overlay={enableOverlay}
                onClick={_ => {
                    console.log("Clicked video player", i)
                    list_item_refs.current[i].click()
                }}
            ></VideoPlayer>
        })}
    </GridContainer>
}