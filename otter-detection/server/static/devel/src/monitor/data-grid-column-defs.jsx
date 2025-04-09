"use strict"

import { toDurationString, toSizeString, toDateString, color_names } from "../util"

export function getDeviceColumnDefs() {
    return [
        {
            field: "device_name", headerName: "#", width: 10, pinned: "left",
            valueFormatter: x => +x.data.device.replace("otterbox", "")
        },
        {
            field: "device_name", headerName: "Device name", width: 120, pinned: "left",
            type: "", // left aligned is empty string default
            resizable: true,
            cellRenderer: x => {
                const size = 12
                const device_name = x.value || "-"
                const device_index = +x.data.device.replace("otterbox", "") - 1
                const color = color_names[device_index % color_names.length]
                return `<div style="display:flex;align-items:center;gap:8px">
                <div style="width:${size};height:${size};border:1px solid black;background:${color}"></div>
                <div style="flex:1;overflow:hidden">${device_name}</div>
            <div>`
            }
        },
    ]
}

export function getTimeColumnDef() {
    return {
        field: "time", headerName: "Time", width: 110, pinned: "left",
        valueFormatter: x => toDateString(x.value)
    }
}

export function fieldToLongName(x) {
    const words = x.split("_").map(x => ({
        mosfet: "MOSFET",
        pv: "PV",
    }[x] || (x[0].toUpperCase() + x.slice(1))))
    return words.join(" ")
}

function booleanToCharacter(params) {
    return params.value ? "■" : "□"
}

function toCamelCase(params) {
    return params.value?.split("_").map(x => x[0].toUpperCase() + x.slice(1).toLowerCase()).join(" ")
}

export function getStandardColumnDefs() {
    return [
        ...getDeviceColumnDefs(),
        getTimeColumnDef(),
        {
            field: "since", headerName: "Since", width: 120, valueFormatter: x => `${toDurationString(x.value)} ago`, cellStyle: x => {
                return x.value > 10 * 60 && { color: "#c00", fontWeight: "bold" }
            }
        },
        { field: "uptime", headerName: "Uptime", width: 100, headerTooltip: "Uptime", valueFormatter: x => toDurationString(x?.value) },
        { field: "epever_battery_state_of_charge", headerName: "Bat%", width: 50, headerTooltip: "Battery State of Charge" },
        { field: "epever_battery_voltage", headerName: "BatV", width: 50, headerTooltip: "Battery Voltage", valueFormatter: x => x.value?.toFixed(1) },
        { field: "epever_solar_power", headerName: "Solar", width: 60, headerTooltip: "Solar Power" },
        { field: "epever_load_power", headerName: "Load", width: 50, headerTooltip: "Load Power", valueFormatter: x => x.value?.toFixed(1) },
        { field: "epever_generated_energy_today", headerName: "Day+", headerTooltip: "Daily Generated Energy", width: 60 },
        { field: "epever_consumed_energy_today", headerName: "Day-", headerTooltip: "Daily Consumed Energy", width: 60 },
        { field: "epever_generated_energy_this_month", headerName: "Mon+", headerTooltip: "Monthly Generated Energy", width: 60 },
        { field: "epever_consumed_energy_this_month", headerName: "Mon-", headerTooltip: "Monthly Consumed Energy", width: 60 },

        { field: "tegrastats_cpu_percent", headerName: "CPU", width: 50, headerTooltip: "Computer CPU Usage", valueFormatter: x => Math.round(x.value) },
        { field: "tegrastats_ram_percent", headerName: "RAM", width: 50, headerTooltip: "Computer RAM Usage", valueFormatter: x => Math.round(x.value) },
        { field: "tegrastats_tj", headerName: "Temp", width: 60, headerTooltip: "Computer Temperature", valueFormatter: x => x.value?.toFixed(1) },
        { field: "tegrastats_vdd_in", headerName: "VDD", width: 50, headerTooltip: "Computer Power Consumption", valueFormatter: x => x.value?.toFixed(1) },

        { field: "modem_daily_rx", headerName: "DayRX", width: 70, headerTooltip: "Daily Received Data", valueFormatter: x => toSizeString(x.value) },
        { field: "modem_daily_tx", headerName: "DayTX", width: 70, headerTooltip: "Daily Transmitted Data", valueFormatter: x => toSizeString(x.value) },
        { field: "modem_monthly_rx", headerName: "MonRX", width: 70, headerTooltip: "Monthly Received Data", valueFormatter: x => toSizeString(x.value) },
        { field: "modem_monthly_tx", headerName: "MonTX", width: 70, headerTooltip: "Monthly Transmitted Data", valueFormatter: x => toSizeString(x.value) },
        { field: "modem_state", headerName: "LTE", width: 100, headerTooltip: "Modem State" },
        { field: "network_poe_state", headerName: "PoE", width: 100, headerTooltip: "PoE State" },
        { field: "modem_signal_quality", headerName: "Sig", width: 50, headerTooltip: "Signal Quality" },
        { field: "modem_operator_name", headerName: "Operator", width: 80, headerTooltip: "Operator Name", valueFormatter: x => x.value == "Zero1 Zero1" ? "Zero1" : x.value },
        // { field: "gps_latitude", headerName: "Latitude", width: 120, headerTooltip: "GPS Latitude" },
        // { field: "gps_longitude", headerName: "Longitude", width: 120, headerTooltip: "GPS Longitude" },
    ]
}

