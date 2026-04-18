/* Configuration */
const API_BASE_URL = window.location.hostname.includes('localhost') 
  ? 'http://localhost:3000' 
  : 'https://your-backend-api-url.com'; // TODO: Update this when backend is deployed

const ITEMS = [
            { id: 'soda_can', name: 'Aluminum Can', icon: '🥤', material: 'can' },
            { id: 'plastic_bag', name: 'Plastic Bag', icon: '🛍️', material: 'plastic bag' },
            { id: 'yogurt_cup', name: 'Yogurt Cup', icon: '🥛', material: 'cup' },
            { id: 'pizza_box', name: 'Pizza Box', icon: '🍕', material: 'carton' },
            { id: 'glass_bottle', name: 'Glass Bottle', icon: '🍾', material: 'bottle' }
        ];

        const VERDICTS = {
            yes: { label: 'Recycle ✓', pillClass: 'pill-yes', iconBg: '#EAF3DE', iconColor: '#3B6D11' },
            no: { label: 'Trash ✗', pillClass: 'pill-no', iconBg: '#FCEBEB', iconColor: '#A32D2D' },
            maybe: { label: 'Depends', pillClass: 'pill-maybe', iconBg: '#FAEEDA', iconColor: '#854F0B' },
        };

        let model = null;
        let stream = null;
        let cameraActive = false;
        let currentPos = null;
        let map = null;
        let markersLayer = null;

        async function loadModel() {
            try {
                model = await mobilenet.load();
                console.log('MobileNet loaded');
            } catch (e) {
                console.warn('Model load failed', e);
            }
        }



        function showResult(data) {
            const rc = document.getElementById('result-card');
            rc.style.display = 'block';

            if (!data || data.error || !data.success) {
                document.getElementById('result-icon').innerHTML = `<svg style="width:20px;height:20px;" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#5f5e5a" stroke-width="1.5"/><path d="M12 8v4M12 16h.01" stroke="#5f5e5a" stroke-width="2" stroke-linecap="round"/></svg>`;
                document.getElementById('result-icon').style.background = '#f5f5f3';
                document.getElementById('result-title').textContent = 'Item not recognized';
                document.getElementById('result-subtitle').textContent = 'Please try again';
                document.getElementById('result-tip').textContent = 'Could not process the item or backend is unavailable.';
                document.getElementById('city-verdicts').innerHTML = '';
                document.getElementById('conf-pct').textContent = '—';
                document.getElementById('conf-fill').style.width = '0%';
                document.getElementById('map-heading').style.display = 'none';
                document.getElementById('map-container').style.display = 'none';
                return;
            }

            const confPct = Math.round((data.confidence || 0) * 100);
            document.getElementById('conf-pct').textContent = confPct + '%';
            document.getElementById('conf-fill').style.width = confPct + '%';

            const fallbackItem = ITEMS.find(i => data.material && data.material.toLowerCase().includes(i.material.toLowerCase()));
            const icon = fallbackItem ? fallbackItem.icon : '🔍';

            const verdictType = data.rules && data.rules.recyclable ? 'yes' : 'no';
            const v = VERDICTS[verdictType];

            document.getElementById('result-icon').style.background = v.iconBg;
            document.getElementById('result-icon').innerHTML = `<span style="font-size:22px;">${icon}</span>`;
            document.getElementById('result-title').textContent = data.material.split(',')[0].toUpperCase();
            document.getElementById('result-subtitle').textContent = `Detected via MobileNet`;
            document.getElementById('result-tip').textContent = data.rules && data.rules.note ? data.rules.note : 'No specific note added.';

            const cityDisplayName = data.municipality || 'Your area';
            
            const yourCityRow = `<div class="city-verdict" style="border-color:var(--green-mid);background:var(--green-light);">
    <div>
      <div class="city-verdict-name">${cityDisplayName} <span style="font-size:11px;color:var(--green);font-weight:400;">← local rules</span></div>
      <div class="city-verdict-bin">${data.rules && data.rules.note ? data.rules.note : 'Check local bin'}</div>
    </div>
    <div class="verdict-pill ${v.pillClass}">${v.label}</div>
  </div>`;

            document.getElementById('city-verdicts').innerHTML = yourCityRow;

            updateMap(true);
        }

        async function updateMap(item) {
            if (!currentPos || !item) {
                document.getElementById('map-heading').style.display = 'none';
                document.getElementById('map-container').style.display = 'none';
                return;
            }

            document.getElementById('map-heading').style.display = 'block';
            document.getElementById('map-container').style.display = 'block';
            document.getElementById('map-loading').style.display = 'flex';

            if (!map) {
                map = L.map('map').setView([currentPos.lat, currentPos.lng], 13);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '&copy; OpenStreetMap contributors'
                }).addTo(map);
                markersLayer = L.layerGroup().addTo(map);
            } else {
                map.setView([currentPos.lat, currentPos.lng], 13);
            }

            markersLayer.clearLayers();
            setTimeout(() => map.invalidateSize(), 100);

            L.marker([currentPos.lat, currentPos.lng], {
                icon: L.divIcon({
                    className: 'user-marker',
                    html: '<div style="background:#3B6D11;width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 0 4px rgba(0,0,0,0.5);"></div>',
                    iconSize: [18, 18],
                    iconAnchor: [9, 9]
                })
            }).addTo(markersLayer).bindPopup('You are here');

            const query = `[out:json];(node["amenity"="recycling"](around:5000,${currentPos.lat},${currentPos.lng});way["amenity"="recycling"](around:5000,${currentPos.lat},${currentPos.lng}););out center;`;
            const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

            try {
                const res = await fetch(url);
                const data = await res.json();
                const locations = data.elements || [];

                locations.forEach(loc => {
                    const lat = loc.lat || loc.center?.lat;
                    const lon = loc.lon || loc.center?.lon;
                    if (!lat || !lon) return;

                    const tags = loc.tags || {};
                    const name = tags.name || 'Recycling Drop-off';

                    let accepts = [];
                    for (const [k, v] of Object.entries(tags)) {
                        if (k.startsWith('recycling:') && v === 'yes') {
                            accepts.push(k.replace('recycling:', ''));
                        }
                    }

                    let acceptsText = accepts.length > 0 ? accepts.join(', ') : 'Mixed recyclables';

                    const recycleIcon = L.divIcon({
                        className: 'custom-recycle-icon',
                        html: '<div style="background:var(--green-mid);width:20px;height:20px;border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" style="width:12px;height:12px;"><path d="M21 4H8l-7 8 7 8h13a2 2 0 002-2V6a2 2 0 00-2-2z"/></svg></div>',
                        iconSize: [24, 24],
                        iconAnchor: [12, 12]
                    });

                    L.marker([lat, lon], { icon: recycleIcon }).addTo(markersLayer).bindPopup(`<b>${name}</b><br/>Accepts: ${acceptsText}`);
                });
            } catch (e) {
                console.error("Error fetching map data", e);
            }

            document.getElementById('map-loading').style.display = 'none';
        }

        function showLoading(text) {
            const ol = document.getElementById('loading-overlay');
            document.getElementById('loading-text').textContent = text;
            ol.style.display = 'flex';
        }

        function hideLoading() {
            document.getElementById('loading-overlay').style.display = 'none';
        }

        async function analyzeImage(imgEl) {
            showLoading('Analyzing item...');
            await new Promise(r => setTimeout(r, 600));
            try {
                if (model) {
                    const preds = await model.classify(imgEl, 5);
                    const topLabel = preds && preds.length > 0 ? preds[0].className : 'unknown object';
                    const conf = preds && preds.length > 0 ? preds[0].probability : 0.5;
                    
                    const res = await fetch(API_BASE_URL + '/api/classify', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            label: topLabel, 
                            confidence: conf, 
                            lat: currentPos?.lat, 
                            lng: currentPos?.lng 
                        })
                    });
                    const data = await res.json();
                    hideLoading();
                    showResult(data);
                } else {
                    hideLoading();
                    showResult({ error: true });
                }
            } catch (e) {
                console.error(e);
                hideLoading();
                showResult({ error: true });
            }
        }

        document.getElementById('btn-camera').addEventListener('click', async () => {
            if (cameraActive) {
                stopCamera();
                return;
            }
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } } });
                const video = document.getElementById('video-el');
                video.srcObject = stream;
                video.style.display = 'block';
                document.getElementById('cam-placeholder').style.display = 'none';
                document.getElementById('img-preview').style.display = 'none';
                document.getElementById('scan-ring').style.display = 'block';
                document.getElementById('scan-line').style.display = 'block';
                document.getElementById('btn-camera').innerHTML = `<svg viewBox="0 0 24 24" fill="none" style="width:15px;height:15px;"><path d="M18 6L6 18M6 6l12 12" stroke="white" stroke-width="2" stroke-linecap="round"/></svg> Stop Camera`;
                document.getElementById('btn-snap').style.display = 'flex';
                document.getElementById('btn-upload').style.display = 'none';
                cameraActive = true;
            } catch (e) {
                alert('Camera not available. Please upload a photo instead.');
            }
        });

        function stopCamera() {
            if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
            document.getElementById('video-el').style.display = 'none';
            document.getElementById('cam-placeholder').style.display = 'flex';
            document.getElementById('scan-ring').style.display = 'none';
            document.getElementById('scan-line').style.display = 'none';
            document.getElementById('btn-camera').innerHTML = `<svg viewBox="0 0 24 24" fill="none" style="width:15px;height:15px;"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" stroke="white" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12" cy="13" r="4" stroke="white" stroke-width="1.5"/></svg> Open Camera`;
            document.getElementById('btn-snap').style.display = 'none';
            document.getElementById('btn-upload').style.display = 'flex';
            cameraActive = false;
        }

        document.getElementById('btn-snap').addEventListener('click', () => {
            const video = document.getElementById('video-el');
            const canvas = document.getElementById('img-preview');
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 480;
            canvas.getContext('2d').drawImage(video, 0, 0);
            stopCamera();
            canvas.style.display = 'block';
            analyzeImage(canvas);
        });

        document.getElementById('btn-upload').addEventListener('click', () => {
            document.getElementById('upload-input').click();
        });

        document.getElementById('upload-input').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.getElementById('img-preview');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    canvas.getContext('2d').drawImage(img, 0, 0);
                    canvas.style.display = 'block';
                    document.getElementById('cam-placeholder').style.display = 'none';
                    analyzeImage(canvas);
                };
                img.src = ev.target.result;
            };
            reader.readAsDataURL(file);
            e.target.value = '';
        });

        function buildItemGrid() {
            const grid = document.getElementById('items-grid');
            grid.innerHTML = ITEMS.map(item => `
    <div class="item-chip" data-id="${item.id}" onclick="selectItem('${item.id}')">
      <div class="item-chip-icon">${item.icon}</div>
      <div class="item-chip-name">${item.name}</div>
      <div class="item-chip-material">${item.material}</div>
    </div>`).join('');
        }

        async function selectItem(id) {
            document.querySelectorAll('.item-chip').forEach(c => c.classList.remove('active'));
            document.querySelector(`[data-id="${id}"]`).classList.add('active');
            const item = ITEMS.find(i => i.id === id);
            
            showLoading('Testing sample item...');
            try {
                const res = await fetch(API_BASE_URL + '/api/classify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        label: item.material, 
                        confidence: 0.99, 
                        lat: currentPos?.lat, 
                        lng: currentPos?.lng 
                    })
                });
                const data = await res.json();
                hideLoading();
                showResult(data);
                document.getElementById('result-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } catch (e) {
                hideLoading();
                showResult({ error: true });
            }
        }

        const ALL_STATES = [
            ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'],
            ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'], ['FL', 'Florida'], ['GA', 'Georgia'],
            ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'],
            ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'],
            ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'], ['MO', 'Missouri'],
            ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'],
            ['NM', 'New Mexico'], ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'],
            ['OK', 'Oklahoma'], ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'],
            ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'],
            ['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
        ];

        const ABBREV_MAP = {
            'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR', 'California': 'CA',
            'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE', 'Florida': 'FL', 'Georgia': 'GA',
            'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA',
            'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
            'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS', 'Missouri': 'MO',
            'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
            'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH',
            'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
            'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT',
            'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY',
        };

        const STATE_NAMES = Object.fromEntries(ALL_STATES.map(([k, v]) => [k, v]));

        const STATE_CITIES = {
            WA: [{ value: 'seattle', label: 'Seattle' }, { value: 'spokane', label: 'Spokane' }, { value: 'tacoma', label: 'Tacoma' }],
            OR: [{ value: 'portland', label: 'Portland' }, { value: 'eugene', label: 'Eugene' }, { value: 'salem', label: 'Salem' }],
            NY: [{ value: 'nyc', label: 'New York City' }, { value: 'buffalo', label: 'Buffalo' }, { value: 'rochester', label: 'Rochester' }],
            TX: [{ value: 'austin', label: 'Austin' }, { value: 'houston', label: 'Houston' }, { value: 'dallas', label: 'Dallas' }],
            IL: [{ value: 'chicago', label: 'Chicago' }, { value: 'springfield', label: 'Springfield' }, { value: 'rockford', label: 'Rockford' }],
            CA: [{ value: 'los_angeles', label: 'Los Angeles' }, { value: 'san_francisco', label: 'San Francisco' }, { value: 'san_diego', label: 'San Diego' }],
            FL: [{ value: 'miami', label: 'Miami' }, { value: 'orlando', label: 'Orlando' }, { value: 'tampa', label: 'Tampa' }],
            PA: [{ value: 'philadelphia', label: 'Philadelphia' }, { value: 'pittsburgh', label: 'Pittsburgh' }, { value: 'allentown', label: 'Allentown' }],
            OH: [{ value: 'columbus', label: 'Columbus' }, { value: 'cleveland', label: 'Cleveland' }, { value: 'cincinnati', label: 'Cincinnati' }],
            GA: [{ value: 'atlanta', label: 'Atlanta' }, { value: 'savannah', label: 'Savannah' }, { value: 'augusta', label: 'Augusta' }],
            AZ: [{ value: 'phoenix', label: 'Phoenix' }, { value: 'tucson', label: 'Tucson' }, { value: 'scottsdale', label: 'Scottsdale' }],
            CO: [{ value: 'denver', label: 'Denver' }, { value: 'boulder', label: 'Boulder' }, { value: 'aurora', label: 'Aurora' }],
            MI: [{ value: 'detroit', label: 'Detroit' }, { value: 'grand_rapids', label: 'Grand Rapids' }, { value: 'ann_arbor', label: 'Ann Arbor' }],
            MN: [{ value: 'minneapolis', label: 'Minneapolis' }, { value: 'saint_paul', label: 'Saint Paul' }, { value: 'duluth', label: 'Duluth' }],
            NC: [{ value: 'charlotte', label: 'Charlotte' }, { value: 'raleigh', label: 'Raleigh' }, { value: 'durham', label: 'Durham' }],
            VA: [{ value: 'virginia_beach', label: 'Virginia Beach' }, { value: 'richmond', label: 'Richmond' }, { value: 'arlington', label: 'Arlington' }],
            MA: [{ value: 'boston', label: 'Boston' }, { value: 'worcester', label: 'Worcester' }, { value: 'cambridge', label: 'Cambridge' }],
            TN: [{ value: 'nashville', label: 'Nashville' }, { value: 'memphis', label: 'Memphis' }, { value: 'knoxville', label: 'Knoxville' }],
            NV: [{ value: 'las_vegas', label: 'Las Vegas' }, { value: 'reno', label: 'Reno' }, { value: 'henderson', label: 'Henderson' }],
            MO: [{ value: 'kansas_city', label: 'Kansas City' }, { value: 'st_louis', label: 'St. Louis' }, { value: 'springfield_mo', label: 'Springfield' }],
        };

        const CITY_RECYCLING = {
            seattle: { verdict: 'yes', bin: 'Blue recycling bin', note: 'Robust curbside program; glass drop-off only' },
            spokane: { verdict: 'yes', bin: 'Blue recycling bin', note: 'Single-stream accepted' },
            tacoma: { verdict: 'maybe', bin: 'Blue bin (check item)', note: 'Limited plastics accepted' },
            portland: { verdict: 'yes', bin: 'Blue recycling bin', note: 'Strong curbside program' },
            eugene: { verdict: 'yes', bin: 'Blue bin', note: 'Single-stream, rinse required' },
            salem: { verdict: 'maybe', bin: 'Blue bin', note: 'Check local rules — limited plastics' },
            nyc: { verdict: 'yes', bin: 'Recycling bin', note: 'Broad curbside; no plastic bags' },
            buffalo: { verdict: 'yes', bin: 'Blue bin', note: 'Single-stream program' },
            rochester: { verdict: 'yes', bin: 'Blue bin', note: 'Single-stream; rinse items' },
            austin: { verdict: 'yes', bin: 'Single-stream bin', note: 'No rinsing required' },
            houston: { verdict: 'maybe', bin: 'Blue recycling cart', note: 'Limited plastics; check label' },
            dallas: { verdict: 'yes', bin: 'Blue recycling bin', note: 'Single-stream accepted' },
            chicago: { verdict: 'yes', bin: 'Blue Cart', note: 'Accepted curbside' },
            springfield: { verdict: 'maybe', bin: 'Blue bin', note: 'Check local schedule' },
            rockford: { verdict: 'maybe', bin: 'Blue bin', note: 'Limited items accepted' },
            los_angeles: { verdict: 'yes', bin: 'Blue bin', note: 'Large curbside program' },
            san_francisco: { verdict: 'yes', bin: 'Blue bin', note: 'One of the best recycling programs in the US' },
            san_diego: { verdict: 'yes', bin: 'Blue bin', note: 'Single-stream curbside' },
            miami: { verdict: 'maybe', bin: 'Blue bin', note: 'Limited plastic types accepted' },
            orlando: { verdict: 'yes', bin: 'Blue bin', note: 'Single-stream curbside' },
            tampa: { verdict: 'yes', bin: 'Blue bin', note: 'Single-stream accepted' },
            philadelphia: { verdict: 'yes', bin: 'Blue bin', note: 'Single-stream; rinse required' },
            pittsburgh: { verdict: 'yes', bin: 'Blue bin', note: 'Single-stream program' },
            allentown: { verdict: 'maybe', bin: 'Blue bin', note: 'Check specific materials' },
            columbus: { verdict: 'yes', bin: 'Blue bin', note: 'Single-stream curbside' },
            cleveland: { verdict: 'yes', bin: 'Blue bin', note: 'Single-stream accepted' },
            cincinnati: { verdict: 'maybe', bin: 'Blue bin', note: 'Limited plastics' },
            atlanta: { verdict: 'yes', bin: 'Blue bin', note: 'Single-stream program' },
            savannah: { verdict: 'maybe', bin: 'Blue bin', note: 'Check local rules' },
            augusta: { verdict: 'maybe', bin: 'Blue bin', note: 'Limited items accepted' },
            phoenix: { verdict: 'yes', bin: 'Blue bin', note: 'Single-stream curbside' },
            tucson: { verdict: 'yes', bin: 'Blue bin', note: 'Broad curbside program' },
            scottsdale: { verdict: 'yes', bin: 'Blue bin', note: 'Single-stream accepted' },
            denver: { verdict: 'yes', bin: 'Blue bin', note: 'Single-stream; strong program' },
            boulder: { verdict: 'yes', bin: 'Blue bin', note: 'One of the best programs in CO' },
            aurora: { verdict: 'yes', bin: 'Blue bin', note: 'Single-stream curbside' },
            detroit: { verdict: 'maybe', bin: 'Blue bin', note: 'Check specific materials' },
            grand_rapids: { verdict: 'yes', bin: 'Blue bin', note: 'Single-stream accepted' },
            ann_arbor: { verdict: 'yes', bin: 'Blue bin', note: 'Comprehensive curbside' },
            minneapolis: { verdict: 'yes', bin: 'Blue bin', note: 'Organics + recycling program' },
            saint_paul: { verdict: 'yes', bin: 'Blue bin', note: 'Single-stream curbside' },
            duluth: { verdict: 'maybe', bin: 'Blue bin', note: 'Limited plastics accepted' },
            charlotte: { verdict: 'yes', bin: 'Blue bin', note: 'Single-stream program' },
            raleigh: { verdict: 'yes', bin: 'Blue bin', note: 'Single-stream curbside' },
            durham: { verdict: 'yes', bin: 'Blue bin', note: 'Single-stream accepted' },
            virginia_beach: { verdict: 'yes', bin: 'Blue bin', note: 'Single-stream curbside' },
            richmond: { verdict: 'yes', bin: 'Blue bin', note: 'Single-stream accepted' },
            arlington: { verdict: 'yes', bin: 'Blue bin', note: 'Strong DC-area program' },
            boston: { verdict: 'yes', bin: 'Blue bin', note: 'Single-stream curbside' },
            worcester: { verdict: 'maybe', bin: 'Blue bin', note: 'Check specific materials' },
            cambridge: { verdict: 'yes', bin: 'Blue bin', note: 'Comprehensive curbside program' },
            nashville: { verdict: 'yes', bin: 'Blue bin', note: 'Single-stream accepted' },
            memphis: { verdict: 'maybe', bin: 'Blue bin', note: 'Limited program; check items' },
            knoxville: { verdict: 'yes', bin: 'Blue bin', note: 'Single-stream curbside' },
            las_vegas: { verdict: 'maybe', bin: 'Blue bin', note: 'Limited curbside; check materials' },
            reno: { verdict: 'yes', bin: 'Blue bin', note: 'Single-stream curbside' },
            henderson: { verdict: 'maybe', bin: 'Blue bin', note: 'Check specific materials' },
            kansas_city: { verdict: 'yes', bin: 'Blue bin', note: 'Single-stream accepted' },
            st_louis: { verdict: 'yes', bin: 'Blue bin', note: 'Single-stream curbside' },
            springfield_mo: { verdict: 'maybe', bin: 'Blue bin', note: 'Limited program' },
        };

        const CITY_NAMES = {};
        Object.entries(STATE_CITIES).forEach(([stAbbr, cities]) => {
            cities.forEach(c => { CITY_NAMES[c.value] = `${c.label}, ${stAbbr}`; });
        });

        const CITY_KEYWORDS = {
            seattle: ['seattle'], spokane: ['spokane'], tacoma: ['tacoma'],
            portland: ['portland'], eugene: ['eugene'], salem: ['salem'],
            nyc: ['new york', 'york city', 'manhattan', 'brooklyn', 'queens', 'bronx', 'staten island'],
            buffalo: ['buffalo'], rochester: ['rochester'],
            austin: ['austin'], houston: ['houston'], dallas: ['dallas'],
            chicago: ['chicago'], springfield: ['springfield'], rockford: ['rockford'],
            los_angeles: ['los angeles', 'la '], san_francisco: ['san francisco', 'sf '], san_diego: ['san diego'],
            miami: ['miami'], orlando: ['orlando'], tampa: ['tampa'],
            philadelphia: ['philadelphia', 'philly'], pittsburgh: ['pittsburgh'], allentown: ['allentown'],
            columbus: ['columbus'], cleveland: ['cleveland'], cincinnati: ['cincinnati'],
            atlanta: ['atlanta'], savannah: ['savannah'], augusta: ['augusta'],
            phoenix: ['phoenix'], tucson: ['tucson'], scottsdale: ['scottsdale'],
            denver: ['denver'], boulder: ['boulder'], aurora: ['aurora'],
            detroit: ['detroit'], grand_rapids: ['grand rapids'], ann_arbor: ['ann arbor'],
            minneapolis: ['minneapolis'], saint_paul: ['saint paul', 'st. paul', 'st paul'], duluth: ['duluth'],
            charlotte: ['charlotte'], raleigh: ['raleigh'], durham: ['durham'],
            virginia_beach: ['virginia beach'], richmond: ['richmond'], arlington: ['arlington'],
            boston: ['boston'], worcester: ['worcester'], cambridge: ['cambridge'],
            nashville: ['nashville'], memphis: ['memphis'], knoxville: ['knoxville'],
            las_vegas: ['las vegas'], reno: ['reno'], henderson: ['henderson'],
            kansas_city: ['kansas city'], st_louis: ['st. louis', 'st louis', 'saint louis'], springfield_mo: ['springfield'],
        };

        function buildStateDropdown() {
            const sel = document.getElementById('state-select');
            ALL_STATES.forEach(([abbr, name]) => {
                const opt = document.createElement('option');
                opt.value = abbr; opt.textContent = name;
                sel.appendChild(opt);
            });
        }

        function populateCities(stateAbbr, selectedCity) {
            const citySelect = document.getElementById('city-select');
            citySelect.innerHTML = '<option value="">— Select city —</option>';
            const cities = STATE_CITIES[stateAbbr];
            if (!stateAbbr || !cities) { citySelect.disabled = true; return; }
            cities.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.value; opt.textContent = c.label;
                citySelect.appendChild(opt);
            });
            citySelect.disabled = false;
            if (selectedCity) {
                citySelect.value = selectedCity;
            } else {
                citySelect.selectedIndex = 0;
            }
        }

        function setLocation(stateAbbr, cityValue) {
            const stateSelect = document.getElementById('state-select');
            stateSelect.value = stateAbbr;
            populateCities(stateAbbr, cityValue);
            const badgeText = cityValue ? CITY_NAMES[cityValue] : (STATE_NAMES[stateAbbr] || stateAbbr);
            document.getElementById('gps-text').textContent = badgeText;
            const activeChip = document.querySelector('.item-chip.active');
            if (activeChip && cityValue) selectItem(activeChip.dataset.id);
        }

        document.getElementById('state-select').addEventListener('change', (e) => {
            populateCities(e.target.value, null);
            const activeChip = document.querySelector('.item-chip.active');
            if (activeChip && document.getElementById('city-select').value) selectItem(activeChip.dataset.id);
        });

        document.getElementById('city-select').addEventListener('change', () => {
            const activeChip = document.querySelector('.item-chip.active');
            if (activeChip) selectItem(activeChip.dataset.id);
        });

        function matchCity(stateAbbr, rawCity) {
            const cities = STATE_CITIES[stateAbbr];
            if (!cities) return null;
            for (const c of cities) {
                const kws = CITY_KEYWORDS[c.value] || [c.label.toLowerCase()];
                if (kws.some(k => rawCity.includes(k))) return c.value;
            }
            return cities[0].value;
        }

        async function detectLocation() {
            const badge = document.getElementById('gps-text');
            if (!navigator.geolocation) { badge.textContent = 'No GPS'; return; }
            badge.textContent = 'Locating...';
            navigator.geolocation.getCurrentPosition(async (pos) => {
                const { latitude: lat, longitude: lng } = pos.coords;
                currentPos = { lat, lng };
                try {
                    const res = await fetch(
                        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`,
                        { headers: { 'Accept-Language': 'en-US,en' } }
                    );
                    const data = await res.json();
                    const addr = data.address || {};
                    const stateName = addr.state || '';
                    const stateAbbr = ABBREV_MAP[stateName] || null;
                    const rawCity = (addr.city || addr.town || addr.village || addr.county || '').toLowerCase();
                    if (stateAbbr) {
                        const matchedCity = matchCity(stateAbbr, rawCity);
                        setLocation(stateAbbr, matchedCity);
                    } else {
                        badge.textContent = stateName || addr.country || 'Not covered';
                    }
                } catch (e) {
                    fallbackGeoDetect(lat, lng);
                }
            }, () => { badge.textContent = 'Location off'; });
        }

        function fallbackGeoDetect(lat, lng) {
            currentPos = { lat, lng };
            const regions = [
                { state: 'WA', city: 'seattle', latMin: 45.5, latMax: 49, lngMin: -125, lngMax: -116 },
                { state: 'OR', city: 'portland', latMin: 42, latMax: 46, lngMin: -124.5, lngMax: -116.5 },
                { state: 'NY', city: 'nyc', latMin: 40.4, latMax: 41.0, lngMin: -74.3, lngMax: -73.7 },
                { state: 'TX', city: 'austin', latMin: 29.9, latMax: 30.6, lngMin: -97.9, lngMax: -97.4 },
                { state: 'IL', city: 'chicago', latMin: 41.6, latMax: 42.1, lngMin: -88.2, lngMax: -87.5 },
                { state: 'CA', city: 'los_angeles', latMin: 33.7, latMax: 34.2, lngMin: -118.7, lngMax: -118.0 },
                { state: 'CA', city: 'san_francisco', latMin: 37.6, latMax: 37.9, lngMin: -122.6, lngMax: -122.3 },
                { state: 'FL', city: 'miami', latMin: 25.6, latMax: 26.0, lngMin: -80.4, lngMax: -80.1 },
                { state: 'CO', city: 'denver', latMin: 39.6, latMax: 39.9, lngMin: -105.1, lngMax: -104.7 },
                { state: 'MA', city: 'boston', latMin: 42.2, latMax: 42.5, lngMin: -71.2, lngMax: -70.9 },
                { state: 'GA', city: 'atlanta', latMin: 33.6, latMax: 34.0, lngMin: -84.6, lngMax: -84.2 },
                { state: 'AZ', city: 'phoenix', latMin: 33.3, latMax: 33.7, lngMin: -112.4, lngMax: -111.8 },
                { state: 'WA', city: 'seattle', latMin: 47.4, latMax: 47.8, lngMin: -122.5, lngMax: -122.1 },
            ];
            const match = regions.find(r => lat >= r.latMin && lat <= r.latMax && lng >= r.lngMin && lng <= r.lngMax);
            if (match) {
                setLocation(match.state, match.city);
            } else {
                document.getElementById('gps-text').textContent = 'Not covered';
            }
        }

        buildStateDropdown();
        buildItemGrid();
        detectLocation();
        loadModel();