// Vigil1 Wildlife Monitoring Dashboard
// Data sourced from Firebase Realtime Database

// Configuration
const NUM_DEVICES = 1;
const UPDATE_INTERVAL = 5000; // 5 seconds
const ACTIVITY_LOG_MAX = 50;
const FIREBASE_RTDB_URL = 'https://vigil1-default-rtdb.firebaseio.com/';

// Wildlife types that can be detected
const ANIMAL_TYPES = [
    'Lion', 'Elephant', 'Rhino', 'Giraffe', 'Zebra', 
    'Leopard', 'Buffalo', 'Cheetah', 'Hyena', 'Wildebeest'
];

// Person types
const PERSON_TYPES = {
    POACHER: 'Poacher',
    RANGER: 'Ranger',
    NONE: null
};

// GPS coordinates for Nyamuswa Ranch, Chinhoyi, Zimbabwe
const BASE_LAT = -17.351880;
const BASE_LNG = 30.206747;
const GPS_RANGE = 0.08; // Reduced range to keep devices within ranch vicinity

// User location (fallback if Firebase has no location)
let userLat = BASE_LAT;
let userLng = BASE_LNG;

// Global state
let devices = [];
let map = null;
let markers = {};
let activityLog = [];
let firebaseConnectionState = 'unknown'; // 'connected' | 'disconnected' | 'demo'
let audioContext = null;
let lastAlertTime = 0; // Prevent alert spam
let dataLogs = []; // Store all Firebase data logs
const MAX_LOG_ENTRIES = 1000; // Maximum number of log entries to keep in memory

// Device class to represent Raspberry Pi 5 units (simplified for Firebase data)
class FieldDevice {
    constructor(data) {
        this.id = data.id || 'unknown';
        this.lat = (data.lat !== undefined && data.lat !== null) ? data.lat : BASE_LAT;
        this.lng = (data.lng !== undefined && data.lng !== null) ? data.lng : BASE_LNG;
        this.status = data.status || 'offline';
        this.lastUpdate = data.lastUpdate ? new Date(data.lastUpdate) : new Date();
        this.detectedAnimal = data.detectedAnimal || null;
        this.detectedPerson = data.detectedPerson || null;
        this.batteryLevel = data.batteryLevel || 75;
        this.confidence = data.confidence || 0;
        // New fields from Firebase
        this.humanCount = data.humanCount || 0;
        this.blePresent = data.blePresent || false;
        this.bleRssi = data.bleRssi || "None";
        this.bleLastSeen = data.bleLastSeen || "None";
    }
    
    getAlertLevel() {
        if (this.detectedPerson === PERSON_TYPES.POACHER) return 'alert';
        if (this.detectedPerson === PERSON_TYPES.RANGER) return 'ranger';
        if (this.detectedAnimal) return 'animal';
        return 'normal';
    }
}

