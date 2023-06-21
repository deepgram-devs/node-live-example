import path from "path";
import { fileURLToPath } from "url";
import 'dotenv/config'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
app.use(express.static("public/"));
app.get("/", function (req, res) {
  res.sendFile(__dirname + "/index.html");
});
const httpServer = createServer(app);

import pkg from "@deepgram/sdk";
const { Deepgram } = pkg;
let deepgram;
let dgLiveObj;
let io;
// make socket global so we can access it from anywhere
let globalSocket;

// Pull out connection logic so we can call it outside of the socket connection event
const initDgConnection = (disconnect) => {
  dgLiveObj = createNewDeepgramLive(deepgram);
  addDeepgramTranscriptListener(dgLiveObj);
  addDeepgramOpenListener(dgLiveObj);
  addDeepgramCloseListener(dgLiveObj);
  addDeepgramErrorListener(dgLiveObj);
  // clear event listeners
  if (disconnect) {
    globalSocket.removeAllListeners();
  }
  // receive data from client and send to dgLive
  globalSocket.on("packet-sent", async (event) =>
    dgPacketResponse(event, dgLiveObj)
  );
};

const createWebsocket = () => {
  io = new Server(httpServer, { transports: "websocket" });
  io.on("connection", (socket) => {
    console.log(`Connected on server side with ID: ${socket.id}`);
    globalSocket = socket;
    deepgram = createNewDeepgram();
    initDgConnection(false);
  });
};

const createNewDeepgram = () =>
  new Deepgram(process.env.DEEPGRAM_API_KEY);
const createNewDeepgramLive = (dg) =>
  dg.transcription.live({
    language: "en",
    punctuate: true,
    smart_format: true,
    model: "nova",
  });

const addDeepgramTranscriptListener = (dg) => {
  dg.addListener("transcriptReceived", async (dgOutput) => {
    let dgJSON = JSON.parse(dgOutput);
    let utterance;
    try {
      utterance = dgJSON.channel.alternatives[0].transcript;
    } catch (error) {
      console.log(
        "WARNING: parsing dgJSON failed. Response from dgLive is:",
        error
      );
      console.log(dgJSON);
    }
    if (utterance) {
      globalSocket.emit("print-transcript", utterance);
      console.log(`NEW UTTERANCE: ${utterance}`);
    }
  });
};

const addDeepgramOpenListener = (dg) => {
  dg.addListener("open", async (msg) =>
    console.log(`dgLive WEBSOCKET CONNECTION OPEN!`)
  );
};

const addDeepgramCloseListener = (dg) => {
  dg.addListener("close", async (msg) => {
    console.log(`dgLive CONNECTION CLOSED!`);
  });
};

const addDeepgramErrorListener = (dg) => {
  dg.addListener("error", async (msg) => {
    console.log("ERROR MESG", msg);
    console.log(`dgLive ERROR::Type:${msg.type} / Code:${msg.code}`);
  });
};

const dgPacketResponse = (event, dg) => {
  if (dg.getReadyState() === 1) {
    dg.send(event);
  }
};

httpServer.listen(3000);
createWebsocket();
