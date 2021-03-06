#!/usr/bin/env node

/*global process require exports setInterval __dirname */

var util = require('util'),
    pcap = require("pcap"),
    count = 0,
    start_time = new Date(),
    dns_cache = pcap.dns_cache,
    tcp_tracker = new pcap.TCPTracker(),
    http = require('http'),
    url = require('url'),
    path = require('path'),
    fs = require('fs'),
    track_ids = {}
    bulk_data='';

if (process.argv.length !== 4) {
    console.error("usage speed_server interface filter");
    console.error("Examples: ");
    console.error('  speed_server "" "tcp port 80"');
    console.error('  speed_server eth1 ""');
    console.error('  speed_server lo0 "ip proto \\tcp and tcp port 80"');
    process.exit(1);
}

bulk_data = new Buffer(1024 * 1024);
for (var i = 0; i < (1024 * 1024); i += 1) {
    bulk_data[i] = 33;
}

const pcap_session = pcap.createSession(process.argv[2], { filter: process.argv[3] });

// Print all devices, currently listening device prefixed with an asterisk
console.log("All devices:",pcap_session);
/*pcap_session.findalldevs().forEach(function (dev) {
    if (pcap_session.device_name === dev.name) {
        console.log("* ");
    }
    console.log(dev.name + " ");
    if (dev.addresses.length > 0) {
        dev.addresses.forEach(function (address) {
            console.log(address.addr + "/" + address.netmask);
        });
        console.log("\n");
    } else {
        console.log("no address\n");
    }
});
*/
setInterval(function () {
    var stats = pcap_session.stats();
    if (stats.ps_drop > 0) {
        console.log("pcap dropped packets: " + util.inspect(stats));
    }
}, 5000);

tcp_tracker.on('start', function (session) {
    console.log("Start of TCP session between " + session.src + " and " + session.dst);
});

tcp_tracker.on('http request', function (session, http) {
    var matches = /send_file\?id=(\d+)/.exec(http.request.url);
    if (matches && matches[1]) {
        session.track_id = matches[1];
        console.log("Added tracking for " + matches[1]);
    }
    else {
        console.log("Didn't add tracking for " + http.request.url);
    }
});

tcp_tracker.on('end', function (session) {
    console.log("End of TCP session between " + session.src + " and " + session.dst);
    if (session.track_id) {
        track_ids[session.track_id] = tcp_tracker.session_stats(session);
    }
});

// listen for packets, decode them, and feed TCP to the tracker
pcap_session.on('packet', function (raw_packet) {
    var packet = pcap.decode.packet(raw_packet);
    
    tcp_tracker.track_packet(packet);
});

function lookup_mime_type(file_name) {
    var mime_types = {
            html: "text/html",
            txt: "text/plain",
            js: "application/javascript",
            css: "text/css",
            ico: "image/x-icon",
            jpg: "image/jpeg"
        },
        index = file_name.lastIndexOf('.'),
        suffix;
    // TODO - use path.extname() here
    if (index > 0 && index < (file_name.length - 2)) {
        suffix = file_name.substring(index + 1);
        if (mime_types[suffix] !== undefined) {
            return mime_types[suffix];
        }
    }
    return "text/plain";
}

function do_error(response, code, message) {
    console.log("do_error: " + code + " - " + message);
    response.writeHead(code, {
        "Content-Type": "text/plain",
        "Connection": "close"
    });
    response.write(message);
    response.end();
}

function handle_file(file_name, in_request, in_response) {
    var local_name = file_name.replace(/^\//, __dirname + "/"),
        file;

    if (local_name.match(/\/$/)) {
        local_name += "index.html";
    }

    fs.exists(local_name, function (exists) {
        if (exists) {
            file = fs.readFile(local_name, function (err, data) {
                var out_headers = {
                    "Content-Type": lookup_mime_type(local_name),
                    "Content-Length": data.length,
                    "Connection": "close"
                };
                if (err) {
                    do_error(in_response, 404, "Error opening " + local_name + ": " + err);
                    return;
                }
                if (in_request.headers.origin) {
                    out_headers["access-control-allow-origin"] = in_request.headers.origin;
                }

                in_response.writeHead(200, out_headers);
                in_response.write(data);
                in_response.end();
            });
        }
        else {
            do_error(in_response, 404, local_name + " does not exist");
        }
    });
}

function send_start(url, request, response) {
    if (url.query && url.query.id) {
        track_ids[url.query.id] = {};
        var out_headers = {
            "Content-Type": "text/plain",
            "Content-Length": bulk_data.length,
            "Connection": "close"
        };
        response.writeHead(200, out_headers);
        response.write(bulk_data);
        response.end();
    }
    else {
        do_error(response, 400, "Missing id in query string");
    }
}

function get_stats(url, request, response) {
    if (url.query && url.query.id) {
        response.writeHead(200, {
            "Content-Type": "text/plain",
            "Connection": "close"
        });
        if (track_ids[url.query.id]) {
            response.write(JSON.stringify(track_ids[url.query.id]));
            delete track_ids[url.query.id];
        }
        else {
            response.write(JSON.stringify({
                error: "Can't find id in session table"
            }));
        }
        response.end();
    }
    else {
        do_error(response, 400, "Missing id in query string");
    }
}

function new_client(new_request, new_response) {
    console.log(new_request.connection.remoteAddress + " " + new_request.method + " " + new_request.url);
    if (new_request.method === "GET") {
        var url_parsed = url.parse(new_request.url, true),
            pathname = url_parsed.pathname;

        switch (url_parsed.pathname) {
        case "/":
        case "/index.html":
        case "/favicon.ico":
        case "/jquery.flot.js":
        case "/jquery.js":
        case "/jquery.min.js":
            handle_file(pathname, new_request, new_response);
            break;
        case "/send_file":
            send_start(url_parsed, new_request, new_response);
            break;
        case "/get_stats":
            get_stats(url_parsed, new_request, new_response);
            break;
        default:
            do_error(new_response, 404, "Not found");
        }
    } else {
        do_error(new_response, 404, "WTF");
    }
}

http.createServer(new_client).listen(80);
console.log("Listening for HTTP");

process.addListener("uncaughtException", function (event) {
    console.log("Uncaught Exception: " + event.stack);
});
