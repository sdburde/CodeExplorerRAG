"use strict"

import React, { useState, useEffect, useRef } from "react"

import { Thumbnail } from "./thumbnail"
import { PlaybackControl, PlaybackSlider } from "./playback-control"
import { FileControl, CropVideoControl } from "./file-control"
import { WebSocketVideoPlayer } from "./websocket-video-player"
import { getDeviceRoot, getDeviceName } from "../util"

export function RecorderPage({ device_number, style }) {

    const ws_ref = useRef()
    const apiUrlRef = useRef()
    const [webSocketURL, setWebSocketURL] = useState()
    const [deviceName, setDeviceName] = useState()

    const [selectedVideo, setSelectedVideo] = useState(0)
    const [videoList, setVideoList] = useState([])

    const [controlDisabled, setControlDisabled] = useState(true)
    const [playerKey, setPlayerKey] = useState()

    const [videoPath, setVideoPath] = useState(null)
    const [videoPlaying, setVideoPlaying] = useState(true)
    // NOTE: videoPosition and videoDuration States for re-rendering e.g. Slider
    //       playbackInfo Ref for others such as dynamic dialog message generation
    const [videoPosition, setVideoPosition] = useState(0)
    const [videoDuration, setVideoDuration] = useState(1)
    const playbackInfo = useRef({})

    useEffect(_ => {
        ws_ref.current?.send(videoPlaying ? { play: true } : { pause: true })
    }, [videoPlaying])

    useEffect(_ => {
        if (selectedVideo == null || !videoList.length)
            return
        setControlDisabled(true)
        const v = videoList[selectedVideo]
        playbackInfo.current.size = v?.size
        playbackInfo.current.path = v?.path
        setVideoPath(v?.path)
    }, [selectedVideo, videoList])

    // If video is mkv, seek to near-live
    useEffect(_ => {
        if (videoDuration && videoPath?.endsWith(".mkv"))
            ws_ref.current.send({ seek: videoDuration - 60 })
        if (videoPlaying)
            ws_ref.current?.send({ play: true })
    }, [videoPath, videoDuration])

    useEffect(_ => {

        (async _ => {
            setControlDisabled(true)
            const device_root = getDeviceRoot(device_number)
            const url = `wss://${device_root}/recorder/api/ws`
            const name = await getDeviceName(device_number)
            setDeviceName(name)
            setWebSocketURL(url)
            loadVideoList()
            // Always start from 0 if device number is changed
            setSelectedVideo(0)
            setPlayerKey(+new Date())
        })()
    }, [device_number])

    async function loadVideoList() {
        // Reset
        setVideoList([])
        // Fetch
        const device_root = getDeviceRoot(device_number)
        const api_url = `https://${device_root}/recorder/api/video`
        apiUrlRef.current = api_url
        const response = await fetch(api_url)
        const data = await response.json()
        const video_list = data.list.sort().reverse()
        video_list.forEach(x => {
            const jpg_path = x.path.replace(/\.m.*/, ".jpg")
            const date_string = x.path.replace(/\.m.*/, "").split("_")[0]
            const date = new Date(
                date_string.slice(0, 4),
                date_string.slice(4, 6) - 1,
                date_string.slice(6, 8),
                date_string.slice(9, 11),
                date_string.slice(11, 13),
                date_string.slice(13, 15),
            )
            x.date = date
            x.image_url = `https://${device_root}/recorder/${jpg_path}`
        })
        setVideoList(video_list)
    }

    return <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        overflow: "hidden",
        ...style,
    }}>
        {device_number == 0 ? <div style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            fontFamily: "Roboto, Arial, sans-serf",
            opacity: 0.5,
        }}>
            Please select a device to browse videos
        </div> : <>
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
                    isLive={x.path.endsWith(".mkv")}
                    img_src={x.image_url}
                    key={i}
                    style={{
                        border: selectedVideo == i ? "4px solid #c08" : "4px solid #0000",
                        borderRadius: selectedVideo == i ? "2px" : "",
                    }}
                    onClick={_ => setSelectedVideo(i)}
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
            }}>

                <div style={{
                    aspectRatio: "16 / 9",
                    overflow: "hidden",
                    display: "flex",
                    justifyContent: "center",
                }}>
                    <WebSocketVideoPlayer
                        key={playerKey}
                        ws_ref={ws_ref}
                        url={webSocketURL}
                        videoPath={videoPath}
                        onFrame={(frame, metadata) => {
                            if (metadata?.pts) {
                                const pts = metadata.pts
                                setVideoPosition(pts)
                                playbackInfo.current.position = pts
                            }
                        }}
                        onFirstFrame={(frame, metadata) => {
                            // NOTE: message.start needs to be offset for live recording
                            //       (latest) video as duration is sum of other segments
                            const duration = metadata?.duration - metadata?.start
                            playbackInfo.current.duration = duration
                            setVideoDuration(duration)
                            setControlDisabled(false)
                        }}
                        extraText={deviceName}
                    ></WebSocketVideoPlayer>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <PlaybackSlider
                        disabled={controlDisabled || videoPlaying}
                        duration={videoDuration}
                        position={videoPosition}
                        seekCallback={x => ws_ref.current?.send({ seek: x })}
                    ></PlaybackSlider>
                    <div style={{ display: "flex", gap: "8px", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", gap: 8 }}>
                            <FileControl
                                disabled={controlDisabled}
                                playbackInfo={playbackInfo}
                                apiUrlRef={apiUrlRef}
                                canDelete={videoPath?.endsWith(".mp4")}
                                onDelete={loadVideoList}
                            ></FileControl>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                            <PlaybackControl
                                disabled={controlDisabled}
                                playing={videoPlaying}
                                duration={videoDuration}
                                position={videoPosition}
                                playbackInfo={playbackInfo}
                                setPlaying={setVideoPlaying}
                                seekCallback={x => ws_ref.current?.send({ seek: x })}
                            ></PlaybackControl>
                        </div>

                        <div style={{ display: "flex", gap: 8 }}>
                            <CropVideoControl
                                disabled={controlDisabled}
                                playbackInfo={playbackInfo}
                                apiUrlRef={apiUrlRef}
                            ></CropVideoControl>
                        </div>

                    </div>
                </div>
            </div>
        </>}
    </div>
}