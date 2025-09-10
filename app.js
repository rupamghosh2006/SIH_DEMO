// Initialize Lucide icons
lucide.createIcons();

// Initialize map centered on Kolkata
const map = L.map('map').setView([22.5572, 88.3639], 14);

// Add OpenStreetMap tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Bus routes data with correct Kolkata coordinates
const routes = {
    DN18: {
        name: 'DN18',
        color: '#e74c3c',
        path: [
            [22.5958, 88.2636], // Howrah Station
            [22.5447, 88.3506], // Park Street Metro (passenger pickup point)
            [22.5697, 88.3467], // Central Kolkata/BBD Bagh (destination)
            [22.5896, 88.4030], // Salt Lake
        ],
        stops: ['Howrah Station', 'Park Street', 'Central Kolkata', 'Salt Lake']
    },
    L238: {
        name: 'L238',
        color: '#3498db',
        path: [
            [22.5675, 88.3364], // Sealdah
            [22.5447, 88.3506], // Park Street Metro (passenger pickup point)
            [22.5697, 88.3467], // Central Kolkata/BBD Bagh (destination)
            [22.5568, 88.3826], // Ballygunge
            [22.4707, 88.3962], // Garia
        ],
        stops: ['Sealdah', 'Park Street', 'Central Kolkata', 'Ballygunge', 'Garia']
    },
    S15: {
        name: 'S15',
        color: '#2ecc71',
        path: [
            [22.5675, 88.3364], // Esplanade
            [22.5697, 88.3467], // Central Kolkata
            [22.5957, 88.4044], // Bidhannagar
            [22.6540, 88.4473], // Airport
        ],
        stops: ['Esplanade', 'Central', 'Bidhannagar', 'Airport']
    }
};

// Passenger location (Park Street Metro) and destination (Central Kolkata)
const passengerLocation = [22.5447, 88.3506]; // Park Street Metro - Corrected coordinates
const destinationLocation = [22.5697, 88.3467]; // Central Kolkata/BBD Bagh - Corrected coordinates
let passengerMarker, destinationMarker;

// Bus markers and polylines
let busMarkers = {};
let routeLines = {};
let simulationInterval;
let isSimulating = false;

// Bus positions (initially at start of routes)
let busPositions = {
    DN18: { index: 0, progress: 0, direction: 1 },
    L238: { index: 0, progress: 0, direction: 1 },
    S15: { index: 0, progress: 0, direction: 1 }
};

// Custom icons
const busIcon = (color) => L.divIcon({
    html: `<div style="background: ${color}; width: 28px; height: 28px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 14px; box-shadow: 0 4px 15px rgba(0,0,0,0.2);">🚌</div>`,
    iconSize: [28, 28],
    className: 'custom-bus-icon'
});

const passengerIcon = L.divIcon({
    html: '<div style="background: #FF6B6B; width: 32px; height: 32px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; box-shadow: 0 4px 15px rgba(255, 107, 107, 0.4);">👤</div>',
    iconSize: [32, 32],
    className: 'custom-passenger-icon pulsing'
});

const destinationIcon = L.divIcon({
    html: '<div class="destination-marker">🎯</div>',
    iconSize: [30, 30],
    className: 'custom-destination-icon'
});

// Initialize map elements
function initializeMap() {
    // Add passenger marker
    // passengerMarker = L.marker(passengerLocation, { icon: passengerIcon })
    //     .addTo(map)
    //     .bindPopup('<b>Your Location</b><br>Park Street Metro Station<br>Waiting for bus to Central Kolkata');
        
    // Add destination marker
    destinationMarker = L.marker(destinationLocation, { icon: destinationIcon })
        .addTo(map)
        .bindPopup('<b>Your Destination</b><br>Central Kolkata (BBD Bagh)');
    
    // Add route lines and bus markers
    Object.keys(routes).forEach(routeId => {
        const route = routes[routeId];
        
        // Add route line
        routeLines[routeId] = L.polyline(route.path, {
            color: route.color,
            weight: 5,
            opacity: 0.8
        }).addTo(map).bindPopup(`Route ${route.name}`);
        
        // Add bus marker
        busMarkers[routeId] = L.marker(route.path[0], { icon: busIcon(route.color) })
            .addTo(map)
            .bindPopup(`Bus ${route.name}<br>Status: At ${route.stops[0]}`);
    });
    
    updateRouteInfo();
}

// Calculate distance between two points
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Calculate ETA based on current bus position and passenger location
function calculateETA(routeId) {
    const route = routes[routeId];
    const busPos = busPositions[routeId];
    const currentLatLng = getCurrentBusPosition(routeId);
    
    // For routes that pass through Park Street, calculate time to reach passenger
    const parkStreetStopIndex = route.stops.findIndex(stop => stop === 'Park Street');
    
    if (parkStreetStopIndex === -1) {
        // Route doesn't go through Park Street
        return '--';
    }
    
    // Calculate distance from current bus position to Park Street
    const distanceToParkStreet = calculateDistance(
        currentLatLng.lat, currentLatLng.lng,
        passengerLocation[0], passengerLocation[1]
    );
    
    // Check if bus has already passed Park Street in current direction
    if (busPos.direction > 0 && busPos.index > parkStreetStopIndex) {
        return 'Passed';
    }
    
    // Simulate realistic ETA (2-12 minutes based on distance and traffic)
    const baseTime = Math.max(2, Math.min(12, distanceToParkStreet * 8));
    const eta = Math.round(baseTime + Math.random() * 2); // Add some randomness
    
    return eta;
}

