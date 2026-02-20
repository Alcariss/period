function doGet(e) {
  try {
    const action = e.parameter.action;
    
    if (action === 'fetch') {
      // Fetch period entries from spreadsheet
      const spreadsheetId = '1nnf4THz2ecMmZUn0eE6eAjBKHZWCIvV1ua5o7LqKIRI';
      const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
      const sheet = spreadsheet.getSheets()[0];
      
      // Get callback parameter for JSONP (sanitize to prevent XSS)
      let callback = e.parameter.callback || '';
      // Only allow alphanumeric and underscore in callback name
      if (callback && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(callback)) {
        callback = ''; // Invalid callback, fall back to JSON
      }
      
      // Get all data from the sheet
      const lastRow = sheet.getLastRow();
      const entries = [];
      
      if (lastRow > 1) { // At least 2 rows (header + data)
        // Get data from all 7 columns: Date, Krvaceni, Nalady, Tlak, Nadymani, Energie, Notes
        const data = sheet.getRange(2, 1, lastRow - 1, 7).getValues(); // Skip header row, get all 7 columns
        
        entries.push(...data
          .map(row => ({
            date: row[0] ? formatDateToISO(row[0]) : '',
            krvaceni: row[1] ? row[1].toString() : '0',
            nalady: row[2] ? row[2].toString() : '0',
            tlak: row[3] ? row[3].toString() : '0',
            nadymani: row[4] ? row[4].toString() : '0',
            energie: row[5] ? row[5].toString() : '0',
            notes: row[6] ? row[6].toString() : ''
          }))
          .filter(entry => entry.date) // Remove empty rows
          .reverse()); // Newest on top
      }
      
      const jsonData = JSON.stringify(entries);
      
      // Handle JSONP callback
      if (callback) {
        return ContentService
          .createTextOutput(`${callback}(${jsonData})`)
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
      
      // Regular JSON response (with CORS headers as fallback)
      return ContentService
        .createTextOutput(jsonData)
        .setMimeType(ContentService.MimeType.JSON);
        
    } else if (action === 'save') {
      // Save period entry
      const date = e.parameter.date;
      // Validate and clamp symptom values
      const clampValue = (val, max) => Math.max(0, Math.min(max, parseInt(val) || 0)).toString();
      const krvaceni = clampValue(e.parameter.krvaceni, 5);  // 0-5 scale for bleeding
      const nalady = clampValue(e.parameter.nalady, 3);
      const tlak = clampValue(e.parameter.tlak, 3);
      const nadymani = clampValue(e.parameter.nadymani, 3);
      const energie = clampValue(e.parameter.energie, 3);
      const notes = (e.parameter.notes || '').substring(0, 1000); // Limit notes length
      
      if (!date) {
        const errorMsg = 'ERROR: Missing required parameter (date)';
        console.error(errorMsg);
        return ContentService
          .createTextOutput(errorMsg)
          .setMimeType(ContentService.MimeType.TEXT)
          .setHeaders({
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
          });
      }
      
      const spreadsheetId = '1nnf4THz2ecMmZUn0eE6eAjBKHZWCIvV1ua5o7LqKIRI';
      const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
      const sheet = spreadsheet.getSheets()[0];
      
      // Check if this is an update (find existing row) or new addition
      const lastRow = sheet.getLastRow();
      let foundRow = -1;
      
      if (lastRow > 1) {
        const data = sheet.getRange(2, 1, lastRow - 1, 7).getValues(); // Skip header row, get all 7 columns
        
        // Look for existing row with the same date (normalize date format for comparison)
        for (let i = 0; i < data.length; i++) {
          const rowDate = data[i][0] ? formatDateToISO(data[i][0]) : '';
          if (rowDate === date) {
            foundRow = i + 2; // +2 because we skipped header row and array is 0-indexed
            break;
          }
        }
      }
      
      if (foundRow > 0) {
        // Update existing row
        sheet.getRange(foundRow, 1, 1, 7).setValues([[date, krvaceni, nalady, tlak, nadymani, energie, notes]]);
        console.log('Successfully updated row', foundRow + ':', [date, krvaceni, nalady, tlak, nadymani, energie, notes]);
        
        return ContentService
          .createTextOutput('SUCCESS: Period entry updated in row ' + foundRow)
          .setMimeType(ContentService.MimeType.TEXT)
          .setHeaders({
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
          });
      } else {
        // Add new row
        sheet.appendRow([date, krvaceni, nalady, tlak, nadymani, energie, notes]);
        console.log('Successfully added new row:', [date, krvaceni, nalady, tlak, nadymani, energie, notes]);
        console.log('Total rows now:', sheet.getLastRow());
        
        return ContentService
          .createTextOutput('SUCCESS: Period entry added to row ' + sheet.getLastRow())
          .setMimeType(ContentService.MimeType.TEXT)
          .setHeaders({
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
          });
      }
        
    } else if (action === 'delete') {
      // Delete period entry
      const date = e.parameter.date;
      
      if (!date) {
        const errorMsg = 'ERROR: Missing required parameter (date)';
        console.error(errorMsg);
        return ContentService
          .createTextOutput(errorMsg)
          .setMimeType(ContentService.MimeType.TEXT)
          .setHeaders({
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
          });
      }
      
      const spreadsheetId = '1nnf4THz2ecMmZUn0eE6eAjBKHZWCIvV1ua5o7LqKIRI';
      const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
      const sheet = spreadsheet.getSheets()[0];
      
      // Find the row to delete
      const lastRow = sheet.getLastRow();
      let foundRow = -1;
      
      if (lastRow > 1) {
        const data = sheet.getRange(2, 1, lastRow - 1, 7).getValues(); // Skip header row, get all 7 columns
        
        // Look for the row with matching date (normalize date format for comparison)
        for (let i = 0; i < data.length; i++) {
          const rowDate = data[i][0] ? formatDateToISO(data[i][0]) : '';
          if (rowDate === date) {
            foundRow = i + 2; // +2 because we skipped header row and array is 0-indexed
            break;
          }
        }
      }
      
      if (foundRow > 0) {
        // Delete the row
        sheet.deleteRow(foundRow);
        console.log('Successfully deleted row', foundRow, 'for date:', date);
        
        return ContentService
          .createTextOutput('SUCCESS: Period entry deleted from row ' + foundRow)
          .setMimeType(ContentService.MimeType.TEXT)
          .setHeaders({
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
          });
      } else {
        const errorMsg = 'ERROR: Entry with date ' + date + ' not found';
        console.error(errorMsg);
        return ContentService
          .createTextOutput(errorMsg)
          .setMimeType(ContentService.MimeType.TEXT)
          .setHeaders({
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
          });
      }
        
    } else {
      // Unknown action
      const errorMsg = 'ERROR: Unknown action parameter';
      console.error(errorMsg);
      return ContentService
        .createTextOutput(errorMsg)
        .setMimeType(ContentService.MimeType.TEXT)
        .setHeaders({
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        });
    }
      
  } catch (error) {
    console.error('Error in doGet:', error);
    return ContentService
      .createTextOutput('ERROR: ' + error.toString())
      .setMimeType(ContentService.MimeType.TEXT)
      .setHeaders({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
  }
}

// Handle OPTIONS requests for CORS preflight
function doOptions(e) {
  return ContentService
    .createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT)
    .setHeaders({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
}

// Alternative function to test if the script is accessible
function doPost(e) {
  return doGet(e);
}

// Helper function to format date to ISO format (YYYY-MM-DD) for consistent comparison
function formatDateToISO(dateValue) {
  if (!dateValue) return '';
  
  // If it's already a string in ISO format, return it
  if (typeof dateValue === 'string') {
    // Check if it's already in YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
      return dateValue;
    }
    // Try to parse as date
    dateValue = new Date(dateValue);
  }
  
  // If it's a Date object, format to ISO
  if (dateValue instanceof Date && !isNaN(dateValue)) {
    const year = dateValue.getFullYear();
    const month = String(dateValue.getMonth() + 1).padStart(2, '0');
    const day = String(dateValue.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  return '';
}