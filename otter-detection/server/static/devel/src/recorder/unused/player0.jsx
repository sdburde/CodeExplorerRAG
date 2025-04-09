"use strict"

import React, { useState, useEffect, useRef } from "react"

import { WebSocket2 } from "./websocket"
import { VideoDecoder2 } from "./decoder"
import { drawDetections, drawText, setDimension } from "./canvas"
import { Slider } from "../mwc/slider"
import { Thumbnail } from "./thumbnail"
import { VideoControl } from "./video-control"
import { CircularProgress } from "../circular-progress"

function getDeviceRoot(device_number) {
    const subdir = location.pathname.split("/")[1]
    return `${location.host}/${subdir}/${device_number}`
}

export function Player({ device_number, style }) {

    const fg_ref = useRef()
    const bg_ref = useRef()
    const ws_ref = useRef()
    const canvas_container_ref = useRef()

    const [selectedVideo, setSelectedVideo] = useState(null)
    const [videoList, setVideoList] = useState([])
    const [paused, setPaused] = useState(false)
    const [sliderValue, setSliderValue] = useState(0)
    const [sliderMax, setSliderMax] = useState(100)
    const [disabled, setDisabled] = useState(false)
    const [playing, setPlaying] = useState(false)
    const [videoLoading, setVideoLoading] = useState(true)

    const sliderManual = useRef(false)
    const videoSize = useRef()
    const videoDuration = useRef()
    const videoPosition = useRef()

    const device_root = getDeviceRoot(device_number)
    const ws_url = `wss://${device_root}/recorder/api/ws`

    let canvas_initialised = false
    let slider_initialised = false

    useEffect(_ => {
        if (selectedVideo == null)
            return
        setVideoLoading(true)
        const video_metadata = videoList[selectedVideo]
        videoSize.current = video_metadata.size


        const decoder = new VideoDecoder2({
            onFrame: async (frame, metadata) => {
                // console.log(frame, metadata)
                const fg_canvas = fg_ref.current
                const bg_canvas = bg_ref.current
                try {
                    if (!canvas_initialised) {
                        console.log(`Initialising canvases for device ${device_number}`)
                        setDimension(fg_canvas, frame)
                        setDimension(bg_canvas, frame)
                        bg_canvas.context = bg_canvas.getContext("bitmaprenderer")
                        fg_canvas.context = fg_canvas.getContext("2d")
                        canvas_initialised = true
                    }
                    // NOTE: Using bitmaprenderer context for 2x efficiency.
                    //       2d context uses 90% CPU on throttled i5-8250U,
                    //       bitmaprenderer context uses 50% only 
                    const image_bitmap = await createImageBitmap(frame)
                    bg_canvas.context.transferFromImageBitmap(image_bitmap)
                    if (Array.isArray(metadata))
                        drawDetections(fg_canvas.context, metadata)
                    if (metadata.pts >= 0) {
                        if (!sliderManual.current)
                            setSliderValue(metadata.pts)
                        videoDuration.current = metadata.duration - metadata.start
                        videoPosition.current = metadata.pts
                    }
                }
                catch (e) { console.warn(e) }
            },
            onError: error => console.warn(error)
        })

        const ws = new WebSocket2({
            url: ws_url,
            send_json: true,
            onOpen: _ => {
                ws.send({
                    path: video_metadata.path,
                    height: 720,
                    bitrate: 2048,
                    play: true,
                })
                slider_initialised = false
                setPlaying(true)
            },
            onMessage: message => {
                if (!slider_initialised) {
                    setVideoLoading(false)
                    // NOTE: message.start needs to be offset for live recording
                    //       (latest) video as duration is sum of other segments
                    setSliderMax(message.duration - message.start)
                    if (video_metadata.path.endsWith(".mkv"))
                        ws_ref.current.send({ seek: message.duration - 30 })
                    slider_initialised = true
                }
                if (message.pts && message.data) {
                    decoder.decode(message.pts, message.data)
                    decoder.push_metadata(message.pts, message)
                }
            },
        })
        ws_ref.current = ws

        return _ => {
            ws.close()
            decoder.close()
        }
    }, [selectedVideo])

    useEffect(_ => {
        (async _ => {
            // Reset
            setSelectedVideo(null)
            // Fetch
            const device_root = getDeviceRoot(device_number)
            const response = await fetch(`https://${device_root}/recorder/api/video`)
            const data = await response.json()
            const video_list = data.list.sort().reverse()
            video_list.forEach(x => {
                const jpg_path = x.path.replace(/\.m.*/, ".jpg")
                const date_string = x.path.replace(/\.m.*/, "").split("/")[1].split("_")[0]
                const date = new Date(
                    date_string.slice(0, 4),
                    date_string.slice(4, 6) - 1,
                    date_string.slice(6, 8),
                    date_string.slice(9, 11),
                    date_string.slice(11, 13),
                    date_string.slice(13, 15),
                )
                x.date = date
                x.image_url = `https://${device_root}/recorder/videos/${jpg_path}`
            })
            setVideoList(video_list)
            setSelectedVideo(0)
        })()
    }, [device_number])

    // useEffect(_ => {
    //     canvas_container_ref.current.addEventListener("wheel", e => {
    //         ws_ref.current?.send({ step: e.deltaY > 0 ? 10 : -10 })
    //     })
    // }, [])

    const canvas_style = { width: "100%", position: "absolute" }

    return <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        overflow: "hidden",
        ...style,
    }}>
        {/* Video list */}
        <div style={{
            display: "flex",
            gap: 0,
            width: "100%",
            overflowX: "auto",
            height: 96,
            // Border-box is needed else 1px border may disappear
            border: "1px solid #0003",
            boxSizing: "border-box",
        }}>
            {videoList.map((x, i) => <Thumbnail
                size={x.size}
                date={x.date}
                img_src={x.image_url}
                key={i}
                data={i}
                setSelected={setSelectedVideo}
                style={{
                    border: selectedVideo == i ? "4px solid #c0f" : "4px solid #0000",
                }}
            >
            </Thumbnail>
            )}
        </div>
        {/* Player with controls */}
        <div style={{
            width: "100%",
            // Enforce height constraint to children
            overflow: "hidden",
            flex: 1,
            maxWidth: 1280,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            // justifyContent: "center",
        }}>
            <div style={{
                aspectRatio: "16 / 9",
                overflow: "hidden",
                display: "flex",
                justifyContent: "center",
            }}>
                <div ref={canvas_container_ref} style={{
                    height: "100%",
                    aspectRatio: "16 / 9",
                    border: "1px solid #0004",
                    // NOTE: Need border-box if not 1px border may disappear
                    boxSizing: "border-box",
                    position: "relative",
                    background: "#888",
                }}>
                    <canvas ref={bg_ref} style={canvas_style}></canvas>
                    <canvas ref={fg_ref} style={canvas_style}></canvas>
                    {videoLoading && <CircularProgress
                        color="#ccc" background="#0008"
                        style={{ height: "100%", ...canvas_style }}>
                    </CircularProgress>}
                </div>
            </div>

            <Slider
                max={sliderMax}
                value={sliderValue}
                setValue={setSliderValue}
                onInput={value => ws_ref.current?.send({ seek: value })}
                onPointerEnter={_ => { sliderManual.current = true }}
                onPointerLeave={_ => { sliderManual.current = false }}
            ></Slider>
            <VideoControl
                playing={playing}
                setPlaying={setPlaying}
                videoSize={videoSize}
                videoPosition={videoPosition}
                videoDuration={videoDuration}
                onPlay={x => { ws_ref.current?.send({ play: true }) }}
                onPause={x => { ws_ref.current?.send({ pause: true }) }}
                onSeek={x => { ws_ref.current?.send({ seek: x }) }}
                onDownload={x => { console.log("DOWNLOAD") }}
                onDelete={x => { console.log("DELETE") }}
                onCrop={(start, end) => { console.log("CROP", start, end) }}
            ></VideoControl>
        </div>

    </div >
}