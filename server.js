const express = require("express");
const http = require("http");
const https = require('https');
const WebSocket = require("ws");
const { createClient, LiveTranscriptionEvents } = require("@deepgram/sdk");
const dotenv = require("dotenv");
dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const deepgramClient = createClient(process.env.DEEPGRAM_API_KEY);
let keepAlive;

// Translation request options
const translationRequestOptions = {
  hostname: 'agw.golinguist.com',
  path: '/linguistnow/resources/v1/translate',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': process.env.LANGUAGE_IO_API_KEY,
  }
};

const setupDeepgram = (ws) => {
  const deepgram = deepgramClient.listen.live({
    language: "en",
    punctuate: true,
    smart_format: true,
    model: "nova",
  });

  if (keepAlive) clearInterval(keepAlive);
  keepAlive = setInterval(() => {
    console.log("deepgram: keepalive");
    deepgram.keepAlive();
  }, 10 * 1000);

  deepgram.addListener(LiveTranscriptionEvents.Open, async () => {
    console.log("deepgram: connected");

    deepgram.addListener(LiveTranscriptionEvents.Transcript, (data) => {
      console.log("deepgram: packet received");
      console.log("deepgram: transcript received");
      sourceLanguageText = data.channel.alternatives[0].transcript
      if (sourceLanguageText) {
        // Code for making the API request to agw.golinguist.com should go here and translation result will be added to `data` object
        const postData = JSON.stringify({
          sourceContent: sourceLanguageText,
          sourceLocale: "en-us",
          targetLocale: "es-ar",
          contentTypeName: "api",
          translationType: "machine",
          textType: "text"
        });

        translationRequestOptions.headers['Content-Length'] = Buffer.byteLength(postData);

        const req = https.request(translationRequestOptions, (res) => {
          let body = '';
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () => {
            try {
              const resp = JSON.parse(body);
              data.translatedTranscript = resp.translatedText;
              console.log("Received translation back: ", resp.translatedText);
              ws.send(JSON.stringify(data));
              console.log("socket: transcript and translation sent to client");
            } catch (e) {
              console.error('Error parsing translation response:', e);
            }
          });
        });

        req.on('error', (error) => {
          console.error('Translation request error:', error);
        });

        req.write(postData);
        req.end();
      } else {
        ws.send(JSON.stringify(data));
        console.log("socket: only transcript sent to client");
      }
      
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
    console.log("socket: client data received");

    if (deepgram.getReadyState() === 1 /* OPEN */) {
      console.log("socket: data sent to deepgram");
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
