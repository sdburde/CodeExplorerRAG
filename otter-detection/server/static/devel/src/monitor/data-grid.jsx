"use strict"

import React, { useState, useEffect, useRef } from "react"

import "@material/mwc-button"
import "@material/mwc-menu"

import { queryInflux } from "../influx"
import {
    getStandardColumnDefs,
    getBatteryParameterColumnDefs,
    getBatteryStatusColumnDefs,
} from "./data-grid-column-defs"

import { createGrid, themeQuartz } from "ag-grid-community"

export function DataGrid({ device_number, duration, mode, field, setField, setFieldName, setDeviceNumbers, setTime, style }) {
    const container_ref = useRef()
    const [grid, setGrid] = useState()

    // Fire once only
    useEffect(_ => {
        const grid_container = container_ref.current
        const g = createGrid(grid_container, {
            theme: themeQuartz,
            loadThemeGoogleFonts: false,
            overlayLoadingTemplate: "<mwc-circular-progress indeterminate></mwc-circular-progress>",
            selectionColumnDef: {
                pinned: "left",
                width: 30,
            },
            defaultColDef: {
                resizable: false,
                // suppressMovable: true,
                type: "numericColumn",
            },
            tooltipShowDelay: 500, // Needed else tooltip takes forever to show
            onCellClicked: params => {
                const field = params.colDef.field
                if (["device_name", "time", "since", "uptime"].includes(field))
                    return // Do nothing
                // NOTE: Empty field is row selection column
                else if (field && field.length)
                    setField(field)
            },
            onSelectionChanged: x => {
                // AGGrid API triggers onSelectionChanged when grid is reset
                if (x.source == "api")
                    return
                const devices = x.api.getSelectedNodes().map(
                    node => +node.data.device.replace("otterbox", ""))
                console.log("Set devices", devices)
                setDeviceNumbers(devices)
            },
        })
        setGrid(g)
    }, [])

    function updateFieldName() {
        setFieldName(grid?.getColumnDef(field)?.headerTooltip)
    }

    useEffect(_ => { updateFieldName() }, [field, grid])

    useEffect(_ => {
        grid?.setGridOption("onCellMouseOver", params => {
            if (device_number > 0)
                setTime(params.data.time)
        })
    }, [grid, device_number])

    useEffect(_ => {
        (async function () {
            if (!grid || !duration || !mode)
                return
            grid.setGridOption("loading", true)
            let data
            const single_device = device_number > 0
            let column_defs =
                mode == "Standard" ? getStandardColumnDefs() :
                    mode == "Battery parameter" ? getBatteryParameterColumnDefs() :
                        mode == "Battery status" ? getBatteryStatusColumnDefs() : null
            const fields = column_defs.map(x => x.field).join(",")

            if (single_device) {
                column_defs = column_defs.filter(x => !["since"].includes(x.field))
                data = await queryInflux(`
                    SELECT ${fields}
                    FROM cag_otter
                    WHERE TIME > NOW() - ${duration} AND device = 'otterbox${device_number}'
                    GROUP BY device
                    ORDER BY time DESC
                `)
                data = data[0]
            }
            else {
                data = await queryInflux(`
                    SELECT ${fields}
                    FROM cag_otter
                    WHERE TIME > NOW() - ${duration}
                    GROUP BY device
                `)
                data = data.map(d => {
                    const last = d[d.length - 1]
                    last.since = (new Date() - new Date(last.time)) / 1000
                    return last
                })
            }
            grid.setGridOption("columnDefs", column_defs)
            grid.setGridOption("rowData", data)
            grid.setGridOption("loading", false)
            grid.setGridOption("rowSelection", device_number == 0 ? { mode: "multiRow" } : null)
            updateFieldName()
        })()
    }, [grid, device_number, duration, mode])

    // Parent container for flex: 1 and other sizing. Child will always fill parent
    return <div ref={container_ref} className="ag-theme-quartz" style={{
        "--ag-cell-horizontal-padding": "8px",
        "--ag-row-height": "24px",
        "--ag-header-height": "var(--ag-row-height)",
        "--ag-font-family": "Roboto",
        // "--ag-header-font-weight": "bold",
        "--ag-accent-color": "var(--mdc-theme-primary)",
        ...style
    }}></div>
}
