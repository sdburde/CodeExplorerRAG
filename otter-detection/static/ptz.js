"use strict"

const ptz_buttons = document.querySelectorAll("[data-pan],[data-tilt],[data-zoom]")
ptz_buttons.forEach(x => x.addEventListener("contextmenu", e => e.preventDefault()))

function lock_ptz() {
    PTZ_LOCK_BUTTON.querySelector(".material-icons").innerHTML = "lock"
    ptz_buttons.forEach(x => x.disabled = true)
}

function unlock_ptz() {
    PTZ_LOCK_BUTTON.querySelector(".material-icons").innerHTML = "lock_open"
    ptz_buttons.forEach(x => x.disabled = false)
}

let ptz_locked
PTZ_LOCK_BUTTON.addEventListener("click", _ => {
    ptz_locked ? lock_ptz() : unlock_ptz()
    ptz_locked = !ptz_locked
})

export function setupPTZ(ptz_callback) {
    ptz_buttons.forEach(button => {
        let down
        const pan = +button.getAttribute("data-pan") || 0
        const tilt = +button.getAttribute("data-tilt") || 0
        const zoom = +button.getAttribute("data-zoom") || 0
        button.addEventListener("pointerdown", _ => {
            ptz_callback({ pan, tilt, zoom })
            down = true
        })
        Array.from(["pointerup", "pointerleave"]).forEach(event_name => {
            button.addEventListener(event_name, _ => {
                if (down)
                    ptz_callback({ pan: 0, tilt: 0, zoom: 0 })
                down = false
            })
        })
    })
}