export function getBatteryParameterColumnDefs() {
    const column_defs = [
        ...getDeviceColumnDefs(),
        getTimeColumnDef(),
        { field: "epever_parameter_battery_capacity", headerName: "BCAP", width: 60 },
        { field: "epever_parameter_battery_charge", headerName: "BCHG", width: 60 },
        { field: "epever_parameter_battery_discharge", headerName: "BDCH", width: 60 },
        { field: "epever_parameter_battery_rated_voltage", headerName: "BRV", width: 60, valueFormatter: toCamelCase },
        { field: "epever_parameter_battery_real_rated_voltage", headerName: "BRRV", width: 60 },
        { field: "epever_parameter_rated_charging_current", headerName: "CC", width: 60 },
        { field: "epever_parameter_rated_load_current", headerName: "LC", width: 60 },
        { field: "epever_parameter_battery_type", headerName: "BT", width: 70, valueFormatter: toCamelCase },

        { field: "epever_parameter_equalize_charging_voltage", headerName: "ECV", width: 60 },
        { field: "epever_parameter_equalize_duration", headerName: "ED", width: 60 },
        { field: "epever_parameter_boost_charging_voltage", headerName: "BCV", width: 60 },
        { field: "epever_parameter_boost_duration", headerName: "BD", width: 60 },
        { field: "epever_parameter_float_charging_voltage", headerName: "FCV", width: 60 },

        { field: "epever_parameter_charging_limit_voltage", headerName: "CLV", width: 60 },
        { field: "epever_parameter_discharging_limit_voltage", headerName: "DLV", width: 60 },
        { field: "epever_parameter_low_voltage_disconnect_voltage", headerName: "LVDV", width: 60 },
        { field: "epever_parameter_low_voltage_reconnect_voltage", headerName: "LVRV", width: 60 },
        { field: "epever_parameter_over_voltage_disconnect_voltage", headerName: "OVDV", width: 60 },
        { field: "epever_parameter_over_voltage_reconnect_voltage", headerName: "OVRV", width: 60 },
        { field: "epever_parameter_under_voltage_recover_voltage", headerName: "UVRV", width: 60 },
        { field: "epever_parameter_under_voltage_warning_voltage", headerName: "RVWV", width: 60 },
        { field: "epever_parameter_boost_reconnect_charging_voltage", headerName: "BRCV", width: 60 },


        { field: "epever_parameter_default_load_on_off_in_manual_mode", headerName: "DLMM", width: 60 },
        { field: "epever_parameter_temperature_compensation_coefficient", headerName: "TCC", width: 60 },
        { field: "epever_parameter_charging_mode", headerName: "Charging Mode", width: 160, valueFormatter: toCamelCase },
    ]
    column_defs.forEach(x => x.headerTooltip = fieldToLongName(x.field.replace("epever_parameter_", "")))
    return column_defs
}

