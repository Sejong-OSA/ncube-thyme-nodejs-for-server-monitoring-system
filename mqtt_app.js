/**
 * Copyright (c) 2018, OCEAN
 * All rights reserved.
 * Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
 * 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
 * 3. The name of the author may not be used to endorse or promote products derived from this software without specific prior written permission.
 * THIS SOFTWARE IS PROVIDED BY THE AUTHOR ``AS IS'' AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * Created by ryeubi on 2015-11-20.
 */

var fs = require("fs");
var mqtt = require("mqtt");
var util = require("util");
var xml2js = require("xml2js");
var url = require("url");
var cbor = require("cbor");
var request = require("request");

const Gpio = require('onoff').Gpio;
const sensor = require("node-dht-sensor");

const fan1= new Gpio(22, 'out');
const fan2 = new Gpio(27, 'out');

const on = "1"
const off = "0"

global.req_topic =
  "/oneM2M/req/" + conf.ae.id + conf.cse.id + "/" + conf.ae.bodytype;

var reg_resp_topic = "/oneM2M/reg_resp/" + conf.ae.id + "/+/#";
var resp_topic = "/oneM2M/resp/" + conf.ae.id + "/+/#";
var noti_topic = "/oneM2M/req/+/" + conf.ae.id + "/#";

global.sh_adn = require("./mqtt_adn");
var noti = require("./noti");
var tas = require("./thyme_tas");

function active_low(power){
	return power === 0 ? 1 : 0;
}

function mqtt_message_handler(topic, message) {
  var topic_arr = topic.split("/");
  var bodytype = conf.ae.bodytype;
  if (topic_arr[5] != null) {
    bodytype =
      topic_arr[5] === "xml"
        ? topic_arr[5]
        : topic_arr[5] === "json"
        ? topic_arr[5]
        : topic_arr[5] === "cbor"
        ? topic_arr[5]
        : "json";
  }

  console.log(message.toString());

  if (
    topic_arr[1] == "oneM2M" &&
    (topic_arr[2] == "resp" || topic_arr[2] == "reg_resp") &&
    topic_arr[3].replace(":", "/") == conf.ae.id
  ) {
    if (bodytype === "xml") {
      var parser = new xml2js.Parser({ explicitArray: false });
      parser.parseString(message.toString(), function (err, jsonObj) {
        if (err) {
          console.log("[mqtt-resp xml2js parser error]");
        } else {
          if (jsonObj["m2m:rsp"] != null) {
            mqtt_callback(jsonObj);
          } else {
            NOPRINT === "true"
              ? (NOPRINT = "true")
              : console.log("[pxymqtt-resp] message is not resp");
            noti.response_mqtt(
              topic_arr[4],
              4000,
              "",
              conf.ae.id,
              rqi,
              "<h1>fail to parsing mqtt message</h1>"
            );
          }
        }
      });
    } else if (bodytype === "cbor") {
      var encoded = message.toString();
      cbor.decodeFirst(encoded, function (err, jsonObj) {
        if (err) {
          console.log("[mqtt-resp cbor parser error]");
        } else {
          if (jsonObj["m2m:rsp"] == null) {
            jsonObj["m2m:rsp"] = jsonObj;
          }

          mqtt_callback(jsonObj);
        }
      });
    } else {
      // 'json'
      var jsonObj = JSON.parse(message.toString());

      if (jsonObj["m2m:rsp"] == null) {
        jsonObj["m2m:rsp"] = jsonObj;
      }

      mqtt_callback(jsonObj);
    }
  } else if (
    topic_arr[1] == "oneM2M" &&
    topic_arr[2] == "req" &&
    topic_arr[4] == conf.ae.id
  ) {
    if (bodytype == "xml") {
      parser = new xml2js.Parser({ explicitArray: false });
      parser.parseString(message.toString(), function (err, jsonObj) {
        if (err) {
          console.log("[mqtt noti xml2js parser error]");
        } else {
          if (jsonObj["m2m:rqp"].op == "5" || jsonObj["m2m:rqp"].op == 5) {
            noti.mqtt_noti_action(topic_arr, jsonObj);
          }
        }
      });
    } else if (bodytype === "cbor") {
      encoded = message.toString();
      cbor.decodeFirst(encoded, function (err, jsonObj) {
        if (err) {
          console.log("[mqtt noti cbor parser error]");
        } else {
          noti.mqtt_noti_action(topic_arr, jsonObj);
        }
      });
    } else {
      // json
      jsonObj = JSON.parse(message.toString());

      if (jsonObj.pc["m2m:sgn"].nev.rep["m2m:cin"] !== undefined) {
        const sensorData = jsonObj.pc["m2m:sgn"].nev.rep["m2m:cin"].con;
        const dataType = jsonObj.pc["m2m:sgn"].sur.split("/");
        console.log("jsonObj()===============");
        console.log(dataType[2]);

        const obj = {};
        const date = new Date();
        const year = date.getFullYear();
        const month = date.getMonth();
        const today = date.getDate();
        const hours = date.getHours();
        const minutes = date.getMinutes();
        const seconds = date.getSeconds();

        obj.dataType = dataType[2];
        obj.data = sensorData;
        obj.created_at = new Date(
          Date.UTC(year, month, today, hours, minutes, seconds)
        );
	
	//TODO : deal with fan
	if(obj.dataType === "fan1"){
		if(obj.data === on){ fan1.writeSync(active_low(parseInt(on))) }
		else if(obj.data === off) { fan1.writeSync(active_low(parseInt(off))) }
		else { console.log("data value error"); }
	} else if (obj.dataType == "fan2"){
		if(obj.data === on){ fan2.writeSync(active_low(parseInt(on))) }
		else if(obj.data === off) { fan2.writeSync(active_low(parseInt(off))) }
		else { console.log("data value error"); }
	}

        console.log(obj);

        if (jsonObj["m2m:rqp"] == null) {
          jsonObj["m2m:rqp"] = jsonObj;
        }

        noti.mqtt_noti_action(topic_arr, jsonObj);
      }
    }
  } else {
    console.log("topic is not supported");
  }
}

