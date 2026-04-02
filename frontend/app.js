console.log("app.js loaded");

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const angleEl = document.getElementById("angle");
const repsEl = document.getElementById("reps");

canvas.width = 640;
canvas.height = 480;

// Limit API calls
let lastSent = 0;
const SEND_INTERVAL = 200; // 5 requests per second

const pose = new Pose({
    locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
});

pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    enableSegmentation: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

pose.onResults(onResults);

const camera = new Camera(video, {
    onFrame: async () => {
        await pose.send({ image: video });
    },
    width: 640,
    height: 480
});

camera.start();

async function onResults(results) {

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

    if (!results.poseLandmarks) return;

    drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, {
        color: "#00FF00",
        lineWidth: 4
    });

    drawLandmarks(ctx, results.poseLandmarks, {
        color: "#FF0000",
        lineWidth: 2
    });

    const shoulder = results.poseLandmarks[12];
    const elbow = results.poseLandmarks[14];
    const wrist = results.poseLandmarks[16];

    if (!shoulder || !elbow || !wrist) return;

    const now = Date.now();
    if (now - lastSent < SEND_INTERVAL) return;

    lastSent = now;

    // Localhost API URL
    const API_URL = "http://127.0.0.1:8000/analyze";

    try {
        const res = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                shoulder: {
                    x: shoulder.x,
                    y: shoulder.y,
                    z: shoulder.z,
                    visibility: shoulder.visibility
                },
                elbow: {
                    x: elbow.x,
                    y: elbow.y,
                    z: elbow.z,
                    visibility: elbow.visibility
                },
                wrist: {
                    x: wrist.x,
                    y: wrist.y,
                    z: wrist.z,
                    visibility: wrist.visibility
                }
            })
        });

        const data = await res.json();

        angleEl.textContent = data.angle.toFixed(1);
        repsEl.textContent = data.reps;

    } catch (err) {
        console.error("API error:", err);
    }
}
