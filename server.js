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

let TTS_API = 'https://api.deepgram.com/v1/speak';

async function getTextToSpeech(message, voice){
  // console.log('voice: ', voice)
  const tts_endpoint = TTS_API + '?model='+ voice;
  const response = await fetch(tts_endpoint, {
    method: 'POST',
    headers: {
      'authorization': `token ${process.env.DEEPGRAM_API_KEY}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({text: message})
  });
  return response.blob();
}

// translation constants
const SOURCE_LANGUAGE = "es-es"
// const SOURCE_LANGUAGE = "fr-fr"
// const SOURCE_LANGUAGE = "pr-br-fr"
const TARGET_LANGUAGE = "en-us"

const translationRequestOptions = {
  hostname: 'agw.golinguist.com',
  path: '/linguistnow/resources/v1/translate',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': process.env.LANGUAGE_IO_API_KEY,
  }
};

let is_finals = [];

const setupDeepgram = (ws) => {
  const deepgram = deepgramClient.listen.live({
    language: "es",
    punctuate: true,
    smart_format: true,
    endpointing: 300,
    model: "nova-2",
  });

  if (keepAlive) clearInterval(keepAlive);
  keepAlive = setInterval(() => {
    console.log("deepgram: keepalive");
    deepgram.keepAlive();
  }, 10 * 1000);

  deepgram.addListener(LiveTranscriptionEvents.Open, async () => {
    console.log("deepgram: connected");

    deepgram.addListener(LiveTranscriptionEvents.Transcript, (data) => {
      // console.log("deepgram: packet received");
      console.log('sourceLanguageText:', sourceLanguageText, 'data.speech_final:', data.speech_final, 'data.is_final:',data.is_final)
      if(data.is_final && sourceLanguageText != ''){
        sentence = data.channel.alternatives[0].transcript
        is_finals.push(sentence);
        if (data.speech_final) {
          sourceLanguageText = is_finals.join(" ");
          console.log(`Speech Final: ${utterance}`);
          is_finals = [];
          console.log("deepgram: transcript received: ", sourceLanguageText);
          if (sourceLanguageText) {
            const postData = JSON.stringify({
              sourceContent: sourceLanguageText,
              sourceLocale: SOURCE_LANGUAGE,
              targetLocale: TARGET_LANGUAGE,
              contentTypeName: "api",
              translationType: "machine",
              textType: "text"
            });

            translationRequestOptions.headers['Content-Length'] = Buffer.byteLength(postData);

            let start = performance.now();
            const req = https.request(translationRequestOptions, (res) => {
              let body = '';
              res.on('data', (chunk) => {
                body += chunk;
              });
              res.on('end', () => {
                try {
                  let end = performance.now();
                  let duration = end - start;
                  console.log('Translation Took: '+parseInt(duration)+'ms')
                  const resp = JSON.parse(body);
                  data.translatedTranscript = resp.translatedText;
                  console.log("Received translation back: ", resp.translatedText);
                  ws.send(JSON.stringify(data));
                  // console.log("socket: transcript and translation sent to client");
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
            // console.log("socket: only transcript sent to client");
          }
        }

      } else {
        // These are useful if you need real time captioning and update what the Interim Results produced
        console.log(`Is Final: ${sentence}`);
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
      // console.log("deepgram: packet received");
      // console.log("deepgram: metadata received");
      // console.log("ws: metadata sent to client");
      ws.send(JSON.stringify({ metadata: data }));
    });
  });

  return deepgram;
};

wss.on("connection", (ws) => {
  console.log("socket: client connected");
  let deepgram = setupDeepgram(ws);

  ws.on("message", (message) => {
    // console.log("socket: client data received");

    if (deepgram.getReadyState() === 1 /* OPEN */) {
      // console.log("socket: data sent to deepgram");
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

app.get("/speak", async (req, res) => {
  console.log('Speak');
  // Respond with error if no API Key set
  if(!process.env.DEEPGRAM_API_KEY){
    res.status(500).send({ err: 'No DEEPGRAM_API_KEY set in the .env file' });
    return;
  }
  let text = req.query.text;
  let voice = req.query.voice;

  try {
    let start = performance.now();
    let response = await getTextToSpeech(text, voice);
    let end = performance.now();
    let duration = end - start;
    console.log('Text to Speech Took: '+parseInt(duration)+'ms')

    res.type(response.type)
    response.arrayBuffer().then((buf) => {
        res.send(Buffer.from(buf))
    });
  } catch (err) {
    console.log(err);
    res.status(500).send({ err: err.message ? err.message : err });
  }
});

server.listen(3000, () => {
  console.log("Server is listening on port 3000");
});