// Get user location from browser
function getUserLocation() {
    if (navigator.geolocation) {
        console.log('📍 Requesting user location...');
        navigator.geolocation.getCurrentPosition(
            (position) => {
                userLat = position.coords.latitude;
                userLng = position.coords.longitude;
                console.log(`✓ User location obtained: ${userLat}, ${userLng}`);
                
                // If we have devices that are using the default location, update them
                // This is a simple way to refresh the view if the location comes in late
                if (devices.length > 0 && devices[0].lat === BASE_LAT && devices[0].lng === BASE_LNG) {
                    console.log('🔄 Updating existing devices with user location');
                    pollFirebaseAndUpdate();
                }
            },
            (error) => {
                console.warn(`⚠ Could not get user location: ${error.message}. Using default: ${BASE_LAT}, ${BASE_LNG}`);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    } else {
        console.warn('⚠ Geolocation is not supported by this browser.');
    }
}

// Initialize devices
function initializeDevices() {
    // If a Firebase RTDB URL is provided, we'll fetch real devices there.
    // Otherwise, fall back to the simulated devices.
    devices = [];
    // Only create RPI5-001
    devices.push(new FieldDevice({ id: 'RPI5-001', status: 'offline' }));
}

// Fetch devices from Firebase Realtime Database
async function fetchDevicesFromFirebase() {
    if (!window.firebaseDatabase) {
        console.error('Firebase not initialized yet, waiting...');
        setFirebaseStatus('disconnected', 'Firebase initializing...');
        return null;
    }
    try {
        // Read from 'wildeye' path in Firebase
        const dbRef = window.firebaseRef(window.firebaseDatabase, 'wildeye');
        const snapshot = await window.firebaseGet(dbRef);
        if (snapshot.exists()) {
            const data = snapshot.val();
            console.log('✓ Firebase data received:', data);
            console.log('  - animal:', data.animal);
            console.log('  - human:', data.human);
            console.log('  - role:', data.role);
            console.log('  - human_count:', data.human_count);
            console.log('  - ble_present:', data.ble_present);
            console.log('  - timestamp:', data.timestamp);
            console.log('  - lat/latitude:', data.lat, data.latitude);
            console.log('  - lng/longitude:', data.lng, data.longitude);
            
            // Map Firebase fields to device data
            let detectedAnimal = null;
            if (data.animal && data.animal !== "None" && data.animal !== "") {
                detectedAnimal = data.animal;
                console.log('✓ Animal detected:', detectedAnimal);
            }
            
            // Use the 'role' field to determine person type (poacher or ranger)
            let detectedPerson = null;
            if (data.role && data.role !== "None" && data.role !== "") {
                const roleLower = String(data.role).toLowerCase();
                if (roleLower.includes('poacher') || roleLower === 'poacher') {
                    detectedPerson = PERSON_TYPES.POACHER;
                    console.log('🚨 POACHER detected via role field!');
                } else if (roleLower.includes('ranger') || roleLower === 'ranger') {
                    detectedPerson = PERSON_TYPES.RANGER;
                    console.log('✓ Ranger detected via role field');
                }
            }
            
            // Fallback: Check human field if role is not set
            if (!detectedPerson && data.human && data.human !== "None" && data.human !== "") {
                const humanLower = String(data.human).toLowerCase();
                if (humanLower.includes('poacher')) {
                    detectedPerson = PERSON_TYPES.POACHER;
                    console.log('🚨 POACHER detected via human field!');
                } else if (humanLower.includes('ranger')) {
                    detectedPerson = PERSON_TYPES.RANGER;
                    console.log('✓ Ranger detected via human field');
                }
            }
            
            // Parse coordinates - handle both string and number formats
            let lat = userLat;
            let lng = userLng;
            
            // Helper to parse coordinate
            const parseCoord = (val) => {
                if (val === undefined || val === null) return null;
                const parsed = typeof val === 'string' ? parseFloat(val) : val;
                return isNaN(parsed) ? null : parsed;
            };

            const firebaseLat = parseCoord(data.lat) ?? parseCoord(data.latitude);
            const firebaseLng = parseCoord(data.lng) ?? parseCoord(data.longitude);

            if (firebaseLat !== null) lat = firebaseLat;
            if (firebaseLng !== null) lng = firebaseLng;

            console.log(`  - Location resolved: ${lat}, ${lng} (Source: ${firebaseLat !== null ? 'Firebase' : 'Fallback/User'})`);
            
            // Parse timestamp
            let rawTs = data.timestamp ?? data.time ?? data.ts ?? new Date().toISOString();
            
            // Handle numeric strings (e.g. "1715..." as string)
            if (typeof rawTs === 'string' && !isNaN(rawTs) && !rawTs.includes(':') && !rawTs.includes('-')) {
                rawTs = Number(rawTs);
            }

            let lastUpdate;
            if (typeof rawTs === 'number') {
                // If seconds (10 digits) convert to ms, otherwise assume ms
                // Threshold 1e11 handles dates after 1973 for ms timestamps
                lastUpdate = new Date(rawTs > 1e11 ? rawTs : rawTs * 1000);
            } else {
                lastUpdate = new Date(rawTs);
            }
            
            if (isNaN(lastUpdate.getTime())) {
                console.warn('  - Invalid timestamp parsed, defaulting to NOW');
                lastUpdate = new Date();
            }

            // Consider device online if data is at most 5 minutes old (increased tolerance)
            const ageMs = Date.now() - lastUpdate.getTime();
            const isUpToDate = ageMs <= 300_000; // 5 minutes
            const status = isUpToDate ? 'online' : 'offline';
            
            console.log(`  - Time check debug: rawTs=${rawTs} (${typeof rawTs})`);
            console.log(`  - Parsed: ${lastUpdate.toLocaleString()} vs Now: ${new Date().toLocaleString()}`);
            console.log(`  - Age: ${Math.round(ageMs/1000)}s. Threshold: 300s. Status: ${status}`);

            const deviceData = {
                id: 'RPI5-001',
                lat: lat,
                lng: lng,
                detectedAnimal: detectedAnimal,
                detectedPerson: detectedPerson,
                humanCount: data.human_count || 0,
                blePresent: data.ble_present || false,
                bleRssi: data.ble_rssi || "None",
                bleLastSeen: data.ble_last_seen || "None",
                confidence: (typeof data.confidence === 'number') ? data.confidence : 85,
                batteryLevel: 100, // Always show 100% as requested
                status: status,
                lastUpdate: lastUpdate.toISOString()
            };
            
            console.log('✓ Mapped device data:', deviceData);
            setFirebaseStatus('connected', 'Firebase Connected');
            return [deviceData];
        } else {
            console.log('⚠ No data available in /wildeye path');
            setFirebaseStatus('disconnected', 'No data in Firebase');
            return [];
        }
    } catch (err) {
        console.error('❌ Failed to fetch devices from Firebase:', err);
        setFirebaseStatus('disconnected', 'Firebase fetch failed: ' + err.message);
        return null;
    }
}

// Poll Firebase and update UI
async function pollFirebaseAndUpdate() {
    const fetched = await fetchDevicesFromFirebase();
    if (!fetched || fetched.length === 0) {
        // If fetch failed or no data, keep existing devices or show disconnected state
        console.log('⚠ No Firebase data, keeping existing state');
        if (devices.length === 0) {
            // Initialize with one offline device so UI shows something
            devices = [new FieldDevice({ id: 'RPI5-001', status: 'offline' })];
        }
        renderDeviceCards();
        updateStatistics();
        return;
    }

    // Convert to FieldDevice instances
    const previousDevices = [...devices];
    const newDevices = fetched.map(data => new FieldDevice(data));

    // Check for changes to log activities
    newDevices.forEach(device => {
        const previous = previousDevices.find(d => d.id === device.id);
        
        if (!previous) {
            addActivity(device, 'info', 'Device came online');
            // Check if coming online with poacher already detected
            if (device.detectedPerson === PERSON_TYPES.POACHER) {
                playPoacherAlert();
            }
        } else {
            // Log significant changes
            if (device.detectedPerson === PERSON_TYPES.POACHER && previous.detectedPerson !== PERSON_TYPES.POACHER) {
                addActivity(device, 'alert', '🚨 POACHER DETECTED! Immediate response required.');
                playPoacherAlert(); // Play alert sound
            } else if (device.detectedPerson === PERSON_TYPES.RANGER && previous.detectedPerson !== PERSON_TYPES.RANGER) {
                addActivity(device, 'ranger', 'Ranger detected on patrol.');
            } else if (device.detectedAnimal && device.detectedAnimal !== previous.detectedAnimal) {
                addActivity(device, 'animal', `${device.detectedAnimal} detected nearby.`);
            }
        }
        
        updateMarker(device);
    });

    devices = newDevices;
    renderDeviceCards();
    updateStatistics();
}

// Update Firebase status UI
function setFirebaseStatus(state, message) {
    firebaseConnectionState = state;
    const el = document.getElementById('firebaseStatus');
    const text = document.getElementById('firebaseStatusText');
    if (!el || !text) return;

    el.classList.remove('firebase-connected', 'firebase-disconnected', 'firebase-demo');
    if (state === 'connected') {
        el.classList.add('firebase-connected');
        text.textContent = message || 'Firebase Connected';
    } else if (state === 'disconnected') {
        el.classList.add('firebase-disconnected');
        text.textContent = message || 'Firebase Disconnected';
    } else {
        el.classList.add('firebase-demo');
        text.textContent = message || 'Demo Mode';
    }
}

// Initialize map
function initializeMap() {
    map = L.map('map').setView([BASE_LAT, BASE_LNG], 11);
    
    // Google Maps Satellite layer
    L.tileLayer('http://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution: '© Google Maps'
    }).addTo(map);
    
    // Add markers for each device
    devices.forEach(device => {
        updateMarker(device);
    });
}

// Update or create map marker
function updateMarker(device) {
    const alertLevel = device.getAlertLevel();
    let markerColor = 'blue';
    let icon = '📍';
    
    // If device is offline, show gray marker
    if (device.status === 'offline') {
        markerColor = 'gray';
        icon = '⚫';
    } else if (alertLevel === 'alert') {
        markerColor = 'red';
        icon = '🔴';
    } else if (alertLevel === 'ranger') {
        markerColor = 'green';
        icon = '🟢';
    } else if (alertLevel === 'animal') {
        markerColor = 'orange';
        icon = '🦁';
    }
    
 
    if (markers[device.id]) {
        map.removeLayer(markers[device.id]);
    }
    
    // Create custom icon
    const customIcon = L.divIcon({
        html: `<div style="font-size: 24px;">${icon}</div>`,
        className: 'custom-marker',
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });
    
    // Create new marker
    const marker = L.marker([device.lat, device.lng], { icon: customIcon }).addTo(map);
    
    // Create popup content with color-coded status
    const statusColor = device.status === 'online' ? '#10b981' : '#ef4444';
    const statusText = device.status === 'online' ? 'Online' : 'Offline';
    const isOffline = device.status === 'offline';
    
    let popupContent = `
        <div style="font-family: Arial; min-width: 200px;">
            <h3 style="margin: 0 0 10px 0; color: #1f2937;">${device.id}</h3>
            <p style="margin: 5px 0;"><strong>Status:</strong> <span style="color: ${statusColor};">${statusText}</span></p>
            <p style="margin: 5px 0;"><strong>GPS:</strong> ${device.lat.toFixed(4)}, ${device.lng.toFixed(4)}</p>
    `;
    
    if (!isOffline) {
        if (device.detectedAnimal) {
            popupContent += `<p style="margin: 5px 0; color: #f59e0b;"><strong>🦁 Animal:</strong> ${device.detectedAnimal}</p>`;
        }
        
        if (device.detectedPerson === PERSON_TYPES.POACHER) {
            popupContent += `<p style="margin: 5px 0; color: #ef4444;"><strong>⚠️ POACHER DETECTED!</strong></p>`;
        } else if (device.detectedPerson === PERSON_TYPES.RANGER) {
            popupContent += `<p style="margin: 5px 0; color: #10b981;"><strong>✓ Ranger:</strong> Present</p>`;
        }
        
        if (device.humanCount > 0) {
            popupContent += `<p style="margin: 5px 0;"><strong>👥 Human Count:</strong> ${device.humanCount}</p>`;
        }
        
        if (device.blePresent) {
            const bleRssiValue = device.bleRssi !== "None" ? `${device.bleRssi} dBm` : "N/A";
            popupContent += `<p style="margin: 5px 0; color: #3b82f6;"><strong>📡 BLE Device:</strong> Present (${bleRssiValue})</p>`;
        }
    }
    
    if (device.confidence > 0) {
        popupContent += `<p style="margin: 5px 0;"><strong>Confidence:</strong> ${device.confidence.toFixed(1)}%</p>`;
    }
    
    popupContent += `
            <p style="margin: 5px 0;"><strong>Battery:</strong> ${device.batteryLevel.toFixed(0)}%</p>
            <p style="margin: 5px 0; font-size: 0.85em; color: #6b7280;">Last update: ${device.lastUpdate.toLocaleTimeString()}</p>
        </div>
    `;
    
    marker.bindPopup(popupContent);
    markers[device.id] = marker;
}

// Render device cards
function renderDeviceCards() {
    const deviceList = document.getElementById('deviceList');
    deviceList.innerHTML = '';
    
    devices.forEach(device => {
        const alertLevel = device.getAlertLevel();
        const card = document.createElement('div');
        card.className = `device-card ${alertLevel}`;
        
        // Check if device is offline to hide detection values
        const isOffline = device.status === 'offline';
        
        let detectionHTML = '';
        if (!isOffline) {
            if (device.detectedAnimal) {
                detectionHTML = `
                    <div class="info-row">
                        <span class="info-icon">🦁</span>
                        <span class="info-label">Animal:</span>
                        <span class="info-value">${device.detectedAnimal} (${device.confidence.toFixed(0)}%)</span>
                    </div>
                `;
            } else {
                detectionHTML = `
                    <div class="info-row">
                        <span class="info-icon">🦁</span>
                        <span class="info-label">Animal:</span>
                        <span class="info-value">None detected</span>
                    </div>
                `;
            }
        }
        
        let personHTML = '';
        if (!isOffline) {
            if (device.detectedPerson === PERSON_TYPES.POACHER) {
                personHTML = `
                    <div class="info-row">
                        <span class="info-icon">⚠️</span>
                        <span class="info-label">Person:</span>
                        <span class="info-value"><span class="alert-badge">POACHER DETECTED!</span></span>
                    </div>
                `;
            } else if (device.detectedPerson === PERSON_TYPES.RANGER) {
                personHTML = `
                    <div class="info-row">
                        <span class="info-icon">👮</span>
                        <span class="info-label">Person:</span>
                        <span class="info-value"><span class="ranger-badge">Ranger</span></span>
                    </div>
                `;
            } else {
                personHTML = `
                    <div class="info-row">
                        <span class="info-icon">👤</span>
                        <span class="info-label">Person:</span>
                        <span class="info-value">None detected</span>
                    </div>
                `;
            }
        }
        
        // Human count HTML (only show if online and count > 0)
        let humanCountHTML = '';
        if (!isOffline && device.humanCount > 0) {
            humanCountHTML = `
                <div class="info-row">
                    <span class="info-icon">👥</span>
                    <span class="info-label">Human Count:</span>
                    <span class="info-value">${device.humanCount}</span>
                </div>
            `;
        }
        
        // BLE status HTML (only show if online and BLE device present)
        let bleHTML = '';
        if (!isOffline && device.blePresent) {
            const bleRssiValue = device.bleRssi !== "None" ? `${device.bleRssi} dBm` : "N/A";
            bleHTML = `
                <div class="info-row">
                    <span class="info-icon">📡</span>
                    <span class="info-label">BLE Device:</span>
                    <span class="info-value">Present (${bleRssiValue})</span>
                </div>
            `;
        }
        
        // Determine status class and text based on device.status
        const statusClass = device.status === 'online' ? 'online' : 'offline';
        const statusText = device.status === 'online' ? 'Online' : 'Offline';
        
        card.innerHTML = `
            <div class="device-header">
                <span class="device-id">${device.id}</span>
                <span class="device-status ${statusClass}">${statusText}</span>
            </div>
            <div class="device-info">
                <div class="info-row">
                    <span class="info-icon">📍</span>
                    <span class="info-label">GPS Location:</span>
                    <span class="info-value">${device.lat.toFixed(4)}, ${device.lng.toFixed(4)}</span>
                </div>
                ${detectionHTML}
                ${personHTML}
                ${humanCountHTML}
                ${bleHTML}
                <div class="info-row">
                    <span class="info-icon">🔋</span>
                    <span class="info-label">Battery:</span>
                    <span class="info-value">${device.batteryLevel.toFixed(0)}%</span>
                </div>
                <div class="info-row">
                    <span class="info-icon">🕐</span>
                    <span class="info-label">Last Update:</span>
                    <span class="info-value">${device.lastUpdate.toLocaleTimeString()}</span>
                </div>
            </div>
        `;
        
        // Click to center map on device
        card.addEventListener('click', () => {
            map.setView([device.lat, device.lng], 14);
            markers[device.id].openPopup();
        });
        
        deviceList.appendChild(card);
    });
}

// Update statistics
function updateStatistics() {
    const activeDevices = devices.filter(d => d.status === 'online').length;
    const animalsDetected = devices.filter(d => d.detectedAnimal !== null).length;
    const poachersDetected = devices.filter(d => d.detectedPerson === PERSON_TYPES.POACHER).length;
    const rangersDetected = devices.filter(d => d.detectedPerson === PERSON_TYPES.RANGER).length;
    
    document.getElementById('activeDevices').textContent = activeDevices;
    document.getElementById('animalsDetected').textContent = animalsDetected;
    document.getElementById('poacherAlerts').textContent = poachersDetected;
    document.getElementById('rangersDetected').textContent = rangersDetected;
}

// Add activity to log
function addActivity(device, type, message) {
    const activity = {
        device: device.id,
        type: type,
        message: message,
        time: new Date(),
        alertLevel: device.getAlertLevel()
    };
    
    activityLog.unshift(activity);
    
    // Limit log size
    if (activityLog.length > ACTIVITY_LOG_MAX) {
        activityLog = activityLog.slice(0, ACTIVITY_LOG_MAX);
    }
    
    renderActivityLog();
}

// Render activity log
function renderActivityLog() {
    const activityLogEl = document.getElementById('activityLog');
    activityLogEl.innerHTML = '';
    
    activityLog.slice(0, 20).forEach(activity => {
        const item = document.createElement('div');
        item.className = `activity-item ${activity.alertLevel}`;
        
        let icon = '📡';
        if (activity.alertLevel === 'alert') icon = '⚠️';
        else if (activity.alertLevel === 'ranger') icon = '✓';
        else if (activity.alertLevel === 'animal') icon = '🦁';
        
        item.innerHTML = `
            <div class="activity-icon">${icon}</div>
            <div class="activity-content">
                <div class="activity-title">${activity.device}</div>
                <div class="activity-details">${activity.message}</div>
            </div>
            <div class="activity-time">${activity.time.toLocaleTimeString()}</div>
        `;
        
        activityLogEl.appendChild(item);
    });
}



// Center map on all devices
function centerMap() {
    const bounds = L.latLngBounds(devices.map(d => [d.lat, d.lng]));
    map.fitBounds(bounds, { padding: [50, 50] });
}

// Toggle alert highlights
function toggleHeatmap() {
    const alertDevices = devices.filter(d => d.detectedPerson === PERSON_TYPES.POACHER);
    if (alertDevices.length > 0) {
        const bounds = L.latLngBounds(alertDevices.map(d => [d.lat, d.lng]));
        map.fitBounds(bounds, { padding: [50, 50] });
        
        alertDevices.forEach(device => {
            markers[device.id].openPopup();
        });
    } else {
        alert('No poacher alerts currently active.');
    }
}

// Clear activity log
function clearLog() {
    activityLog = [];
    renderActivityLog();
}

// Play alert sound for poacher detection
function playPoacherAlert() {
    // Prevent alert spam - only play once every 5 seconds
    const now = Date.now();
    if (now - lastAlertTime < 5000) {
        return;
    }
    lastAlertTime = now;
    
    try {
        // Initialize AudioContext on first use
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        // Create oscillator for beep sound
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // Set beep parameters - urgent alert tone
        oscillator.frequency.value = 880; // A5 note - high pitched alert
        oscillator.type = 'sine';
        
        // Volume envelope for beep
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        // Play beep
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
        
        // Play second beep for emphasis
        setTimeout(() => {
            const oscillator2 = audioContext.createOscillator();
            const gainNode2 = audioContext.createGain();
            
            oscillator2.connect(gainNode2);
            gainNode2.connect(audioContext.destination);
            
            oscillator2.frequency.value = 880;
            oscillator2.type = 'sine';
            
            gainNode2.gain.setValueAtTime(0, audioContext.currentTime);
            gainNode2.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.01);
            gainNode2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
            
            oscillator2.start(audioContext.currentTime);
            oscillator2.stop(audioContext.currentTime + 0.5);
        }, 200);
        
        // Play third beep for triple alert
        setTimeout(() => {
            const oscillator3 = audioContext.createOscillator();
            const gainNode3 = audioContext.createGain();
            
            oscillator3.connect(gainNode3);
            gainNode3.connect(audioContext.destination);
            
            oscillator3.frequency.value = 1047; // C6 note - even higher
            oscillator3.type = 'sine';
            
            gainNode3.gain.setValueAtTime(0, audioContext.currentTime);
            gainNode3.gain.linearRampToValueAtTime(0.4, audioContext.currentTime + 0.01);
            gainNode3.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.7);
            
            oscillator3.start(audioContext.currentTime);
            oscillator3.stop(audioContext.currentTime + 0.7);
        }, 400);
        
        console.log('🔊 Poacher alert sound played!');
    } catch (err) {
        console.error('Failed to play alert sound:', err);
    }
}

