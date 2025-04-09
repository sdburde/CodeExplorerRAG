"use strict"

import React, { useState, useEffect, useRef } from "react"
import "@material/mwc-button"

import { Dialog } from "../mwc/dialog"
import { Snackbar } from "../mwc/snackbar"
import { toSizeString } from "../util"
import { Button } from "./playback-control"

export function download(url, path) {
    const a = document.createElement("a")
    a.href = url
    a.download = path || url.split("/").slice(-1)[0]
    a.click()
}

const cellular_warning = <div style={{
    // fontWeight: "bold", color: "#c00"
}}>{"Cellular charges may apply"}</div>

export function CropVideoControl({ disabled, playbackInfo, apiUrlRef }) {
    const [snackbar, setSnackbar] = useState({ open: false, message: "" })
    const [dialog, setDialog] = useState({ open: false, title: "", body: "", callback: null })
    const [videoStart, setVideoStart] = useState()
    return <>
        <Button disabled={disabled} icon="start"
            onClick={_ => {
                const position = playbackInfo.current.position
                setVideoStart(position)
                setSnackbar({ open: true, message: `Crop start position is set` })
            }}></Button>
        <Button disabled={disabled || !videoStart} icon="content_cut"
            onClick={_ => {
                const video_end = playbackInfo.current.position
                const video_size = playbackInfo.current.size
                const video_duration = playbackInfo.current.duration
                const size = video_size * (video_end - videoStart) / video_duration
                setDialog({
                    open: true,
                    title: `Download ${toSizeString(size)}B cropped video?`,
                    body: cellular_warning,
                    callback: async _ => {
                        const api_url = apiUrlRef.current
                        const path = playbackInfo.current.path
                        const start = videoStart
                        const duration = video_end - videoStart
                        const response = await fetch(api_url, {
                            method: "POST",
                            body: JSON.stringify({ path, start, duration })
                        })
                        setSnackbar({ open: true, message: "Downloading file" })
                        const filename = response.headers.get("Content-Disposition").split('filename="')[1].split('"')[0]
                        const download_url = URL.createObjectURL(await response.blob())
                        download(download_url, filename)
                        URL.revokeObjectURL(download_url)
                    },
                })
            }}>
        </Button>
        <Snackbar
            label={snackbar.message}
            open={snackbar.open}
            setOpen={open => setSnackbar(x => ({ ...x, open }))}
        ></Snackbar>
        <Dialog
            heading={dialog.title}
            open={dialog.open}
            setOpen={open => setDialog(x => ({ ...x, open }))}
            onClick={_ => dialog.callback?.()}
        >{dialog.body}</Dialog>
    </>

}

export function FileControl({ disabled, playbackInfo, apiUrlRef, canDelete, onDelete }) {
    const [snackbar, setSnackbar] = useState({ open: false, message: "" })
    const [dialog, setDialog] = useState({ open: false, title: "", body: "", callback: null })

    function showSnackbar(message) {
        setSnackbar({ open: true, message })
    }

    function showDialog({ title, body, callback }) {
        setDialog({
            open: true,
            title: title || "",
            body: body || "",
            callback,
        })
    }

    return <>
        <Button disabled={disabled || !canDelete} icon="delete"
            onClick={_ => showDialog({
                title: "Delete video?",
                body: `This will free up ${toSizeString(playbackInfo.current.size)}B`,
                callback: async _ => {
                    const path = playbackInfo.current.path
                    const response = await fetch(apiUrlRef.current, {
                        method: "DELETE",
                        body: path,
                    })
                    if (response.status == 200) {
                        showSnackbar("Delete successful")
                        onDelete?.(path)
                    }
                    else
                        showSnackbar("Delete failed")
                }
            })}></Button>

        <Button disabled={disabled} icon="download"
            onClick={_ => showDialog({
                title: `Download ${toSizeString(playbackInfo.current.size)}B full video?`,
                body: cellular_warning,
                callback: _ => {
                    const base_url = apiUrlRef.current.split("/api")[0]
                    const path = playbackInfo.current.path
                    const download_url = `${base_url}/${path}`
                    download(download_url)
                },
            })}></Button>

        <Dialog
            heading={dialog.title}
            open={dialog.open}
            setOpen={open => setDialog(x => ({ ...x, open }))}
            onClick={_ => dialog.callback?.()}
        >{dialog.body}</Dialog>

        <Snackbar
            label={snackbar.message}
            open={snackbar.open}
            setOpen={open => setSnackbar(x => ({ ...x, open }))}
        ></Snackbar>
    </>
}