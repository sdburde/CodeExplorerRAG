"use strict"

import React, { useState, useEffect, useRef } from "react"

import { Menu } from "../mwc/menu"
import { DataGrid } from "./data-grid"
import { DataChart } from "./data-chart"
import { useState2 } from "../util"

export function DataGridAndChart({ style, device_number }) {
    const [mode, setMode] = useState()
    const [duration, setDuration] = useState()
    // const [column, setColumn] = useState({
    //     field: "epever_solar_power",
    //     headerTooltip: "Solar Power",
    // }) // Plot this first
    const [field, setField] = useState2("field", "epever_solar_power")
    const [fieldName, setFieldName] = useState()
    const [deviceNumbers, setDeviceNumbers] = useState([])
    const [time, setTime] = useState()

    // NOTE: device state can only be either one or all, while devices state can be any combination of all devices
    useEffect(_ => {
        if (device_number > 0)
            setDeviceNumbers([device_number]) // One camera only
        else
            setDeviceNumbers([]) // All camera
    }, [device_number])

    // Parent container for flex: 1 and other sizing. Child will always fill parent
    return <div style={{
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        ...style
    }}>
        <DataChart
            field={field}
            fieldName={fieldName}
            duration={duration}
            device_numbers={deviceNumbers}
            time={time}
            style={{ flex: 1, width: "100%" }}>
        </DataChart>
        <div style={{
            display: "flex",
            gap: "8px",
            justifyContent: "end",
        }}>
            <Menu value={duration} setValue={setDuration}
                icon="schedule" outlined>
                <mwc-list-item value="1w">1 week</mwc-list-item>
                <mwc-list-item value="4w">1 month</mwc-list-item>
                <mwc-list-item value="12w">3 month</mwc-list-item>
            </Menu>
            <Menu value={mode} setValue={setMode}
                icon="filter_list" unelevated>
                <mwc-list-item>Standard</mwc-list-item>
                <li divider={""} role="separator"></li>
                <mwc-list-item>Battery status</mwc-list-item>
                <mwc-list-item>Battery parameter</mwc-list-item>
            </Menu>
        </div>
        <DataGrid
            device_number={device_number}
            duration={duration}
            mode={mode}
            setDeviceNumbers={setDeviceNumbers}
            setTime={setTime}
            style={{ flex: 1, width: "100%" }}
            // NOTE: field for initial value, setField for user interaction, setFieldName for title
            field={field}
            setField={setField}
            setFieldName={setFieldName}
        ></DataGrid>
    </div >
}


