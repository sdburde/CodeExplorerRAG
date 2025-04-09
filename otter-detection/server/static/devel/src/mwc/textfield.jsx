"use strict"

import "@material/mwc-textfield"

import React, { useRef, useState, useEffect } from "react"

export function TextField({ ...props }) {
    return <mwc-textfield {...props}></mwc-textfield>
}