export function getBatteryStatusColumnDefs() {
    const column_defs = [
        ...getDeviceColumnDefs(),
        getTimeColumnDef(),
        { field: "epever_battery_state_of_charge", headerName: "SOC", width: 60 },
        { field: "epever_battery_voltage", headerName: "BV", width: 60 },
        { field: "epever_battery_current", headerName: "BC", width: 60 },
        { field: "epever_load_current", headerName: "LC", width: 60 },
        { field: "epever_load_power", headerName: "LP", width: 60 },
        { field: "epever_battery_temperature", headerName: "BT", width: 60 },
        { field: "epever_controller_temperature", headerName: "CT", width: 60 },
        { field: "epever_consumed_energy_today", headerName: "CET", width: 60 },
        { field: "epever_consumed_energy_this_month", headerName: "CEM", width: 60 },
        { field: "epever_consumed_energy_this_year", headerName: "CEY", width: 60 },
        { field: "epever_generated_energy_today", headerName: "GED", width: 60 },
        { field: "epever_generated_energy_this_month", headerName: "GEM", width: 60 },
        { field: "epever_generated_energy_this_year", headerName: "GEY", width: 60 },
        { field: "epever_maximum_battery_voltage_today", headerName: "MXBD", width: 60 },
        { field: "epever_maximum_pv_voltage_today", headerName: "MXPD", width: 60 },
        { field: "epever_minimum_battery_voltage_today", headerName: "MNBD", width: 60 },
        { field: "epever_minimum_pv_voltage_today", headerName: "MNPD", width: 60 },

        { field: "epever_battery_status", headerName: "Battery Status", width: 120, valueFormatter: toCamelCase },
        { field: "epever_charging_charging_status", headerName: "Charging Status", width: 120, valueFormatter: toCamelCase },
        { field: "epever_charging_input_voltage_status", headerName: "CIVS", width: 80, valueFormatter: toCamelCase },
        { field: "epever_discharging_input_voltage_status", headerName: "DIVS", width: 80, valueFormatter: toCamelCase },
        { field: "epever_discharging_output_power_load", headerName: "DOPL", width: 80, valueFormatter: toCamelCase },

        { field: "epever_battery_inner_resistence_abnormal", headerName: "IRA", width: 50, cellRenderer: booleanToCharacter },
        { field: "epever_charging_anti_reverse_mosfet_is_short_circuit", headerName: "ASC", width: 50, cellRenderer: booleanToCharacter },
        { field: "epever_charging_charging_mosfet_is_short_circuit", headerName: "CSC", width: 50, cellRenderer: booleanToCharacter },
        { field: "epever_charging_charging_or_anti_reverse_mosfet_is_open_circuit", headerName: "MOC", width: 50, cellRenderer: booleanToCharacter },
        { field: "epever_charging_disequilibrium_in_three_circuits", headerName: "DTC", width: 50, cellRenderer: booleanToCharacter },
        { field: "epever_charging_input_over_current", headerName: "IOC", width: 50, cellRenderer: booleanToCharacter },
        { field: "epever_charging_load_mosfet_short_circuit", headerName: "LSC", width: 50, cellRenderer: booleanToCharacter },
        { field: "epever_charging_load_over_current", headerName: "LOC", width: 50, cellRenderer: booleanToCharacter },
        { field: "epever_charging_load_short_circuit", headerName: "LSC", width: 50, cellRenderer: booleanToCharacter },
        { field: "epever_charging_pv_input_short_circuit", headerName: "PSC", width: 50, cellRenderer: booleanToCharacter },
        { field: "epever_charging_running", headerName: "CR", width: 50, cellRenderer: booleanToCharacter },
        { field: "epever_discharging_boost_over_voltage", headerName: "BOV", width: 50, cellRenderer: booleanToCharacter },
        { field: "epever_discharging_fault", headerName: "DF", width: 50, cellRenderer: booleanToCharacter },
        { field: "epever_discharging_input_over_voltage", headerName: "IOV", width: 50, cellRenderer: booleanToCharacter },
        { field: "epever_discharging_output_over_voltage", headerName: "OOV", width: 50, cellRenderer: booleanToCharacter },
        { field: "epever_discharging_output_voltage_abnormal", headerName: "OVA", width: 50, cellRenderer: booleanToCharacter },
        { field: "epever_discharging_running", headerName: "DR", width: 50, cellRenderer: booleanToCharacter },
        { field: "epever_discharging_short_circuit", headerName: "DSC", width: 50, cellRenderer: booleanToCharacter },
        { field: "epever_discharging_short_circuit_in_high_voltage_side", headerName: "SCH", width: 50, cellRenderer: booleanToCharacter },
        { field: "epever_discharging_unable_to_discharge", headerName: "DUD", width: 50, cellRenderer: booleanToCharacter },
        { field: "epever_discharging_unable_to_stop_discharging", headerName: "DUS", width: 50, cellRenderer: booleanToCharacter },
        { field: "epever_is_day", headerName: "Day", width: 50, cellRenderer: booleanToCharacter },
        { field: "epever_is_device_over_temperature", headerName: "DOT", width: 50, cellRenderer: booleanToCharacter },

    ]
    column_defs.forEach(x => x.headerTooltip = fieldToLongName(
        x.field.replace("epever_", "").replace("charging_charging_", "charging_")))
    return column_defs
}

