const captions = window.document.getElementById("captions");
const translatedCaptions = window.document.getElementById("translated-captions");
const apiOrigin = "http://localhost:3000";
let audioQueue = [];
let textQueue = [];
let isPlaying = false;

async function updateAudioAndText(originalText, translatedText, voice, startTime) {
  let response = await getAudioForText(translatedText, voice);
  let data = await response.blob();
  const url = URL.createObjectURL(data);

  audioQueue.push({ url, startTime });
  textQueue.push({ originalText, translatedText, startTime });
  playNextAudioAndText();
}

async function getAudioForText(text, voice) {
  const url = apiOrigin + '/speak?text=' + text + '&voice=' + voice;
  return await fetch(url);
}

function playNextAudioAndText() {
  if (isPlaying || audioQueue.length === 0) return;

  // Sort queues by startTime
  audioQueue.sort((a, b) => a.startTime - b.startTime);
  textQueue.sort((a, b) => a.startTime - b.startTime);

  isPlaying = true;
  const { url } = audioQueue.shift();
  const { originalText, translatedText } = textQueue.shift();
  const audioElm = document.createElement('audio');
  audioElm.setAttribute('controls', '');
  audioElm.setAttribute('autoplay', 'true');
  audioElm.src = url;

  audioElm.onended = () => {
    isPlaying = false;
    playNextAudioAndText();
  };

  audio_file.innerHTML = '';
  audio_file.appendChild(audioElm);
  audioElm.play();

  // Update captions
  captions.innerHTML = originalText ? `<span>${originalText}</span>` : "";
  translatedCaptions.innerHTML = translatedText ? `<span>${translatedText}</span>` : "";
}

async function getMicrophone() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return new MediaRecorder(stream);
  } catch (error) {
    console.error("Error accessing microphone:", error);
    throw error;
  }
}

async function openMicrophone(microphone, socket) {
  return new Promise((resolve) => {
    microphone.onstart = () => {
      console.log("WebSocket connection opened");
      document.body.classList.add("recording");
      resolve();
    };

    microphone.onstop = () => {
      console.log("WebSocket connection closed");
      document.body.classList.remove("recording");
    };

    microphone.ondataavailable = (event) => {
      if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
        socket.send(event.data);
      }
    };

    microphone.start(200);
  });
}

async function closeMicrophone(microphone) {
  microphone.stop();
}

async function start(socket) {
  const listenButton = document.querySelector("#record");
  let microphone;

  console.log("client: waiting to open microphone");

  listenButton.addEventListener("click", async () => {
    if (!microphone) {
      try {
        microphone = await getMicrophone();
        await openMicrophone(microphone, socket);
      } catch (error) {
        console.error("Error opening microphone:", error);
      }
    } else {
      await closeMicrophone(microphone);
      microphone = undefined;
    }
  });
}

window.addEventListener("load", () => {
  const socket = new WebSocket("ws://localhost:3000");

  socket.addEventListener("open", async () => {
    console.log("WebSocket connection opened");
    await start(socket);
  });

  socket.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    const originalTranscript = data.channel.alternatives[0].transcript;
    const startTime = data.start;
    if (originalTranscript !== "") {
      updateAudioAndText(originalTranscript, data.translatedTranscript, 'aura-asteria-en', startTime);
    }
  });

  socket.addEventListener("close", () => {
    console.log("WebSocket connection closed");
  });
});
