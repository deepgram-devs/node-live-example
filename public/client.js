const captions = window.document.getElementById("captions");
const translatedCaptions = window.document.getElementById("translated-captions");
const apiOrigin = "http://localhost:3000";

async function updateAudio(text, voice){
  audioElm = document.createElement('audio');
  audioElm.setAttribute('controls', '');
  audioElm.setAttribute('autoplay', 'true');
  let source = document.createElement('source');

  let response = await getAudioForText(text, voice);
  let data = await response.blob();
  const url = URL.createObjectURL(data);
  source.setAttribute('src', url);

  source.setAttribute('type', 'audio/mp3');

  audioElm.appendChild(source);

  audio_file.innerHTML = '';
  audio_file.appendChild(audioElm);
  audioElm.play();
}

async function getAudioForText(text, voice){
  const url = apiOrigin + '/speak?text=' + text + '&voice=' + voice;

  return await fetch(url)
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

    microphone.start(1000);
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
    const transcript = data.channel.alternatives[0].transcript;
    if (transcript !== "") {
      updateAudio(data.translatedTranscript, 'aura-asteria-en');
      captions.innerHTML = data
        ? `<span>${transcript}</span>`
        : "";
      translatedCaptions.innerHTML = data
        ? `<span>${data.translatedTranscript}</span>`
        : "";
    }
  });

  socket.addEventListener("close", () => {
    console.log("WebSocket connection closed");
  });
});