// Log Firebase data to local storage and memory
function logFirebaseData(data) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        receivedAt: Date.now(),
        data: {
            animal: data.animal || "None",
            human: data.human || "None",
            role: data.role || "None",
            human_count: data.human_count || 0,
            ble_present: data.ble_present || false,
            ble_rssi: data.ble_rssi || "None",
            ble_last_seen: data.ble_last_seen || "None",
            timestamp: data.timestamp || "None",
            lat: data.lat || data.latitude || null,
            lng: data.lng || data.longitude || null
        }
    };
    
    // Add to memory array
    dataLogs.unshift(logEntry);
    
    // Limit memory usage
    if (dataLogs.length > MAX_LOG_ENTRIES) {
        dataLogs = dataLogs.slice(0, MAX_LOG_ENTRIES);
    }
    
    // Save to localStorage (keep last 500 entries for persistence)
    try {
        const storedLogs = JSON.parse(localStorage.getItem('vigil1_data_logs') || '[]');
        storedLogs.unshift(logEntry);
        const trimmedLogs = storedLogs.slice(0, 500);
        localStorage.setItem('vigil1_data_logs', JSON.stringify(trimmedLogs));
        
        // Update log count display
        updateLogCount();
    } catch (err) {
        console.error('Failed to save log to localStorage:', err);
    }
    
    console.log('📝 Data logged:', logEntry);
}

