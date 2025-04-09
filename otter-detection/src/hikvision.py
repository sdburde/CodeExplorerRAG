#!/usr/bin/env python3

from datetime import datetime
from time import sleep
import re

import requests
from requests.auth import HTTPDigestAuth

api_root = f"http://192.168.1.64/ISAPI"

session = requests.session()
session.auth = HTTPDigestAuth("admin", "asdf1234")


def sync_time():
    # NOTE: Time sync needs at least 2~3 seconds
    put("System/time", {"Time": {
        "timeMode": "manual",
        "timeZone": "CST-8:00:00",
        "localTime": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
    }}, timeout=10)


def time_sync_loop():
    from datetime import timedelta
    # Always give a bit of time for host NTP sync after reboot
    sleep(100)
    while True:
        # NOTE: Sometimes time sync fails even with timeout 10s
        for _ in range(10):
            try:
                sync_time()
                print("Time sync success")
                break
            except Exception as e:
                print(f"Time sync failed {type(e).__name__}: {e}")
                sleep(3)
        now = datetime.now()
        tomorrow = now.date() + timedelta(days=1)
        next_midnight = datetime.combine(tomorrow, datetime.min.time())
        seconds_until_next_midnight = (next_midnight - now).total_seconds()
        print(f"Sleep for {seconds_until_next_midnight} seconds")
        sleep(seconds_until_next_midnight)


def start_time_sync_loop():
    from threading import Thread
    thread = Thread(target=time_sync_loop, daemon=True)
    thread.start()
    return thread


def to_xml(x):
    if isinstance(x, dict):
        return "".join(f"<{k}>{to_xml(v)}</{k}>"for k, v in x.items())
    else:
        return str(x)


def put(url, data, timeout=0.5):
    data = to_xml(data)
    print(f"PUT {url} {data}")
    r = session.put(f"{api_root}/{url}", data, timeout=timeout)
    assert r.status_code in [200], (r.status_code, r.text)


def ptz(pan=0, tilt=0, zoom=0):
    put("PTZCtrl/channels/1/continuous",
        {"PTZData": {"pan": pan, "tilt": tilt, "zoom": zoom}})


def get_system_time():
    r = session.get(f"{api_root}/System/time")
    assert r.status_code in [200], (r.status_code, r.text)
    local_time = re.search(r"<localTime>([^<]+)", r.text)[1]
    local_time = local_time.split("+")[0]  # Remove tz awareness
    return datetime.fromisoformat(local_time)


def get_serial_number():
    r = session.get(f"{api_root}/System/deviceInfo")
    assert r.status_code in [200]
    return r.text.split("<serialNumber>")[-1].split("<")[0]


if __name__ == "__main__":
    print(get_serial_number())
