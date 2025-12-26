// Configuration - Update this with your Google Apps Script URL for period tracking
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxUjtZQuZlZQBlCTnWq3wS_KpA0pcy-RFwh2ZBuRwavP2Ia0D-55SyvKtaxQ5ribUaujg/exec'

// DOM Elements
const entriesContainer = document.getElementById('entries-container');
const loading = document.getElementById('loading');
const errorElement = document.getElementById('error');
const successElement = document.getElementById('success');
const addForm = document.getElementById('add-form');

// Stats elements
const totalEntriesElement = document.getElementById('total-entries');

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
        entry && typeof entry === 'object' && entry.date && entry.symptoms
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
        
        return `
            <div class="entry-card">
                <div class="entry-header">
                    <div class="entry-date">
                        <span class="entry-icon">📅</span>
                        <span class="date-text">${formattedDate}</span>
                    </div>
                    <div class="entry-actions">
                        <button class="btn-small btn-danger" onclick="deleteEntry('${escapeHtml(entry.date)}')" title="Delete entry">
                            🗑️
                        </button>
                    </div>
                </div>
                <div class="entry-symptoms">${escapeHtml(entry.symptoms)}</div>
            </div>
        `;
    }).join('');
}

// Update statistics
function updateStats() {
    const total = entries.length;
    if (totalEntriesElement) {
        totalEntriesElement.textContent = total;
    }
}

// Add new entry
async function addEntry(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const date = formData.get('date');
    const symptoms = formData.get('symptoms');
    
    if (!date || !symptoms) {
        showError('Date and symptoms are required');
        return;
    }
    
    // Check if entry for this date already exists
    const existingEntry = entries.find(entry => entry.date === date);
    if (existingEntry) {
        showError('Entry for this date already exists');
        return;
    }
    
    try {
        showLoading();
        
        const url = `${SCRIPT_URL}?action=save&date=${encodeURIComponent(date)}&symptoms=${encodeURIComponent(symptoms)}`;
        
        const response = await fetch(url, {
            method: 'GET',
            mode: 'no-cors'
        });
        
        console.log('Add entry request sent successfully');
        
        // Add to local data
        const newEntry = { date, symptoms };
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
