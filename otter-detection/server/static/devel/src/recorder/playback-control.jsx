"use strict"

import React, { useState, useEffect, useRef } from "react"
import "@material/mwc-button"

import { Slider } from "../mwc/slider"

export function Button({ icon, disabled, ...props }) {
    return <mwc-button outlined
        {...disabled && { disabled: true }}
        {...props} // NOTE: onClick can be overriden
    ><a className="material-icons">{icon}</a></mwc-button>
}

function SeekButton({ disabled, icon, playbackInfo, seekCallback, step, interval, ...props }) {
    const ref = useRef()
    useEffect(_ => {
        const button = ref.current
        let tracked = null
        let timer
        button.addEventListener("pointerdown", _ => {
            clearInterval(timer)
            timer = setInterval(_ => {
                tracked += step
                if (!isNaN(tracked))
                    seekCallback(tracked)
            }, interval)
            // NOTE: Initial step is needed for quick clicking
            tracked = playbackInfo.current.position + step
        })
        button.addEventListener("pointerup", _ => {
            clearInterval(timer)
            if (!isNaN(tracked))
                seekCallback(tracked)
        })
        button.addEventListener("pointerleave", _ => clearInterval(timer))
    }, [])
    return <Button disabled={disabled} ref={ref} icon={icon} {...props}></Button >
}

export function PlaybackSlider({ disabled, duration, position, seekCallback }) {
    return <Slider
        {...disabled && { disabled: true }}
        max={duration}
        value={position}
        setValue={seekCallback}
        onInput={value => ws_ref.current?.send({ seek: value })}
    ></Slider>
}

export function PlaybackControl({
    disabled, playing, playbackInfo, setPlaying, seekCallback,
}) {
    const seek_step = 10
    const seek_interval = 1000 / (60 / seek_step)

    return <>
        <SeekButton
            disabled={disabled || playing}
            icon="fast_rewind" step={-seek_step} interval={seek_interval}
            playbackInfo={playbackInfo} seekCallback={seekCallback}
        >
        </SeekButton>

        <Button disabled={disabled} icon={playing ? "pause" : "play_arrow"}
            onClick={_ => setPlaying(!playing)}></Button>

        <SeekButton
            disabled={disabled || playing}
            icon="fast_forward" step={+seek_step} interval={seek_interval}
            playbackInfo={playbackInfo} seekCallback={seekCallback}
        >
        </SeekButton>
    </>
}