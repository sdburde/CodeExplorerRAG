"use strict"

function createSnackbar() {
    const snackbar = document.createElement("mwc-snackbar")
    const icon_button = document.createElement("mwc-icon-button")
    icon_button.setAttribute("icon", "close")
    icon_button.setAttribute("slot", "dismiss")
    snackbar.appendChild(icon_button)
    return snackbar
}

export function showSnackbar(text) {

    if (!document.querySelector("mwc-snackbar")) {
        console.log("Created snackbar")
        document.querySelector("body").appendChild(createSnackbar())
    }

    const snackbar = document.querySelector("mwc-snackbar")
    snackbar.labelText = text
    snackbar.show()
}

function hide(element) {
    if (element.style.display != "none") {
        element._display = element.style.display // backup
        element.style.display = "none"
    }
}

function show(element) {
    element.style.display = element._display || ""
}

export function setupDrawer(drawer) {
    const drawer_button = drawer.querySelector("[slot=navigationIcon]")
    const container = drawer.parentNode
    container.addEventListener("MDCTopAppBar:nav", _ => drawer.open = !drawer.open)
    function layout() {
        const title_bar = document.querySelector("mwc-top-app-bar [slot=title]")
        if (window.innerWidth > 800 && window.innerWidth > window.innerHeight) {
            // large landscape
            drawer.removeAttribute("type")
            hide(drawer_button)
            hide(title_bar)
        }
        else {
            drawer.setAttribute("type", "modal")
            show(drawer_button)
            show(title_bar)
        }
    }
    // NOTE: For mobile with narrow width. Tap logo to close drawer
    drawer.shadowRoot.querySelector(".mdc-drawer__header")?.addEventListener("click", _ => drawer.open = false)
    window.addEventListener("resize", _ => layout())
    layout()
}

export function setupSliders(sliders) {

    sliders.forEach(slider => {
        // stackoverflow.com/q/47625017
        const style = document.createElement("style")
        style.innerHTML = `
            .mdc-slider__tick-mark--active { background-color: transparent !important }
            .mdc-slider__tick-mark--inactive { background-color: transparent !important }
        `
        slider.shadowRoot.appendChild(style)
    })
    window.addEventListener("resize", _ => sliders.forEach(slider => slider.layout()))
    window.addEventListener("load", _ => sliders.forEach(slider => slider.layout()))
}

export function showDialog(heading, content, callback) {

    if (!document.querySelector("mwc-dialog")) {
        console.log("Created dialog")
        const dialog = document.createElement("mwc-dialog")
        dialog.innerHTML = `
            <div name=content></div>
            <mwc-button slot=secondaryAction dialogAction=cancel>Cancel</mwc-button>
            <mwc-button slot=primaryAction dialogAction=confirm unelevated>Confirm</mwc-button>
        `
        dialog.addEventListener("closing", e => {
            if (e.detail.action == "confirm")
                dialog.callback()
        })
        document.querySelector("body").appendChild(dialog)
    }
    const dialog = document.querySelector("mwc-dialog")
    dialog.setAttribute("heading", heading)
    dialog.querySelector("[name=content]").innerHTML = content
    dialog.callback = callback
    dialog.show()
}

export function fixTextFieldPadding(text_field) {
    const root = text_field.shadowRoot
    const label = root.querySelector(".mdc-text-field")
    label.style.paddingLeft = "8px"
    label.style.paddingRight = "8px"
    // root.querySelector(".mdc-floating-label").style.left = "8px"
}