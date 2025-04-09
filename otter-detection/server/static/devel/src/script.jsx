"use strict"

import { createRoot } from "react-dom/client"
import React, { useState, useEffect, useRef } from "react"

import { Drawer } from "./mwc/drawer"
import { List, ListItem, Divider } from "./mwc/list"
import { Icon, IconButton } from "./mwc/icon"
import { TabBar, Tab } from "./mwc/tab-bar"

import { LeftAndRightLogo, WhiteLogo } from "./logo"
import { useState2 } from "./util"
import { DeviceList } from "./device-list"
import { LivePage } from "./live/live-page"
import { RecorderPage } from "./recorder/recorder-page"

import { getTXRX } from "./recorder/websocket"

import { DataGridAndChart } from "./monitor/data-grid-and-chart"

// TODO: Hover to reconnect
// TODO: Skeleton handling for all pages
// TODO: VIDEO DOWNLOAD DOESNT WORK

function App() {

    const [drawerOpen, setDrawerOpen] = useState(false)
    const [selectAllDisabled, setSelectAllDisabled] = useState()
    const [compactLayout, setCompactLayout] = useState(false)

    // URL hash states
    const [tabValue, setTabValue] = useState2("tab", "Live")
    const [selectedDevice, setSelectedDevice] = useState2("device", 0)

    const num_device = 6

    useEffect(_ => {
        if (tabValue == "Recorder")
            setSelectAllDisabled(true)
        else
            setSelectAllDisabled(false)
    }, [tabValue])

    useEffect(_ => {
        setDrawerOpen(false)
    }, [selectedDevice])

    function onResize() {
        setCompactLayout(window.innerWidth < 800)
    }

    useEffect(_ => {
        // setInterval(_ => console.log(getTXRX()), 1000)
        addEventListener("resize", _ => onResize())
        onResize()
    }, [])

    const top_app_bar_shadow_color = "orangered"
    return <>
        <Drawer
            drawerOpen={drawerOpen}
            setDrawerOpen={setDrawerOpen}
            drawerWidth={"320px"}
            drawerTitle={<LeftAndRightLogo
                left="/cag_otter/assets/v3_logo.png"
                right="/cag_otter/assets/cag_logo.png"
            ></LeftAndRightLogo>}
            drawerContent={<>
                <List activatable style={{ flex: 1, overflowY: "auto" }}>
                    <ListItem
                        disabled={selectAllDisabled}
                        {...selectedDevice == 0 && { activated: true }}
                        graphic={
                            <Icon style={{
                                ...(selectedDevice == 0 && {
                                    // color: "var(--mdc-theme-primary)",
                                })
                            }}>grid_view</Icon>}
                        primary={"All devices"}
                        style={{ "--mdc-list-item-graphic-margin": 20 }}
                        onClick={_ => {
                            console.log("Selected all devices")
                            setSelectedDevice(0)
                            setDrawerOpen(false)
                        }}
                    ></ListItem>
                    <Divider></Divider>
                    <DeviceList
                        selected={selectedDevice}
                        setSelected={setSelectedDevice}
                        numDevice={num_device}
                    ></DeviceList>
                </List>
                <List>
                    <Divider></Divider>
                    <ListItem
                        graphic={<Icon>fullscreen</Icon>}
                        primary={"Toggle full screen"}
                        onClick={_ => {
                            if (document.fullscreenElement)
                                document.exitFullscreen()
                            else
                                document.documentElement.requestFullscreen()
                        }}
                    ></ListItem>
                </List>
            </>}
            appBackground="linear-gradient(to right, gold, orangered, purple)"
            appTitle={<WhiteLogo url="/cag_otter/assets/v3_logo.png"></WhiteLogo>}
            appTitleShadow={top_app_bar_shadow_color}
            appContent={
                <div style={{
                    flex: 1,
                    padding: "8px",
                    display: "flex",
                    alignItems: "center",
                    flexDirection: "column",
                    gap: "8px",
                    overflowX: "hidden",
                    overflowY: "auto",
                }}>
                    {tabValue == "Live" && <LivePage
                        device_number={selectedDevice}
                        setSelected={setSelectedDevice}
                        numDevice={num_device}
                        style={{ flex: 1, width: "100%" }}
                    ></LivePage>}
                    {tabValue == "Monitor" && <DataGridAndChart
                        device_number={selectedDevice}
                        style={{ flex: 1, width: "100%" }}>
                    </DataGridAndChart>}
                    {tabValue == "Recorder" && <RecorderPage
                        device_number={selectedDevice}
                        setDevice={setSelectedDevice}
                        style={{ flex: 1, width: "100%" }}
                    >
                    </RecorderPage>}
                </div>
            }
            appActionItems={
                <div style={{ display: "flex", alignItems: "center" }}>
                    <TabBar tab={tabValue} setValue={setTabValue} color="white">
                        <Tab iconOnly={compactLayout} label="Live" icon="live_tv"></Tab>
                        <Tab iconOnly={compactLayout} label="Recorder" icon="dvr"></Tab>
                        <Tab iconOnly={compactLayout} label="Monitor" icon="bar_chart"></Tab>
                        <Tab iconOnly={compactLayout} label="Events" icon="pets"></Tab>
                    </TabBar>
                </div>}
        >
        </Drawer>
    </>
}

addEventListener("load", _ => createRoot(document.body).render(<App />))