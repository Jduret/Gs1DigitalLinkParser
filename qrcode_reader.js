var currentFacingMode = "environment"; // "user" = front, "environment" = back
let currentStream = null;

function closeCamera() {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
    }
    // Remove the stream from the video element
    document.getElementById('video').srcObject = null;
    currentStream = null;
}

async function startCameraById(deviceId) {
    try {
        // Stop any existing stream before starting a new one
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
        }

        const constraints = {
            video: { "deviceId": { exact: deviceId } },
            audio: false
        };

        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log(currentStream);
        document.getElementById("video").srcObject = currentStream;
    } catch (err) {
        alert('unable to start selected device');
    }
}

// Start the camera with the given facing mode
async function startCamera(facingMode) {
    try {
        // Stop any existing stream before starting a new one
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
        }

        const constraints = {
            video: { facingMode: { exact: facingMode } },
            audio: false
        };

        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log(currentStream);
        document.getElementById("video").srcObject = currentStream;
    } catch (err) {
        console.error("Error accessing camera:", err);

        // Fallback: try without exact facingMode if device doesn't support it
        if (err.name === "OverconstrainedError" || err.name === "NotFoundError") {
            console.log('Fallback Camera');
            try {
                const fallbackConstraints = {
                    video: { facingMode: facingMode },
                    audio: false
                };
                currentStream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
                document.getElementById("video").srcObject = currentStream;
            } catch (fallbackErr) {
                console.error("Fallback also failed:", fallbackErr);
                alert("Unable to access the requested camera.");
            }
        } else {
            alert("Camera access error: " + err.message);
        }
    }
}

function bindSwicther(element) {
    // Switch between front and back
    element.addEventListener("click", () => {
        currentFacingMode = currentFacingMode === "user" ? "environment" : "user";
        startCamera(currentFacingMode);
    });
}



async function listCameras() {
    try {
        // Request permission to access at least one camera
        await navigator.mediaDevices.getUserMedia({ video: true });

        // Get the list of all media devices
        const devices = await navigator.mediaDevices.enumerateDevices();

        const cameraList = document.getElementById('cameraList');
        cameraList.innerHTML = ''; // Clear previous list

        // Filter for video input devices (cameras)
        const cameras = devices.filter(device => device.kind === 'videoinput');

        if (cameras.length === 0) {
            cameraList.innerHTML = '<li>No cameras found</li>';
        } else {
            console.log(cameras);
            cameras.forEach((camera, index) => {
                const li = document.createElement('li');
                li.textContent = camera.label || `Camera ${index + 1}`;
                li.dataset.deviceId = camera.deviceId;
                li.onclick = function () {
                    startCameraById(this.dataset.deviceId);
                };
                cameraList.appendChild(li);
            });
        }
    } catch (err) {
        console.error('Error accessing cameras:', err);
        alert('Unable to access cameras. Please allow camera permissions.');
    }
}