createContentInstance({ data: "1994", actuator: "temp" });
createContentInstance({ data: "144", actuator: "hum" });

function createContentInstance({ data, actuator }) {
  const cseURL = `http://${conf.cse.host}:${conf.cse.port}`;
  const con = data;
  const cseRelease = "1";

  let requestNr = 0;

  console.log("\n[REQUEST]");

  const options = {
    uri: `${cseURL}/${conf.cse.name}/${conf.ae.name}/${actuator}`,
    method: "POST",
    headers: {
      "X-M2M-Origin": "S" + actuator,
      "X-M2M-RI": "req" + requestNr,
      "Content-Type": "application/json;ty=4",
    },
    json: {
      "m2m:cin": {
        con: con,
      },
    },
  };

  console.log("");
  console.log(options.method + " " + options.uri);
  console.log(options.json);

  if (cseRelease != "1") {
    options.headers = Object.assign(options.headers, {
      "X-M2M-RVI": cseRelease,
    });
  }

  requestNr += 1;
  request(options, (error, response, body) => {
    console.log("[RESPONSE]");
    if (error) {
      console.log(error);
    } else {
      console.log(response.statusCode);
      console.log(body);
    }
  });
}

if (conf.usesecure === "disable") {
  var connectOptions = {
    host: conf.cse.host,
    port: conf.cse.mqttport,
    //              username: 'keti',
    //              password: 'keti123',
    protocol: "mqtt",
    keepalive: 10,
    //              clientId: serverUID,
    protocolId: "MQTT",
    protocolVersion: 4,
    clean: true,
    reconnectPeriod: 2000,
    connectTimeout: 2000,
    rejectUnauthorized: false,
  };
} else {
  connectOptions = {
    host: brokerip,
    port: conf.cse.mqttport,
    protocol: "mqtts",
    keepalive: 10,
    //              clientId: serverUID,
    protocolId: "MQTT",
    protocolVersion: 4,
    clean: true,
    reconnectPeriod: 2000,
    connectTimeout: 2000,
    key: fs.readFileSync("./server-key.pem"),
    cert: fs.readFileSync("./server-crt.pem"),
    rejectUnauthorized: false,
  };
}

mqtt_client = mqtt.connect(connectOptions);

mqtt_client.on("connect", function () {
  mqtt_client.subscribe(reg_resp_topic);
  mqtt_client.subscribe(resp_topic);
  mqtt_client.subscribe(noti_topic);

  console.log("subscribe reg_resp_topic as " + reg_resp_topic);
  console.log("subscribe resp_topic as " + resp_topic);
  console.log("subscribe noti_topic as " + noti_topic);

  sh_state = "crtae";
});

mqtt_client.on("message", mqtt_message_handler);

function mqtt_callback(jsonObj) {
  for (var i = 0; i < resp_mqtt_ri_arr.length; i++) {
    if (resp_mqtt_ri_arr[i] == jsonObj["m2m:rsp"].rqi) {
      var socket = socket_q[resp_mqtt_ri_arr[i]];
      var to = resp_mqtt_path_arr[resp_mqtt_ri_arr[i]];
      console.log(to);
      callback_q[resp_mqtt_ri_arr[i]](
        jsonObj["m2m:rsp"].rsc,
        jsonObj["m2m:rsp"].pc,
        to,
        socket
      );
      delete callback_q[resp_mqtt_ri_arr[i]];
      delete resp_mqtt_path_arr[resp_mqtt_ri_arr[i]];
      resp_mqtt_ri_arr.splice(i, 1);
      break;
    }
  }
}

sh_state = "connect";
var return_count = 0;
var request_count = 0;

