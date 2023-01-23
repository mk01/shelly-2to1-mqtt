# shelly-2to1-mqtt
Extension to Shelly Gen2 devices to enable Gen1 compatible (Shelly)MQTT reporting and control.
Currently this is supported:
- power/energy sensor
- total sensor (if enabled - reports total energy as additional sensor)
- switch status and control
- inputs
    - as a switch
    - as a button (single- and long-press supported at the moment)

Script is developed and tested on Shelly Pro 4PM devices, but should work on any Gen2 device providing similar sensors/switches.

# install
Simply add script via Gen2 device's web UI, enable it (to auto start on device reboot) and start. You need to enable MQTT (server/user/pass). Topic is autogenerated as 'shellies/[shelly-device-id]', RPC and Generic status reports do not need to be enabled.

- if used with ShellyMQTT, power/energy "reading" needs to be enabled under hardware configuration page for ShellyMQTT 

