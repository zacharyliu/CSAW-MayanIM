var ui = {
    socket: null,
    initialized: false,
    init: function() {
        ui.chat.init(function(){});
    },
    login: function(callback) {
        var this_class = this;
        // Get chat username
        ui.getName(function(name) {
            // Attempt to login using name
            this_class.socket.emit('login', {'name': name}, function(status) {
                switch (status) {
                    case 'success':
                        console.log('Logged in with name ' + name);
                        callback();
                        break;
                    case 'taken':
                        // Username is taken
                        var info = new ui.prompt('Sorry, that name is already in use. Please try again with a new name.', null, 'info');
                        info.onSubmit(function() {
                            // Clear stored name
                            ui.chat.name = null;
                            // Try again
                            ui.login(callback);
                        });
                        info.show();
                        break;
                }
            });
        });
    },
    getName: function(callback) {
        if (ui.chat.name != null) {
            if (typeof(callback) === 'function') {
                callback(ui.chat.name);
            }
        } else {
            var prompt = new ui.prompt('Login Form', $.cookie('chat_name'));
            prompt.onSubmit(function(name) {
                ui.chat.name = name;
                $.cookie('chat_name', name, {expires: 365});
                
                if (typeof(callback) === 'function') {
                    callback(name);
                }
            });
            prompt.show();
        }
    },
    users: {
        refresh: function(newArray) {
            newArray = newArray.sort();
            var results = this.__search(this.__getOldArray(), newArray);
            for (var i=0; i<results.remove.length; i++) {
                this.__remove(results.remove[i].index);
            }
            for (var i=0; i<results.add.length; i++) {
                this.__add(results.add[i].index, results.add[i].name);
            }
            
            $("#indicator").html(newArray.length + ' online');
        },
        __getOldArray: function() {
            var oldArray = [];
            $("#users_list li").each(function() {
                oldArray.push($(this).html());
            });
            oldArray = oldArray.sort();
            return oldArray;
        },
        __search: function(oldArray, newArray) {
            var results = {
                remove: [],
                add: [],
            };
            // Iterate through old users and find users to remove
            var i = 0;
            while (i<oldArray.length) {
                var item = oldArray[i];
                var index = $.inArray(item, newArray);
                if (index == -1) {
                    // User should be removed, is no longer in new list 
                    // Get old index, then remove from old array to recalculate index for next item
                    var index = $.inArray(item, oldArray);
                    results.remove.push({index: index});
                    oldArray.pop(index);
                } else {
                    i++;
                }
            }
            
            // Iterate through new users and find users to add
            var i = 0;
            while (i<newArray.length) {
                var item = newArray[i];
                var index = $.inArray(item, oldArray);
                if (index == -1) {
                    // Found a new user to add, figure out the new index
                    // Add to array and then resort to calculate where it should go
                    oldArray.push(item);
                    oldArray.sort();
                    var index = $.inArray(item, oldArray);
                    results.add.push({index: index, name: item});
                }
                i++;
            }
            
            return results;
        },
        __add: function(index, name) {
            // index is the new index of the item after insertion
            var html = '<li>' + utils.htmlEncode(name) + '</li>';
            var $object = $(html);
            $object.css({height: 0, opacity: 1}).addClass('animating');
            if (index < $("#users_list li:not(.animating)").length) {
                $("#users_list li:not(.animating)").eq(index).before($object);
            } else {
                $("#users_list").append($object);
            }
            $object.animate({height: '1.3em', opacity: 1}, 500, function(){
                $(this).removeClass('animating');
            });
        },
        __remove: function(index) {
            $("#users_list li:not(.animating)").eq(index).addClass('animating').animate({height: '0em', opacity: 0}, 500, function() {
                $(this).remove();
            });
        }
        
    },
    chat: {
        name: null,
        password: null,
        connectingMessage: {
            isShowing: false,
            show: function() {
                if (this.object == null) {
                    this.object = new ui.prompt('Connecting...', null, 'blocking')
                }
                this.object.show();
                this.isShowing = true;
            },
            hide: function() {
                if (this.object != null) {
                    this.object.hide();
                }
                this.isShowing = false;
            },
            object: null
        },
        init: function(callback) {
            // Initalize socket.io
            if (ui.socket == null) {
                ui.socket = io.connect();
            };
            
            ui.chat.connectingMessage.show();
            
            // Add event handlers
            ui.socket.on('connect', function() {
                console.log('Connected');
                if (ui.chat.connectingMessage.isShowing) {
                    ui.chat.connectingMessage.hide();
                    ui.login(function() {
                        if (!ui.initialized) {
                            callback();
                            ui.initialized = true;
                            ui.chat.ready();
                        }
                        ui.socket.emit('ready');
                    });
                }
            });
        },
        ready: function() {
            ui.socket.on('userlist', function(data) {
                ui.users.refresh(data);
            });
            ui.socket.on('chat', function(data) {
                ui.chat.message.display(data.name, data.message);
                ui.chat.notification.popup.display(data.name + ': ' + data.message);
            });
            ui.socket.on('typing', function(data) {
                ui.chat.typingNotification.display(data.name);
            });
            ui.socket.on('debug', function(data) {
                console.log(data);
            });
            ui.socket.on('server', function(data) {
                ui.chat.message.displayServer(data);
            });
            ui.socket.on('disconnect', function() {
                //var info = new ui.prompt('You have been disconnected. Please refresh to try again.', null, 'info');
                //info.show();
                
                console.log('Disconnected');
                ui.chat.connectingMessage.show();
            });
            ui.socket.on('ban_list', function(data) {
                console.log(data);
            });
            
            // Bind event handler to the input field to send a message
            $("#chat_input_content").keypress(function(e) {// If the enter key is pressed
                if (e.which == 13) {
                    // Get the current message
                    var message = $("#chat_input_content").val();
                    
                    // Send the message
                    ui.chat.message.send(message);
                    
                    // Clear the message from the input field
                    $("#chat_input_content").val("");
                } else {
                    // Send a typing notification, at most once a second
                    ui.chat.typingNotification.send();
                }
            });
            
            // Update the typing notifications once
            ui.chat.typingNotification.__update();
            
            // Set focus to the chat box
            $("#chat_input_content").focus();
            
            // Send ready message
            //ui.socket.emit('ready');
        },
        message: {
            display: function(name, message) {
                var html = '<div class="chat_history_item"><span class="chat_history_item_name"></span><span class="chat_history_item_message"></span></div>';
                $(html).insertBefore("#chat_history_typing").css({'opacity': 0}).animate({'opacity': 1}, 50);
                $('.chat_history_item:last .chat_history_item_name').text(name);
                $('.chat_history_item:last .chat_history_item_message').text(message);
                
                // Remove any typing notification from this user
                ui.chat.typingNotification.remove(name);
                
                // Scroll the chat history
                $("#chat_history").scrollTo('max');
            },
            displayServer: function(message) {
                var html = '<div class="chat_history_item"><span class="chat_history_item_message chat_history_item_server"></span></div>';
                $(html).insertBefore("#chat_history_typing").css({'opacity': 0}).animate({'opacity': 1}, 50);
                $('.chat_history_item:last .chat_history_item_message').text(message);
                
                // Scroll the chat history
                $("#chat_history").scrollTo('max');
            },
            send: function(message) {
                if (message != '') {
                    ui.socket.emit('chat', {'message': message});
                }
            }
        },
        typingNotification: {
            __timeout: 3000,
            display: function(name) {
                this_class = this;
                
                // Clear the typing notification automatically after 3 seconds without an update
                // Reset the typing notification timer
                if (typeof(this.__current[name]) != 'undefined') {
                    window.clearTimeout(this.__current[name].timeoutID);
                }
                this.__current[name] = {};
                // Set a new timer
                this.__current[name].timeoutID = window.setTimeout(function() {
                    this_class.remove(name);
                }, this.__timeout);
                this.__current[name].name = name;
                
                this.__update();
            },
            __current: {},
            remove: function(name) {
                if (typeof(this.__current[name]) != 'undefined') {
                    window.clearTimeout(this.__current[name].timeoutID);
                    delete this.__current[name];
                    this.__update();
                }
            },
            __hidden: false,
            __update: function() {
                var count = utils.objCount(this.__current);
                if (count == 0) {
                    if (!this.__hidden) {
                        $("#chat_history_typing").html("").stop(true).animate({'opacity': '0', 'height': '0'}, 50);
                        this.__hidden = true;
                    }
                } else {
                    var names = [];
                    for (var item in this.__current) {
                        if (this.__current.hasOwnProperty(item)) {
                            names.push(utils.htmlEncode(item));
                        }
                    }
                    var phrase = "";
                    if (count == 1) {
                        phrase = names[0] + " is typing";
                    } else if (count == 2) {
                        phrase = names[0] + " and " + names[1] + " are typing";
                    } else {
                        for (var i=0; i<(names.length-1); i++) {
                            phrase = phrase + names[i] + ", ";
                        }
                        phrase = phrase + "and " + names[names.length-1] + " are typing"; 
                    }
                    $("#chat_history_typing").html(phrase);
                    if (this.__hidden) {
                        $("#chat_history_typing").stop(true).css({'height': '20px'}).animate({'opacity': '1'}, 50);
                        this.__hidden = false;
                    }
                }
                
                // Scroll the chat history
                $("#chat_history").scrollTo('max');
            },
            lastSent: 0,
            __floodRate: 1000,
            send: function() {
                if (Date.now() - this.lastSent > this.__floodRate) {
                    ui.socket.emit('typing');
                    this.lastSent = Date.now();
                }
            }
        },
        notification: {
            popup: {
                display: function(message) {
                    if (!document.hasFocus()) {
                        var notification = webkitNotifications.createNotification(null, $("#title").text(), message);
                        notification.show();
                        notification.onclick = function() {
                            window.focus();
                            notification.cancel();
                        };
                        notification.onclose = function() {
                            notification.cancel();
                        };
                    }
                }
            }
        }
    },
    prompt: function(title, inital_value, type) {
        var this_class = this;
        var callback = function() {}
        
        // Setup prompt modal
        if (type == 'info') {
            var html = '<div class="prompt_modal"><div class="prompt"><div class="prompt_title"></div><input class="prompt_button" type="button" value="OK"></input></div></div>';
        } else if (type == 'blocking') {
            var html = '<div class="prompt_modal"><div class="prompt"><div class="prompt_title"></div></div></div>';
        } else if (type == 'password') {
            var html = '<div class="prompt_modal"><div class="prompt"><div class="prompt_title"></div><input class="prompt_input" type="password"></input></div></div>';
        } else {
            var html = '<div class="prompt_modal"><div class="prompt"><div class="prompt_title"></div><p><label for="username">Username: </label><input class="prompt_input" type="text"></input></p><p><input type="submit" id="login" name="login" /></p></div></div>';
        }
        
        this.$ = $(html);
        this.$.find('.prompt_title').html(title);
        if (type != 'info') {this.$.find('.prompt_input').attr('value', inital_value)};
        this.$.css({'display': 'none'}).appendTo('body');
        
        if (type == 'info') {
            this.$.find('.prompt_button').click(function(e) {
                this_class.hide();
                this_class.$.remove();
                callback();
            });
        } else if (type != 'blocking') {
            // Attach event handler to input box
            this.$.find('.prompt_input').keypress(function(e) {
                // If the enter key was pressed:
                if (e.which == 13) {
                    var data = $(this).attr('value');
                    this_class.hide();
                    this_class.$.remove();
                    callback(data);
                }
            });
        }
        
        this.onSubmit = function(newCallback) {
            callback = newCallback;
        }
        
        this.show = function() {
            // Show prompt modal
            this.$.css({'display': 'block', 'opacity': 1});
            this.$.find('.prompt').css({'margin-top': '-150px'}).animate({'margin-top': '-100px'}, 200);
            this.$.find('.prompt_modal').css({'opacity': 0}).animate({'opacity': 1}, 200);
            if (type == 'info') {
                this.$.find('.prompt_button').focus();
            } else if (type != 'blocking') {
                this.$.find('.prompt_input').focus();
            }
        }
        
        this.hide = function() {
            // Hide prompt modal
            this.$.find('.prompt').animate({'margin-top': '-50px'}, 200);
            this.$.animate({'opacity': 0}, 200, function() {
                $(this).css({'display': 'none'});
                //$(this).remove();
            });
        }
    }
}

var utils = {
    objCount: function(obj) {
        var size = 0, key;
        for (key in obj) {
            if (obj.hasOwnProperty(key)) size++;
        }
        return size;
    },
    htmlEncode: function(text) {
        return $('<div />').text(text).html();
    },
    htmlDecode: function(html) {
        return $('<div />').html(html).text();
    }
}

$(function() {
    ui.init();
});
