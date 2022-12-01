// import * as dotenv from "dotenv";
// dotenv.config({ path: "~/.env" });
// console.log("process", process.env.DEEPGRAM_API_KEY);
import path from "path";
import { fileURLToPath } from "url";

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
let globalSocket;

const initDgConnection = (disconnect) => {
  dgLiveObj = createNewDeepgramLive(deepgram);
  addDeepgramTranscriptListener(dgLiveObj);
  addDeepgramOpenListener(dgLiveObj);
  addDeepgramCloseListener(dgLiveObj);
  addDeepgramErrorListener(dgLiveObj);
  if (disconnect) {
    globalSocket.removeAllListeners();
  }

  globalSocket.on("dg-close", async (msg) =>
    dgLiveObj.send(JSON.stringify({ type: "CloseStream" }))
  );
  globalSocket.on("dg-open", async (msg, callback) =>
    dgReopen(msg).then((status) => callback(status))
  );
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

const createNewDeepgram = () => new Deepgram("YOUR_API_KEY");
const createNewDeepgramLive = (dg) =>
  dg.transcription.live({ punctuate: true });

const addDeepgramTranscriptListener = (dg) => {
  console.log("addDeepgramTranscriptListener");
  dg.addListener("transcriptReceived", async (dgOutput) => {
    console.log("transcriptReceived listener event");
    let dgJSON = JSON.parse(dgOutput);
    let utterance;
    try {
      console.log(dgJSON.metadata.request_id);
      utterance = dgJSON.channel.alternatives[0].transcript;
    } catch (error) {
      console.log("WARNING: parsing dgJSON failed. Response from dgLive is:");
      console.log(dgJSON);
    }
    if (utterance) console.log(`NEW UTTERANCE: ${utterance}`);
  });
};

const addDeepgramOpenListener = (dg) => {
  dg.addListener("open", async (msg) =>
    console.log(`dgLive WEBSOCKET CONNECTION OPEN!`)
  );
};

const addDeepgramCloseListener = (dg) => {
  dg.addListener("close", async (msg) =>
    console.log(`dgLive CONNECTION CLOSED!`)
  );
};

const addDeepgramErrorListener = (dg) => {
  dg.addListener("error", async (msg) =>
    console.log(`dgLive ERROR::Type:${msg.type} / Code:${msg.code}`)
  );
};

const dgReopen = async (msg) => {
  console.log(`Reopen message is: ${msg.message}`);
  initDgConnection(true);

  return "let's go!";
};

const dgPacketResponse = (event, dg) => {
  if (dg.getReadyState() === 1) {
    dg.send(event);
  }
};

httpServer.listen(3000);
createWebsocket();
