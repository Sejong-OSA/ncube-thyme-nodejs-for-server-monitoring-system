const conf = require('./conf');
const request = require('request');
const sensor = require("node-dht-sensor");

function request_data({data, actuator}){
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
	      console.log(body);}
	  });
}


function read_dht11(){
	sensor.read(11, 17, function(err, temperature, humidity) {
		console.log(err);
	  if (!err) {
	  console.log(`temp: ${temperature}°C, humidity: ${humidity}%`);
	  request_data({data : temperature, actuator: 'temp'});
	  request_data({data : humidity, actuator: 'hum'});
	  }
	})
}

interval = setInterval(read_dht11, 5000);