// Load logs from localStorage on startup
function loadStoredLogs() {
    try {
        const storedLogs = JSON.parse(localStorage.getItem('vigil1_data_logs') || '[]');
        dataLogs = storedLogs;
        console.log(`✓ Loaded ${dataLogs.length} stored log entries`);
        updateLogCount();
    } catch (err) {
        console.error('Failed to load stored logs:', err);
        dataLogs = [];
    }
}

// Update log count display
function updateLogCount() {
    const logCountEl = document.getElementById('logCount');
    if (logCountEl) {
        logCountEl.textContent = dataLogs.length;
    }
}

// Download logs as JSON file
function downloadLogs() {
    if (dataLogs.length === 0) {
        alert('No logs to download');
        return;
    }
    
    const logData = {
        exportedAt: new Date().toISOString(),
        totalEntries: dataLogs.length,
        logs: dataLogs
    };
    
    const dataStr = JSON.stringify(logData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `vigil1_logs_${new Date().toISOString().replace(/:/g, '-')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    console.log(`✓ Downloaded ${dataLogs.length} log entries`);
}

// Download logs as CSV file
function downloadLogsCSV() {
    if (dataLogs.length === 0) {
        alert('No logs to download');
        return;
    }
    
    // CSV header
    let csv = 'Timestamp,Received At,Animal,Human,Role,Human Count,BLE Present,BLE RSSI,BLE Last Seen,Data Timestamp,Latitude,Longitude\n';
    
    // CSV rows
    dataLogs.forEach(log => {
        const row = [
            log.timestamp,
            new Date(log.receivedAt).toISOString(),
            log.data.animal,
            log.data.human,
            log.data.role,
            log.data.human_count,
            log.data.ble_present,
            log.data.ble_rssi,
            log.data.ble_last_seen,
            log.data.timestamp,
            log.data.lat || '',
            log.data.lng || ''
        ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(',');
        csv += row + '\n';
    });
    
    const dataBlob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `vigil1_logs_${new Date().toISOString().replace(/:/g, '-')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    console.log(`✓ Downloaded ${dataLogs.length} log entries as CSV`);
}

// Clear all logs
function clearDataLogs() {
    if (confirm('Are you sure you want to clear all data logs? This cannot be undone.')) {
        dataLogs = [];
        localStorage.removeItem('vigil1_data_logs');
        updateLogCount();
        console.log('✓ All logs cleared');
        alert('All logs have been cleared');
    }
}

// View logs in console
function viewLogs() {
    console.log('='.repeat(80));
    console.log(`VIGIL1 DATA LOGS - Total Entries: ${dataLogs.length}`);
    console.log('='.repeat(80));
    dataLogs.slice(0, 50).forEach((log, index) => {
        console.log(`\nLog #${index + 1}:`);
        console.log(`  Timestamp: ${log.timestamp}`);
        console.log(`  Animal: ${log.data.animal}`);
        console.log(`  Human: ${log.data.human}`);
        console.log(`  Role: ${log.data.role}`);
        console.log(`  Human Count: ${log.data.human_count}`);
        console.log(`  BLE Present: ${log.data.ble_present}`);
        console.log(`  Location: ${log.data.lat}, ${log.data.lng}`);
    });
    if (dataLogs.length > 50) {
        console.log(`\n... and ${dataLogs.length - 50} more entries`);
    }
    console.log('='.repeat(80));
}

// Set up real-time Firebase listener
function setupRealtimeListener() {
    if (!window.firebaseDatabase || !window.firebaseOnValue) {
        console.error('Firebase real-time functions not available, falling back to polling');
        setFirebaseStatus('disconnected', 'Firebase real-time not available');
        return false;
    }
    
    try {
        const dbRef = window.firebaseRef(window.firebaseDatabase, 'wildeye');
        
        // Set up real-time listener
        window.firebaseOnValue(dbRef, (snapshot) => {
            if (snapshot.exists()) {
                console.log('🔄 Real-time update received from Firebase');
                const data = snapshot.val();
                
                // Process the data immediately
                processFirebaseData(data);
            } else {
                console.log('⚠ No data available in /wildeye path');
                setFirebaseStatus('disconnected', 'No data in Firebase');
            }
        }, (error) => {
            console.error('❌ Firebase listener error:', error);
            setFirebaseStatus('disconnected', 'Firebase listener error: ' + error.message);
        });
        
        console.log('✓ Real-time Firebase listener established');
        return true;
    } catch (err) {
        console.error('❌ Failed to set up Firebase listener:', err);
        setFirebaseStatus('disconnected', 'Failed to set up listener: ' + err.message);
        return false;
    }
}

// Process Firebase data (extracted for reuse)
function processFirebaseData(data) {
    console.log('✓ Processing Firebase data:', data);
    
    // Log the raw data from Firebase
    logFirebaseData(data);
    
    // Map Firebase fields to device data
    let detectedAnimal = null;
    if (data.animal && data.animal !== "None" && data.animal !== "") {
        detectedAnimal = data.animal;
    }
    
    // Use the 'role' field to determine person type (poacher or ranger)
    let detectedPerson = null;
    if (data.role && data.role !== "None" && data.role !== "") {
        const roleLower = String(data.role).toLowerCase();
        if (roleLower.includes('poacher') || roleLower === 'poacher') {
            detectedPerson = PERSON_TYPES.POACHER;
            console.log('🚨 POACHER detected via role field!');
        } else if (roleLower.includes('ranger') || roleLower === 'ranger') {
            detectedPerson = PERSON_TYPES.RANGER;
            console.log('✓ Ranger detected via role field');
        }
    }
    
    // Fallback: Check human field if role is not set
    if (!detectedPerson && data.human && data.human !== "None" && data.human !== "") {
        const humanLower = String(data.human).toLowerCase();
        if (humanLower.includes('poacher')) {
            detectedPerson = PERSON_TYPES.POACHER;
            console.log('🚨 POACHER detected via human field!');
        } else if (humanLower.includes('ranger')) {
            detectedPerson = PERSON_TYPES.RANGER;
            console.log('✓ Ranger detected via human field');
        }
    }
    
    // Parse coordinates
    let lat = userLat;
    let lng = userLng;
    
    // Helper to parse coordinate
    const parseCoord = (val) => {
        if (val === undefined || val === null) return null;
        const parsed = typeof val === 'string' ? parseFloat(val) : val;
        return isNaN(parsed) ? null : parsed;
    };

    const firebaseLat = parseCoord(data.lat) ?? parseCoord(data.latitude);
    const firebaseLng = parseCoord(data.lng) ?? parseCoord(data.longitude);

    if (firebaseLat !== null) lat = firebaseLat;
    if (firebaseLng !== null) lng = firebaseLng;
    
    console.log(`  - Location resolved: ${lat}, ${lng} (Source: ${firebaseLat !== null ? 'Firebase' : 'Fallback/User'})`);
    
    // Parse timestamp
    let rawTs = data.timestamp ?? data.time ?? data.ts ?? new Date().toISOString();
    
    // Handle numeric strings
    if (typeof rawTs === 'string' && !isNaN(rawTs) && !rawTs.includes(':') && !rawTs.includes('-')) {
        rawTs = Number(rawTs);
    }

    let lastUpdate;
    if (typeof rawTs === 'number') {
        lastUpdate = new Date(rawTs > 1e11 ? rawTs : rawTs * 1000);
    } else {
        lastUpdate = new Date(rawTs);
    }
    
    if (isNaN(lastUpdate.getTime())) {
        console.warn('  - Invalid timestamp parsed, defaulting to NOW');
        lastUpdate = new Date();
    }

    // Consider device online if data is at most 5 minutes old
    const ageMs = Date.now() - lastUpdate.getTime();
    const isUpToDate = ageMs <= 300_000; // 5 minutes
    const status = isUpToDate ? 'online' : 'offline';
    
    console.log(`  - Time check debug: rawTs=${rawTs} (${typeof rawTs})`);
    console.log(`  - Parsed: ${lastUpdate.toLocaleString()} vs Now: ${new Date().toLocaleString()}`);
    console.log(`  - Age: ${Math.round(ageMs/1000)}s. Threshold: 300s. Status: ${status}`);

    const deviceData = {
        id: 'RPI5-001',
        lat: lat,
        lng: lng,
        detectedAnimal: detectedAnimal,
        detectedPerson: detectedPerson,
        humanCount: data.human_count || 0,
        blePresent: data.ble_present || false,
        bleRssi: data.ble_rssi || "None",
        bleLastSeen: data.ble_last_seen || "None",
        confidence: (typeof data.confidence === 'number') ? data.confidence : 85,
        batteryLevel: 100,
        status: status,
        lastUpdate: lastUpdate.toISOString()
    };
    
    // Update devices array
    const previousDevices = [...devices];
    const newDevice = new FieldDevice(deviceData);
    
    // Check for changes to log activities
    const previous = previousDevices.find(d => d.id === newDevice.id);
    
    if (!previous) {
        addActivity(newDevice, 'info', 'Device came online');
        // Check if coming online with poacher already detected
        if (newDevice.detectedPerson === PERSON_TYPES.POACHER) {
            playPoacherAlert();
        }
    } else {
        // Log significant changes
        if (newDevice.detectedPerson === PERSON_TYPES.POACHER && previous.detectedPerson !== PERSON_TYPES.POACHER) {
            addActivity(newDevice, 'alert', '🚨 POACHER DETECTED! Immediate response required.');
            playPoacherAlert(); // Play alert sound
        } else if (newDevice.detectedPerson === PERSON_TYPES.RANGER && previous.detectedPerson !== PERSON_TYPES.RANGER) {
            addActivity(newDevice, 'ranger', 'Ranger detected on patrol.');
        } else if (newDevice.detectedAnimal && newDevice.detectedAnimal !== previous.detectedAnimal) {
            addActivity(newDevice, 'animal', `${newDevice.detectedAnimal} detected nearby.`);
        } else if (newDevice.status !== previous.status) {
            addActivity(newDevice, 'info', `Device status changed to ${newDevice.status}`);
        }
    }
    
    updateMarker(newDevice);
    devices = [newDevice];
    
    renderDeviceCards();
    updateStatistics();
    setFirebaseStatus('connected', 'Firebase Connected (Real-time)');
}

// Initialize dashboard
function initialize() {
    console.log('🚀 Initializing Vigil1 Dashboard...');
    
    // Load stored logs from localStorage
    loadStoredLogs();
    
    // Get user location for fallback
    getUserLocation();
    
    // Initialize devices first
    initializeDevices();
    
    initializeMap();
    renderDeviceCards();
    updateStatistics();
    
    // Add initial activity
    addActivity({id: 'SYSTEM', getAlertLevel: () => 'normal'}, 'info', 'Dashboard initialized, connecting to Firebase...');
    
    // Set up controls
    document.getElementById('centerMap').addEventListener('click', centerMap);
    document.getElementById('toggleHeatmap').addEventListener('click', toggleHeatmap);
    document.getElementById('clearLog').addEventListener('click', clearLog);
    
    // Set up log controls
    const downloadLogsBtn = document.getElementById('downloadLogs');
    const downloadLogsCSVBtn = document.getElementById('downloadLogsCSV');
    const viewLogsBtn = document.getElementById('viewLogs');
    const clearLogsBtn = document.getElementById('clearLogs');
    
    if (downloadLogsBtn) downloadLogsBtn.addEventListener('click', downloadLogs);
    if (downloadLogsCSVBtn) downloadLogsCSVBtn.addEventListener('click', downloadLogsCSV);
    if (viewLogsBtn) viewLogsBtn.addEventListener('click', viewLogs);
    if (clearLogsBtn) clearLogsBtn.addEventListener('click', clearDataLogs);
    
    // Wait a bit for Firebase to initialize, then set up real-time listener
    setTimeout(() => {
        console.log('🔄 Setting up Firebase real-time listener...');
        const realtimeEnabled = setupRealtimeListener();
        
        // If real-time listener fails, fall back to polling
        if (!realtimeEnabled) {
            console.log('⚠ Falling back to polling mode');
            pollFirebaseAndUpdate();
            setInterval(pollFirebaseAndUpdate, UPDATE_INTERVAL);
        }
    }, 1000);
    
    console.log('✓ Dashboard initialized successfully!');
}

// Start when page loads
window.addEventListener('DOMContentLoaded', initialize);
