let socket;
let mediaRecorder;

window.addEventListener("load", function () {
  navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((stream) => {
      mediaRecorder = new MediaRecorder(stream);
      socket = io((options = { transports: ["websocket"] }));
    })
    .then(() => {
      socket.on("connect", async () => {
        if (mediaRecorder.state == "inactive") mediaRecorder.start(500);

        mediaRecorder.addEventListener("dataavailable", (event) => {
          socket.emit("packet-sent", event.data);
        });

        socket.addEventListener("print-transcript", (msg) => {
          document.getElementById("message-body").innerText += "\n" + msg;
        });
      });
    });
});
