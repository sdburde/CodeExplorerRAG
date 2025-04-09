"use strict"

import React, { useState, useEffect, useRef } from "react"
import "@material/mwc-button"

import { Dialog } from "../mwc/dialog"
import { Snackbar } from "../mwc/snackbar"
import { TextField } from "../mwc/textfield"
import { Button } from "./camera-ptz-buttons"

export function CameraRenameButton({ disabled, device_number }) {

    const [openRenameDialog, setOpenRenameDialog] = useState(false)
    const renameTextfieldRef = useRef()
    const [renameTextfieldValue, setRenameTextfieldValue] = useState("")

    const [openSnackbar, setOpenSnackbar] = useState(false)
    const [snackbarMessage, setSnackbarMessage] = useState()

    const subdir = location.pathname.split("/")[1]
    const name_url = `${location.origin}/${subdir}/${device_number}/api/name`

    function showSnackbar(message) {
        setSnackbarMessage(message)
        setOpenSnackbar(true)
    }

    return <>
        <Button icon="edit" disabled={disabled} onClick={async e => {
            const response = await fetch(name_url)
            if (response.status == 200) {
                const name = await response.text()
                setOpenRenameDialog(true)
                // NOTE: Need to wait to pre-fill for label to show properly
                setTimeout(_ => setRenameTextfieldValue(name), 100)
            }
            else
                showSnackbar(`Unable to rename device`)

        }}></Button>

        <Dialog
            heading={`Rename device`}
            open={openRenameDialog}
            setOpen={setOpenRenameDialog}
            onClick={async _ => {
                const textfield = renameTextfieldRef.current
                const value = textfield.value
                if (value.length) {
                    if (textfield.reportValidity()) {
                        const response = await fetch(name_url, { method: "PUT", body: value })
                        if (response.status == 200) {
                            showSnackbar(`Device is renamed. Reloading page...`)
                            setTimeout(_ => location.reload(), 3000)
                            return true
                        }
                        else {
                            showSnackbar(`Failed to rename device`)
                            return false
                        }
                    }
                    else {
                        showSnackbar("Only letter, number, space, hyphen and underscore are allowed.")
                        return false
                    }
                }
                else {
                    showSnackbar("Please specify a name.")
                    return false
                }
            }}
        >
            <TextField
                ref={renameTextfieldRef}
                value={renameTextfieldValue}
                maxLength={32}
                pattern={"^[a-zA-Z0-9 _\\-]{1,32}$"}
                label="Device name"
                outlined
                style={{ paddingTop: "8px" }}
            >
            </TextField>
        </Dialog>

        <Snackbar
            label={snackbarMessage}
            open={openSnackbar}
            setOpen={setOpenSnackbar}
        ></Snackbar>
    </>
}