// Get current bus position based on progress
function getCurrentBusPosition(routeId) {
    const route = routes[routeId];
    const busPos = busPositions[routeId];
    
    if (busPos.index >= route.path.length - 1) {
        return { lat: route.path[route.path.length - 1][0], lng: route.path[route.path.length - 1][1] };
    }
    
    const start = route.path[busPos.index];
    const end = route.path[busPos.index + 1];
    
    const lat = start[0] + (end[0] - start[0]) * busPos.progress;
    const lng = start[1] + (end[1] - start[1]) * busPos.progress;
    
    return { lat, lng };
}

// Update bus positions
function updateBusPositions() {
    Object.keys(busPositions).forEach(routeId => {
        const route = routes[routeId];
        const busPos = busPositions[routeId];
        
        // Move bus along the route
        busPos.progress += 0.015 * busPos.direction; // Slightly slower for more realistic movement
        
        if (busPos.progress >= 1) {
            busPos.progress = 0;
            busPos.index += busPos.direction;
            
            if (busPos.index >= route.path.length - 1) {
                busPos.direction = -1; // Reverse direction
            } else if (busPos.index <= 0) {
                busPos.direction = 1; // Forward direction
            }
        }
        
        // Update marker position
        const currentPos = getCurrentBusPosition(routeId);
        busMarkers[routeId].setLatLng([currentPos.lat, currentPos.lng]);
        
        // Update popup content
        const currentStopIndex = Math.round(busPos.index);
        const currentStop = route.stops[Math.min(currentStopIndex, route.stops.length - 1)];
        busMarkers[routeId].getPopup().setContent(`Bus ${route.name}<br>Status: Near ${currentStop}<br>Direction: ${busPos.direction > 0 ? 'Forward' : 'Return'}`);
    });
    
    updateRouteInfo();
}

// Update route information in sidebar
function updateRouteInfo() {
    const routeInfoContainer = document.getElementById('routeInfo');
    let html = '';
    
    Object.keys(routes).forEach(routeId => {
        const route = routes[routeId];
        const eta = isSimulating ? calculateETA(routeId) : '--';
        const busPos = busPositions[routeId];
        const currentStopIndex = Math.round(busPos.index);
        const currentStop = route.stops[Math.min(currentStopIndex, route.stops.length - 1)];
        
        // Check if this route serves the passenger's journey
        const servesJourney = route.stops.includes('Park Street') && route.stops.includes('Central Kolkata');
        const relevantClass = servesJourney ? ' relevant-route' : '';
        
        html += `
            <div class="route-info route-${routeId.toLowerCase()}${relevantClass}">
                <div class="route-header">
                    <span class="route-name">
                        <i data-lucide="bus" width="20" height="20"></i>
                        ${route.name}
                    </span>
                    <span class="eta">
                        <i data-lucide="clock" width="14" height="14"></i>
                        ${eta} min
                    </span>
                </div>
                <div class="bus-status">
                    <i data-lucide="map-pin" width="16" height="16"></i>
                    Near: ${currentStop}
                </div>
                <div class="bus-status">
                    <i data-lucide="navigation" width="16" height="16"></i>
                    Direction: ${busPos.direction > 0 ? 'Forward Route' : 'Return Route'}
                </div>
                ${servesJourney ? '<div class="bus-status"><i data-lucide="check-circle" width="16" height="16" style="color: var(--color-success);"></i>Available for your journey</div>' : ''}
                <div class="stops-info">
                    <strong>Route:</strong> ${route.stops.join(' → ')}
                </div>
            </div>
        `;
    });
    
    routeInfoContainer.innerHTML = html;
    
    // Re-initialize Lucide icons for dynamically added content
    lucide.createIcons();
}

// Start simulation
function startSimulation() {
    if (isSimulating) return;
    
    isSimulating = true;
    // const statusIndicator = document.getElementById('statusIndicator');
    // statusIndicator.innerHTML = '<i data-lucide="play-circle" width="18" height="18"></i> Simulation Running';
    // statusIndicator.className = 'status-indicator simulation-running';
    
    lucide.createIcons();
    simulationInterval = setInterval(updateBusPositions, 1000);
}

// Stop simulation
function stopSimulation() {
    if (!isSimulating) return;
    
    isSimulating = false;
    // const statusIndicator = document.getElementById('statusIndicator');
    // statusIndicator.innerHTML = '<i data-lucide="pause-circle" width="18" height="18"></i> Simulation Stopped';
    // statusIndicator.className = 'status-indicator';
    
    lucide.createIcons();
    if (simulationInterval) {
        clearInterval(simulationInterval);
    }
}

// Reset simulation
function resetSimulation() {
    stopSimulation();
    
    // Reset bus positions
    busPositions = {
        DN18: { index: 0, progress: 0, direction: 1 },
        L238: { index: 0, progress: 0, direction: 1 },
        S15: { index: 0, progress: 0, direction: 1 }
    };
    
    // Reset bus markers to start positions
    Object.keys(routes).forEach(routeId => {
        const route = routes[routeId];
        busMarkers[routeId].setLatLng(route.path[0]);
        busMarkers[routeId].getPopup().setContent(`Bus ${route.name}<br>Status: At ${route.stops[0]}`);
    });
    
    updateRouteInfo();
}

// Initialize the map when page loads
document.addEventListener('DOMContentLoaded', function() {
    initializeMap();
});