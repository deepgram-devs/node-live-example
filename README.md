# Deepgram Live Transcriptions Example (Node.js)

ALPHA

This is a basic express server that shows the basic setup for live audio transcriptions using Deepgram.

The code can be found in the following places:

- Client side code: [/public/client.js](/public/client.js)
- HTML: [/public/index.html](/index.html)
- Server side code: [/server.js](/server.js)

## Client code

This code gets access to the users microphone which will be used as the audio input. Once data is available from the microphone, it gets sent to the server via websocket.

When data comes back from the server on the `data` event, it takes the text and adds it to the body.

## Server code

The server code creates a new web socket called `globalSocket` that communicates with the client. When data comes in from the client it then sends that data to Deepgram via the SDK. (Note that the Deepgram SDK is just setting up a websocket connection with Deepgram).

## Running the application locally

Create a `.env` file with your own Deepgram API Key.

Run the following commands to install the dependencies and run the application

```
npm i
npm run start
```

## Accessing the running application in your browser

Once the server is running, open the following url in the browser

```
http://localhost:3000/
```

Click on the button when you're ready to transcribe.
