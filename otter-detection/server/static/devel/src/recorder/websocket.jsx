"use strict"

import { useEffect, useRef, useImperativeHandle } from "react"

import { encode, decode } from "@msgpack/msgpack"

export function WebSocket2({ ref, urlAndPayload, onOpen, onClose, onMessage }) {

    const ws_ref = useRef()

    useEffect(_ => {
        const { url, payload } = urlAndPayload
        if (!url)
            return
        const ws = ws_ref.current = new WebSocket(url)
        ws.binaryType = "arraybuffer"
        ws.addEventListener("open", _ => {
            console.log("WebSocket opened", url)
            if (payload)
                send(payload)
            onOpen?.()
        })
        ws.addEventListener("close", x => {
            console.log("WebSocket closed", url)
            onClose?.()
        })
        ws.addEventListener("message", e => {
            RX.push({ t: +new Date(), n: e.data.byteLength })
            while (RX.length > 100) RX.shift()
            onMessage(decode(e.data))
        })

        return _ => {
            if (ws.readyState == WebSocket.OPEN)
                ws.close()
        }
    }, [urlAndPayload])

    function send(x) {
        const ws = ws_ref.current
        if (ws?.readyState != WebSocket.OPEN)
            return
        console.debug("WebSocket send", x)
        x = encode(x)
        TX.push({ t: +new Date(), n: x.byteLength })
        while (TX.length > 100) TX.shift()
        ws.send(x)
    }

    useImperativeHandle(ref, _ => ({ send }))

    return null
}

// Profiler

const RX = []
const TX = []

function getRate(x) {
    if (x.length <= 1)
        return 0
    const n = x.length
    const dt = x[x.length - 1].t - x[0].t
    return n / dt * 1000
}

function getBandwidth(x) {
    if (x.length <= 1)
        return 0
    const n = x.reduce((a, b) => a + b.n, 0)
    const dt = x[x.length - 1].t - x[0].t
    return n / dt * 1000
}

export function getTXRX() {
    return {
        tx_rate: getRate(TX), tx_bandwidth: getBandwidth(TX),
        rx_rate: getRate(RX), rx_bandwidth: getBandwidth(RX),
    }
}
