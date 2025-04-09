"use strict"

import React, { useState, useEffect, useRef } from "react"

import { ListItem } from "./mwc/list"
import { Icon, CroppedIcon, BatteryIcon } from "./mwc/icon"
import { toDurationString, getDeviceName } from "./util"
import { queryInflux } from "./influx"

import "./skeleton-loading.css"

export function DeviceList({ selected, numDevice, setSelected, interval = 300 }) {

    const [deviceData, setDeviceData] = useState([])

    async function pullData() {
        // NOTE: SELECT uptime is dummy, need to SELECT something reliable to get list of devices
        let data = await queryInflux(`
        SELECT LAST(uptime) AS uptime
        FROM cag_otter
            WHERE TIME > NOW() - 30d
        GROUP BY device, TIME(1h)
        `)
        // Prefill with placeholders for rendering
        setDeviceData(Array(numDevice).fill().map(_ => []))

        const device_numbers = Array(numDevice).fill().map((_, i) => i + 1)
        const data_by_device = Object.fromEntries(await Promise.all(device_numbers.map(async n => {
            const device = `otterbox${n}`
            const device_name = await getDeviceName(n)
            return [device, { device_name: device_name, device_number: n }]
        })))

        const now = new Date()
        const midnight = new Date(now)
        midnight.setHours(0, 0, 0, 0)
        if (now.getHours() == 0) // Allow 1 hour of data collection
            midnight.setDate(midnight.getDate() - 1)
        data = await queryInflux(`
            SELECT
            uptime as uptime,
            epever_battery_state_of_charge AS soc,
            epever_solar_power AS solar_power,
            epever_total_generated_energy AS generated
            FROM cag_otter WHERE TIME > '${midnight.toISOString()}'
            GROUP BY device
        `)

        data.forEach(async d => {
            const first = d[0]
            const last = d[d.length - 1]
            last.generated -= first.generated
            // Set device name according to availability of user specified name
            const device = last.device
            // Overwrite LAST active time
            data_by_device[device] = Object.assign(data_by_device[device], last)
        })
        let device_data = Object.values(data_by_device)
        device_data = device_data.sort((a, b) => a.device_number - b.device_number)
        setDeviceData(device_data)
    }

    useEffect(_ => {
        pullData()
        setInterval(_ => pullData(), interval * 1000)
    }, [])


    return <>
        {deviceData.map(({ device_name, device_number, soc, solar_power, generated, time }, i) => {
            const duration = (new Date() - new Date(time)) / 1000
            const disconnected = duration > 60 * 10
            // Note: #c is 80%
            const primary_color = "var(--mdc-theme-primary)"
            const is_selected = selected == i + 1
            const icon_color = is_selected ? "--mdc-theme-primary" : "#0008"
            return <ListItem
                {...is_selected && { activated: true }}
                key={i}
                graphic={<Icon>{`videocam`}</Icon>}
                primary={
                    device_name ? device_name
                        : <div className="skeleton-loading" style={{ width: "128px", height: "1rem" }}></div>
                }
                // NOTE: Title is for super long user specified name
                title={device_name}
                secondary={
                    device_name ? <div style={{
                        display: "inline-block",
                        ...(is_selected && { color: primary_color }),
                    }}>
                        <div style={{ display: "flex", gap: "6px", alignItems: "center", height: "0.7rem" }}>
                            {<BatteryIcon soc={soc} color={icon_color}></BatteryIcon>}
                            {`${soc || 0}%`}
                            {generated > 0 && <>
                                <CroppedIcon color={icon_color}>eco</CroppedIcon>
                                {/* Note thin space unicode for spacing */}
                                {`${Math.ceil(generated * 1000)} Wh`}
                            </>}
                            {/* Show disconnected duration if not live, otherwise show LIVE data */}
                            {disconnected ? <>
                                <CroppedIcon color={icon_color}>wifi_off</CroppedIcon>
                                {toDurationString(duration)}
                            </> : <>
                                {solar_power > 0 && <>
                                    <CroppedIcon color={icon_color}>sunny</CroppedIcon>
                                    {`${Math.ceil(solar_power)} W`}
                                </>}
                            </>}
                        </div>
                    </div>
                        : <div className="skeleton-loading" style={{
                            height: "0.8rem",
                            width: "64px",
                        }}></div>
                }
                onClick={_ => setSelected(device_number)}
            ></ListItem >
        })}
    </>
}
