const conf = require('./conf');
const request = require('request');
const sensor = require("node-dht-sensor");

const dht_type = 11;
const dht_pin = 17;
const time_interval = 5 * 1000;

function get_options(actuator, requestNr){
	const cseURL = `http://${conf.cse.host}:${conf.cse.port}`;
	return  {
		uri: `${cseURL}/${conf.cse.name}/${conf.ae.name}/${actuator}`,
		method: "POST",
		headers: {
			"X-M2M-Origin": "S" + actuator,
			"X-M2M-RI": "req" + requestNr,
			"Content-Type": "application/json;ty=4",
		}
	};
}

function get_con(con){
	return { json: { "m2m:cin": { con: con } } }
}

function request_data({data, actuator}){
	  let requestNr = 0;
	  const cseRelease = "1";
	  const options = get_options(actuator, requestNr);
	  const con_json = get_con(data);
	  const req = Object.assign({}, con_json, options);

	  console.log("\n[REQUEST]\n");
	  console.log(options.method + " " + options.uri);
	  console.log(options.json);

	  if (cseRelease != "1") {
	    options.headers = Object.assign(options.headers, {
	      "X-M2M-RVI": cseRelease,
	    });
	  }

	  requestNr += 1;
	  request(req, (error, response, body) => {
	    console.log("[RESPONSE]");
	    if (error) {
	      console.log(error);
	    } else {
	      console.log(response.statusCode);
	      console.log(body);}
	  });
}


function read_dht11(){
	sensor.read(dht_type, dht_pin, function(err, temperature, humidity) {
	  if (!err) {
	  console.log(`temp: ${temperature}°C, humidity: ${humidity}%`);
	  request_data({data : temperature, actuator: 'temp'});
	  request_data({data : humidity, actuator: 'hum'});
	  }
	})
}

interval = setInterval(read_dht11, time_interval);
