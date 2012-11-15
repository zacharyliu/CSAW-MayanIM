var express = require('express');
var http = require('http');
var app = express();
var server = http.createServer(app);
var io = require('socket.io').listen(server);
var fs = require('fs');

var logfile = '../canonlisten_log.txt';

var events_module = require('events');
var events = new events_module.EventEmitter();

process.addListener("uncaughtException", function (err) {
    console.log("Uncaught exception: " + err);
    console.trace();
});

server.listen(process.env.PORT || 4444);
console.log("Listening on port " + (process.env.PORT || 4444))

io.set('log level', 1);

app.use(express.static(__dirname + '/static'));

app.get('/', function(req, res) {
    res.redirect('http://canonlisten.tk');
})

app.set('users', []);
app.set('user_ips', {});

function chat_init(socket) {
    socket.on('ready', function() {
        // Get name
        socket.get('name', function(err, name) {
            // Join the room
            socket.join('chat');
            
            send_user_list(socket);
            
            // Broadcast a connection message
            server_notice(name + ' is now online');
            
            // Handle client messages
            socket.on('chat', function(data) {
                data.name = name;
                io.sockets.in('chat').emit('chat', data);
                log(name + ': ' + data.message);
            });
            socket.on('typing', function() {
                var data = {'name': name};
                io.sockets.in('chat').emit('typing', data);
            });

            // Broadcast a disconnection message when the client disconnects
            socket.on('disconnect', function() {
                remove_user(socket, function() {
                    server_notice(name + ' is now offline');
                });
            });
        });
    });
}

function log(message) {
    //fs.appendFile(logfile,  message + '\n');
}

function append_user(socket, callback) {
    if (typeof(callback) !== 'function') {
        callback = function() {}
    }
    socket.get('name', function(err, name) {
        var users = app.get('users');
        if (users.indexOf(name) != -1) {
            // User already exists
            callback(false);
        } else {
            // User does not exist, add user to list
            users.push(name);
            app.set('users', users);
            
            // Add user IP to list
            var user_ips = app.get('user_ips');
            user_ips[name] = socket.handshake.address.address;
            app.set('user_ips', user_ips);
            
            send_user_list();
            callback(true);
        }
    });
}

function remove_user(socket, callback) {
    if (typeof(callback) !== 'function') {
        callback = function() {}
    }
    socket.get('name', function(err, name) {
        var users = app.get('users');
        var index = users.indexOf(name);
        if (index != -1) {
            // User exists, remove user from list
            users.splice(index, 1);
            app.set('users', users);
            
            // Remove user IP from list
            var user_ips = app.get('user_ips');
            delete user_ips[name];
            app.set('user_ips', user_ips);
            
            send_user_list();
            callback(true);
        } else {
            // User does not exist
            callback(false);
        }
    });
}

function send_user_list(socket) {
    var users = app.get('users');
    if (typeof(socket) !== 'undefined') {
        socket.emit('userlist', users);
    } else {
        io.sockets.in('chat').emit('userlist', users);
    }
}

function server_notice(message) {
    io.sockets.in('chat').emit('server', message);
    log(message);
    console.log(message);
}

io.sockets.on('connection', function(socket) {
    socket.on('login', function(data, callback) {
        socket.set('name', data.name, function() {
            append_user(socket, function(status) {
                if (status == true) {
                    chat_init(socket);
                    callback('success');
                } else {
                    callback('taken');
                }
            });
        });
    });
})
