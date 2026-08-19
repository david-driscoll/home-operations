"""Prometheus exporter for pecron-monitor's MQTT telemetry.

pecron-monitor has no HTTP surface of any kind — its only egress is the Home
Assistant MQTT bridge, three JSON state files, and stdout. So this subscribes
to the bridge's state topic and re-publishes it as OpenMetrics.

Two properties of that topic drive the whole design:

1. ONE RETAINED JSON BLOB PER DEVICE, at `pecron/<device_key>/state`, qos=1,
   retain=True. Every entity in the HA catalog points its `state_topic` here
   and picks a field out with a value_template — there is no per-entity topic.
   The blob is the accumulated cache, republished in full on every packet, so
   a partial packet never removes keys.

2. NO AVAILABILITY TOPIC AND NO LWT. Upstream never calls `will_set()`, so
   nothing distinguishes "this device is dead" from "this is the retained copy
   of what it last said." That is the single most dangerous property here: on
   reconnect the broker replays a possibly hours-old payload instantly, and a
   naive exporter would graph a dead battery as healthy forever.

   The fix is `pecron_last_message_timestamp_seconds`, which is stamped ONLY
   from non-retained messages. A retained replay still populates the readings
   (better than a hole on restart) but cannot make a stale device look fresh.
   Until a live message arrives the series is simply absent — alert on
   `absent()` for gone, and on the timestamp going stale for wedged.

Device keys are labels we deliberately do NOT export: they are MAC addresses
that live in OpenBao precisely because this repo is public, and putting them
in Thanos would undo that. PECRON_DEVICE_MAP translates key -> friendly name
at the edge, so only "Primary"/"Backup"/"Spare" ever leave this process.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import paho.mqtt.client as mqtt

log = logging.getLogger("pecron-exporter")

# `remain_time`/`remain_charging_time` use sentinels rather than null: upstream
# treats <0 and >=65535 as "unknown" (helpers.py fmt_hm). The raw minutes are
# in the payload unfiltered, so the same guard has to be applied here or a
# 65535 renders as a 45-day runtime estimate.
_UNKNOWN_MINUTES = 65535

# JSON key -> (metric, type, help). Only keys actually present in a payload are
# emitted; the F3000LFP publishes ~50 of the catalog's keys and leaves all 20
# pack_* fields null, so anything model-specific simply never appears.
GAUGES: dict[str, tuple[str, str]] = {
    "soc_percent": ("pecron_battery_percent", "Battery state of charge."),
    "host_percent": ("pecron_host_battery_percent", "Host unit state of charge, excluding expansion packs."),
    "voltage": ("pecron_pack_voltage_volts", "Battery pack voltage."),
    "current": ("pecron_pack_current_amperes", "Battery pack current; negative is discharge."),
    "temperature": ("pecron_temperature_celsius", "Battery pack temperature."),
    "total_input_power": ("pecron_input_power_watts", "Total input power, all sources."),
    "total_output_power": ("pecron_output_power_watts", "Total output power, all loads."),
    "ac_input_power": ("pecron_ac_input_power_watts", "AC (mains) input power."),
    "dc_input_power": ("pecron_dc_input_power_watts", "DC/solar input power."),
    "ac_output_power": ("pecron_ac_output_power_watts", "AC inverter output power."),
    "dc_output_power": ("pecron_dc_output_power_watts", "DC output power."),
    "ac_output_voltage": ("pecron_ac_output_voltage_volts", "AC output voltage."),
    "ac_output_hz": ("pecron_ac_output_hertz", "AC output frequency."),
    "ac_output_pf": ("pecron_ac_output_power_factor", "AC output power factor."),
}

# Reported in minutes, exported in seconds: Prometheus convention is base units,
# and `promtool check metrics` fails a *_minutes name outright.
MINUTE_GAUGES: dict[str, tuple[str, str]] = {
    "remain_minutes": ("pecron_runtime_remaining_seconds", "Estimated runtime remaining on battery."),
    "remain_charging_minutes": ("pecron_charge_remaining_seconds", "Estimated time to full charge."),
}

# kWh counters. `total_energy` is device-reported PV; the other three are
# derived by upstream's trapezoidal integrator and persisted to disk, so they
# reset to zero if that state file is lost. That is a true counter reset —
# rate() absorbs it, increase() across the boundary under-reports.
COUNTERS: dict[str, tuple[str, str]] = {
    "total_energy": ("pecron_pv_energy_kwh_total", "Cumulative PV generation."),
    "ac_input_energy": ("pecron_ac_input_energy_kwh_total", "Cumulative AC input (charge) energy."),
    "ac_output_energy": ("pecron_ac_output_energy_kwh_total", "Cumulative AC output energy."),
    "dc_output_energy": ("pecron_dc_output_energy_kwh_total", "Cumulative DC output energy."),
}

# Published as the strings "ON"/"OFF" rather than booleans.
SWITCHES: dict[str, str] = {
    "ac_switch": "ac",
    "dc_switch": "dc",
    "ups_mode": "ups",
}

# Every device_status_hm value upstream can emit. Enumerated rather than
# derived from the payload so the series set is stable: a status that has not
# occurred yet reads 0 instead of vanishing, which is what makes
# `pecron_device_status == 1` safe to alert on.
DEVICE_STATUSES = ("Shut Down", "Charging", "DC Discharge", "AC Discharge", "Standby", "Conservation")


def _to_float(value: object) -> float | None:
    """Coerce a payload value, rejecting the non-numeric ones.

    Several fields are strings that look numeric (`ac_charging_power_ios: "4"`)
    and several are explicit nulls (every pack_* slot on a unit with no
    expansion packs). bool is excluded deliberately — it is an int subclass,
    and the ON/OFF fields are handled as switches instead.
    """
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    return None


def _escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


class Registry:
    """Latest reading per device, plus the freshness bookkeeping."""

    def __init__(self, device_names: dict[str, str]) -> None:
        self._lock = threading.Lock()
        self._names = device_names
        self._payloads: dict[str, dict] = {}
        self._last_fresh: dict[str, float] = {}
        self._messages: dict[str, int] = {}
        self.mqtt_connected = False
        self.started_at = time.time()

    def device_name(self, device_key: str) -> str:
        # An unmapped key means someone added a battery without updating
        # PECRON_DEVICE_MAP. Fall back to a stable placeholder rather than
        # leaking the raw key (a MAC) into the metric labels.
        return self._names.get(device_key, "unknown")

    def update(self, device_key: str, payload: dict, retained: bool) -> None:
        with self._lock:
            self._payloads[device_key] = payload
            self._messages[device_key] = self._messages.get(device_key, 0) + 1
            # See the module docstring: a retained replay carries readings but
            # must never be treated as evidence the device is alive.
            if not retained:
                self._last_fresh[device_key] = time.time()

    def snapshot(self) -> tuple[dict[str, dict], dict[str, float], dict[str, int]]:
        with self._lock:
            return dict(self._payloads), dict(self._last_fresh), dict(self._messages)


def render(registry: Registry) -> str:
    payloads, last_fresh, messages = registry.snapshot()
    out: list[str] = []
    emitted: set[str] = set()

    def emit(metric: str, help_text: str, kind: str, samples: list[tuple[str, float]]) -> None:
        if not samples:
            return
        if metric not in emitted:
            out.append(f"# HELP {metric} {help_text}")
            out.append(f"# TYPE {metric} {kind}")
            emitted.add(metric)
        out.extend(f"{metric}{labels} {value}" for labels, value in samples)

    def device_label(device_key: str, extra: str = "") -> str:
        name = _escape(registry.device_name(device_key))
        return f'{{device="{name}"{extra}}}'

    for key, (metric, help_text) in {**GAUGES, **MINUTE_GAUGES}.items():
        samples = []
        for device_key, payload in payloads.items():
            value = _to_float(payload.get(key))
            if value is None:
                continue
            if key in MINUTE_GAUGES:
                if value < 0 or value >= _UNKNOWN_MINUTES:
                    continue
                value *= 60
            samples.append((device_label(device_key), value))
        emit(metric, help_text, "gauge", samples)

    for key, (metric, help_text) in COUNTERS.items():
        samples = []
        for device_key, payload in payloads.items():
            value = _to_float(payload.get(key))
            if value is not None:
                samples.append((device_label(device_key), value))
        emit(metric, help_text, "counter", samples)

    switch_samples = []
    for device_key, payload in payloads.items():
        for key, switch in SWITCHES.items():
            raw = payload.get(key)
            if not isinstance(raw, str):
                continue
            switch_samples.append((device_label(device_key, f',switch="{switch}"'), 1.0 if raw.upper() == "ON" else 0.0))
    emit("pecron_switch_on", "Output switch state; 1 is on.", "gauge", switch_samples)

    status_samples = []
    for device_key, payload in payloads.items():
        current = payload.get("device_status_hm")
        if not isinstance(current, str):
            continue
        for status in DEVICE_STATUSES:
            status_samples.append((device_label(device_key, f',status="{_escape(status)}"'), 1.0 if current == status else 0.0))
    emit("pecron_device_status", "Reported device status; 1 for the active one.", "gauge", status_samples)

    # FAULT_ALARM_ENUM is absent from the F3000LFP payload entirely, so this
    # stays silent on this fleet rather than reporting a fabricated "Normal".
    fault_samples = []
    for device_key, payload in payloads.items():
        fault = payload.get("FAULT_ALARM_ENUM")
        if isinstance(fault, str):
            fault_samples.append((device_label(device_key, f',fault="{_escape(fault)}"'), 0.0 if fault == "Normal" else 1.0))
    emit("pecron_fault_active", "1 when the device reports a fault other than Normal.", "gauge", fault_samples)

    emit(
        "pecron_last_message_timestamp_seconds",
        "Unix time of the last LIVE (non-retained) message; absent until one arrives.",
        "gauge",
        [(device_label(dk), ts) for dk, ts in last_fresh.items()],
    )
    emit(
        "pecron_messages_received_total",
        "MQTT state messages received, retained replays included.",
        "counter",
        [(device_label(dk), float(n)) for dk, n in messages.items()],
    )
    emit("pecron_exporter_mqtt_connected", "1 while the exporter's MQTT session is up.", "gauge", [("", 1.0 if registry.mqtt_connected else 0.0)])
    emit("pecron_exporter_start_timestamp_seconds", "Unix time the exporter started.", "gauge", [("", registry.started_at)])

    return "\n".join(out) + "\n"


class Handler(BaseHTTPRequestHandler):
    registry: Registry

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        if self.path.split("?")[0] not in ("/metrics", "/"):
            self.send_error(404)
            return
        body = render(self.registry).encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args: object) -> None:
        """Silence per-request logging; a 60s scrape would otherwise fill the log."""


def parse_device_map(raw: str) -> dict[str, str]:
    """Parse `KEY=Name,KEY=Name`.

    Written this way so each key can be an individual ref+openbao reference in
    compose.yaml — vals resolves references anywhere in the rendered document,
    so the map arrives here already translated and no device key is ever
    committed to the repo.
    """
    mapping: dict[str, str] = {}
    for entry in raw.split(","):
        entry = entry.strip()
        if not entry:
            continue
        key, _, name = entry.partition("=")
        key, name = key.strip(), name.strip()
        if key and name:
            mapping[key] = name
        else:
            log.warning("Ignoring malformed PECRON_DEVICE_MAP entry: %r", entry)
    return mapping


def main() -> None:
    logging.basicConfig(level=os.environ.get("PECRON_LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(message)s")

    host = os.environ.get("PECRON_MQTT_HOST", "localhost")
    port = int(os.environ.get("PECRON_MQTT_PORT", "1883"))
    topic = os.environ.get("PECRON_MQTT_TOPIC", "pecron/+/state")
    listen_port = int(os.environ.get("PECRON_LISTEN_PORT", "9836"))
    device_map = parse_device_map(os.environ.get("PECRON_DEVICE_MAP", ""))

    if not device_map:
        log.warning("PECRON_DEVICE_MAP is empty — every device will be labelled 'unknown'.")
    registry = Registry(device_map)

    def on_connect(client: mqtt.Client, _u: object, _f: object, reason: object, _p: object = None) -> None:
        registry.mqtt_connected = True
        client.subscribe(topic, qos=1)
        log.info("MQTT connected (%s), subscribed to %s", reason, topic)

    def on_disconnect(_c: object, _u: object, *_a: object) -> None:
        registry.mqtt_connected = False
        log.warning("MQTT disconnected; paho will retry")

    def on_message(_c: object, _u: object, msg: mqtt.MQTTMessage) -> None:
        parts = msg.topic.split("/")
        if len(parts) < 2:
            return
        try:
            payload = json.loads(msg.payload)
        except (ValueError, TypeError):
            log.warning("Undecodable payload on %s", msg.topic)
            return
        if isinstance(payload, dict):
            registry.update(parts[1], payload, bool(msg.retain))

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    user = os.environ.get("PECRON_MQTT_USER") or ""
    if user:
        client.username_pw_set(user, os.environ.get("PECRON_MQTT_PASSWORD") or "")
    client.on_connect = on_connect
    client.on_disconnect = on_disconnect
    client.on_message = on_message
    client.connect_async(host, port, keepalive=60)
    client.loop_start()

    Handler.registry = registry
    server = ThreadingHTTPServer(("0.0.0.0", listen_port), Handler)
    log.info("Serving metrics on :%d/metrics", listen_port)
    server.serve_forever()


if __name__ == "__main__":
    main()
