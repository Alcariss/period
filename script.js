// Configuration - Update this with your Google Apps Script URL for period tracking
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxC9Ay234F8_px6ugCSos-_mRC3TaR4WN26ibwD6DRIqf-tyCEtBTe4k2XssvS03DSuGg/exec'

// DOM Elements
const entriesContainer = document.getElementById('entries-container');
const loading = document.getElementById('loading');
const errorElement = document.getElementById('error');
const successElement = document.getElementById('success');
const addForm = document.getElementById('add-form');

// Prediction elements
const predictionInfoElement = document.getElementById('prediction-info');
const predictionDetailsElement = document.getElementById('prediction-details');

// Global state
let entries = [];
let autoRefreshInterval = null;
let lastDataHash = null;

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing period tracker app');
    
    // Ensure version click handler is attached
    const versionElement = document.getElementById('version-info');
    if (versionElement) {
        console.log('Version element found, ensuring click handler');
        versionElement.addEventListener('click', forceUpdate);
        versionElement.style.cursor = 'pointer';
        
        // Add visual feedback for iOS
        versionElement.addEventListener('touchstart', () => {
            versionElement.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
        });
        versionElement.addEventListener('touchend', () => {
            setTimeout(() => {
                versionElement.style.backgroundColor = '';
            }, 150);
        });
    } else {
        console.warn('Version element not found!');
    }
    
    loadEntries();
    
    // Set today's date as default
    const dateInput = document.getElementById('date');
    if (dateInput) {
        dateInput.valueAsDate = new Date();
    }
    
    // Start auto-refresh to detect external changes
    startAutoRefresh();
});

// Load entries from Google Apps Script using JSONP
async function loadEntries(silent = false) {
    if (!silent) {
        showLoading();
        hideError();
    }
    
    try {
        // Use JSONP to completely bypass CORS
        const callbackName = 'jsonp_' + Math.random().toString(36).substr(2, 9);
        const url = `${SCRIPT_URL}?action=fetch&callback=${callbackName}`;
        
        console.log('Loading from URL:', url);
        
        const data = await new Promise((resolve, reject) => {
            // Set up global callback
            window[callbackName] = function(response) {
                console.log('JSONP response:', response);
                resolve(response);
                // Cleanup
                delete window[callbackName];
                if (script.parentNode) {
                    script.parentNode.removeChild(script);
                }
            };
            
            // Create script tag
            const script = document.createElement('script');
            script.src = url;
            script.onerror = function() {
                reject(new Error('Failed to load data from Google Apps Script'));
                delete window[callbackName];
                if (script.parentNode) {
                    script.parentNode.removeChild(script);
                }
            };
            
            // Add timeout
            setTimeout(() => {
                if (window[callbackName]) {
                    reject(new Error('Request timeout'));
                    delete window[callbackName];
                    if (script.parentNode) {
                        script.parentNode.removeChild(script);
                    }
                }
            }, 10000);
            
            document.head.appendChild(script);
        });
        
        entries = Array.isArray(data) ? data : [];
        console.log('Raw data from script:', data);
        console.log('Processed entries:', entries);
        console.log('Number of entries:', entries.length);
        
        // Calculate data hash to detect changes
        const currentDataHash = JSON.stringify(entries);
        if (lastDataHash && lastDataHash !== currentDataHash && !silent) {
            showSuccessMessage('Data updated from spreadsheet');
        }
        lastDataHash = currentDataHash;
        
        // Sort entries by date (newest first)
        entries.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        displayEntries(entries);
        updateStats();
        
        if (!silent) {
            hideLoading();
        }
        
    } catch (error) {
        console.error('Error loading entries:', error);
        if (!silent) {
            showError('Error loading entries: ' + error.message);
            hideLoading();
        }
    }
}

