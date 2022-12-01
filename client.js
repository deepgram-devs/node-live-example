let socket;
let mediaRecorder;

console.log("STARTING STREAM");
$(".pause-media-recorder").click(function (e) {
  mediaRecorder.pause();
});

$(".resume-media-recorder").click(function (e) {
  mediaRecorder.resume();
});

$(".state-media-recorder").click(function (e) {
  $(".mr-state-message .message-body").text(mediaRecorder.state);
});

const startStream = () => {
  navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((stream) => {
      mediaRecorder = new MediaRecorder(stream);
      socket = io((options = { transports: ["websocket"] }));
    })
    .then(() => {
      socket.on("connect", async () => {
        console.log("CONNECTED");
        console.log(`Socket ID on Client side: ${socket.id}`);
        if (mediaRecorder.state == "inactive") mediaRecorder.start(500);

        $(".mr-state-message .message-body").text(mediaRecorder.state);

        mediaRecorder.addEventListener("dataavailable", (event) => {
          console.log("SENDING PACKET TO SERVER");
          socket.emit("packet-sent", event.data);
        });

        $(".send-dg-close").click(function (e) {
          socket.emit("dg-close");
          mediaRecorder.pause();
        });

        $(".send-dg-open").click(function (e) {
          mediaRecorder.pause();
          socket.disconnect();
          socket.connect();
          socket.emit("dg-open", { message: "dg-open" }, async (response) =>
            console.log(response)
          );
          setTimeout(() => mediaRecorder.resume(), 1000);
        });
      });
    });
};

startStream();
