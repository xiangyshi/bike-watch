// Import Mapbox as an ESM module
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

console.log("Mapbox GL JS Loaded:", mapboxgl);

// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1IjoieGlhbmd5dXNoaSIsImEiOiJjbTdreWF3N3kwNWl4MmtvaXRsaW8ydzFnIn0.NezWGVCAPTOGf2f9Soqusg';

// Initialize the map
const map = new mapboxgl.Map({
    container: 'map', // ID of the div where the map will render
    style: 'mapbox://styles/mapbox/streets-v12', // Map style
    center: [-71.09415, 42.36027], // [longitude, latitude]
    zoom: 12, // Initial zoom level
    minZoom: 5, // Minimum allowed zoom
    maxZoom: 18 // Maximum allowed zoom
});

function minutesSinceMidnight(date) {
    return date.getHours() * 60 + date.getMinutes();
}

function computeStationTraffic(stations, trips) {
    const departures = d3.rollup(
        trips, 
        (v) => v.length, 
        (d) => d.start_station_id
    );

    const arrivals = d3.rollup(
        trips,
        (v) => v.length,
        (d) => d.end_station_id
    );

    return stations.map((station) => {
        let id = station.short_name;
        station.arrivals = arrivals.get(id) ?? 0;
        station.departures = departures.get(id) ?? 0;
        station.totalTraffic = station.arrivals + station.departures;
        return station;
    });
}

function filterTripsbyTime(trips, timeFilter) {
    return timeFilter === -1 
        ? trips // If no filter is applied (-1), return all trips
        : trips.filter((trip) => {
            const startedMinutes = minutesSinceMidnight(trip.started_at);
            const endedMinutes = minutesSinceMidnight(trip.ended_at);
            return (
                Math.abs(startedMinutes - timeFilter) <= 60 ||
                Math.abs(endedMinutes - timeFilter) <= 60
            );
        });
}

let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);