// Display entries in the grid
function displayEntries(entriesToShow) {
    console.log('displayEntries called with:', entriesToShow);
    
    if (!Array.isArray(entriesToShow) || entriesToShow.length === 0) {
        entriesContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🌸</div>
                <h3>No entries yet</h3>
                <p>Start tracking by adding your first symptom entry</p>
            </div>
        `;
        return;
    }
    
    // Filter out any invalid entries
    const validEntries = entriesToShow.filter(entry => 
        entry && typeof entry === 'object' && entry.date
    );
    
    console.log('Valid entries after filtering:', validEntries);
    
    if (validEntries.length === 0) {
        entriesContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">⚠️</div>
                <h3>Invalid data</h3>
                <p>Data from spreadsheet is not in the correct format</p>
            </div>
        `;
        return;
    }
    
    entriesContainer.innerHTML = validEntries.map(entry => {
        const formattedDate = new Date(entry.date).toLocaleDateString('en-US', {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
        
        // Function to get intensity display
        const getIntensityDisplay = (value, type = 'default') => {
            const intensity = parseInt(value) || 0;
            if (intensity === 0) return { text: 'None', class: 'none' };
            
            // Special handling for bleeding (5-point scale)
            if (type === 'bleeding') {
                switch (intensity) {
                    case 1: return { text: 'Spotting', class: 'spotting' };
                    case 2: return { text: 'Light', class: 'light' };
                    case 3: return { text: 'Moderate', class: 'moderate' };
                    case 4: return { text: 'Heavy', class: 'heavy' };
                    case 5: return { text: 'Very Heavy', class: 'very-heavy' };
                }
            }
            
            // Special handling for energy
            if (type === 'energy') {
                switch (intensity) {
                    case 1: return { text: 'Low', class: 'mild' };
                    case 2: return { text: 'Very Low', class: 'moderate' };
                    case 3: return { text: 'Exhausted', class: 'severe' };
                }
            }
            
            // Default intensity display (for other symptoms)
            switch (intensity) {
                case 1: return { text: '1 (Mild)', class: 'mild' };
                case 2: return { text: '2 (Moderate)', class: 'moderate' };
                case 3: return { text: '3 (Severe)', class: 'severe' };
                default: return { text: 'None', class: 'none' };
            }
        };
        
        // Generate symptom display
        const symptoms = [
            { name: '🩸 Krvácení', value: entry.krvaceni || '0', type: 'bleeding', field: 'krvaceni' },
            { name: '🌙 Nálady', value: entry.nalady || '0', type: 'default', field: 'nalady' },
            { name: '💢 Tlak v břiše', value: entry.tlak || '0', type: 'default', field: 'tlak' },
            { name: '🎈 Nadýmání', value: entry.nadymani || '0', type: 'default', field: 'nadymani' },
            { name: '⚡ Energie', value: entry.energie || '0', type: 'energy', field: 'energie' }
        ];
        
        const entryId = `entry-${entry.date}`;
        
        const symptomHTML = symptoms.map(symptom => {
            let optionsHTML = '';
            
            if (symptom.type === 'bleeding') {
                // 5-point scale for bleeding
                optionsHTML = `
                    <input type="radio" id="${entryId}-${symptom.field}-0" name="${entryId}-${symptom.field}" value="0" ${symptom.value === '0' ? 'checked' : ''} onchange="handleEntryChange('${entry.date}')">
                    <label for="${entryId}-${symptom.field}-0" class="intensity-btn-small none">None</label>
                    
                    <input type="radio" id="${entryId}-${symptom.field}-1" name="${entryId}-${symptom.field}" value="1" ${symptom.value === '1' ? 'checked' : ''} onchange="handleEntryChange('${entry.date}')">
                    <label for="${entryId}-${symptom.field}-1" class="intensity-btn-small spotting">Spotting</label>
                    
                    <input type="radio" id="${entryId}-${symptom.field}-2" name="${entryId}-${symptom.field}" value="2" ${symptom.value === '2' ? 'checked' : ''} onchange="handleEntryChange('${entry.date}')">
                    <label for="${entryId}-${symptom.field}-2" class="intensity-btn-small light">Light</label>
                    
                    <input type="radio" id="${entryId}-${symptom.field}-3" name="${entryId}-${symptom.field}" value="3" ${symptom.value === '3' ? 'checked' : ''} onchange="handleEntryChange('${entry.date}')">
                    <label for="${entryId}-${symptom.field}-3" class="intensity-btn-small moderate">Moderate</label>
                    
                    <input type="radio" id="${entryId}-${symptom.field}-4" name="${entryId}-${symptom.field}" value="4" ${symptom.value === '4' ? 'checked' : ''} onchange="handleEntryChange('${entry.date}')">
                    <label for="${entryId}-${symptom.field}-4" class="intensity-btn-small heavy">Heavy</label>
                    
                    <input type="radio" id="${entryId}-${symptom.field}-5" name="${entryId}-${symptom.field}" value="5" ${symptom.value === '5' ? 'checked' : ''} onchange="handleEntryChange('${entry.date}')">
                    <label for="${entryId}-${symptom.field}-5" class="intensity-btn-small very-heavy">Very Heavy</label>
                `;
            } else if (symptom.type === 'energy') {
                // 3-point scale for energy with custom labels
                optionsHTML = `
                    <input type="radio" id="${entryId}-${symptom.field}-0" name="${entryId}-${symptom.field}" value="0" ${symptom.value === '0' ? 'checked' : ''} onchange="handleEntryChange('${entry.date}')">
                    <label for="${entryId}-${symptom.field}-0" class="intensity-btn-small none">Normal</label>
                    
                    <input type="radio" id="${entryId}-${symptom.field}-1" name="${entryId}-${symptom.field}" value="1" ${symptom.value === '1' ? 'checked' : ''} onchange="handleEntryChange('${entry.date}')">
                    <label for="${entryId}-${symptom.field}-1" class="intensity-btn-small mild">Low</label>
                    
                    <input type="radio" id="${entryId}-${symptom.field}-2" name="${entryId}-${symptom.field}" value="2" ${symptom.value === '2' ? 'checked' : ''} onchange="handleEntryChange('${entry.date}')">
                    <label for="${entryId}-${symptom.field}-2" class="intensity-btn-small moderate">Very Low</label>
                    
                    <input type="radio" id="${entryId}-${symptom.field}-3" name="${entryId}-${symptom.field}" value="3" ${symptom.value === '3' ? 'checked' : ''} onchange="handleEntryChange('${entry.date}')">
                    <label for="${entryId}-${symptom.field}-3" class="intensity-btn-small severe">Exhausted</label>
                `;
            } else {
                // 3-point scale for other symptoms
                optionsHTML = `
                    <input type="radio" id="${entryId}-${symptom.field}-0" name="${entryId}-${symptom.field}" value="0" ${symptom.value === '0' ? 'checked' : ''} onchange="handleEntryChange('${entry.date}')">
                    <label for="${entryId}-${symptom.field}-0" class="intensity-btn-small none">None</label>
                    
                    <input type="radio" id="${entryId}-${symptom.field}-1" name="${entryId}-${symptom.field}" value="1" ${symptom.value === '1' ? 'checked' : ''} onchange="handleEntryChange('${entry.date}')">
                    <label for="${entryId}-${symptom.field}-1" class="intensity-btn-small mild">1</label>
                    
                    <input type="radio" id="${entryId}-${symptom.field}-2" name="${entryId}-${symptom.field}" value="2" ${symptom.value === '2' ? 'checked' : ''} onchange="handleEntryChange('${entry.date}')">
                    <label for="${entryId}-${symptom.field}-2" class="intensity-btn-small moderate">2</label>
                    
                    <input type="radio" id="${entryId}-${symptom.field}-3" name="${entryId}-${symptom.field}" value="3" ${symptom.value === '3' ? 'checked' : ''} onchange="handleEntryChange('${entry.date}')">
                    <label for="${entryId}-${symptom.field}-3" class="intensity-btn-small severe">3</label>
                `;
            }
            
            return `
                <div class="symptom-item-editable">
                    <div class="symptom-name">${symptom.name}:</div>
                    <div class="intensity-buttons-small">
                        ${optionsHTML}
                    </div>
                </div>
            `;
        }).join('');
        
        // Add notes editing
        const notesHTML = `
            <div class="entry-notes-editable">
                <label class="notes-label">📝 Notes:</label>
                <textarea class="notes-textarea" id="${entryId}-notes" onchange="handleEntryChange('${entry.date}')" placeholder="Add notes...">${escapeHtml(entry.notes || '')}</textarea>
            </div>
        `;
        
        return `
            <div class="entry-card" data-date="${entry.date}" id="${entryId}">
                <div class="entry-header">
                    <div class="entry-date">
                        <span class="entry-icon">📅</span>
                        <span class="date-text">${formattedDate}</span>
                    </div>
                    <div class="entry-actions">
                        <button class="btn-small btn-save" id="${entryId}-save" onclick="saveEntry('${entry.date}')" style="display: none;" title="Save changes">
                            💾 Save
                        </button>
                        <button class="btn-small btn-danger" onclick="deleteEntry('${escapeHtml(entry.date)}')" title="Delete entry">
                            🗑️
                        </button>
                    </div>
                </div>
                <div class="entry-symptoms-editable">
                    ${symptomHTML}
                </div>
                ${notesHTML}
            </div>
        `;
    }).join('');
}

// Update statistics
function updateStats() {
    calculatePeriodPrediction();
}

// Calculate period prediction based on cycle analysis
function calculatePeriodPrediction() {
    if (entries.length === 0) {
        predictionInfoElement.textContent = 'No data available';
        predictionDetailsElement.innerHTML = '<p>Add some entries to get cycle predictions</p>';
        return;
    }

    // Find all entries with bleeding (value > 0)
    const bleedingEntries = entries
        .filter(entry => parseInt(entry.krvaceni || 0) > 0)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (bleedingEntries.length === 0) {
        predictionInfoElement.textContent = 'No period data found';
        predictionDetailsElement.innerHTML = '<p>Track bleeding to get cycle predictions</p>';
        return;
    }

    // Group consecutive bleeding days into periods
    const periods = [];
    let currentPeriod = [bleedingEntries[0]];
    
    for (let i = 1; i < bleedingEntries.length; i++) {
        const currentDate = new Date(bleedingEntries[i].date);
        const previousDate = new Date(bleedingEntries[i-1].date);
        const dayDifference = (currentDate - previousDate) / (1000 * 60 * 60 * 24);
        
        if (dayDifference <= 2) { // Same period if within 2 days
            currentPeriod.push(bleedingEntries[i]);
        } else {
            periods.push(currentPeriod);
            currentPeriod = [bleedingEntries[i]];
        }
    }
    periods.push(currentPeriod);

    if (periods.length < 2) {
        predictionInfoElement.textContent = 'Need more cycle data';
        predictionDetailsElement.innerHTML = `
            <p>Found ${periods.length} period${periods.length === 1 ? '' : 's'}. Need at least 2 cycles for prediction.</p>
            <p><strong>Last period:</strong> ${new Date(periods[0][0].date).toLocaleDateString()}</p>
        `;
        return;
    }

    // Calculate cycle lengths (days between period starts)
    const cycleLengths = [];
    for (let i = 1; i < periods.length; i++) {
        const currentPeriodStart = new Date(periods[i][0].date);
        const previousPeriodStart = new Date(periods[i-1][0].date);
        const cycleLength = (currentPeriodStart - previousPeriodStart) / (1000 * 60 * 60 * 24);
        cycleLengths.push(cycleLength);
    }

    // Calculate average cycle length
    const averageCycleLength = Math.round(cycleLengths.reduce((sum, length) => sum + length, 0) / cycleLengths.length);
    
    // Predict next period
    const lastPeriodStart = new Date(periods[periods.length - 1][0].date);
    const predictedNextPeriod = new Date(lastPeriodStart.getTime() + averageCycleLength * 24 * 60 * 60 * 1000);
    const today = new Date();
    const daysUntilPrediction = Math.ceil((predictedNextPeriod - today) / (1000 * 60 * 60 * 24));
    
    // Calculate cycle variability
    const minCycle = Math.min(...cycleLengths);
    const maxCycle = Math.max(...cycleLengths);
    const variation = maxCycle - minCycle;
    
    // Update display
    if (daysUntilPrediction > 0) {
        predictionInfoElement.innerHTML = `
            <span style="color: #667eea; font-size: 1.2em; font-weight: 600;">
                ${daysUntilPrediction} days
            </span>
            <div style="font-size: 0.9em; color: #718096; margin-top: 2px;">
                ${predictedNextPeriod.toLocaleDateString()}
            </div>
        `;
    } else if (daysUntilPrediction === 0) {
        predictionInfoElement.innerHTML = `
            <span style="color: #e53e3e; font-size: 1.2em; font-weight: 600;">
                Today!
            </span>
            <div style="font-size: 0.9em; color: #718096; margin-top: 2px;">
                ${predictedNextPeriod.toLocaleDateString()}
            </div>
        `;
    } else {
        predictionInfoElement.innerHTML = `
            <span style="color: #d69e2e; font-size: 1.2em; font-weight: 600;">
                ${Math.abs(daysUntilPrediction)} days overdue
            </span>
            <div style="font-size: 0.9em; color: #718096; margin-top: 2px;">
                Expected: ${predictedNextPeriod.toLocaleDateString()}
            </div>
        `;
    }
    
    predictionDetailsElement.innerHTML = `
        <p><strong>📊 Cycle Analysis:</strong></p>
        <p>• Average cycle: ${averageCycleLength} days (${minCycle}-${maxCycle} days range)</p>
        <p>• Based on ${periods.length} periods, ${cycleLengths.length} cycles analyzed</p>
        <p>• Last period: ${lastPeriodStart.toLocaleDateString()}</p>
        ${variation > 7 ? '<p style="color: #d69e2e;">⚠️ High cycle variation - prediction less reliable</p>' : ''}
    `;
}

// Handle entry changes (show save button)
function handleEntryChange(date) {
    const entryId = `entry-${date}`;
    const saveBtn = document.getElementById(`${entryId}-save`);
    if (saveBtn) {
        saveBtn.style.display = 'inline-flex';
    }
}

// Save entry from inline editing
async function saveEntry(date) {
    const entryId = `entry-${date}`;
    
    // Collect and validate current values from the entry card
    const krvaceni = validateSymptomValue(document.querySelector(`input[name="${entryId}-krvaceni"]:checked`)?.value, 5);
    const nalady = validateSymptomValue(document.querySelector(`input[name="${entryId}-nalady"]:checked`)?.value, 3);
    const tlak = validateSymptomValue(document.querySelector(`input[name="${entryId}-tlak"]:checked`)?.value, 3);
    const nadymani = validateSymptomValue(document.querySelector(`input[name="${entryId}-nadymani"]:checked`)?.value, 3);
    const energie = validateSymptomValue(document.querySelector(`input[name="${entryId}-energie"]:checked`)?.value, 3);
    const notes = (document.getElementById(`${entryId}-notes`)?.value || '').substring(0, 1000);
    
    try {
        showLoading();
        
        const url = `${SCRIPT_URL}?action=save&date=${encodeURIComponent(date)}&krvaceni=${encodeURIComponent(krvaceni)}&nalady=${encodeURIComponent(nalady)}&tlak=${encodeURIComponent(tlak)}&nadymani=${encodeURIComponent(nadymani)}&energie=${encodeURIComponent(energie)}&notes=${encodeURIComponent(notes)}`;
        
        const response = await fetch(url, {
            method: 'GET',
            mode: 'no-cors'
        });
        
        console.log('Save entry request sent successfully');
        
        // Update local data
        const entryIndex = entries.findIndex(e => e.date === date);
        if (entryIndex >= 0) {
            entries[entryIndex] = { date, krvaceni, nalady, tlak, nadymani, energie, notes };
        }
        
        // Hide save button
        const saveBtn = document.getElementById(`${entryId}-save`);
        if (saveBtn) {
            saveBtn.style.display = 'none';
        }
        
        hideLoading();
        showSuccessMessage('Entry updated successfully');
        
    } catch (error) {
        console.error('Error saving entry:', error);
        hideLoading();
        showError('Error saving entry: ' + error.message);
    }
}

// Validate and clamp symptom value to valid range
function validateSymptomValue(value, maxValue = 3) {
    const num = parseInt(value) || 0;
    return Math.max(0, Math.min(maxValue, num)).toString();
}

// Add new entry
async function addEntry(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const date = formData.get('date');
    
    // Validate date
    if (!date) {
        showError('Date is required');
        return;
    }
    
    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) {
        showError('Invalid date format');
        return;
    }
    
    // Prevent future dates (allow today)
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (dateObj > today) {
        showError('Cannot add entries for future dates');
        return;
    }
    
    // Collect and validate symptom intensities
    const krvaceni = validateSymptomValue(formData.get('krvaceni'), 5); // 0-5 scale
    const nalady = validateSymptomValue(formData.get('nalady'), 3);
    const tlak = validateSymptomValue(formData.get('tlak'), 3);
    const nadymani = validateSymptomValue(formData.get('nadymani'), 3);
    const energie = validateSymptomValue(formData.get('energie'), 3);
    const notes = (formData.get('notes') || '').substring(0, 1000); // Limit notes length
    
    // Check if entry for this date already exists
    const existingEntry = entries.find(entry => entry.date === date);
    if (existingEntry) {
        showError('Entry for this date already exists');
        return;
    }
    
    try {
        showLoading();
        
        const url = `${SCRIPT_URL}?action=save&date=${encodeURIComponent(date)}&krvaceni=${encodeURIComponent(krvaceni)}&nalady=${encodeURIComponent(nalady)}&tlak=${encodeURIComponent(tlak)}&nadymani=${encodeURIComponent(nadymani)}&energie=${encodeURIComponent(energie)}&notes=${encodeURIComponent(notes)}`;
        
        const response = await fetch(url, {
            method: 'GET',
            mode: 'no-cors'
        });
        
        console.log('Add entry request sent successfully');
        
        // Add to local data
        const newEntry = { date, krvaceni, nalady, tlak, nadymani, energie, notes };
        entries.push(newEntry);
        entries.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        // Refresh display
        displayEntries(entries);
        updateStats();
        
        // Reset form and hide
        event.target.reset();
        hideAddForm();
        
        // Set today's date as default for next entry
        const dateInput = document.getElementById('date');
        if (dateInput) {
            dateInput.valueAsDate = new Date();
        }
        
        hideLoading();
        showSuccessMessage('Entry added successfully');
        
    } catch (error) {
        console.error('Error adding entry:', error);
        hideLoading();
        showError('Error adding entry: ' + error.message);
    }
}

// Delete entry
async function deleteEntry(date) {
    if (!confirm('Are you sure you want to delete this entry?')) {
        return;
    }
    
    try {
        const url = `${SCRIPT_URL}?action=delete&date=${encodeURIComponent(date)}`;
        
        const response = await fetch(url, {
            method: 'GET',
            mode: 'no-cors'
        });
        
        console.log('Delete request sent successfully');
        
        // Remove from local data
        entries = entries.filter(e => e.date !== date);
        
        // Refresh display
        displayEntries(entries);
        updateStats();
        
        showSuccessMessage('Entry deleted successfully');
        
    } catch (error) {
        console.error('Error deleting entry:', error);
        showError('Error deleting entry: ' + error.message);
        // Reload to sync with server
        loadEntries(true);
    }
}

// Toggle add form
function toggleAddForm() {
    const form = document.getElementById('add-form');
    if (form.style.display === 'none' || form.style.display === '') {
        form.style.display = 'block';
        form.scrollIntoView({ behavior: 'smooth' });
    } else {
        form.style.display = 'none';
    }
}

// Hide add form
function hideAddForm() {
    document.getElementById('add-form').style.display = 'none';
    // Reset form
    document.getElementById('add-form').querySelector('form').reset();
    // Set default radio buttons to "None" (value="0")
    document.querySelectorAll('#add-form input[type="radio"][value="0"]').forEach(radio => {
        radio.checked = true;
    });
}

// Utility functions
function showLoading() {
    loading.style.display = 'block';
}

function hideLoading() {
    loading.style.display = 'none';
}

function showError(message) {
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    hideSuccess();
    setTimeout(() => hideError(), 5000);
}

function hideError() {
    errorElement.style.display = 'none';
}

function showSuccessMessage(message) {
    successElement.textContent = message;
    successElement.style.display = 'block';
    hideError();
    setTimeout(() => hideSuccess(), 3000);
}

function hideSuccess() {
    successElement.style.display = 'none';
}

function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// Auto-refresh functionality
function startAutoRefresh() {
    // Check for updates every 30 seconds
    autoRefreshInterval = setInterval(() => {
        loadEntries(true);
    }, 30000);
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
}

// Force update app
function forceUpdate() {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        console.log('Forcing app update...');
        navigator.serviceWorker.controller.postMessage({ action: 'skipWaiting' });
        showSuccessMessage('App updated! Reloading...');
        setTimeout(() => {
            window.location.reload();
        }, 1000);
    } else {
        console.log('No service worker available for update');
        window.location.reload();
    }
}

// Handle page visibility for auto-refresh
document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        stopAutoRefresh();
    } else {
        startAutoRefresh();
        loadEntries(true); // Refresh when page becomes visible
    }
});
