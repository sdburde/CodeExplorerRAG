from os.path import exists
from glob import glob
from time import sleep
from traceback import format_exc

from epevermodbus.driver import EpeverChargeController

OUTPUT_PINS = {
    1: dict(bga="PI.00", id=399),
    2: dict(bga="PI.01", id=400),
    3: dict(bga="PI.02", id=401),
    4: dict(bga="PH.07", id=398),
}


def get_epever_controller():
    for device_path in sorted(glob("/dev/ttyACM*")):
        controller = EpeverChargeController(device_path, 1)
        print(f"Found epever controller at {device_path}")
        return controller


def read(path):
    with open(path) as f:
        return f.read().strip()


def write(path, value, check=True):
    value = str(value)
    if check and read(path) == value:  # Skip implicitly if same value
        return
    print(f"{path} <- {value}")
    with open(path, "w") as f:
        f.write(value)


def write_digital_output(pin, value):
    value = int(value)
    assert value in [0, 1], value
    meta = OUTPUT_PINS[pin]
    gpio_root = "/sys/class/gpio"
    pin_root = f"{gpio_root}/{meta['bga']}"
    if not exists(pin_root):
        write(f"{gpio_root}/export", meta["id"], check=False)
    write(f"{pin_root}/direction", "out")
    write(f"{pin_root}/value", value)


def main():
    controller = get_epever_controller()
    if not controller:
        print("No Epever controller found. Default to PIN1 HIGH")
        write_digital_output(1, True)
        return
    while True:
        solar_power = controller.get_solar_power()
        soc = controller.get_battery_state_of_charge()
        print(f"Solar power is {solar_power}")
        print(f"Battery State of Charge is {soc}")
        write_digital_output(1, solar_power > 0)
        write_digital_output(2, solar_power <= 0)  # Inverse for others
        write_digital_output(3, soc > 50)
        write_digital_output(4, soc <= 50)
        print(f"Sleep until next iteration")
        sleep(1000)


if __name__ == "__main__":
    while True:
        try:
            main()
        except Exception as e:
             print(f"{type(e).__name__}: {e}")
        sleep(100)
