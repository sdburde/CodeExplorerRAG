"use strict"

export async function queryInflux(query, name_callback) {
    console.debug(query.split(/[\s\n]+/g).filter(x => x.length).join(" "))
    const token = "h-dFxidipRZgUxloJmNTPw3oR6ohVze1fxiaBTUHIbvygW1HBRB5mAGT8ZtwECvtqfdeczAQkemudfy3JyeWVg=="
    const params = new URLSearchParams({ db: "cag_otter", q: query })
    const response = await fetch(
        `https://ai.v3nity.com/influx/query?${params}`, {
        method: "GET",
        headers: { "Authorization": `Token ${token}` },
    })
    if (response.status != 200)
        console.warn(await response.text())
    let results = (await response.json()).results.map(result => {
        return (result.series || []).map(s => {
            return s.values.map(row => {
                let columns = s.columns
                if (name_callback)
                    columns = columns.map(x => name_callback(x))
                row = Object.fromEntries(row.map((value, i) => [columns[i], value]))
                return { ...row, ...s.tags }
            })
        })
    })
    if (results.length == 1 && Array.isArray(results[0]))
        results = results[0]
    return results
}