// "time": "2025-03-18T14:05:12Z",
// "active_user": "User",
// "container_top_ram_name": "otter-detection-app-1",
// "container_top_ram_usage": 642357658,
// "epever_battery_current": -1.47,
// "epever_battery_inner_resistence_abnormal": false,
// "epever_battery_state_of_charge": 48,
// "epever_battery_status": "NORMAL",
// "epever_battery_temperature": 25,
// "epever_battery_voltage": 12.42,
// "epever_charging_anti_reverse_mosfet_is_short_circuit": false,
// "epever_charging_charging_mosfet_is_short_circuit": false,
// "epever_charging_charging_or_anti_reverse_mosfet_is_open_circuit": false,
// "epever_charging_charging_status": "NO_CHARGING",
// "epever_charging_disequilibrium_in_three_circuits": false,
// "epever_charging_input_over_current": false,
// "epever_charging_input_voltage_status": "NORMAL",
// "epever_charging_load_mosfet_short_circuit": false,
// "epever_charging_load_over_current": false,
// "epever_charging_load_short_circuit": false,
// "epever_charging_pv_input_short_circuit": false,
// "epever_charging_running": true,
// "epever_consumed_energy_this_month": 5.96,
// "epever_consumed_energy_this_year": 53.26,
// "epever_consumed_energy_today": 0.06,
// "epever_controller_temperature": 30.55,
// "epever_discharging_boost_over_voltage": false,
// "epever_discharging_fault": false,
// "epever_discharging_input_over_voltage": false,
// "epever_discharging_input_voltage_status": "NORMAL",
// "epever_discharging_output_over_voltage": false,
// "epever_discharging_output_power_load": "LIGHT",
// "epever_discharging_output_voltage_abnormal": false,
// "epever_discharging_running": true,
// "epever_discharging_short_circuit": false,
// "epever_discharging_short_circuit_in_high_voltage_side": false,
// "epever_discharging_unable_to_discharge": false,
// "epever_discharging_unable_to_stop_discharging": false,
// "epever_generated_energy_this_month": 6.68,
// "epever_generated_energy_this_year": 59.79,
// "epever_generated_energy_today": 0,
// "epever_is_day": false,
// "epever_is_device_over_temperature": false,
// "epever_load_current": 1.57,
// "epever_load_power": 18.63,
// "epever_maximum_battery_voltage_today": 12.6,
// "epever_maximum_pv_voltage_today": 39.76,
// "epever_minimum_battery_voltage_today": 12.4,
// "epever_minimum_pv_voltage_today": 0.69,
// "epever_parameter_battery_capacity": 150,
// "epever_parameter_battery_charge": 100,
// "epever_parameter_battery_discharge": 30,
// "epever_parameter_battery_rated_voltage": "AUTO",
// "epever_parameter_battery_real_rated_voltage": 12,
// "epever_parameter_battery_type": "SEALED",
// "epever_parameter_boost_charging_voltage": 14.4,
// "epever_parameter_boost_duration": 120,
// "epever_parameter_boost_reconnect_charging_voltage": 13.2,
// "epever_parameter_charging_limit_voltage": 15,
// "epever_parameter_charging_mode": "VOLTAGE_COMPENSATION",
// "epever_parameter_default_load_on_off_in_manual_mode": "ON",
// "epever_parameter_discharging_limit_voltage": 10.6,
// "epever_parameter_equalize_charging_voltage": 14.6,
// "epever_parameter_equalize_duration": 120,
// "epever_parameter_float_charging_voltage": 13.8,
// "epever_parameter_low_voltage_disconnect_voltage": 11.1,
// "epever_parameter_low_voltage_reconnect_voltage": 12.6,
// "epever_parameter_over_voltage_disconnect_voltage": 16,
// "epever_parameter_over_voltage_reconnect_voltage": 15,
// "epever_parameter_rated_charging_current": 30,
// "epever_parameter_rated_load_current": 30,
// "epever_parameter_temperature_compensation_coefficient": 3,
// "epever_parameter_under_voltage_recover_voltage": 12.2,
// "epever_parameter_under_voltage_warning_voltage": 12,
// "epever_solar_current": 0,
// "epever_solar_power": 0,
// "epever_solar_voltage": 0.82,
// "epever_temperature_warning_status": "NORMAL",
// "epever_total_consumed_energy": 199.43,
// "epever_total_generated_energy": 204.53,
// "epever_wrong_identifaction_for_rated_voltage": false,
// "gps_latitude": null,
// "gps_longitude": null,
// "modem_daily_rx": 170099071,
// "modem_daily_tx": 2431162286,
// "modem_monthly_rx": 1039707806,
// "modem_monthly_tx": 8391394625,
// "modem_number": "+6580459760",
// "modem_operator_name": "Zero1",
// "modem_signal_quality": 100,
// "modem_state": "connected",
// "network_gsm_state": "connected",
// "network_poe_state": "connected",
// "tegrastats_cpu_percent": 40,
// "tegrastats_gpu_percent": 99,
// "tegrastats_ram_percent": 54.164,
// "tegrastats_tj": 44.781,
// "tegrastats_vdd_in": 8.097,
// "uptime": "7 days,  9:40",
// "device": "otterbox1"
