"use strict"

import React, { useState, useEffect, useRef } from "react"

import { queryInflux } from "../influx"
import { color_names, toSizeString, getDeviceName } from "../util"

import { AgCharts } from "ag-charts-community"

function setChartWidth(chart, width) {
    chart.chart.ctx.domManager.container.style.width = width
}
function scrollToRight(chart) {
    const container = chart.chart.ctx.domManager.container
    container.parentElement.scrollLeft = container.parentElement.scrollWidth
}

export function DataChart({ style, field, fieldName, duration, device_numbers, time }) {
    const ref = useRef()
    const [chart, setChart] = useState()
    const [loading, setLoading] = useState()
    const [title, setTitle] = useState("")
    const [axes, setAxes] = useState([])

    useEffect(_ => setChart(AgCharts.create({
        container: ref.current,
    })), [])

    useEffect(_ => {
        if (!axes.length || !chart)
            return
        // console.log(axes[0].max, +new Date(time))
        axes[0].crossLines = [{
            stroke: "purple",
            strokeWidth: 4,
            strokeOpacity: 0.3,
            type: "line",
            value: +new Date(time),
        }]
        chart.updateDelta({ axes })
    }, [time])

    useEffect(_ => {
        (async _ => {
            if (!chart || !field || !duration)
                return

            setLoading(true)
            setTitle("")

            let extra_condition = ""

            if (device_numbers.length) {
                extra_condition = device_numbers.map(x => `device = 'otterbox${x}'`).join(" OR ")
                extra_condition = `AND (${extra_condition})`
            }

            const data = await queryInflux(`
                SELECT MEAN(${field}) AS ${field}
                FROM cag_otter
                WHERE TIME > NOW() - ${duration} ${extra_condition}
                GROUP BY device, TIME(10m)
            `)

            const series = data.map(x => {
                const device_index = +x[0].device.replace("otterbox", "") - 1
                const color = color_names[device_index % color_names.length]
                x.forEach(x => x.time = new Date(x.time))
                return {
                    type: "line", xKey: "time", yKey: field,
                    stroke: color,
                    marker: { enabled: false },
                    data: x,
                    interpolation: { type: "smooth" },
                    tooltip: {
                        renderer: function ({ datum, xKey, yKey }) {
                            const date_string = datum.time.toLocaleString("en-US", {
                                month: "short", day: "numeric", weekday: "short",
                                hour: "numeric", minute: "numeric",
                            })
                            let value = datum[yKey]
                            value = toSizeString(value)
                            if (!isNaN(value))
                                value = value.toFixed(3)
                            return {
                                title: date_string,
                                content: value,
                            };
                        },
                    },
                }
            })

            const title = fieldName || field
            let device_title = "?"
            if (device_numbers.length == 1)
                device_title = await getDeviceName(device_numbers[0], { verbose: true })
            else if (device_numbers.length > 1)
                device_title = `${device_numbers.length} Devices`
            else
                device_title = "All Devices"
            setTitle(`${title} of ${device_title}`)
            chart.update({
                series: series,
                legend: { enabled: false },
            })
            setLoading(false)

            const interval_values = []
            const grid_styles = []
            let time_min, time_max

            if (data.length) {

                time_min = Math.min(...data.map(x => x[0].time))
                time_max = Math.min(...data.map(x => x[x.length - 1].time))
                const interval_ms = 3600 * 1000 * 6
                const tz_offset = new Date().getTimezoneOffset() * 60 * 1000

                time_min = Math.floor((time_min - tz_offset) / interval_ms) * interval_ms + tz_offset
                time_max = Math.ceil((time_max - tz_offset) / interval_ms) * interval_ms + tz_offset
                for (let t = time_min; t <= time_max; t += interval_ms) {
                    const hours = ((t - tz_offset) % (24 * 3600 * 1000)) / 3600 / 1000
                    if (hours == 0)
                        grid_styles.push({ stroke: "#0006", lineDash: [4, 2] })
                    else if (hours == 12)
                        grid_styles.push({ stroke: "#0004", lineDash: [4, 2] })
                    else
                        grid_styles.push({ stroke: "#0002", lineDash: [2, 2] })
                    interval_values.push(t)
                }
                const days = (time_max - time_min) / 24 / 3600 / 1000
                setChartWidth(chart, days * 256)
            }
            else
                setChartWidth(chart, "initial")

            // NOTE: Axes needs to be updated later else AG Charts might throw error.
            // Property [min] of [NumberAxis] cannot be set to [VALUE]; expecting to be less than max, ignoring.
            const axes = [
                {
                    type: "number",
                    position: "bottom",
                    label: {
                        formatter: function (params) {
                            const date = new Date(params.value)
                            const hours = date.getHours()
                            if (hours == 0)
                                return date.toLocaleString("en-US", {
                                    month: "short", day: "numeric"
                                })
                            else
                                return ""
                        }
                    },
                    nice: false,
                    interval: { values: interval_values },
                    min: time_min,
                    max: time_max,
                    gridLine: { style: grid_styles },
                },
                {
                    type: "number",
                    position: "right",
                    gridLine: { style: [{ stroke: "#0002", lineDash: [2, 2] }] },
                    label: { formatter: ({ value }) => toSizeString(value) },
                },
            ]
            setAxes(axes)
            chart.updateDelta({ axes })
            scrollToRight(chart)
        })()
    }, [chart, field, fieldName, duration, device_numbers])

    // Fixed container
    return <div style={{
        border: "1px solid #0002",
        borderRadius: "8px",
        position: "relative",
        overflow: "hidden",
        fontFamily: "Roboto",
        ...style
    }}>
        <div // Horizontally scrollable container
            style={{
                height: "100%",
                overflowX: "auto",
                overflowY: "hidden",
            }}
        >
            <div style={{
                // Sometimes bottom labels are not visible without 100%
                height: "100%",
            }} ref={ref}></div>
        </div>
        <div style={{
            fontFamily: "Roboto",
            position: "absolute",
            top: "8px",
            left: "50%",
            transform: "translateX(-50%)",
        }}>{title}</div>

        {loading && <div style={{
            "position": "absolute",
            "top": 0,
            "display": "flex",
            "width": "100%",
            "height": "100%",
            "alignItems": "center",
            "justifyContent": "center",
            "background": "#fff8",
        }}>
            <mwc-circular-progress indeterminate></mwc-circular-progress>
        </div>}

    </div>
}


