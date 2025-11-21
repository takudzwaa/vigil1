# Vigil1 - Wildlife & Poacher Monitoring Dashboard

A comprehensive monitoring dashboard for the Vigil1 system that displays real-time data from Raspberry Pi 5 devices deployed in wildlife conservation areas. The dashboard monitors wildlife activity, detects poachers and rangers, and provides GPS tracking capabilities.

## 🌟 Features

### Real-Time Monitoring
- **8 Simulated Raspberry Pi 5 Devices** with unique identifiers
- **Live GPS Tracking** on an interactive map
- **Wildlife Detection** - Monitors 10 different animal species
- **Person Detection** - Identifies poachers and rangers
- **Confidence Scores** for all detections
- **Battery Monitoring** for each field device

### Dashboard Components

1. **Header Statistics**
   - Active Devices Count
   - Animals Detected
   - Poacher Alerts (highlighted)
   - Rangers Detected

2. **Device Panel**
   - Individual cards for each Raspberry Pi 5 device
   - Device ID and status
   - GPS coordinates
   - Detected animals with confidence levels
   - Detected persons (Poacher/Ranger)
   - Battery level
   - Last update timestamp
   - Click on any card to center map on that device

3. **Interactive Map**
   - OpenStreetMap integration with Leaflet.js
   - Color-coded markers:
     - 🔴 Red - Poacher Alert
     - 🟢 Green - Ranger Present
     - 🦁 Orange - Wildlife Detected
     - 📍 Blue - Normal Status
   - Popup details for each device
   - Center Map button
   - Toggle Alerts button (focuses on poacher alerts)

4. **Activity Log**
   - Real-time event stream
   - Color-coded entries by alert level
   - Timestamps for all events
   - Tracks poacher detections, ranger sightings, and animal movements
   - Auto-scrolling with recent events

## 🚀 Getting Started

### Prerequisites
- A modern web browser (Chrome, Firefox, Safari, Edge)
- No additional software installation required

### Installation

1. Clone or download this repository
2. Open `index.html` in your web browser

That's it! The dashboard will automatically start with simulated data.

### Running Locally

Simply double-click on `index.html` or open it with your browser:

```powershell
# Using PowerShell
Start-Process "index.html"
```

Or use a local server:

```powershell
# Using Python 3
python -m http.server 8000

# Then open http://localhost:8000 in your browser
```

## 📊 Simulated Data

The dashboard uses realistic dummy data to demonstrate system functionality:

- **8 Raspberry Pi 5 devices** spread across a Serengeti-like region
- **GPS coordinates** in Tanzania (approximate Serengeti location)
- **Wildlife types**: Lion, Elephant, Rhino, Giraffe, Zebra, Leopard, Buffalo, Cheetah, Hyena, Wildebeest
- **Detection probabilities**:
  - Animal detection: 40% chance
  - Poacher detection: 8% chance
  - Ranger detection: 12% chance
- **Updates every 5 seconds** to simulate real-time data streams
- **Confidence levels** between 70-100% for detections
- **Battery levels** that gradually decrease over time

## 🎯 Use Cases

1. **Wildlife Conservation** - Monitor endangered species movements
2. **Anti-Poaching Operations** - Immediate alerts when poachers are detected
3. **Ranger Coordination** - Track ranger patrol locations
4. **Field Device Management** - Monitor device status and battery levels
5. **Demonstration & Training** - Show system capabilities without live hardware

## 🛠️ Technical Stack

- **HTML5** - Structure and layout
- **CSS3** - Modern styling with gradients, animations, and responsive design
- **Vanilla JavaScript** - Real-time data simulation and DOM manipulation
- **Leaflet.js** - Interactive map visualization
- **OpenStreetMap** - Map tiles and geographic data

## 🎨 Design Features

- **Responsive Design** - Works on desktop, tablet, and mobile
- **Color-Coded Alerts** - Visual priority system
- **Smooth Animations** - Pulsing indicators and slide-in effects
- **Professional Theme** - Dark header with gradient backgrounds
- **Accessibility** - Clear labels and high contrast ratios

## 🔧 Customization

### Modify Number of Devices
Edit `app.js`:
```javascript
const NUM_DEVICES = 8; // Change to desired number
```

### Change Update Frequency
Edit `app.js`:
```javascript
const UPDATE_INTERVAL = 5000; // Time in milliseconds
```

### Adjust GPS Location
Edit `app.js`:
```javascript
const BASE_LAT = -2.3333; // Your latitude
const BASE_LNG = 34.8333; // Your longitude
const GPS_RANGE = 0.5;    // Spread of devices
```

### Add More Animal Types
Edit `app.js`:
```javascript
const ANIMAL_TYPES = [
    'Lion', 'Elephant', 'Rhino', // Add more animals
];
```

## 📱 Features by Panel

### Device Panel
- Real-time status updates
- Visual alert indicators
- Clickable cards for map navigation
- Auto-scrolling list

### Map Panel
- Zoom and pan controls
- Marker clustering support ready
- Custom emoji icons
- Interactive popups
- Legend for marker types

### Activity Log
- Chronological event stream
- Filter by alert level (via color coding)
- Automatic pruning (keeps last 50 events)
- Clear log functionality

## 🌐 Browser Compatibility

Tested and working on:
- ✅ Google Chrome 90+
- ✅ Mozilla Firefox 88+
- ✅ Microsoft Edge 90+
- ✅ Safari 14+

## 📝 File Structure

```
vigil1/
├── index.html       # Main dashboard structure
├── styles.css       # All styling and animations
├── app.js          # Data simulation and logic
└── README.md       # This file
```

## 🔮 Future Enhancements

When connecting to real Raspberry Pi 5 devices:

1. Replace `FieldDevice` class with WebSocket or REST API connection
2. Implement authentication and secure data transmission
3. Add data persistence and historical tracking
4. Create alert notification system (email/SMS)
5. Add device configuration controls
6. Implement data analytics and reporting
7. Add camera feed integration
8. Create mobile companion app

## 🤝 Integration with Real Devices

To connect real Raspberry Pi 5 devices:

1. Set up a backend server (Node.js, Python Flask, etc.)
2. Have RPi5 devices send data via MQTT, WebSocket, or REST API
3. Replace the `updateSimulation()` function with real data fetching
4. Implement proper authentication and encryption
5. Add error handling for device disconnections

Example data format from RPi5:
```json
{
  "deviceId": "RPI5-001",
  "timestamp": "2025-10-30T12:34:56Z",
  "gps": {
    "lat": -2.3333,
    "lng": 34.8333
  },
  "detections": {
    "animal": {
      "type": "Lion",
      "confidence": 94.5
    },
    "person": {
      "type": "Poacher",
      "confidence": 87.2
    }
  },
  "battery": 78.5,
  "status": "online"
}
```

## 📄 License

This project is provided as-is for wildlife conservation purposes.

## 👨‍💻 Author

Created for the Vigil1 Wildlife Monitoring System

---

**Note**: This dashboard currently uses simulated data for demonstration purposes. For production deployment with real Raspberry Pi 5 devices, implement proper backend infrastructure and security measures.