function ae_response_action(status, result) {
  var aeid = result["m2m:ae"]["aei"];

  console.log("x-m2m-rsc : " + status + " - " + aeid + " <----");

  mqtt_client.unsubscribe(reg_resp_topic);
  mqtt_client.unsubscribe(resp_topic);
  mqtt_client.unsubscribe(noti_topic);

  conf.ae.id = aeid;

  //fs.writeFileSync('aei.json', JSON.stringify(conf.ae.id, null, 4), 'utf8');

  reg_resp_topic = "/oneM2M/reg_resp/" + conf.ae.id + "/+/#";
  req_topic =
    "/oneM2M/req/" + conf.ae.id + conf.cse.id + "/" + conf.ae.bodytype;
  resp_topic = "/oneM2M/resp/" + conf.ae.id + "/+/#";
  noti_topic = "/oneM2M/req" + conf.cse.id + "/" + conf.ae.id + "/#";

  mqtt_client.subscribe(reg_resp_topic);
  mqtt_client.subscribe(resp_topic);
  mqtt_client.subscribe(noti_topic);
}

function create_cnt_all(count, callback) {
  sh_adn.crtct(count, function (rsc) {
    console.log(
      count + " - " + conf.cnt[count].name + " - x-m2m-rsc : " + rsc + " <----"
    );
    if (rsc == 5106 || rsc == 2001 || rsc == 4105) {
      count++;
      if (conf.cnt.length > count) {
        create_cnt_all(count, function (rsc, count) {
          callback(rsc, count);
        });
      } else {
        callback(rsc, count);
      }
    } else {
      callback("9999", count);
    }
  });
}

function delete_sub_all(count, callback) {
  sh_adn.delsub(count, function (rsc) {
    console.log(
      count + " - " + conf.sub[count].name + " - x-m2m-rsc : " + rsc + " <----"
    );
    if (
      rsc == 5106 ||
      rsc == 2002 ||
      rsc == 2000 ||
      rsc == 4105 ||
      rsc == 4004
    ) {
      count++;
      if (conf.sub.length > count) {
        delete_sub_all(count, function (rsc, count) {
          callback(rsc, count);
        });
      } else {
        callback(rsc, count);
      }
    } else {
      callback("9999", count);
    }
  });
}

function create_sub_all(count, callback) {
  sh_adn.crtsub(count, function (rsc) {
    console.log(
      count + " - " + conf.sub[count].name + " - x-m2m-rsc : " + rsc + " <----"
    );
    if (rsc == 5106 || rsc == 2001 || rsc == 4105) {
      count++;
      if (conf.sub.length > count) {
        create_sub_all(count, function (rsc, count) {
          callback(rsc, count);
        });
      } else {
        callback(rsc, count);
      }
    } else {
      callback("9999", count);
    }
  });
}

function mqtt_watchdog() {
  if (sh_state == "connect") {
  } else if (sh_state == "crtae") {
    console.log("[sh_state] : " + sh_state);

    sh_adn.crtae(function (status, res_body) {
      if (status == 2001) {
        ae_response_action(status, res_body);
        sh_state = "crtct";
      } else if (status == 5106 || status == 4105) {
        console.log("x-m2m-rsc : " + status + " <----");
        sh_state = "rtvae";
      }
    });
  } else if (sh_state == "rtvae") {
    console.log("[sh_state] : " + sh_state);
    sh_adn.rtvae(function (status, res_body) {
      if (status == 2000) {
        var aeid = res_body["m2m:ae"]["aei"];
        console.log("x-m2m-rsc : " + status + " - " + aeid + " <----");

        if (conf.ae.id != aeid && conf.ae.id != "/" + aeid) {
          console.log(
            "AE-ID created is " +
              aeid +
              " not equal to device AE-ID is " +
              conf.ae.id
          );
        } else {
          sh_state = "crtct";
        }
      } else {
        console.log("x-m2m-rsc : " + status + " <----");
      }
    });
  } else if (sh_state == "crtct") {
    console.log("[sh_state] : " + sh_state);
    request_count = 0;
    return_count = 0;

    create_cnt_all(0, function (status, count) {
      if (conf.cnt.length <= count) {
        sh_state = "delsub";
      }
    });
  } else if (sh_state == "delsub") {
    console.log("[sh_state] : " + sh_state);
    request_count = 0;
    return_count = 0;

    delete_sub_all(0, function (status, count) {
      if (conf.sub.length <= count) {
        sh_state = "crtsub";
      }
    });
  } else if (sh_state == "crtsub") {
    console.log("[sh_state] : " + sh_state);
    request_count = 0;
    return_count = 0;

    create_sub_all(0, function (status, count) {
      if (conf.sub.length <= count) {
        sh_state = "crtci";

        tas.ready();
      }
    });
  } else if (sh_state == "crtci") {
  }
}

wdt.set_wdt(require("shortid").generate(), 2, mqtt_watchdog);
