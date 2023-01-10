// Copyright 2021 Allterco Robotics EOOD
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Shelly is a Trademark of Allterco Robotics
//

//
// author :::matus.kral1 at sk.ibm.com:::
//
// (script tested and is being used on bunch of Pro 4PM boxes, but
// should work with no changes on all GEN2 devices with PowerMetering
// function. Domoticz with Shelly-MQTT is used on the subscriber side)
//
// based purely on default code samples found in the
// scripts -> library (thanks Shelly!)
//

let f_zero = 0.0000001;

let CONFIG = {
  debug: false,
  // create and report total in addition
  // to combo power/energy sensor
  report_total: false,
  consolidate: {
    // report aggregated power and energy
    // for whole device in addition to
    // per switch reports
    report_device: false,
  },
  // report state and allow control
  // of switches
  switch_handling: true,
};

let STATE = {
  shelly_id: null,
  device_info: null,
  mqtt_enabled: false,
  switches: [],
};

function buildMQTTPublishTopic(component, component_id, object_id) {
  return (
    "shellies" + 
    "/" +
    STATE.shelly_id +
    "/" +
    component +
    (component_id !== null ? "/" + numberToStr(component_id) : "") +
    (typeof object_id !== "undefined" && object_id !== null ? "/" + object_id : "")
  );
}

function numberToStr(f, withDecimal) {
  if (typeof f === "number") {
    if (!withDecimal) f = Math.round(f);
    return JSON.stringify(f);
  }
  return f;
}

function publishData(component, component_id, value, value_type, topic) {
  if (!topic) {
    topic = buildMQTTPublishTopic(component, chr(48 + component_id), value_type);
  }

  if (CONFIG.debug) {
    console.log("2to1:", "mqtt publish to", topic, " value ", value);
  }

  MQTT.publish(
    topic,
    value
  );
}

function reportDevice(value_type) {

  if (value_type === "power") {

    let p_total = f_zero;
    for (let i = 0; i < STATE.switches.length; i++) {
      p_total = p_total + STATE.switches[i].power;
      publishData("relay", i, numberToStr(f_zero + STATE.switches[i].power, true), value_type);
    }

    if (CONFIG.consolidate.report_device) {
      publishData(null,
        null, numberToStr(p_total, true), null,
        buildMQTTPublishTopic("relay", null, value_type)
      );
    }

  } else if (value_type === "energy") {

    let e_total = 0;
    for (let i = 0; i < STATE.switches.length; i++) {
      e_total = e_total + STATE.switches[i].energy;
      publishData("relay", i, numberToStr(STATE.switches[i].energy * 60), value_type);
    }

    if (CONFIG.consolidate.report_device) {
      publishData(null,
        null, numberToStr(e_total * 60), null,
        buildMQTTPublishTopic("relay", null, value_type)
      );

      if (CONFIG.report_total) {
        publishData(null,
          null, numberToStr(e_total), null,
          buildMQTTPublishTopic("relay", null, "total")
        );
      }
    }
  }
}

function handleEvent(info, user_data) {
  if (CONFIG.debug) {
    console.log("2to1:", "received raw event data:", JSON.stringify(info));
  }

  if (typeof info.component !== "undefined" && info.component.indexOf("input:") === 0) {
    if (typeof info.event !== "undefined") {
      if (info.event === "single_push") {
        publishData("input", info.id, "1", null);
        publishData("input", info.id, "0", null);
      } else if (info.event === "long_push") {
        publishData("longpush", info.id, "1", null);
        publishData("longpush", info.id, "0", null);
      }
    }
  }

  if (typeof info.output !== "undefined") {
    publishData("relay", info.id, (info.output ? "on" : "off"), null);
  }

  if (typeof info.state !== "undefined" && info.state !== null) {
    publishData("input", info.id, (info.state ? "1" : "0"), null);
  }
  
  if (typeof info.apower !== "undefined") {
    STATE.switches[info.id].power = info.apower;
  }

  if (typeof info.aenergy !== "undefined") {
    STATE.switches[info.id].energy = info.aenergy.total;
  }
}

function handleMQTTMessage(topic, message, user_data, value) {
  if (CONFIG.debug) {
    console.log("2to1:", "handling message: ", message, ", in topic: ", topic, ", data: ", JSON.stringify(user_data), ", value: ", value);
  }

  if (user_data.type === "cmd" && value === "announce") {
    MQTT.publish("shellies/announce", JSON.stringify(STATE.device_info), 0, false);
  } else if (user_data.type === "switchcmd") {
    Shelly.call("Switch.Set", {id: user_data.id, on: value});
  }
}

function initMQTTSwitch(switch_id) {
  let topic = "shellies/" + STATE.shelly_id + "/relay/" + numberToStr(switch_id, false) + "/command";
  console.log("2to1:", "subscribing to ", topic);

  MQTT.subscribe(
    topic,
    function (topic, message, ud) {
      handleMQTTMessage(topic, message, ud, message === "on" ? true : false);
    },
    {type: "switchcmd", id: switch_id}
  );
}

function installHandlers() {
  console.log("2to1:", "installing event handlers");

  Shelly.addEventHandler(function(event, user_data) {
    handleEvent(event.info, user_data);
  }, null);

  Shelly.addStatusHandler(function(change) {
    handleEvent(change.delta, null);
  }, null);
}

function storeInitValues(result) {

  for (let s in result) {

    if (s.indexOf("input:") === 0) {
      let id = result[s].id;
      // report initial input state (if not configured as button)
      handleEvent({id: id, state: result[s].state}, null);
    }

    if (s.indexOf("switch:") === 0) {
      let id = result[s].id;
      // set initial switch power/energy
      STATE.switches[id] = {
        power: (result[s].apower ? result[s].apower : f_zero),
        energy: result[s].aenergy.total
      };
      // report initial power and switch state
      handleEvent({id: id, apower: STATE.switches[id].power, output: result[s].output}, null);

      // subscribe command topics if we are allowing external
      // switch control
      if (CONFIG.switch_handling) {
        initMQTTSwitch(id);
      }
    }
  }

  installHandlers();
}

function initMQTT() {
  console.log("2to1:", "loading device config and reporting init values");

  Shelly.call("Shelly.GetConfig", {}, function (result) {
    for (let o in result) {
      if (o.indexOf("switch:") === 0) {
        let switch_id = result[o].id;
        while (STATE.switches.length < switch_id + 1)
          STATE.switches.push(null);
      }
    }

    Shelly.call("Shelly.GetStatus", {}, function(result) {
      storeInitValues(result);
    });
  });

  console.log("2to1:", "announcing device");
  MQTT.publish(
    "shellies/" + STATE.shelly_id + "/announce",
    JSON.stringify(STATE.device_info),
    0,
    true
  );

  console.log("2to1:", "subscribing to shellies/command");
  MQTT.subscribe(
    "shellies/command",
    function (topic, message, ud) {
      handleMQTTMessage(topic, message, ud, message);
    },
    {type: "cmd"}
  );
}

Shelly.call("Shelly.GetDeviceInfo", {}, function (result) {
  STATE.shelly_id = result.id;
  STATE.device_info = result;

  if (STATE.device_info === null) {
    die("Unknown error (can't get device info)");
  }

  Shelly.call("Shelly.GetConfig", {}, function (result) {
    STATE.mqtt_enabled = result.mqtt.enable;

    if (!STATE.mqtt_enabled) {
      die("MQTT needs to be enabled and configured");
    }

    initMQTT();
  });
});

console.log("2to1:", "installing timers");
Timer.set(60000, true, reportDevice, "energy");
Timer.set(24000, true, reportDevice, "power");

