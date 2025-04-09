"use strict"

import React, { useEffect, useRef, useState } from "react"

import "@material/mwc-drawer"
import "@material/mwc-top-app-bar"
import "@material/mwc-icon-button"

export function waitForShadowRoot(target) {
    return new Promise(resolve => {
        if (target.shadowRoot)
            resolve()
        else {
            const observer = new MutationObserver(() => {
                if (target.shadowRoot) {
                    resolve()
                    observer.disconnect()
                }
            })
            observer.observe(target, { childList: true })
        }
    })
}

// NOTE: TopAppBar is dependent on Drawer for landscapeMode title hiding
export function Drawer({
    drawerTitle, drawerContent, drawerWidth,
    appTitle, appContent, appBackground, appActionItems, appTitleShadow,
    landscapeMinWidth = 800, drawerOpen, setDrawerOpen
}) {
    const ref = useRef()
    const [landScapeMode, setLandscapeMode] = useState()

    function resize() {
        setLandscapeMode(innerWidth >= landscapeMinWidth && innerWidth > innerHeight)
    }

    useEffect(_ => {
        const drawer = ref.current
        drawer.addEventListener("MDCTopAppBar:nav", _ => setDrawerOpen(!drawerOpen))
        // NOTE: Needed to make sure React State is in sync (background tap close)
        drawer.addEventListener("MDCDrawer:closed", _ => { setDrawerOpen(false) })
        drawer.addEventListener("MDCDrawer:opened", _ => { setDrawerOpen(true) })
        const observer = new ResizeObserver(_ => resize())
        observer.observe(ref.current)
        return _ => observer.disconnect()
    }, [])

    return (
        <mwc-drawer ref={ref}
            hasHeader {...!landScapeMode && { type: "modal" }}
            open={drawerOpen}
            style={drawerWidth && { "--mdc-drawer-width": drawerWidth }}
        >
            <span slot="title" >{drawerTitle}</span>
            <div style={{
                display: "flex",
                flexDirection: "column",
                height: "100%",
            }}>
                {drawerContent}
            </div>
            <div slot="appContent" style={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
            }}>
                {TopAppBar({
                    title: appTitle,
                    titleShadow: appTitleShadow,
                    actionItems: appActionItems,
                    background: appBackground,
                    landScapeMode,
                })}
                {appContent}
            </div>
        </mwc-drawer>
    )
}

export function TopAppBar({ title, actionItems, landScapeMode, background }) {

    const ref = useRef()
    useEffect(_ => {
        (async _ => {
            const top_app_bar = ref.current
            await waitForShadowRoot(top_app_bar)
            // Background gradient hack
            if (background)
                top_app_bar.shadowRoot.querySelector(".mdc-top-app-bar").style.background = background
        })()
    }, [])

    return <mwc-top-app-bar ref={ref} style={{
        // github.com/material-components/material-web/issues/705#issuecomment-656317015
        ...landScapeMode && { "--mdc-top-app-bar-width": "calc(100% - var(--mdc-drawer-width))" },
        // NOTE: To avoid flickering default purple background onload
        ...background && { "--mdc-theme-primary": "transparent" },
    }}>
        {!landScapeMode && <mwc-icon-button slot="navigationIcon" icon="menu" ></mwc-icon-button>}
        {!landScapeMode && <div slot="title" style={{
            minWidth: 96,
        }}>{title}</div>}
        {/* NOTE: Overflow hidden is required for horizontal scrolling to work on small display */}
        <div slot="actionItems" style={{ overflow: "hidden" }}>{actionItems}</div>
    </mwc-top-app-bar>
}