map.on('load', async () => { 
    map.addSource('boston_route', {
        type: 'geojson',
        data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson'
    });
    map.addSource('cambridge_route', {
        type: 'geojson',
        data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson'
    });
    
    // Add the Boston bike lanes with a unique ID
    map.addLayer({
        id: 'boston-bike-lanes',  // Changed ID to be unique
        type: 'line',
        source: 'boston_route',
        paint: {
            'line-color': '#32D400',
            'line-width': 5,
            'line-opacity': 0.6
        }
    });
    
    // Add the Cambridge bike lanes with a different unique ID
    map.addLayer({
        id: 'cambridge-bike-lanes',  // Changed ID to be unique
        type: 'line',
        source: 'cambridge_route',
        paint: {
            'line-color': '#32D400',
            'line-width': 5,
            'line-opacity': 0.6
        }
    });
    const svg = d3.select('#map').select('svg');
    function getCoords(station) {
        const point = new mapboxgl.LngLat(+station.lon, +station.lat);  // Convert lon/lat to Mapbox LngLat
        const { x, y } = map.project(point);  // Project to pixel coordinates
        return { cx: x, cy: y };  // Return as object for use in SVG attributes
    }

    let jsonData;
    try {
        const jsonurl = "https://dsc106.com/labs/lab07/data/bluebikes-stations.json";
        
        // Await JSON fetch
        jsonData = await d3.json(jsonurl);
        
        console.log('Loaded JSON Data:', jsonData); // Log to verify structure
    } catch (error) {
        console.error('Error loading JSON:', error); // Handle errors
    }
    let stations = jsonData.data.stations;

    let trips;
    try {
        trips = await d3.csv(
            'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv',
            (trip) => {
                trip.started_at = new Date(trip.started_at);
                trip.ended_at = new Date(trip.ended_at);
                return trip;
            }
        );
        console.log('Loaded Traffic Data:', trips);
    } catch (error) {
        console.error('Error loading Traffic Data:', error);
    }
    const departures = d3.rollup(
        trips,
        (v) => v.length,
        (d) => d.start_station_id,
    );
    const arrivals = d3.rollup(
        trips,
        (v) => v.length,
        (d) => d.end_station_id,
    );

    stations = stations.map((station) => {
        let id = station.short_name;
        station.arrivals = arrivals.get(id) ?? 0;
        station.departures = departures.get(id) ?? 0;
        station.totalTraffic = station.arrivals + station.departures;
        return station;
    });

    const radiusScale = d3
        .scaleSqrt()
        .domain([0, d3.max(stations, (d) => d.totalTraffic / 2)])
        .range([0, 25]);

    const circles = svg.selectAll('circle')
        .data(stations)
        .enter()
        .append('circle')
        .attr('r', d => radiusScale(d.totalTraffic))
        .attr('fill', 'steelblue')  // Initial fill color
        .attr('stroke', 'white')
        .attr('stroke-width', 1)
        .attr('opacity', 0.8)
        .style("--departure-ratio", d => stationFlow(d.departures / d.totalTraffic)); // Set the CSS variable for departure ratio
    
        // Create a tooltip div
    const tooltip = d3.select('body').append('div')
    .attr('class', 'tooltip')
    .style('position', 'absolute')
    .style('pointer-events', 'none')
    .style('padding', '4px 8px')
    .style('background', 'rgba(0,0,0,0.7)')
    .style('color', 'white')
    .style('border-radius', '4px')
    .style('font-size', '12px')
    .style('opacity', 0)
    .style('z-index', 2);

    // Show tooltip on mouseover
    circles
    .on('mouseover', (event, d) => {
    tooltip
        .html(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`)
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY + 10) + 'px')
        .transition().duration(200)
        .style('opacity', 1);
    })
    .on('mouseout', () => {
    tooltip.transition().duration(200)
        .style('opacity', 0);
    });
        
            

    function updatePositions() {
        circles
            .attr('cx', d => getCoords(d).cx)  // Set the x-position using projected coordinates
            .attr('cy', d => getCoords(d).cy); // Set the y-position using projected coordinates
    }
    
    // Initial position update when map loads
    updatePositions();

    map.on('move', updatePositions);     // Update during map movement
    map.on('zoom', updatePositions);     // Update during zooming
    map.on('resize', updatePositions);   // Update on window resize
    map.on('moveend', updatePositions);  // Final adjustment after movement ends



    const timeSlider = document.getElementById('timeSlider');
    const selectedTime = document.getElementById('selectedTime');
    const anyTimeLabel = document.getElementById('noFilterMessage');

    function formatTime(minutes) {
        const date = new Date(0, 0, 0, 0, minutes);  // Set hours & minutes
        return date.toLocaleString('en-US', { timeStyle: 'short' }); // Format as HH:MM AM/PM
    }

    timeSlider.addEventListener('input', updateTimeDisplay);
    updateTimeDisplay();

    function updateScatterPlot(timeFilter) {
        // Get only the trips that match the selected time filter
        const filteredTrips = filterTripsbyTime(trips, timeFilter);
        
        // Recompute station traffic based on the filtered trips
        const filteredStations = computeStationTraffic(stations, filteredTrips);
        
        // Update the scatterplot by adjusting the radius of circles
        circles
          .data(filteredStations)
          .join('circle') // Ensure the data is bound correctly
          .attr('r', (d) => radiusScale(d.totalTraffic))
          .style('--departure-ratio', (d) =>
            stationFlow(d.departures / d.totalTraffic),
          ); // Update circle sizes
    }

    function updateTimeDisplay() {
        let timeFilter = Number(timeSlider.value); // Get slider value
    
        if (timeFilter === -1) {
          selectedTime.textContent = ''; // Clear time display
          anyTimeLabel.style.display = 'block'; // Show "(any time)"
        } else {
          selectedTime.textContent = formatTime(timeFilter); // Display formatted time
          anyTimeLabel.style.display = 'none'; // Hide "(any time)"
        }
        
        // Call updateScatterPlot to reflect the changes on the map
        updateScatterPlot(timeFilter);
    }
});

