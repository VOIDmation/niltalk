const linkifyExpr = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
const notifType = {
    notice: "notice",
    error: "error"
};
const typingDebounceInterval = 3000;

Vue.component("expand-link", {
    props: ["link"],
    data: function () {
        return {
            visible: false
        }
    },
    methods: {
        select(e) {
            e.target.select();
        }
    },
    template: `
        <div class="expand-link">
            <a href="#" v-on:click.prevent="visible = !visible">🔗</a>
            <input v-if="visible" v-on:click="select" readonly type="text" :value="link" />
        </div>
    `
});

var app = new Vue({
    el: "#app",
    delimiters: ["{(", ")}"],
    data: {
        isBusy: false,
        chatOn: false,
        sidebarOn: true,
        disposed: false,
        hasSound: true,

        // Global flash / notifcation properties.
        notifTimer: null,
        notifMessage: "",
        notifType: "",

        // New activity animation in title bar. Page title is cached on load
        // to use in the animation.
        newActivity: false,
        newActivityCounter: 0,
        pageTitle: document.title,

        typingTimer: null,
        typingPeers: new Map(),

        // Form fields.
        roomName: "",
        handle: "",
        password: "",
        message: "",

        // Chat data.
        self: {},
        messages: [],
        peers: []
    },
    created: function () {
        this.initClient();
        this.initTimers();
    },
    computed: {
        Client() {
            return window.Client;
        }
    },
    methods: {
        // Handle room creation.
        handleCreateRoom() {
            fetch("/api/rooms", {
                method: "post",
                body: JSON.stringify({
                    name: this.roomName,
                    password: this.password
                }),
                headers: { "Content-Type": "application/json; charset=utf-8" }
            })
                .then(resp => resp.json())
                .then(resp => {
                    this.toggleBusy();
                    if (resp.error) {
                        this.notify(resp.error, notifType.error);
                    } else {
                        document.location.replace("/r/" + resp.data.id);
                    }
                })
                .catch(err => {
                    this.toggleBusy();
                    this.notify(err, notifType.error);
                });
        },

        // Login to a room.
        handleLogin() {
            const handle = this.handle.replace(/[^a-z0-9_\-\.@]/ig, "");

            this.notify("Logging in", notifType.notice);
            fetch("/api/rooms/" + _room.id + "/login", {
                method: "post",
                body: JSON.stringify({ handle: handle, password: this.password }),
                headers: { "Content-Type": "application/json; charset=utf-8" }
            })
                .then(resp => resp.json())
                .then(resp => {
                    this.toggleBusy();
                    if (resp.error) {
                        this.notify(resp.error, notifType.error);
                        // pwdField.focus();
                        return;
                    }

                    this.clear();
                    this.deNotify();
                    this.toggleChat();
                    Client.init(_room.id, handle);
                    Client.connect();
                })
                .catch(err => {
                    this.toggleBusy();
                    this.notify(err, notifType.error);
                });
        },

        // Capture keypresses to send message on Enter key and to broadcast
        // "typing" statuses.
        handleChatKeyPress(e) {
            if (e.keyCode == 13 && !e.shiftKey) {
                e.preventDefault();
                this.handleSendMessage();
                return;
            }

            // If it's a non "text" key, ignore.
            if (!String.fromCharCode(e.keyCode).match(/(\w|\s)/g)) {
                return;
            }

            // Debounce and wait for N seconds before sending a typing status.
            if (this.typingTimer) {
                return;
            }

            // Send the 'typing' status.
            Client.sendMessage(Client.MsgType.Typing);

            this.typingTimer = window.setTimeout(() => {
                this.typingTimer = null;
            }, typingDebounceInterval);
        },

        handleSendMessage() {
            Client.sendMessage(Client.MsgType.Message, this.message);
            this.message = "";
            window.clearTimeout(this.typingTimer);
            this.typingTimer = null;
        },

        handleDisposeRoom() {
            if (!confirm("Disconnect all peers and destroy this room?")) {
                return;
            }
            Client.sendMessage(Client.MsgType.DisposeRoom);
        },

        // Flash notification.
        notify(msg, typ, timeout) {
            clearTimeout(this.notifTimer);
            this.notifTimer = setTimeout(function () {
                this.notifMessage = "";
                this.notifType = "";
            }.bind(this), timeout ? timeout : 3000);

            this.notifMessage = msg;
            if (typ) {
                this.notifType = typ;
            }
        },

        beep() {
            const b = document.querySelector("#beep");
            b.pause();
            b.load();
            b.play();
        },

        deNotify() {
            clearTimeout(this.notifTimer);
            this.notifMessage = "";
            this.notifType = "";
        },

        hashColor(str) {
            for (var i = 0, hash = 0; i < str.length; hash = str.charCodeAt(i++) + ((hash << 5) - hash));
            for (var i = 0, colour = "#"; i < 3; colour += ("00" + ((hash >> i++ * 8) & 0xFF).toString(16)).slice(-2));
            return colour;
        },

        formatDate(ts) {
            var t = new Date(ts),
                h = t.getHours(),
                minutes = t.getMinutes(),
                hours = ((h + 11) % 12 + 1);
            return (hours < 10 ? "0" : "")
                + hours.toString()
                + ":"
                + (minutes < 10 ? "0" : "")
                + minutes.toString()
                + " " + (h > 12 ? "PM" : "AM");
        },

        formatMessage(text) {
            const div = document.createElement("div");
            div.appendChild(document.createTextNode(text));
            return div.innerHTML.replace(/\n+/ig, "<br />")
                .replace(linkifyExpr, "<a refl='noopener noreferrer' href='$1' target='_blank'>$1</a>");
        },

        // Toggle busy (form button) state.
        toggleBusy() {
            this.isRequesting = !this.isRequesting;
        },

        toggleSidebar() {
            this.sidebarOn = !this.sidebarOn;
        },

        toggleChat() {
            this.chatOn = !this.chatOn;

            this.$nextTick().then(function () {
                if (!this.chatOn) {
                    this.$refs["form-password"].focus();
                    return
                }
                this.$refs["form-message"].focus();
            }.bind(this));
        },

        // Clear all states.
        clear() {
            this.handle = "";
            this.password = "";
            this.password = "";
            this.message = "";
            this.self = {};
            this.messages = [];
            this.peers = [];
        },

        // WebSocket client event handlers.
        onConnect() {
            Client.getPeers();
        },

        onDisconnect() {
            this.notify("Disconnected. Retrying ...", notifType.notice);
            // window.location.reload();
        },

        onReconnecting(timeout) {
            this.notify("Disconnected. Retrying ...", notifType.notice, timeout);
        },

        onPeerSelf(data) {
            this.self = {
                ...data.data,
                avatar: this.hashColor(data.data.id)
            };
        },

        onPeerJoinLeave(data, typ) {
            const peer = data.data;
            let peers = JSON.parse(JSON.stringify(this.peers));

            // Add / remove the peer from the existing list.
            if (typ === Client.MsgType.PeerJoin) {
                peers.push(peer);
            } else {
                peers = peers.filter((e) => { return e.id !== peer.id; });
            }
            this.onPeers(peers);

            // Notice in the message area;
            this.messages.push({
                type: typ,
                id: peer.id,
                handle: peer.handle,
                timestamp: data.timestamp
            });
        },

        onPeers(data) {
            const peers = data.sort(function (a, b) {
                if (a.handle < b.handle) {
                    return -1;
                } else if (a.handle > b.handle) {
                    return 1;
                } else {
                    return 0;
                }
            });


            peers.forEach(p => {
                p.avatar = this.hashColor(p.id);
            });

            this.peers = peers;
        },

        onTyping(data) {
            if (data.data.id === this.self.id) {
                return;
            }
            this.typingPeers.set(data.data.id, { ...data.data, time: Date.now() });
            this.$forceUpdate();
        },

        onMessage(data) {
            // If the window isn't in focus, start the "new activity" animation
            // in the title bar.
            if (!document.hasFocus()) {
                this.newActivity = true;
                this.beep();
            }

            this.typingPeers.delete(data.data.peer_id);
            this.messages.push({
                type: Client.MsgType.Message,
                timestamp: data.timestamp,
                message: data.data.message,
                peer: {
                    id: data.data.peer_id,
                    handle: data.data.peer_handle,
                    avatar: this.hashColor(data.data.peer_id)
                }
            });
            this.$nextTick().then(function () {
                this.$refs["messages"].querySelector(".message:last-child").scrollIntoView();
            }.bind(this));
        },

        onRateLimited() {
            this.notify("You have been rate limited", notifType.error);
            this.toggleChat();
        },

        onDispose() {
            this.notify("Room diposed", notifType.error);
            this.toggleChat();
            this.disposed = true;
        },

        // Register chat client events.
        initClient() {
            // On connect, send a request to get the peers list.
            Client.on(Client.MsgType.Connect, this.onConnect);
            Client.on(Client.MsgType.Disconnect, this.onDisconnect);
            Client.on(Client.MsgType.Reconnecting, this.onReconnecting);
            Client.on(Client.MsgType.PeerInfo, this.onPeerSelf);
            Client.on(Client.MsgType.PeerList, (data) => { this.onPeers(data.data); });
            Client.on(Client.MsgType.PeerJoin, (data) => { this.onPeerJoinLeave(data, Client.MsgType.PeerJoin); });
            Client.on(Client.MsgType.PeerLeave, (data) => { this.onPeerJoinLeave(data, Client.MsgType.PeerLeave); });
            Client.on(Client.MsgType.PeerRateLimited, this.onRateLimited);
            Client.on(Client.MsgType.Message, this.onMessage);
            Client.on(Client.MsgType.Typing, this.onTyping);
            Client.on(Client.MsgType.Dispose, this.onDispose);
        },

        initTimers() {
            // Title bar "new activity" animation.
            window.setInterval(() => {
                if (!this.newActivity) {
                    return;
                }
                if (this.newActivityCounter % 2 === 0) {
                    document.title = "[•] " + this.pageTitle;
                } else {
                    document.title = this.pageTitle;
                }
                this.newActivityCounter++;
            }, 2500);
            window.onfocus = () => {
                this.newActivity = false;
                document.title = this.pageTitle;
            };

            // Sweep "typing" statuses at regular intervals.
            window.setInterval(() => {
                let changed = false;
                this.typingPeers.forEach((p) => {
                    if ((p.time + typingDebounceInterval) < Date.now()) {
                        this.typingPeers.delete(p.id);
                        changed = true;
                    }
                });
                if (changed) {
                    this.$forceUpdate();
                }
            }, typingDebounceInterval);
        }
    }
});
