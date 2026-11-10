/* Messages between the control and projector windows, through the server,
   so they work across computers on the same Wi-Fi (not just between tabs of one browser).

   const relay = TableRelay(function (message) { ... });   // hears every other window
   relay.post({ type: "show", state: ... });
   relay.onConnect = function () {};                        // (re)connected to the server */
(function () {
  "use strict";

  window.TableRelay = function (onMessage) {
    const myId = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const relay = { onConnect: null, id: myId };
    const events = new EventSource("/api/events");

    events.onopen = function () {

      if (relay.onConnect) {
        relay.onConnect();
      }
    };

    events.onmessage = function (event) {
      let message;

      try {
        message = JSON.parse(event.data);
      } catch (error) {
        return;
      }

      // ignore our own echo
      if (message.from === myId) {
        return;
      }

      onMessage(message);
    };

    relay.post = function (message) {
      const body = JSON.stringify(Object.assign({ from: myId }, message));
      fetch("/api/relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body,
        keepalive: true,
      }).catch(function () {});
    };

    return relay;
  };
})();
