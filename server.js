const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const { createClient, LiveTranscriptionEvents } = require("@deepgram/sdk");
const dotenv = require("dotenv");
dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const options = {
  global: {
    url: "api.deepgram.com", // Set the desired URL here
  }
};
const deepgramClient = createClient(process.env.DEEPGRAM_API_KEY, options);
let keepAlive;

let previousTimestamp = Date.now();

let is_finals = [];

const min_empty_interim_results = 1;
const no_word_timeout = 0.4;
let empty_interim_result_count = 0;
let last_transcript = ''
let last_word_timestamp = 0;

function resetState(clearLastTranscript){
  is_finals = [];
  empty_interim_result_count = 0;
  if(clearLastTranscript){
    last_transcript = '';
  }
}

function logElapsedTime() {
  const currentTimestamp = Date.now();
  const elapsed = currentTimestamp - previousTimestamp;
  console.log(`Milliseconds elapsed: ${elapsed}`);
  previousTimestamp = currentTimestamp; // Update the previous timestamp
}

const setupDeepgram = (ws) => {
  const deepgram = deepgramClient.listen.live({
    model: "nova-2-general",
    language: "en",
    // smart_format: true,
    interim_results: true,
  });

  if (keepAlive) clearInterval(keepAlive);
  keepAlive = setInterval(() => {
    console.log("deepgram: keepalive");
    deepgram.keepAlive();
  }, 10 * 1000);

  deepgram.addListener(LiveTranscriptionEvents.Open, async () => {
    console.log("deepgram: connected");

    deepgram.addListener(LiveTranscriptionEvents.Transcript, (data) => {
      const transcript = data.channel.alternatives[0].transcript;
      const words = data.channel.alternatives[0].words;
      const start = data.start;
      const duration = data.duration;
      const transcript_cursor = start + duration;

      if(data.from_finalize){
        console.log('From Finalize: ', transcript);
        logElapsedTime();
        last_transcript = '';
        return;
      }
      // Save the last word timestamp
      if(words.length > 0){
        last_word_timestamp = words.slice(-1)[0].end;
      }
      if(last_transcript !== transcript && transcript !== ''){
        last_transcript = transcript;
        empty_interim_result_count = 0;
      } else {
        empty_interim_result_count++;
      }

      
      if(data.is_final) {
        is_finals.push(transcript);
        if(data.speech_final){
          const utterance = is_finals.join(' ');
          console.log('Speech Final: ', utterance);
          resetState(false);
        } else {
          last_transcript = '';
          empty_interim_result_count = 0;
          console.log('  Is Final: ', transcript);
        }
      } else {
        console.log('    Interim: ', transcript);
        const time_since_last_word = transcript_cursor - last_word_timestamp;
        // console.log(`    Time Since Last Word: ${time_since_last_word}, Last Word: ${last_word_timestamp}, Transcript Cursor: ${transcript_cursor}`);
        const has_words = is_finals.join(' ') != '' || transcript != '';
        // Do we have any words?
        if(has_words) {
          // console.log('Has words');
          // Do we have enough empty interim results to consider this an EOT?
          if(empty_interim_result_count >= min_empty_interim_results){
            // console.log('empty_interim_result_count: ', empty_interim_result_count);
            // Do we have a timeout since the last word?
            if (time_since_last_word >= no_word_timeout) {

              // Send a finalize message to Deepgram to finalize the interim results
              deepgram.send(JSON.stringify({'type': 'Finalize'}));
              const utterance = is_finals.join(' ') + ' ' + transcript;
              console.log(`Client Side EOT: ${utterance} time_since_last_word: ${time_since_last_word*1000}ms`);
              previousTimestamp = Date.now();
              
              // Reset the state
              resetState(true);
            }
          }
        }
      }

      ws.send(JSON.stringify(data));
    });

    deepgram.addListener(LiveTranscriptionEvents.Close, async () => {
      console.log("deepgram: disconnected");
      clearInterval(keepAlive);
      deepgram.finish();
    });

    deepgram.addListener(LiveTranscriptionEvents.Error, async (error) => {
      console.log("deepgram: error received");
      console.error(error);
    });

    deepgram.addListener(LiveTranscriptionEvents.Warning, async (warning) => {
      console.log("deepgram: warning received");
      console.warn(warning);
    });

    deepgram.addListener(LiveTranscriptionEvents.Metadata, (data) => {
      console.log("deepgram: packet received");
      console.log("deepgram: metadata received");
      console.log("ws: metadata sent to client");

      ws.send(JSON.stringify({ metadata: data }));
    });
  });

  return deepgram;
};

wss.on("connection", (ws) => {
  console.log("socket: client connected");
  let deepgram = setupDeepgram(ws);

  ws.on("message", (message) => {

    if (deepgram.getReadyState() === 1 /* OPEN */) {
      deepgram.send(message);
    } else if (deepgram.getReadyState() >= 2 /* 2 = CLOSING, 3 = CLOSED */) {
      console.log("socket: data couldn't be sent to deepgram");
      console.log("socket: retrying connection to deepgram");
      /* Attempt to reopen the Deepgram connection */
      deepgram.finish();
      deepgram.removeAllListeners();
      deepgram = setupDeepgram(socket);
    } else {
      console.log("socket: data couldn't be sent to deepgram");
    }
  });

  ws.on("close", () => {
    console.log("socket: client disconnected");
    deepgram.finish();
    deepgram.removeAllListeners();
    deepgram = null;
  });
});

app.use(express.static("public/"));
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

server.listen(3000, () => {
  console.log("Server is listening on port 3000");
});
